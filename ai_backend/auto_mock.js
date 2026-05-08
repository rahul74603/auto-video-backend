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
// 🚀 4. MAIN ENGINE
// =========================================================

const generateDailyMocks = async () => {
    // तारीख निकालना ताकि यूनिक टाइटल बने
    const now = new Date();
    const monthYear = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    
    const randomTopic = TOPICS_POOL[Math.floor(Math.random() * TOPICS_POOL.length)];
    console.log(`🔥 SEO Generation Started: ${randomTopic}`);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        generationConfig: { maxOutputTokens: 8000, temperature: 0.4, responseMimeType: "application/json" },
    });

    const prompt = `
Act as a Senior SEO Expert. Create a unique Mock Test for: "${randomTopic}".
MANDATORY: Return ONLY JSON.
{
  "seoTitle": "Engaging Title (Use Keywords like 'Important', 'Top Questions', 'Practice Set')",
  "metaDescription": "160 char SEO snippet about ${randomTopic}",
  "tags": ["exam", "mock test", "prep"],
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
            
            // ✅ UNIQUE TITLE & SLUG LOGIC (Canonical समस्या का समाधान)
            const baseTitle = json.seoTitle || randomTopic;
            const finalTitle = `${baseTitle} - ${monthYear} Special Set`; // Example: SSC GK - May 2026 Special Set
            const slug = createSlug(finalTitle);
            const testUrl = `https://studygyaan.in/test/${slug}`;

            const relatedLinks = await getInternalLinks();

            // 💾 Firestore Update (Slug as Document ID prevents duplicates)
            await db.collection("mock_tests").doc(slug).set({
                title: finalTitle,
                slug: slug,
                metaDescription: json.metaDescription || `Free Practice Set for ${randomTopic}.`,
                tags: json.tags || ["mock test", "studygyaan"],
                questions: json.questions,
                totalQuestions: json.questions.length,
                durationMinutes: json.questions.length,
                negativeMarking: 0.25,
                requestedTopic: randomTopic,
                type: "auto_generated",
                internalLinks: relatedLinks,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log("✅ Mock Saved with Unique Slug:", slug);

            // 🌐 Google Indexing
            await notifyGoogle(testUrl);

            // 📢 Telegram
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const msg = `🚀 <b>New Live Mock Test (${monthYear})</b>\n\n📝 <b>Topic:</b> ${finalTitle}\n📊 <b>Q:</b> 25 High Level\n\n🔗 <b>Start Test Now:</b>\n<a href="${testUrl}">${testUrl}</a>\n\n📚 <b>Related Content:</b> ${relatedLinks}`;
                await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    chat_id: chatId, text: msg, parse_mode: 'HTML'
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

if (require.main === module) {
    generateDailyMocks().then(success => {
        process.exit(success ? 0 : 1);
    });
}
