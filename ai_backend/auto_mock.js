const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
// ⚠️ googleapis ko top-level require MAT karo — auto-mocktest workflow me ye
// package kabhi install hi nahi hota tha, jisse MODULE_NOT_FOUND crash hota tha
// aur EK BHI mock test nahi banta tha. Lazy require + graceful skip (neeche).
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
// 🛠️ 2. SEO HELPERS
// =========================================================

function createSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
}

async function notifyGoogle(url) {
    let google;
    try {
        google = require("googleapis").google;
    } catch {
        console.log("ℹ️ googleapis package nahi hai — Google Indexing ping skip (test ban gaya hai).");
        return;
    }
    try {
        const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
        if (!serviceAccountVar) return;
        const key = JSON.parse(serviceAccountVar);
        const jwtClient = new google.auth.JWT({
            email: key.client_email,
            key: key.private_key.replace(/\\n/g, '\n'),
            scopes: ["https://www.googleapis.com/auth/indexing"]
        });
        await jwtClient.authorize();
        await axios.post(
            "https://indexing.googleapis.com/v3/urlNotifications:publish",
            { url: url, type: "URL_UPDATED" },
            { headers: { "Authorization": `Bearer ${jwtClient.credentials.access_token}`, "Content-Type": "application/json" } }
        );
        console.log("🚀 Google Indexing Success:", url);
    } catch (err) {
        console.error("❌ Indexing Error:", err.message);
    }
}

async function getInternalLinks() {
    try {
        const snapshot = await db.collection("blogs").orderBy("date", "desc").limit(3).get();
        let links = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            links.push(`<a href="https://studygyaan.in/blog/${data.slug || doc.id}">${data.title}</a>`);
        });
        return links.join(" | ");
    } catch (e) { return "StudyGyaan.in Free Exam Preparation"; }
}

// =========================================================
// 📚 3. MASSIVE 3-YEAR TOPICS POOL (500+ Topics)
// =========================================================
const TOPICS_POOL = [
    // --- MATHEMATICS (Arithmetic & Advance) ---
    "Number System: Unit Digit, Remainder Theorem & Factors", "HCF & LCM: Bell Problems and Ratio Based Questions", "Simplification: BODMAS, Fractions & Surds Indices", "Algebra: Linear Equations & Algebraic Identities", "Polynomials: Roots, Remainder and Factor Theorem", "Trigonometry: Ratios, Standard Angles & Identities", "Height and Distance: Angle of Elevation and Depression", "Geometry: Lines, Angles and Triangle Properties", "Geometry: Circle, Tangents and Chord Properties", "Mensuration 2D: Triangle, Quadrilateral and Circle Area", "Mensuration 3D: Sphere, Cone, Cylinder & Prism", "Percentage: Election, Income-Expenditure & Population", "Profit and Loss: Dishonest Seller & Marked Price Logic", "Discount: Successive Discount & Equivalent Rate", "Simple Interest: Installments & Rate of Interest Logic", "Compound Interest: Difference between SI & CI for 2/3 Years", "Ratio and Proportion: Coin Problems and Proportional Logic", "Partnership: Profit Distribution and Investment Ratio", "Average: Batting-Bowling Average & Replacement Problems", "Problems on Ages: Ratio and Year Based Calculations", "Mixture and Allegation: Replacement and Pure Liquid Ratio", "Time and Work: Alternate Days and Efficiency Based", "Pipe and Cistern: Leakage and Alternate Opening Logic", "Time, Speed & Distance: Relative Speed and Train Length", "Boats and Streams: Upstream and Downstream Speed", "Probability: Coins, Dice and Playing Cards Special", "Statistics: Mean, Median, Mode and Range Basic",

    // --- GENERAL SCIENCE (Physics, Chemistry, Biology) ---
    "Physics: SI Units, Dimensions and Measuring Devices", "Mechanics: Newton's Laws, Friction and Circular Motion", "Work, Energy and Power: Kinetic and Potential Energy", "Gravitation: Escape Velocity and Satellite Motion", "Properties of Matter: Elasticity, Viscosity and Surface Tension", "Heat and Thermodynamics: Scales and Laws of Cooling", "Sound: Ultrasonic, Doppler Effect and Echo", "Light: Reflection, Refraction and Human Eye Defects", "Electricity: Ohm's Law, Resistance and Heating Effect", "Magnetism: Earth's Magnetism and Electromagnetic Induction", "Modern Physics: Radioactivity, X-Rays and Nuclear Fusion", "Chemistry: Atomic Structure and Quantum Numbers", "Chemical Bonding: Ionic, Covalent and Metallic Bonds", "Acids, Bases and Salts: pH Scale and Common Indicators", "Metals and Non-Metals: Extraction and Ore Properties", "Periodic Table: Trends, Blocks and Discovery History", "Organic Chemistry: Hydrocarbons, Functional Groups & Polymers", "Environmental Chemistry: Green House Effect and Acid Rain", "Biology: Cell Structure, Cell Division and Organelles", "Botany: Plant Classification and Tissue Systems", "Plant Physiology: Photosynthesis and Transpiration", "Genetics: Mendel's Laws, DNA and RNA Structure", "Human Body: Digestive System and Enzyme Action", "Human Body: Respiratory and Circulatory System", "Human Body: Nervous System and Brain Functions", "Human Body: Endocrine System and Hormones", "Skeletal and Muscular System: Bones and Joint Types", "Human Health and Diseases: Virus, Bacteria & Fungi", "Vitamins and Minerals: Deficiency and Sources",

    // --- INDIAN HISTORY (Ancient, Medieval, Modern) ---
    "Ancient: Indus Valley Civilization and Sites", "Ancient: Vedic Culture and Early Aryan Life", "Ancient: Jainism and Buddhism Sects and Teachings", "Ancient: Mahajanapadas and Rise of Magadha", "Ancient: Maurya Empire: Chandragupta and Ashoka", "Ancient: Post-Mauryan Kingdoms: Kushanas and Satvahanas", "Ancient: Gupta Empire: Art, Science and Golden Age", "Ancient: Vardhana Dynasty and Harshavardhana Era", "Medieval: Early Arab Invasions and Ghazni-Ghori", "Medieval: Delhi Sultanate: Slave and Khalji Dynasty", "Medieval: Delhi Sultanate: Tughlaq, Sayyid and Lodi", "Medieval: Bhakti and Sufi Movement Saints", "Medieval: Mughal Empire: Babur to Humayun Era", "Medieval: Akbar's Administration and Religious Policy", "Medieval: Jahangir, Shah Jahan and Aurangzeb Era", "Medieval: Maratha Empire: Shivaji and Peshwa History", "Medieval: Vijayanagara and Bahmani Kingdoms", "Modern: Arrival of Europeans and East India Company", "Modern: Governor Generals and Important Reforms", "Modern: Revolt of 1857: Leaders and Centers", "Modern: Social-Religious Reforms: Arya & Brahmo Samaj", "Modern: Indian National Congress: Sessions and Leaders", "Modern: Partition of Bengal and Swadeshi Movement", "Modern: Gandhian Era: Non-Cooperation and Civil Disobedience", "Modern: Revolutionary Movements and Azad Hind Fauj", "Modern: Mountbatten Plan and Indian Independence Act",

    // --- GEOGRAPHY (Indian & World) ---
    "Indian Geography: Location, Frontiers and Neighbors", "Physical Features: Himalayas and Northern Plains", "Physical Features: Peninsular Plateau and Coastal Plains", "River Systems: Indus, Ganga and Brahmaputra", "River Systems: Peninsular Rivers and Lakes", "Climate: Indian Monsoon and Seasons", "Soils: Classification and Distribution in India", "Natural Vegetation: Forests and Wildlife Parks", "Agriculture: Major Crops and Green Revolution", "Minerals: Coal, Iron Ore and Petroleum Centers", "Industries: Iron, Steel and Textile Hubs", "Transport: Roads, Railways and Major Ports", "World: Solar System and Planetary Facts", "World: Latitudes, Longitudes and Time Zones", "World: Interior of Earth and Earthquake Belts", "World: Volcanoes, Mountains and Plateaus", "World: Atmosphere Layers and Wind Patterns", "World: Oceans, Currents and Salinity", "World: Major Continents and Important Countries", "World: Famous Rivers, Lakes and Deserts",

    // --- POLITY & CONSTITUTION ---
    "Polity: Framing of Constitution and Preamble", "Polity: Fundamental Rights and Article 12-35", "Polity: Directive Principles (DPSP) and Duties", "Polity: President: Election, Powers and Impeachment", "Polity: Vice-President and Prime Minister Logic", "Polity: Parliament: Lok Sabha and Rajya Sabha Rules", "Polity: Supreme Court and High Court Jurisdiction", "Polity: Governor and State Legislature Powers", "Polity: Panchayati Raj and Municipalities (73rd/74th)", "Polity: Constitutional and Non-Constitutional Bodies", "Polity: Emergency Provisions and Major Amendments",

    // --- REASONING, ENGLISH & COMPUTER ---
    "Reasoning: Syllogism and Logical Venn Diagrams", "Reasoning: Blood Relations and Family Tree Special", "Reasoning: Coding-Decoding: Mixed and Chinese Pattern", "Reasoning: Direction Sense and Distance Problems", "Reasoning: Sitting Arrangement: Circular and Linear", "Reasoning: Puzzles: Day, Floor and Box Based", "Reasoning: Non-Verbal: Mirror and Water Images", "Reasoning: Mathematical Operations and Inequalities", "English: Sentence Correction and Error Spotting", "English: Idioms and Phrases for Competitive Exams", "English: One Word Substitution: High Frequency List", "English: Synonyms and Antonyms (SSC/Banking Special)", "Computer: Generations, Hardware and Memory Units", "Computer: OS, MS Word and Shortcut Keys", "Computer: Networking, Internet and Cyber Security", "Static GK: Famous Temples, Festivals and Folk Dances", "Static GK: International Headquarters and Summits", "Static GK: Sports Cups, Trophies and Terminology"
];

// =========================================================
// 🛠️ 3b. GENERATION HELPERS (reliability fixes, Oct 2026)
// =========================================================

// Admin panel (Mock Test tab → AI Generate) se aaye on-demand requests.
// Admin request likhta hai → Firestore mock_test_requests me pending row →
// ye workflow next run me sabse pehle usi topic par test banata hai.
async function takePendingMockRequest() {
    try {
        // NOTE: orderBy जानबूझकर nahi — where+orderBy combo ko composite index
        // chahiye hota, bina index query fail hogi aur request kabhi pick nahi
        // hogi. Single-field where me koi index nahi chahiye; oldest khud chuno.
        const snap = await db.collection("mock_test_requests")
            .where("status", "==", "pending")
            .limit(10)
            .get();
        if (snap.empty) return null;
        const toMs = (v) => {
            if (!v) return Number.MAX_SAFE_INTEGER;
            if (typeof v.toMillis === "function") { try { return v.toMillis(); } catch { return Number.MAX_SAFE_INTEGER; } }
            if (typeof v.seconds === "number") return v.seconds * 1000;
            const parsed = Date.parse(v);
            return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
        };
        const ordered = (snap.docs || []).slice().sort((a, b) => {
            const da = a.data() || {};
            const db2 = b.data() || {};
            return toMs(da.createdAt) - toMs(db2.createdAt);
        });
        const docSnap = ordered[0];
        const data = docSnap.data() || {};
        await docSnap.ref.update({
            status: "processing",
            pickedAt: admin.firestore.FieldValue.serverTimestamp(),
            pickedBy: process.env.GITHUB_RUN_ID ? `gh-${process.env.GITHUB_RUN_ID}` : "local",
        });
        return { id: docSnap.id, ref: docSnap.ref, ...data };
    } catch (err) {
        // Collection/index missing → normal random-topic path (kabhi fail nahi).
        console.log("ℹ️ mock_test_requests check skip:", err.message);
        return null;
    }
}

async function markMockRequest(ref, patch) {
    try {
        await ref.update({ ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } catch (err) {
        console.warn("⚠️ mock request status update skip:", err.message);
    }
}

// Slug collision guard: same-month same-title dobara aaye to overwrite NAHI,
// -2/-3 suffix lagao (pehle purana test silently replace ho jata tha).
async function uniqueMockSlug(baseSlug) {
    let slug = baseSlug;
    for (let attempt = 2; attempt <= 8; attempt += 1) {
        const snap = await db.collection("mock_tests").doc(slug).get();
        if (!snap.exists) return slug;
        slug = `${baseSlug}-${attempt}`;
    }
    return `${baseSlug}-${Date.now().toString(36)}`;
}

// Gemini response se JSON nikalo: seedha parse → {…} extract → repair.
function parseMockJson(rawText) {
    const text = String(rawText || "");
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim()
        .replace(/\\(?![\"\\/bfnrtu])/g, " / "); // अवैध बैकस्लैश फिक्स
    const attempts = [cleaned];
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) attempts.push(cleaned.slice(first, last + 1));
    let lastError = null;
    for (const candidate of attempts) {
        try {
            return { ok: true, json: JSON.parse(candidate) };
        } catch (err) {
            lastError = err;
        }
    }
    return { ok: false, error: lastError, preview: cleaned.slice(0, 300) };
}

// Har question validate + normalize karo (video renderer + frontend dono ke liye).
// correctOption: 0-3 int, "A"-"D" letter, ya "Option B" text — sab accept.
function normalizeMockQuestions(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const qText = String(item.qText || item.questionText || "").trim();
        let options = Array.isArray(item.options) ? item.options.map((o) => String(o ?? "").trim()) : [];
        options = options.filter((o) => o.length > 0);
        if (!qText || options.length < 2) continue;
        while (options.length < 4) options.push("—");
        options = options.slice(0, 4);

        let correct = 0;
        const rawCorrect = item.correctOption;
        if (typeof rawCorrect === "number" && Number.isFinite(rawCorrect)) {
            correct = Math.max(0, Math.min(3, Math.floor(rawCorrect)));
        } else {
            const s = String(rawCorrect ?? "").toUpperCase().replace("OPTION", "").trim();
            if (["A", "B", "C", "D"].includes(s)) correct = s.charCodeAt(0) - 65;
            else if (["0", "1", "2", "3"].includes(s)) correct = Number(s);
            else {
                const idx = options.findIndex((o) => o.toUpperCase() === s);
                correct = idx >= 0 ? idx : 0;
            }
        }
        out.push({
            qText,
            options,
            correctOption: correct,
            qLogic: String(item.qLogic || item.explanation || ""),
        });
    }
    return out;
}

function buildMockPrompt(topic, totalQuestions) {
    return `
Act as a Senior SEO Expert. Create a unique Mock Test for: "${topic}".
MANDATORY: Return ONLY JSON compliance schema.
{
  "seoTitle": "Engaging Title (Use Keywords like 'Important', 'Top Questions', 'Practice Set')",
  "metaDescription": "160 char SEO snippet about ${topic}",
  "tags": ["exam", "mock test", "prep"],
  "questions": [
    {
      "qText": "Write the complete English question here\\\\nWrite the complete Hindi translation here",
      "options": ["Option A Text", "Option B Text", "Option C Text", "Option D Text"],
      "correctOption": 2,
      "qLogic": "Detailed explanation in Hindi & English"
    }
  ]
}
CRITICAL RULES FOR GENERATION:
1. In "qText", you MUST provide the English question first, followed by a literal newline (\\\\n), followed by the Hindi translation. Do NOT include literal placeholder words like 'Hindi' or 'English' inside the text. Write actual exam questions.
2. "correctOption" MUST be an integer (0 for A, 1 for B, 2 for C, 3 for D). You MUST dynamically shuffle and randomly distribute correct options across all ${totalQuestions} questions so that they are NOT all 0 (A). Ensure a completely organic and even distribution of A, B, C, and D answers across the entire set.
Generate exactly ${totalQuestions} high-quality, completely bilingual questions.
`;
}

// Model fallback chain: 2.5-flash-lite missing/dead ho to 2.0-flash try karo.
// Pehle single model 404 deta to poora run fail ho jata tha.
const MOCK_MODEL_CHAIN = ["gemini-2.5-flash-lite", "gemini-2.0-flash"];

async function generateMockContent(genAI, prompt) {
    let lastError = null;
    for (const modelName of MOCK_MODEL_CHAIN) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { maxOutputTokens: 8000, temperature: 0.4, responseMimeType: "application/json" },
            });
            const resp = await model.generateContent(prompt);
            const text = resp.response?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text || !text.trim()) throw new Error("empty Gemini response");
            console.log(`🤖 Model OK: ${modelName}`);
            return text;
        } catch (err) {
            lastError = err;
            console.warn(`⚠️ Model ${modelName} fail (${err.message}) — next try...`);
        }
    }
    throw lastError || new Error("All Gemini models failed");
}

// =========================================================
// 🚀 4. MAIN ENGINE
// =========================================================

const generateDailyMocks = async () => {
    // तारीख निकालना ताकि यूनिक टाइटल बने
    const now = new Date();
    const monthYear = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    const dayStamp = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).replace(/\s+/g, '');

    // 1️⃣ Pehle admin ka on-demand request (agar koi pending hai).
    // Manual workflow_dispatch `topic` input sabse upar (turant test chahiye to).
    const manualTopic = String(process.env.MOCK_MANUAL_TOPIC || "").trim();
    const request = manualTopic ? null : await takePendingMockRequest();
    let randomTopic;
    let totalQuestions = 25;
    let requestCategory = "";
    if (manualTopic) {
        randomTopic = manualTopic.slice(0, 150);
        console.log(`⌨️ Manual workflow topic: ${randomTopic}`);
    } else if (request) {
        const exam = String(request.exam || "").trim();
        const category = String(request.category || "").trim();
        const custom = String(request.topic || "").trim();
        randomTopic = custom || [category, exam].filter(Boolean).join(" - ") || "General Knowledge";
        totalQuestions = Math.max(5, Math.min(50, Number(request.totalQuestions) || 25));
        requestCategory = category;
        console.log(`📥 Admin request mila (${request.id}): ${randomTopic} × ${totalQuestions}Q`);
    } else {
        randomTopic = TOPICS_POOL[Math.floor(Math.random() * TOPICS_POOL.length)];
    }
    console.log(`🔥 SEO Generation Started: ${randomTopic}`);

    if (!process.env.GEMINI_API_KEY) {
        const msg = "GEMINI_API_KEY secret missing — mock test nahi ban sakta";
        console.error("❌", msg);
        if (request) await markMockRequest(request.ref, { status: "failed", error: msg });
        return false;
    }
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const prompt = buildMockPrompt(randomTopic, totalQuestions);


    try {
        const text = await generateMockContent(genAI, prompt);
        const parsed = parseMockJson(text);
        if (!parsed.ok) {
            throw new Error(`Gemini JSON parse fail: ${parsed.error?.message || "unknown"} | preview: ${parsed.preview}`);
        }
        const json = parsed.json;
        const questions = normalizeMockQuestions(json.questions);
        if (!questions.length) {
            throw new Error("Gemini ne 0 valid questions diye — next run me dobara try hoga");
        }
        if (questions.length < totalQuestions) {
            console.log(`ℹ️ ${questions.length}/${totalQuestions} valid questions mile — inhi se test ban raha hai`);
        }

        // ✅ UNIQUE TITLE & SLUG LOGIC (Canonical समस्या का समाधान)
        const baseTitle = json.seoTitle || randomTopic;
        const finalTitle = `${baseTitle} - ${monthYear} Special Set`; // Example: SSC GK - May 2026 Special Set
        const slug = await uniqueMockSlug(`${createSlug(finalTitle)}-${dayStamp.toLowerCase()}`);
        const testUrl = `https://studygyaan.in/test/${slug}`;

        const relatedLinks = await getInternalLinks();
        const metaDescription = json.metaDescription || `Free Practice Set for ${randomTopic}.`;

        // 💾 Firestore Update (unique slug as Document ID — overwrite kabhi nahi)
        await db.collection("mock_tests").doc(slug).set({
            title: finalTitle,
            slug: slug,
            metaDescription,
            tags: json.tags || ["mock test", "studygyaan"],
            questions: questions,
            totalQuestions: questions.length,
            durationMinutes: Math.max(10, questions.length),
            negativeMarking: 0.25,
            requestedTopic: randomTopic,
            requestedBy: request ? "admin-request" : "auto-schedule",
            requestId: request ? request.id : null,
            subject: requestCategory || "General Knowledge",
            type: "auto_generated",
            internalLinks: relatedLinks,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log("✅ Mock Saved with Unique Slug:", slug);
        if (request) {
            await markMockRequest(request.ref, { status: "completed", testSlug: slug, questionCount: questions.length });
            console.log(`📥 Request ${request.id} completed → /test/${slug}`);
        }

            // ⭐ Auto-optimizer: fire-and-forget quality pass after publish.
            // MOCK_TEST is metadata-only by design; optimizer failure NEVER
            // blocks the publish.
            try {
                const { triggerOptimizerNonBlocking } = require("./agents/seo_intelligence/publish_hook");
                triggerOptimizerNonBlocking(db, admin.firestore.FieldValue, {
                    id: slug, slug, title: finalTitle, type: "MOCK_TEST",
                    metaDescription,
                    questions, totalQuestions: questions.length,
                    internalLinks: relatedLinks,
                    createdAt: new Date().toISOString()
                }, "mock_tests");
            } catch (optErr) {
                console.warn("⚠️ Optimizer hook skipped (non-blocking):", optErr.message);
            }

            // 🌐 Google Indexing
            await notifyGoogle(testUrl);

            // 📢 Telegram
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const msg = `🚀 <b>New Live Mock Test (${monthYear})</b>\n\n📝 <b>Topic:</b> ${finalTitle}\n📊 <b>Q:</b> ${questions.length} High Level\n\n🔗 <b>Start Test Now:</b>\n<a href="${testUrl}">${testUrl}</a>\n\n📚 <b>Related Content:</b> ${relatedLinks}`;
                await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    chat_id: chatId, text: msg, parse_mode: 'HTML'
                });
                console.log("📢 Telegram Notification Sent!");
            }
            return true;
    } catch (err) {
        console.error("❌ Auto-Mock Error:", err.message);
        if (request) await markMockRequest(request.ref, { status: "failed", error: String(err.message || err).slice(0, 500) });
        return false;
    }
};

module.exports = {
    generateDailyMocks,
    normalizeMockQuestions,
    parseMockJson,
    buildMockPrompt,
    createSlug,
    MOCK_MODEL_CHAIN,
};

if (require.main === module) {
    generateDailyMocks().then(success => {
        process.exit(success ? 0 : 1);
    });
}
