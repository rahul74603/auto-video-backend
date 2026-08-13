"use strict";

/**
 * ============================================================================
 * 📝 RAG-GROUNDED QUESTION SET GENERATOR (Vertex AI Search + Grounding)
 * ============================================================================
 * Aapka ₹91,785 Vertex AI Agent Builder credit STANDARD Gemini API (AI Studio)
 * pe NAHI lagta. Lekin yahan hum ise SACH me lagate hain:
 *
 *   1. Vertex AI Search se source material (syllabus / previous papers / notes)
 *      se relevant chunks RETRIEVE karte hain  →  (is sku pe billing = credit)
 *   2. Un retrieved chunks se GROUNDED questions generate karte hain.
 *
 * Isliye har question-set ki retrieval Vertex credit consume karti hai, aur
 * questions real content se aate hain (hallucination nahi).
 *
 * Result `mock_tests` collection me save hota hai — wahi premium mock-test
 * section jo site pe already hai. (Koi existing data overwrite nahi hota.)
 * ============================================================================
 */

const vc = require("./vertex_client");
const vrag = require("./vertex_rag");
const ledger = require("./vertex_credit_ledger");

// Generative model — sirf retrieved content ko format/translate karne ke liye.
// (Ye Gemini call khud credit nahi khaati; asli Vertex billing search/retrieval
//  me hai. Retrieval bina model ke hi grounded corpus se answers la sakta hai.)
function getGenModel() {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({
    model: process.env.AI_AGENT_MODEL || "gemini-2.5-flash-lite",
    generationConfig: { temperature: 0.3, maxOutputTokens: 8000, responseMimeType: "application/json" },
  });
}

function parseJson(text) {
  const clean = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(clean.slice(s, e + 1)); } catch { return null; }
}

function shuffleAnswers(questions) {
  // correctOption ko har sawal ke liye organic distribute karo (0..options.length-1)
  let idx = 0;
  return (questions || []).map((q) => {
    const n = (q.options && q.options.length) || 4;
    const correctOption = idx % n;
    idx += 1 + Math.floor(Math.random() * n);
    return { ...q, correctOption };
  });
}

/**
 * Model se grounded questions generate karke JSON return karta hai.
 * @returns {Promise<{json:object, title:string, questions:Array, sourcesCount:number}>}
 */
async function generateGroundedJson({ title, topic, exam, sourceChunks, totalQuestions }) {
  const prompt = `
Act as a Senior Paper Setter for Indian Competitive Exams (SSC CGL, Railway RRB, Banking, UPSC).
Generate EXACTLY ${totalQuestions} HIGH-LEVEL, UNIQUE, bilingual (English + Hindi) questions.

IMPORTANT: Questions SIRF niche diye gaye SOURCE MATERIAL se based hone chahiye.
Source me jo facts hain unhi se questions banao. Koi bahar ka / hallucinated fact mat daalo.

Topic/Exam: "${topic}${exam ? " (" + exam + ")" : ""}"

SOURCE MATERIAL:
${sourceChunks.map((s, i) => `[${i + 1}] ${s}`).join("\n\n")}

Return ONLY valid JSON:
{
  "title": "string",
  "questions": [
    { "qText": "English question\\nHindi question", "options": ["A", "B", "C", "D"], "correctOption": 0, "qLogic": "English\\nHindi explanation (from source)" }
  ]
}
`;

  let json = null;
  for (let attempt = 0; attempt < 3 && !json; attempt += 1) {
    try {
      const resp = await getGenModel().generateContent(prompt);
      json = parseJson(resp.response?.text?.());
    } catch { /* retry */ }
  }
  if (!json || !Array.isArray(json.questions) || json.questions.length === 0) {
    const err = new Error("Question generation failed to return valid JSON.");
    err.code = "GEN_FAILED";
    throw err;
  }
  const questions = shuffleAnswers(json.questions).slice(0, totalQuestions);
  const finalTitle = json.title || title || `${topic}${exam ? " - " + exam : ""} Mock Test`;
  return { json, title: finalTitle, questions };
}

/** Text ko chunk karo (roughly 1500 chars per chunk) taaki clean source bane. */
function chunkText(text, size = 1500) {
  const t = String(text || "").trim();
  if (!t) return [];
  const parts = [];
  let i = 0;
  while (i < t.length) { parts.push(t.slice(i, i + size)); i += size; }
  return parts;
}

async function saveMockTest(db, payload) {
  const docRef = await db.collection("mock_tests").add({
    title: payload.title,
    questions: payload.questions,
    totalQuestions: payload.questions.length,
    durationMinutes: payload.questions.length,
    negativeMarking: payload.negativeMarking ?? 0.25,
    requestedTopic: payload.requestedTopic || payload.title,
    exam: payload.exam || "",
    source: payload.source || "vertex-rag",
    grounded: true,
    sourceText: payload.sourceText ? payload.sourceText.slice(0, 500) : "",
    createdAt: new Date(),
  });
  return docRef.id;
}

/**
 * Source material se grounded questions generate karta hai.
 * @param {{topic:string, exam?:string, totalQuestions?:number, pageSize?:number, save?:boolean}} input
 */
async function generateQuestions({ topic, exam, totalQuestions = 25, pageSize = 8, save = false } = {}) {
  if (!topic || !String(topic).trim()) {
    const err = new Error("topic required");
    err.code = "BAD_REQUEST";
    throw err;
  }
  if (!vc.isConfigured()) {
    const err = new Error("Vertex AI not configured. Set VERTEX_PROJECT_ID & VERTEX_DATA_STORE_ID.");
    err.code = vc.VERTEX_CODES.NOT_CONFIGURED;
    throw err;
  }

  const searchQuery = `${exam ? exam + " " : ""}${topic} syllabus previous year questions`;
  const retrieval = await vrag.search({ query: searchQuery, pageSize });
  await ledger.recordSpend("search", { ok: true, note: `question-set retrieval: ${topic}` });

  const sources = (retrieval.answers || []).map((a) => a.snippet || a.extractiveAnswer).filter(Boolean).slice(0, pageSize);
  if (sources.length === 0) {
    const err = new Error("Data store me is topic ka koi source material nahi mila. Pehle source content ingest karo (vertex:ingest).");
    err.code = "NO_SOURCE";
    throw err;
  }

  const { title, questions } = await generateGroundedJson({
    title: `${topic}${exam ? " - " + exam : ""} Mock Test`,
    topic, exam, sourceChunks: sources, totalQuestions,
  });

  if (save) {
    const db = vc.firestore();
    const id = await saveMockTest(db, { title, questions, requestedTopic: topic, exam });
    return { success: true, id, title, count: questions.length, sources: retrieval.total };
  }

  return { success: true, title, questions, count: questions.length, sources: retrieval.total };
}

/**
 * USER-UPLOADED PDF / TEXT se grounded question set banata hai (existing ko nahi todta).
 *
 * Ye uploaded source ko:
 *   1. Vertex data store me INGEST karta hai (document ingestion SKU = ₹ credit) — par
 *      agar Vertex configured nahi hai to gracefully text se hi chalta hai (koi crash nahi).
 *   2. Usi source text se GROUNDED questions generate karta hai (hallucination nahi).
 *   3. `mock_tests` collection me save karta hai → Mock Test Library me turant dikhta hai.
 *
 * @param {{title:string, exam?:string, sourceText:string, totalQuestions?:number, pageSize?:number, save?:boolean}} input
 */
async function generateFromSource({ title, exam, sourceText, totalQuestions = 25, pageSize = 6, save = false } = {}) {
  const cleanText = String(sourceText || "").trim();
  if (!cleanText) {
    const err = new Error("sourceText required — PDF/text content bhejo");
    err.code = "BAD_REQUEST";
    throw err;
  }
  if (cleanText.length < 200) {
    const err = new Error(`Source text bahut chhota hai (${cleanText.length} chars). Kam se kam 200 characters chahiye.`);
    err.code = "BAD_REQUEST";
    throw err;
  }
  const topic = String(title || "").trim() || "Practice Set";

  // Vertex available ho to uploaded source ko data store me ingest karo (credit) —
  // nahi to gracefully skip (koi crash nahi).
  let ingested = 0;
  let usedVertex = false;
  if (vc.isConfigured()) {
    try {
      const docs = chunkText(cleanText).map((chunk, i) =>
        vrag.toVertexDocument({ id: `source-${Date.now()}-${i}`, title: `${topic} (source ${i + 1})`, url: "", content: chunk })
      );
      const r = await vrag.importDocuments(docs);
      ingested = r.imported || 0;
      usedVertex = ingested > 0;
      if (usedVertex) await ledger.recordSpend("ingest", { ok: true, docs: ingested, note: `uploaded source: ${topic}` });
    } catch (e) {
      console.warn("Ingest uploaded source failed (non-fatal):", e.message);
      usedVertex = false;
    }
  }

  // Grounded generation — source text ko directly use karte hain (reliable).
  const chunks = chunkText(cleanText, 2500).slice(0, pageSize + 2);
  const { title: finalTitle, questions } = await generateGroundedJson({
    title: `${topic}${exam ? " - " + exam : ""} Mock Test`,
    topic, exam, sourceChunks: chunks, totalQuestions,
  });

  if (save) {
    const db = vc.firestore();
    const id = await saveMockTest(db, {
      title: finalTitle,
      questions,
      requestedTopic: topic,
      exam,
      source: usedVertex ? "vertex-rag-upload" : "upload-grounded",
      sourceText: cleanText.slice(0, 400),
    });
    return { success: true, id, title: finalTitle, count: questions.length, ingested, usedVertex, via: "source" };
  }

  return { success: true, title: finalTitle, questions, count: questions.length, ingested, usedVertex, via: "source" };
}

module.exports = { generateQuestions, generateFromSource, chunkText };
