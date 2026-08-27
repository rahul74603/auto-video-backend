"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildBlogArticleProposal, buildFastTrackHtml, classifyShortBlog } = require("../agents/seo_intelligence/blog_html");
const { htmlSafetyIssues, sanitizeProposalHtml } = require("../agents/seo_intelligence/html_safety");
const { proposeBlogArticleHtmlWithAi } = require("../agents/seo_intelligence/content_ai");

test("deterministic blog HTML reuses existing text and does not pad", () => {
  const page = {
    title: "How to fill SSC CGL form",
    articleHtml: "<p>Use the official website only.</p>",
    sourceUrl: "https://ssc.gov.in"
  };
  const result = buildBlogArticleProposal(page, { evidence: { words: 11 } });
  assert.equal(result.insufficientSource, false);
  assert.match(result.articleHtml, /Use the official website only/);
  assert.match(result.articleHtml, /ssc\.gov\.in/);
  assert.equal(/₹50,000|1500 words|invented/i.test(result.articleHtml), false);
  assert.ok(result.preview.wordCount < 400);
});

test("news stub is classified and kept short", () => {
  const page = { title: "SSC CGL Result 2026 Declared", articleHtml: "<p>Result is out.</p>" };
  assert.equal(classifyShortBlog(page, 8), "news/update stub");
  const result = buildBlogArticleProposal(page, { evidence: { words: 8 } });
  assert.ok(result.articleHtml);
  assert.ok(result.preview.wordCount < 200);
});

test("empty page without source is insufficient, not invented", () => {
  const result = buildBlogArticleProposal({ title: "Note" }, { evidence: { words: 0 } });
  assert.equal(result.insufficientSource, true);
  assert.equal(result.articleHtml, null);
});

test("fast track HTML stays concise", () => {
  const result = buildFastTrackHtml({
    title: "SSC CGL Admit Card 2026",
    shortInfo: "Admit card released.",
    directLink: "https://ssc.gov.in/admit"
  });
  assert.ok(result.articleHtml);
  assert.ok(result.preview.wordCount < 120);
  assert.equal(/eligibility|salary|1500/i.test(result.articleHtml), false);
});

test("html safety flags script and javascript URLs", () => {
  const issues = htmlSafetyIssues('<p>x</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>');
  assert.ok(issues.length >= 1);
  const safe = sanitizeProposalHtml('<p>ok</p><script>bad()</script>');
  assert.equal(/script/i.test(safe.html), false);
});

test("AI layer is skipped without generateJson", async () => {
  const result = await proposeBlogArticleHtmlWithAi({ title: "How to fill SSC CGL form", articleHtml: "<p>Use the official website only.</p>" });
  assert.equal(result.used, false);
});

test("injected AI HTML with invented numbers is discarded", async () => {
  const result = await proposeBlogArticleHtmlWithAi(
    { title: "How to fill SSC CGL form", articleHtml: "<p>Use the official website only.</p>" },
    {},
    {
      generateJson: async () => ({
        articleHtml: "<h1>How to fill SSC CGL form</h1><p>There are 9999 vacancies.</p>",
        invented: false
      })
    }
  );
  assert.equal(result.used, false);
  assert.match(result.reason, /ungrounded/i);
});
