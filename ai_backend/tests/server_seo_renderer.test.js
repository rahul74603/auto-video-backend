"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSchema,
  createMeta,
  injectSeo,
  isIndexable,
  stripHtml
} = require("../server_seo_renderer");

const template = '<!doctype html><html><head><title>Default</title><meta name="robots" content="index, follow"><link rel="canonical" href="https://studygyaan.in"></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>';

test("renderer outputs exactly one self-referencing canonical and server content", () => {
  const data = {
    title: "Example Job 2026",
    description: "A detailed verified government job description for eligible candidates.",
    organization: "Example Department",
    location: "Indore",
    createdAt: "2026-07-20T00:00:00.000Z"
  };
  const meta = {
    title: data.title,
    description: data.description,
    canonical: "https://studygyaan.in/job/example-job-2026",
    image: "https://studygyaan.in/og-image.jpg"
  };
  const html = injectSeo(template, meta, data, "job");
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.match(html, /<h1>Example Job 2026/);
  assert.match(html, /"@type":"JobPosting"/);
  assert.match(html, /"addressLocality":"Indore"/);
  assert.match(html, /\/assets\/app\.js/);
});

test("canonical meta uses slug and stable route", () => {
  const meta = createMeta(
    { canonical: "blog", type: "article" },
    { id: "firestore-id", data: { slug: "unique-topic", title: "Unique Topic", description: "Useful answer" } }
  );
  assert.equal(meta.canonical, "https://studygyaan.in/blog/unique-topic");
});

test("draft documents are not indexable", () => {
  assert.equal(isIndexable({ status: "draft" }), false);
  assert.equal(isIndexable({ status: "pending" }), false);
  assert.equal(isIndexable({ status: "published" }), true);
  assert.equal(isIndexable({}), true);
});

test("HTML is stripped before metadata and schema output", () => {
  assert.equal(stripHtml("<h2>Hello</h2><script>bad()</script><p>World</p>"), "Hello World");
  const schema = buildSchema(
    { title: "Article", description: "Description", canonical: "https://studygyaan.in/blog/a", image: "x" },
    { content: "<p>Body</p>" },
    "article"
  );
  assert.equal(schema["@type"], "Article");
});

// =========================================================
// P0-2: /jobs/<hub> hub-guard + P1-8 exam-calendar (Firebase path)
// =========================================================
const {
  createServerSeoHandler,
  STATIC_PAGES,
} = require("../server_seo_renderer");
const { JOB_HUBS, findJobHub } = require("../job_hubs");

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: "",
    redirected: "",
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    send(h) { this.body = String(h); return this; },
    redirect(code, loc) { this.statusCode = code; this.redirected = loc; return this; },
  };
}

test("P0-2: hub slug /jobs/railway serves 200 with hub title (no legacy 301)", async () => {
  const handle = createServerSeoHandler({ db: null, renderWebStory: () => {} });
  const res = mockRes();
  await handle({ path: "/jobs/railway" }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.redirected, "");
  assert.match(res.body, /Railway Jobs/);
  assert.match(res.body, /studygyaan\.in\/jobs\/railway/);
});

test("P0-2: non-hub /jobs/xyz still legacy-redirects to /job/xyz", async () => {
  const handle = createServerSeoHandler({ db: null, renderWebStory: () => {} });
  const res = mockRes();
  await handle({ path: "/jobs/some-old-job" }, res);
  assert.equal(res.statusCode, 301);
  assert.equal(res.redirected, "https://studygyaan.in/job/some-old-job");
});

test("P1-8: exam-calendar static page serves 200", async () => {
  assert.ok(STATIC_PAGES["exam-calendar"]);
  const handle = createServerSeoHandler({ db: null, renderWebStory: () => {} });
  const res = mockRes();
  await handle({ path: "/exam-calendar" }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Exam Calendar/);
});

test("P0-2: job_hubs twin has 18 slugs, case-insensitive lookup", () => {
  assert.equal(JOB_HUBS.length, 18);
  assert.equal(findJobHub("Railway").slug, "railway");
  assert.equal(findJobHub("mp").label, "MP Jobs");
  assert.equal(findJobHub("  SSC ").slug, "ssc");
  assert.equal(findJobHub("nope"), null);
  assert.equal(findJobHub(""), null);
});
