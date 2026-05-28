require("dotenv").config();
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: "studymaterial-406ad"
        });
        console.log("✅ Firebase initialized with Secrets");
    } else {
        admin.initializeApp();
        console.log("✅ Firebase initialized with Default Auth");
    }
}

const db = admin.firestore();

// =========================================================
// 🛠️ HELPERS
// =========================================================
function escapeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function getUtcDate(timeSource) {
    if (!timeSource) return new Date().toUTCString();
    try {
        const d = timeSource.toDate
            ? timeSource.toDate()
            : new Date(timeSource);
        return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
    } catch {
        return new Date().toUTCString();
    }
}

function getIsoDate(timeSource) {
    if (!timeSource) return new Date().toISOString();
    try {
        const d = timeSource.toDate
            ? timeSource.toDate()
            : new Date(timeSource);
        return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } catch {
        return new Date().toISOString();
    }
}

// =========================================================
// 🗺️ COLLECTION CONFIG
// =========================================================
const COLLECTION_CONFIG = [
    {
        name: 'jobs',
        route: 'job',
        timeField: 'createdAt',
        label: 'Sarkari Naukri',
        priority: 10
    },
    {
        name: 'blogs',
        route: 'blog',
        timeField: 'createdAt',  // ✅ 'date' की जगह 'createdAt' use करो
        label: 'Blog',
        priority: 5
    },
    {
        name: 'results',
        route: 'result',
        timeField: 'createdAt',
        label: 'Result',
        priority: 9
    },
    {
        name: 'admit_cards',
        route: 'admit-card',
        timeField: 'createdAt',
        label: 'Admit Card',
        priority: 8
    },
    {
        name: 'answer_keys',
        route: 'answer-key',
        timeField: 'createdAt',
        label: 'Answer Key',
        priority: 7
    },
    {
        name: 'mock_tests',
        route: 'test',
        timeField: 'createdAt',
        label: 'Mock Test',
        priority: 4
    },
    {
        name: 'study_materials',
        route: 'free-study-material',
        timeField: 'createdAt',
        label: 'Study Material',
        priority: 3
    },
    {
        name: 'fast_track',
        route: 'update',
        timeField: 'createdAt',
        label: 'Fast Track',
        priority: 6
    }
];

// =========================================================
// 🤖 AI TITLE REWRITER (Cached - हर request पर नहीं!)
// =========================================================

// Simple in-memory cache
const aiCache = {
    data: null,
    timestamp: 0,
    TTL: 30 * 60 * 1000 // 30 minutes cache
};

async function rewriteTitlesWithAI(items) {
    const apiKey = process.env.GEMINI_NEWS_API_KEY;
    if (!apiKey) return items;

    // ✅ Cache check - 30 min तक same AI result use करो
    const now = Date.now();
    if (aiCache.data && (now - aiCache.timestamp) < aiCache.TTL) {
        console.log("✅ Using cached AI titles");

        // Cache से match करो
        aiCache.data.forEach(aiItem => {
            const index = items.findIndex(i => i.id === aiItem.id);
            if (index !== -1) {
                items[index].aiNewsTitle = aiItem.newsTitle;
                items[index].aiSummary = aiItem.summary || '';
            }
        });
        return items;
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

        const itemsForAI = items.slice(0, 20).map(item => ({
            id: item.id,
            title: item.title || item.jobTitle || 'New Update',
            category: item._label || 'Education'
        }));

        const prompt = `You are a viral Hindi news content creator for education/govt jobs website.

Rewrite each title to be:
- Highly clickable and engaging
- Add relevant emoji (🚨🔥📢✅)  
- Add urgency (अभी देखें, जल्दी करें, आज ही)
- Keep it under 70 characters
- Add year 2025 if relevant
- SEO optimized for Indian exam seekers

Return ONLY valid JSON array:
[{ "id": "doc_id", "newsTitle": "rewritten title", "summary": "2 line summary in Hindi"}]

Input data:
${JSON.stringify(itemsForAI)}`;

        const result = await model.generateContent(prompt);
        let aiText = result.response.text()
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        // ✅ JSON parse safely
        let aiResponse = [];
        try {
            aiResponse = JSON.parse(aiText);
        } catch (parseErr) {
            // JSON array extract करने की कोशिश
            const match = aiText.match(/\[[\s\S]*\]/);
            if (match) aiResponse = JSON.parse(match[0]);
        }

        // ✅ Cache में save करो
        aiCache.data = aiResponse;
        aiCache.timestamp = now;

        // Items में apply करो
        aiResponse.forEach(aiItem => {
            const index = items.findIndex(i => i.id === aiItem.id);
            if (index !== -1) {
                items[index].aiNewsTitle = aiItem.newsTitle;
                items[index].aiSummary = aiItem.summary || '';
            }
        });

        console.log(`✅ AI rewrote ${aiResponse.length} titles`);
    } catch (aiErr) {
        console.error("❌ AI Rewrite Error:", aiErr.message);
        // Fail silently - original titles use होंगे
    }

    return items;
}

// =========================================================
// 📦 FETCH FROM COLLECTION (Safe)
// =========================================================
async function fetchCollection(config) {
    try {
        let query = db.collection(config.name)
            .orderBy(config.timeField, 'desc')
            .limit(20);

        const snapshot = await query.get();
        const items = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const status = (data.status || '').toLowerCase();

            // ✅ Live check
            const isLive = data.isLive === true
                || ['published', 'publish', 'approved', 'active', 'live'].includes(status);

            // ✅ Blogs auto-approve
            const isAutoBlog = config.name === 'blogs' && !data.status;

            if (isLive || isAutoBlog) {
                items.push({
                    id: doc.id,
                    ...data,
                    _timeField: data[config.timeField],
                    _route: config.route,
                    _label: config.label,
                    _priority: config.priority
                });
            }
        });

        console.log(`✅ ${config.name}: ${items.length} items fetched`);
        return items;

    } catch (err) {
        // ✅ Index error handle करो gracefully
        if (err.code === 9 || err.message.includes('index')) {
            console.warn(`⚠️ ${config.name}: Index missing, trying without orderBy`);
            try {
                const snap = await db.collection(config.name).limit(20).get();
                const items = [];
                snap.forEach(doc => {
                    const data = doc.data();
                    items.push({
                        id: doc.id,
                        ...data,
                        _timeField: data[config.timeField],
                        _route: config.route,
                        _label: config.label,
                        _priority: config.priority
                    });
                });
                return items;
            } catch (fallbackErr) {
                console.error(`❌ ${config.name} fallback failed:`, fallbackErr.message);
                return [];
            }
        }
        console.warn(`⚠️ Skipping ${config.name}:`, err.message);
        return [];
    }
}

// =========================================================
// 📝 XML ITEM BUILDER
// =========================================================
function buildRssItem(item) {
    const slugOrId = item.slug || item.id;
    const itemUrl = `https://studygyaan.in/${item._route}/${slugOrId}`;
    const safeUrl = escapeXml(itemUrl);

    const pubDate = getUtcDate(item._timeField);
    const isoDate = getIsoDate(item._timeField);

    const rawImage = item.imageUrl
        || item.image
        || item.thumbnail
        || item.featuredImage
        || 'https://studygyaan.in/og-image.jpg';
    const safeImage = escapeXml(rawImage);

    const displayTitle = item.aiNewsTitle
        || item.title
        || item.jobTitle
        || 'New Update';

    const displayDesc = item.aiSummary
        || item.shortDescription
        || item.description
        || 'Latest update available on StudyGyaan.in';

    const author = escapeXml(item.author || 'Rahul Sir');
    const category = escapeXml(item._label || 'Education');

    // ✅ Content - HTML safe
    const rawContent = item.content || item.description || displayDesc;

    return `
  <item>
    <title><![CDATA[${displayTitle}]]></title>
    <link>${safeUrl}</link>
    <guid isPermaLink="true">${safeUrl}</guid>
    <pubDate>${pubDate}</pubDate>
    <dc:date>${isoDate}</dc:date>
    <category><![CDATA[${category}]]></category>
    <dc:creator><![CDATA[${author}]]></dc:creator>
    <description><![CDATA[${displayDesc}]]></description>
    <content:encoded><![CDATA[${rawContent}]]></content:encoded>
    <media:content
      url="${safeImage}"
      medium="image"
      type="image/jpeg"
      width="1200"
      height="630"/>
    <media:thumbnail
      url="${safeImage}"
      width="300"
      height="200"/>
    <media:title><![CDATA[${displayTitle}]]></media:title>
    <media:description><![CDATA[${displayDesc}]]></media:description>
  </item>`;
}

// =========================================================
// 🚀 MAIN RSS FEED FUNCTION
// =========================================================
exports.rssFeed = functions.https.onRequest(async (req, res) => {

    // ✅ Security - Header में token check करो (URL में नहीं!)
    // Googlebot के लिए token skip करो
    const userAgent = req.headers['user-agent'] || '';
    const isBot = userAgent.toLowerCase().includes('googlebot')
        || userAgent.toLowerCase().includes('feedfetcher')
        || userAgent.toLowerCase().includes('feedly')
        || userAgent.toLowerCase().includes('feedburner');

    if (!isBot) {
        const token = req.query.token || req.headers['x-rss-token'];
        if (token !== process.env.RSS_SECRET_TOKEN &&
            token !== "StudyGyaanSecret2026") {
            console.warn("❌ Blocked unauthorized RSS access");
            return res.status(403).send("403 Forbidden");
        }
    }

    try {
        // ✅ सभी collections parallel fetch करो
        const results = await Promise.allSettled(
            COLLECTION_CONFIG.map(config => fetchCollection(config))
        );

        // ✅ Successful results merge करो
        let allItems = [];
        const seenIds = new Set();

        results.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
                result.value.forEach(item => {
                    if (!seenIds.has(item.id)) {
                        seenIds.add(item.id);
                        allItems.push(item);
                    }
                });
            } else {
                console.warn(`⚠️ ${COLLECTION_CONFIG[idx].name} failed:`,
                    results[idx].reason?.message);
            }
        });

        // ✅ Smart Sort - Priority + Date
        allItems.sort((a, b) => {
            // Priority score
            const priorityDiff = (b._priority || 0) - (a._priority || 0);
            if (priorityDiff !== 0) return priorityDiff;

            // Date sort
            const dateA = a._timeField?.toDate
                ? a._timeField.toDate()
                : new Date(a._timeField || 0);
            const dateB = b._timeField?.toDate
                ? b._timeField.toDate()
                : new Date(b._timeField || 0);
            return dateB - dateA;
        });

        // ✅ Top 30 items
        const finalItems = allItems.slice(0, 30);

        // ✅ AI Title Rewrite (Cached)
        await rewriteTitlesWithAI(finalItems);

        // ✅ RSS XML Build
        const buildDate = new Date().toUTCString();

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>StudyGyaan | Sarkari Naukri, Admit Card, Result &amp; Exam Preparation</title>
  <link>https://studygyaan.in</link>
  <atom:link href="https://studygyaan.in/rss" rel="self" type="application/rss+xml"/>
  <description>Latest Govt Jobs, Results, Admit Cards, Mock Tests &amp; Free Study Material</description>
  <language>hi</language>
  <lastBuildDate>${buildDate}</lastBuildDate>
  <managingEditor>admin@studygyaan.in (StudyGyaan)</managingEditor>
  <webMaster>admin@studygyaan.in (StudyGyaan)</webMaster>
  <copyright>2025 StudyGyaan.in All Rights Reserved</copyright>
  <ttl>30</ttl>
  <image>
    <url>https://studygyaan.in/logo.png</url>
    <title>StudyGyaan</title>
    <link>https://studygyaan.in</link>
    <width>144</width>
    <height>144</height>
    <description>StudyGyaan - Fastest Sarkari Naukri Updates</description>
  </image>`;

        // ✅ Items add करो
        finalItems.forEach(item => {
            xml += buildRssItem(item);
        });

        xml += `\n</channel>\n</rss>`;

        res.set('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=60');
        res.set('Content-Type', 'application/rss+xml; charset=utf-8');
        res.set('X-Content-Type-Options', 'nosniff');
        res.status(200).send(xml.trim());

        console.log(`✅ RSS Feed served: ${finalItems.length} items`);

    } catch (error) {
        console.error("❌ RSS Feed Error:", error.message);
        res.status(500).send("Internal Server Error");
    }
});
