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
// Ye URLs links extract karte waqt ignore honge
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
// directLink, officialSiteLink etc.
// RSS fetch aur scraping pe koi asar nahi
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
        console.error("❌ GitHub Secrets missing! GH_TOKEN / GITHUB_OWNER / GITHUB_REPO");
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
        console.error("❌ GitHub Trigger: slug aur id dono missing hain!");
        return false;
    }

    const payload = {
        event_type:     "generate_fasttrack_video",
        client_payload: { jobData: cleanJobData }
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
            console.log("✅ GitHub Actions triggered successfully!");
            return true;
        }

        console.warn("⚠️ GitHub API unexpected status:", response.status);
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

    // ✅ Table links
    $("table tr").each((i, tr) => {
        const rowText = $(tr).text().replace(/\s+/g, ' ').trim();
        $(tr).find('a').each((j, el) => {
            const href = $(el).attr("href");
            if (href?.startsWith("http") && !isJunkUrl(href) && rowText.length > 3) {
                links.add(`[Context: ${rowText.substring(0, 100)}] -> (URL: ${href})`);
            }
        });
    });

    // ✅ Paragraph links
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

IMPORTANT: 
- directLink must be the exact download/view URL from official govt website only
- freejobalert.com, sarkariexam.com jaise third-party sites ki URLs mat do
- Agar official URL na mile to empty string do ""`;

    const result = await model.generateContent(prompt);
    const text   = result.response.text()
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

    logger(`🔍 Scanning ${allItems.length} items (max ${MAX_ITEMS} to save)...`);

    for (const item of allItems) {
        if (results.length >= MAX_ITEMS) break;

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

            const extracted = await extractWithAI(linksText, category, title, apiKey);

            const finalTitle = extracted.title || title;
            const baseSlug   = extracted.slug  || createSlug(finalTitle);
            const finalSlug  = `${baseSlug}-${dateSuffix}`;

            // ✅ Duplicate slug check
            const slugExists = await db.collection("fast_track").doc(finalSlug).get();
            if (slugExists.exists) {
                logger(`⏭️ Slug exists: ${finalSlug}`);
                continue;
            }

            // =========================================================
            // ✅ LINKS CLEAN KARO - Blocked domains nahi aane chahiye
            // directLink blocked → original RSS link use karo
            // =========================================================
            const cleanDirectLink = isBlockedLink(extracted.directLink)
                ? link
                : (extracted.directLink || link);

            logger(`🔗 directLink: ${cleanDirectLink}`);

            // ✅ Firestore mein save karo
            await db.collection("fast_track").doc(finalSlug).set({
                title:        finalTitle,
                slug:         finalSlug,
                // ✅ Cleaned directLink use karo
                directLink:   cleanDirectLink,
                shortInfo:    extracted.shortInfo  || '',
                org:          extracted.org        || '',
                updateDate:   extracted.updateDate || '',
                description:  extracted.shortInfo  || '',
                category,
                originalLink: link,
                status:       "draft",
                createdAt:    admin.firestore.FieldValue.serverTimestamp()
            });

            // ✅ Processed links mein mark karo
            await db.collection("processed_links").doc(docId).set({
                link,
                slug:        finalSlug,
                category,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            results.push({ title: finalTitle, category, slug: finalSlug });
            logger(`✅ Saved (${results.length}/${MAX_ITEMS}): ${finalTitle}`);

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
    cors:           false,
    invoker:        "public",
    timeoutSeconds: 300,
    memory:         "1GiB",
    secrets:        ["GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON", "FAST_TRACK_SECRET"]
}, async (req, res) => {

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
exports.triggerFastTrackUpdates = onRequest({
    invoker:        "public",
    timeoutSeconds: 300,
    memory:         "1GiB"
}, async (req, res) => {

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
// 3️⃣ FIRESTORE TRIGGER - Approve hone par sab kaam karo
// =========================================================
exports.onFastTrackApprovedSendTelegram = onDocumentWritten({
    document:       "fast_track/{docId}",
    memory:         "2GiB",
    timeoutSeconds: 540,
    secrets: [
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID",
        "GEMINI_API_KEY",
        "SERVICE_ACCOUNT_JSON",
        "GMAIL_CREDENTIALS",
        "YOUTUBE_TOKEN",
        "TTS_KEY_JSON",
        "FB_PAGE_ID",
        "FB_PAGE_TOKEN",
        "GH_TOKEN",
        "GITHUB_OWNER",
        "GITHUB_REPO"
    ]
}, async (event) => {

    // ✅ Document delete hua to ignore karo
    if (!event.data.after.exists) {
        console.log("⏭️ Document deleted, skipping.");
        return null;
    }

    const afterData  = event.data.after.data();
    const beforeData = event.data.before ? event.data.before.data() : null;

    // ✅ Draft hai to skip karo
    if (afterData.status === 'draft') {
        console.log(`⏭️ Draft, skipping: ${afterData.title}`);
        return null;
    }

    // ✅ Pehle se published tha to duplicate trigger mat karo
    if (beforeData && beforeData.status === 'published') {
        console.log(`⏭️ Already published, skipping: ${afterData.title}`);
        return null;
    }

    const item  = afterData;
    const docId = event.params.docId;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 Processing Approved: ${item.title}`);
    console.log(`📂 Category: ${item.category}`);
    console.log(`🔗 DocId   : ${docId}`);
    console.log(`${'='.repeat(50)}\n`);

    const itemUrl = `https://studygyaan.in/update/${item.slug || docId}`;

    // =========================================================
    // STEP 1 - Schema Markup Save
    // =========================================================
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
            seoDesc:      seoDesc
        });

        console.log("✅ STEP 1: Schema + FAQ saved");

    } catch (schemaErr) {
        console.error("❌ STEP 1 Schema error:", schemaErr.message);
    }

    // =========================================================
    // STEP 2 - Google Indexing
    // =========================================================
    try {
        await notifyGoogle(itemUrl);
        await notifyGoogle("https://studygyaan.in");
        await notifyGoogle(
            `https://studygyaan.in/updates?category=${encodeURIComponent(item.category)}`
        );
        console.log("✅ STEP 2: Google Indexing done for 3 URLs");
    } catch (indexErr) {
        console.error("❌ STEP 2 Indexing error:", indexErr.message);
    }

    // =========================================================
    // STEP 3 - Video Generation via GitHub Actions
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
            }).catch(e => console.log("videoTriggered update skip:", e.message));
        } else {
            videoStatus = "⚠️ GitHub trigger failed (check Firebase logs)";
        }

        console.log(`✅ STEP 3: Video Trigger - ${videoStatus}`);

    } catch (triggerErr) {
        console.error("❌ STEP 3 Trigger error:", triggerErr.message);
        videoStatus = `❌ Video Error: ${triggerErr.message}`;
    }

    // =========================================================
    // STEP 4 - Telegram Notification
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
        console.log("⚠️ STEP 4: Telegram credentials missing, skipping...");
    }

    // =========================================================
    // STEP 5 - WhatsApp (abhi band hai)
    // =========================================================
    /*
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
    */

    // =========================================================
    // STEP 6 - PDF Generation
    // =========================================================
    const pdfCategories = ["Syllabus", "Admit Card", "Result"];

    if (pdfCategories.includes(item.category)) {
        try {
            let generatePDF = null;

            try {
                ({ generateSyllabusPDF: generatePDF } = require('./autoPdf.js'));
            } catch (requireErr) {
                console.log("⚠️ autoPdf.js not found:", requireErr.message);
                generatePDF = null;
            }

            if (generatePDF) {
                const pdfUrl = await generatePDF(item);
                if (pdfUrl) {
                    await db.collection("fast_track").doc(docId)
                        .update({ syllabusPDF: pdfUrl })
                        .catch(e => console.log("PDF update skip:", e.message));
                    console.log("✅ STEP 6: PDF saved:", pdfUrl);
                }
            } else {
                console.log("⚠️ STEP 6: autoPdf.js not found, skipping PDF");
            }
        } catch (pdfErr) {
            console.error("❌ STEP 6 PDF error:", pdfErr.message);
        }
    } else {
        console.log(`⏭️ STEP 6: PDF skip - category is ${item.category}`);
    }

    // =========================================================
    // STEP 7 - publishedAt timestamp
    // =========================================================
    try {
        await db.collection("fast_track").doc(docId).update({
            publishedAt: admin.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
        console.log("✅ STEP 7: publishedAt timestamp saved");
    } catch (tsErr) {
        console.error("❌ STEP 7 timestamp error:", tsErr.message);
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎉 All steps complete for: ${item.title}`);
    console.log(`🌐 URL: ${itemUrl}`);
    console.log(`${'='.repeat(50)}\n`);

    return null;
});

// =========================================================
// 4️⃣ DYNAMIC SITEMAP
// =========================================================
exports.fastTrackSitemap = onRequest({
    invoker:        "public",
    timeoutSeconds: 60,
    memory:         "512MiB",
    secrets:        ["SERVICE_ACCOUNT_JSON"]
}, async (req, res) => {
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

        console.log(`✅ Sitemap generated: ${snapshot.docs.length} URLs`);

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
