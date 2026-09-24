"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildMetaFiles } = require("../../seo_static/seo_meta.cjs");

const ts = (ms) => ({ seconds: Math.floor(ms / 1000) });
const story = (id, title, extra = {}) => ({
  id,
  data: {
    title,
    slug: id,
    category: "Jobs",
    coverImage: `https://cdn.example.com/${id}.jpg`,
    description: `${title} — ek click me poori jaankari`,
    applyLink: `https://studygyaan.in/blog/${id}`,
    createdAt: ts(1700000000000),
    ...extra,
  },
});

test("web stories get full bot-HTML content + Article schema (not thin preview)", () => {
  const files = buildMetaFiles({
    jobs: [],
    fast_track: [],
    mock_tests: [],
    blogs: [],
    web_stories: [
      story("up-police-story", "UP Police Bharti 2026", {
        slides: [
          { title: "Kya hai ye bharti?", lines: ["Kul 12 lakh posts"] },
          { heading: "Last Date", subtitle: "28 Feb 2027" },
        ],
      }),
      story("ssc-gd-story", "SSC GD New Update"),
    ],
  }, { ogMap: {} });

  const stories = JSON.parse(files["seo-meta-stories.json"]);
  const entry = stories["/web-stories/up-police-story"];
  assert.ok(entry, "stories json me entry honi chahiye");
  assert.strictEqual(entry.type, "article");

  // poora content: cover + slide text + CTA + internal links
  assert.ok(entry.content.includes("<img"), "cover image HTML");
  assert.ok(entry.content.includes("12 lakh posts"), "slide lines ka text");
  assert.ok(entry.content.includes("Last Date"), "slide heading");
  assert.ok(entry.content.includes("28 Feb 2027"), "slide subtitle");
  assert.ok(entry.content.includes('href="https://studygyaan.in/blog/up-police-story"'), "applyLink CTA");
  assert.ok(entry.content.includes("/web-stories/ssc-gd-story"), "doosri story ka link");
  assert.ok(entry.content.includes('href="https://studygyaan.in/web-stories"'), "hub link");

  // Article schema
  assert.strictEqual(entry.ld.length, 1);
  assert.strictEqual(entry.ld[0]["@type"], "Article");
  assert.ok(Array.isArray(entry.ld[0].image) && entry.ld[0].image.length === 1);
  assert.strictEqual(entry.ld[0].inLanguage, "hi");
  assert.ok(entry.ld[0].mainEntityOfPage.endsWith("/web-stories/up-police-story"));
});

test("stories pages-json me duplicate NAHI (dedicated file hi source of truth)", () => {
  const files = buildMetaFiles({
    jobs: [],
    fast_track: [],
    mock_tests: [],
    blogs: [],
    web_stories: [story("solo-story", "Solo Story")],
  }, { ogMap: {} });
  const pages = JSON.parse(files["seo-meta-pages.json"]);
  const webStoryKeys = Object.keys(pages).filter((k) => k.startsWith("/web-stories/"));
  assert.strictEqual(webStoryKeys.length, 0, "pages json me story detail nahi honi chahiye");
  const stories = JSON.parse(files["seo-meta-stories.json"]);
  assert.ok(stories["/web-stories/solo-story"]);
});

test("noindex/junk stories skip ho jaati hain", () => {
  const files = buildMetaFiles({
    jobs: [],
    fast_track: [],
    mock_tests: [],
    blogs: [],
    web_stories: [story("junk-story", "Junk", { noIndex: true })],
  }, { ogMap: {} });
  const stories = JSON.parse(files["seo-meta-stories.json"]);
  assert.ok(!stories["/web-stories/junk-story"], "noIndex story ko entry nahi milni chahiye");
});
