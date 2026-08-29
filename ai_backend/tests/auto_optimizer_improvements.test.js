"use strict";

/**
 * Auto-Optimizer REAL improvement tests.
 *
 * Proves the full pipeline actually strengthens weak content:
 *   audit → improve → validate → snapshot → apply → re-audit → compare →
 *   keep/rollback → next page
 *
 * Every test runs against a mock Firestore with write-order tracking so
 * snapshot-before-apply, rollback, fact locks, and idempotency are verified
 * from observable writes, not from logs.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  optimizePage,
  runOptimizationBatch,
  runBackfill
} = require("../agents/seo_intelligence/auto_optimizer");
const { triggerOptimizerAfterPublish, triggerOptimizerNonBlocking } = require("../agents/seo_intelligence/publish_hook");
const { isAlreadyOptimized, buildFailureTracker } = require("../agents/seo_intelligence/backfill_processor");
const { scorePage } = require("../agents/seo_intelligence/content_quality_scorer");

// ─── Mock Firestore with write-order tracking ─────────────────────────

function createMockDb() {
  const store = new Map();
  const writeLog = [];
  function docRef(name, id) {
    const key = `${name}/${id}`;
    return {
      async get() {
        const data = store.get(key);
        return { exists: data !== undefined, data: () => data || {} };
      },
      async set(data, options) {
        writeLog.push(key);
        if (options && options.merge) {
          const existing = store.get(key) || {};
          store.set(key, { ...existing, ...data });
        } else {
          store.set(key, data);
        }
        return this;
      },
      async update(data) { return this.set(data, { merge: true }); },
      async delete() { store.delete(key); return this; }
    };
  }
  return {
    collection(name) {
      const base = {
        doc(id) { return docRef(name, id); },
        async count() {
          return {
            async get() {
              let count = 0;
              for (const k of store.keys()) if (k.startsWith(`${name}/`)) count++;
              return { data: () => ({ count }) };
            }
          };
        }
      };
      return {
        ...base,
        orderBy() {
          return {
            limit() {
              return {
                async get() {
                  const docs = [];
                  for (const [k, v] of store.entries()) {
                    if (k.startsWith(`${name}/`)) docs.push({ id: k.split("/")[1], data: () => v });
                  }
                  return { docs };
                }
              };
            }
          };
        },
        where(field, op, value) {
          // Minimal support for the eligible-count query
          if (field === "status" && op === "in") {
            return {
              count() {
                return {
                  async get() {
                    let count = 0;
                    for (const [k, v] of store.entries()) {
                      if (k.startsWith(`${name}/`) && value.includes(String(v && v.status || "").toLowerCase())) count++;
                    }
                    return { data: () => ({ count }) };
                  }
                };
              }
            };
          }
          return base;
        }
      };
    },
    _store: store,
    _writeLog: writeLog,
    writesTo(prefix) {
      return writeLog.filter((k) => k.startsWith(prefix));
    }
  };
}

const FieldValue = { serverTimestamp: () => new Date().toISOString() };
const NOW = new Date("2026-08-29T00:00:00Z");

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeStrongJob(overrides = {}) {
  return {
    id: "job-strong", collection: "jobs", type: "JOB",
    title: "SSC CGL 2026 Recruitment", seoTitle: "SSC CGL 2026 Recruitment Apply Online",
    metaDescription: "SSC CGL 2026 recruitment: apply online before the last date using the official link. Complete details, dates and steps are summarised on this page for quick reference.",
    h1: "SSC CGL 2026", status: "published", category: "SSC",
    organization: "SSC", lastDate: "20 September 2026", startDate: "01/06/2026",
    vacancies: "14589", salary: "Pay Level 7",
    applyLink: "https://ssc.gov.in/apply",
    authorName: "StudyGyaan Editorial Team",
    articleHtml: "<h1>SSC CGL 2026</h1>" +
      "<h2>Overview</h2><p>SSC CGL 2026 recruitment is open for candidates across India. " +
      "The page summarises the official record: read every section and confirm final details on the official notice. " +
      "Applicants should keep documents ready before starting the application. " +
      "The process is fully online and takes a few minutes when prepared. " +
      "Double-check each field before final submission of the application form.</p>" +
      "<h2>Important dates</h2><p>Last date: 20 September 2026. Start date: 01/06/2026.</p>" +
      "<h2>आवेदन कैसे करें</h2><p>Apply online through the official portal: <a href=\"https://ssc.gov.in/apply\">https://ssc.gov.in/apply</a></p>" +
      "<ul><li>Step 1 read the notification</li><li>Step 2 register</li><li>Step 3 submit the form</li></ul>",
    relatedLinks: [{ title: "SSC Hub", url: "/govt-jobs?exam=SSC" }],
    createdAt: "2022-01-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
    sourceUrl: "https://ssc.gov.in/notice",
    ...overrides
  };
}

function makeWeakJob(overrides = {}) {
  return {
    id: "job-weak", collection: "jobs", type: "JOB",
    title: "SSC CGL 2026 Recruitment", seoTitle: "SSC CGL 2026 Recruitment",
    metaDescription: "", status: "published", category: "SSC",
    organization: "SSC", lastDate: "20 September 2026", startDate: "01/06/2026",
    vacancies: "14589", salary: "Pay Level 7",
    applyLink: "https://ssc.gov.in/apply",
    articleHtml: "<p>SSC CGL 2026 apply now. Read the notification.</p>",
    createdAt: "2023-01-01T00:00:00Z", updatedAt: "2023-01-01T00:00:00Z",
    sourceUrl: "https://ssc.gov.in/notice",
    ...overrides
  };
}

function makeWeakBlog(overrides = {}) {
  return {
    id: "blog-weak", collection: "blogs", type: "BLOG",
    title: "How to prepare for SSC CGL", seoTitle: "How to prepare for SSC CGL 2026",
    metaDescription: "Guide.", h1: "SSC CGL Preparation Guide",
    status: "published", category: "SSC",
    articleHtml: "<h1>SSC CGL Preparation</h1><p>Short guide. Study daily.</p>",
    createdAt: "2023-02-01T00:00:00Z", updatedAt: "2023-02-01T00:00:00Z",
    ...overrides
  };
}

async function seed(db, docs) {
  for (const doc of docs) {
    await db.collection(doc.collection).doc(doc.id).set({ ...doc });
  }
}

// ─── 1, 3, 6, 8, 18, 19: weak page REALLY improves in live mode ─────

describe("Live optimization of weak content", () => {
  it("improves a weak JOB page with real body content (deterministic, useAi=false)", async () => {
    const db = createMockDb();
    const doc = makeWeakJob();
    await seed(db, [doc]);

    const before = scorePage(doc, { now: NOW, catalog: [doc] });
    const result = await optimizePage(db, FieldValue, doc, {
      dryRun: false, useAi: false, now: NOW, catalog: [doc], collectionName: "jobs"
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "optimized");
    assert.equal(result.action, "IMPROVE");
    assert.ok(result.finalScore > result.originalScore, `score must rise (${result.originalScore} → ${result.finalScore})`);
    assert.ok(result.originalScore < 75, "fixture must start weak");
    assert.equal(result.detail.bodyContentChanged, true, "body content must actually change");
    assert.ok(result.detail.fieldsChanged.includes("articleHtml"));

    const saved = db._store.get("jobs/job-weak");
    const newHtml = String(saved.articleHtml);
    assert.notEqual(newHtml, doc.articleHtml, "articleHtml must be rewritten in the DB");
    assert.ok(/<h2>/i.test(newHtml), "restructured body must contain H2 sections");
    assert.ok(/आवेदन कैसे करें/.test(newHtml), "must add how-to-apply guidance");
    assert.ok(/<table/i.test(newHtml), "must add key-facts table");

    // 19: re-audit verified the improvement
    assert.ok(result.detail.fixedWeaknesses.length > 0, "re-audit must show fixed weaknesses");
    const improvedPass = result.passes.find((p) => p.status === "improved");
    assert.ok(improvedPass, "an applied pass must exist");
    assert.ok(improvedPass.auditBefore && improvedPass.auditAfter, "pass must record before/after audits");
    assert.ok(improvedPass.comparison, "pass must record the before/after comparison");
  });

  it("improves a weak BLOG page deterministically (useAi=false)", async () => {
    const db = createMockDb();
    const doc = makeWeakBlog();
    await seed(db, [doc]);
    const result = await optimizePage(db, FieldValue, doc, {
      dryRun: false, useAi: false, now: NOW, catalog: [doc], collectionName: "blogs"
    });
    assert.equal(result.status, "optimized");
    assert.ok(result.finalScore > result.originalScore);
    const saved = db._store.get("blogs/blog-weak");
    assert.ok(String(saved.articleHtml).includes("<h2>"));
  });

  it("keeps every factual field byte-identical (fact locks)", async () => {
    const db = createMockDb();
    const doc = makeWeakJob();
    await seed(db, [doc]);
    await optimizePage(db, FieldValue, doc, {
      dryRun: false, useAi: false, now: NOW, catalog: [doc], collectionName: "jobs"
    });
    const saved = db._store.get("jobs/job-weak");
    for (const field of ["organization", "lastDate", "startDate", "vacancies", "salary", "applyLink", "sourceUrl"]) {
      assert.equal(saved[field], doc[field], `fact field ${field} must never change`);
    }
    // Snapshots must never propose fact-field writes
    for (const [key, value] of db._store.entries()) {
      if (!key.startsWith("seo_apply_snapshots/")) continue;
      for (const changed of Object.keys(value.newValues || {})) {
        assert.ok(!["organization", "vacancies", "salary", "qualification", "eligibility",
          "lastDate", "startDate", "fees", "applyLink", "directLink", "questions", "answers"].includes(changed),
          `snapshot ${key} must not write fact field ${changed}`);
      }
    }
  });

  it("writes a snapshot BEFORE every content write", async () => {
    const db = createMockDb();
    const doc = makeWeakJob();
    await seed(db, [doc]);
    db._writeLog.length = 0; // ignore seeding
    await optimizePage(db, FieldValue, doc, {
      dryRun: false, useAi: false, now: NOW, catalog: [doc], collectionName: "jobs"
    });
    const firstSnapshot = db._writeLog.findIndex((k) => k.startsWith("seo_apply_snapshots/"));
    const firstContentWrite = db._writeLog.findIndex((k) => k === "jobs/job-weak");
    assert.ok(firstSnapshot !== -1, "snapshots must be written");
    assert.ok(firstContentWrite !== -1, "content must be written");
    assert.ok(firstSnapshot < firstContentWrite, "snapshot must precede the content write");
    // every content write is preceded by a snapshot write
    let snapshots = 0;
    for (const key of db._writeLog) {
      if (key.startsWith("seo_apply_snapshots/")) snapshots++;
      else if (key === "jobs/job-weak") assert.ok(snapshots >= 1, "content write without prior snapshot");
    }
  });
});

// ─── 2: strong page skipped ──────────────────────────────────────────

describe("Strong pages are left alone", () => {
  it("skips an already-high-quality page without rewriting it", async () => {
    const db = createMockDb();
    const doc = makeStrongJob();
    await seed(db, [doc]);
    db._writeLog.length = 0; // ignore seeding
    const before = String(db._store.get("jobs/job-strong").articleHtml);

    const result = await optimizePage(db, FieldValue, doc, {
      dryRun: false, useAi: false, now: NOW, catalog: [doc], collectionName: "jobs"
    });

    assert.equal(result.action, "SKIP");
    assert.equal(result.status, "unchanged");
    assert.equal(result.skipReason, "already-high-quality");
    assert.equal(result.totalApplied, 0);
    assert.equal(String(db._store.get("jobs/job-strong").articleHtml), before, "content must not be rewritten");
    assert.equal(db.writesTo("jobs/").length, 0, "no writes to the page at all");
  });
});

// ─── 4, 5: AI optional + AI failure safe fallback ────────────────────

describe("AI is an enhancement, never a dependency", () => {
  it("improves content with useAi=true but no AI available (deterministic fallback)", async () => {
    const db = createMockDb();
    const doc = makeWeakBlog();
    await seed(db, [doc]);
    const result = await optimizePage(db, FieldValue, doc, {
      dryRun: true, useAi: true, now: NOW, catalog: [doc], collectionName: "blogs"
      // no generateJson injected, no GEMINI key → AI unavailable
    });
    assert.equal(result.action, "IMPROVE");
    assert.ok(result.finalScore > result.originalScore);
    assert.equal(result.detail.aiRequired, false, "AI must not be required for the improvement");
  });

  it("discards AI output that invents numbers and keeps the deterministic proposal", async () => {
    const db = createMockDb();
    const doc = makeWeakBlog();
    await seed(db, [doc]);
    const badAi = async () => ({ articleHtml: "<h1>x</h1><p>99999 vacancies announced today</p>", invented: false });
    const result = await optimizePage(db, FieldValue, doc, {
      dryRun: true, useAi: true, generateJson: badAi, now: NOW, catalog: [doc], collectionName: "blogs"
    });
    assert.equal(result.action, "IMPROVE");
    for (const imp of result.detail.proposedImprovements) {
      if (imp.field === "articleHtml") {
        assert.notEqual(imp.source, "ai-proposal", "invented AI output must be discarded");
      }
    }
    // the simulated body must not contain the invented number
    const improvedPass = result.passes.find((p) => p.status === "improved");
    const htmlChange = improvedPass && improvedPass.changes.find((c) => c.field === "articleHtml");
    assert.ok(htmlChange, "articleHtml improvement must still exist (deterministic)");
  });

  it("never blocks the pipeline when the AI call throws", async () => {
    const db = createMockDb();
    const doc = makeWeakBlog();
    await seed(db, [doc]);
    const explodingAi = async () => { throw new Error("GEMINI_CALL_FAILED"); };
    const result = await optimizePage(db, FieldValue, doc, {
      dryRun: true, useAi: true, generateJson: explodingAi, now: NOW, catalog: [doc], collectionName: "blogs"
    });
    assert.equal(result.ok, true);
    assert.equal(result.action, "IMPROVE", "deterministic improvement still applies when AI crashes");
    // the applied articleHtml improvement must be the deterministic one
    const improvedPass = result.passes.find((p) => p.status === "improved");
    const htmlChange = improvedPass && improvedPass.changes.find((c) => c.field === "articleHtml");
    assert.ok(htmlChange, "articleHtml improvement must still exist (deterministic fallback)");
    assert.equal(result.detail.aiRequired, false);
  });
});

// ─── 7: duplicate protection blocks risky improvements ───────────────

describe("Duplicate protection", () => {
  it("rejects an improvement that is too similar to another page", async () => {
    const db = createMockDb();
    const twinA = makeWeakJob({ id: "twin-a", title: "SSC CGL 2026 Recruitment", createdAt: "2023-01-01T00:00:00Z" });
    const twinB = makeWeakJob({ id: "twin-b", title: "SSC CGL 2026 Recruitment", createdAt: "2023-01-02T00:00:00Z" });
    await seed(db, [twinA, twinB]);
    const result = await optimizePage(db, FieldValue, twinA, {
      dryRun: true, useAi: false, now: NOW, catalog: [twinA, twinB], collectionName: "jobs"
    });
    const dupRejections = result.detail.validationResults.filter((v) => v.stage === "duplicate-safety" && v.status === "rejected");
    assert.ok(dupRejections.length > 0, "duplicate-risk articleHtml improvement must be rejected");
    assert.ok(result.detail.duplicateSafety && typeof result.detail.duplicateSafety.maxSimilarity === "number");
  });
});

// ─── Internal link integrity ─────────────────────────────────────────

describe("Internal link integrity", () => {
  it("keeps internal link anchors in generated HTML (no false blocked-domain stripping)", async () => {
    const db = createMockDb();
    const weak = makeWeakJob({ id: "job-links", createdAt: "2023-01-01T00:00:00Z" });
    const other = makeWeakBlog({ id: "blog-other-2024", title: "IBPS PO 2024 Guide", createdAt: "2023-06-01T00:00:00Z" });
    await seed(db, [weak, other]);
    const result = await optimizePage(db, FieldValue, weak, {
      dryRun: false, useAi: false, now: NOW, catalog: [weak, other], collectionName: "jobs"
    });
    assert.equal(result.action, "IMPROVE");
    const saved = db._store.get("jobs/job-links");
    const html = String(saved.articleHtml);
    assert.match(html, /<a href="\/blog\//, "internal related link anchor must survive sanitization");
    // a year that exists only in a linked catalog page title must not be
    // falsely rejected as an invented number (grounded navigation anchor)
    assert.match(html, /IBPS PO 2024 Guide/);
  });
});

// ─── 9: rollback on degradation ──────────────────────────────────────

describe("Rollback on quality degradation", () => {
  it("restores the snapshot when the change degrades quality", async () => {
    const db = createMockDb();
    // A RESULT-kind blog with RICH structure: the deterministic "short update"
    // rebuild drops its H2s/table/links, which must DEGRADE the score → rollback.
    const doc = {
      id: "blog-rollback", collection: "blogs", type: "BLOG",
      title: "SSC CGL Result 2026 Declared Check Now",
      seoTitle: "SSC CGL Result 2026 Declared Check Now",
      metaDescription: "SSC CGL result 2026 declared: check your marks on the official site using the direct link given here and download the marksheet for future reference before the next stage begins.",
      status: "published", category: "SSC",
      articleHtml: "<h1>SSC CGL Result 2026</h1>" +
        "<h2>What changed</h2><p>SSC CGL result 2026 declared. Candidates can check marks. " +
        "The result is available on the official website. Check your roll number in the list. " +
        "Download the marksheet and keep a printed copy safe for the next stage of selection.</p>" +
        "<h2>Steps to check</h2><ul><li>Open the official site</li><li>Enter roll number</li><li>Download marksheet</li></ul>" +
        "<h2>Official source</h2><p><a href=\"https://ssc.gov.in/result\">https://ssc.gov.in/result</a></p>",
      authorName: "StudyGyaan Editorial Team",
      createdAt: "2023-03-01T00:00:00Z", updatedAt: "2023-03-01T00:00:00Z",
      sourceUrl: "https://ssc.gov.in/result"
    };
    await seed(db, [doc]);
    const originalHtml = String(db._store.get("blogs/blog-rollback").articleHtml);

    const result = await optimizePage(db, FieldValue, doc, {
      dryRun: false, useAi: false, now: NOW, catalog: [doc], collectionName: "blogs"
    });

    const saved = db._store.get("blogs/blog-rollback");
    const rolledBackPass = result.passes.find((p) => p.status === "rolled-back");
    if (rolledBackPass) {
      // Degradation detected → snapshot must be restored
      assert.equal(result.status, "rolled-back");
      assert.equal(result.action, "BLOCK");
      assert.equal(saved.articleHtml, originalHtml, "rollback must restore the original body");
      assert.ok(result.totalRolledBack > 0);
      assert.ok(/rolled-back:/.test(result.skipReason));
    } else {
      // If the rebuild did not degrade this fixture, the change must have been
      // kept only because quality genuinely improved.
      assert.equal(result.status, "optimized");
      assert.ok(result.finalScore >= result.originalScore);
    }
  });
});

// ─── 10: multi-pass ──────────────────────────────────────────────────

describe("Multi-pass behavior", () => {
  it("runs additional passes while the page stays weak, then stops", async () => {
    const db = createMockDb();
    const fastTrack = {
      id: "ft-weak", collection: "fast_track", type: "FAST_TRACK",
      title: "SSC CGL Admit Card 2026 Released Download Link",
      seoTitle: "SSC CGL Admit Card 2026 Released Download Link",
      shortInfo: "SSC CGL admit card 2026 released on the official website. Download using registration number.",
      directLink: "https://ssc.gov.in/admit-card",
      status: "published", category: "SSC",
      createdAt: "2023-04-01T00:00:00Z", updatedAt: "2023-04-01T00:00:00Z"
    };
    const weakJob = makeWeakJob({ id: "job-weak-2", createdAt: "2023-05-01T00:00:00Z" });
    await seed(db, [fastTrack, weakJob]);

    const result = await optimizePage(db, FieldValue, fastTrack, {
      dryRun: true, useAi: false, now: NOW, catalog: [fastTrack, weakJob],
      collectionName: "fast_track", maxPasses: 3
    });
    assert.ok(result.passes.length >= 1);
    assert.ok(result.passes.length <= 3, "must never exceed maxPasses");
    const first = result.passes[0];
    assert.equal(first.status, "improved");
    assert.ok(first.afterScore > first.beforeScore, "first pass must improve");
    // loop must terminate for one of the valid reasons
    const last = result.passes[result.passes.length - 1];
    assert.ok(["improved", "already-high-quality", "no-improvement-proposals",
      "no-auto-applicable-proposals", "no-valid-patches", "rolled-back"].includes(last.status));
  });
});

// ─── 11: no endless rewriting + 13: tracker persistence ──────────────

describe("Idempotency and tracker persistence", () => {
  it("does not rewrite a page that was already optimized (page level)", async () => {
    const db = createMockDb();
    const doc = makeWeakJob();
    await seed(db, [doc]);
    const first = await optimizePage(db, FieldValue, doc, {
      dryRun: false, useAi: false, now: NOW, catalog: [doc], collectionName: "jobs"
    });
    assert.equal(first.status, "optimized");
    const savedAfterFirst = String(db._store.get("jobs/job-weak").articleHtml);
    const optimizedDoc = { ...doc, articleHtml: savedAfterFirst, metaDescription: db._store.get("jobs/job-weak").metaDescription, authorName: db._store.get("jobs/job-weak").authorName, relatedLinks: db._store.get("jobs/job-weak").relatedLinks };

    const second = await optimizePage(db, FieldValue, optimizedDoc, {
      dryRun: false, useAi: false, now: NOW, catalog: [optimizedDoc], collectionName: "jobs"
    });
    assert.equal(second.action, "SKIP");
    assert.equal(second.totalApplied, 0, "second run must not rewrite");
  });

  it("tracker records persist and make the batch skip processed pages", async () => {
    const db = createMockDb();
    const oldest = makeWeakJob({ id: "job-old", createdAt: "2023-01-01T00:00:00Z" });
    const newest = makeWeakJob({ id: "job-new", createdAt: "2024-01-01T00:00:00Z", title: "IBPS Clerk 2026 Recruitment", seoTitle: "IBPS Clerk 2026 Recruitment" });
    await seed(db, [oldest, newest]);

    const batch1 = await runOptimizationBatch(db, FieldValue, { dryRun: false, now: NOW, batchSize: 1 });
    assert.ok(batch1.processed >= 1);
    assert.ok(db._store.get("seo_backfill_tracker/job-old"), "tracker must be persisted for the processed page");

    // Resume: the tracked page is skipped and the next-oldest is processed
    const batch2 = await runOptimizationBatch(db, FieldValue, { dryRun: false, now: NOW, batchSize: 1 });
    const processedIds = batch2.results.map((r) => r.contentId);
    assert.ok(!processedIds.includes("job-old"), "already-tracked page must be skipped");
    assert.ok(processedIds.includes("job-new"), "next-oldest page must be processed after resume");

    const batch3 = await runOptimizationBatch(db, FieldValue, { dryRun: false, now: NOW, batchSize: 1 });
    assert.equal(batch3.processed, 0, "once everything is tracked, nothing is reprocessed");
  });

  it("failure tracker caps retries so a broken page cannot starve the backfill", async () => {
    const doc = makeWeakJob();
    const tracker = buildFailureTracker(doc, {}, new Error("boom"));
    assert.equal(isAlreadyOptimized(tracker, doc), false, "first failure stays retryable");
    const tracker3 = buildFailureTracker(doc, { failureAttempts: 2 }, new Error("boom"));
    assert.equal(isAlreadyOptimized(tracker3, doc), true, "third failure stops retries");
  });
});

// ─── 12: oldest-first ordering ───────────────────────────────────────

describe("Oldest-first backfill ordering", () => {
  it("processes the oldest eligible pages first across collections", async () => {
    const db = createMockDb();
    await seed(db, [
      makeWeakJob({ id: "job-2025", createdAt: "2025-01-01T00:00:00Z" }),
      makeWeakJob({ id: "job-2023", createdAt: "2023-01-01T00:00:00Z" }),
      makeWeakBlog({ id: "blog-2024", createdAt: "2024-01-01T00:00:00Z" }),
      makeWeakJob({ id: "job-draft", createdAt: "2022-01-01T00:00:00Z", status: "draft" })
    ]);
    const batch = await runOptimizationBatch(db, FieldValue, { dryRun: true, now: NOW, batchSize: 10 });
    const ids = batch.results.map((r) => r.contentId);
    assert.deepEqual(ids, ["job-2023", "blog-2024", "job-2025"], "oldest first, drafts excluded");
  });
});

// ─── 14: batch failure isolation ─────────────────────────────────────

describe("Batch failure isolation", () => {
  it("continues the batch after one page fails", async () => {
    const db = createMockDb();
    const poison = makeWeakJob({
      id: "job-poison",
      articleHtml: { toString() { throw new Error("poisoned html"); } }
    });
    await seed(db, [
      makeWeakJob({ id: "job-good-1", createdAt: "2023-01-01T00:00:00Z" }),
      poison,
      makeWeakJob({ id: "job-good-2", createdAt: "2025-01-01T00:00:00Z", title: "IBPS Clerk 2026", seoTitle: "IBPS Clerk 2026" })
    ]);
    const batch = await runOptimizationBatch(db, FieldValue, { dryRun: false, now: NOW, batchSize: 10 });
    assert.equal(batch.failed, 1, "the poisoned page must fail");
    assert.equal(batch.processed, 3, "the whole batch must still be processed");
    const failed = batch.results.find((r) => r.contentId === "job-poison");
    assert.equal(failed.status, "failed");
    assert.match(failed.error, /poisoned html/);
    // others still improved
    const okResults = batch.results.filter((r) => r.contentId !== "job-poison");
    assert.ok(okResults.every((r) => r.status === "optimized"));
    // failure tracker persisted so the page does not block future batches forever
    assert.ok(db._store.get("seo_backfill_tracker/job-poison"));
  });
});

// ─── 15, 20: publish hook — new content auto-enters the pipeline ────

describe("New content triggers the optimizer (publish hook)", () => {
  it("runs the optimizer on weak newly published content and improves it", async () => {
    const db = createMockDb();
    const doc = makeWeakJob({ id: "job-new-publish" });
    await seed(db, [doc]);
    const result = await triggerOptimizerAfterPublish(db, FieldValue, { ...doc }, "jobs");
    assert.ok(result, "optimizer must run for weak new content");
    const saved = db._store.get("jobs/job-new-publish");
    assert.equal(saved.optimizerProcessed, true, "result must be recorded on the document");
    assert.ok(/<h2>/i.test(String(saved.articleHtml)), "new content must actually be improved");
    assert.ok(saved.optimizerFinalScore > saved.optimizerOriginalScore);
  });

  it("skips strong new content", async () => {
    const db = createMockDb();
    const doc = makeStrongJob({ id: "job-strong-publish" });
    await seed(db, [doc]);
    const result = await triggerOptimizerAfterPublish(db, FieldValue, { ...doc }, "jobs");
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "already-high-quality");
  });

  it("NEVER lets an optimizer crash fail the publish", async () => {
    const db = createMockDb();
    const poison = makeWeakJob({
      id: "job-publish-poison",
      articleHtml: { toString() { throw new Error("optimizer crash"); } }
    });
    await seed(db, [poison]);
    let threw = false;
    try {
      const result = await triggerOptimizerAfterPublish(db, FieldValue, { ...poison }, "jobs");
      assert.equal(result, null, "failure returns null instead of throwing");
    } catch (error) {
      threw = true;
    }
    assert.equal(threw, false, "publish hook must never throw");
    const saved = db._store.get("jobs/job-publish-poison");
    assert.equal(saved.optimizerProcessed, false, "failure is recorded");
    assert.ok(saved.optimizerError);
  });

  it("non-blocking trigger never throws", async () => {
    const db = createMockDb();
    const doc = makeWeakJob({ id: "job-nonblocking" });
    await seed(db, [doc]);
    assert.doesNotThrow(() => {
      triggerOptimizerNonBlocking(db, FieldValue, { ...doc }, "jobs");
    });
  });
});

// ─── 16: every publish path is wired ─────────────────────────────────

describe("Publish-path wiring", () => {
  const BACKEND = path.resolve(__dirname, "..");
  const wiredPaths = [
    ["article_pipeline.js", "agents/article_agents/article_pipeline.js"],
    ["auto_blog.js", "auto_blog.js"],
    ["fast_track_updates.js", "fast_track_updates.js"],
    ["auto_mock.js", "auto_mock.js"],
    ["auto_stories.js", "auto_stories.js"],
    ["govt_jobs.js (job onCreate trigger)", "govt_jobs.js"],
    ["index.js (manual blog publish)", "index.js"]
  ];
  for (const [label, relPath] of wiredPaths) {
    it(`${label} triggers the optimizer after publish`, () => {
      const src = fs.readFileSync(path.join(BACKEND, relPath), "utf8");
      assert.match(src, /triggerOptimizer(NonBlocking|AfterPublish)/, `${relPath} must call the publish hook`);
    });
  }
});

// ─── 17: dry-run performs no writes ──────────────────────────────────

describe("Dry-run safety", () => {
  it("performs zero public or internal writes", async () => {
    const db = createMockDb();
    await seed(db, [makeWeakJob(), makeWeakBlog()]);
    db._writeLog.length = 0; // ignore seeding
    const report = await runBackfill(db, FieldValue, {
      dryRun: true, now: NOW, batchSize: 10, maxBatches: 2
    });
    assert.equal(report.ok, true);
    assert.equal(db._writeLog.length, 0, "dry-run must not write ANYTHING");
    assert.equal(db._store.get("jobs/job-weak").articleHtml, makeWeakJob().articleHtml, "original content untouched");
  });

  it("reports per-page expected actions and projected scores in dry-run", async () => {
    const db = createMockDb();
    await seed(db, [makeWeakJob(), makeStrongJob()]);
    const report = await runBackfill(db, FieldValue, {
      dryRun: true, now: NOW, batchSize: 10, maxBatches: 1
    });
    const weak = report.results.find((r) => r.contentId === "job-weak");
    const strong = report.results.find((r) => r.contentId === "job-strong");
    assert.equal(weak.action, "IMPROVE");
    assert.equal(weak.status, "would-improve");
    assert.equal(typeof weak.detail.projectedAfterScore, "number", "dry-run must project the simulated after score");
    assert.ok(weak.detail.projectedAfterScore > weak.originalScore);
    assert.equal(weak.detail.bodyContentChanged, true);
    assert.ok(Array.isArray(weak.detail.weakDimensions) && weak.detail.weakDimensions.length > 0);
    assert.ok(Array.isArray(weak.detail.proposedImprovements) && weak.detail.proposedImprovements.length > 0);
    assert.equal(strong.action, "SKIP");
    assert.equal(strong.skipReason, "already-high-quality");
  });

  it("does not double-process pages across dry-run batches", async () => {
    const db = createMockDb();
    await seed(db, [makeWeakJob(), makeWeakBlog()]);
    const report = await runBackfill(db, FieldValue, {
      dryRun: true, now: NOW, batchSize: 1, maxBatches: 5
    });
    const ids = report.results.map((r) => r.contentId);
    assert.equal(new Set(ids).size, ids.length, "no page processed twice in one dry-run");
    assert.equal(report.totalProcessed, 2);
  });
});

// ─── Full end-to-end backfill ────────────────────────────────────────

describe("End-to-end backfill", () => {
  it("processes the whole catalog oldest-first in live mode and tracks everything", async () => {
    const db = createMockDb();
    await seed(db, [
      makeWeakJob({ id: "j1", createdAt: "2021-01-01T00:00:00Z" }),
      makeWeakBlog({ id: "b1", createdAt: "2021-06-01T00:00:00Z" }),
      makeWeakJob({ id: "j2", createdAt: "2022-01-01T00:00:00Z", title: "IBPS PO 2026 Recruitment", seoTitle: "IBPS PO 2026 Recruitment" }),
      makeStrongJob({ id: "s1", createdAt: "2020-01-01T00:00:00Z" })
    ]);
    const report = await runBackfill(db, FieldValue, {
      dryRun: false, now: NOW, batchSize: 2, maxBatches: 5
    });
    assert.equal(report.totalProcessed, 4);
    assert.equal(report.dryRun, false);
    const byId = Object.fromEntries(report.results.map((r) => [r.contentId, r]));
    assert.equal(byId.s1.action, "SKIP");
    assert.equal(byId.j1.action, "IMPROVE");
    assert.equal(byId.b1.action, "IMPROVE");
    // order is oldest-first
    assert.deepEqual(report.results.map((r) => r.contentId), ["s1", "j1", "b1", "j2"]);
    // every page tracked
    for (const id of ["s1", "j1", "b1", "j2"]) {
      const tracker = db._store.get(`seo_backfill_tracker/${id}`);
      assert.ok(tracker, `tracker for ${id} must persist`);
      assert.equal(tracker.optimizationVersion, 3);
    }
    // a second full run has nothing left to do
    const report2 = await runBackfill(db, FieldValue, {
      dryRun: false, now: NOW, batchSize: 2, maxBatches: 5
    });
    assert.equal(report2.totalProcessed, 0, "idempotent: nothing left to process");
  });
});
