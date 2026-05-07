// @ts-nocheck
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const xml2js = require("xml2js");

const db = admin.firestore();
const WEBSITE_URL = "https://studygyaan.in";

// 1. Dynamic Sitemap Generator (Optimized for Priority & Changefreq)
exports.generateSitemap = onRequest({ 
    timeoutSeconds: 540, 
    memory: "1GiB", 
    secrets: ["SERVICE_ACCOUNT_JSON"] 
}, async (req, res) => {
    try {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        const staticPages = ["", "/govt-jobs", "/free-study-material", "/e-books", "/premium-notes", "/contact-us", "/about-us", "/privacy-policy", "/terms-conditions", "/blog", "/test", "/web-stories", "/fasttrack"];
        const now = new Date().toISOString();

        // Static Pages - High Priority
        staticPages.forEach(p => {
            xml += `  <url>\n    <loc>${WEBSITE_URL}${p}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        });

        const collections = [
            { name: "blogs", route: "blog", priority: "0.9", freq: "daily" }, 
            { name: "mock_tests", route: "test", priority: "0.7", freq: "weekly" }, 
            { name: "web_stories", route: "web-stories", priority: "0.6", freq: "daily" }, 
            { name: "fasttrack", route: "fasttrack", priority: "0.5", freq: "monthly" }
        ];

        for (const config of collections) {
            const snap = await db.collection(config.name).select("updatedAt").get();
            snap.forEach(doc => {
                const data = doc.data();
                const updateTime = data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : new Date(data.updatedAt).toISOString()) : now;
                const safeId = doc.id.replace(/&/g, '&amp;');
                xml += `  <url>\n    <loc>${WEBSITE_URL}/${config.route}/${safeId}</loc>\n    <lastmod>${updateTime}</lastmod>\n    <changefreq>${config.freq}</changefreq>\n    <priority>${config.priority}</priority>\n  </url>\n`;
            });
        }

        // Jobs Collection - Dynamic Route Fix
        const jobsSnap = await db.collection("jobs").select("type", "updatedAt").get();
        jobsSnap.forEach(doc => {
            const data = doc.data();
            // ✅ Case-insensitive check and default fallback to 'job'
            const typeValue = (data.type || "").toUpperCase();
            const route = typeValue === 'COURSE' ? 'course' : 'job'; 
            
            const updateTime = data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : new Date(data.updatedAt).toISOString()) : now;
            const safeId = doc.id.replace(/&/g, '&amp;');
            xml += `  <url>\n    <loc>${WEBSITE_URL}/${route}/${safeId}</loc>\n    <lastmod>${updateTime}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
        });

        xml += `</urlset>`;
        res.set('Content-Type', 'text/xml').status(200).send(xml);
    } catch (error) { res.status(500).send("Error generating sitemap"); }
});

// 2. RSS Feed Generator
exports.generateRss = onRequest(async (req, res) => {
    try {
        const now = new Date().toUTCString();
        let rss = `<?xml version="1.0" encoding="UTF-8" ?>\n<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">\n<channel>\n<title>StudyGyaan</title>\n<link>${WEBSITE_URL}</link>\n<description>Latest Updates for Govt Jobs & Study Materials</description>\n<lastBuildDate>${now}</lastBuildDate>\n`;

        const blogsSnap = await db.collection("blogs").orderBy("createdAt", "desc").limit(50).select("title", "createdAt").get();
        blogsSnap.forEach(doc => {
            const d = doc.data();
            const pubDate = d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toUTCString() : new Date(d.createdAt).toUTCString()) : now;
            rss += `  <item>\n    <title><![CDATA[${d.title}]]></title>\n    <link>${WEBSITE_URL}/blog/${doc.id}</link>\n    <pubDate>${pubDate}</pubDate>\n    <guid>${WEBSITE_URL}/blog/${doc.id}</guid>\n  </item>\n`;
        });

        rss += `</channel>\n</rss>`;
        res.set('Content-Type', 'text/xml').status(200).send(rss);
    } catch (error) { res.status(500).send("Error"); }
});

// 3. GOOGLE INDEXING API (Optimized Logic)
exports.forcePushSitemap = onRequest({ 
    timeoutSeconds: 540, 
    memory: "1GiB" 
}, async (req, res) => {
    try {
        const serviceAccount = require("./service_account.json"); 

        const auth = new google.auth.GoogleAuth({
            credentials: serviceAccount,
            scopes: ["https://www.googleapis.com/auth/indexing"],
        });
        const indexing = google.indexing({ version: "v3", auth });

        const allUrls = [
            WEBSITE_URL, 
            `${WEBSITE_URL}/govt-jobs`, 
            `${WEBSITE_URL}/free-study-material`, 
            `${WEBSITE_URL}/e-books`, 
            `${WEBSITE_URL}/premium-notes`,
            `${WEBSITE_URL}/blog`, 
            `${WEBSITE_URL}/test`, 
            `${WEBSITE_URL}/web-stories`, 
            `${WEBSITE_URL}/fasttrack`
        ];

        const collections = [
            { name: "blogs", route: "blog" }, 
            { name: "mock_tests", route: "test" }, 
            { name: "web_stories", route: "web-stories" }, 
            { name: "fasttrack", route: "fasttrack" }
        ];

        for (const config of collections) {
            const snap = await db.collection(config.name).select().get();
            snap.forEach(doc => allUrls.push(`${WEBSITE_URL}/${config.route}/${doc.id}`));
        }

        const jobsSnap = await db.collection("jobs").select("type").get();
        jobsSnap.forEach(doc => {
            const typeValue = (doc.data().type || "").toUpperCase();
            const route = typeValue === 'COURSE' ? 'course' : 'job'; 
            allUrls.push(`${WEBSITE_URL}/${route}/${doc.id}`);
        });

        // Push top 200 URLs to Google
        const urlsToPush = allUrls.slice(0, 200); 

        let count = 0;
        for (const url of urlsToPush) { 
            try {
                await indexing.urlNotifications.publish({
                    requestBody: { url: url, type: "URL_UPDATED" },
                });
                count++;
            } catch (err) { console.error(`Error pushing ${url}:`, err.message); }
        }
        res.status(200).send(`Success! ${count} URLs pushed to Google Indexing. 🚀`);
    } catch (error) { 
        res.status(500).send("Indexing Failed: " + error.message); 
    }
});
