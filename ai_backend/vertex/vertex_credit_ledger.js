"use strict";

/**
 * ============================================================================
 * 💰 Vertex AI Credit Ledger — ₹91,785 ($1,000) ko track + full use karne ka
 * ============================================================================
 * Is credit ka SACH isliye lagta hai ki ye Vertex AI Agent Builder SKUs pe hai.
 * Standard Gemini API (AI Studio) is credit ko NAHI kaat sakta. Isliye ledger
 * sirf Vertex AI calls (search / chat / grounding / ingestion) ko gaanta hai —
 * aur budget (default ₹91,785) se compare karke auto-stop karta hai.
 *
 * - recordSpend(type, meta): har Vertex call ka estimated ₹ spend ledger me.
 * - budgetLeft()           : kitna credit bacha.
 * - Firestore me 'vertex_credit_ledger' doc; Firestore na ho to local JSON.
 *   (runtime file .gitignore me hai — commit nahi hogi)
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const vc = require("./vertex_client");

const LEDGER_DOC = "governor";
const LOCAL_FILE = path.join(__dirname, "..", "credit_ledger_local.json");

const TYPE_RATES = {
  search: () => vc.config().costSearchInr,
  chat: () => vc.config().costChatInr,
  ground: () => vc.config().costGroundInr,
  ingest: (meta) => (meta?.docs || 0) * vc.config().costIngestInrPerDoc,
};

function getFirestore() {
  try {
    const admin = require("firebase-admin");
    if (!admin.apps.length) admin.initializeApp();
    return admin.firestore();
  } catch {
    return null;
  }
}

function readLocal() {
  try {
    if (fs.existsSync(LOCAL_FILE)) return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
  } catch { /* ignore */ }
  return { totalSpentInr: 0, runs: [] };
}
function writeLocal(data) {
  try { fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2)); } catch { /* ignore */ }
}

async function load() {
  const db = getFirestore();
  if (db) {
    try {
      const snap = await db.collection("vertex_credit_ledger").doc(LEDGER_DOC).get();
      if (snap.exists) return { source: "firestore", data: snap.data() };
      const blank = { totalSpentInr: 0, runs: [] };
      await db.collection("vertex_credit_ledger").doc(LEDGER_DOC).set(blank);
      return { source: "firestore", data: blank };
    } catch { /* fall through */ }
  }
  return { source: "local", data: readLocal() };
}

async function save(source, data) {
  if (source === "firestore") {
    const db = getFirestore();
    try { await db.collection("vertex_credit_ledger").doc(LEDGER_DOC).set(data, { merge: true }); return; } catch { /* fall */ }
  }
  writeLocal(data);
}

/**
 * Vertex AI usage record karta hai.
 * @param {'search'|'chat'|'ground'|'ingest'} type
 * @param {{docs?:number, ok?:boolean, note?:string, meta?:object}} meta
 */
async function recordSpend(type, meta = {}) {
  const { source, data } = await load();
  const rate = (TYPE_RATES[type] || (() => 0))(meta);
  const costInr = Math.round(rate * 100) / 100;
  data.totalSpentInr = Math.round((data.totalSpentInr + costInr) * 100) / 100;
  data.runs = data.runs || [];
  data.runs.push({
    type,
    at: new Date().toISOString(),
    costInr,
    ok: meta.ok !== false,
    note: meta.note || "",
    docs: meta.docs || 0,
  });
  if (data.runs.length > 500) data.runs = data.runs.slice(-500);
  await save(source, data);
  return { costInr, totalSpentInr: data.totalSpentInr, budgetInr: vc.config().creditBudgetInr };
}

/** Kitna credit bacha (₹). */
async function budgetLeft() {
  const { data } = await load();
  return Math.max(0, vc.config().creditBudgetInr - (data.totalSpentInr || 0));
}

/** Kya aur spend kar sakte hain (budget khatam ho to false → auto-stop). */
async function canSpend() {
  return (await budgetLeft()) > 0;
}

module.exports = { recordSpend, budgetLeft, canSpend, load, save };
