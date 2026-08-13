"use strict";

/**
 * ============================================================================
 * 🛣️ Vertex AI Agent Builder — HTTP routes (index.js me register hoti hain)
 * ============================================================================
 *  GET  /vertex/health   → config + credit-budget status (public, non-billing)
 *  POST /vertex/search   → grounded enterprise search (RAG)
 *  POST /vertex/chat     → conversational grounded assistant (multi-turn)
 *  POST /vertex/ingest   → Firestore → data store ingestion (ADMIN token)
 *  POST /vertex/status   → credit ledger (ADMIN token)
 *
 * Har billing call (search/chat/ingest) se pehle budget check hota hai —
 * ₹91,785 khatam hote hi auto-stop (over-spend nahi hoga).
 * ============================================================================
 */

const vc = require("./vertex_client");
const vrag = require("./vertex_rag");
const vasst = require("./vertex_assistant");
const ledger = require("./vertex_credit_ledger");
const ingest = require("./vertex_ingest");
const vq = require("./vertex_questions");
const admin = require("firebase-admin");
// Browser-admin calls sign in with Firebase; ye helper uske ID token ko
// verify karta hai (AGENT_ADMIN_TOKEN bhi maanta hai trusted tooling ke liye).
const { createArticleAuthMiddleware } = require("../agents/article_agents/article_auth");

async function registerVertexRoutes(app, db) {
  // Admin-only guard: signed-in Firebase admin (ID token) ya AGENT_ADMIN_TOKEN.
  const adminGuard = createArticleAuthMiddleware(admin.auth());
  // --- Health / budget (public, no billing) ---
  app.get("/vertex/health", async (req, res) => {
    try {
      const status = vc.describeStatus();
      const left = await ledger.budgetLeft();
      return res.json({
        success: true,
        vertex: status,
        credit: { budgetInr: status.creditBudgetInr, leftInr: left },
        note: "Ye credit Vertex AI Agent Builder (₹91,785) pe chalta hai — standard Gemini API isko nahi kaata.",
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- Grounded search ---
  app.post("/vertex/search", async (req, res) => {
    try {
      if (!(await ledger.canSpend())) return res.status(402).json({ success: false, error: "Vertex AI credit budget exhausted (₹91,785)." });
      const out = await vrag.search({ query: req.body?.query, pageSize: Number(req.body?.pageSize) || 5, filter: req.body?.filter });
      await ledger.recordSpend("search", { ok: true });
      return res.json({ success: true, ...out });
    } catch (e) {
      return res.status(e.code === "BAD_REQUEST" ? 400 : e.code === vc.VERTEX_CODES.NOT_CONFIGURED ? 501 : 500)
        .json({ success: false, error: e.message, code: e.code });
    }
  });

  // --- Conversational assistant ---
  app.post("/vertex/chat", async (req, res) => {
    try {
      if (!(await ledger.canSpend())) return res.status(402).json({ success: false, error: "Vertex AI credit budget exhausted (₹91,785)." });
      const out = await vasst.chat({ message: req.body?.message, conversationId: req.body?.conversationId });
      await ledger.recordSpend("chat", { ok: true });
      return res.json({ success: true, ...out });
    } catch (e) {
      return res.status(e.code === "BAD_REQUEST" ? 400 : e.code === vc.VERTEX_CODES.NOT_CONFIGURED ? 501 : 500)
        .json({ success: false, error: e.message, code: e.code });
    }
  });

  // --- Ingestion (admin) ---
  app.post("/vertex/ingest", adminGuard, async (req, res) => {
    try {
      if (!(await ledger.canSpend())) return res.status(402).json({ success: false, error: "Vertex AI credit budget exhausted (₹91,785)." });
      const { collection, dryRun, limit } = req.body || {};
      const result = collection
        ? await ingest.ingestCollection(db, collection, { limit, dryRun })
        : await ingest.ingestAll(db, { limit, dryRun });
      const imported = Array.isArray(result)
        ? result.reduce((a, r) => a + (r.imported || 0), 0)
        : (result.imported || 0);
      if (!dryRun) await ledger.recordSpend("ingest", { ok: true, docs: imported });
      return res.json({ success: true, ...(Array.isArray(result) ? { summary: result } : result), imported });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message, code: e.code });
    }
  });

  // --- RAG-grounded question set generator (admin) ---
  app.post("/vertex/generate-questions", adminGuard, async (req, res) => {
    try {
      if (!(await ledger.canSpend())) return res.status(402).json({ success: false, error: "Vertex AI credit budget exhausted (₹91,785)." });
      const out = await vq.generateQuestions({
        topic: req.body?.topic,
        exam: req.body?.exam,
        totalQuestions: Number(req.body?.totalQuestions) || 25,
        pageSize: Number(req.body?.pageSize) || 8,
        save: req.body?.save !== false,
      });
      return res.json(out);
    } catch (e) {
      return res.status(e.code === "BAD_REQUEST" ? 400 : e.code === vc.VERTEX_CODES.NOT_CONFIGURED ? 501 : 500)
        .json({ success: false, error: e.message, code: e.code });
    }
  });

  // --- RAG-grounded question set from user-uploaded PDF/text (admin) ---
  app.post("/vertex/generate-from-source", adminGuard, async (req, res) => {
    try {
      if (!(await ledger.canSpend()) && vc.isConfigured()) {
        return res.status(402).json({ success: false, error: "Vertex AI credit budget exhausted (₹91,785)." });
      }
      const out = await vq.generateFromSource({
        title: req.body?.title,
        exam: req.body?.exam,
        sourceText: req.body?.sourceText,
        totalQuestions: Number(req.body?.totalQuestions) || 25,
        pageSize: Number(req.body?.pageSize) || 6,
        save: req.body?.save !== false,
      });
      return res.json(out);
    } catch (e) {
      return res.status(e.code === "BAD_REQUEST" ? 400 : e.code === vc.VERTEX_CODES.NOT_CONFIGURED ? 501 : 500)
        .json({ success: false, error: e.message, code: e.code });
    }
  });

  // --- Credit status (admin) ---
  app.get("/vertex/status", adminGuard, async (req, res) => {
    const { source, data } = await ledger.load();
    return res.json({ success: true, source, credit: vc.describeStatus(), spentInr: data.totalSpentInr, runs: data.runs });
  });
}

module.exports = { registerVertexRoutes };
