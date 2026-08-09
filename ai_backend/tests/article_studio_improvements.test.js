"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  authorizeArticleRequest
} = require("../agents/article_agents/article_auth");
const {
  runAdaptivePipeline
} = require("../agents/article_agents/adaptive_article_orchestrator");
const {
  harvestSmartFacts
} = require("../agents/article_agents/smart_facts_harvester");
const {
  repairArticleDeterministically
} = require("../agents/article_agents/article_repairer");
const {
  numberSetOf,
  extractClaims
} = require("../agents/article_agents/fact_quality_reviewer");
const {
  assertSourceArticleWorthy,
  isPdfSource
} = require("../agents/article_agents/source_adequacy_gate");

function request(headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return { get: (name) => normalized[String(name).toLowerCase()] || "" };
}

/* ------------------------------------------------------------------ */
/* Backend article-route authentication                               */
/* ------------------------------------------------------------------ */

test("article auth: missing/invalid Firebase session is rejected", async () => {
  const env = { ARTICLE_ADMIN_EMAILS: "admin@studygyaan.in" };
  const missing = await authorizeArticleRequest(request(), {
    env,
    verifyIdToken: async () => ({ email: "admin@studygyaan.in" })
  });
  assert.equal(missing.status, 401);

  const invalid = await authorizeArticleRequest(request({ authorization: "Bearer bad" }), {
    env,
    verifyIdToken: async () => { throw new Error("expired"); }
  });
  assert.equal(invalid.status, 401);
});

test("article auth: allow-listed Firebase admin passes; other Gmail is forbidden", async () => {
  const env = { ARTICLE_ADMIN_EMAILS: "first@example.com, Admin@StudyGyaan.in" };
  const allowed = await authorizeArticleRequest(request({ authorization: "Bearer good" }), {
    env,
    verifyIdToken: async () => ({ uid: "u1", email: "admin@studygyaan.in" })
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.via, "email-allowlist");

  const denied = await authorizeArticleRequest(request({ authorization: "Bearer good" }), {
    env,
    verifyIdToken: async () => ({ uid: "u2", email: "reader@example.com" })
  });
  assert.equal(denied.status, 403);
});

test("article auth: admin claim and trusted agent token are supported", async () => {
  const claim = await authorizeArticleRequest(request({ authorization: "Bearer claimed" }), {
    env: {},
    verifyIdToken: async () => ({ uid: "u3", admin: true })
  });
  assert.equal(claim.ok, true);
  assert.equal(claim.via, "admin-claim");

  const agent = await authorizeArticleRequest(request({ "x-agent-token": "server-secret" }), {
    env: { AGENT_ADMIN_TOKEN: "server-secret" },
    verifyIdToken: async () => { throw new Error("must not be called"); }
  });
  assert.equal(agent.ok, true);
  assert.equal(agent.via, "agent-token");
});

/* ------------------------------------------------------------------ */
/* Adaptive grounded orchestrator                                     */
/* ------------------------------------------------------------------ */

function draft(verdict, score, issues = []) {
  return {
    title: `${verdict} draft`,
    reviewStatus: verdict === "pass" ? "passed" : "failed",
    publishBlocked: verdict !== "pass",
    reviewReport: { verdict, score, issues },
    repairAttempts: 1,
    repairLog: [],
    instructions: "internal should be overwritten"
  };
}

test("adaptive pipeline stops after first PASS and keeps only admin instructions", async () => {
  const calls = [];
  const result = await runAdaptivePipeline(
    { type: "job", instructions: "dates ko detail me likho", source: { url: "https://gov.in/n" } },
    {
      runGeneratePipeline: async (input, pipelineDeps) => {
        calls.push({ input, pipelineDeps });
        return draft("pass", 97);
      }
    },
    { maxStrategies: 3 }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].pipelineDeps.writerDeps.temperature, 0.35);
  assert.match(calls[0].input.strategyGuidance, /natural|grounded/i);
  assert.equal(result.instructions, "dates ko detail me likho");
  assert.equal(result.generationMeta.strategiesTried, 1);
  assert.equal(result.generationMeta.stoppedReason, "review-passed");
  assert.equal(result.generationMeta.bestStrategy, "balanced");
});

test("adaptive pipeline retries a fixable FAIL conservatively and passes feedback", async () => {
  const calls = [];
  const outputs = [
    draft("fail", 62, ["word-count-low:1200 (<1600)"]),
    draft("pass", 94)
  ];
  const result = await runAdaptivePipeline(
    { type: "job", instructions: "", source: { url: "https://gov.in/n" } },
    {
      runGeneratePipeline: async (input, pipelineDeps) => {
        calls.push({ input, pipelineDeps });
        return outputs[calls.length - 1];
      }
    },
    { maxStrategies: 3 }
  );

  assert.equal(calls.length, 2);
  assert.ok(calls[1].input.feedbackIssues.includes("word-count-low:1200 (<1600)"));
  assert.match(calls[1].input.strategyGuidance, /zero-hallucination/i);
  assert.equal(calls[1].pipelineDeps.writerDeps.temperature, 0.18);
  assert.equal(result.reviewStatus, "passed");
  assert.equal(result.generationMeta.bestStrategy, "conservative");
});

test("adaptive pipeline does not waste calls on fatal review issues", async () => {
  let calls = 0;
  const result = await runAdaptivePipeline(
    { type: "job", source: { url: "https://gov.in/n" } },
    {
      runGeneratePipeline: async () => {
        calls += 1;
        return draft("fail", 70, ["duplicate:title:\"Existing article\""]);
      }
    },
    { maxStrategies: 3 }
  );
  assert.equal(calls, 1);
  assert.equal(result.generationMeta.stoppedReason, "fatal-review-issue");
});

test("adaptive pipeline preserves the useful error code when no draft is produced", async () => {
  const expected = Object.assign(new Error("Gemini busy"), { code: "AI_RATE_LIMITED" });
  await assert.rejects(
    runAdaptivePipeline(
      { type: "job" },
      { runGeneratePipeline: async () => { throw expected; } },
      { maxStrategies: 3 }
    ),
    (error) => error === expected && error.code === "AI_RATE_LIMITED"
  );
});

/* ------------------------------------------------------------------ */
/* Grounded fact repair + Indian money formats                        */
/* ------------------------------------------------------------------ */

test("number grounding handles Indian commas and PMT/LPA money claims", () => {
  const numbers = numberSetOf("₹1,60,000 PMT; western 160,000; CTC 12 LPA");
  assert.ok(numbers.has("160000"));
  assert.ok(!numbers.has("60"));
  const kinds = extractClaims("वेतन 1,60,000 PMT और CTC 12 LPA होगा").map((claim) => claim.kind);
  assert.ok(kinds.includes("money"));
});

test("smart fact harvester fills empty fields from source only", () => {
  const article = {
    type: "JOB",
    contentHtml: "<p>गलत body salary ₹9,99,999 PMT</p>",
    facts: {}
  };
  const source = {
    pageTitle: "DU Assistant Professor Recruitment",
    text:
      "Organization: University of Delhi\nTotal Vacancies: 120\n" +
      "Qualification: Master's Degree with NET\nSalary: ₹1,60,000 PMT",
    tables: []
  };
  const filled = harvestSmartFacts(article, source);
  assert.deepEqual(new Set(filled), new Set(["salary", "vacancies", "qualification", "organization"]));
  assert.equal(article.facts.salary, "₹1,60,000 PMT");
  assert.equal(article.facts.vacancies, "120");
  assert.ok(!article.facts.salary.includes("9,99,999"), "article body must never be treated as evidence");
});

test("repair removes ungrounded hard claims before date harvest but keeps grounded Indian salary", () => {
  const article = {
    type: "JOB",
    seoTitle: "Grounded title",
    metaDescription: "Grounded description",
    facts: { examDate: "31/12/2030", vacancies: "999" },
    faqs: [],
    wordCount: 2000,
    contentHtml:
      "<h1>Notice</h1><p>Salary 160000 PMT. Fake fee ₹9,99,999. " +
      "कुल 999 posts, परीक्षा 31/12/2030 और 75% आरक्षण।</p>"
  };
  const source = {
    url: "https://gov.in/notice.pdf",
    text: "Recruitment notification. Salary ₹1,60,000 PMT. Total vacancies: 120 posts.",
    tables: []
  };
  const repairs = repairArticleDeterministically(article, source);
  assert.match(article.contentHtml, /160000 PMT/, "grounded differently-formatted salary stays");
  assert.doesNotMatch(article.contentHtml, /9,99,999|999 posts|31\/12\/2030|75%/);
  assert.equal(article.facts.examDate || "", "", "removed body date cannot be harvested back into facts");
  assert.equal(article.facts.vacancies, "120", "source vacancy recovers cleared bad value");
  assert.ok(repairs.some((item) => item.startsWith("body:removed-ungrounded-claims")));
});

/* ------------------------------------------------------------------ */
/* Format-aware source adequacy                                       */
/* ------------------------------------------------------------------ */

test("adequacy gate accepts a short real teaching PDF with independent details", () => {
  const text = (
    "Assistant Professor recruitment notification. Total Posts: 20. " +
    "Qualification: Master's Degree with NET. Applications are invited by the University. "
  ).repeat(6);
  assert.equal(isPdfSource({ url: "https://college.edu/notice.PDF?download=1" }), true);
  assert.doesNotThrow(() =>
    assertSourceArticleWorthy({ url: "https://college.edu/notice.PDF?download=1", text, tables: [] })
  );
});

test("adequacy gate still rejects a short PDF containing only generic fluff", () => {
  const text = "Welcome to the college portal. Please visit again for posts and updates. ".repeat(10);
  assert.throws(
    () => assertSourceArticleWorthy({ url: "https://college.edu/file.pdf", text, tables: [] }),
    (error) => error.code === "SOURCE_NOT_ARTICLE_WORTHY" && /Source Text box/.test(error.message)
  );
});
