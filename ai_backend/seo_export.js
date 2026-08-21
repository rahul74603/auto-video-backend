"use strict";

/**
 * Spark-safe Cloud Functions entrypoint.
 *
 * Exports HTTP SEO functions that the "Deploy Firebase Functions Only"
 * workflow updates. No scheduled jobs, no Firestore triggers, no Secret
 * Manager bindings — all of those need Blaze/EventArc and would make the
 * CI deploy die with "Extensions require the Blaze plan".
 *
 * Firestore auto-indexing triggers (onIndexPing_*) live in index.js for
 * Blaze deploys. On Spark, use:
 *   1. The `pingIndexNow` HTTP endpoint below (call it from your publish flow),
 *   2. The daily google_indexing.yml GitHub Action (submits sitemap + IndexNow),
 *   3. Or upgrade to Blaze and deploy index.js (full automation).
 */

const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

setGlobalOptions({
  maxInstances: 10,
  timeoutSeconds: 300,
  memory: "1GiB",
});

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const handleMetaTags = require("./server_seo_renderer").createServerSeoHandler({
  db,
  renderWebStory: (req, res) => require("./web_stories").renderWebStory(req, res),
});

const proxySeoFunction = (name) =>
  onRequest({ memory: "512MiB", timeoutSeconds: 300 }, (req, res) => {
    return require("./seo_functions")[name](req, res);
  });

exports.serverSideMetaTags = onRequest({ memory: "1GiB" }, (req, res) => handleMetaTags(req, res));

exports.rssFeed = onRequest(
  { memory: "1GiB" },
  (req, res) => require("./newsFeed").rssFeed(req, res)
);

exports.generateSitemapIndex = proxySeoFunction("generateSitemapIndex");
exports.generateSitemapMain = proxySeoFunction("generateSitemapMain");
exports.generateSitemapBlogs = proxySeoFunction("generateSitemapBlogs");
exports.generateSitemapJobs = proxySeoFunction("generateSitemapJobs");
exports.generateSitemapTests = proxySeoFunction("generateSitemapTests");
exports.generateSitemapStories = proxySeoFunction("generateSitemapStories");
exports.generateSitemapUpdates = proxySeoFunction("generateSitemapUpdates");
exports.generateSitemapNews = proxySeoFunction("generateSitemapNews");
exports.generateSitemapCourses = proxySeoFunction("generateSitemapCourses");
exports.generateSitemapMaterials = proxySeoFunction("generateSitemapMaterials");
exports.generateSitemap = proxySeoFunction("generateSitemap");
exports.generateRss = proxySeoFunction("generateRss");

// ============================================================
// 🚀 MANUAL/IMMEDIATE INDEX PING (HTTP endpoint)
// ============================================================
// Usage: GET /pingIndexNow?url=https://studygyaan.in/job/xyz
//        or POST with JSON { "urls": ["https://...", "..."] }
// Works on Spark plan (no Firestore trigger/EventArc required).
// Apne publish flow me is endpoint ko simple GET/POST se call karo
// — naya page publish hote hi Bing/Yandex/Seznam turant notify ho jayega.
// Google Indexing API bhi chali jayegi agar SERVICE_ACCOUNT_JSON available ho
// (aur /job/ URLs ke liye hi — non-job URLs skip ho jati hain).
exports.pingIndexNow = onRequest(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (req, res) => {
    try {
      const urlParam = String(req.query.url || req.body?.url || "").trim();
      const urlsParam = req.query.urls || req.body?.urls;
      const urls = [];
      if (urlParam) urls.push(urlParam);
      if (Array.isArray(urlsParam)) urls.push(...urlsParam.filter(Boolean));
      if (!urls.length) {
        return res.status(400).json({
          success: false,
          error: "Pass ?url=... or ?urls[]=... query params (or JSON body {urls:[...]})"
        });
      }
      // Only allow studygyaan.in URLs (open redirect/abuse se bachao)
      const valid = urls.filter((u) => {
        try {
          const p = new URL(u);
          return p.hostname === "studygyaan.in" || p.hostname.endsWith(".studygyaan.in");
        } catch {
          return false;
        }
      });
      if (!valid.length) {
        return res.status(400).json({ success: false, error: "Only studygyaan.in URLs allowed" });
      }
      const booster = require("./indexing_booster");
      // Submit to all 4 IndexNow endpoints (api.indexnow.org, Bing, Seznam, Yandex)
      const indexNowResult = await booster.submitToAllIndexNow(valid);
      // Also ping sitemaps + WebSub
      const sitemapPings = await booster.pingAllSitemaps().catch(() => []);
      const websub = await booster.publishWebSub().catch(() => []);
      // Google Indexing API (for /job/ URLs only) — only if SA JSON available
      let googleResult = { skipped: "no-service-account" };
      if (process.env.SERVICE_ACCOUNT_JSON) {
        try {
          const { notifyGoogle } = require("./auto_indexer");
          const jobUrls = valid.filter((u) => new URL(u).pathname.startsWith("/job/"));
          let ok = 0, fail = 0;
          for (const u of jobUrls.slice(0, 100)) {
            try { await notifyGoogle(u); ok++; } catch { fail++; }
          }
          googleResult = { attempted: jobUrls.length, accepted: ok, failed: fail };
        } catch (e) {
          googleResult = { skipped: "error", error: e.message };
        }
      }
      return res.json({ success: true, indexNow: indexNowResult, google: googleResult, sitemapPings, websub });
    } catch (e) {
      console.error("pingIndexNow error:", e);
      return res.status(500).json({ success: false, error: e.message });
    }
  }
);

// ============================================================
// 🚀 BULK INDEX SUBMIT (saare public URLs ko ek baar me submit karo)
// ============================================================
// GET /bulkIndexNow — Firestore se saare published URLs nikal ke
// 4 IndexNow endpoints + sitemap ping + WebSub pe submit karta hai.
// Deploy ke baad ek baar is endpoint ko hit karo — saare existing URLs
// turant search engines ko mil jayenge (10k/day free, ~10k URLs cover ho jate hain).
exports.bulkIndexNow = onRequest(
  { memory: "1GiB", timeoutSeconds: 300 },
  async (req, res) => {
    try {
      const max = Math.min(Number(req.query.max) || 2000, 5000);
      const booster = require("./indexing_booster");
      const report = await booster.bulkSubmitAllUrls({ maxPerCollection: max });
      return res.json({ success: true, ...report });
    } catch (e) {
      console.error("bulkIndexNow error:", e);
      return res.status(500).json({ success: false, error: e.message });
    }
  }
);

// Internal links JSON endpoint — crawlers/sitemaps ke liye latest published URLs
// GET /recent-urls.json — last 50 URLs ka structured list (crawl budget boost)
exports.recentUrls = onRequest(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (req, res) => {
    try {
      const booster = require("./indexing_booster");
      const links = await booster.fetchRecentInternalLinks({ force: req.query.refresh === "1" });
      res.set("Cache-Control", "public, max-age=300, s-maxage=600");
      res.set("Content-Type", "application/json; charset=utf-8");
      return res.json(links);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
);

// Simple URL list endpoint (plain text, crawler-friendly)
// GET /recent-urls.txt — har line pe ek URL, simple crawlers ke liye
exports.recentUrlsTxt = onRequest(
  { memory: "512MiB", timeoutSeconds: 60 },
  async (req, res) => {
    try {
      const booster = require("./indexing_booster");
      const all = await booster.fetchAllPublicUrls({ maxPerCollection: 1000 });
      const lines = all.map((u) => u.url).join("\n");
      res.set("Cache-Control", "public, max-age=600, s-maxage=1800");
      res.set("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send(lines);
    } catch (e) {
      return res.status(500).send(e.message);
    }
  }
);
