// @ts-nocheck
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const WEBSITE_URL = "https://studygyaan.in";

// =========================================================
// 1. DYNAMIC SITEMAP GENERATOR 
// =========================================================
exports.generateSitemap = onRequest({ 
    timeoutSeconds: 540, 
    memory: "1GiB", 
    secrets: ["SERVICE_ACCOUNT_JSON"] 
}, async (req, res) => {
    try {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        const staticPages = ["", "/govt-jobs", "/free-study-material", "/e-books", "/premium-notes", "/contact-us", "/about-us", "/privacy-policy", "/terms-conditions", "/blog", "/test", "/web-stories", "/fasttrack"];
        const now = new Date().toISOString();

        // Static Pages
        staticPages.forEach(p => {
            xml += `  <url>\n    <loc>${WEBSITE_URL}${p}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        });

        const collections = [
            { name: "blogs", route: "blog", priority: "0.9", freq: "daily" }, 
            { name: "mock_tests", route: "test", priority: "0.7", freq: "weekly" }, 
            { name: "web_stories", route: "web-stories", priority: "0.6", freq: "daily" }, 
            { name: "fasttrack", route: "fasttrack", priority: "0.5", freq: "monthly" }
        ];

        // Dynamic Collections (Blogs, Tests, Stories)
        for (const config of collections) {
            const snap = await db.collection(config.name).select("updatedAt", "createdAt", "slug").get();
            snap.forEach(doc => {
                const data = doc.data();
                const timeSource = data.updatedAt || data.createdAt;
                const updateTime = timeSource ? (timeSource.toDate ? timeSource.toDate().toISOString() : new Date(timeSource).toISOString()) : now;
                
                const slugOrId = data.slug ? data.slug : doc.id;
                const safeId = slugOrId.replace(/&/g, '&amp;');
                
                xml += `  <url>\n    <loc>${WEBSITE_URL}/${config.route}/${safeId}</loc>\n    <lastmod>${updateTime}</lastmod>\n    <changefreq>${config.freq}</changefreq>\n    <priority>${config.priority}</priority>\n  </url>\n`;
            });
        }

        // Jobs Collection (Dynamic Routing)
        const jobsSnap = await db.collection("jobs").select("type", "updatedAt", "createdAt", "slug").get();
        jobsSnap.forEach(doc => {
            const data = doc.data();
            const typeValue = (data.type || "").toUpperCase();
            const route = typeValue === 'COURSE' ? 'course' : 'job'; 
            
            const timeSource = data.updatedAt || data.createdAt;
            const updateTime = timeSource ? (timeSource.toDate ? timeSource.toDate().toISOString() : new Date(timeSource).toISOString()) : now;
            
            const slugOrId = data.slug ? data.slug : doc.id;
            const safeId = slugOrId.replace(/&/g, '&amp;');
            
            xml += `  <url>\n    <loc>${WEBSITE_URL}/${route}/${safeId}</loc>\n    <lastmod>${updateTime}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
        });

        xml += `</urlset>`;
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'text/xml').status(200).send(xml);
    } catch (error) { 
        console.error("❌ Sitemap Error:", error.message);
        res.status(500).send("Error generating sitemap"); 
    }
});

// =========================================================
// 2. FULL SEO RSS FEED GENERATOR (Google News Approved)
// =========================================================
exports.generateRss = onRequest(async (req, res) => {
    try {
        const now = new Date().toUTCString();
        // 🔥 UPDATE: Added atom namespace for strict validation
        let rss = `<?xml version="1.0" encoding="UTF-8" ?>\n<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n<title>StudyGyaan</title>\n<link>${WEBSITE_URL}</link>\n`;
        
        // 🔥 UPDATE: Added atom:link and language tags for Google News perfection
        rss += `<atom:link href="${WEBSITE_URL}/rss" rel="self" type="application/rss+xml" />\n`;
        rss += `<description>Latest Updates for Govt Jobs & Study Materials</description>\n<language>hi</language>\n<lastBuildDate>${now}</lastBuildDate>\n`;

        // Fetch Data including Author & Category for Google News
        const blogsSnap = await db.collection("blogs").orderBy("createdAt", "desc").limit(50).select("title", "createdAt", "slug", "description", "imageUrl", "author", "category").get();
        
        blogsSnap.forEach(doc => {
            const d = doc.data();
            const pubDate = d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toUTCString() : new Date(d.createdAt).toUTCString()) : now;
            
            const slugOrId = d.slug ? d.slug : doc.id;
            const safeId = slugOrId.replace(/&/g, '&amp;');
            
            const desc = d.description ? d.description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : "Read more on StudyGyaan";
            const imageUrl = d.imageUrl ? d.imageUrl.replace(/&/g, '&amp;') : `${WEBSITE_URL}/og-image.jpg`;
            const authorName = d.author ? d.author.replace(/&/g, '&amp;') : "Rahul Sir";
            const categoryName = d.category ? d.category.replace(/&/g, '&amp;') : "Education News";

            rss += `  <item>\n`;
            rss += `    <title><![CDATA[${d.title}]]></title>\n`;
            rss += `    <link>${WEBSITE_URL}/blog/${safeId}</link>\n`;
            rss += `    <description><![CDATA[${desc}]]></description>\n`;
            rss += `    <category><![CDATA[${categoryName}]]></category>\n`; 
            rss += `    <dc:creator><![CDATA[${authorName}]]></dc:creator>\n`; 
            rss += `    <enclosure url="${imageUrl}" length="0" type="image/jpeg" />\n`; 
            rss += `    <pubDate>${pubDate}</pubDate>\n`;
            rss += `    <guid>${WEBSITE_URL}/blog/${safeId}</guid>\n`;
            rss += `  </item>\n`;
        });

        rss += `</channel>\n</rss>`;
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'text/xml').status(200).send(rss);
    } catch (error) { 
        console.error("❌ RSS Error:", error.message);
        res.status(500).send("Error generating RSS Feed"); 
    }
});
