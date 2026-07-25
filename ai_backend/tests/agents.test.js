"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { listAgents } = require("../agents/agent_registry");
const { buildStrongPrompt } = require("../agents/prompt_enhancer");
const {
  classifyAudit,
  detectSoft404,
  isAuditIndexable,
  isEligibleIndexingApiUrl,
  normalizeUrl,
  sameCanonical
} = require("../agents/seo_indexing_agent");

test("specialist registry contains separate production roles", () => {
  const ids = listAgents().map((agent) => agent.id);
  assert.deepEqual(ids, [
    "prompt-engineer",
    "seo-indexing",
    "job-research",
    "blog-editor",
    "mock-test",
    "web-story",
    "media-producer",
    "notes-pdf"
  ]);
});

test("prompt compiler preserves user command inside data boundaries", () => {
  const prompt = buildStrongPrompt({
    agentId: "blog-editor",
    command: "railway exam ki tayari par article",
    mode: "auto",
    context: { language: "Hinglish" }
  });
  assert.match(prompt, /<user_command>\nrailway exam ki tayari par article\n<\/user_command>/);
  assert.match(prompt, /EXECUTION MODE: auto/);
  assert.match(prompt, /OUTPUT CONTRACT/);
  assert.match(prompt, /Avoid doorway pages/);
});

test("URL normalizer removes non-home trailing slash", () => {
  assert.equal(normalizeUrl("https://StudyGyaan.in/job/example/"), "https://studygyaan.in/job/example");
  assert.equal(normalizeUrl("https://studygyaan.in/"), "https://studygyaan.in/");
  assert.equal(sameCanonical("https://studygyaan.in/job/a/", "https://studygyaan.in/job/a"), true);
});

test("Indexing API eligibility is restricted to job details", () => {
  assert.equal(isEligibleIndexingApiUrl("https://studygyaan.in/job/example"), true);
  assert.equal(isEligibleIndexingApiUrl("https://studygyaan.in/blog/example"), false);
  assert.equal(isEligibleIndexingApiUrl("https://studygyaan.in/test/example"), false);
});

test("audit classifier catches redirect, noindex and canonical mismatch", () => {
  const audit = {
    url: "https://studygyaan.in/test/a",
    status: 301,
    noindex: true,
    soft404: false,
    networkError: null,
    canonical: "https://studygyaan.in/test/b",
    title: "A",
    wordCount: 100
  };
  assert.deepEqual(classifyAudit(audit), [
    "page_with_redirect",
    "excluded_by_noindex",
    "canonical_mismatch"
  ]);
  audit.issues = classifyAudit(audit);
  assert.equal(isAuditIndexable(audit), false);
});

test("soft-404 detector does not rely on HTTP status alone", () => {
  assert.equal(detectSoft404(200, "404 - Page Not Found", "Page not found"), true);
  assert.equal(detectSoft404(404, "Real title", "Content"), false);
  assert.equal(detectSoft404(200, "Real job", "Detailed eligibility and dates"), false);
});
