"use strict";

/**
 * ============================================================================
 * 📊 USAGE & BILLING LOGGER — har AI/cloud call ka spend track karo
 * ============================================================================
 * Har Generative AI / Vertex / TTS call ka approximate ₹ spend log karta hai.
 * Har service alag category me — taaki aap dekh sako "kahan kitna paisa".
 *
 * Categories (billing ka hisaab):
 *   vertex_search   → Vertex AI Agent Builder Search  (₹91,785 credit pe)
 *   vertex_chat     → Vertex conversational           (₹91,785 credit pe)
 *   vertex_ingest   → Vertex document ingestion        (₹91,785 credit pe)
 *   gemini          → Gemini API (AI Studio) — ALAG billing
 *   tts             → Google Cloud Text-to-Speech      — ALAG billing
 *   indexing        → Google Indexing API (free)
 *   firestore       → Firebase (free tier/paid)
 *
 * Storage: Firestore `usage_monitor` doc + local JSON fallback.
 * (Local file gitignored hai — runtime data, commit nahi hota.)
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const vc = require("../vertex/vertex_client");

const LOCAL_FILE = path.join(__dirname, "..", "usage_monitor_local.json");

// Approx ₹ per call — apne actual Cloud Billing se calibrate karo.
const RATES = {
  vertex_search: 0.02,    // ₹ per search query
  vertex_chat: 0.05,      // ₹ per conversational turn
  vertex_ingest: 0.005,   // ₹ per doc ingested
  vertex_questions: 0.03, // ₹ per question-set retrieval
  gemini_mock: 0.02,
  gemini_blog: 0.03,
  gemini_jobs: 0.02,
  gemini_article: 0.05,
  gemini_premium: 0.08,
  gemini_other: 0.02,
  tts: 0.01,
  indexing: 0,
  firestore: 0,
};

function load() {
  try {
    if (fs.existsSync(LOCAL_FILE)) return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
  } catch { /* ignore */ }
  return { totalSpentInr: 0, byCategory: {}, byDay: {}, calls: [] };
}

function save(data) {
  try { fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2)); } catch { /* ignore */ }
}

/**
 * Ek call log karo.
 * @param {string} category — RATES ki ek key (ya custom)
 * @param {{costInr?:number, note?:string, calls?:number, meta?:object}} opts
 */
async function logUsage(category, opts = {}) {
  const costPerCall = opts.costInr != null ? opts.costInr : (RATES[category] || 0.01);
  const calls = opts.calls || 1;
  const costInr = Math.round(costPerCall * calls * 100) / 100;
  const day = new Date().toISOString().slice(0, 10);

  let data = load();
  data.totalSpentInr = Math.round((data.totalSpentInr + costInr) * 100) / 100;
  data.byCategory[category] = Math.round(((data.byCategory[category] || 0) + costInr) * 100) / 100;
  data.byDay[day] = Math.round(((data.byDay[day] || 0) + costInr) * 100) / 100;
  data.calls.push({ category, at: new Date().toISOString(), costInr, calls, note: opts.note || "" });
  if (data.calls.length > 500) data.calls = data.calls.slice(-500);

  save(data);

  // Firestore me bhi (best-effort) — taaki admin panel / deploy pe bhi dikhe.
  const fsDB = vc.firestore();
  if (fsDB) {
    try {
      await fsDB.collection("usage_monitor").doc("summary").set(
        { totalSpentInr: data.totalSpentInr, byCategory: data.byCategory, updatedAt: new Date() },
        { merge: true }
      );
    } catch { /* ignore */ }
  }
  return { costInr, totalSpentInr: data.totalSpentInr };
}

async function summary() {
  const data = load();
  return {
    totalSpentInr: data.totalSpentInr,
    byCategory: data.byCategory,
    byDay: data.byDay,
    calls: data.calls,
  };
}

module.exports = { logUsage, summary, RATES };
