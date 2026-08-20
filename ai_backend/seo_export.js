"use strict";

/**
 * Spark-safe Cloud Functions entrypoint.
 *
 * `firebase deploy --only functions:rssFeed,...` still *discovers* every
 * export in package.json "main". The full index.js also exports scheduled
 * jobs, Firestore triggers, and Secret Manager bindings. firebase-tools
 * then enables firebaseextensions / secretmanager / cloudscheduler and
 * dies on Spark with:
 *
 *   Error: Extensions require the Blaze plan, but project … is not on the Blaze plan.
 *
 * This file exports only the unauthenticated HTTP SEO functions that the
 * "Deploy Firebase Functions Only" workflow updates. No secrets, no
 * schedules, no Firestore triggers, no Extension SDK instances.
 *
 * Full automation functions remain in index.js. Point package.json "main"
 * back at index.js (or deploy that file explicitly) when you intentionally
 * want to update those.
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
exports.generateSitemap = proxySeoFunction("generateSitemap");
exports.generateRss = proxySeoFunction("generateRss");
