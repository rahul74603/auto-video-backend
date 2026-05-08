const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const { google } = require("googleapis");
require("dotenv").config();

// =========================================================
// 🔐 1. FIREBASE & GOOGLE INDEXING AUTH
// =========================================================
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        try {
            const serviceAccount = JSON.parse(serviceAccountVar);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: "studymaterial-406ad"
            });
        } catch (e) {
            console.error("❌ Firebase Init Error:", e.message);
            admin.initializeApp();
        }
    } else {
        admin.initializeApp();
    }
}
const db = admin.firestore();

// =========================================================
// 🛠️ 2. SEO HELPERS (SLUG, INDEXING, LINKS)
// =========================================================

// ✅ Slug Generator
function createSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
}

// ✅ Google Indexing API (Auto Indexing)
async function notifyGoogle(url) {
    try {
        const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
        if (!serviceAccountVar) return;

        const key = JSON.parse(serviceAccountVar);
        const jwtClient = new google.auth.JWT(
            key.client_email,
            null,
            key.private_key,
            ["https://www.googleapis.com/auth/indexing"],
            null
        );

        await jwtClient.authorize();
        const response = await axios.post(
            "https://indexing.googleapis.com/v3/urlNotifications:publish",
            { url: url, type: "URL_UPDATED" },
            { headers: { Authorization: `Bearer ${jwtClient.credentials.access_token}` } }
        );
        console.log("🚀 Google Indexing Success:", url);
    } catch (err) {
        console.error("❌ Indexing Error:", err.message);
    }
}

// ✅ Internal Linking Engine (Blogs से लिंक उठाना)
async function getInternalLinks() {
    try {
        const snapshot = await db.collection("blogs")
            .orderBy("date", "desc")
            .limit(3)
            .get();

        let links = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            links.push(`<a href="https://studygyaan.in/blog/${data.slug || doc.id}">${data.title}</a>`);
        });
        return links.join(" | ");
    } catch (e) {
        return "StudyGyaan.in Free Study Material";
    }
}

const TOPICS_POOL = [
    "SSC CGL Tier-1: Full Mock Test (Math, Reasoning, English, GK)",
    "Railway RRB NTPC: Combined CBT-1 Level Paper",
    "SSC CHSL: Previous Year Based Full Mock",
    "UP Police Constable: Samanya Gyan aur Hindi Special",
    "Indian Constitution: Important Articles, Parts & Schedules",
    "Indian Geography: Rivers, Mountains, and National Parks",
    "Biology: Human Body, Vitamins, Diseases & Nutrition",
    "Physics: Units, Motion, Light, Sound & Electricity",
    "Math: Percentage, Profit, Loss & Discount",
    "Reasoning: Coding-Decoding & Letter Series",
    "Scientific Instruments and Discoveries",
    "Computer Basics: MS Office, Internet & Networking"
];

// =========================================================
// 🚀 3. MAIN ENGINE
// =========================================================
const generateDailyMocks = async () => {
    const randomTopic = TOPICS_POOL[Math.floor(Math.random() * TOPICS_POOL.length)];
    console.log(`🔥 SEO Generation Started: ${randomTopic}`);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        generationConfig: { maxOutputTokens: 8000, temperature: 0.4, responseMimeType: "application/json" },
    });

    // ✅ SEO Optimized Prompt
    const prompt = `
Act as a Senior SEO Expert and Paper Setter. 
Generate a HIGH-LEVEL Mock Test for: "${randomTopic}".

Format ONLY JSON:
{
  "seoTitle": "High CTR Title with Keywords",
  "metaDescription": "160 chars SEO description",
  "tags": ["keyword1", "keyword2"],
  "questions": [
    {
      "qText": "Hindi\\nEnglish",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctOption": 0,
      "qLogic": "Detailed explanation in Hindi & English"
    }
  ]
}
Generate exactly 25 bilingual questions.
`;

    try {
        const resp = await model.generateContent(prompt);
        const text = resp.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        let cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const json = JSON.parse(cleanedText);

        if (json.questions && Array.isArray(json.questions)) {
            
            // 🛠️ Data Sanitizer (Options Array Fix)
            const sanitizedQuestions = json.questions.map((q, index) => ({
                qText: q.qText || `Question ${index + 1}`,
                options: Array.isArray(q.options) ? q.options : ["A", "B", "C", "D"],
                correctOption: Number.isInteger(q.correctOption) ? q.correctOption : 0,
                qLogic: q.qLogic || "Explanation available on StudyGyaan.in"
            }));

            // 🛠️ SEO URL (Slug)
            const slug = createSlug(json.seoTitle || randomTopic);
            const testUrl = `https://studygyaan.in/test/${slug}`;

            // 🛠️ Internal Links Fetch
            const relatedLinks = await getInternalLinks();

            // 💾 Save to Firestore
            await db.collection("mock_tests").doc(slug).set({
                title: json.seoTitle || randomTopic,
                slug: slug,
                metaDescription: json.metaDescription || "Attempt free mock test.",
                tags: json.tags || ["mock test", "exam preparation"],
                questions: sanitizedQuestions,
                totalQuestions: sanitizedQuestions.length,
                durationMinutes: sanitizedQuestions.length,
                negativeMarking: 0.25,
                requestedTopic: randomTopic,
                type: "auto_generated",
                internalLinks: relatedLinks,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log("✅ Saved to Firestore with Slug:", slug);

            // 🌐 Auto Indexing
            await notifyGoogle(testUrl);

            // 📢 Telegram Notification
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const msg = `🚀 <b>New Live Mock Test!</b>\n\n📝 <b>Topic:</b> ${json.seoTitle}\n📊 <b>Q:</b> 25 Questions\n\n🔗 <b>Attempt Now:</b>\n<a href="${testUrl}">${testUrl}</a>\n\n📚 <b>Related:</b> ${relatedLinks}`;
                await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    chat_id: chatId,
                    text: msg,
                    parse_mode: 'HTML'
                });
                console.log("📢 Telegram Notification Sent!");
            }
            return true;
        }
    } catch (err) {
        console.error("❌ Auto-Mock Error:", err.message);
        return false;
    }
};

// ✅ Trigger
if (require.main === module) {
    generateDailyMocks().then(success => {
        process.exit(success ? 0 : 1);
    });
}
