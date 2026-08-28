"use strict";

/**
 * Auto-Optimizer Admin Routes.
 *
 * Endpoints:
 *   POST /seo/auto-optimizer/backfill       — run backfill batch (dry-run by default)
 *   POST /seo/auto-optimizer/optimize       — optimize a single page
 *   POST /seo/auto-optimizer/new-content    — process newly published content
 *   POST /seo/auto-optimizer/status         — get optimizer status
 *   POST /seo/auto-optimizer/progress       — get backfill progress
 *
 * Auth: same article-admin middleware (Firebase ID token / agent token).
 * Never auto-applies Level B/C. Never invents facts.
 */

const admin = require("firebase-admin");
const { authorizeArticleRequest } = require("../article_agents/article_auth");
const { createSeoLimiters } = require("./rate_limit");
const {
  runBackfill,
  autoOptimizePage,
  processNewContent,
  getOptimizerStatus
} = require("./auto_optimizer");
const { runBackfillBatch, getBackfillProgress, countProcessedPages } = require("./backfill_processor");
const { scorePage, classifyQuality } = require("./content_quality_scorer");

function fail(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

function ok(res, body) {
  return res.json({ success: true, ...body });
}

function createProtect(deps) {
  if (typeof deps.authMiddleware === "function") return deps.authMiddleware;
  return async function autoOptimizerAuth(req, res, next) {
    const auth = await authorizeArticleRequest(req, {
      env: deps.env || process.env,
      verifyIdToken: deps.verifyIdToken
    });
    if (!auth.ok) return fail(res, auth.status || 401, auth.error || "Unauthorized");
    req.articleAdmin = auth;
    return next();
  };
}

function registerAutoOptimizerRoutes(app, db, deps = {}) {
  const protect = createProtect(deps);
  const { readLimit, runLimit } = createSeoLimiters(deps);

  /**
   * POST /seo/auto-optimizer/backfill
   * Run backfill batch. Default: dry-run.
   * Body: { batchSize?, maxBatches?, dryRun?, collections? }
   */
  app.post("/seo/auto-optimizer/backfill", runLimit, protect, async (req, res) => {
    try {
      const dryRun = req.body?.dryRun !== false; // default: dry-run
      const batchSize = Math.min(20, Number(req.body?.batchSize) || 10);
      const maxBatches = Math.min(5, Number(req.body?.maxBatches) || 1);
      const collections = Array.isArray(req.body?.collections) ? req.body.collections : undefined;

      const report = await runBackfill(db, admin.firestore.FieldValue, {
        dryRun,
        batchSize,
        maxBatches,
        collections
      });

      return ok(res, { report });
    } catch (error) {
      console.error("[seo/auto-optimizer/backfill]", error);
      return fail(res, 500, error.message);
    }
  });

  /**
   * POST /seo/auto-optimizer/optimize
   * Optimize a single page. Returns quality score + proposals.
   * Body: { contentId, collection }
   */
  app.post("/seo/auto-optimizer/optimize", readLimit, protect, async (req, res) => {
    try {
      const contentId = String(req.body?.contentId || "").trim();
      const collectionName = String(req.body?.collection || "").trim();
      if (!contentId || !collectionName) {
        return fail(res, 400, "contentId and collection are required");
      }

      const snap = await db.collection(collectionName).doc(contentId).get();
      const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      if (!exists) return fail(res, 404, "Document not found");

      const data = typeof snap.data === "function" ? snap.data() : {};
      const doc = { id: contentId, collection: collectionName, ...data };

      const result = await autoOptimizePage(db, admin.firestore.FieldValue, doc, {
        dryRun: true,
        actor: req.articleAdmin?.email || req.articleAdmin?.via || "admin"
      });

      return ok(res, { result });
    } catch (error) {
      console.error("[seo/auto-optimizer/optimize]", error);
      return fail(res, 500, error.message);
    }
  });

  /**
   * POST /seo/auto-optimizer/new-content
   * Process newly published content.
   * Body: { contentId, collection }
   */
  app.post("/seo/auto-optimizer/new-content", readLimit, protect, async (req, res) => {
    try {
      const contentId = String(req.body?.contentId || "").trim();
      const collectionName = String(req.body?.collection || "").trim();
      if (!contentId || !collectionName) {
        return fail(res, 400, "contentId and collection are required");
      }

      const snap = await db.collection(collectionName).doc(contentId).get();
      const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      if (!exists) return fail(res, 404, "Document not found");

      const data = typeof snap.data === "function" ? snap.data() : {};
      const doc = { id: contentId, collection: collectionName, ...data };

      const result = await processNewContent(db, admin.firestore.FieldValue, doc, {
        actor: req.articleAdmin?.email || req.articleAdmin?.via || "admin"
      });

      return ok(res, { result });
    } catch (error) {
      console.error("[seo/auto-optimizer/new-content]", error);
      return fail(res, 500, error.message);
    }
  });

  /**
   * POST /seo/auto-optimizer/status
   * Get optimizer status.
   */
  app.post("/seo/auto-optimizer/status", readLimit, protect, async (req, res) => {
    try {
      const status = await getOptimizerStatus(db);
      return ok(res, { status });
    } catch (error) {
      console.error("[seo/auto-optimizer/status]", error);
      return fail(res, 500, error.message);
    }
  });

  /**
   * POST /seo/auto-optimizer/progress
   * Get backfill progress.
   */
  app.post("/seo/auto-optimizer/progress", readLimit, protect, async (req, res) => {
    try {
      const progress = await getBackfillProgress(db);
      const counts = await countProcessedPages(db);
      return ok(res, { progress, counts });
    } catch (error) {
      console.error("[seo/auto-optimizer/progress]", error);
      return fail(res, 500, error.message);
    }
  });
}

module.exports = {
  registerAutoOptimizerRoutes
};
