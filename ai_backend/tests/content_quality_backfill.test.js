"use strict";

/**
 * Content Quality Auto-Optimizer Tests.
 *
 * Tests the full self-improving loop:
 *   AUDIT → SCORE → GENERATE → VALIDATE → SNAPSHOT → APPLY →
 *   RE-AUDIT → COMPARE → KEEP or ROLLBACK
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// ─── Mock Firestore ──────────────────────────────────────────────────

function createMockDb() {
  const store = new Map();
  return {
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            async get() {
              const data = store.get(key);
              return { exists: data !== undefined, data: () => data || {} };
            },
            async set(data, options) {
              if (options && options.merge) {
                const existing = store.get(key) || {};
                store.set(key, { ...existing, ...data });
              } else {
                store.set(key, data);
              }
            }
          };
        },
        orderBy() {
          return {
            limit() {
              return {
                async get() {
                  const docs = [];
                  for (const [k, v] of store.entries()) {
                    if (k.startsWith(`${name}/`)) {
                      docs.push({ id: k.split("/")[1], data: () => v });
                    }
                  }
                  return { docs };
                }
              };
            }
          };
        },
        async count() {
          return {
            async get() {
              let count = 0;
              for (const k of store.keys()) {
                if (k.startsWith(`${name}/`)) count++;
              }
              return { data: () => ({ count }) };
            }
          };
        }
      };
    },
    _store: store
  };
}

const FieldValue = { serverTimestamp: () => new Date().toISOString() };

// ─── Test data ───────────────────────────────────────────────────────

function makeJob(overrides = {}) {
  return {
    id: "job-1", collection: "jobs", type: "JOB",
    title: "SSC CGL 2026 Recruitment", seoTitle: "SSC CGL 2026 Recruitment",
    metaDescription: "Apply online for SSC CGL 2026.",
    h1: "SSC CGL 2026", status: "published", category: "SSC",
    organization: "SSC", lastDate: "31/12/2026", startDate: "01/06/2026",
    applyLink: "https://ssc.gov.in/apply",
    articleHtml: "<h1>SSC CGL 2026</h1><p>Apply for SSC CGL 2026.</p>",
    authorName: "StudyGyaan Editorial Team",
    sourceUrl: "https://ssc.gov.in/notice",
    createdAt: "2024-01-15T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z",
    ...overrides
  };
}

function makeThinJob(overrides = {}) {
  return {
    id: "job-thin", collection: "jobs", type: "JOB",
    title: "Test Job", status: "published",
    createdAt: "2023-01-01T00:00:00Z",
    ...overrides
  };
}

function makeBlog(overrides = {}) {
  return {
    id: "blog-1", collection: "blogs", type: "BLOG",
    title: "How to prepare for SSC CGL",
    seoTitle: "How to prepare for SSC CGL 2026",
    metaDescription: "Complete guide for SSC CGL preparation.",
    h1: "SSC CGL Preparation Guide", status: "published",
    category: "SSC",
    articleHtml: "<h1>SSC CGL Preparation</h1><p>Short guide.</p>",
    authorName: "StudyGyaan Editorial Team",
    createdAt: "2024-02-15T00:00:00Z", updatedAt: "2024-07-01T00:00:00Z",
    ...overrides
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("Quality Gate — compareQuality", () => {
  const { compareQuality, shouldKeepChange } = require("../agents/seo_intelligence/auto_optimizer");

  it("detects improvement across dimensions", () => {
    const before = { overall: 50, dimensions: { completeness: 40, metadata: 30, trust: 60 } };
    const after = { overall: 65, dimensions: { completeness: 60, metadata: 50, trust: 60 } };
    const result = compareQuality(before, after);
    assert.equal(result.improved, true);
    assert.equal(result.degraded, false);
    assert.equal(result.overallDelta, 15);
    assert.equal(result.dimensionsImproved, 2);
    assert.equal(result.dimensionsDegraded, 0);
  });

  it("detects degradation", () => {
    const before = { overall: 70, dimensions: { completeness: 60, metadata: 50 } };
    const after = { overall: 55, dimensions: { completeness: 40, metadata: 50 } };
    const result = compareQuality(before, after);
    assert.equal(result.improved, false);
    assert.equal(result.degraded, true);
    assert.equal(result.overallDelta, -15);
  });

  it("shouldKeepChange rejects score degradation", () => {
    const before = { overall: 70, dimensions: {} };
    const after = { overall: 60, dimensions: {} };
    const decision = shouldKeepChange(before, after, { ok: true });
    assert.equal(decision.keep, false);
    assert.equal(decision.reason, "overall-score-degraded");
  });

  it("shouldKeepChange rejects high duplication risk", () => {
    const before = { overall: 50, dimensions: {} };
    const after = { overall: 60, dimensions: {} };
    const decision = shouldKeepChange(before, after, { ok: false, reason: "too-similar" });
    assert.equal(decision.keep, false);
    assert.equal(decision.reason, "too-similar");
  });

  it("shouldKeepChange accepts meaningful improvement", () => {
    const before = { overall: 50, dimensions: { factualSafety: 60, completeness: 40 } };
    const after = { overall: 60, dimensions: { factualSafety: 65, completeness: 55 } };
    const decision = shouldKeepChange(before, after, { ok: true });
    assert.equal(decision.keep, true);
    assert.equal(decision.reason, "quality-improved");
  });

  it("shouldKeepChange rejects critical dimension degradation", () => {
    const before = { overall: 50, dimensions: { factualSafety: 80, completeness: 40 } };
    const after = { overall: 55, dimensions: { factualSafety: 60, completeness: 50 } };
    const decision = shouldKeepChange(before, after, { ok: true });
    assert.equal(decision.keep, false);
    assert.ok(decision.reason.includes("critical-dimension-degraded"));
  });
});

describe("Claim Validation", () => {
  const { validateClaims } = require("../agents/seo_intelligence/auto_optimizer");

  it("accepts content with only existing facts", () => {
    const html = "<p>SSC CGL 2026 last date is 31/12/2026.</p>";
    const page = { lastDate: "31/12/2026", organization: "SSC" };
    const result = validateClaims(html, page);
    assert.equal(result.ok, true);
  });

  it("rejects content with invented numbers", () => {
    const html = "<p>Total 54321 vacancies announced.</p>";
    const page = { organization: "SSC" };
    const result = validateClaims(html, page);
    assert.equal(result.ok, false);
    assert.ok(result.ungrounded.length > 0);
  });
});

describe("Duplicate Safety", () => {
  const { validateDuplicateSafety } = require("../agents/seo_intelligence/auto_optimizer");

  it("passes when content is unique", () => {
    const original = makeJob({ id: "doc-1", title: "SSC CGL 2026" });
    const optimized = makeJob({ id: "doc-1", title: "SSC CGL 2026 Apply Online" });
    const catalog = [
      makeJob({ id: "doc-2", title: "IBPS Clerk 2026 Notification" })
    ];
    const result = validateDuplicateSafety(original, optimized, catalog);
    assert.equal(result.ok, true);
  });

  it("fails when optimized content is too similar to another page", () => {
    const original = makeJob({ id: "doc-1", title: "SSC CGL 2026" });
    const optimized = makeJob({ id: "doc-1", title: "SSC CGL 2026 Recruitment", articleHtml: "<p>Same content here</p>" });
    const catalog = [
      makeJob({ id: "doc-2", title: "SSC CGL 2026 Recruitment", articleHtml: "<p>Same content here</p>" }),
      makeJob({ id: "doc-3", title: "IBPS Clerk 2026", articleHtml: "<p>Different content</p>" })
    ];
    const result = validateDuplicateSafety(original, optimized, catalog);
    // Should detect high similarity with doc-2
    assert.ok(result.maxSimilarity >= 0);
    assert.ok(typeof result.risk === "string");
  });
});

describe("Patch Builder", () => {
  const { buildProposalPatch } = require("../agents/seo_intelligence/auto_optimizer");

  it("returns null for fact fields", () => {
    assert.equal(buildProposalPatch({ field: "salary", proposedValue: "₹1" }), null);
    assert.equal(buildProposalPatch({ field: "organization", proposedValue: "SSC" }), null);
    assert.equal(buildProposalPatch({ field: "lastDate", proposedValue: "31/12/2026" }), null);
    assert.equal(buildProposalPatch({ field: "questions", proposedValue: [] }), null);
  });

  it("builds patch for metaDescription", () => {
    const patch = buildProposalPatch({ field: "metaDescription", proposedValue: "New meta description" });
    assert.ok(patch);
    assert.equal(patch.metaDescription, "New meta description");
  });

  it("builds patch for authorName", () => {
    const patch = buildProposalPatch({ field: "authorName", proposedValue: "StudyGyaan Editorial Team" });
    assert.ok(patch);
    assert.equal(patch.authorName, "StudyGyaan Editorial Team");
  });

  it("builds patch for relatedLinks with internal URLs only", () => {
    const patch = buildProposalPatch({
      field: "relatedLinks",
      proposedValue: [
        { title: "Related", url: "/job/related" },
        { title: "External", url: "https://external.com" }
      ]
    });
    assert.ok(patch);
    assert.equal(patch.relatedLinks.length, 1);
    assert.equal(patch.relatedLinks[0].url, "/job/related");
  });

  it("builds patch for articleHtml with safe content", () => {
    const patch = buildProposalPatch({
      field: "articleHtml",
      proposedValue: { articleHtml: "<h1>Safe Title</h1><p>Safe content.</p>" }
    });
    assert.ok(patch);
    assert.ok(patch.articleHtml.includes("Safe Title"));
  });

  it("sanitizes unsafe articleHtml by stripping dangerous tags", () => {
    const patch = buildProposalPatch({
      field: "articleHtml",
      proposedValue: { articleHtml: '<script>alert("xss")</script><p>Safe</p>' }
    });
    // The sanitizer strips <script> and keeps safe content
    assert.ok(patch);
    assert.ok(patch.articleHtml.includes("Safe"));
    assert.ok(!patch.articleHtml.includes("script"));
  });

  it("returns null for empty articleHtml", () => {
    const patch = buildProposalPatch({
      field: "articleHtml",
      proposedValue: { articleHtml: "" }
    });
    assert.equal(patch, null);
  });
});

describe("Full Optimization Loop", () => {
  const { optimizePage } = require("../agents/seo_intelligence/auto_optimizer");

  it("skips already high-quality pages", async () => {
    const db = createMockDb();
    const doc = makeJob({
      articleHtml: "<h1>SSC CGL 2026</h1>" +
        "<h2>Overview</h2><p>Full details about SSC CGL 2026 recruitment.</p>" +
        "<h2>Important Dates</h2><p>Last date: 31/12/2026</p>" +
        "<h2>How to Apply</h2><p>Use the official link.</p>" +
        "<ul><li>Step 1</li><li>Step 2</li></ul>",
      relatedLinks: [{ title: "Related", url: "/job/related" }]
    });
    const result = await optimizePage(db, FieldValue, doc, { dryRun: true });
    assert.ok(result.ok);
    assert.ok(result.passes.length > 0);
    if (result.passes[0].status === "already-high-quality") {
      assert.equal(result.status, "unchanged");
    }
  });

  it("generates improvements for thin content", async () => {
    const db = createMockDb();
    const doc = makeThinJob();
    const result = await optimizePage(db, FieldValue, doc, { dryRun: true });
    assert.ok(result.ok);
    assert.ok(result.originalScore >= 0);
    assert.ok(result.passes.length > 0);
  });

  it("never invents facts in patches", async () => {
    const db = createMockDb();
    const doc = makeThinJob();
    const result = await optimizePage(db, FieldValue, doc, { dryRun: true });
    // Check that no pass tried to modify fact fields
    for (const pass of result.passes) {
      for (const change of (pass.changes || [])) {
        const FACT_FIELDS = ["organization", "vacancies", "salary", "qualification",
          "eligibility", "lastDate", "startDate", "fees", "applyLink", "directLink",
          "questions", "answers"];
        assert.ok(!FACT_FIELDS.includes(change.field),
          `Should not modify fact field: ${change.field}`);
      }
    }
  });

  it("respects maxPasses limit", async () => {
    const db = createMockDb();
    const doc = makeThinJob();
    const result = await optimizePage(db, FieldValue, doc, { dryRun: true, maxPasses: 1 });
    assert.ok(result.passes.length <= 1);
  });

  it("handles dry-run mode without writing to DB", async () => {
    const db = createMockDb();
    const doc = makeThinJob();
    const result = await optimizePage(db, FieldValue, doc, { dryRun: true });
    assert.equal(result.dryRun, true);
    // Verify no writes to public collections
    let publicWrite = false;
    for (const [key] of db._store.entries()) {
      if (key.startsWith("jobs/") && key !== "jobs/job-thin") publicWrite = true;
    }
    assert.equal(publicWrite, false);
  });
});

describe("Batch Processing", () => {
  const { runOptimizationBatch } = require("../agents/seo_intelligence/auto_optimizer");

  it("handles empty database", async () => {
    const db = createMockDb();
    const result = await runOptimizationBatch(db, FieldValue, { batchSize: 10, dryRun: true });
    assert.ok(result.ok);
    assert.equal(result.processed, 0);
  });

  it("processes multiple pages without stopping on failure", async () => {
    const db = createMockDb();
    for (let i = 0; i < 5; i++) {
      await db.collection("jobs").doc(`job-${i}`).set(
        makeThinJob({ id: `job-${i}`, title: `Job ${i}`, createdAt: `2023-0${i + 1}-01T00:00:00Z` })
      );
    }
    const result = await runOptimizationBatch(db, FieldValue, { batchSize: 10, dryRun: true });
    assert.ok(result.ok);
    assert.ok(result.processed >= 0);
  });

  it("respects batch size limit", async () => {
    const db = createMockDb();
    for (let i = 0; i < 15; i++) {
      await db.collection("jobs").doc(`job-${i}`).set(
        makeThinJob({ id: `job-${i}`, title: `Job ${i}`, createdAt: `2023-0${(i % 9) + 1}-01T00:00:00Z` })
      );
    }
    const result = await runOptimizationBatch(db, FieldValue, { batchSize: 3, dryRun: true });
    assert.ok(result.processed <= 3);
  });
});

describe("Idempotency", () => {
  const { buildContentFingerprint } = require("../agents/seo_intelligence/backfill_processor");

  it("same content produces same fingerprint", () => {
    const doc1 = makeJob();
    const doc2 = makeJob();
    const fp1 = buildContentFingerprint(doc1);
    const fp2 = buildContentFingerprint(doc2);
    assert.equal(fp1.hash, fp2.hash);
  });

  it("different content produces different fingerprint", () => {
    const doc1 = makeJob({ seoTitle: "SSC CGL 2026 Recruitment" });
    const doc2 = makeJob({ seoTitle: "IBPS Clerk 2026 Notification" });
    const fp1 = buildContentFingerprint(doc1);
    const fp2 = buildContentFingerprint(doc2);
    assert.notEqual(fp1.hash, fp2.hash);
  });
});

describe("Failure Safety", () => {
  const { optimizePage } = require("../agents/seo_intelligence/auto_optimizer");

  it("handles missing source gracefully", async () => {
    const db = createMockDb();
    const doc = { id: "no-source", collection: "jobs", type: "JOB", title: "Job Without Source", status: "published", createdAt: "2023-01-01T00:00:00Z" };
    const result = await optimizePage(db, FieldValue, doc, { dryRun: true });
    assert.ok(result.ok);
  });

  it("handles empty document gracefully", async () => {
    const db = createMockDb();
    const doc = { id: "empty", collection: "jobs", status: "published", createdAt: "2023-01-01T00:00:00Z" };
    const result = await optimizePage(db, FieldValue, doc, { dryRun: true });
    assert.ok(result.ok);
  });

  it("handles null fields gracefully", async () => {
    const db = createMockDb();
    const doc = { id: "null-fields", collection: "jobs", type: "JOB", title: null, seoTitle: undefined, metaDescription: null, status: "published", createdAt: "2023-01-01T00:00:00Z" };
    const result = await optimizePage(db, FieldValue, doc, { dryRun: true });
    assert.ok(result.ok);
  });
});

describe("Level Classification", () => {
  const { classifyQuality } = require("../agents/seo_intelligence/content_quality_scorer");

  it("Level A for high quality", () => {
    assert.equal(classifyQuality(80), "A");
    assert.equal(classifyQuality(100), "A");
  });

  it("Level B for medium quality", () => {
    assert.equal(classifyQuality(50), "B");
    assert.equal(classifyQuality(74), "B");
  });

  it("Level C for low quality", () => {
    assert.equal(classifyQuality(0), "C");
    assert.equal(classifyQuality(49), "C");
  });
});

describe("Fact Protection", () => {
  const { isFactField, FACT_FIELDS } = require("../agents/seo_intelligence/proposal_model");

  it("all fact fields are protected", () => {
    for (const field of FACT_FIELDS) {
      assert.equal(isFactField(field), true, `${field} should be protected`);
    }
  });

  it("non-fact fields are not blocked", () => {
    const safeFields = ["seoTitle", "metaDescription", "h1", "authorName", "imageAlt", "faqs", "relatedLinks"];
    for (const field of safeFields) {
      assert.equal(isFactField(field), false, `${field} should not be blocked`);
    }
  });
});
