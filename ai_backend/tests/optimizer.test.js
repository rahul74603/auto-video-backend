"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { auditPage } = require("../agents/seo_intelligence/page_auditor");
const {
  generateProposals,
  generateProposalsForAudits,
  persistOptimizationProposals,
  setProposalStatus,
  refuseFactMutation,
  FACT_FIELDS,
  SETTINGS,
  SETTINGS_DOC
} = require("../agents/seo_intelligence/optimizer");
const {
  assertAllowedProposalWrite,
  buildProposal,
  PUBLIC_CONTENT_COLLECTIONS
} = require("../agents/seo_intelligence/proposal_model");
const { runSeoIntelligence } = require("../agents/seo_intelligence/orchestrator");

const NOW = new Date("2026-08-26T00:00:00Z");

function fieldsOf(proposals) {
  return (proposals || []).map((item) => item.field);
}

function mockDb(writes, { previous } = {}) {
  return {
    collection(name) {
      return {
        orderBy() {
          return {
            limit() {
              return { async get() { return { docs: [] }; } };
            }
          };
        },
        doc(id) {
          return {
            async get() {
              if (name === SETTINGS && id === SETTINGS_DOC && previous) {
                return { exists: true, data: () => ({ optimizationProposals: previous }) };
              }
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
}

test("1 meta: missing job meta proposes copy from existing facts only", () => {
  const page = {
    id: "job-meta",
    collection: "jobs",
    title: "SSC CGL 2026 Recruitment Apply Online",
    organization: "Staff Selection Commission",
    lastDate: "31/12/2026",
    applyLink: "https://ssc.gov.in",
    status: "published",
    url: "/job/ssc-cgl-2026",
    authorName: "StudyGyaan Editorial Team"
  };
  const audit = auditPage(page, { now: NOW });
  const proposals = generateProposals(audit, page, { now: NOW });
  const meta = proposals.find((item) => item.field === "metaDescription");
  assert.ok(meta, "expected a metaDescription proposal");
  assert.match(String(meta.proposedValue), /SSC CGL 2026/);
  assert.match(String(meta.proposedValue), /31\/12\/2026|Staff Selection Commission/);
  assert.equal(/5432|₹|vacanc/i.test(String(meta.proposedValue)), false);
  assert.equal(meta.status, "pending");
  assert.equal(meta.applied, false);
});

test("2 short-blog: plan sections, never expand to 1500 words", () => {
  const page = {
    id: "blog-thin",
    collection: "blogs",
    title: "How to fill SSC CGL form",
    articleHtml: "<p>Use the official website only.</p>",
    wordCount: 11,
    status: "published",
    url: "/blog/ssc-cgl-form"
  };
  const audit = auditPage(page, { now: NOW });
  const proposals = generateProposals(audit, page, { now: NOW });
  const plan = proposals.find((item) => item.field === "contentPlan");
  assert.ok(plan);
  const blob = JSON.stringify(plan.proposedValue);
  assert.equal(/1500|word-count target|pad to/i.test(blob + plan.reason), /pad to|word-count target/i.test(plan.reason) || /not a 1500-word quota/i.test(blob));
  assert.equal(/expand to 1500/i.test(blob + plan.reason), false);
  assert.ok(Array.isArray(plan.proposedValue.suggestedSections));
  assert.ok(plan.proposedValue.suggestedSections.length >= 1);
  assert.match(String(plan.proposedValue.likelyReason || ""), /incomplete|structure|stub|short/i);
});

test("3 job title already aligned is left alone", () => {
  const page = {
    id: "job-ok-title",
    collection: "jobs",
    title: "SSC CGL 2026 Recruitment Apply Online",
    seoTitle: "SSC CGL 2026 Recruitment Apply Online",
    metaDescription: "SSC CGL 2026 recruitment apply online. Last date 31/12/2026. Use the official SSC link on this page.",
    lastDate: "31/12/2026",
    organization: "SSC",
    applyLink: "https://ssc.gov.in",
    status: "published",
    url: "/job/ssc-cgl-2026",
    authorName: "StudyGyaan Editorial Team"
  };
  const audit = auditPage(page, { now: NOW });
  const proposals = generateProposals(audit, page, { now: NOW });
  assert.ok(!proposals.some((item) => item.field === "seoTitle"));
});

test("4 job facts stay locked — no invented replacement", () => {
  for (const field of ["salary", "vacancies", "qualification", "applyLink", "advtNo"]) {
    const blocked = refuseFactMutation(field, "invented-value");
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.value, null);
    assert.equal(blocked.level, "C");
    assert.equal(blocked.requiresReview, true);
  }
  const locked = buildProposal({
    field: "salary",
    proposedValue: "₹50,000 invented",
    evidenceIds: ["manual"],
    url: "/job/x",
    contentType: "JOB",
    contentId: "x",
    reason: "should not apply"
  });
  assert.equal(locked.proposedValue, null);
  assert.equal(locked.level, "C");
  assert.equal(locked.requiresReview, true);
  assert.ok(FACT_FIELDS.includes("organization"));
});

test("5 expired JobPosting is omitted, never re-added", () => {
  const page = {
    id: "job-exp",
    collection: "jobs",
    title: "SSC CGL 2025 Recruitment Apply Online",
    lastDate: "01/06/2026",
    applyLink: "https://ssc.gov.in",
    schemaMarkup: JSON.stringify({ "@type": "JobPosting" }),
    status: "published",
    url: "/job/ssc-cgl-2025",
    authorName: "StudyGyaan Editorial Team"
  };
  const audit = auditPage(page, { now: NOW });
  const proposals = generateProposals(audit, page, { now: NOW });
  const schema = proposals.find((item) => item.field === "schemaMarkup");
  assert.ok(schema);
  assert.match(String(schema.proposedValue), /omit JobPosting/i);
  assert.equal(/^JobPosting$/i.test(String(schema.proposedValue)), false);
  assert.equal(/re-?add/i.test(String(schema.proposedValue)), false);
});

test("6 short fast-track is not expanded", () => {
  const page = {
    id: "admit-1",
    collection: "fast_track",
    title: "SSC CGL Admit Card 2026",
    category: "Admit Card",
    shortInfo: "Admit card released.",
    directLink: "https://ssc.gov.in/admit",
    status: "published",
    url: "/update/ssc-cgl-admit-card-2026",
    authorName: "StudyGyaan Editorial Team"
  };
  const audit = auditPage(page, { now: NOW });
  const proposals = generateProposals(audit, page, { now: NOW });
  assert.ok(!fieldsOf(proposals).includes("contentPlan"));
  assert.ok(!proposals.some((item) => /1500|expand/i.test(JSON.stringify(item.proposedValue || "") + item.reason)));
});

test("7 mock missing questions stay level C with no invented items", () => {
  const page = {
    id: "mock-empty",
    collection: "mock_tests",
    title: "SSC CGL Mock Test",
    status: "published",
    url: "/test/ssc-cgl-mock"
  };
  const audit = auditPage(page, { now: NOW });
  const proposals = generateProposals(audit, page, { now: NOW });
  const questions = proposals.find((item) => item.field === "questions");
  assert.ok(questions);
  assert.equal(questions.proposedValue, null);
  assert.equal(questions.level, "C");
  assert.equal(questions.requiresReview, true);
});

test("8 study material short copy is acceptable", () => {
  const page = {
    id: "pdf-1",
    collection: "study_materials",
    title: "SSC CGL Syllabus PDF",
    shortInfo: "Official syllabus PDF.",
    directLink: "https://ssc.gov.in/syllabus.pdf",
    status: "published",
    url: "/material/ssc-cgl-syllabus"
  };
  const audit = auditPage(page, { now: NOW });
  const proposals = generateProposals(audit, page, { now: NOW });
  assert.ok(!fieldsOf(proposals).includes("contentPlan"));
});

test("9 no fake GSC proposal when Search Console rows are missing", () => {
  const page = {
    id: "job-gsc",
    collection: "jobs",
    title: "SSC CGL 2026 Recruitment Apply Online",
    lastDate: "31/12/2026",
    applyLink: "https://ssc.gov.in",
    status: "published",
    url: "/job/ssc-cgl-2026"
  };
  const audit = auditPage(page, { now: NOW });
  const proposals = generateProposals(audit, page, { now: NOW });
  assert.ok(!proposals.some((item) => (item.evidenceIds || []).includes("gsc:low-ctr")));
  assert.equal(audit.dimensions.gsc.status, "unavailable");
});

test("10 related link proposals never invent unknown URLs", () => {
  const page = {
    id: "job-links",
    collection: "jobs",
    title: "SSC CGL 2026 Recruitment Apply Online",
    examFamily: "SSC",
    contentKind: "JOB",
    lastDate: "31/12/2026",
    applyLink: "https://ssc.gov.in",
    status: "published",
    url: "/job/ssc-cgl-2026",
    slug: "ssc-cgl-2026"
  };
  const catalog = [
    page,
    {
      id: "admit-ssc",
      title: "SSC CGL Admit Card",
      type: "FAST_TRACK",
      examFamily: "SSC",
      contentKind: "ADMIT_CARD",
      slug: "ssc-cgl-admit",
      status: "published",
      url: "/update/ssc-cgl-admit"
    }
  ];
  const audit = auditPage(page, { now: NOW, catalog });
  const proposals = generateProposals(audit, page, { now: NOW, catalog });
  const links = proposals.find((item) => item.field === "relatedLinks");
  if (links) {
    assert.ok(Array.isArray(links.proposedValue));
    for (const item of links.proposedValue) {
      assert.equal(String(item.url).startsWith("/"), true);
      assert.equal(String(item.url).startsWith("//"), false);
      assert.equal(/example\.com|evil|http:\/\//i.test(item.url), false);
    }
  }
});

test("11 status change writes only admin SEO settings, never public content", async () => {
  const writes = [];
  const db = mockDb(writes);
  const pending = [buildProposal({
    id: "p1",
    url: "/job/x",
    contentType: "JOB",
    contentId: "x",
    field: "metaDescription",
    proposedValue: "SSC CGL 2026 apply online using the official link.",
    evidenceIds: ["metadata:missing-description"],
    level: "B"
  })];
  const persisted = await persistOptimizationProposals(db, { serverTimestamp: () => "ts" }, pending);
  assert.equal(persisted.collection, "system_settings");
  assert.ok(writes.every((w) => w.collection === "system_settings" || w.collection === "seo_intelligence_runs"));
  assert.ok(!writes.some((w) => PUBLIC_CONTENT_COLLECTIONS.includes(w.collection)));
  assert.equal(writes.find((w) => w.collection === SETTINGS).id, SETTINGS_DOC);

  const next = setProposalStatus(pending, "p1", "approved", { now: NOW });
  assert.equal(next[0].status, "approved");
  assert.equal(next[0].applied, false);
  for (const name of PUBLIC_CONTENT_COLLECTIONS) {
    assert.throws(() => assertAllowedProposalWrite(name), /AUDIT_WRITE_FORBIDDEN|refused|may only persist/);
  }
});

test("12 level B is never auto-applied", () => {
  const proposal = buildProposal({
    field: "metaDescription",
    proposedValue: "SSC CGL 2026 apply online. Last date 31/12/2026.",
    evidenceIds: ["metadata:missing-description"],
    level: "B",
    contentType: "JOB",
    contentId: "job-1",
    url: "/job/ssc-cgl-2026"
  });
  assert.equal(proposal.level, "B");
  assert.equal(proposal.status, "pending");
  assert.equal(proposal.applied, false);
  assert.equal(proposal.requiresReview, true);
});

test("13 level C always requires review", () => {
  const proposal = buildProposal({
    field: "questions",
    proposedValue: [{ question: "invented?" }],
    evidenceIds: ["content:mock-missing-questions"],
    level: "C",
    contentType: "MOCK_TEST",
    contentId: "mock-1",
    url: "/test/x"
  });
  assert.equal(proposal.level, "C");
  assert.equal(proposal.requiresReview, true);
  assert.equal(proposal.proposedValue, null);
  assert.equal(proposal.applied, false);
});

test("14 findings without evidence produce no proposal", () => {
  const page = {
    id: "job-ev",
    collection: "jobs",
    title: "SSC CGL 2026 Recruitment Apply Online",
    url: "/job/ssc-cgl-2026"
  };
  const audit = {
    url: page.url,
    contentType: "JOB",
    contentId: page.id,
    findings: [{ id: "metadata:missing-description", severity: "high", confidence: "observed" }]
  };
  const proposals = generateProposals(audit, page, { now: NOW });
  assert.equal(proposals.length, 0);
});

test("15 catalog recommendations still persist; proposals stay off public content", async () => {
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
  assert.equal(report.policy.optimizationApply, false);
  assert.ok(report.recommendationCount >= 1);
  assert.ok(writes.some((w) => w.collection === "seo_recommendations"));
  assert.ok(writes.some((w) => w.collection === "system_settings" && Array.isArray(w.data.optimizationProposals)));
  assert.ok(!writes.some((w) => ["jobs", "blogs", "fast_track", "mock_tests", "seo_optimization_proposals"].includes(w.collection)));
  assert.equal(generateProposalsForAudits([], [], {}).length, 0);
});
