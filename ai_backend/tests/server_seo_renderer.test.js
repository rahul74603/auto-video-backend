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
