const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const WEBSITE_URL = "https://studygyaan.in";

// =========================================================
// 🛠️ HELPER FUNCTIONS
// =========================================================

function safeXml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function getIsoDate(timeSource, fallback) {
    if (!timeSource) return fallback || new Date().toISOString();
    if (timeSource.toDate) return timeSource.toDate().toISOString();
    return new Date(timeSource).toISOString();
}

function getUtcDate(timeSource, fallback) {
    if (!timeSource) return fallback || new Date().toUTCString();
    if (timeSource.toDate) return timeSource.toDate().toUTCString();
    return new Date(timeSource).toUTCString();
}

const STATIC_PAGES = [
    { path: "", priority: "1.0", freq: "daily" },
    { path: "/govt-jobs", priority: "0.9", freq: "daily" },
    { path: "/blog", priority: "0.9", freq: "daily" },
    { path: "/test", priority: "0.9", freq: "daily" },
    { path: "/web-stories", priority: "0.9", freq: "daily" },
    { path: "/free-study-material", priority: "0.8", freq: "weekly" },
    { path: "/e-books", priority: "0.8", freq: "weekly" },
    { path: "/premium-notes", priority: "0.8", freq: "weekly" },
    { path: "/about-us", priority: "0.6", freq: "monthly" },
    { path: "/contact-us", priority: "0.6", freq: "monthly" },
    { path: "/privacy-policy", priority: "0.5", freq: "monthly" },
    { path: "/terms-conditions", priority: "0.5", freq: "monthly" }
];

function isIndexableDocument(data = {}) {
    if (data.noIndex === true || data.deleted === true || data.isDeleted === true) return false;
    const status = String(data.status || "").trim().toLowerCase();
    return !["draft", "pending", "rejected", "private", "archived", "deleted", "trash"].includes(status);
}

function hasUsefulTitle(data = {}) {
    return String(data.title || data.post_name || "").trim().length >= 5;
}

// =========================================================
// 1. SITEMAP INDEX (Master Sitemap)
// =========================================================
exports.generateSitemapIndex = onRequest({
    timeoutSeconds: 60,
    memory: "256MiB"
}, async (req, res) => {
    try {
        const sitemaps = [
            `${WEBSITE_URL}/sitemap-main.xml`,
            `${WEBSITE_URL}/sitemap-blogs.xml`,
            `${WEBSITE_URL}/sitemap-jobs.xml`,
            `${WEBSITE_URL}/sitemap-tests.xml`,
            `${WEBSITE_URL}/sitemap-stories.xml`,
            `${WEBSITE_URL}/sitemap-updates.xml`,
            `${WEBSITE_URL}/sitemap-news.xml`
        ];

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

        sitemaps.forEach(url => {
            xml += `  <sitemap>\n`;
            xml += `    <loc>${url}</loc>\n`;
            xml += `  </sitemap>\n`;
        });

        xml += `</sitemapindex>`;

        res.set('Cache-Control', 'public, max-age=3600, s-maxage=7200');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.status(200).send(xml);
    } catch (error) {
        console.error("❌ Sitemap Index Error:", error.message);
        res.status(500).send("Error");
    }
});

// =========================================================
// 2. MAIN STATIC PAGES SITEMAP
// =========================================================
exports.generateSitemapMain = onRequest({
    timeoutSeconds: 60,
    memory: "256MiB"
}, async (req, res) => {
    try {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

        STATIC_PAGES.forEach(p => {
            xml += `  <url>\n`;
            xml += `    <loc>${WEBSITE_URL}${p.path}</loc>\n`;
            xml += `    <changefreq>${p.freq}</changefreq>\n`;
            xml += `    <priority>${p.priority}</priority>\n`;
            xml += `  </url>\n`;
        });

        xml += `</urlset>`;

        res.set('Cache-Control', 'public, max-age=3600, s-maxage=7200');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.status(200).send(xml);
    } catch (error) {
        console.error("❌ Main Sitemap Error:", error.message);
        res.status(500).send("Error");
    }
});

// =========================================================
// 3. BLOGS SITEMAP (With Images - Google Discover के लिए)
// =========================================================
exports.generateSitemapBlogs = onRequest({
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (req, res) => {
    try {
        const now = new Date().toISOString();

        // ✅ image namespace add किया
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
        xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

        const snap = await db.collection("blogs")
            .orderBy("createdAt", "desc")
            .limit(1000)
            .get();

        snap.forEach(doc => {
            const data = doc.data();
            if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
            const slugOrId = data.slug || doc.id;
            const safeSlug = safeXml(slugOrId);
            const updateTime = getIsoDate(data.updatedAt || data.createdAt, now);
            const imageUrl = safeXml(data.imageUrl || `${WEBSITE_URL}/og-image.jpg`);
            const imageTitle = safeXml(data.title || "StudyGyaan Blog");
            const imageCaption = safeXml(data.category || "Education");

            xml += `  <url>\n`;
            xml += `    <loc>${WEBSITE_URL}/blog/${safeSlug}</loc>\n`;
            xml += `    <lastmod>${updateTime}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.9</priority>\n`;
            // ✅ Image tag - Google Discover ranking boost
            xml += `    <image:image>\n`;
            xml += `      <image:loc>${imageUrl}</image:loc>\n`;
            xml += `      <image:title>${imageTitle}</image:title>\n`;
            xml += `      <image:caption>${imageCaption}</image:caption>\n`;
            xml += `    </image:image>\n`;
            xml += `  </url>\n`;
        });

        xml += `</urlset>`;

        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.status(200).send(xml);
    } catch (error) {
        console.error("❌ Blogs Sitemap Error:", error.message);
        res.status(500).send("Error");
    }
});

// =========================================================
// 4. JOBS SITEMAP (With Images)
// =========================================================
exports.generateSitemapJobs = onRequest({
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (req, res) => {
    try {
        const now = new Date().toISOString();

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
        xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

        const snap = await db.collection("jobs")
            .orderBy("createdAt", "desc")
            .limit(1000)
            .get();

        snap.forEach(doc => {
            const data = doc.data();
            const typeValue = (data.type || "").toUpperCase();
            if (!isIndexableDocument(data) || !hasUsefulTitle(data) || typeValue === "COURSE") return;
            const route = 'job';
            const slugOrId = data.slug || doc.id;
            const safeSlug = safeXml(slugOrId);
            const updateTime = getIsoDate(data.updatedAt || data.createdAt, now);
            const imageUrl = safeXml(data.imageUrl || `${WEBSITE_URL}/og-image.jpg`);
            const imageTitle = safeXml(data.title || "StudyGyaan Job Update");

            xml += `  <url>\n`;
            xml += `    <loc>${WEBSITE_URL}/${route}/${safeSlug}</loc>\n`;
            xml += `    <lastmod>${updateTime}</lastmod>\n`;
            xml += `    <changefreq>daily</changefreq>\n`;
            xml += `    <priority>1.0</priority>\n`;
            xml += `    <image:image>\n`;
            xml += `      <image:loc>${imageUrl}</image:loc>\n`;
            xml += `      <image:title>${imageTitle}</image:title>\n`;
            xml += `    </image:image>\n`;
            xml += `  </url>\n`;
        });

        xml += `</urlset>`;

        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.status(200).send(xml);
    } catch (error) {
        console.error("❌ Jobs Sitemap Error:", error.message);
        res.status(500).send("Error");
    }
});

// =========================================================
// 5. MOCK TESTS SITEMAP
// =========================================================
exports.generateSitemapTests = onRequest({
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (req, res) => {
    try {
        const now = new Date().toISOString();

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

        const snap = await db.collection("mock_tests")
            .orderBy("createdAt", "desc")
            .limit(500)
            .get();

        snap.forEach(doc => {
            const data = doc.data();
            if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
            const slugOrId = data.slug || doc.id;
            const safeSlug = safeXml(slugOrId);
            const updateTime = getIsoDate(data.updatedAt || data.createdAt, now);

            xml += `  <url>\n`;
            xml += `    <loc>${WEBSITE_URL}/test/${safeSlug}</loc>\n`;
            xml += `    <lastmod>${updateTime}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.7</priority>\n`;
            xml += `  </url>\n`;
        });

        xml += `</urlset>`;

        res.set('Cache-Control', 'public, max-age=600, s-maxage=1200');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.status(200).send(xml);
    } catch (error) {
        console.error("❌ Tests Sitemap Error:", error.message);
        res.status(500).send("Error");
    }
});

// =========================================================
// 6. WEB STORIES SITEMAP (Special Format)
// =========================================================
exports.generateSitemapStories = onRequest({
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (req, res) => {
    try {
        const now = new Date().toISOString();

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
        xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

        const snap = await db.collection("web_stories")
            .orderBy("createdAt", "desc")
            .limit(500)
            .get();

        snap.forEach(doc => {
            const data = doc.data();
            if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
            const slug = data.slug || doc.id;
            const safeSlug = safeXml(slug);
            const updateTime = getIsoDate(data.createdAt, now);
            const coverImage = safeXml(
                data.coverImage || `${WEBSITE_URL}/og-image.jpg`
            );
            const imageTitle = safeXml(data.title || "StudyGyaan Web Story");

            xml += `  <url>\n`;
            xml += `    <loc>${WEBSITE_URL}/web-stories/${safeSlug}</loc>\n`;
            xml += `    <lastmod>${updateTime}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.9</priority>\n`;
            xml += `    <image:image>\n`;
            xml += `      <image:loc>${coverImage}</image:loc>\n`;
            xml += `      <image:title>${imageTitle}</image:title>\n`;
            xml += `    </image:image>\n`;
            xml += `  </url>\n`;
        });

        xml += `</urlset>`;

        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.status(200).send(xml);
    } catch (error) {
        console.error("❌ Stories Sitemap Error:", error.message);
        res.status(500).send("Error");
    }
});

// =========================================================
// 7. FAST-TRACK UPDATES SITEMAP (canonical /update route)
// =========================================================
exports.generateSitemapUpdates = onRequest({
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (_req, res) => {
    try {
        const now = new Date().toISOString();
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

        const snap = await db.collection("fast_track")
            .orderBy("createdAt", "desc")
            .limit(1000)
            .get();

        snap.forEach(doc => {
            const data = doc.data();
            if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
            const slug = safeXml(data.slug || doc.id);
            const updateTime = getIsoDate(data.updatedAt || data.publishedAt || data.createdAt, now);
            xml += `  <url>\n`;
            xml += `    <loc>${WEBSITE_URL}/update/${slug}</loc>\n`;
            xml += `    <lastmod>${updateTime}</lastmod>\n`;
            xml += `    <changefreq>daily</changefreq>\n`;
            xml += `    <priority>0.8</priority>\n`;
            xml += `  </url>\n`;
        });

        xml += `</urlset>`;
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.status(200).send(xml);
    } catch (error) {
        console.error("❌ Updates Sitemap Error:", error.message);
        res.status(500).send("Error");
    }
});

// =========================================================
// 8. GOOGLE NEWS SITEMAP (Last 2 Days Only)
// =========================================================
exports.generateSitemapNews = onRequest({
    timeoutSeconds: 120,
    memory: "256MiB"
}, async (req, res) => {
    try {
        // ✅ News sitemap - sirf last 2 din ke articles
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
        xml += `        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n`;

        const snap = await db.collection("blogs")
            .orderBy("createdAt", "desc")
            .limit(100)
            .get();

        snap.forEach(doc => {
            const data = doc.data();
            if (!isIndexableDocument(data) || !hasUsefulTitle(data) || !data.createdAt) return;

            const pubDate = data.createdAt.toDate
                ? data.createdAt.toDate()
                : new Date(data.createdAt);

            // ✅ सिर्फ 2 दिन पुराने articles
            if (pubDate < twoDaysAgo) return;

            const slugOrId = data.slug || doc.id;
            const safeSlug = safeXml(slugOrId);
            const pubIso = pubDate.toISOString();
            const newsTitle = safeXml(data.title || "StudyGyaan Update");
            const category = safeXml(data.category || "Education");

            xml += `  <url>\n`;
            xml += `    <loc>${WEBSITE_URL}/blog/${safeSlug}</loc>\n`;
            xml += `    <news:news>\n`;
            xml += `      <news:publication>\n`;
            xml += `        <news:name>StudyGyaan</news:name>\n`;
            xml += `        <news:language>hi</news:language>\n`;
            xml += `      </news:publication>\n`;
            xml += `      <news:publication_date>${pubIso}</news:publication_date>\n`;
            xml += `      <news:title>${newsTitle}</news:title>\n`;
            xml += `      <news:keywords>${category}, StudyGyaan, Sarkari Naukri, Exam Preparation</news:keywords>\n`;
            xml += `    </news:news>\n`;
            xml += `  </url>\n`;
        });

        xml += `</urlset>`;

        // ✅ News sitemap cache कम रखो - fresh content
        res.set('Cache-Control', 'public, max-age=60, s-maxage=120');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.status(200).send(xml);
    } catch (error) {
        console.error("❌ News Sitemap Error:", error.message);
        res.status(500).send("Error");
    }
});

// =========================================================
// 8. FULL SEO RSS FEED (Google News Approved)
// =========================================================
exports.generateRss = onRequest({
    timeoutSeconds: 120,
    memory: "256MiB"
}, async (req, res) => {
    try {
        const now = new Date().toUTCString();
        const nowIso = new Date().toISOString();

        let rss = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        rss += `<rss version="2.0"\n`;
        rss += `  xmlns:dc="http://purl.org/dc/elements/1.1/"\n`;
        rss += `  xmlns:atom="http://www.w3.org/2005/Atom"\n`;
        rss += `  xmlns:media="http://search.yahoo.com/mrss/">\n`; // ✅ Media namespace
        rss += `<channel>\n`;
        rss += `  <title>StudyGyaan - Sarkari Naukri &amp; Exam Preparation</title>\n`;
        rss += `  <link>${WEBSITE_URL}</link>\n`;
        rss += `  <description>Latest Govt Jobs, Mock Tests, Free Study Material &amp; Exam Updates</description>\n`;
        rss += `  <language>hi</language>\n`;
        rss += `  <lastBuildDate>${now}</lastBuildDate>\n`;
        rss += `  <managingEditor>admin@studygyaan.in (StudyGyaan)</managingEditor>\n`;
        rss += `  <webMaster>admin@studygyaan.in (StudyGyaan)</webMaster>\n`;
        rss += `  <copyright>2025 StudyGyaan.in All Rights Reserved</copyright>\n`;
        rss += `  <ttl>60</ttl>\n`; // ✅ 60 min cache
        // ✅ atom:link - RSS validator के लिए जरूरी
        rss += `  <atom:link href="${WEBSITE_URL}/rss" rel="self" type="application/rss+xml"/>\n`;
        // ✅ Channel image
        rss += `  <image>\n`;
        rss += `    <url>${WEBSITE_URL}/logo.png</url>\n`;
        rss += `    <title>StudyGyaan</title>\n`;
        rss += `    <link>${WEBSITE_URL}</link>\n`;
        rss += `    <width>144</width>\n`;
        rss += `    <height>144</height>\n`;
        rss += `  </image>\n`;

        const snap = await db.collection("blogs")
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();

        snap.forEach(doc => {
            const d = doc.data();
            if (!isIndexableDocument(d) || !hasUsefulTitle(d)) return;
            const slugOrId = d.slug || doc.id;
            const pubDate = getUtcDate(d.createdAt, now);
            const pubIso = getIsoDate(d.createdAt, nowIso);

            const itemTitle = d.title || "StudyGyaan Update";
            const itemUrl = `${WEBSITE_URL}/blog/${slugOrId}`;
            const desc = d.description
                ? d.description.substring(0, 500)
                : "Read more on StudyGyaan.in";
            const imageUrl = d.imageUrl || `${WEBSITE_URL}/og-image.jpg`;
            const authorName = d.author || "Rahul Sir";
            const categoryName = d.category || "Education";

            rss += `  <item>\n`;
            rss += `    <title><![CDATA[${itemTitle}]]></title>\n`;
            rss += `    <link>${itemUrl}</link>\n`;
            rss += `    <guid isPermaLink="true">${itemUrl}</guid>\n`; // ✅ Fixed
            rss += `    <pubDate>${pubDate}</pubDate>\n`;
            rss += `    <description><![CDATA[${desc}]]></description>\n`;
            rss += `    <category><![CDATA[${categoryName}]]></category>\n`;
            rss += `    <dc:creator><![CDATA[${authorName}]]></dc:creator>\n`;
            rss += `    <dc:date>${pubIso}</dc:date>\n`; // ✅ ISO date add
            // ✅ media:content - Google Discover image boost
            rss += `    <media:content\n`;
            rss += `      url="${safeXml(imageUrl)}"\n`;
            rss += `      medium="image"\n`;
            rss += `      type="image/jpeg"\n`;
            rss += `      width="1200"\n`;
            rss += `      height="630"/>\n`;
            // ✅ media:thumbnail
            rss += `    <media:thumbnail url="${safeXml(imageUrl)}" width="300" height="200"/>\n`;
            rss += `  </item>\n`;
        });

        rss += `</channel>\n</rss>`;

        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'application/rss+xml; charset=utf-8');
        res.status(200).send(rss);
    } catch (error) {
        console.error("❌ RSS Error:", error.message);
        res.status(500).send("Error generating RSS");
    }
});

// =========================================================
// 9. MAIN SITEMAP (Complete - All URLs in one file)
// =========================================================
exports.generateSitemap = onRequest({
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (req, res) => {
    try {
        const now = new Date().toISOString();

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
        xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

        // ============ STATIC PAGES ============
        STATIC_PAGES.forEach(p => {
            xml += `  <url>\n`;
            xml += `    <loc>${WEBSITE_URL}${p.path}</loc>\n`;
            xml += `    <changefreq>${p.freq}</changefreq>\n`;
            xml += `    <priority>${p.priority}</priority>\n`;
            xml += `  </url>\n`;
        });

        // ============ BLOGS ============
        try {
            const blogsSnap = await db.collection("blogs")
                .orderBy("createdAt", "desc")
                .limit(1000)
                .get();
            
            blogsSnap.forEach(doc => {
                const data = doc.data();
                if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
                const slug = safeXml(data.slug || doc.id);
                const updateTime = getIsoDate(data.updatedAt || data.createdAt, now);
                const imageUrl = safeXml(data.imageUrl || `${WEBSITE_URL}/og-image.jpg`);
                const imageTitle = safeXml(data.title || "StudyGyaan Blog");

                xml += `  <url>\n`;
                xml += `    <loc>${WEBSITE_URL}/blog/${slug}</loc>\n`;
                xml += `    <lastmod>${updateTime}</lastmod>\n`;
                xml += `    <changefreq>weekly</changefreq>\n`;
                xml += `    <priority>0.9</priority>\n`;
                xml += `    <image:image>\n`;
                xml += `      <image:loc>${imageUrl}</image:loc>\n`;
                xml += `      <image:title>${imageTitle}</image:title>\n`;
                xml += `    </image:image>\n`;
                xml += `  </url>\n`;
            });
        } catch (e) { 
            console.error("❌ Blogs error:", e.message); 
        }

        // ============ JOBS ============
        try {
            const jobsSnap = await db.collection("jobs")
                .orderBy("createdAt", "desc")
                .limit(1000)
                .get();
            
            jobsSnap.forEach(doc => {
                const data = doc.data();
                if (!isIndexableDocument(data) || !hasUsefulTitle(data) || (data.type || "").toUpperCase() === "COURSE") return;
                const route = 'job';
                const slug = safeXml(data.slug || doc.id);
                const updateTime = getIsoDate(data.updatedAt || data.createdAt, now);
                const imageUrl = safeXml(data.imageUrl || `${WEBSITE_URL}/og-image.jpg`);
                const imageTitle = safeXml(data.title || "StudyGyaan Job");

                xml += `  <url>\n`;
                xml += `    <loc>${WEBSITE_URL}/${route}/${slug}</loc>\n`;
                xml += `    <lastmod>${updateTime}</lastmod>\n`;
                xml += `    <changefreq>daily</changefreq>\n`;
                xml += `    <priority>1.0</priority>\n`;
                xml += `    <image:image>\n`;
                xml += `      <image:loc>${imageUrl}</image:loc>\n`;
                xml += `      <image:title>${imageTitle}</image:title>\n`;
                xml += `    </image:image>\n`;
                xml += `  </url>\n`;
            });
        } catch (e) { 
            console.error("❌ Jobs error:", e.message); 
        }

        // ============ MOCK TESTS ============
        try {
            const testsSnap = await db.collection("mock_tests")
                .orderBy("createdAt", "desc")
                .limit(500)
                .get();
            
            testsSnap.forEach(doc => {
                const data = doc.data();
                if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
                const slug = safeXml(data.slug || doc.id);
                const updateTime = getIsoDate(data.updatedAt || data.createdAt, now);

                xml += `  <url>\n`;
                xml += `    <loc>${WEBSITE_URL}/test/${slug}</loc>\n`;
                xml += `    <lastmod>${updateTime}</lastmod>\n`;
                xml += `    <changefreq>weekly</changefreq>\n`;
                xml += `    <priority>0.7</priority>\n`;
                xml += `  </url>\n`;
            });
        } catch (e) { 
            console.error("❌ Tests error:", e.message); 
        }

        // ============ WEB STORIES ============
        try {
            const storiesSnap = await db.collection("web_stories")
                .orderBy("createdAt", "desc")
                .limit(500)
                .get();
            
            storiesSnap.forEach(doc => {
                const data = doc.data();
                if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
                const slug = safeXml(data.slug || doc.id);
                const updateTime = getIsoDate(data.createdAt, now);
                const coverImage = safeXml(data.coverImage || `${WEBSITE_URL}/og-image.jpg`);
                const imageTitle = safeXml(data.title || "Web Story");

                xml += `  <url>\n`;
                xml += `    <loc>${WEBSITE_URL}/web-stories/${slug}</loc>\n`;
                xml += `    <lastmod>${updateTime}</lastmod>\n`;
                xml += `    <changefreq>weekly</changefreq>\n`;
                xml += `    <priority>0.9</priority>\n`;
                xml += `    <image:image>\n`;
                xml += `      <image:loc>${coverImage}</image:loc>\n`;
                xml += `      <image:title>${imageTitle}</image:title>\n`;
                xml += `    </image:image>\n`;
                xml += `  </url>\n`;
            });
        } catch (e) { 
            console.error("❌ Stories error:", e.message); 
        }

        // ============ FAST TRACK ============
        try {
            const fastSnap = await db.collection("fast_track")
                .orderBy("createdAt", "desc")
                .limit(500)
                .get();
            
            fastSnap.forEach(doc => {
                const data = doc.data();
                if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
                const slug = safeXml(data.slug || doc.id);
                const updateTime = getIsoDate(data.updatedAt || data.createdAt, now);

                xml += `  <url>\n`;
                xml += `    <loc>${WEBSITE_URL}/update/${slug}</loc>\n`;
                xml += `    <lastmod>${updateTime}</lastmod>\n`;
                xml += `    <changefreq>weekly</changefreq>\n`;
                xml += `    <priority>0.7</priority>\n`;
                xml += `  </url>\n`;
            });
        } catch (e) { 
            console.error("❌ Fasttrack error:", e.message); 
        }

        xml += `</urlset>`;

        res.set('Cache-Control', 'public, max-age=3600, s-maxage=7200');
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.status(200).send(xml);

    } catch (error) {
        console.error("❌ Sitemap Error:", error.message);
        res.status(500).send(`<?xml version="1.0"?><error>${error.message}</error>`);
    }
});
