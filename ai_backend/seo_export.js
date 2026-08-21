"use strict";

/**
 * Spark-safe Cloud Functions entrypoint - pure v1 HTTPS functions.
 * No runWith (removed in firebase-functions v7), no v2 imports, no triggers.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps || !admin.apps.length) {
  try { admin.initializeApp(); } catch (e) { /* already initialized */ }
}
const db = admin.firestore ? admin.firestore() : null;

const handleMetaTags = require("./server_seo_renderer").createServerSeoHandler({
  db,
  renderWebStory: (req, res) => require("./web_stories").renderWebStory(req, res),
});

const withCors = (handler) => (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");
  return handler(req, res);
};

const proxy = (name) => functions.https.onRequest(withCors((req, res) => {
  try { return require("./seo_functions")[name](req, res); }
  catch (e) { console.error(name + " error:", e); return res.status(500).send(e.message); }
}));

exports.serverSideMetaTags = functions.https.onRequest(withCors((req, res) => handleMetaTags(req, res)));
exports.rssFeed = functions.https.onRequest(withCors((req, res) => require("./newsFeed").rssFeed(req, res)));

exports.generateSitemapIndex = proxy("generateSitemapIndex");
exports.generateSitemapMain = proxy("generateSitemapMain");
exports.generateSitemapBlogs = proxy("generateSitemapBlogs");
exports.generateSitemapJobs = proxy("generateSitemapJobs");
exports.generateSitemapTests = proxy("generateSitemapTests");
exports.generateSitemapStories = proxy("generateSitemapStories");
exports.generateSitemapUpdates = proxy("generateSitemapUpdates");
exports.generateSitemapNews = proxy("generateSitemapNews");
exports.generateSitemapCourses = proxy("generateSitemapCourses");
exports.generateSitemapMaterials = proxy("generateSitemapMaterials");
exports.generateSitemap = proxy("generateSitemap");
exports.generateRss = proxy("generateRss");

exports.pingIndexNow = functions.https.onRequest(withCors(async (req, res) => {
  try {
    const urlParam = String(req.query.url || (req.body && req.body.url) || "").trim();
    const urlsParam = req.query.urls || (req.body && req.body.urls);
    const urls = [];
    if (urlParam) urls.push(urlParam);
    if (Array.isArray(urlsParam)) urls.push(...urlsParam.filter(Boolean));
    if (!urls.length) return res.status(400).json({success:false, error:"Pass ?url=... or ?urls[]=..."});
    const valid = urls.filter((u) => {
      try { const p = new URL(u); return p.hostname === "studygyaan.in" || p.hostname.endsWith(".studygyaan.in"); }
      catch { return false; }
    });
    if (!valid.length) return res.status(400).json({success:false, error:"Only studygyaan.in URLs allowed"});
    const booster = require("./indexing_booster");
    const indexNowResult = await booster.submitToAllIndexNow(valid);
    const sitemapPings = await booster.pingAllSitemaps().catch(() => []);
    const websub = await booster.publishWebSub().catch(() => []);
    let googleResult = {skipped:"no-service-account"};
    if (process.env.SERVICE_ACCOUNT_JSON) {
      try {
        const {notifyGoogle} = require("./auto_indexer");
        const jobUrls = valid.filter((u) => new URL(u).pathname.startsWith("/job/"));
        let ok=0, fail=0;
        for (const u of jobUrls.slice(0, 100)) { try{await notifyGoogle(u);ok++;}catch{fail++;} }
        googleResult = {attempted:jobUrls.length, accepted:ok, failed:fail};
      } catch(e){ googleResult = {skipped:"error", error:e.message}; }
    }
    return res.json({success:true, indexNow: indexNowResult, google: googleResult, sitemapPings, websub});
  } catch(e) {
    console.error("pingIndexNow error:", e);
    return res.status(500).json({success:false, error:e.message});
  }
}));

exports.bulkIndexNow = functions.https.onRequest(withCors(async (req, res) => {
  try {
    const max = Math.min(Number(req.query.max) || 2000, 5000);
    const booster = require("./indexing_booster");
    const report = await booster.bulkSubmitAllUrls({maxPerCollection: max});
    return res.json({success:true, ...report});
  } catch(e) {
    console.error("bulkIndexNow error:", e);
    return res.status(500).json({success:false, error:e.message});
  }
}));

exports.recentUrls = functions.https.onRequest(withCors(async (req, res) => {
  try {
    const booster = require("./indexing_booster");
    const links = await booster.fetchRecentInternalLinks({force: req.query.refresh === "1"});
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.set("Content-Type", "application/json; charset=utf-8");
    return res.json(links);
  } catch(e) { return res.status(500).json({error:e.message}); }
}));

exports.recentUrlsTxt = functions.https.onRequest(withCors(async (req, res) => {
  try {
    const booster = require("./indexing_booster");
    const all = await booster.fetchAllPublicUrls({maxPerCollection: 1000});
    res.set("Cache-Control", "public, max-age=600, s-maxage=1800");
    res.set("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(all.map(u => u.url).join("\n"));
  } catch(e) { return res.status(500).send(e.message); }
}));
