"use strict";

/**
 * Phase 0 hygiene — behavioral tests:
 *   1. run_auto_optimizer honors the automation kill-switch
 *      (system_settings/automation → features.seo_optimizer) and reports
 *      a "skipped" runner status without running the backfill.
 *   2. run_auto_optimizer proceeds when the guard is enabled/absent (default).
 *   3. publish_hook skips the post-publish optimizer when the guard disables
 *      seo_optimizer, and writes NOTHING to the public content collection.
 *   4. publish_hook still optimizes weak content when the guard is enabled.
 *
 * The automation_guard module caches settings for 60s — invalidateCache() is
 * called before every case so tests stay isolated.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const automationGuard = require("../agents/automation_guard");
const { runAutoOptimizerRunner } = require("../run_auto_optimizer");
const { triggerOptimizerAfterPublish } = require("../agents/seo_intelligence/publish_hook");

function createMockDb(initial = {}) {
  const store = new Map();
  for (const [key, value] of Object.entries(initial)) {
    store.set(key, JSON.parse(JSON.stringify(value)));
  }
  const writes = [];
  const asDoc = (key) => ({ exists: store.has(key), data: () => store.get(key) || {} });
  function col(name) {
    return {
      doc(id) {
        const key = `${name}/${id}`;
        return {
          async get() { return asDoc(key); },
          async set(data, opts) {
            writes.push(key);
            if (opts && opts.merge) store.set(key, { ...(store.get(key) || {}), ...data });
            else store.set(key, data);
            return this;
          },
          async update(data) { return this.set(data, { merge: true }); }
        };
      },
      // publish_hook's loadCatalogForOptimization uses orderBy().limit().get();
      // leaving them undefined makes that best-effort loader fail to [] (its
      // own try/catch), which is the same behavior as an unreadable catalog.
      orderBy() { throw new Error("mock: orderBy unsupported"); }
    };
  }
  return { _store: store, _writes: writes, collection: col };
}

const WEAK_BLOG = {
  // Mirrors the weak-blog fixture from tests/publish_hook.test.js — short SEO
  // fields + thin body so the live optimizer has validated improvements to make
  // (this shape reliably reaches status "optimized" in the existing suite).
  id: "weak-blog-guard",
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
  createdAt: new Date("2025-01-01").toISOString()
};

test("run_auto_optimizer: kill-switch (features.seo_optimizer=false) skips the run and persists a skipped status", async () => {
  automationGuard.invalidateCache();
  const db = createMockDb({
    "system_settings/automation": {
      globalEnabled: true,
      emergencyPause: false,
      features: { seo_optimizer: false }
    }
  });
  let backfillCalled = 0;

  const summary = await runAutoOptimizerRunner({
    db,
    FieldValue: null,
    args: {
      dryRun: true,
      batchSize: 2,
      maxBatches: 1,
      useAi: false,
      actor: "test",
      runId: "t-guard-1",
      sha: "",
      disableSummaryArtifact: true
    },
    deps: {
      runBackfill: async () => {
        backfillCalled += 1;
        return { ok: true, dryRun: true, results: [] };
      }
    }
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.skipped, true);
  assert.match(String(summary.reason), /seo_optimizer|OFF|paused/i);
  assert.equal(backfillCalled, 0, "backfill must NOT run when the kill-switch is off");

  const status = db._store.get("system_settings/seo_intelligence");
  assert.ok(status && status.optimizerRunner, "runner status must be persisted");
  assert.equal(status.optimizerRunner.lastStatus, "skipped");
  assert.match(String(status.optimizerRunner.skipReason || ""), /seo_optimizer|OFF|paused/i);
  assert.equal(
    db._writes.some((key) => !key.startsWith("system_settings/")),
    false,
    "no writes outside admin settings when skipped"
  );
});

test("run_auto_optimizer: proceeds when the guard is enabled by default (no automation doc)", async () => {
  automationGuard.invalidateCache();
  const db = createMockDb({});
  let backfillCalled = 0;

  const summary = await runAutoOptimizerRunner({
    db,
    FieldValue: null,
    args: {
      dryRun: true,
      batchSize: 2,
      maxBatches: 1,
      useAi: false,
      actor: "test",
      runId: "t-guard-2",
      sha: "",
      disableSummaryArtifact: true
    },
    deps: {
      runBackfill: async () => {
        backfillCalled += 1;
        return {
          ok: true, dryRun: true, batches: 1, totalProcessed: 0,
          totalImproved: 0, totalSkipped: 0, totalNeedsReview: 0, totalBlocked: 0,
          totalRolledBack: 0, totalFailed: 0, results: []
        };
      },
      getOptimizerStatus: async () => null,
      getBackfillProgress: async () => null,
      countProcessedPages: async () => ({ total: 0, processed: 0, remaining: 0 })
    }
  });

  assert.equal(summary.ok, true);
  assert.notEqual(summary.skipped, true);
  assert.equal(backfillCalled, 1, "backfill must run when the guard is enabled");
});

test("publish_hook: kill-switch disables the post-publish optimizer without touching public content", async () => {
  automationGuard.invalidateCache();
  const db = createMockDb({
    "system_settings/automation": {
      globalEnabled: true,
      emergencyPause: false,
      features: { seo_optimizer: false }
    }
  });

  const result = await triggerOptimizerAfterPublish(db, null, { ...WEAK_BLOG }, "blogs");

  assert.ok(result, "hook must return a result object");
  assert.equal(result.skipped, true);
  assert.match(String(result.reason), /automation-disabled/i);
  assert.equal(
    db._writes.length,
    0,
    "a disabled optimizer must write nothing at all — not even to the content doc"
  );
});

test("publish_hook: still optimizes weak content when the guard is enabled (default)", async () => {
  automationGuard.invalidateCache();
  const db = createMockDb({});

  const result = await triggerOptimizerAfterPublish(db, null, { ...WEAK_BLOG }, "blogs");

  assert.ok(result, "hook must return a result object");
  assert.notEqual(result.skipped, true);
  assert.equal(result.status, "optimized", `expected the weak page to be improved, got: ${JSON.stringify(result.status)}`);
  assert.ok(
    db._writes.includes("blogs/weak-blog-guard"),
    "the optimized page must actually be written"
  );
  const blog = db._store.get("blogs/weak-blog-guard") || {};
  assert.equal(blog.optimizerProcessed, true, "result must be recorded on the document");
});
