"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractTitle,
  extractLocs,
  countBackslashUrls,
  newestLastmod,
  findMissingSlugs,
} = require("../diag_site_health");

test("extractTitle nikalta hai, missing pe blank", () => {
  assert.equal(extractTitle("<html><head><title>Railway Jobs 2026</title></head></html>"), "Railway Jobs 2026");
  assert.equal(extractTitle("<html>no title</html>"), "");
});

test("extractLocs saare loc nikalta hai", () => {
  const xml = `<urlset><url><loc>https://studygyaan.in/blog/a</loc></url><url><loc>https://studygyaan.in/blog/b</loc></url></urlset>`;
  assert.deepEqual(extractLocs(xml), ["https://studygyaan.in/blog/a", "https://studygyaan.in/blog/b"]);
});

test("countBackslashUrls toote URLs ginta hai", () => {
  assert.equal(countBackslashUrls(["https://x.in/a", "https://x.in/uploads\\b.jpg"]), 1);
  assert.equal(countBackslashUrls(["https://x.in/a"]), 0);
});

test("newestLastmod latest date deta hai", () => {
  const xml = "<a><lastmod>2026-01-01T00:00:00Z</lastmod><lastmod>2026-10-21T00:00:00Z</lastmod></a>";
  assert.equal(newestLastmod(xml), "2026-10-21T00:00:00Z");
  assert.equal(newestLastmod("<a></a>"), "");
});

test("findMissingSlugs sitemap-gap pakadta hai", () => {
  const slugs = ["a", "b", "c"];
  const urls = ["https://studygyaan.in/blog/a", "https://studygyaan.in/blog/c"];
  assert.deepEqual(findMissingSlugs(slugs, urls, "https://studygyaan.in/blog"), ["b"]);
  assert.deepEqual(findMissingSlugs(slugs, [...urls, "https://studygyaan.in/blog/b"], "https://studygyaan.in/blog"), []);
});

test("detectSitemapRoot INDEX vs URLSET pehchanta hai", () => {
  const { detectSitemapRoot } = require("../diag_site_health");
  assert.equal(detectSitemapRoot('<sitemapindex xmlns="x"><sitemap></sitemap></sitemapindex>'), "INDEX");
  assert.equal(detectSitemapRoot('<urlset xmlns="x"><url></url></urlset>'), "URLSET");
  assert.equal(detectSitemapRoot("<html>nope</html>"), "UNKNOWN");
});

test("parseArgs: default full, --slim pe slim (pipeline HTTP-only)", () => {
  const { parseArgs } = require("../diag_site_health");
  assert.deepEqual(parseArgs(["node", "diag_site_health.js"]), { slim: false, urls: null });
  assert.deepEqual(parseArgs(["node", "diag_site_health.js", "--slim"]), { slim: true, urls: null });
  assert.deepEqual(parseArgs([]), { slim: false, urls: null });
});

test("parseArgs: --urls probe-list nikalta hai (equals/space/comma forms)", () => {
  const { parseArgs } = require("../diag_site_health");
  assert.deepEqual(parseArgs(["node", "d.js", "--urls", "/a,/b"]), { slim: false, urls: ["/a", "/b"] });
  assert.deepEqual(parseArgs(["node", "d.js", "--urls=/a,/b"]), { slim: false, urls: ["/a", "/b"] });
  assert.deepEqual(parseArgs(["node", "d.js", "--urls", "/a,", "/b"]), { slim: false, urls: ["/a", "/b"] });
  assert.deepEqual(parseArgs(["node", "d.js", "--urls", "/a", "/b"]), { slim: false, urls: ["/a", "/b"] });
  assert.deepEqual(parseArgs(["node", "d.js", "--slim", "--urls", "/a"]), { slim: true, urls: ["/a"] });
  assert.deepEqual(parseArgs(["node", "d.js", "--urls"]), { slim: false, urls: null });
});

test("resolveProbeUrl: relative→SITE, full URL as-is", () => {
  const { resolveProbeUrl } = require("../diag_site_health");
  assert.equal(resolveProbeUrl("/blog/x"), "https://studygyaan.in/blog/x");
  assert.equal(resolveProbeUrl("blog/x"), "https://studygyaan.in/blog/x");
  assert.equal(resolveProbeUrl("https://studygyaan.in/blog/x"), "https://studygyaan.in/blog/x");
});
