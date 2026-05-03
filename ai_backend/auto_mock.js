const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { VertexAI } = require("@google-cloud/vertexai");
const axios = require("axios");
require("dotenv").config();

// ✅ Initialize Admin using SERVICE_ACCOUNT_JSON from Environment Variables
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: "studymaterial-406ad"
        });
    } else {
        admin.initializeApp();
    }
}
const db = admin.firestore();

const vertex_ai = new VertexAI({
    project: "studymaterial-406ad",
    location: "us-central1",
});

const model = vertex_ai.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: { maxOutputTokens: 8000, temperature: 0.4, responseMimeType: "application/json" },
});

const TOPICS_POOL = [
    // --- 1. EXAM SPECIAL MIXED (Full Syllabus) ---
    "SSC CGL Tier-1: Full Mock Test (Math, Reasoning, English, GK)",
    "Railway RRB NTPC: Combined CBT-1 Level Paper",
    "SSC CHSL: Previous Year Based Full Mock",
    "UP Police Constable: Samanya Gyan aur Hindi Special",
    "Delhi Police: Computer + GK + Reasoning Mix",
    "SSC GD Constable: Full Syllabus Practice Set",
    "Railway Group D: Science & Math Focused Paper",
    "Bihar State Exams: Special History & Static GK Mock",
    "IBPS/SBI Clerk: Quantitative Aptitude & Reasoning Mix",

    // --- 2. GENERAL KNOWLEDGE (Static & Dynamic) ---
    "Indian Constitution: Important Articles, Parts & Schedules",
    "Modern Indian History: 1857 Revolt to Independence Era",
    "Ancient India: Indus Valley, Vedic Period & Maurya Empire",
    "Medieval India: Delhi Sultanate & Mughal Empire",
    "Indian Geography: Rivers, Mountains, and National Parks",
    "World Geography: Continents, Oceans & Solar System",
    "Indian Economy: Five Year Plans, RBI & Banking Terms",
    "Art & Culture: Classical Dances, Festivals & Awards",
    "Famous Personalities, Books, and Authors (History to Now)",
    "List of Firsts in India: Male, Female & Technology",

    // --- 3. GENERAL SCIENCE (Everyday Science) ---
    "Biology: Human Body, Vitamins, Diseases & Nutrition",
    "Physics: Units, Motion, Light, Sound & Electricity",
    "Chemistry: Periodic Table, Chemical Formulas & Metals",
    "Environment & Ecology: Pollution, Climate Change & Summits",
    "Scientific Instruments and Discoveries",
    "Space & Defense: ISRO, DRDO & Missile Systems of India",

    // --- 4. MATHEMATICS (Arithmetic & Advance) ---
    "Math: Number System, HCF & LCM",
    "Math: Percentage, Profit, Loss & Discount",
    "Math: Simple Interest & Compound Interest",
    "Math: Ratio, Proportion, and Partnership",
    "Math: Time, Work, and Pipe & Cistern",
    "Math: Time, Speed, Distance & Train Problems",
    "Math: Average, Age Problems & Mixture Allegation",
    "Advance Math: Geometry & Mensuration (2D/3D)",
    "Advance Math: Algebra & Trigonometry Basics",
    "Data Interpretation (DI): Pie Chart & Bar Graph Special",

    // --- 5. REASONING (Logical Ability) ---
    "Reasoning: Coding-Decoding & Letter Series",
    "Reasoning: Blood Relations & Direction Sense",
    "Reasoning: Syllogism (Statement & Conclusion)",
    "Reasoning: Calendar, Clock & Dice Problems",
    "Reasoning: Sitting Arrangement & Ranking",
    "Reasoning: Non-Verbal (Image, Mirror & Paper Folding)",
    "Reasoning: Analogy and Classification (Odd One Out)",

    // --- 6. CURRENT AFFAIRS & COMPUTER (Generic) ---
    "Current Affairs: Last 6 Months Sports & Appointments",
    "Current Affairs: Government Schemes & New Portals",
    "Computer Basics: MS Office, Internet & Networking",
    "Computer History: Generations, Hardware & Shortcut Keys",
    "General English: Grammatical Errors & Fillers",
    "General English: Synonyms, Antonyms & One Word Substitution"
];

/* ================= SCHEDULED FUNCTION (1 Test Every 3 Hours) ================= */
exports.generateDailyMocks = onSchedule({
    // 🕒 यह दिन में 5 बार चलेगा: सुबह 9:00, दोपहर 12:00, 3:00, शाम 6:00, और रात 9:00
    schedule: "0 9,12,15,18,21 * * *", 
    timeZone: "Asia/Kolkata",
    memory: "2GiB",
    timeoutSeconds: 540,
    // ✅ Secrets add kiye gaye hain taaki logic leak na ho
    secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "SERVICE_ACCOUNT_JSON"]
}, async (event) => {
    
    // 1. रैंडम एक टॉपिक चुनना
    const randomTopic = TOPICS_POOL[Math.floor(Math.random() * TOPICS_POOL.length)];
    
    console.log(`🚀 Starting Scheduled Mock Generation for: ${randomTopic}`);

    const prompt = `
Act as a Senior Paper Setter for Indian Competitive Exams.
Generate EXACTLY 25 UNIQUE and HIGH-LEVEL questions for the topic: "${randomTopic}".
Language: Bilingual (Hindi\\nEnglish).
Format: JSON with "questions" array containing qText, options, correctOption, and qLogic.
`;

    try {
        const resp = await model.generateContent(prompt);
        const text = resp.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        // JSON साफ़ करने के लिए हेल्पर (जैसा index.js में था)
        let cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const json = JSON.parse(cleanedText);

        if (json.questions && json.questions.length > 0) {
            // 2. Firestore में सेव करना
            const docRef = await db.collection("mock_tests").add({
                title: `Daily Live: ${randomTopic}`,
                questions: json.questions,
                totalQuestions: json.questions.length,
                durationMinutes: json.questions.length,
                negativeMarking: 0.25,
                requestedTopic: randomTopic,
                type: "auto_generated",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log("✅ Auto Mock Saved:", docRef.id);

            // 3. 📢 Telegram Alert
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const testUrl = `https://studygyaan.in/test/${docRef.id}`;
                const msg = `🔔 <b>नया लाइव मॉक टेस्ट तैयार है!</b>\n\n📝 <b>Topic:</b> ${randomTopic}\n📊 <b>Sawal:</b> 25 High Level\n\n👇 <b>अभी टेस्ट शुरू करें:</b>\n<a href="${testUrl}">${testUrl}</a>\n\n🚀 <i>Join @studygyaan_official for more!</i>`;

                await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    chat_id: chatId,
                    text: msg,
                    parse_mode: 'HTML'
                });
                console.log("📢 Telegram Notification Sent!");
            }
        }
    } catch (err) {
        console.error("❌ Auto-Mock Error:", err.message);
    }
});