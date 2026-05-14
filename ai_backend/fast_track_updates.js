require("dotenv").config();
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

const axios = require("axios");
const { google } = require("googleapis");
const cheerio = require("cheerio");
const Parser = require("rss-parser");
const parser = new Parser();

if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    const config = {
        projectId: "studymaterial-406ad",
        storageBucket: "studymaterial-406ad.firebasestorage.app"
    };

    if (serviceAccountVar && serviceAccountVar !== "undefined") {
        try {
            const serviceAccount = JSON.parse(serviceAccountVar);
            admin.initializeApp({
                ...config,
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("✅ Firebase initialized with Service Account & Bucket");
        } catch (e) {
            console.error("❌ JSON Parse Error:", e.message);
            admin.initializeApp(config);
        }
    } else {
        admin.initializeApp(config);
        console.log("✅ Firebase initialized with Default Auth");
    }
}
const db = admin.firestore();

const { generateAndUploadVideo } = require("./autoVideo.js");
const { generateSyllabusPDF } = require("./autoPdf.js");

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function createSlug(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
}

// ✅ Updated to Google Indexing v3 (from auto_blog.js)
async function notifyGoogle(url) {
    try {
        const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
        if (!serviceAccountVar || serviceAccountVar === "undefined") {
            console.log("⚠️ Skipping Google Indexing: SERVICE_ACCOUNT_JSON not found.");
            return;
        }

        const key = JSON.parse(serviceAccountVar);

        const jwtClient = new google.auth.JWT({
            email: key.client_email,
            key: key.private_key.replace(/\\n/g, '\n'),
            scopes: ["https://www.googleapis.com/auth/indexing"]
        });

        await jwtClient.authorize();

        await axios.post("https://indexing.googleapis.com/v3/urlNotifications:publish", {
            url: url, type: "URL_UPDATED"
        }, {
            headers: { Authorization: `Bearer ${jwtClient.credentials.access_token}` }
        });

        console.log("🚀 Indexing API Success:", url);
    } catch (err) {
        console.error("❌ Indexing API Error:", err.message);
    }
}

/* ========================================== */
/* 🔥 SHARED FAST TRACK LOGIC (SMART MODE)  */
/* ========================================== */

async function runFastTrackLogic(sendLogs = console.log) {
    sendLogs("🚀 Starting Smart Fast-Track Scraper (Live Output Mode)...");
    const sources = [
        'https://www.freejobalert.com/feed/',
        'https://www.sarkariexam.com/feed',
        'https://feeds.feedburner.com/SarkariExam'
    ];
    
    let allItems = [];
    for (let url of sources) {
        try {
            sendLogs(`📡 Fetching Source: ${url}`);
            const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
            let feed = await parser.parseString(response.data);
            if (feed && feed.items) {
                sendLogs(`✅ [${url}] से ${feed.items.length} आइटम्स मिले।`);
                allItems.push(...feed.items);
            }
        } catch (err) { sendLogs(`⚠️ Source Failed [${url}]: ${err.message}`); }
    }

    if (allItems.length === 0) {
        sendLogs("❌ किसी भी वेबसाइट से कोई डेटा नहीं मिला।");
        return [];
    }

    let uniqueItems = [];
    const now = new Date();
    const dateSuffix = now.toLocaleString('en-IN', { month: 'short', year: 'numeric' }).toLowerCase().replace(' ', '-');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const results = [];

    sendLogs(`🔍 कुल ${allItems.length} आइटम्स की जांच शुरू हो रही है...`);

    for (const item of allItems.slice(0, 40)) { 
        try {
            const title = item.title || "No Title";
            const link = item.link || "No Link";
            const titleLower = title.toLowerCase();
            
            // 🛑 सख्त फिल्टर: अगर इन 4 में से कोई नहीं है, तो तुरंत छोड़ दो
            let category = "";
            if (titleLower.includes("result")) category = "Result";
            else if (titleLower.includes("admit card") || titleLower.includes("call letter") || titleLower.includes("hall ticket")) category = "Admit Card";
            else if (titleLower.includes("answer key")) category = "Answer Key";
            else if (titleLower.includes("syllabus")) category = "Syllabus";

            if (!category) {
                // अब ये GitHub पर फ़ालतू कचरा नहीं दिखाएगा, सीधा अगले पर जाएगा
                continue; 
            }

            // अगर पहले से सेव है तो भी AI के पास जाने की ज़रूरत नहीं
            const existingDoc = await db.collection("fast_track").where("originalLink", "==", link).limit(1).get();
            if (!existingDoc.empty) {
                continue;
            }

            sendLogs(`🎯 Processing Match [${category}]: ${title}`);
            
            // AI (Gemini) का काम यहाँ से शुरू होगा...
            // (बाकी का AI वाला कोड यहाँ रहेगा)
            const { data: html } = await axios.get(link, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
            const $ = cheerio.load(html);
            let extractedLinks = new Set();
            $("table a, .post-body a, .entry-content a").each((i, el) => {
                let href = $(el).attr("href");
                let text = $(el).text().trim();
                if (href && href.startsWith("http") && text.length > 1) {
                    extractedLinks.add(`[Button Text: ${text}] -> (URL: ${href})`);
                }
            });

            let finalLinksText = Array.from(extractedLinks).join("\n").substring(0, 3000);
            const prompt = `Extract Info for ${category}. URL LIST: ${finalLinksText} Return ONLY valid JSON: { "title": "Clean Name", "slug": "slug", "directLink": "URL", "metaDesc": "desc" }`;
            
            const aiResult = await model.generateContent(prompt);
            let cleanJson = JSON.parse(aiResult.response.text().replace(/```json|```/gi, "").trim());

            const seoSlug = `${cleanJson.slug || createSlug(cleanJson.title || title)}-${dateSuffix}`;
            await db.collection("fast_track").doc(seoSlug).set({
                title: cleanJson.title || title,
                slug: seoSlug,
                directLink: cleanJson.directLink || link,
                description: cleanJson.metaDesc || "",
                category,
                originalLink: link,
                status: "draft",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            results.push({ title: cleanJson.title || title, category });
            sendLogs(`✅ Saved: ${seoSlug}`);

        } catch (err) { sendLogs(`⚠️ Loop Error: ${err.message}`); }
    }
    
    sendLogs(`🎉 Cycle Complete! Found ${results.length} new items.`);
    return results;
}
/* ============================= */
/* 🌐 MANUAL TRIGGER API        */
/* ============================= */
exports.fetchFastTrackUpdates = onRequest(
    { cors: true, timeoutSeconds: 300, memory: "1GiB", secrets: ["GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON"] },
    async (req, res) => {
        const SECRET_KEY = "StudyGyaan_FastTrack_786";
        if (req.query.key !== SECRET_KEY) return res.status(401).send("Unauthorized");
        try {
            const data = await runFastTrackLogic();
            res.json({ success: true, updatesFound: data.length, data });
        } catch (error) { res.status(500).send(error.message); }
    }
);
/* ============================= */
/* 🚀 FREE HTTP API RUN (GitHub) */
/* ============================= */
exports.triggerFastTrackUpdates = onRequest(
    { timeoutSeconds: 300, memory: "1GiB", secrets: ["GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON"] },
    async (req, res) => {
        // GitHub की स्क्रीन पर लाइव टेक्स्ट दिखाने के लिए हेडर्स
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const sendLogs = (msg) => {
            res.write(`${msg}\n`);
            console.log(msg);
        };

        try {
            // runFastTrackLogic को sendLogs फंक्शन के साथ कॉल कर रहे हैं
            const data = await runFastTrackLogic(sendLogs);
            res.write(`\n🎉 Total New Items Processed: ${data.length}\n`);
            res.end();
        } catch (error) {
            console.error("❌ Daily Auto-Run Failed:", error.message); 
            res.write(`\n❌ Error: ${error.message}\n`);
            res.end();
        }
    }
);

/* ============================================================== */
/* 📢 TELEGRAM, WHATSAPP, VIDEO & PDF AUTO-TRIGGER                */
/* ============================================================== */

exports.onFastTrackApprovedSendTelegram = onDocumentWritten(
    { 
        document: "fast_track/{docId}", 
        memory: "2GiB", 
        timeoutSeconds: 540,
        secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON", "GMAIL_CREDENTIALS", "YOUTUBE_TOKEN", "TTS_KEY_JSON", "FB_PAGE_ID", "FB_PAGE_TOKEN"] 
    }, 
    async (event) => {
        // अगर डेटा डिलीट हुआ है तो रुक जाएं
        if (!event.data.after.exists) return null;

        const newValue = event.data.after.data();
        const previousValue = event.data.before.exists ? event.data.before.data() : null;

        // ✅ DEBUG LOGS: ये बहुत जरूरी हैं
        console.log(`🚀 Fast Track Triggered for: ${newValue.title}`);
        
        
        
    const currentStatus = (newValue.status || "").toString().toLowerCase().trim();
        
        // 🔥 MAHA-JUGAD: Status 'draft' nahi hona chahiye aur telegramSent false hona chahiye
      if (currentStatus !== 'draft' && newValue.telegramSent !== true) {
    
    // 🔥 Google Discover के लिए 100% GSC Valid Schema (Crash-Proof)
    let publishTime = new Date().toISOString();
    if (newValue.createdAt && typeof newValue.createdAt.toDate === 'function') {
        publishTime = newValue.createdAt.toDate().toISOString();
    }

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": newValue.title,
        "image": ["https://studygyaan.in/og-image.jpg"], 
        "datePublished": publishTime,
        "dateModified": new Date().toISOString(),
        "description": newValue.description || newValue.title,
        "author": { "@type": "Person", "name": "Rahul Sir", "url": "https://studygyaan.in" },
        "publisher": { 
            "@type": "Organization",
            "name": "StudyGyaan",
            "logo": { "@type": "ImageObject", "url": "https://studygyaan.in/logo.png" }
        }
    };
    // डेटाबेस अपडेट
    // डेटाबेस अपडेट
    await admin.firestore().collection("fast_track").doc(event.params.docId).update({ schemaMarkup: JSON.stringify(jsonLd) });

    const studyGyaanUrl = `https://studygyaan.in/update/${event.params.docId}`;
            await notifyGoogle(studyGyaanUrl);

            let icon = "📌";
            if (newValue.category === "Result") icon = "🏆";
            else if (newValue.category === "Admit Card") icon = "🎫";
            else if (newValue.category === "Answer Key") icon = "🔑";

            // --- 📱 1. TELEGRAM ---
            const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; 
            const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; 

            if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
                const message = `🚨 <b>New ${newValue.category} Out!</b> 🚨\n\n` +
                                `${icon} <b>${newValue.title}</b>\n\n` +
                                `📖 <b>Read More & Apply:</b> \n${studyGyaanUrl}\n\n` +
                                `🚀 Join @studygyaan_official for fastest updates!`;
                try {
                    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML', disable_web_page_preview: false 
                    });
                    console.log("✅ Telegram Alert Sent Successfully!");
                    
                    // 🔥 Lock: Ab dobara nahi jayega
                    await admin.firestore().collection("fast_track").doc(event.params.docId).update({ telegramSent: true });

                } catch (error) {
                    console.error("❌ Telegram API failed:", error.message); 
                }
            }

            // --- 🟢 2. WHATSAPP ---
            const serverIP = "34.58.150.88";
            const channelId = "120363425475163322@newsletter";
            const whatsappMessage = `🚨 *New ${newValue.category} Update!* 🚨\n\n${icon} *${newValue.title}*\n\n🔗 *Read More & Apply:*\n${studyGyaanUrl}`;
            try {
                await axios.post(`http://${serverIP}:3000/send-job`, { targetId: channelId, messageText: whatsappMessage, linkPreview: true });
                console.log("✅ WhatsApp Alert Sent!");
            } catch (err) { console.error("❌ WhatsApp Error:", err.message); }

            // --- 🎬 3. VIDEO & 📄 PDF (Background Tasks) ---
            console.log("⏳ Running Background Video/PDF Engine...");

            let videoPromise = Promise.resolve();
            if (!newValue.videoSent) {
                videoPromise = generateAndUploadVideo({ ...newValue, id: event.params.docId })
                    .then(async (videoSuccess) => {
                        if (videoSuccess) {
                            await db.collection("fast_track").doc(event.params.docId).update({ videoSent: true });
                            console.log("✅ Video Uploaded Successfully!");
                        }
                    })
                    .catch(e => console.log("❌ Video error: ", e.message));
            }
            
            let pdfPromise = Promise.resolve(); 
            const pdfCategories = ["Syllabus", "Admit Card", "Result"];
            if (pdfCategories.includes(newValue.category)) {
                pdfPromise = generateSyllabusPDF(newValue)
                    .then(async (pdfLink) => {
                        if (pdfLink) {
                            await db.collection("fast_track").doc(event.params.docId).update({ syllabusPDF: pdfLink });
                            console.log("✅ PDF Link saved to DB!");
                        }
                    })
                    .catch(e => console.log("❌ PDF error: ", e.message));
            }

            await Promise.all([videoPromise, pdfPromise]);
            console.log("🎯 All Fast Track Background Tasks Completed!");
       } else {
            console.log(`⏭️ Trigger Ignored: Ya to yeh 'draft' hai ya msg pehle hi ja chuka hai.`);
        }
        return null;
    }
);

exports.runFastTrackLogic = runFastTrackLogic;
