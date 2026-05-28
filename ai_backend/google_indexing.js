require("dotenv").config();
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const xml2js = require("xml2js");

// =========================================================
// 🔐 FIREBASE INIT
// =========================================================
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: "studymaterial-406ad"
        });
        console.log("✅ Firebase initialized");
    } else {
        admin.initializeApp();
    }
}

const db = admin.firestore();
const WEBSITE_URL = "https://studygyaan.in";

// =========================================================
// 🔐 GOOGLE INDEXING API SETUP
// =========================================================
let indexing = null;

function initIndexingAPI() {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (!serviceAccountVar) {
        throw new Error("❌ SERVICE_ACCOUNT_JSON not found!");
    }
    const credentials = JSON.parse(serviceAccountVar);
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/indexing"]
    });
    indexing = google.indexing({ version: "v3", auth });
    console.log("✅ Google Indexing API ready");
}

// =========================================================
// 🗺️ SITEMAP SOURCES - Priority Order
// =========================================================
const SITEMAP_SOURCES = [
    // Priority URLs पहले
    {
        url: `${WEBSITE_URL}/sitemap-jobs`,
        priority: 100,
        label: 'Jobs'
    },
    {
        url: `${WEBSITE_URL}/sitemap-news`,
        priority: 95,
        label: 'News'
    },
    {
        url: `${WEBSITE_URL}/sitemap-blogs`,
        priority: 90,
        label: 'Blogs'
    },
    {
        url: `${WEBSITE_URL}/sitemap-stories`,
        priority: 85,
        label: 'Stories'
    },
    {
        url: `${WEBSITE_URL}/sitemap-tests`,
        priority: 70,
        label: 'Tests'
    },
    {
        url: `${WEBSITE_URL}/sitemap-main`,
        priority: 80,
        label: 'Static'
    },
    // Fallback - old sitemap
    {
        url: `${WEBSITE_URL}/sitemap.xml`,
        priority: 60,
        label: 'Main XML'
    }
];

// =========================================================
// 📡 SITEMAP FETCHER (Single + Index both handle करता है)
// =========================================================
async function fetchUrlsFromSitemap(sitemapUrl, priority = 50, label = '') {
    const urls = [];
    try {
        console.log(`📡 Fetching: ${label || sitemapUrl}`);
        const response = await axios.get(sitemapUrl, {
            timeout: 30000,
            headers: { 'User-Agent': 'StudyGyaan-Indexer/1.0' }
        });

        const parser = new xml2js.Parser({ explicitArray: true });
        const result = await parser.parseStringPromise(response.data);

        // ✅ Sitemap Index handle करो (sitemapindex tag)
        if (result.sitemapindex && result.sitemapindex.sitemap) {
            console.log(`📂 Sitemap Index found, fetching child sitemaps...`);
            const childSitemaps = result.sitemapindex.sitemap;
            for (const sm of childSitemaps) {
                const childUrl = sm.loc[0];
                const childUrls = await fetchUrlsFromSitemap(childUrl, priority, label);
                urls.push(...childUrls);
                // Rate limit
                await sleep(500);
            }
            return urls;
        }

        // ✅ Regular sitemap (urlset tag)
        if (result.urlset && result.urlset.url) {
            result.urlset.url.forEach(u => {
                const loc = u.loc ? u.loc[0] : null;
                if (loc) {
                    urls.push({
                        url: loc,
                        priority: priority,
                        label: label,
                        // lastmod से recency check करो
                        lastmod: u.lastmod ? u.lastmod[0] : null
                    });
                }
            });
            console.log(`✅ ${label}: ${urls.length} URLs found`);
        }

    } catch (err) {
        // 404 = sitemap नहीं है, skip करो quietly
        if (err.response && err.response.status === 404) {
            console.log(`⚠️ ${label}: Sitemap not found (404), skipping`);
        } else {
            console.warn(`⚠️ ${label} fetch failed: ${err.message}`);
        }
    }
    return urls;
}

// =========================================================
// 💾 HISTORY MANAGER (Set-based, Fast O(1) lookup)
// =========================================================
async function loadIndexingHistory() {
    try {
        // ✅ Array की जगह Set use करो - O(1) lookup
        const doc = await db
            .collection("system_configs")
            .doc("indexing_history")
            .get();

        if (!doc.exists) return new Set();

        const data = doc.data();
        // ✅ urlHash map store करो - memory efficient
        const urlSet = new Set(data.indexedUrls || []);
        console.log(`📚 History loaded: ${urlSet.size} URLs`);
        return urlSet;

    } catch (err) {
        console.error("❌ History load failed:", err.message);
        return new Set();
    }
}

async function saveIndexingHistory(indexedSet, newUrls) {
    try {
        // नए URLs add करो
        newUrls.forEach(url => indexedSet.add(url));

        let allUrls = Array.from(indexedSet);

        // ✅ 3000 URLs तक limit रखो (Firestore 1MB limit safe)
        // पुराने URLs हटाओ, नए रखो
        if (allUrls.length > 3000) {
            allUrls = allUrls.slice(allUrls.length - 3000);
        }

        await db.collection("system_configs")
            .doc("indexing_history")
            .set({
                indexedUrls: allUrls,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                totalIndexed: allUrls.length
            }, { merge: false }); // ✅ merge: false = clean write

        console.log(`💾 History saved: ${allUrls.length} URLs`);
    } catch (err) {
        console.error("❌ History save failed:", err.message);
    }
}

// =========================================================
// 🔥 FAILED URLs RETRY MANAGER
// =========================================================
async function loadFailedUrls() {
    try {
        const doc = await db
            .collection("system_configs")
            .doc("indexing_failed")
            .get();

        if (!doc.exists) return [];
        const data = doc.data();
        return data.urls || [];
    } catch {
        return [];
    }
}

async function saveFailedUrls(failedUrls) {
    try {
        if (failedUrls.length === 0) {
            // सब ठीक है, failed list clear करो
            await db.collection("system_configs")
                .doc("indexing_failed")
                .set({ urls: [], lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
            return;
        }

        // Max 100 failed URLs याद रखो
        const toSave = failedUrls.slice(-100);
        await db.collection("system_configs")
            .doc("indexing_failed")
            .set({
                urls: toSave,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                count: toSave.length
            });
        console.log(`💾 ${toSave.length} failed URLs saved for retry`);
    } catch (err) {
        console.error("❌ Failed URLs save error:", err.message);
    }
}

// =========================================================
// 🛠️ HELPERS
// =========================================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// URL को recently indexed check करो (24 hours)
function isRecentlyIndexed(url, historySet) {
    return historySet.has(url);
}

// =========================================================
// 🚀 SINGLE URL INDEXER (With Retry)
// =========================================================
async function indexSingleUrl(url, retryCount = 0) {
    try {
        await indexing.urlNotifications.publish({
            requestBody: {
                url: url,
                type: "URL_UPDATED"
            }
        });
        return { success: true, url };

    } catch (err) {
        const errMsg = err.message || '';
        const errCode = err.code || (err.response && err.response.status);

        // ✅ Quota Exceeded - रुको!
        if (errCode === 429 || errMsg.includes('Quota exceeded')) {
            console.error("🚨 QUOTA EXCEEDED! Stopping indexing for today.");
            return { success: false, url, quotaExceeded: true };
        }

        // ✅ URL already indexed - skip करो
        if (errMsg.includes('already')) {
            return { success: true, url, alreadyIndexed: true };
        }

        // ✅ Retry logic (max 2 retries)
        if (retryCount < 2) {
            console.warn(`⚠️ Retry ${retryCount + 1} for: ${url}`);
            await sleep(2000 * (retryCount + 1)); // Exponential backoff
            return indexSingleUrl(url, retryCount + 1);
        }

        console.error(`❌ Failed after retries: ${url} | ${errMsg}`);
        return { success: false, url, error: errMsg };
    }
}

// =========================================================
// 🧠 MAIN INDEXING ENGINE
// =========================================================
const runSitemapIndexing = async () => {
    console.log("🚀 Smart Google Indexing Started...");
    console.log(`📅 Time: ${new Date().toISOString()}`);

    try {
        // ✅ Indexing API init
        initIndexingAPI();

        // ✅ Step 1: All sitemaps से URLs collect करो
        console.log("\n📡 Step 1: Collecting URLs from all sitemaps...");
        const allUrlObjects = [];
        const seenUrls = new Set();

        for (const source of SITEMAP_SOURCES) {
            const urls = await fetchUrlsFromSitemap(
                source.url,
                source.priority,
                source.label
            );

            // Deduplicate
            urls.forEach(urlObj => {
                if (!seenUrls.has(urlObj.url)) {
                    seenUrls.add(urlObj.url);
                    allUrlObjects.push(urlObj);
                }
            });

            await sleep(300);
        }

        console.log(`\n📊 Total unique URLs collected: ${allUrlObjects.length}`);

        // ✅ Step 2: Priority sort करो
        // Jobs > News > Blogs > Stories > Static > Tests
        allUrlObjects.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        // ✅ Step 3: History load करो
        console.log("\n📚 Step 2: Loading indexing history...");
        const historySet = await loadIndexingHistory();

        // ✅ Step 4: Filter - सिर्फ नए URLs
        const newUrls = allUrlObjects.filter(
            urlObj => !isRecentlyIndexed(urlObj.url, historySet)
        );

        console.log(`🔍 New URLs to index: ${newUrls.length}`);
        console.log(`⏭️ Already indexed (skip): ${allUrlObjects.length - newUrls.length}`);

        if (newUrls.length === 0) {
            console.log("✅ All URLs already indexed. No work needed today!");

            // ✅ Failed URLs retry करो
            const failedUrls = await loadFailedUrls();
            if (failedUrls.length > 0) {
                console.log(`\n🔄 Retrying ${failedUrls.length} previously failed URLs...`);
                await processUrls(failedUrls.map(u => ({ url: u, priority: 50 })),
                    historySet, 20);
            }
            return 0;
        }

        // ✅ Step 5: Daily limit = 200 URLs (Google का actual limit)
        // Priority URLs पहले लो
        const DAILY_LIMIT = 180; // 200 से थोड़ा कम - safe margin
        const urlsToProcess = newUrls.slice(0, DAILY_LIMIT);

        console.log(`\n⚙️ Step 3: Indexing ${urlsToProcess.length} URLs...`);

        // ✅ Step 6: Process करो
        const { successUrls, failedUrls, quotaHit } = await processUrls(
            urlsToProcess,
            historySet,
            DAILY_LIMIT
        );

        // ✅ Step 7: History save करो
        await saveIndexingHistory(historySet, successUrls);

        // ✅ Step 8: Failed URLs save करो
        await saveFailedUrls(failedUrls);

        // ✅ Step 9: Stats report
        const stats = {
            totalCollected: allUrlObjects.length,
            newFound: newUrls.length,
            attempted: urlsToProcess.length,
            successful: successUrls.length,
            failed: failedUrls.length,
            quotaHit: quotaHit,
            remaining: Math.max(0, newUrls.length - urlsToProcess.length)
        };

        console.log("\n📊 ======= INDEXING REPORT =======");
        console.log(`📦 Total URLs collected: ${stats.totalCollected}`);
        console.log(`🆕 New URLs found:       ${stats.newFound}`);
        console.log(`⚙️  Attempted:            ${stats.attempted}`);
        console.log(`✅ Successful:           ${stats.successful}`);
        console.log(`❌ Failed:               ${stats.failed}`);
        console.log(`📋 Remaining (tomorrow): ${stats.remaining}`);
        console.log(`🚨 Quota Hit:            ${stats.quotaHit}`);
        console.log("=================================\n");

        // ✅ Telegram Notification
        await sendTelegramReport(stats);

        return stats.successful;

    } catch (error) {
        console.error("❌ Indexing Process Failed:", error.message);
        throw error;
    }
};

// =========================================================
// ⚙️ URL PROCESSOR (Batch Processing)
// =========================================================
async function processUrls(urlObjects, historySet, limit) {
    const successUrls = [];
    const failedUrls = [];
    let quotaHit = false;
    let count = 0;

    // ✅ Batch में process करो (10 URLs per batch)
    const BATCH_SIZE = 10;
    const batches = [];

    for (let i = 0; i < urlObjects.length; i += BATCH_SIZE) {
        batches.push(urlObjects.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
        if (quotaHit) break;

        // Batch के अंदर sequential process (rate limit safe)
        for (const urlObj of batch) {
            if (count >= limit) break;

            const result = await indexSingleUrl(urlObj.url);

            if (result.quotaExceeded) {
                quotaHit = true;
                console.error("🚨 Quota exceeded! Stopping...");
                break;
            }

            if (result.success) {
                successUrls.push(urlObj.url);
                count++;
                process.stdout.write(
                    `\r✅ Progress: ${count}/${Math.min(urlObjects.length, limit)}`
                );
            } else {
                failedUrls.push(urlObj.url);
            }

            // ✅ 200ms delay (600/min limit safe)
            await sleep(200);
        }

        // Batch के बाद 1 second break
        if (!quotaHit) await sleep(1000);
    }

    console.log(""); // New line after progress
    return { successUrls, failedUrls, quotaHit };
}

// =========================================================
// 📢 TELEGRAM REPORT
// =========================================================
async function sendTelegramReport(stats) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) return;

    const statusEmoji = stats.quotaHit ? '🚨' : (stats.failed > 10 ? '⚠️' : '✅');
    const msg = `${statusEmoji} <b>Google Indexing Report</b>

📦 Total URLs: <b>${stats.totalCollected}</b>
🆕 New Found: <b>${stats.newFound}</b>
✅ Indexed: <b>${stats.successful}</b>
❌ Failed: <b>${stats.failed}</b>
📋 Tomorrow: <b>${stats.remaining}</b>
🚨 Quota Hit: <b>${stats.quotaHit ? 'YES ⚠️' : 'No ✅'}</b>

🌐 <a href="https://studygyaan.in">StudyGyaan.in</a>`;

    try {
        await axios.post(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
                chat_id: chatId,
                text: msg,
                parse_mode: 'HTML'
            }
        );
        console.log("📢 Telegram report sent!");
    } catch (err) {
        console.warn("⚠️ Telegram report failed:", err.message);
    }
}

// =========================================================
// ✅ GITHUB ACTIONS ENTRY POINT
// =========================================================
if (require.main === module) {
    runSitemapIndexing()
        .then(count => {
            console.log(`\n🎯 Done! ${count} URLs indexed successfully.`);
            process.exit(0);
        })
        .catch(err => {
            console.error("\n❌ Fatal Error:", err.message);
            process.exit(1);
        });
}

module.exports = { runSitemapIndexing };
