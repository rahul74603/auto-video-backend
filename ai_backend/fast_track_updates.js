const functions = require("firebase-functions");
// v1 Firestore triggers work on Spark plan (125K reads / 50K writes per month free).
// Replaced the v2 noop with a real v1 trigger so FAST_TRACK publish instantly
// dispatches to GitHub Actions without requiring Blaze billing.
const onDocumentWritten = (documentPath) => functions.firestore.document(documentPath).onWrite;
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const cheerio = require("cheerio");
const Parser = require("rss-parser");

// =========================================================
// 🔐 FIREBASE INIT
// =========================================================
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    const config = {
        projectId:     "studymaterial-406ad",
        storageBucket: "studymaterial-406ad.firebasestorage.app"
    };
    if (serviceAccountVar && serviceAccountVar !== "undefined") {
        try {
            admin.initializeApp({
                ...config,
                credential: admin.credential.cert(JSON.parse(serviceAccountVar))
            });
            console.log("✅ Firebase initialized");
        } catch (e) {
            console.error("❌ Init error:", e.message);
            admin.initializeApp(config);
        }
    } else {
        admin.initializeApp(config);
    }
}

const db     = admin.firestore();
const { overlapsAny } = require("./agents/article_agents/title_utils");
const parser = new Parser();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// =========================================================
// 🛠️ HELPERS
// =========================================================
function createSlug(title) {
    if (!title) return "update";
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 80);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =========================================================
// ✅ CATEGORY DETECTION
// =========================================================
const CATEGORY_PATTERNS = {
    'Result':     ['result', 'results', 'merit list', 'final list', 'selected candidates'],
    'Admit Card': ['admit card', 'call letter', 'hall ticket', 'e-admit', 'admit-card'],
    'Answer Key': ['answer key', 'answer-key', 'official key', 'provisional key', 'objection key'],
    'Syllabus':   ['syllabus', 'exam pattern', 'curriculum', 'scheme of examination']
};

function detectCategory(title) {
    const lower = (title || '').toLowerCase();
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
        if (patterns.some(p => lower.includes(p))) return category;
    }
    return null;
}

// =========================================================
// ✅ JUNK DOMAINS - Scraping mein use hota hai
// =========================================================
const JUNK_DOMAINS = [
    "facebook.com", "twitter.com", "whatsapp.com", "telegram.me", "t.me",
    "instagram.com", "youtube.com", "freejobalert.com", "sarkariexam.com",
    "feedburner", "google.com", "googleads", "wp-content", "uploads",
    ".jpg", ".jpeg", ".png", ".gif", ".webp"
];

function isJunkUrl(url) {
    return JUNK_DOMAINS.some(d => url.toLowerCase().includes(d));
}

// =========================================================
// 🚫 BLOCKED LINK DOMAINS
// Save hone wale fields mein ye domains nahi aane chahiye
// =========================================================
const BLOCKED_LINK_DOMAINS = [
    'freejobalert.com',
    'sarkariresult.com',
    'rojgarresult.com',
    'sarkariexam.com',
    'naukri.com',
    'shine.com',
    'monster.com'
];

function isBlockedLink(url) {
    if (!url || url === '#' || url.trim() === '') return false;
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return BLOCKED_LINK_DOMAINS.some(domain => hostname.includes(domain));
    } catch {
        return false;
    }
}

// =========================================================
// 🔔 GOOGLE INDEXING
// =========================================================
async function notifyGoogle(url) {
    try {
        const key = JSON.parse(process.env.SERVICE_ACCOUNT_JSON || '{}');
        if (!key.client_email) {
            console.log("⚠️ Google Indexing: No service account found");
            return;
        }

        const jwt = new google.auth.JWT({
            email:  key.client_email,
            key:    key.private_key.replace(/\\n/g, '\n'),
            scopes: ["https://www.googleapis.com/auth/indexing"]
        });

        await jwt.authorize();
        await axios.post(
            "https://indexing.googleapis.com/v3/urlNotifications:publish",
            { url, type: "URL_UPDATED" },
            { headers: { Authorization: `Bearer ${jwt.credentials.access_token}` } }
        );

        console.log("🚀 Google Indexed:", url);
    } catch (err) {
        console.error("❌ Indexing failed for", url, ":", err.message);
    }
}

// =========================================================
// 🚀 GITHUB ACTIONS TRIGGER
// =========================================================
async function triggerGitHubVideoAction(jobData) {
    const GITHUB_TOKEN = process.env.GH_TOKEN;
    const REPO_OWNER   = process.env.GITHUB_OWNER;
    const REPO_NAME    = process.env.GITHUB_REPO;

    if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
        console.error("❌ GitHub Secrets missing!");
        return false;
    }

    const cleanJobData = {
        id:           String(jobData.id           || ''),
        slug:         String(jobData.slug         || jobData.id || ''),
        title:        String(jobData.title        || 'Fast Track Update'),
        category:     String(jobData.category     || 'Default'),
        type:         'FAST_TRACK',
        updateDate:   String(jobData.updateDate   || ''),
        organization: String(jobData.org          || ''),
        directLink:   String(jobData.directLink   || ''),
        shortInfo:    String(jobData.shortInfo    || '')
    };

    if (!cleanJobData.slug && !cleanJobData.id) {
        console.error("❌ GitHub Trigger: slug aur id dono missing!");
        return false;
    }

    try {
        const response = await axios.post(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`,
            {
                event_type:     "generate_fasttrack_video",
                client_payload: { jobData: cleanJobData }
            },
            {
                headers: {
                    Authorization:          `Bearer ${GITHUB_TOKEN}`,
                    Accept:                 "application/vnd.github.v3+json",
                    "Content-Type":         "application/json",
                    "X-GitHub-Api-Version": "2022-11-28"
                },
                timeout: 15000
            }
        );

        if (response.status === 204) {
            console.log("✅ GitHub Actions triggered!");
            return true;
        }
        return false;

    } catch (err) {
        console.error("❌ GitHub API Error:", err.response?.data || err.message);
        return false;
    }
}

// =========================================================
// 🌐 PAGE SCRAPER
// =========================================================
async function scrapePage(url) {
    const { data: html } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudyGyaanBot/1.0)' },
        timeout: 20000
    });

    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, .sidebar').remove();

    const links = new Set();

    $("table tr").each((i, tr) => {
        const rowText = $(tr).text().replace(/\s+/g, ' ').trim();
        $(tr).find('a').each((j, el) => {
            const href = $(el).attr("href");
            if (href?.startsWith("http") && !isJunkUrl(href) && rowText.length > 3) {
                links.add(`[Context: ${rowText.substring(0, 100)}] -> (URL: ${href})`);
            }
        });
    });

    $(".post-body p a, .entry-content p a, article a").each((i, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().trim();
        if (href?.startsWith("http") && !isJunkUrl(href) && text.length > 2) {
            links.add(`[Context: ${text}] -> (URL: ${href})`);
        }
    });

    return Array.from(links).join("\n").substring(0, 3500);
}

// =========================================================
// 🤖 AI EXTRACTOR
// ✅ Smart Retry - 429 aane par retryDelay se wait karo
// =========================================================
// =========================================================
// ✍️ FULL ARTICLE GENERATOR (fetch ke saath hi — Fast Track style)
// Result/Admit Card/Answer Key/Syllabus ke liye chhota-focused article.
// JOB wala 13-section structure yahan force NAHI hota (spec ke hisaab se).
// =========================================================
async function generateFullFastTrackArticle(extracted, sourceText, category, title, apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const facts = JSON.stringify({
        title,
        org: extracted.org || '',
        updateDate: extracted.updateDate || '',
        shortInfo: extracted.shortInfo || '',
        directLink: extracted.directLink || '',
        category
    });

    const prompt = `Act as StudyGyaan's editorial writer. Write a COMPLETE, ORIGINAL, source-grounded article
for this "${category}" update, in easy Hinglish (Hindi-English mix, Devanagari for Hindi words).

=== VERIFIED FACTS ===
${facts}

=== SOURCE TEXT (ground truth) ===
${String(sourceText).slice(0, 12000)}

=== STRICT RULES ===
1. Facts SIRF source/facts se lo — dates/numbers/names INVENT mat karo.
2. Missing info par likho: "अधिक जानकारी के लिए आधिकारिक वेबसाइट देखें।" — guess kabhi nahi.
3. Source ka word-by-word copy mana hai — original editorial wording.
4. Koi filler/keyword-stuffing nahi. Ye ${category} update hai — job-recruitment wale sections (fee/age/vacancy) FORCE mat karo, sirf relevant sections likho.

=== OUTPUT ===
Return ONLY clean HTML (no markdown, no \`\`\`). NO <h1>. Structure:
1. 2-3 intro <p> (kya update aaya, kiske liye, kya karna hai)
2. <h2>मुख्य जानकारी (Overview)</h2> + chhota <table> (Organization | Update | Date | Official Link)
3. Category ke hisaab se relevant <h2> sections:
   - Result → kaise check करें (<ol> steps), आगे क्या (DV/next stage agar source me ho)
   - Admit Card → kaise download करें (<ol>), exam day instructions
   - Answer Key → kaise download/objection process (agar source me ho)
   - Syllabus/Admission → key details, important points <ul>
4. <h2>महत्वपूर्ण लिंक</h2> + <table> (sirf official links <a href> ke saath)
5. <h2>अक्सर पूछे जाने वाले प्रश्न (FAQs)</h2> + 4-6 <h3>Q</h3><p>A</p> pairs (source-grounded)
6. Chhota conclusion <p>
Target: 800-1500 meaningful words. Kam jankari ho to chhota likho — filler mat daalo.`;

    const result = await model.generateContent(prompt);
    let html = result.response.text()
        .replace(/```html/gi, '')
        .replace(/```/g, '')
        .trim();
    html = html.replace(/<h1(\s[^>]*)?>/gi, '<h2>').replace(/<\/h1>/gi, '</h2>');
    return html;
}

async function extractWithAI(linksText, category, title, apiKey, logger = console.log) {
    const MAX_RETRIES = 3;

    const prompt = `Extract information for a ${category} update.

Title: "${title}"
Links found: ${linksText}

Return ONLY valid JSON (no markdown):
{
  "title": "Clean official name without extra words",
  "slug": "seo-slug-max-60-chars",
  "directLink": "exact official direct URL for ${category}",
  "shortInfo": "2-3 line description in simple Hindi/English",
  "org": "Organization name",
  "updateDate": "Date if found"
}

IMPORTANT:
- directLink must be exact official govt website URL only
- freejobalert.com, sarkariexam.com jaise third-party URLs mat do
- Agar official URL na mile to empty string do ""`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

            const result = await model.generateContent(prompt);
            const text   = result.response.text()
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();

            return JSON.parse(text);

        } catch (err) {
            const is429 = err.message?.includes('429') ||
                          err.message?.includes('Too Many Requests') ||
                          err.message?.includes('quota');

            if (is429) {
                // ✅ Error message se exact retry delay nikal lo
                const retryMatch = err.message.match(/retry in (\d+(?:\.\d+)?)s/i);
                const waitSecs   = retryMatch
                    ? Math.ceil(parseFloat(retryMatch[1])) + 3  // buffer ke saath
                    : 60; // default 60s

                if (attempt < MAX_RETRIES) {
                    logger(`⏳ Rate limit (attempt ${attempt}/${MAX_RETRIES}). Waiting ${waitSecs}s then retry...`);
                    await sleep(waitSecs * 1000);
                    continue; // retry karo
                } else {
                    logger(`❌ Rate limit exceeded after ${MAX_RETRIES} attempts. Skipping.`);
                    throw new Error(`QUOTA_EXCEEDED: ${err.message.substring(0, 100)}`);
                }
            }

            // Aur koi error hai to seedha throw karo
            throw err;
        }
    }
}

// =========================================================
// 🔥 CORE SCRAPING LOGIC
// ✅ Items ke beech bhi intelligent delay
// =========================================================
async function runFastTrackLogic(logger = console.log, apiKey) {
    logger("🚀 Fast-Track Scraper Started...");

    if (!apiKey) {
        logger("❌ No API key provided!");
        return [];
    }

    const RSS_SOURCES = [
        'https://www.freejobalert.com/feed/',
        'https://www.sarkariexam.com/feed',
        'https://feeds.feedburner.com/SarkariExam'
    ];

    let allItems = [];

    for (const url of RSS_SOURCES) {
        try {
            logger(`📡 Fetching: ${url}`);
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000
            });
            const feed = await parser.parseString(response.data);
            if (feed?.items) {
                allItems.push(...feed.items);
                logger(`✅ ${feed.items.length} items from ${url}`);
            }
        } catch (err) {
            logger(`⚠️ Source failed [${url}]: ${err.message}`);
        }
    }

    if (allItems.length === 0) {
        logger("❌ No items found from any source");
        return [];
    }

    const dateSuffix = new Date().toLocaleString('en-IN', {
        month: 'short', year: 'numeric'
    }).toLowerCase().replace(' ', '-');

    const results   = [];
    const MAX_ITEMS = 5;

    // ✅ Quota tracker - kitni requests bachi hain
    let quotaExhausted = false;

    logger(`🔍 Scanning ${allItems.length} items (max ${MAX_ITEMS} to save)...`);

    // ✅ Duplicate shield: site pe pehle se maujood recent titles (draft+live dono)
    const recentTitles = [];
    try {
        const recentSnap = await db.collection("fast_track")
            .orderBy("createdAt", "desc")
            .limit(100)
            .get();
        recentSnap.forEach(d => recentTitles.push(d.data().title || ""));
        logger(`🛡️ Duplicate shield: ${recentTitles.length} recent titles loaded`);
    } catch (shieldErr) {
        logger(`⚠️ Title shield load failed (continue anyway): ${shieldErr.message}`);
    }

    for (const item of allItems) {
        if (results.length >= MAX_ITEMS) break;

        // ✅ Quota khatam hai to ruk jao
        if (quotaExhausted) {
            logger(`🛑 API quota exhausted. Stopping early. Saved: ${results.length}`);
            break;
        }

        const title = (item.title || '').trim();
        const link  = (item.link || item.guid || '').trim();

        if (!title || !link || link.includes('127.0.0.1')) continue;

        const category = detectCategory(title);
        if (!category) continue;

        const docId = Buffer.from(link)
            .toString('base64')
            .replace(/[/+=]/g, '_')
            .substring(0, 80);

        const alreadyDone = await db.collection("processed_links").doc(docId).get();
        if (alreadyDone.exists) {
            logger(`⏭️ Already processed: ${title}`);
            continue;
        }

        try {
            logger(`🎯 [${category}] Processing: ${title}`);

            const linksText = await scrapePage(link);
            logger(`📋 Found ${linksText.split('\n').length} links`);

            // ✅ logger pass karo retry messages ke liye
            const extracted = await extractWithAI(linksText, category, title, apiKey, logger);

            const finalTitle = extracted.title || title;
            const baseSlug   = extracted.slug  || createSlug(finalTitle);
            const finalSlug  = `${baseSlug}-${dateSuffix}`;

            // ✅ Duplicate slug check
            const slugExists = await db.collection("fast_track").doc(finalSlug).get();
            if (slugExists.exists) {
                logger(`⏭️ Slug exists: ${finalSlug}`);
                continue;
            }

            // ✅ Same/near title guard — re-fetch pe duplicate drafts kabhi na bane
            const titleDup = overlapsAny(finalTitle, recentTitles);
            if (titleDup.dup) {
                logger(`⏭️ Title already on site: "${finalTitle}" (≈ "${titleDup.with}")`);
                continue;
            }
            recentTitles.push(finalTitle); // same run me do baar insert bhi roko

            // ✅ Blocked links clean karo
            const cleanDirectLink = isBlockedLink(extracted.directLink)
                ? link
                : (extracted.directLink || link);

            logger(`🔗 directLink: ${cleanDirectLink}`);

            // ✍️ FULL ARTICLE — fetch ke saath hi ready (Result/Admit Card style)
            let articleHtml = '';
            try {
                articleHtml = await generateFullFastTrackArticle(extracted, linksText, category, finalTitle, apiKey);
                const words = articleHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
                logger(`📝 Full article: ${words} words`);
            } catch (artErr) {
                logger(`⚠️ Article generation fail (item phir bhi banega): ${artErr.message}`);
            }

            await db.collection("fast_track").doc(finalSlug).set({
                title:        finalTitle,
                slug:         finalSlug,
                directLink:   cleanDirectLink,
                shortInfo:    extracted.shortInfo  || '',
                org:          extracted.org        || '',
                updateDate:   extracted.updateDate || '',
                description:  extracted.shortInfo  || '',
                articleHtml:  articleHtml          || '',
                category,
                originalLink: link,
                status:       "draft",
                createdAt:    admin.firestore.FieldValue.serverTimestamp()
            });

            await db.collection("processed_links").doc(docId).set({
                link,
                slug:        finalSlug,
                category,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            results.push({ title: finalTitle, category, slug: finalSlug });
            logger(`✅ Saved (${results.length}/${MAX_ITEMS}): ${finalTitle}`);

            // ✅ Items ke beech 3s delay - rate limit se bachne ke liye
            if (results.length < MAX_ITEMS) {
                logger(`⏳ Waiting 3s before next item...`);
                await sleep(3000);
            }

        } catch (err) {
            // ✅ Quota khatam hua to flag set karo
            if (err.message?.startsWith('QUOTA_EXCEEDED')) {
                logger(`🛑 Daily quota exhausted! Items saved today: ${results.length}`);
                quotaExhausted = true;
            } else {
                logger(`⚠️ Failed [${title}]: ${err.message}`);
                await sleep(2000);
            }
        }
    }

    logger(`🎉 Complete! ${results.length} new items saved`);
    return results;
}

// =========================================================
// 1️⃣ MANUAL API TRIGGER
// =========================================================
exports.fetchFastTrackUpdates = functions.https.onRequest(async (req, res) => {

    const authKey      = req.headers['x-auth-key'];
    const EXPECTED_KEY = process.env.FAST_TRACK_SECRET || "StudyGyaan_FastTrack_786";

    if (authKey !== EXPECTED_KEY) {
        console.warn("❌ Unauthorized access attempt");
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const data = await runFastTrackLogic(console.log, process.env.GEMINI_API_KEY);
        res.json({ success: true, count: data.length, data });
    } catch (err) {
        console.error("❌ fetchFastTrackUpdates error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =========================================================
// 2️⃣ GITHUB ACTIONS STREAMING API
// =========================================================
exports.triggerFastTrackUpdates = functions.https.onRequest(async (req, res) => {

    const authToken   = req.headers['x-auth-token'];
    const incomingKey = req.headers['x-gemini-key'];

    if (authToken !== "StudyGyaan_FastTrack_786") {
        return res.status(401).send("Unauthorized");
    }
    if (!incomingKey) {
        return res.status(400).send("Missing x-gemini-key header");
    }

    res.setHeader('Content-Type',      'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const logger = (msg) => {
        res.write(`${msg}\n`);
        console.log(msg);
    };

    try {
        const data = await runFastTrackLogic(logger, incomingKey);
        res.write(`\n✅ Complete! Total saved: ${data.length}\n`);
    } catch (err) {
        res.write(`\n❌ Error: ${err.message}\n`);
    } finally {
        res.end();
    }
});

// =========================================================
// 3️ FIRESTORE TRIGGER (v1 — works on Spark plan, no Blaze required)
// =========================================================
exports.onFastTrackApprovedSendTelegram = onDocumentWritten("fast_track/{docId}")(async (change, context) => {

    if (!change.after.exists) {
        console.log("⏭️ Document deleted, skipping.");
        return null;
    }

    const afterData  = change.after.data();
    const beforeData = change.before ? change.before.data() : null;

    if (afterData.status === 'draft') {
        console.log(`⏭️ Draft, skipping: ${afterData.title}`);
        return null;
    }

    if (beforeData && beforeData.status === 'published') {
        console.log(`️ Already published, skipping: ${afterData.title}`);
        return null;
    }

    const item  = afterData;
    const docId = context.params.docId;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 Processing Approved: ${item.title}`);
    console.log(`📂 Category: ${item.category}`);
    console.log(`${'='.repeat(50)}\n`);

    const itemUrl = `https://studygyaan.in/update/${item.slug || docId}`;

    // STEP 1 - Schema Save
    try {
        const publishTime = item.createdAt?.toDate?.()?.toISOString()
            || new Date().toISOString();

        const seoDescMap = {
            'Result':
                `${item.title} result declared. Check merit list, cutoff marks and scorecard. Direct link on StudyGyaan.in`,
            'Admit Card':
                `${item.title} admit card released. Download hall ticket and check exam center. Direct link on StudyGyaan.in`,
            'Answer Key':
                `${item.title} official answer key out. Check answers and expected cutoff. Direct PDF link on StudyGyaan.in`,
            'Syllabus':
                `${item.title} new syllabus and exam pattern released. Free PDF download on StudyGyaan.in`
        };
        const seoDesc = seoDescMap[item.category]
            || item.description
            || item.shortInfo
            || item.title;

        const newsSchema = {
            "@context":  "https://schema.org",
            "@type":     "NewsArticle",
            "headline":  item.title,
            "image":     ["https://studygyaan.in/og-image.jpg"],
            "datePublished": publishTime,
            "dateModified":  new Date().toISOString(),
            "description":   seoDesc,
            "mainEntityOfPage": {
                "@type": "WebPage",
                "@id":   itemUrl
            },
            "author": {
                "@type": "Organization",
                "name":  "StudyGyaan",
                "url":   "https://studygyaan.in"
            },
            "publisher": {
                "@type": "Organization",
                "name":  "StudyGyaan",
                "logo": {
                    "@type": "ImageObject",
                    "url":   "https://studygyaan.in/logo.png"
                }
            }
        };

        const faqSchema = {
            "@context": "https://schema.org",
            "@type":    "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name":  `${item.title} kaise check karein?`,
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text":  `${item.title} check karne ke liye StudyGyaan.in par jaayein aur Direct Link par click karein. Official website se ${item.category} download kar sakte hain.`
                    }
                },
                {
                    "@type": "Question",
                    "name":  `${item.title} ka direct link kya hai?`,
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text":  `${item.title} ka direct official link StudyGyaan.in par available hai. ${item.org || 'Official website'} se download karein.`
                    }
                },
                {
                    "@type": "Question",
                    "name":  `${item.title} kab aaya?`,
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text":  `${item.title} ${item.updateDate || 'recently'} release hua hai. Latest update ke liye StudyGyaan Telegram join karein.`
                    }
                }
            ]
        };

        await db.collection("fast_track").doc(docId).update({
            schemaMarkup: JSON.stringify(newsSchema),
            faqMarkup:    JSON.stringify(faqSchema),
            seoDesc
        });

        console.log("✅ STEP 1: Schema + FAQ saved");
    } catch (schemaErr) {
        console.error("❌ STEP 1 Schema error:", schemaErr.message);
    }

    // STEP 2 - Search Engine Pings (multi-engine, free, best-effort)
    try {
        // Google Indexing API only accepts JobPosting/Livestream URLs — skip for /update/ pages
        if (itemUrl.includes('/job/')) {
            await notifyGoogle(itemUrl).catch(() => {});
        }

        // 🚀 Multi-endpoint IndexNow (Bing + Yandex + Seznam + Naver) — 4 endpoints for redundancy
        // + sitemap ping (Google/Bing/Yandex) + WebSub feed push — free, no paid API key needed
        try {
            const booster = require("./indexing_booster");
            booster.submitToAllIndexNow([itemUrl, `https://studygyaan.in/updates?category=${encodeURIComponent(item.category)}`, "https://studygyaan.in/govt-jobs"]).catch(() => {});
            booster.pingAllSitemaps().catch(() => {});
            booster.publishWebSub().catch(() => {});
            console.log("✅ STEP 2: Multi-engine search ping dispatched");
        } catch (boosterErr) {
            console.warn("⚠️ Booster unavailable, fallback single IndexNow:", boosterErr.message);
            axios.post(
                "https://api.indexnow.org/indexnow",
                { host: "studygyaan.in", key: "9629c8c41fa94b898f83a53ecd320743", keyLocation: "https://studygyaan.in/9629c8c41fa94b898f83a53ecd320743.txt", urlList: [itemUrl] },
                { headers: { "Content-Type": "application/json; charset=utf-8" }, timeout: 8000, validateStatus: () => true }
            ).catch(() => {});
        }
    } catch (indexErr) {
        console.error("❌ STEP 2 Indexing error:", indexErr.message);
    }

    // STEP 3 - Video Generation
    let videoStatus = "⏳ Video trigger initiated";

    // Check automation guard
    try {
        const { isAutomationEnabled } = require('./agents/automation_guard');
        const guard = await isAutomationEnabled(db, 'video_maker');
        if (!guard.enabled) {
            console.log(`⏸️ Video trigger skipped — ${guard.reason}`);
            videoStatus = `⏸️ Paused: ${guard.reason}`;
            throw new Error(`Skipped: ${guard.reason}`);
        }
    } catch (guardErr) {
        if (guardErr.message && guardErr.message.startsWith('Skipped:')) throw guardErr;
        console.warn('Guard check failed (continuing):', guardErr.message);
    }

    try {
        const triggered = await triggerGitHubVideoAction({
            ...item,
            id:   docId,
            slug: item.slug || docId
        });

        if (triggered) {
            videoStatus = "✅ Video generation started on GitHub!";
            await db.collection("fast_track").doc(docId).update({
                videoTriggered:   true,
                videoTriggeredAt: admin.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        } else {
            videoStatus = "⚠️ GitHub trigger failed";
        }

        console.log(`✅ STEP 3: ${videoStatus}`);
    } catch (triggerErr) {
        console.error("❌ STEP 3 Trigger error:", triggerErr.message);
        videoStatus = `❌ Video Error: ${triggerErr.message}`;
    }

    // STEP 4 - Telegram
    const icons = {
        'Result':     '🏆',
        'Admit Card': '🎫',
        'Answer Key': '🔑',
        'Syllabus':   '📚'
    };
    const icon      = icons[item.category] || '📌';
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

    if (BOT_TOKEN && CHAT_ID) {
        const msg =
            `🚨 <b>New ${item.category}!</b>\n\n` +
            `${icon} <b>${item.title}</b>\n\n` +
            `📖 <b>Full Details:</b>\n${itemUrl}\n\n` +
            `🎬 ${videoStatus}\n\n` +
            `🔔 @studygyaan_official`;

        try {
            await axios.post(
                `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
                {
                    chat_id:                  CHAT_ID,
                    text:                     msg,
                    parse_mode:               'HTML',
                    disable_web_page_preview: false
                }
            );
            console.log("✅ STEP 4: Telegram sent!");
        } catch (tgErr) {
            console.error("❌ STEP 4 Telegram error:", tgErr.response?.data || tgErr.message);
        }
    } else {
        console.log("⚠️ STEP 4: Telegram credentials missing");
    }

    // STEP 5 - WhatsApp (band hai)
    /*
    const WA_SERVER = process.env.WHATSAPP_SERVER_URL;
    if (WA_SERVER) { ... }
    */

    // STEP 6 - PDF Generation
    const pdfCategories = ["Syllabus", "Admit Card", "Result"];

    if (pdfCategories.includes(item.category)) {
        try {
            let generatePDF = null;
            try {
                ({ generateSyllabusPDF: generatePDF } = require('./autoPdf.js'));
            } catch {
                generatePDF = null;
            }

            if (generatePDF) {
                const pdfUrl = await generatePDF(item);
                if (pdfUrl) {
                    await db.collection("fast_track").doc(docId)
                        .update({ syllabusPDF: pdfUrl })
                        .catch(() => {});
                    console.log("✅ STEP 6: PDF saved:", pdfUrl);
                }
            } else {
                console.log("⚠️ STEP 6: autoPdf.js not found");
            }
        } catch (pdfErr) {
            console.error("❌ STEP 6 PDF error:", pdfErr.message);
        }
    }

    // STEP 7 - publishedAt
    try {
        await db.collection("fast_track").doc(docId).update({
            publishedAt: admin.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
        console.log("✅ STEP 7: publishedAt saved");
    } catch (tsErr) {
        console.error("❌ STEP 7 error:", tsErr.message);
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎉 All steps complete: ${item.title}`);
    console.log(`${'='.repeat(50)}\n`);

    return null;
});

// =========================================================
// 4️⃣ DYNAMIC SITEMAP
// =========================================================
exports.fastTrackSitemap = functions.https.onRequest(async (req, res) => {
    try {
        const snapshot = await db.collection("fast_track")
            .where("status", "==", "published")
            .orderBy("createdAt", "desc")
            .limit(500)
            .get();

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
`;

        snapshot.docs.forEach(docSnap => {
            const data    = docSnap.data();
            const slug    = data.slug || docSnap.id;
            const lastmod = data.createdAt?.toDate?.()?.toISOString()
                || new Date().toISOString();

            const safeTitle = (data.title || '')
                .replace(/&/g,  '&amp;')
                .replace(/</g,  '&lt;')
                .replace(/>/g,  '&gt;')
                .replace(/"/g,  '&quot;')
                .replace(/'/g,  '&apos;');

            xml += `  <url>
    <loc>https://studygyaan.in/update/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
    <news:news>
      <news:publication>
        <news:name>StudyGyaan</news:name>
        <news:language>hi</news:language>
      </news:publication>
      <news:publication_date>${lastmod}</news:publication_date>
      <news:title>${safeTitle}</news:title>
    </news:news>
    <image:image>
      <image:loc>https://studygyaan.in/og-image.jpg</image:loc>
      <image:title>${safeTitle}</image:title>
    </image:image>
  </url>
`;
        });

        xml += `</urlset>`;

        res.setHeader('Content-Type',  'application/xml');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.status(200).send(xml);

        console.log(`✅ Sitemap: ${snapshot.docs.length} URLs`);
    } catch (err) {
        console.error("❌ Sitemap error:", err.message);
        res.status(500).send("Error generating sitemap");
    }
});

// =========================================================
// ✅ EXPORTS
// =========================================================
exports.runFastTrackLogic = runFastTrackLogic;

// =========================================================
// ✅ CLI MODE
// =========================================================
if (require.main === module) {
    const apiKey = process.argv[2] || process.env.GEMINI_API_KEY;
    console.log("🤖 CLI Mode Started...");

    runFastTrackLogic(console.log, apiKey)
        .then(results => {
            console.log(`✅ Done: ${results.length} items saved`);
            process.exit(0);
        })
        .catch(err => {
            console.error("❌ Failed:", err.message);
            process.exit(1);
        });
}

