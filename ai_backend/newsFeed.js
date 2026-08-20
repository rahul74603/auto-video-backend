require("dotenv").config();
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
        console.log("✅ Firebase initialized");
    } else {
        admin.initializeApp();
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
// Routes MUST match the frontend router (src/App.tsx):
//   /job/:id  /blog/:id  /test/:id  /update/:id  /material/:id  /course/:id
// Result / Admit Card / Answer Key pages are CategoryPage views over the
// `fast_track` collection (they link to /update/<id>), so those legacy
// collection rows were removed — they had no data source on the site and
// generated dead /result/, /admit-card/, /answer-key/ URLs.
// `useIdOnly` matters where the detail page resolves the doc ID only
// (MaterialDetails.getById — no slug lookup).
const COLLECTION_CONFIG = [
    { name: 'jobs',            route: 'job',     useIdOnly: false, timeField: 'createdAt', label: 'Sarkari Naukri',  priority: 10 },
    { name: 'fast_track',      route: 'update',  useIdOnly: false, timeField: 'createdAt', label: 'Fast Track',      priority: 9  },
    { name: 'blogs',           route: 'blog',    useIdOnly: false, timeField: 'createdAt', label: 'Blog',            priority: 5  },
    { name: 'mock_tests',      route: 'test',    useIdOnly: false, timeField: 'createdAt', label: 'Mock Test',       priority: 4  },
    { name: 'study_materials', route: 'material',useIdOnly: true,  timeField: 'createdAt', label: 'Study Material',  priority: 3  }
];

// =========================================================
// 🤖 AI TITLE REWRITER (Cached)
// =========================================================
const aiCache = {
    data:      null,
    timestamp: 0,
    TTL:       30 * 60 * 1000  // 30 minutes
};

async function rewriteTitlesWithAI(items) {
    const apiKey = process.env.GEMINI_NEWS_API_KEY
        || process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.log("⚠️ No Gemini key, skipping AI rewrite");
        return items;
    }

    const now = Date.now();
    if (aiCache.data && (now - aiCache.timestamp) < aiCache.TTL) {
        console.log("✅ Using cached AI titles");
        aiCache.data.forEach(aiItem => {
            const index = items.findIndex(i => i.id === aiItem.id);
            if (index !== -1) {
                items[index].aiNewsTitle = aiItem.newsTitle;
                items[index].aiSummary   = aiItem.summary || '';
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
            id:       item.id,
            title:    item.title || item.jobTitle || 'New Update',
            category: item._label || 'Education'
        }));

        const prompt = `You are a viral Hindi news content creator for education/govt jobs website.

Rewrite each title to be:
- Highly clickable and engaging
- Add relevant emoji (🚨🔥📢✅⚡)
- Add urgency (अभी देखें, जल्दी करें, आज ही)
- Keep under 70 characters
- SEO optimized for Indian exam seekers
- Add year 2025 if relevant

Return ONLY valid JSON array:
[{"id":"doc_id","newsTitle":"rewritten title","summary":"2 line summary in Hindi"}]

Input:
${JSON.stringify(itemsForAI)}`;

        const result  = await model.generateContent(prompt);
        let aiText    = result.response.text()
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        let aiResponse = [];
        try {
            aiResponse = JSON.parse(aiText);
        } catch {
            const match = aiText.match(/\[[\s\S]*\]/);
            if (match) aiResponse = JSON.parse(match[0]);
        }

        aiCache.data      = aiResponse;
        aiCache.timestamp = now;

        aiResponse.forEach(aiItem => {
            const index = items.findIndex(i => i.id === aiItem.id);
            if (index !== -1) {
                items[index].aiNewsTitle = aiItem.newsTitle;
                items[index].aiSummary   = aiItem.summary || '';
            }
        });

        console.log(`✅ AI rewrote ${aiResponse.length} titles`);
    } catch (aiErr) {
        console.error("❌ AI Error:", aiErr.message);
    }

    return items;
}

// =========================================================
// 📦 FETCH COLLECTION
// =========================================================
async function fetchCollection(config) {
    try {
        const snapshot = await db.collection(config.name)
            .orderBy(config.timeField, 'desc')
            .limit(20)
            .get();

        const items = [];
        snapshot.forEach(doc => {
            const data   = doc.data();
            const status = (data.status || '').toLowerCase();

            const isLive = data.isLive === true
                || ['published', 'publish', 'approved', 'active', 'live'].includes(status);
            const isAutoBlog = config.name === 'blogs' && !data.status;

            if (isLive || isAutoBlog) {
                items.push({
                    id: doc.id,
                    ...data,
                    _timeField: data[config.timeField],
                    _route:     config.route,
                    _useIdOnly: config.useIdOnly === true,
                    _label:     config.label,
                    _priority:  config.priority
                });
            }
        });

        console.log(`✅ ${config.name}: ${items.length} items`);
        return items;

    } catch (err) {
        if (err.code === 9 || err.message.includes('index')) {
            console.warn(`⚠️ ${config.name}: Index missing, fallback...`);
            try {
                const snap  = await db.collection(config.name).limit(20).get();
                const items = [];
                snap.forEach(doc => {
                    const data = doc.data();
                    items.push({
                        id: doc.id,
                        ...data,
                        _timeField: data[config.timeField],
                        _route:     config.route,
                        _useIdOnly: config.useIdOnly === true,
                        _label:     config.label,
                        _priority:  config.priority
                    });
                });
                return items;
            } catch (e2) {
                console.error(`❌ ${config.name} fallback failed:`, e2.message);
                return [];
            }
        }
        console.warn(`⚠️ Skipping ${config.name}:`, err.message);
        return [];
    }
}

// =========================================================
// 📝 RSS ITEM BUILDER
// =========================================================
function buildRssItem(item) {
    // study_materials detail page resolves the doc ID only (no slug lookup)
    const slugOrId  = item._useIdOnly ? item.id : (item.slug || item.id);
    const itemUrl   = `https://studygyaan.in/${item._route}/${slugOrId}`;
    const safeUrl   = escapeXml(itemUrl);
    const pubDate   = getUtcDate(item._timeField);
    const isoDate   = getIsoDate(item._timeField);

    const rawImage  = item.imageUrl
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
        || item.metaDescription
        || item.description
        || 'Latest update available on StudyGyaan.in';

    const author   = escapeXml(item.author || 'StudyGyaan Team');
    const category = escapeXml(item._label || 'Education');

    const rawContent = item.content
        || item.description
        || displayDesc;

    // ✅ Google News के लिए keywords tag
    const keywords = [
        item._label,
        'Sarkari Naukri',
        'Govt Jobs',
        'StudyGyaan',
        new Date().getFullYear()
    ].filter(Boolean).join(', ');

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
    <content:encoded><![CDATA[
      <p>${displayDesc}</p>
      <p><a href="${safeUrl}">पूरी जानकारी के लिए यहाँ क्लिक करें →</a></p>
      <img src="${safeImage}" alt="${escapeXml(displayTitle)}" width="1200" height="630"/>
    ]]></content:encoded>
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
// Plain (req, res) handler — index.js wraps it with the v2 onRequest
// function definition. A broken single document must never take the
// whole feed down, so item building is isolated per item.
exports.rssFeed = async (req, res) => {
    // ✅ CORS Headers
    res.set('Access-Control-Allow-Origin', '*');

    // ✅ Bot detection - Google News, Feedly, etc को free access
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();

    const ALLOWED_BOTS = [
        'googlebot',
        'google-news',
        'feedfetcher',
        'feedly',
        'feedburner',
        'bingbot',
        'applebot',
        'facebookexternalhit',
        'twitterbot',
        'linkedinbot',
        'whatsapp',
        'telegrambot',
        'slurp',        // Yahoo
        'duckduckbot',
        'ia_archiver',  // Wayback Machine
        'rss',
        'feed'
    ];

    const isAllowedBot = ALLOWED_BOTS.some(bot => userAgent.includes(bot));

    // ✅ Token check - bots को छोड़कर
    if (!isAllowedBot) {
        const token = req.query.token
            || req.headers['x-rss-token'];

        const validTokens = [
            process.env.RSS_SECRET_TOKEN,
            "StudyGyaanSecret2026",
            "public"  // ✅ public access के लिए
        ].filter(Boolean);

        if (!validTokens.includes(token)) {
            // ✅ Token नहीं है तो भी feed दो
            // (Public RSS feed होनी चाहिए)
            console.log("📡 RSS accessed without token - serving anyway");
        }
    }

    try {
        // ✅ Parallel fetch
        const results = await Promise.allSettled(
            COLLECTION_CONFIG.map(config => fetchCollection(config))
        );

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
                console.warn(`⚠️ ${COLLECTION_CONFIG[idx].name} failed`);
            }
        });

        // ✅ Smart Sort
        allItems.sort((a, b) => {
            const pDiff = (b._priority || 0) - (a._priority || 0);
            if (pDiff !== 0) return pDiff;

            const dateA = a._timeField?.toDate
                ? a._timeField.toDate()
                : new Date(a._timeField || 0);
            const dateB = b._timeField?.toDate
                ? b._timeField.toDate()
                : new Date(b._timeField || 0);
            return dateB - dateA;
        });

        const finalItems = allItems.slice(0, 50); // ✅ 50 items

        // ✅ AI Rewrite
        await rewriteTitlesWithAI(finalItems);

        // ✅ RSS XML
        const buildDate = new Date().toUTCString();

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>StudyGyaan | Sarkari Naukri, Result, Admit Card &amp; Exam Preparation</title>
  <link>https://studygyaan.in</link>
  <atom:link href="https://studygyaan.in/feed" rel="self" type="application/rss+xml"/>
  <description>Latest Govt Jobs, Results, Admit Cards, Answer Keys &amp; Free Study Material - India's Fastest Update Portal</description>
  <language>hi-IN</language>
  <lastBuildDate>${buildDate}</lastBuildDate>
  <managingEditor>admin@studygyaan.in (StudyGyaan)</managingEditor>
  <webMaster>admin@studygyaan.in (StudyGyaan)</webMaster>
  <copyright>${new Date().getFullYear()} StudyGyaan.in All Rights Reserved</copyright>
  <ttl>15</ttl>
  <image>
    <url>https://studygyaan.in/logo.png</url>
    <title>StudyGyaan - Sarkari Naukri Portal</title>
    <link>https://studygyaan.in</link>
    <width>144</width>
    <height>144</height>
  </image>`;

        finalItems.forEach(item => {
            try {
                xml += buildRssItem(item);
            } catch (itemErr) {
                console.error(`⚠️ Skipping bad RSS item ${item && item.id}:`, itemErr.message);
            }
        });

        xml += `\n</channel>\n</rss>`;

        // ✅ Cache headers
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'application/rss+xml; charset=utf-8');
        res.set('X-Content-Type-Options', 'nosniff');
        res.status(200).send(xml.trim());

        console.log(`✅ RSS served: ${finalItems.length} items`);

    } catch (error) {
        console.error("❌ RSS Error:", error.message, error.stack);
        res.status(500).send(`Internal Server Error: ${error.message}`);
    }
};

// Test-only access to internals (routes must stay in sync with src/App.tsx)
exports._internals = { COLLECTION_CONFIG, buildRssItem };
