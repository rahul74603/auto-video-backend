require("dotenv").config();
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const cheerio = require("cheerio");
const Parser = require('rss-parser');
const parser = new Parser();

// ✅ autoVideo.js से वीडियो इंजन इम्पोर्ट किया
const { generateAndUploadVideo } = require('./autoVideo');

// ✅ Firebase Initialization with Secrets
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

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ✅ notifyGoogle function updated for v3 (From auto_blog.js)
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
/* 🔥 SHARED SCRAPING LOGIC (NO REQ/RES DEPS) */
/* ========================================== */

async function scrapeGovtJobsLogic() {
    console.log("🚀 Starting Govt Jobs Scraper Logic...");
    const rssUrl = 'https://www.indgovtjobs.in/feeds/posts/default?alt=rss';
    
    const feed = await parser.parseURL(rssUrl);
    // ✅ 40 की लिमिट रखी है ताकि अंदर तक नई जॉब्स मिल सकें
    const latestItems = feed.items.slice(0, 40); 
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-lite", 
        generationConfig: { responseMimeType: "application/json" } 
    });

    let addedCount = 0;

    for (const item of latestItems) {
        const titleText = item.title || "";
        if (titleText.toLowerCase().includes('admit card') || 
            titleText.toLowerCase().includes('result') || 
            titleText.toLowerCase().includes('answer key') ||
            titleText.toLowerCase().includes('cut off')) {
            continue;
        }

        let jobLink = (item.link || item.guid || "").trim();
        if (!jobLink || jobLink.includes('127.0.0.1')) continue;

        const docId = Buffer.from(jobLink).toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
        const alreadyProcessed = await db.collection("processed_links").doc(docId).get();
        if (alreadyProcessed.exists) continue;

        try {
            console.log(`📡 Precision Scraping from: ${jobLink}`);

            const { data: html } = await axios.get(jobLink, { 
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 25000 
            });
            
            const $ = cheerio.load(html);
            $('script, style, nav, footer, header').remove();
            
            $("table a, .post-body a").each((i, el) => {
                const linkText = $(el).text().trim();
                const href = $(el).attr("href");
                if (href && href.startsWith("http")) {
                    $(el).text(`${linkText} (URL: ${href})`); 
                }
            });

            let tableContent = "";
            $('table').each((i, el) => {
                tableContent += "\n--- TABLE START ---\n";
                tableContent += $(el).text().replace(/\s\s+/g, ' ').trim();
                tableContent += "\n--- TABLE END ---\n";
            });

            let mainBody = $('.post-body').text() || $('body').text();
            mainBody = mainBody.replace(/\s\s+/g, ' ').trim();

            const finalScrapedData = `TABLES:\n${tableContent}\n\nMAIN TEXT:\n${mainBody}`.substring(0, 15000);
            const todayDate = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'long', day: 'numeric' });
            
            const prompt = `
Act as a Precise Job Data Specialist. Extract details ONLY from the scraped data provided below.
Follow these EXACT mapping rules (Hindi/English/Synonyms) to fill EVERY field. Do not leave fields blank if data exists in any form:

1. title: Look for "Job Title", "Post Name", "Name of Post", "Name of the Post", "Post", "Recruitment of", "Job Role", "Vacancy Name", "पद का नाम", "पद", "भर्ती".
2. startDate: Look for "Start Date", "Application Start Date", "Apply Online Starting Date", "Opening Date", "Date of Commencement", "Online Application Start", "प्रारंभ तिथि", "शुरू होने की तिथि", "आवेदन शुरू". Return exactly as found.
3. lastDate: Look for "Last Date", "Closing Date", "End of Date", "Deadline", "Apply Online Last Date", "Last Date to Apply", "Due Date", "अंतिम तिथि", "Antim Tithi", "आवेदन की अंतिम तिथि". Return exactly as found.
4. vacancies: Look for "Vacancies", "Total Vacancy", "Posts", "Total Posts", "No. of Vacancies", "Number of Posts", "Total Vacancies", "कुल पद", "रिक्तियां", "पदों की संख्या". Extract numbers only if possible.
5. organization: Look for "Organization", "Organized By", "Recruiting Organization", "Department", "Board", "Name of Department", "Company", "संस्था", "विभाग", "भर्ती बोर्ड".
6. salary: Look for "Salary", "Pay Scale", "Pay Level", "Pay Matrix", "Remuneration", "Stipend", "Basic Pay", "वेतन", "सैलरी", "पे स्केल".
7. age constraints: Look for "Age Limit", "Age Limit as on", "Age", "Age Criteria", "आयु सीमा", "उम्र". Put minimum age in "minAge" and maximum age in "ageLimit".
8. advtNo: Look for "Advt. No.", "Advt No.", "Advertisement No", "Notification No", "Employment Notice", "EN No", "विज्ञापन संख्या". Extract the exact value.
9. qualification: Look for "Qualification", "Education", "Educational Qualification", "Eligibility", "Education Qualification", "Required Qualification", "शैक्षणिक योग्यता", "योग्यता".
10. location: Look for "Job Location", "State", "Place of Posting", "Posting", "Location", "नौकरी का स्थान", "स्थान".
11. selectionProcess: Look for "Selection Process", "Selection Procedure", "Method of Selection", "चयन प्रक्रिया", "चयन का तरीका".
12. eligibility: Look for "Physical", "PST", "PET", "Height", "Chest", "Physical Standards", "शारीरिक योग्यता", "Extra Details".
13. feeGen: Look for "General", "UR", "Unreserved", "सामान्य", "GEN". Extract fee amount.
14. feeOBC: Look for "OBC", "BC", "EWS", "MOBC", "अन्य पिछड़ा वर्ग". Extract fee amount.
15. feeSCST: Look for "SC", "ST", "PH", "PwBD", "PWD", "अनुसूचित जाति", "अनुसूचित जनजाति". Extract fee amount.
16. feeFemale: Look for "Female", "Women", "महिला". Extract fee amount.
17. applicationFee: Look for "Payment Mode", "Fee Mode", "Fee Details", "भुगतान का प्रकार".
18. notificationLink: MUST extract the URL inside brackets like (URL: https://...).
19. applyLink: MUST extract the URL inside brackets like (URL: https://...). Defaults to "${jobLink}".
20. officialSiteLink: MUST extract the URL inside brackets like (URL: https://...).
21. isExpired: Compare 'lastDate' with Today's Date (${todayDate}). If passed, return true.

SCRAPED DATA:
${finalScrapedData}

STRICT JSON SCHEMA:
{
  "title": "",
  "category": "Identify: ssc, banking, railway, upsc, defense, teaching, state, engineering, or other",
  "organization": "",
  "advtNo": "",
  "startDate": "",
  "lastDate": "",
  "vacancies": "",
  "salary": "",
  "qualification": "",
  "minAge": "",
  "ageLimit": "",
  "location": "",
  "selectionProcess": "",
  "eligibility": "",
  "feeGen": "",
  "feeSCST": "",
  "feeFemale": "",
  "feeOBC": "",
  "applicationFee": "",
  "notificationLink": "",
  "applyLink": "${jobLink}",
  "officialSiteLink": "",
  "description": "Professional 3-4 line summary in Hinglish about this job.",
  "isExpired": false
}`;

            const result = await model.generateContent(prompt);
            const aiResponse = await result.response;
            let aiText = aiResponse.text().replace(/```json|```/g, "").trim();

            let jobData = JSON.parse(aiText);
            if (Array.isArray(jobData)) jobData = jobData[0];

            const getVal = (key) => {
                if (!jobData) return "";
                const foundKey = Object.keys(jobData).find(k => k.toLowerCase() === key.toLowerCase());
                return foundKey ? jobData[foundKey] : "";
            };

            const finalTitle = getVal("title");
            if (getVal("isExpired") === true || !finalTitle) {
                await db.collection("processed_links").doc(docId).set({ link: jobLink, processedAt: admin.firestore.FieldValue.serverTimestamp(), note: "Skipped by AI" });
                continue; 
            }

            // ✅ FIX: Admin Panel के लिए 'job_drafts' कलेक्शन में 'pending' स्टेटस के साथ सेव कर रहा है
            await db.collection("job_drafts").add({
                title: finalTitle,
                category: getVal("category") || "other",
                organization: getVal("organization"),
                advtNo: getVal("advtNo"),
                startDate: getVal("startDate"),
                lastDate: getVal("lastDate"),
                vacancies: getVal("vacancies"),
                salary: getVal("salary"),
                qualification: getVal("qualification"),
                minAge: getVal("minAge"),
                ageLimit: getVal("ageLimit"),
                location: getVal("location"),
                selectionProcess: getVal("selectionProcess"),
                eligibility: getVal("eligibility"),
                feeGen: getVal("feeGen"),
                feeSCST: getVal("feeSCST"),
                feeFemale: getVal("feeFemale"),
                feeOBC: getVal("feeOBC"),
                applicationFee: getVal("applicationFee"),
                notificationLink: getVal("notificationLink"),
                applyLink: getVal("applyLink") || jobLink,
                officialSiteLink: getVal("officialSiteLink"),
                description: getVal("description"),
                originalLink: jobLink,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                status: "pending", // 👈 Admin panel ki demand ke hisab se wapas "pending" kiya
                type: "JOB"
            });

            await db.collection("processed_links").doc(docId).set({ link: jobLink, processedAt: admin.firestore.FieldValue.serverTimestamp() });
            addedCount++;
            if (addedCount >= 5) break; 
        } catch (err) { console.error(`Failed: ${jobLink}`, err.message); }
    }
    return addedCount;
}

/* ========================================== */
/* 1️⃣ AUTO FETCH JOBS API (HTTP TRIGGER)     */
/* ========================================== */

exports.fetchLatestGovtJobs = onRequest({ 
    cors: true, 
    timeoutSeconds: 300, 
    memory: "1GiB" 
}, async (req, res) => {
    const SECRET_KEY = "StudyGyaan_786_Secure";
    if (req.query.key !== SECRET_KEY) return res.status(401).send("Unauthorized");

    try {
        const count = await scrapeGovtJobsLogic();
        res.json({ success: true, message: `${count} New jobs saved to drafts!` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/* ========================================== */
/* 2️⃣ MANUAL PUBLISH TRIGGER (SOCIALS + VIDEO) */
/* ========================================== */

// ✅ FIX: Wapas onDocumentCreated kiya gaya. Jab Admin Panel 'job_drafts' se 'jobs' me publish karega, tab ye chalega.
exports.onJobApprovedSendTelegram = onDocumentCreated({
    document: "jobs/{jobId}",
    secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON", "GMAIL_CREDENTIALS", "YOUTUBE_TOKEN", "TTS_KEY_JSON"],
    timeoutSeconds: 540, 
    memory: "2GiB", 
    cpu: 1 
}, async (event) => {
    const newJob = event.data.data();
    if (!newJob) return null;

    try {
        console.log(`🚀 Processing Job: ${newJob.title}`);
        const blogUrl = `https://studygyaan.in/job/${event.params.jobId}`;
        
        // 1. Google Indexing
        await notifyGoogle(blogUrl);
        
        // 2. टेलीग्राम (HTML Format फिक्स & Token Check)
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; 
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; 

        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            const telegramMessage = `<b>🚨 New Govt Job Alert! 🚨</b>\n\n` +
                                   `📌 <b>Post:</b> ${newJob.title}\n` +
                                   `🏢 <b>Dept:</b> ${newJob.organization || 'Govt Dept'}\n` +
                                   `🎓 <b>Qualification:</b> ${newJob.qualification || 'Check Details'}\n` +
                                   `⏳ <b>Last Date:</b> ${newJob.lastDate || 'Apply Soon'}\n\n` +
                                   `📖 <b>पूरा विवरण यहाँ देखें:</b>\n${blogUrl}\n\n` +
                                   `🚀 <i>Join @studygyaan_official for fastest updates!</i>`;

            try {
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: TELEGRAM_CHAT_ID,
                    text: telegramMessage, 
                    parse_mode: 'HTML'
                });
                console.log("✅ Telegram Sent!");
            } catch (tgErr) {
                console.error("❌ Telegram Error:", tgErr.message);
            }
        } else {
            console.log("⚠️ TELEGRAM SKIPPED: Token or Chat ID not found.");
        }

        // 3. व्हाट्सएप
        const whatsappMessage = `🚨 *New Govt Job Alert!* 🚨\n\n📌 *Post:* ${newJob.title}\n🔗 *Full Details:* ${blogUrl}`;
        await axios.post(`http://34.58.150.88:3000/send-job`, { 
            targetId: "120363425475163322@newsletter", 
            messageText: whatsappMessage 
        }).catch(e => console.log("WhatsApp skip"));

        // 4. वीडियो इंजन (Duplicate Check के साथ)
        if (!newJob.videoSent) {
            const videoSuccess = await generateAndUploadVideo({ ...newJob, id: event.params.jobId });
            if (videoSuccess) {
                await admin.firestore().collection("jobs").doc(event.params.jobId).update({ videoSent: true });
            }
        }
    } catch (error) {
        console.error("❌ Trigger Error:", error.message);
    }
    return null;
});

/* ========================================== */
/* 3️⃣ GITHUB ACTIONS CLI RUNNER               */
/* ========================================== */

exports.runJobScraper = async () => {
    try {
        const count = await scrapeGovtJobsLogic();
        console.log(`🎯 Scraper Result: ${count} New jobs saved to job_drafts!`);
    } catch (error) {
        console.error("❌ Scraper Failed:", error.message);
    }
};