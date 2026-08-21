"use strict";

/**
 * Spark-safe Cloud Functions entrypoint — ALL v1 functions (GCF 1st gen).
 * V1 functions Spark (free) plan pe 100% free chalte hain — koi Blaze nahi chahiye.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const runWith = { memory: "1GB", timeoutSeconds: 300, maxInstances: 10 };
const runWithSmall = { memory: "256MB", timeoutSeconds: 30, maxInstances: 10 };
const runWithMed = { memory: "512MB", timeoutSeconds: 60, maxInstances: 10 };

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const handleMetaTags = require("./server_seo_renderer").createServerSeoHandler({
  db,
  renderWebStory: (req, res) => require("./web_stories").renderWebStory(req, res),
});

const httpsFunc = (opts, handler) =>
  functions.runWith(opts).https.onRequest((req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).send("");
    return handler(req, res);
  });

const proxySeoFunction = (name, opts) =>
  httpsFunc(opts || runWithMed, (req, res) => require("./seo_functions")[name](req, res));

exports.serverSideMetaTags = httpsFunc(runWith, (req, res) => handleMetaTags(req, res));
exports.rssFeed = httpsFunc(runWith, (req, res) => require("./newsFeed").rssFeed(req, res));

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
exports.generateSitemap = proxySeoFunction("generateSitemap", runWith);
exports.generateRss = proxySeoFunction("generateRss");

exports.pingIndexNow = httpsFunc(runWithSmall, async (req, res) => {
  try {
    const urlParam = String(req.query.url || req.body?.url || "").trim();
    const urlsParam = req.query.urls || req.body?.urls;
    const urls = [];
    if (urlParam) urls.push(urlParam);
    if (Array.isArray(urlsParam)) urls.push(...urlsParam.filter(Boolean));
    if (!urls.length) return res.status(400).json({ success: false, error: "Pass ?url=... or ?urls[]=..." });
    const valid = urls.filter((u) => {
      try { const p = new URL(u); return p.hostname === "studygyaan.in" || p.hostname.endsWith(".studygyaan.in"); } catch { return false; }
    });
    if (!valid.length) return res.status(400).json({ success: false, error: "Only studygyaan.in URLs allowed" });
    const booster = require("./indexing_booster");
    const indexNowResult = await booster.submitToAllIndexNow(valid);
    const sitemapPings = await booster.pingAllSitemaps().catch(() => []);
    const websub = await booster.publishWebSub().catch(() => []);
    let googleResult = { skipped: "no-service-account" };
    if (process.env.SERVICE_ACCOUNT_JSON) {
      try {
        const { notifyGoogle } = require("./auto_indexer");
        const jobUrls = valid.filter((u) => new URL(u).pathname.startsWith("/job/"));
        let ok = 0, fail = 0;
        for (const u of jobUrls.slice(0, 100)) { try { await notifyGoogle(u); ok++; } catch { fail++; } }
        googleResult = { attempted: jobUrls.length, accepted: ok, failed: fail };
      } catch (e) { googleResult = { skipped: "error", error: e.message }; }
    }
    return res.json({ success: true, indexNow: indexNowResult, google: googleResult, sitemapPings, websub });
  } catch (e) {
    console.error("pingIndexNow error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

exports.bulkIndexNow = httpsFunc(runWith, async (req, res) => {
  try {
    const max = Math.min(Number(req.query.max) || 2000, 5000);
    const booster = require("./indexing_booster");
    const report = await booster.bulkSubmitAllUrls({ maxPerCollection: max });
    return res.json({ success: true, ...report });
  } catch (e) {
    console.error("bulkIndexNow error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

exports.recentUrls = httpsFunc(runWithSmall, async (req, res) => {
  try {
    const booster = require("./indexing_booster");
    const links = await booster.fetchRecentInternalLinks({ force: req.query.refresh === "1" });
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.set("Content-Type", "application/json; charset=utf-8");
    return res.json(links);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

exports.recentUrlsTxt = httpsFunc(runWithMed, async (req, res) => {
  try {
    const booster = require("./indexing_booster");
    const all = await booster.fetchAllPublicUrls({ maxPerCollection: 1000 });
    res.set("Cache-Control", "public, max-age=600, s-maxage=1800");
    res.set("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(all.map((u) => u.url).join("\n"));
  } catch (e) { return res.status(500).send(e.message); }
});
