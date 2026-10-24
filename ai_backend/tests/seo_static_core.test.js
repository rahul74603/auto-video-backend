"use strict";

// seo_static core (LIVE sitemap/bot-JSON pipeline) ke unit tests.
// generate.cjs require-safe hai (main sirf CLI pe chalta hai).

const test = require("node:test");
const assert = require("node:assert/strict");
const { toMillis, safeImageUrl, normalizeSitemapUrl } = require("../../seo_static/generate.cjs");
const { buildMetaFiles } = require("../../seo_static/seo_meta.cjs");

test("toMillis: sab date-shapes → ms, missing/garbage → 0 (exclude nahi)", () => {
  const NOW = Date.parse("2026-10-24T00:00:00Z");
  assert.equal(toMillis({ createdAt: NOW }), NOW);
  assert.equal(toMillis({ createdAt: { toMillis: () => NOW } }), NOW);
  assert.equal(toMillis({ createdAt: { toDate: () => new Date(NOW) } }), NOW);
  assert.equal(toMillis({ createdAt: "2026-10-24T00:00:00Z" }), NOW);
  assert.equal(toMillis({ updatedAt: NOW }), NOW); // createdAt nahi to updatedAt
  assert.equal(toMillis({}), 0);
  assert.equal(toMillis({ createdAt: "garbage-date" }), 0);
  assert.equal(toMillis({ createdAt: null }), 0);
});

test("safeImageUrl: backslash/relative → absolute https", () => {
  assert.equal(
    safeImageUrl("uploads\\repaired\\blogs\\_x.jpg"),
    "https://studygyaan.in/uploads/repaired/blogs/_x.jpg"
  );
  assert.equal(safeImageUrl("/og-image.jpg"), "https://studygyaan.in/og-image.jpg");
  assert.equal(safeImageUrl("https://cdn.example.com/a.png"), "https://cdn.example.com/a.png");
  assert.equal(safeImageUrl(""), "");
});

test("normalizeSitemapUrl: backslash + www + http fix", () => {
  assert.equal(
    normalizeSitemapUrl("http://www.studygyaan.in/blog\\x/"),
    "https://studygyaan.in/blog/x"
  );
});

test("buildMetaFiles: poison docs par throw NAHI, achhe docs safe", () => {
  const colls = {
    blogs: [
      { id: "good1", data: { status: "published", title: "Good Blog Post Here", slug: "good-blog", content: "<p>Hello world content</p>", createdAt: "2026-10-24T00:00:00Z" } },
      { id: "poison1", data: { status: "published", title: "Poison blog doc here", content: { nested: "object-not-string" }, faqs: "not-an-array", createdAt: "garbage-date", imageUrl: "uploads\\x.jpg" } },
      { id: "poison2", data: { status: "published", title: "Poison two blog", description: 12345, faqs: [{ q: 1 }], publishedAt: { weird: true } } },
    ],
    jobs: [
      { id: "j1", data: { status: "published", title: "Good Job Vacancy 2026", slug: "good-job", description: "Nice job", createdAt: "2026-10-24T00:00:00Z" } },
      { id: "jp", data: { status: "published", title: "Poison job post here", description: { o: 1 }, lastDate: "32 foo 2099" } },
    ],
    fast_track: [],
    mock_tests: [],
    web_stories: [],
    courses: [],
    study_materials: [],
    studyMaterials: [],
  };
  let files;
  assert.doesNotThrow(() => { files = buildMetaFiles(colls, { ogMap: {} }); });
  const pages = JSON.parse(files["seo-meta-pages.json"]);
  assert.ok(pages["/blog/good-blog"], "good blog entry present");
  // poison docs ya to skip hue ya safe-render — crash nahi hona chahiye tha (assert upar)
  assert.ok(files["seo-meta-jobs.json"].length > 100);
});

test("buildMetaFiles: khaali colls par bhi valid JSONs", () => {
  const files = buildMetaFiles({}, { ogMap: {} });
  assert.ok(JSON.parse(files["seo-meta-pages.json"])["/blog"]);
  assert.ok(JSON.parse(files["seo-meta-jobs.json"]));
});
