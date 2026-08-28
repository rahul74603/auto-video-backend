"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertAllowedAuditWrite,
  computeHealth,
  compactAudit,
  MAX_PAGE_AUDITS,
  PUBLIC_CONTENT_COLLECTIONS,
  AUDIT_WRITE_ALLOWLIST
} = require("../agents/seo_intelligence/audit_model");
const {
  detectPageType,
  auditPage,
  auditPages,
  selectAuditSample,
  persistPageAudits,
  gscRowsForPage
} = require("../agents/seo_intelligence/page_auditor");

const NOW = new Date("2026-08-26T00:00:00Z");

function findingIds(audit) {
  return (audit.findings || []).map((item) => item.id);
}

function hasWordCountPenalty(audit) {
  return (audit.findings || []).some((item) => /thin|word-count|wordCount/i.test(item.id + item.suggestedAction));
}

test("detectPageType covers all Phase 2 content types", () => {
  assert.equal(detectPageType("blogs", { title: "Guide" }), "BLOG");
  assert.equal(detectPageType("jobs", { title: "SSC CGL" }), "JOB");
  assert.equal(detectPageType("fast_track", { title: "Admit Card" }), "FAST_TRACK");
  assert.equal(detectPageType("mock_tests", { title: "Quiz" }), "MOCK_TEST");
  assert.equal(detectPageType("study_materials", { title: "PDF" }), "STUDY_MATERIAL");
  assert.equal(detectPageType("courses", { title: "Course" }), "COURSE");
  assert.equal(detectPageType("jobs", { typeRaw: "EBOOK", title: "Ebook" }), "EBOOK");
  assert.equal(detectPageType("web_stories", { title: "Story" }), "WEB_STORY");
});

test("short admit-card / result / mock / pdf-like pages are not marked bad for word count", () => {
  const admit = auditPage({
    id: "admit-1",
    collection: "fast_track",
    title: "SSC CGL Admit Card 2026",
    category: "Admit Card",
    shortInfo: "Admit card released.",
    directLink: "https://ssc.gov.in/admit",
    status: "published",
    url: "/update/ssc-cgl-admit-card-2026",
    authorName: "StudyGyaan Editorial Team"
  }, { now: NOW });
  assert.equal(admit.contentType, "FAST_TRACK");
  assert.equal(hasWordCountPenalty(admit), false);

  const result = auditPage({
    id: "result-1",
    collection: "fast_track",
    title: "SSC CGL Result 2026 Declared",
    category: "Result",
    shortInfo: "Result declared on ssc.gov.in.",
    directLink: "https://ssc.gov.in/result",
    status: "published",
    url: "/update/ssc-cgl-result-2026"
  }, { now: NOW });
  assert.equal(hasWordCountPenalty(result), false);

  const mock = auditPage({
    id: "mock-1",
    collection: "mock_tests",
    title: "SSC CGL Mock Test",
    questions: [{ question: "2+2?", answer: "4" }],
    status: "published",
    url: "/test/ssc-cgl-mock"
  }, { now: NOW });
  assert.equal(mock.contentType, "MOCK_TEST");
  assert.equal(hasWordCountPenalty(mock), false);
  assert.ok(!findingIds(mock).includes("content:thin-blog"));

  const material = auditPage({
    id: "pdf-1",
    collection: "study_materials",
    title: "SSC CGL Syllabus PDF",
    shortInfo: "Official syllabus PDF.",
    directLink: "https://ssc.gov.in/syllabus.pdf",
    status: "published",
    url: "/material/ssc-cgl-syllabus"
  }, { now: NOW });
  assert.equal(material.contentType, "STUDY_MATERIAL");
  assert.equal(hasWordCountPenalty(material), false);
});

test("technical dimension is unavailable by default and does not invent HTTP issues", () => {
  const audit = auditPage({
    id: "job-1",
    collection: "jobs",
    title: "SSC CGL 2026 Recruitment Apply Online",
    lastDate: "31/12/2026",
    applyLink: "https://ssc.gov.in",
    status: "published",
    url: "/job/ssc-cgl-2026"
  }, { now: NOW });
  assert.equal(audit.dimensions.technical.status, "unavailable");
  assert.match(audit.dimensions.technical.reason || "", /not enabled/i);
  assert.ok(!audit.findings.some((item) => item.dimension === "technical"));
});

test("optional httpResult can surface a 404 without enabling HTTP by default", () => {
  const audit = auditPage({
    id: "job-404",
    collection: "jobs",
    title: "Gone job",
    url: "/job/gone",
    status: "published"
  }, { now: NOW, httpResult: { status: 404, issues: ["not_found"] } });
  assert.ok(findingIds(audit).includes("technical:not-found"));
  assert.equal(audit.dimensions.technical.status, "issues");
});

test("missing GSC is unavailable and never fabricated; imported low CTR is a gsc finding", () => {
  const page = {
    id: "job-gsc",
    collection: "jobs",
    title: "SSC CGL 2026 Recruitment Apply Online",
    lastDate: "31/12/2026",
    applyLink: "https://ssc.gov.in",
    status: "published",
    url: "/job/ssc-cgl-2026"
  };
  const without = auditPage(page, { now: NOW });
  assert.equal(without.dimensions.gsc.status, "unavailable");
  assert.ok(!findingIds(without).includes("gsc:low-ctr"));

  const foreignRows = [{ query: "spam", page: "https://evil.example/job/ssc-cgl-2026", clicks: 9, impressions: 9999, ctr: 0.01, position: 3 }];
  const foreignIgnored = auditPage(page, { now: NOW, gscRows: foreignRows });
  assert.equal(foreignIgnored.dimensions.gsc.status, "unavailable");
  assert.equal(gscRowsForPage(foreignRows, page.url).length, 0);

  const withGsc = auditPage(page, {
    now: NOW,
    gscRows: [{
      query: "ssc cgl apply",
      page: "https://studygyaan.in/job/ssc-cgl-2026",
      clicks: 4,
      impressions: 400,
      ctr: 0.01,
      position: 6
    }]
  });
  assert.ok(findingIds(withGsc).includes("gsc:low-ctr"));
  const gscFinding = withGsc.findings.find((item) => item.id === "gsc:low-ctr");
  assert.equal(gscFinding.confidence, "gsc");
  assert.equal(gscFinding.evidence.impressions, 400);
});

test("Page SEO Health is diagnostic, not a Google ranking score", () => {
  const audit = auditPage({
    id: "blog-1",
    collection: "blogs",
    title: "How to fill SSC CGL form",
    articleHtml: "<h1>How to fill SSC CGL form</h1><h2>Steps</h2><p>Use the official site.</p>",
    status: "published",
    url: "/blog/ssc-cgl-form"
  }, { now: NOW });
  assert.match(audit.health.note, /not a Google ranking score/i);
  const health = computeHealth(audit.findings);
  assert.equal(health.score, audit.health.score);
  assert.match(health.note, /diagnostic score/i);
});

test("expired jobs with stored JobPosting schema get an advisory finding", () => {
  const audit = auditPage({
    id: "job-exp",
    collection: "jobs",
    title: "SSC CGL 2025 Recruitment Apply Online",
    lastDate: "01/06/2026",
    applyLink: "https://ssc.gov.in",
    schemaMarkup: JSON.stringify({ "@type": "JobPosting" }),
    status: "published",
    url: "/job/ssc-cgl-2025"
  }, { now: NOW });
  assert.ok(findingIds(audit).includes("schema:expired-jobposting"));
});

test("clickbait titles are flagged; autoFixLevel stays advisory", () => {
  const audit = auditPage({
    id: "blog-click",
    collection: "blogs",
    title: "You won't believe this viral SSC secret trick",
    articleHtml: "<h1>You won't believe this viral SSC secret trick</h1><p>x</p>",
    status: "published",
    url: "/blog/clickbait"
  }, { now: NOW });
  assert.ok(findingIds(audit).includes("metadata:clickbait-or-allcaps-title"));
  assert.ok(audit.findings.every((item) => ["A", "B", "C"].includes(item.autoFixLevel)));
});

test("sample is published-only, max 40, about 10 per primary type", () => {
  const jobs = Array.from({ length: 20 }, (_, i) => ({ id: `j${i}`, status: i === 0 ? "draft" : "published" }));
  const blogs = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, status: "published" }));
  const fast_track = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, status: "published" }));
  const mock_tests = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, status: "published" }));
  const sample = selectAuditSample({ jobs, blogs, fast_track, mock_tests });
  assert.ok(sample.length <= MAX_PAGE_AUDITS);
  assert.equal(sample.filter((item) => item.id.startsWith("j")).length, 10);
  assert.ok(!sample.some((item) => item.status === "draft"));
  const tooMany = auditPages(Array.from({ length: 50 }, (_, i) => ({
    id: `x${i}`,
    collection: "jobs",
    title: `Job ${i} Recruitment Apply Online`,
    status: "published",
    url: `/job/${i}`
  })), { now: NOW });
  assert.equal(tooMany.length, MAX_PAGE_AUDITS);
});

test("write guard refuses public content collections and allowlists admin SEO docs only", () => {
  for (const name of PUBLIC_CONTENT_COLLECTIONS) {
    assert.throws(() => assertAllowedAuditWrite(name), /AUDIT_WRITE_FORBIDDEN|refused|may only persist/);
  }
  assert.throws(() => assertAllowedAuditWrite("seo_page_audits"), /may only persist/);
  assert.equal(assertAllowedAuditWrite("system_settings"), true);
  assert.equal(assertAllowedAuditWrite("seo_intelligence_runs"), true);
  assert.deepEqual(AUDIT_WRITE_ALLOWLIST.slice().sort(), ["seo_intelligence_runs", "system_settings"]);
});

test("persistPageAudits writes compact audits only to system_settings (and optional run doc)", async () => {
  const writes = [];
  const db = {
    collection(name) {
      return {
        doc(id) {
          return {
            async set(data, opts) {
              writes.push({ collection: name, id, data, opts });
            }
          };
        }
      };
    }
  };
  const audits = auditPages([{
    id: "job-1",
    collection: "jobs",
    title: "SSC CGL 2026 Recruitment Apply Online",
    lastDate: "31/12/2026",
    applyLink: "https://ssc.gov.in",
    status: "published",
    url: "/job/ssc-cgl-2026"
  }], { now: NOW });
  const result = await persistPageAudits(db, { serverTimestamp: () => "ts" }, audits, { runId: "run-1" });
  assert.equal(result.written, 1);
  assert.equal(result.collection, "system_settings");
  assert.ok(writes.every((w) => w.collection === "system_settings" || w.collection === "seo_intelligence_runs"));
  assert.ok(!writes.some((w) => PUBLIC_CONTENT_COLLECTIONS.includes(w.collection)));
  const settingsWrite = writes.find((w) => w.collection === "system_settings");
  assert.equal(settingsWrite.id, "seo_intelligence");
  assert.equal(settingsWrite.data.pageAudits.length, 1);
  assert.equal(compactAudit(audits[0]).url, settingsWrite.data.pageAudits[0].url);
  const dry = await persistPageAudits(db, null, audits, { dryRun: true });
  assert.equal(dry.written, 0);
});

test("orchestrator still writes catalog recs and stores page audits off public content", async () => {
  const { runSeoIntelligence } = require("../agents/seo_intelligence/orchestrator");
  const writes = [];
  const jobDoc = {
    id: "job-ssc-cgl",
    data: () => ({
      title: "SSC CGL 2026 Recruitment Apply Online",
      slug: "ssc-cgl-2026",
      lastDate: "31/12/2026",
      type: "JOB",
      applyLink: "https://ssc.gov.in",
      createdAt: { toDate: () => new Date("2026-01-01") },
      lifecycleStatus: "OPEN",
      includeJobPostingSchema: true,
      sitemapPriority: 0.8
    })
  };
  const db = {
    collection(name) {
      return {
        orderBy() {
          return {
            limit() {
              return {
                async get() {
                  return { docs: name === "jobs" ? [jobDoc] : [] };
                }
              };
            }
          };
        },
        doc(id) {
          return {
            async get() {
              return { exists: false, data: () => ({}) };
            },
            async set(data, opts) {
              writes.push({ collection: name, id, data, opts });
            }
          };
        }
      };
    }
  };
  const report = await runSeoIntelligence(db, { serverTimestamp: () => "ts" }, {
    force: true,
    now: NOW,
    maxJobs: 10,
    maxUpdates: 10
  });
  assert.equal(report.ok, true);
  assert.ok(report.pageAuditCount >= 1);
  assert.equal(report.policy.pageAuditApply, false);
  assert.ok(report.recommendationCount >= 1);
  assert.ok(writes.some((w) => w.collection === "seo_recommendations"));
  assert.ok(writes.some((w) => w.collection === "system_settings" && Array.isArray(w.data.pageAudits)));
  assert.ok(writes.some((w) => w.collection === "seo_intelligence_runs" && Array.isArray(w.data.pageAudits)));
  assert.ok(writes.some((w) => w.collection === "system_settings" && Array.isArray(w.data.optimizationProposals)));
  assert.ok(!writes.some((w) => ["jobs", "blogs", "fast_track", "mock_tests", "seo_page_audits", "seo_optimization_proposals"].includes(w.collection)));
  assert.equal(report.policy.optimizationApply, false);
});

test("empty mock test is flagged for missing questions, not thin copy", () => {
  const audit = auditPage({
    id: "mock-empty",
    collection: "mock_tests",
    title: "Banking Mock Test",
    status: "published",
    url: "/test/empty"
  }, { now: NOW });
  assert.ok(findingIds(audit).includes("content:mock-missing-questions"));
  assert.equal(hasWordCountPenalty(audit), false);
});
