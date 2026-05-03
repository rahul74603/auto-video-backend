// @ts-nocheck
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const xml2js = require("xml2js");
require("dotenv").config();

// ✅ Firebase Initialization (लोकल और सर्वर दोनों के लिए सही तरीका)
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    
    if (serviceAccountVar) {
        try {
            // .env से क्रेडेंशियल उठाएगा
            const serviceAccount = JSON.parse(serviceAccountVar);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: "studymaterial-406ad"
            });
            console.log("✅ Firebase initialized with Secrets from .env");
        } catch (err) {
            console.error("❌ JSON Parsing Error:", err.message);
            process.exit(1);
        }
    } else {
        // सर्वर पर अपने आप चलेगा
        admin.initializeApp({ projectId: "studymaterial-406ad" });
        console.log("✅ Firebase initialized with Default Auth");
    }
}
const db = admin.firestore();
const WEBSITE_URL = "https://studygyaan.in";

// ============================================================================
// 🔥 1. GOOGLE INDEXING API
// ============================================================================
exports.forcePushSitemap = onRequest({ 
    timeoutSeconds: 540, 
    memory: "1GiB", 
    secrets: ["SERVICE_ACCOUNT_JSON"] 
}, async (req, res) => {
    try {
        const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
        if (!serviceAccountVar) throw new Error("Missing SERVICE_ACCOUNT_JSON");

        const auth = new google.auth.GoogleAuth({
            credentials: JSON.parse(serviceAccountVar),
            scopes: ["https://www.googleapis.com/auth/indexing"],
        });
        const indexing = google.indexing({ version: "v3", auth });

        const response = await axios.get(`${WEBSITE_URL}/sitemap.xml`);
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(response.data);
        const allUrls = result.urlset.url.map(u => u.loc[0]);

        let count = 0;
        const urlsToProcess = allUrls.slice(0, 200); 

        for (const url of urlsToProcess) { 
            try {
                await indexing.urlNotifications.publish({
                    requestBody: { url: url, type: "URL_UPDATED" },
                });
                count++;
            } catch (err) { console.error(`Error pushing ${url}:`, err.message); }
        }
        res.status(200).send(`Success! ${count} URLs pushed.`);
    } catch (error) {
        res.status(500).send("Indexing Failed: " + error.message);
    }
});

// ============================================================================
// 2. GENERIC PAYMENT WEBHOOK
// ============================================================================
exports.paymentWebhook = onRequest(async (req, res) => {
    const data = req.body;
    const secretToken = req.query.secret;

    if (secretToken !== "rahul_study_secure_746") { 
        return res.status(401).send("Unauthorized Access!");
    }

    if (data.status === 'success' || data.status === 'completed') {
        const email = data.email || data.customer_email || data.payer_email;
        const courseId = data.course_id || data.custom_fields?.course_id || "teaching_master_69"; 
        const paymentId = data.payment_id || data.id;

        try {
            const userSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();
            if (!userSnapshot.empty) {
                const userId = userSnapshot.docs[0].id;
                await db.collection('purchases').doc(`${userId}_${courseId}`).set({
                    userId: userId, courseId: courseId, email: email, status: 'completed', paymentId: paymentId, unlockedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return res.status(200).send("Access Granted!");
            }
            return res.status(404).send("User not found");
        } catch (error) { return res.status(500).send("Error"); }
    }
    res.status(400).send("Status not successful");
});

// ============================================================================
// 3. TELEGRAM ALERT LOGIC (Used by index.js)
// ============================================================================
async function runDailyAlert() {
    console.log("🚀 Starting Daily Job Expiry Alert...");
    try {
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const jobsSnapshot = await db.collection("jobs").get(); 
        for (let docRef of jobsSnapshot.docs) {
            const job = docRef.data();
            if (!job.lastDate) continue;

            let lastDateObj = (job.lastDate && job.lastDate.toDate) ? job.lastDate.toDate() : new Date(job.lastDate);
            if (isNaN(lastDateObj)) continue;

            const diffDays = Math.ceil((lastDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays <= 5 && diffDays >= 0) {
                const jobTitle = job.postTitle || job.title || "New Govt Job";
                const safeJobTitle = jobTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const jobUrl = `${WEBSITE_URL}/job/${docRef.id}`;
                const message = `<b>🚨 URGENT REMINDER 🚨</b>\n\n📌 <b>Post:</b> ${safeJobTitle}\n⏳ <b>आखिरी मौका:</b> फॉर्म भरने में सिर्फ <b>${diffDays} दिन</b> बचे हैं!\n📅 <b>Last Date:</b> ${job.lastDate}\n\n👇 <b>Apply Here:</b> \n${jobUrl}`;
                
                try {
                    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' });
                    await new Promise(res => setTimeout(res, 1000));
                } catch (err) { console.error(`❌ Alert Failed for: ${jobTitle}`); }
            }
        }
    } catch (error) { console.error("❌ Fatal Error:", error.message); }
}

// ============================================================================
// 4. DYNAMIC SITEMAP GENERATOR (Optimized)
// ============================================================================
exports.generateSitemap = onRequest({ 
    timeoutSeconds: 540, 
    memory: "1GiB", 
    secrets: ["SERVICE_ACCOUNT_JSON"] 
}, async (req, res) => {
    try {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        // ✅ Fix: Changed "/mocktest" to "/test" below
        const staticPages = ["", "/govt-jobs", "/free-study-material", "/e-books", "/premium-notes", "/contact-us", "/about-us", "/privacy-policy", "/terms-conditions", "/blog", "/test", "/web-stories", "/fasttrack"];
        const now = new Date().toISOString();

        staticPages.forEach(p => {
            xml += `  <url><loc>${WEBSITE_URL}${p}</loc><lastmod>${now}</lastmod><priority>0.8</priority></url>\n`;
        });

        // ✅ Fix: Changed route for mock_tests from "mocktest" to "test" below
        const collections = [{ name: "blogs", route: "blog" }, { name: "mock_tests", route: "test" }, { name: "web_stories", route: "web-stories" }, { name: "fasttrack", route: "fasttrack" }];

        for (const config of collections) {
            const snap = await db.collection(config.name).select("updatedAt").get();
            snap.forEach(doc => {
                const data = doc.data();
                const updateTime = data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : new Date(data.updatedAt).toISOString()) : now;
                const safeId = doc.id.replace(/&/g, '&amp;');
                xml += `  <url><loc>${WEBSITE_URL}/${config.route}/${safeId}</loc><lastmod>${updateTime}</lastmod></url>\n`;
            });
        }

        const jobsSnap = await db.collection("jobs").select("type", "updatedAt").get();
        jobsSnap.forEach(doc => {
            const data = doc.data();
            const route = data.type === 'JOB' ? 'job' : 'course'; 
            const updateTime = data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : new Date(data.updatedAt).toISOString()) : now;
            const safeId = doc.id.replace(/&/g, '&amp;');
            xml += `  <url><loc>${WEBSITE_URL}/${route}/${safeId}</loc><lastmod>${updateTime}</lastmod></url>\n`;
        });

        xml += `</urlset>`;
        res.set('Content-Type', 'text/xml').status(200).send(xml);
    } catch (error) { res.status(500).send("Error generating sitemap"); }
});

// ============================================================================
// 5. DYNAMIC RSS FEED GENERATOR
// ============================================================================
exports.generateRss = onRequest(async (req, res) => {
    try {
        const now = new Date().toUTCString();
        let rss = `<?xml version="1.0" encoding="UTF-8" ?>\n<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">\n<channel>\n<title>StudyGyaan</title>\n<link>${WEBSITE_URL}</link>\n<description>Latest Updates</description>\n<lastBuildDate>${now}</lastBuildDate>\n`;

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

module.exports = {
    runDailyAlert,
    generateSitemap: exports.generateSitemap,
    forcePushSitemap: exports.forcePushSitemap,
    generateRss: exports.generateRss,
    paymentWebhook: exports.paymentWebhook
};
