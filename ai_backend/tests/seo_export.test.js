"use strict";

/**
 * Spark-plan deploy guard.
 *
 * firebase-tools discovers every export in package.json "main". If that
 * file also exports scheduled jobs, Firestore triggers, or Secret Manager
 * bindings, CI dies with:
 *   Error: Extensions require the Blaze plan
 * even when --only lists HTTP SEO functions.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const EXPECTED = Object.freeze([
  "serverSideMetaTags",
  "rssFeed",
  "generateSitemapIndex",
  "generateSitemapMain",
  "generateSitemapBlogs",
  "generateSitemapJobs",
  "generateSitemapTests",
  "generateSitemapStories",
  "generateSitemapUpdates",
  "generateSitemapNews",
  "generateSitemapCourses",
  "generateSitemapMaterials",
  "generateSitemap",
  "generateRss",
  "pingIndexNow",
  "bulkIndexNow",
  "recentUrls",
  "recentUrlsTxt",
]);

const fakeAdmin = {
  apps: { length: 1 },
  initializeApp: () => ({}),
  firestore: () => ({ collection: () => ({}) }),
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "firebase-admin") return fakeAdmin;
  return origLoad.apply(this, arguments);
};

const seo = require("../seo_export");

test("package.json main is the Spark-safe SEO entrypoint", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.equal(pkg.main, "seo_export.js");
});

test("seo_export exposes exactly the HTTP SEO functions the deploy workflow updates", () => {
  const names = Object.keys(seo)
    .filter((name) => typeof seo[name] === "function")
    .sort();
  assert.deepEqual(names, [...EXPECTED].sort());
});

test("seo_export functions are HTTPS-only: no secrets, schedules, or event triggers", () => {
  for (const name of EXPECTED) {
    const fn = seo[name];
    assert.equal(typeof fn, "function", `${name} should be a Cloud Function`);
    const endpoint = fn.__endpoint;
    assert.ok(endpoint, `${name} should have firebase-functions __endpoint metadata`);
    assert.ok(
      endpoint.httpsTrigger || Object.prototype.hasOwnProperty.call(endpoint, "httpsTrigger"),
      `${name} must be an HTTPS function`
    );
    assert.equal(
      (endpoint.secretEnvironmentVariables || []).length,
      0,
      `${name} must not bind Secret Manager secrets (Spark/Blaze trap)`
    );
    assert.ok(!endpoint.scheduleTrigger, `${name} must not be scheduled`);
    assert.ok(!endpoint.eventTrigger, `${name} must not be an event trigger`);
  }
});
