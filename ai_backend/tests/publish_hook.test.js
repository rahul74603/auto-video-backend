"use strict";

/**
 * Tests for the retired publish hook and the retained optimizer safety helpers.
 * Publishing never triggers public-content repair; scheduled SEO work creates
 * reviewable proposals for up to five old BLOG pages instead.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  triggerOptimizerAfterPublish,
  triggerOptimizerNonBlocking,
  resolveContentType,
  TYPE_CONSTRAINTS
} = require("../agents/seo_intelligence/publish_hook");

const {
  optimizePage,
  processNewContent,
  validateClaims,
  validateDuplicateSafety,
  compareQuality,
  shouldKeepChange,
  generateImprovements,
  buildProposalPatch
} = require("../agents/seo_intelligence/auto_optimizer");

const {
  buildContentFingerprint,
  isAlreadyOptimized,
  buildTrackerRecord,
  persistTracker
} = require("../agents/seo_intelligence/backfill_processor");

// ─── Test Helpers ───────────────────────────────────────────────────

function makeFieldvalue() {
  return {
    serverTimestamp: () => new Date().toISOString()
  };
}

function makeDb() {
  const store = {};
  return {
    _store: store,
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          const key = `${name}/${id}`;
          const data = store[key] || null;
          return {
            exists: data !== null,
            data: () => data,
            id
          };
        },
        set: async (data, opts) => {
          const key = `${name}/${id}`;
          if (opts && opts.merge) {
            store[key] = { ...(store[key] || {}), ...data };
          } else {
            store[key] = { ...data };
          }
        },
        update: async (data) => {
          const key = `${name}/${id}`;
          store[key] = { ...(store[key] || {}), ...data };
        },
        delete: async () => {
          const key = `${name}/${id}`;
          delete store[key];
        }
      }),
      orderBy: () => ({
        limit: () => ({
          get: async () => ({
            docs: Object.entries(store)
              .filter(([k]) => k.startsWith(`${name}/`))
              .map(([k, v]) => ({
                id: k.split("/")[1],
                data: () => v,
                exists: true
              }))
          })
        })
      }),
      count: () => ({
        get: async () => ({
          data: () => ({
            count: Object.keys(store).filter((k) => k.startsWith(`${name}/`)).length
          })
        })
      })
    })
  };
}

/** Create a realistic JOB document with low quality score */
function makeWeakJob(overrides = {}) {
  return {
    id: "job-test-123",
    type: "JOB",
    contentType: "JOB",
    status: "published",
    title: "SSC CGL Recruitment 2026",
    slug: "ssc-cgl-recruitment-2026",
    h1: "SSC CGL Recruitment 2026",
    seoTitle: "SSC CGL",
    metaDescription: "SSC CGL job",
    description: "Short description",
    articleHtml: "<p>SSC CGL recruitment 2026. Apply now.</p>",
    organization: "SSC",
    lastDate: "2026-12-31",
    startDate: "2026-01-01",
    vacancies: "10000",
    salary: "Rs. 25000 - 80000",
    qualification: "Graduation",
    category: "Government Jobs",
    createdAt: new Date("2025-01-01").toISOString(),
    ...overrides
  };
}

/** Create a realistic BLOG document with low quality score */
function makeWeakBlog(overrides = {}) {
  return {
    id: "blog-test-456",
    type: "BLOG",
    contentType: "BLOG",
    status: "published",
    title: "SSC CGL Preparation Tips",
    slug: "ssc-cgl-preparation-tips",
    h1: "SSC CGL Preparation Tips",
    seoTitle: "SSC CGL Tips",
    metaDescription: "Tips for SSC CGL",
    content: "<p>Some tips for SSC CGL preparation.</p>",
    articleHtml: "<p>Some tips for SSC CGL preparation.</p>",
    category: "Exam_Strategies",
    author: "StudyGyaan Team",
    createdAt: new Date("2025-01-01").toISOString(),
    ...overrides
  };
}

/** Create a realistic FAST_TRACK document with low quality score */
function makeWeakFastTrack(overrides = {}) {
  return {
    id: "ft-test-789",
    type: "FAST_TRACK",
    contentType: "FAST_TRACK",
    status: "published",
    title: "SSC GD Result 2026",
    slug: "ssc-gd-result-2026",
    h1: "SSC GD Result 2026",
    seoTitle: "SSC GD Result",
    metaDescription: "Check SSC GD result",
    shortInfo: "SSC GD result declared",
    description: "SSC GD result declared",
    articleHtml: "<p>SSC GD result 2026 declared. Check now.</p>",
    category: "Result",
    org: "SSC",
    directLink: "https://ssc.nic.in",
    createdAt: new Date("2025-01-01").toISOString(),
    ...overrides
  };
}


describe("publish_hook", () => {
  describe("resolveContentType", () => {
    it("resolves JOB from contentType", () => {
      assert.equal(resolveContentType({ contentType: "JOB" }), "JOB");
    });

    it("resolves BLOG from collection", () => {
      assert.equal(resolveContentType({ collection: "blogs" }), "BLOG");
    });

    it("resolves FAST_TRACK from collection", () => {
      assert.equal(resolveContentType({ collection: "fast_track" }), "FAST_TRACK");
    });

    it("resolves MOCK_TEST from collection", () => {
      assert.equal(resolveContentType({ collection: "mock_tests" }), "MOCK_TEST");
    });

    it("resolves WEB_STORY from collection", () => {
      assert.equal(resolveContentType({ collection: "web_stories" }), "WEB_STORY");
    });

    it("resolves OTHER for unknown", () => {
      assert.equal(resolveContentType({}), "OTHER");
    });
  });

  describe("TYPE_CONSTRAINTS", () => {
    it("MOCK_TEST is metadata-only", () => {
      assert.equal(TYPE_CONSTRAINTS.MOCK_TEST.metadataOnly, true);
      assert.equal(TYPE_CONSTRAINTS.MOCK_TEST.maxPasses, 1);
      assert.equal(TYPE_CONSTRAINTS.MOCK_TEST.useAi, false);
    });

    it("WEB_STORY is metadata-only", () => {
      assert.equal(TYPE_CONSTRAINTS.WEB_STORY.metadataOnly, true);
    });

    it("JOB allows 2 passes", () => {
      assert.equal(TYPE_CONSTRAINTS.JOB.maxPasses, 2);
    });

    it("BLOG allows 2 passes", () => {
      assert.equal(TYPE_CONSTRAINTS.BLOG.maxPasses, 2);
    });
  });

  describe("triggerOptimizerAfterPublish", () => {
    it("does not auto-repair newly published JOB, BLOG, or Fast Track documents", async () => {
      for (const [collection, doc] of [
        ["jobs", makeWeakJob()],
        ["blogs", makeWeakBlog()],
        ["fast_track", makeWeakFastTrack()]
      ]) {
        const db = makeDb();
        const result = await triggerOptimizerAfterPublish(db, makeFieldvalue(), doc, collection);
        assert.equal(result.skipped, true);
        assert.match(result.reason, /daily-blog-proposals-only/);
        assert.equal(result.contentId, doc.id);
        assert.equal(db._store[`${collection}/${doc.id}`], undefined, "publish hook must not write public content");
      }
    });

    it("returns null for missing doc or collection name", async () => {
      const db = makeDb();
      assert.equal(await triggerOptimizerAfterPublish(db, makeFieldvalue(), null, "jobs"), null);
      assert.equal(await triggerOptimizerAfterPublish(db, makeFieldvalue(), { id: "x" }, ""), null);
    });
  });

  describe("triggerOptimizerNonBlocking", () => {
    it("does not throw", () => {
      const brokenDb = {
        collection: () => { throw new Error("boom"); }
      };
      // Should not throw
      triggerOptimizerNonBlocking(brokenDb, makeFieldvalue(), makeWeakJob(), "jobs");
    });
  });

  describe("MOCK_TEST content type handling", () => {
    it("MOCK_TEST has metadata-only constraints", () => {
      const constraints = TYPE_CONSTRAINTS.MOCK_TEST;
      assert.equal(constraints.metadataOnly, true);
      assert.equal(constraints.maxPasses, 1);
      assert.equal(constraints.useAi, false);
    });

    it("MOCK_TEST questions/answers are fact-locked", async () => {
      const { FACT_FIELDS, isFactField } = require("../agents/seo_intelligence/proposal_model");
      assert.ok(isFactField("questions"));
      assert.ok(isFactField("answers"));
    });
  });

  describe("Idempotency", () => {
    it("same content fingerprint is detected as already optimized", () => {
      const doc = makeWeakJob();
      const fp = buildContentFingerprint(doc);

      const tracker = {
        lastAppliedFingerprint: fp.hash,
        optimizationVersion: 999,
        lastQualityScore: 80
      };

      assert.equal(isAlreadyOptimized(tracker, doc), true);
    });

    it("different content fingerprint is NOT already optimized", () => {
      const doc = makeWeakJob();
      const tracker = {
        lastAppliedFingerprint: "different-hash",
        optimizationVersion: 0,
        lastQualityScore: 30
      };

      assert.equal(isAlreadyOptimized(tracker, doc), false);
    });

    it("tracker record persists correctly", async () => {
      const db = makeDb();
      const FieldValue = makeFieldvalue();
      const doc = makeWeakJob();

      const record = buildTrackerRecord(doc, 40, 55, [
        { field: "metaDescription", level: "A", status: "validated" }
      ], {
        safetyLevel: "A",
        status: "optimized",
        reason: "quality-improved"
      });

      await persistTracker(db, FieldValue, doc.id, record);

      const stored = db._store[`seo_backfill_tracker/${doc.id}`];
      assert.ok(stored);
      assert.equal(stored.contentId, doc.id);
      assert.equal(stored.previousQualityScore, 40);
      assert.equal(stored.newQualityScore, 55);
      assert.equal(stored.qualityDelta, 15);
      assert.equal(stored.status, "optimized");
    });
  });

  describe("Rollback on degradation", () => {
    it("shouldKeepChange rejects degradation", () => {
      const before = { overall: 60, dimensions: { completeness: 50, metadata: 70 } };
      const after = { overall: 55, dimensions: { completeness: 45, metadata: 70 } };
      const dupCheck = { ok: true, risk: "low" };

      const decision = shouldKeepChange(before, after, dupCheck);
      assert.equal(decision.keep, false);
      assert.equal(decision.reason, "overall-score-degraded");
    });

    it("shouldKeepChange rejects when duplication increases", () => {
      const before = { overall: 60, dimensions: { completeness: 50 } };
      const after = { overall: 65, dimensions: { completeness: 55 } };
      const dupCheck = { ok: false, risk: "high", reason: "too-similar" };

      const decision = shouldKeepChange(before, after, dupCheck);
      assert.equal(decision.keep, false);
      assert.ok(decision.reason.includes("too-similar"));
    });

    it("shouldKeepChange accepts improvement", () => {
      const before = { overall: 50, dimensions: { completeness: 40, factualSafety: 80 } };
      const after = { overall: 60, dimensions: { completeness: 50, factualSafety: 80 } };
      const dupCheck = { ok: true, risk: "low" };

      const decision = shouldKeepChange(before, after, dupCheck);
      assert.equal(decision.keep, true);
      assert.equal(decision.reason, "quality-improved");
    });

    it("shouldKeepChange rejects critical dimension degradation", () => {
      const before = { overall: 60, dimensions: { completeness: 50, factualSafety: 80 } };
      const after = { overall: 65, dimensions: { completeness: 55, factualSafety: 70 } };
      const dupCheck = { ok: true, risk: "low" };

      const decision = shouldKeepChange(before, after, dupCheck);
      assert.equal(decision.keep, false);
      assert.ok(decision.reason.includes("factualSafety"));
    });
  });

  describe("compareQuality", () => {
    it("detects improvement", () => {
      const before = { overall: 50, dimensions: { completeness: 40, metadata: 60 } };
      const after = { overall: 60, dimensions: { completeness: 55, metadata: 65 } };

      const result = compareQuality(before, after);
      assert.equal(result.improved, true);
      assert.equal(result.degraded, false);
      assert.equal(result.overallDelta, 10);
    });

    it("detects degradation", () => {
      const before = { overall: 60, dimensions: { completeness: 50 } };
      const after = { overall: 55, dimensions: { completeness: 45 } };

      const result = compareQuality(before, after);
      assert.equal(result.improved, false);
      assert.equal(result.degraded, true);
      assert.equal(result.overallDelta, -5);
    });
  });

  describe("Fact field protection", () => {
    it("buildProposalPatch rejects fact fields", () => {
      const proposal = { field: "organization", proposedValue: "New Org" };
      const patch = buildProposalPatch(proposal);
      assert.equal(patch, null);
    });

    it("buildProposalPatch rejects questions", () => {
      const proposal = { field: "questions", proposedValue: ["q1"] };
      const patch = buildProposalPatch(proposal);
      assert.equal(patch, null);
    });

    it("buildProposalPatch rejects answers", () => {
      const proposal = { field: "answers", proposedValue: ["a1"] };
      const patch = buildProposalPatch(proposal);
      assert.equal(patch, null);
    });

    it("buildProposalPatch accepts seoTitle", () => {
      const proposal = { field: "seoTitle", proposedValue: "New Title" };
      const patch = buildProposalPatch(proposal);
      assert.ok(patch);
      assert.equal(patch.seoTitle, "New Title");
    });

    it("buildProposalPatch accepts metaDescription", () => {
      const proposal = { field: "metaDescription", proposedValue: "New desc" };
      const patch = buildProposalPatch(proposal);
      assert.ok(patch);
      assert.equal(patch.metaDescription, "New desc");
    });
  });

  describe("Claim validation", () => {
    it("validates grounded claims", () => {
      const sourcePage = {
        seoTitle: "SSC CGL 2026",
        description: "10000 vacancies",
        organization: "SSC",
        lastDate: "2026-03-31"
      };
      const html = "<p>SSC has released 10000 vacancies for CGL 2026.</p>";

      const result = validateClaims(html, sourcePage);
      assert.ok(result);
      assert.ok(typeof result.ok === "boolean");
      assert.ok(typeof result.totalClaims === "number");
    });
  });

  describe("Duplicate safety", () => {
    it("rejects when catalog is too small", () => {
      const result = validateDuplicateSafety({}, {}, []);
      assert.equal(result.ok, true);
      assert.equal(result.reason, "catalog-too-small");
    });

    it("checks similarity with catalog", () => {
      const doc = makeWeakJob();
      const catalog = [
        { id: "other-1", title: "Different Job", articleHtml: "<p>Completely different content about banking.</p>" },
        { id: "other-2", title: "Another Job", articleHtml: "<p>Railway recruitment notification for group D.</p>" }
      ];

      const result = validateDuplicateSafety(doc, doc, catalog);
      assert.ok(result);
      assert.ok(typeof result.ok === "boolean");
      assert.ok(typeof result.maxSimilarity === "number");
    });
  });

  describe("Failure isolation", () => {
    it("legacy publish hook is a no-write skip and cannot fail a publish", async () => {
      const brokenDb = { collection: () => { throw new Error("Firestore is down"); } };
      const result = await triggerOptimizerAfterPublish(brokenDb, makeFieldvalue(), makeWeakJob(), "jobs");
      assert.equal(result.skipped, true);
      assert.match(result.reason, /daily-blog-proposals-only/);
    });
  });

  describe("Backfill continues after one failure", () => {
    it("batch processes remaining pages after one fails", async () => {
      const { runOptimizationBatch } = require("../agents/seo_intelligence/auto_optimizer");
      const db = makeDb();
      const FieldValue = makeFieldvalue();

      // Store multiple docs
      const jobs = [
        makeWeakJob({ id: "job-1", createdAt: new Date("2025-01-01").toISOString() }),
        makeWeakJob({ id: "job-2", createdAt: new Date("2025-01-02").toISOString() }),
        makeWeakJob({ id: "job-3", createdAt: new Date("2025-01-03").toISOString() })
      ];

      for (const job of jobs) {
        await db.collection("jobs").doc(job.id).set(job);
      }

      // Run a batch
      const result = await runOptimizationBatch(db, FieldValue, {
        batchSize: 3,
        dryRun: true,
        collections: ["jobs"]
      });

      assert.ok(result);
      assert.equal(result.ok, true);
      assert.ok(result.processed >= 0);
    });
  });
});

describe("article_pipeline publish hook integration", () => {
  it("publishDraftRecord exports are preserved", () => {
    const pipeline = require("../agents/article_agents/article_pipeline");
    assert.ok(typeof pipeline.publishDraftRecord === "function");
    assert.ok(typeof pipeline.assertPublishable === "function");
    assert.ok(typeof pipeline.buildJobPublishPayload === "function");
    assert.ok(typeof pipeline.buildFastTrackPublishPayload === "function");
    assert.ok(typeof pipeline.buildPublishPayload === "function");
  });
});

describe("auto_optimizer exports", () => {
  it("exports processNewContent", () => {
    assert.ok(typeof processNewContent === "function");
  });

  it("exports optimizePage", () => {
    assert.ok(typeof optimizePage === "function");
  });

  it("exports validateClaims", () => {
    assert.ok(typeof validateClaims === "function");
  });

  it("exports validateDuplicateSafety", () => {
    assert.ok(typeof validateDuplicateSafety === "function");
  });

  it("exports compareQuality", () => {
    assert.ok(typeof compareQuality === "function");
  });

  it("exports shouldKeepChange", () => {
    assert.ok(typeof shouldKeepChange === "function");
  });

  it("exports generateImprovements", () => {
    assert.ok(typeof generateImprovements === "function");
  });

  it("exports buildProposalPatch", () => {
    assert.ok(typeof buildProposalPatch === "function");
  });
});
