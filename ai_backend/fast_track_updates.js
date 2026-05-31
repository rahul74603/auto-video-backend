const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
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
        projectId: "studymaterial-406ad",
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

const db = admin.firestore();
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

// ✅ Category detection - comprehensive
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

// ✅ Junk domains list
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
// 🔔 GOOGLE INDEXING
// =========================================================
async function notifyGoogle(url) {
    try {
        const key = JSON.parse(process.env.SERVICE_ACCOUNT_JSON || '{}');
        if (!key.client_email) return;

        const jwt = new google.auth.JWT({
            email: key.client_email,
            key: key.private_key.replace(/\\n/g, '\n'),
            scopes: ["https://www.googleapis.com/auth/indexing"]
        });

        await jwt.authorize();
        await axios.post(
            "https://indexing.googleapis.com/v3/urlNotifications:publish",
            { url, type: "URL_UPDATED" },
            { headers: { Authorization: `Bearer ${jwt.credentials.access_token}` } }
        );
        console.log("🚀 Indexed:", url);
    } catch (err) {
        console.error("❌ Indexing failed:", err.message);
    }
}

// =========================================================
// 🚀 GITHUB ACTIONS TRIGGER - Video के लिए
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
        id:           String(jobData.id || ''),
        slug:         String(jobData.slug || jobData.id || ''),
        title:        String(jobData.title || 'Fast Track Update'),
        category:     String(jobData.category || 'Default'),
        type:         'FAST_TRACK',
        updateDate:   String(jobData.updateDate || ''),
        organization: String(jobData.org || ''),
        directLink:   String(jobData.directLink || ''),
        shortInfo:    String(jobData.shortInfo || '')
    };

    const payload = {
        event_type: "generate_fasttrack_video",
        client_payload: {
            jobData: cleanJobData
        }
    };

    console.log("📤 FastTrack GitHub Trigger:", JSON.stringify(cleanJobData));

    try {
        const response = await axios.post(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`,
            payload,
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
            console.log("✅ GitHub Actions triggered! Fast Track Video बन रही है...");
            return true;
        }
        return false;
    } catch (err) {
        console.error("❌ GitHub API Error:", err.message);
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

    // Table links
    $("table tr").each((i, tr) => {
        const rowText = $(tr).text().replace(/\s+/g, ' ').trim();
        $(tr).find('a').each((j, el) => {
            const href = $(el).attr("href");
            if (href?.startsWith("http") && !isJunkUrl(href) && rowText.length > 3) {
                links.add(`[Context: ${rowText.substring(0, 100)}] -> (URL: ${href})`);
            }
        });
    });

    // Paragraph links
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
// =========================================================
async function extractWithAI(linksText, category, title, apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

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

IMPORTANT: directLink must be the exact download/view URL, not a generic page URL.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text()
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

    return JSON.parse(text);
}

// =========================================================
// 🔥 CORE SCRAPING LOGIC
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

    // ✅ Collect RSS items
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

    // ✅ Date suffix for slugs
    const dateSuffix = new Date().toLocaleString('en-IN', {
        month: 'short', year: 'numeric'
    }).toLowerCase().replace(' ', '-');

    const results = [];
    const MAX_ITEMS = 5;

    logger(`🔍 Scanning ${allItems.length} items (max ${MAX_ITEMS} to save)...`);

    for (const item of allItems) {
        if (results.length >= MAX_ITEMS) break;

        const title = (item.title || '').trim();
        const link  = (item.link || item.guid || '').trim();

        if (!title || !link || link.includes('127.0.0.1')) continue;

        // ✅ Category detection
        const category = detectCategory(title);
        if (!category) continue;

        // ✅ Duplicate check
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

            // Scrape page
            const linksText = await scrapePage(link);
            logger(`📋 Found ${linksText.split('\n').length} links`);

            // AI extract
            const extracted = await extractWithAI(linksText, category, title, apiKey);

            const finalTitle = extracted.title || title;
            const baseSlug   = extracted.slug || createSlug(finalTitle);
            const finalSlug  = `${baseSlug}-${dateSuffix}`;

            // ✅ Slug duplicate check
            const slugExists = await db.collection("fast_track").doc(finalSlug).get();
            if (slugExists.exists) {
                logger(`⏭️ Slug exists: ${finalSlug}`);
                continue;
            }

            // ✅ Save to Firestore
            await db.collection("fast_track").doc(finalSlug).set({
                title:       finalTitle,
                slug:        finalSlug,
                directLink:  extracted.directLink || link,
                shortInfo:   extracted.shortInfo || '',
                org:         extracted.org || '',
                updateDate:  extracted.updateDate || '',
                description: extracted.shortInfo || '',
                category,
                originalLink: link,
                status:      "draft",
                createdAt:   admin.firestore.FieldValue.serverTimestamp()
            });

            // ✅ Mark as processed
            await db.collection("processed_links").doc(docId).set({
                link,
                slug:        finalSlug,
                category,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            results.push({ title: finalTitle, category, slug: finalSlug });
            logger(`✅ Saved (${results.length}/${MAX_ITEMS}): ${finalTitle}`);

            // ✅ Rate limiting
            logger(`⏳ Waiting 8 seconds...`);
            await sleep(8000);

        } catch (err) {
            logger(`⚠️ Failed [${title}]: ${err.message}`);
            await sleep(2000);
        }
    }

    logger(`🎉 Complete! ${results.length} new items saved`);
    return results;
}

// =========================================================
// 1️⃣ MANUAL API TRIGGER
// =========================================================
exports.fetchFastTrackUpdates = onRequest({
    cors: false,
    timeoutSeconds: 300,
    memory: "1GiB",
    secrets: ["GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON"]
}, async (req, res) => {

    const authKey    = req.headers['x-auth-key'];
    const EXPECTED_KEY = process.env.FAST_TRACK_SECRET || "StudyGyaan_FastTrack_786";

    if (authKey !== EXPECTED_KEY) {
        console.warn("❌ Unauthorized access");
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const data = await runFastTrackLogic(console.log, process.env.GEMINI_API_KEY);
        res.json({ success: true, count: data.length, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =========================================================
// 2️⃣ GITHUB ACTIONS STREAMING API
// =========================================================
exports.triggerFastTrackUpdates = onRequest({
    timeoutSeconds: 300,
    memory: "1GiB"
}, async (req, res) => {

    const authToken  = req.headers['x-auth-token'];
    const incomingKey = req.headers['x-gemini-key'];

    if (authToken !== "StudyGyaan_FastTrack_786") {
        return res.status(401).send("Unauthorized");
    }
    if (!incomingKey) {
        return res.status(400).send("Missing x-gemini-key header");
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
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
// 3️⃣ FIRESTORE TRIGGER - Approve होने पर सब काम करो
// =========================================================
exports.onFastTrackApprovedSendTelegram = onDocumentWritten({
    document: "fast_track/{docId}",
    memory: "2GiB",
    timeoutSeconds: 540,
    secrets: [
        "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
        "GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON",
        "GMAIL_CREDENTIALS", "YOUTUBE_TOKEN",
        "TTS_KEY_JSON", "FB_PAGE_ID", "FB_PAGE_TOKEN",
        "GH_TOKEN", "GITHUB_OWNER", "GITHUB_REPO",
        "WHATSAPP_SERVER_URL"
    ]
}, async (event) => {

    // ✅ अगर document delete हुआ तो ignore करो
    if (!event.data.after.exists) return null;

    const afterData  = event.data.after.data();
    const beforeData = event.data.before ? event.data.before.data() : null;

    // ✅ Draft है तो skip करो
    if (afterData.status === 'draft') {
        console.log(`⏭️ Draft, skipping: ${afterData.title}`);
        return null;
    }

    // ✅ पहले से published था तो duplicate trigger मत करो
    if (beforeData && beforeData.status === 'published') {
        console.log(`⏭️ Already published, skipping duplicate: ${afterData.title}`);
        return null;
    }

    const item  = afterData;
    const docId = event.params.docId;

    console.log(`🚀 Processing: ${item.title} [${item.category}]`);

    const itemUrl = `https://studygyaan.in/update/${item.slug || docId}`;

    // =========================================================
    // STEP 1 - Schema Markup Save करो
    // =========================================================
    try {
        const publishTime = item.createdAt?.toDate?.()?.toISOString()
            || new Date().toISOString();

        const schema = {
            "@context":       "https://schema.org",
            "@type":          "NewsArticle",
            "headline":       item.title,
            "image":          ["https://studygyaan.in/og-image.jpg"],
            "datePublished":  publishTime,
            "dateModified":   new Date().toISOString(),
            "description":    item.description || item.shortInfo || item.title,
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

        await db.collection("fast_track").doc(docId).update({
            schemaMarkup: JSON.stringify(schema)
        });
        console.log("✅ Schema saved");
    } catch (schemaErr) {
        console.error("Schema error:", schemaErr.message);
    }

    // =========================================================
    // STEP 2 - Google Indexing
    // =========================================================
    await notifyGoogle(itemUrl).catch(e => console.log("Index skip:", e.message));

    // =========================================================
    // STEP 3 - Video Generation (GitHub Actions Trigger)
    // ✅ यह TELEGRAM से पहले होना जरूरी है ताकि videoStatus define हो जाए
    // =========================================================
    let videoStatus = "⏳ Video trigger initiated";

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
            videoStatus = "⚠️ GitHub trigger failed (check Firebase logs)";
        }
    } catch (err) {
        console.error("Trigger error:", err.message);
        videoStatus = `❌ Video Error: ${err.message}`;
    }

    // =========================================================
    // STEP 4 - Telegram Notification
    // ✅ यह GitHub trigger के बाद है ताकि videoStatus ready हो
    // =========================================================
    const icons = {
        'Result':     '🏆',
        'Admit Card': '🎫',
        'Answer Key': '🔑',
        'Syllabus':   '📚'
    };
    const icon = icons[item.category] || '📌';

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
                    chat_id:                CHAT_ID,
                    text:                   msg,
                    parse_mode:             'HTML',
                    disable_web_page_preview: false
                }
            );
            console.log("✅ Telegram sent!");
        } catch (tgErr) {
            console.error("Telegram error:", tgErr.message);
        }
    } else {
        console.log("⚠️ Telegram credentials missing, skipping...");
    }

    // =========================================================
    // STEP 5 - WhatsApp Notification
    // =========================================================
    const WA_SERVER = process.env.WHATSAPP_SERVER_URL;
    if (WA_SERVER) {
        const waMsg =
            `🚨 *New ${item.category}!*\n\n` +
            `${icon} *${item.title}*\n\n` +
            `🔗 ${itemUrl}`;

        axios.post(`${WA_SERVER}/send-job`, {
            targetId:    "120363425475163322@newsletter",
            messageText: waMsg,
            linkPreview: true
        }).catch(e => console.log("WhatsApp skip:", e.message));
    }

    // =========================================================
    // STEP 6 - PDF Generation (Syllabus, Admit Card, Result)
    // =========================================================
    const pdfCategories = ["Syllabus", "Admit Card", "Result"];
    if (pdfCategories.includes(item.category)) {
        try {
            let generatePDF;
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
                    console.log("✅ PDF saved:", pdfUrl);
                }
            } else {
                console.log("⚠️ autoPdf.js not found, skipping PDF generation");
            }
        } catch (pdfErr) {
            console.error("PDF error:", pdfErr.message);
        }
    }

    console.log(`✅ All tasks complete for: ${item.title}`);
    return null;
});

// =========================================================
// ✅ EXPORT FOR GITHUB ACTIONS / CLI
// =========================================================
exports.runFastTrackLogic = runFastTrackLogic;

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
