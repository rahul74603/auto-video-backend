"use strict";

/**
 * Admin SEO Intelligence APIs.
 * Auth: same article-admin middleware (Firebase ID token / agent token).
 * Never returns secrets. Never auto-publishes.
 */

const admin = require("firebase-admin");
const { authorizeArticleRequest } = require("../article_agents/article_auth");
const { runSeoIntelligence, GSC_DOC, SETTINGS_DOC, RECS } = require("./orchestrator");
const { normalizeGscRows, buildDashboard, redactSecrets } = require("./intelligence");
const { checkConnections, checkContentFreshness } = require("../seo_master_agent");

function fail(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

function ok(res, body) {
  return res.json({ success: true, ...body });
}

function createProtect(deps) {
  if (typeof deps.authMiddleware === "function") return deps.authMiddleware;
  return async function seoAuth(req, res, next) {
    const auth = await authorizeArticleRequest(req, {
      env: deps.env || process.env,
      verifyIdToken: deps.verifyIdToken
    });
    if (!auth.ok) return fail(res, auth.status || 401, auth.error || "Unauthorized");
    req.articleAdmin = auth;
    return next();
  };
}

async function loadLastRun(db) {
  try {
    const snap = await db.collection("system_settings").doc(SETTINGS_DOC).get();
    return snap.exists ? snap.data().lastRun || null : null;
  } catch {
    return null;
  }
}

async function loadRecommendations(db) {
  try {
    const snap = await db.collection(RECS).orderBy("priority", "desc").limit(30).get();
    return (snap.docs || []).map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch {
    try {
      const snap = await db.collection(RECS).limit(30).get();
      return (snap.docs || []).map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  }
}

function registerSeoIntelligenceRoutes(app, db, deps = {}) {
  const protect = createProtect(deps);

  app.post("/seo/intelligence/dashboard", protect, async (req, res) => {
    try {
      const [connections, freshness, lastRun, recommendations] = await Promise.all([
        checkConnections(db).catch(() => []),
        checkContentFreshness(db).catch(() => ({ ok: false, stats: {}, issues: [] })),
        loadLastRun(db),
        loadRecommendations(db)
      ]);
      const dashboard = buildDashboard({
        freshness,
        connections,
        lifecycle: lastRun?.lifecycle || {},
        gaps: (recommendations || []).filter((r) => r.kind === "CONTENT_GAP"),
        ctr: (recommendations || []).filter((r) => r.kind === "CTR"),
        recommendations,
        gsc: lastRun?.searchConsole,
        intelligence: lastRun
      });
      return ok(res, { dashboard: redactSecrets(dashboard) });
    } catch (error) {
      console.error("[seo/intelligence/dashboard]", error);
      return fail(res, 500, error.message);
    }
  });

  app.post("/seo/intelligence/recommendations", protect, async (req, res) => {
    try {
      const recommendations = await loadRecommendations(db);
      return ok(res, { recommendations: redactSecrets(recommendations) });
    } catch (error) {
      return fail(res, 500, error.message);
    }
  });

  app.post("/seo/intelligence/run", protect, async (req, res) => {
    try {
      const force = req.body?.force === true;
      const report = await runSeoIntelligence(db, admin.firestore.FieldValue, {
        force,
        maxJobs: Math.min(Number(req.body?.maxJobs) || 80, 150)
      });
      return ok(res, { report: redactSecrets(report) });
    } catch (error) {
      console.error("[seo/intelligence/run]", error);
      return fail(res, 500, error.message);
    }
  });

  app.post("/seo/intelligence/search-console/ingest", protect, async (req, res) => {
    try {
      const rows = normalizeGscRows(req.body?.rows || req.body?.data || []);
      if (!rows.length) return fail(res, 400, "Provide Search Console rows [{query,page,clicks,impressions,ctr,position}]");
      await db.collection("system_settings").doc(GSC_DOC).set(
        {
          rows,
          ingestedAt: new Date().toISOString(),
          ingestedBy: req.articleAdmin?.email || req.articleAdmin?.via || "admin",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      return ok(res, { ingested: rows.length });
    } catch (error) {
      return fail(res, 500, error.message);
    }
  });
}

module.exports = {
  registerSeoIntelligenceRoutes,
  createProtect
};
