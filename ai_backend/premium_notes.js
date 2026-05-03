require("dotenv").config();
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { VertexAI } = require("@google-cloud/vertexai");

// ✅ GitHub Secrets + Firebase Compatible Initialization
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

const vertex_ai = new VertexAI({
    project: "studymaterial-406ad",
    location: "us-central1"
});

exports.generatePremiumNote = onRequest(
{
    cors: true,
    timeoutSeconds: 540,
    memory: "2GiB",
    // ✅ Secrets add kiye gaye hain
    secrets: ["SERVICE_ACCOUNT_JSON"]
},
async (req, res) => {

    // ===== FORCE CORS =====
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (req.method === "OPTIONS") {
        return res.status(204).send("");
    }

    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method Not Allowed"
        });
    }

    // ===== SAFE BODY PARSE =====
    let body = req.body || {};

    if (typeof body === "string") {
        try {
            body = JSON.parse(body);
        } catch {
            body = {};
        }
    }

    const topic = body.topic;
    const packId = body.packId;
    const folderId = body.folderId || null;
    const currentSet = Number(body.setNumber) || 1;

    if (!topic || !packId) {
        return res.status(400).json({
            success: false,
            error: "Topic and packId are required!"
        });
    }

    try {

        // ===== FETCH PREVIOUS CONTENT (ANTI DUPLICATE) =====
        const previousSnapshot = await db.collection("courses")
            .doc(packId)
            .collection("content")
            .where("topic", "==", topic)
            .get();

        let previousContent = "";

        previousSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.content) {
                previousContent += data.content.substring(0, 8000) + "\n\n";
            }
        });

        const model = vertex_ai.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 4096
            }
        });

        // AI Prompt
        const prompt = `
Act as a Defence Exam Question Paper Setter (NDA/CDS/AFCAT level).

Generate a HARD LEVEL REAL EXAM practice set for: "${topic}"

🛑 STRICT CATEGORY RULES 🛑
Analyze the topic: "${topic}". 
➤ IF THE TOPIC IS GK, GS, Current Affairs, History, Polity, Geography, etc.:
  - You MUST ONLY generate the 25-Question Table.
  - DO NOT generate the "Important Formulas" section.
  - DO NOT generate the "Step-by-Step Solutions" section.
  - Just output the HTML table.
➤ IF THE TOPIC IS Math, Quantitative Aptitude, Reasoning:
  - You MUST generate all 3 parts: 1) Formulas, 2) Table, 3) Short Logic Solutions.

================ CONTENT STRUCTURE ================

1️⃣ PART 1: IMPORTANT CONCEPTS (ONLY FOR MATH/REASONING)
<h2>🚀 Important Formulas & Key Concepts</h2>
- Provide ONLY 4 to 5 clean, short formulas or logical tricks.
- MUST use clean HTML <ul> and <li> tags. No long paragraphs.
- No special symbols. English + हिंदी (Devanagari).

---------------------------------------

2️⃣ PART 2: QUESTION TABLE (FOR ALL SUBJECTS)
<table border="1" cellspacing="0" cellpadding="8" width="100%">
<tr>
<th>Sr. No.</th>
<th>Question (English / हिंदी)</th>
<th>Answer (English / हिंदी)</th>
</tr>

Generate EXACTLY 25 questions.
Each question must test DIFFERENT advanced concept.
No repetition. No basic pattern.
Close table properly.

---------------------------------------

3️⃣ PART 3: SHORT SOLUTIONS (ONLY FOR MATH/REASONING)
<h2>🧠 Step-by-Step Logic</h2>
- Provide logic for ALL 25 questions. Number them 1 to 25.
- CRISP & SHORT bullet points ONLY. NO LONG PARAGRAPHS.
- Use clean HTML layout (e.g., <b>Q1 Logic:</b> ...<br>).
- English + हिंदी (Devanagari).

=======================================

ANTI-DUPLICATION:
- Do NOT repeat any previous pattern.
- Do NOT reuse same series logic.
- Do NOT reuse same coding pattern.

PREVIOUS CONTENT (DO NOT REPEAT):
${previousContent}

=======================================

Return EXACTLY in this format:

FILE_NAME:
${topic} - Master Class Set ${currentSet}

CONTENT_HTML:
<only clean inner HTML>

Nothing else.
`;

        const result = await model.generateContent(prompt);

        const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error("Empty AI response");
        }

        // ===== SAFE EXTRACTION =====
        const fileNameMatch = text.match(/FILE_NAME:\s*(.*)/);
        const contentMatch = text.match(/CONTENT_HTML:\s*([\s\S]*)/);

        if (!fileNameMatch || !contentMatch) {
            console.error("Invalid AI format:", text);
            throw new Error("AI format invalid");
        }

        const fileName = fileNameMatch[1].trim();
        let contentHTML = contentMatch[1].trim();

        // ===== CLEAN WRAPPERS =====
        contentHTML = contentHTML
            .replace(/<!DOCTYPE[^>]*>/gi, "")
            .replace(/<html[^>]*>/gi, "")
            .replace(/<\/html>/gi, "")
            .replace(/<body[^>]*>/gi, "")
            .replace(/<\/body>/gi, "")
            .trim();

        if (contentHTML.length < 1500) {
            throw new Error("AI returned too short content");
        }

        // ===== SAVE TO FIRESTORE =====
        const docRef = await db.collection("courses")
            .doc(packId)
            .collection("content")
            .add({
                title: fileName,
                seoTitle: `${topic} Premium Notes - StudyGyaan`,
                type: "article",
                content: contentHTML,
                parentId: folderId,
                setNumber: currentSet,
                topic: topic,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

        console.log("✅ Saved:", docRef.id);

        return res.json({
            success: true,
            id: docRef.id,
            message: "Premium Note Generated Successfully"
        });

    } catch (err) {
        console.error("🔥 ERROR:", err);
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});