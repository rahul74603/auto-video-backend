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

async function runFastTrackLogic() {
    console.log("🚀 Starting Smart Fast-Track Scraper (Strict 4 Categories)...");

    const sources = [
        'https://www.freejobalert.com/feed/',
        'https://www.sarkariexam.com/feed',
        'https://feeds.feedburner.com/SarkariExam'
    ];
    
    let allItems = [];

    // ✅ FIX 1: Break hata diya. Ab sabhi websites se fetch karega.
    for (let url of sources) {
        try {
            console.log(`📡 Trying Source: ${url}`);
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000
            });

            if (response.data.includes("<!DOCTYPE html>")) continue;

            let feed = await parser.parseString(response.data);
            if (feed && feed.items && feed.items.length > 0) {
                console.log(`✅ Success: ${url} | Items found: ${feed.items.length}`);
                allItems.push(...feed.items);
            }
        } catch (err) { console.warn(`⚠️ Source Failed: ${err.message}`); }
    }

    if (allItems.length === 0) {
        console.log("⚠️ No items found from any source.");
        return [];
    }

    // डुप्लीकेट लिंक्स फिल्टर करना 
    let uniqueItems = [];
    let seenLinks = new Set();
    for (let item of allItems) {
        if (!seenLinks.has(item.link)) {
            seenLinks.add(item.link);
            uniqueItems.push(item);
        }
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const results = [];

    // टॉप 40 यूनिक आइटम ही प्रोसेस होंगे
    for (const item of uniqueItems.slice(0, 40)) { 
        try {
            const titleLower = item.title?.toLowerCase() || "";
            let category = "";

            if (titleLower.includes("result")) category = "Result";
            else if (titleLower.includes("admit card") || titleLower.includes("call letter") || titleLower.includes("hall ticket")) category = "Admit Card";
            else if (titleLower.includes("answer key")) category = "Answer Key";
            else if (titleLower.includes("syllabus")) category = "Syllabus";
            else {
                continue;
            }

            const existingDoc = await db.collection("fast_track").where("originalLink", "==", item.link).limit(1).get();
            if (!existingDoc.empty) {
                continue;
            }

            console.log(`📡 Fetching [${category}]: ${item.title}`);

            const { data: html } = await axios.get(item.link, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
            const $ = cheerio.load(html);

            let extractedLinks = new Set();
            
            // ✅ FIX 2: सिर्फ Table और Post Body से ही लिंक निकालेगा। फालतू लिंक्स इग्नोर होंगे।
            $("table a, .post-body a, .entry-content a").each((i, el) => {
                let href = $(el).attr("href");
                let text = $(el).text().trim();
                
                if (href && href.startsWith("http") && 
                    !href.includes("facebook") && 
                    !href.includes("twitter") && 
                    !href.includes("telegram") && 
                    !href.includes("whatsapp") && 
                    text.length > 1) {
                    extractedLinks.add(`[Button Text: ${text}] -> (URL: ${href})`);
                }
            });

            let finalLinksText = Array.from(extractedLinks).join("\n").substring(0, 3000); // AI को 3000 chars

            const prompt = `Extract the SINGLE most relevant OFFICIAL direct link for ${category}.
URL LIST:
${finalLinksText}

STRICT INSTRUCTIONS:
1. Identify the link that leads to a .gov.in, .nic.in, .edu.in, or a direct PDF/Portal.
2. If multiple links exist, prioritize buttons like "Download Admit Card", "Check Result", "Click Here".
3. IGNORE any link containing: sarkariexam, freejobalert, sarkariresult, facebook, telegram, youtube, instagram.
4. If NO official link is found, strictly return empty string "" for directLink.

Return ONLY valid JSON:
{
  "title": "Clean Job Name without 'Fast Track'",
  "directLink": "The Official URL"
}`;

            try {
                const aiResult = await model.generateContent(prompt);
                let rawText = aiResult.response.text();
                let cleanText = rawText.replace(/```json|```/gi, "").trim();
                let cleanJson = JSON.parse(cleanText);

                let finalTitle = cleanJson.title || item.title;
                let finalDirectLink = cleanJson.directLink || "";

                if (!finalDirectLink || finalDirectLink === "") {
                    finalDirectLink = item.link; // Fallback
                }

                await db.collection("fast_track").add({
                    title: finalTitle.replace(/Fast\s*Track/gi, "").trim(),
                    directLink: finalDirectLink, 
                    category, 
                    originalLink: item.link, 
                    status: "draft", 
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                results.push({ title: finalTitle, category });
                console.log(`✅ Saved Draft: ${finalTitle}`);
                
                await new Promise(r => setTimeout(r, 2000)); 

            } catch (aiErr) {
                if (aiErr.message.includes("429")) {
                    console.error("🛑 Gemini Quota Finished!");
                    break;
                }
            }

        } catch (err) { console.error("⚠ General Loop Error:", err.message); }
    }
    
    console.log(`🎉 Cycle Complete! Found ${results.length} new items.`);
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
/* ⏰ DAILY SCHEDULED RUN        */
/* ============================= */
exports.scheduledFastTrackUpdates = onSchedule(
    { schedule: "0 2 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 300, memory: "1GiB", secrets: ["GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON"] },
    async () => {
        try {
            const data = await runFastTrackLogic();
            console.log(`🎯 Daily Auto-Run Success: ${data.length} updates found.`);
        } catch (error) { console.error("❌ Daily Auto-Run Failed:", error.message); }
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
        if (!event.data.after.exists) return null;

        const newValue = event.data.after.data();
        const previousValue = event.data.before.exists ? event.data.before.data() : null;

        // ✅ FIX 3: Case-insensitive 'published' check (taaki Admin 'Published' likhe tab bhi trigger ho)
        const isNowPublished = newValue.status && newValue.status.toLowerCase() === 'published';
        const wasPublished = previousValue && previousValue.status && previousValue.status.toLowerCase() === 'published';

        const isNewlyPublished = isNowPublished && !wasPublished;

        if (isNewlyPublished) {
            console.log(`🚀 Fast Track Live! Processing Services: ${newValue.title}`);
            
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
                    console.log("✅ Telegram Sent!");
                } catch (error) { 
                    console.error("❌ Telegram failed:", error.message); 
                }
            } else {
                console.log("⚠️ TELEGRAM SKIPPED: Token or Chat ID not found.");
            }

            // --- 🟢 2. WHATSAPP ---
            const serverIP = "34.58.150.88";
            const channelId = "120363425475163322@newsletter";
            const whatsappMessage = `🚨 *New ${newValue.category} Update!* 🚨\n\n${icon} *${newValue.title}*\n\n🔗 *Read More & Apply:*\n${studyGyaanUrl}`;
            try {
                await axios.post(`http://${serverIP}:3000/send-job`, { targetId: channelId, messageText: whatsappMessage, linkPreview: true });
                console.log("✅ WhatsApp Alert Sent!");
            } catch (err) { console.error("❌ WhatsApp Error:", err.message); }

            // --- 🎬 3. VIDEO & 📄 PDF ---
            console.log("⏳ Starting Background Tasks...");

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
            console.log(`⏭️ Trigger Ignore (Status: ${newValue.status})`);
        }
        return null;
    }
);

exports.runFastTrackLogic = runFastTrackLogic;