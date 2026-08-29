"use strict";

/**
 * Phase 2 — SEO Change Events Ledger tests.
 * Behavioral tests: applies/rollbacks through the REAL apply_engine and
 * publish_hook produce exactly one immutable event per applied field; CHECK /
 * preview / rejected proposals never produce applied events; retries are
 * idempotent; rollbacks append (never rewrite); lifecycle + GSC join keys are
 * captured for future measurement. No synthetic GSC data is used anywhere.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildProposal } = require("../agents/seo_intelligence/proposal_model");
const { previewProposal } = require("../agents/seo_intelligence/proposal_gate");
const { applyProposal, rollbackProposal } = require("../agents/seo_intelligence/apply_engine");
const { triggerOptimizerAfterPublish } = require("../agents/seo_intelligence/publish_hook");
const automationGuard = require("../agents/automation_guard");
const ledger = require("../agents/seo_intelligence/change_events");
const { normalizeGscPageUrl } = require("../agents/seo_intelligence/gsc_search_analytics");
const {
  buildChangeEvent,
  buildGscJoinKey,
  classifyLifecycleForLedger,
  isEligibleForAutomaticOptimization,
  recordChangeEvent,
  toEventValue
} = ledger;

const NOW = new Date("2026-08-26T06:00:00.000Z");

function makeDb(initial = {}) {
  const docs = { ...initial };
  const writes = [];
  return {
    _docs: docs,
    _writes: writes,
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            id,
            async get() {
              if (docs[key] !== undefined) return { exists: true, data: () => docs[key] };
              return { exists: false, data: () => ({}) };
            },
            async set(data) {
              writes.push(key);
              docs[key] = { ...(docs[key] || {}), ...data };
              return this;
            },
            async update(data) {
              writes.push(key);
              docs[key] = { ...(docs[key] || {}), ...data };
              return this;
            }
          };
        },
        orderBy() { throw new Error("mock: orderBy unsupported"); }
      };
    }
  };
}

function approvedMeta(overrides = {}) {
  return buildProposal({
    id: "p-meta",
    url: "/job/ssc-cgl-2026",
    contentType: "JOB",
    contentId: "job-1",
    field: "metaDescription",
    oldValue: "",
    proposedValue: "SSC CGL 2026 apply online. Last date 31/12/2026. Use the official link on this page.",
    evidenceIds: ["metadata:missing-description"],
    level: "A",
    status: "approved",
    createdAt: "2026-08-20T00:00:00.000Z",
    confidence: "observed",
    reason: "meta description is missing",
    source: "deterministic-optimizer",
    ...overrides
  });
}

function eventsIn(db) {
  return Object.entries(db._docs)
    .filter(([key]) => key.startsWith("seo_change_events/"))
    .map(([, value]) => value);
}

// ─── Ledger unit behavior ───────────────────────────────────────────

test("buildChangeEvent: full schema, exact old/new values, proposal + snapshot references", () => {
  const event = buildChangeEvent({
    kind: "applied",
    proposal: approvedMeta(),
    collectionName: "jobs",
    contentId: "job-1",
    contentType: "JOB",
    pageUrl: "/job/ssc-cgl-2026",
    page: { lastDate: "2099-12-31", startDate: "2099-01-01" },
    field: "metaDescription",
    oldValue: "",
    newValue: "SSC CGL 2026 apply online. Last date 31/12/2026.",
    snapshotId: "snap-p-meta",
    actor: "admin-dashboard",
    source: "apply-engine",
    at: NOW
  });

  assert.equal(event.schemaVersion, 1);
  assert.equal(event.kind, "applied");
  assert.equal(event.eventType, "seo-change-applied");
  assert.equal(event.contentId, "job-1");
  assert.equal(event.collection, "jobs");
  assert.equal(event.contentType, "JOB");
  assert.equal(event.pageUrl, "/job/ssc-cgl-2026");
  assert.equal(event.gscJoinKey, "https://studygyaan.in/job/ssc-cgl-2026");
  assert.equal(event.field, "metaDescription");
  assert.equal(event.fieldGroup, "metadata");
  assert.equal(event.oldValue.kind, "inline");
  assert.equal(event.oldValue.value, "");
  assert.equal(event.newValue.value, "SSC CGL 2026 apply online. Last date 31/12/2026.");
  assert.equal(event.proposalId, "p-meta");
  assert.equal(event.proposalCreatedAt, "2026-08-20T00:00:00.000Z");
  assert.equal(event.proposalLevel, "A");
  assert.equal(event.proposalConfidence, "observed");
  assert.equal(event.proposalRequiresReview, false);
  assert.equal(event.proposalReason, "meta description is missing");
  assert.equal(event.snapshotId, "snap-p-meta");
  assert.equal(event.actor, "admin-dashboard");
  assert.equal(event.source, "apply-engine");
  assert.equal(event.manualApproved, true);
  assert.equal(event.autoApplied, false);
  assert.equal(event.status, "applied");
  assert.equal(event.at, NOW.toISOString());
  // Lifecycle captured at change time (future start date → UPCOMING, eligible)
  assert.equal(event.lifecycle.status, "UPCOMING");
  assert.equal(event.lifecycle.source, "job_lifecycle");
  assert.equal(event.eligibleForAutomaticOptimization, true);
  // No secrets anywhere on the event
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /private_key|Bearer |client_email|access_token|refresh_token/i);
});

test("large articleHtml uses the compact representation with snapshot reference", () => {
  const html = `<p>${"SSC CGL preparation content. ".repeat(300)}</p>`;
  const event = buildChangeEvent({
    kind: "applied",
    proposal: approvedMeta({ field: "articleHtml", proposedValue: { articleHtml: html } }),
    collectionName: "blogs",
    contentId: "blog-1",
    contentType: "BLOG",
    pageUrl: "/blog/prep",
    page: {},
    field: "articleHtml",
    oldValue: null,
    newValue: html,
    snapshotId: "snap-html-1",
    actor: "auto-optimizer",
    source: "auto-optimizer",
    at: NOW
  });

  assert.equal(event.oldValue.kind, "inline");
  assert.equal(event.oldValue.value, null);
  assert.equal(event.newValue.kind, "compact");
  assert.equal(event.newValue.length, html.length);
  assert.ok(event.newValue.hash.length >= 40);
  assert.ok(event.newValue.preview.length <= 200);
  assert.equal(event.newValue.snapshotId, "snap-html-1");
  // The full HTML must NOT be duplicated into the event
  assert.ok(!JSON.stringify(event).includes(html.slice(0, 400)));
  // Compact representation is deterministic
  const again = toEventValue(html, { snapshotId: "snap-html-1", field: "articleHtml" });
  assert.deepEqual(again, event.newValue);
});

test("GSC join key matches Phase 1 normalization; query strings are never merged", () => {
  assert.equal(buildGscJoinKey("/job/ssc-cgl-2026"), "https://studygyaan.in/job/ssc-cgl-2026");
  assert.equal(
    buildGscJoinKey("HTTPS://StudyGyaan.IN/job/ssc-cgl-2026/#apply"),
    "https://studygyaan.in/job/ssc-cgl-2026"
  );
  // Same key a Phase 1 GSC row would store for this page
  assert.equal(
    buildGscJoinKey("/job/ssc-cgl-2026"),
    normalizeGscPageUrl("https://studygyaan.in/job/ssc-cgl-2026/").normalizedPageUrl
  );
  assert.notEqual(buildGscJoinKey("/job/a?x=1"), buildGscJoinKey("/job/a?x=2"));
  assert.notEqual(buildGscJoinKey("/job/a"), buildGscJoinKey("/job/b"));
  assert.equal(buildGscJoinKey(""), "");
});

test("lifecycle classification: JOB + FAST_TRACK + other types", () => {
  // Active JOB (opens far in the future)
  assert.equal(classifyLifecycleForLedger({ lastDate: "2099-12-31" }, "JOB", NOW).status, "OPEN");
  // Closing soon
  assert.equal(classifyLifecycleForLedger({ lastDate: "2026-08-29" }, "JOB", NOW).status, "CLOSING_SOON");
  // Expired JOB (lastDate more than 30 days ago)
  const expiredJob = classifyLifecycleForLedger({ lastDate: "2026-01-01" }, "JOB", NOW);
  assert.equal(expiredJob.status, "EXPIRED");
  assert.equal(isEligibleForAutomaticOptimization(expiredJob.status), false, "EXPIRED JOB must never be an automatic optimization target");
  // Expired FAST_TRACK via facts.lastDate (fast-track docs keep dates in facts)
  const expiredFastTrack = classifyLifecycleForLedger({ facts: { lastDate: "2026-01-01" } }, "FAST_TRACK", NOW);
  assert.equal(expiredFastTrack.status, "EXPIRED");
  assert.equal(expiredFastTrack.source, "fast-track-last-date");
  assert.equal(isEligibleForAutomaticOptimization(expiredFastTrack.status), false, "EXPIRED FAST_TRACK must never be an automatic optimization target");
  // FAST_TRACK without a date is UNKNOWN → also not an automatic target
  const unknownFt = classifyLifecycleForLedger({}, "FAST_TRACK", NOW);
  assert.equal(unknownFt.status, "UNKNOWN");
  assert.equal(isEligibleForAutomaticOptimization(unknownFt.status), false);
  // Blog has no date lifecycle — recorded as NOT_APPLICABLE, still eligible
  const blogLife = classifyLifecycleForLedger({}, "BLOG", NOW);
  assert.equal(blogLife.status, "NOT_APPLICABLE");
  assert.equal(isEligibleForAutomaticOptimization(blogLife.status), true);
  // UNKNOWN JOB is never an automatic target
  assert.equal(isEligibleForAutomaticOptimization("UNKNOWN"), false);
});

test("legacy proposals without new fields still produce valid events", () => {
  const event = buildChangeEvent({
    kind: "applied",
    proposal: { id: "legacy-1", url: "/blog/old", contentType: "BLOG", contentId: "blog-old", field: "seoTitle" },
    collectionName: "blogs",
    field: "seoTitle",
    oldValue: "Old",
    newValue: "New Title | StudyGyaan",
    at: NOW
  });
  assert.equal(event.proposalId, "legacy-1");
  assert.equal(event.proposalCreatedAt, null);
  assert.equal(event.proposalLevel, null);
  assert.equal(event.proposalConfidence, null);
  assert.equal(event.proposalRequiresReview, null);
  assert.equal(event.snapshotId, null);
  assert.equal(event.lifecycle.status, "NOT_APPLICABLE");
  assert.ok(event.eventId.length >= 40);
});

test("recordChangeEvent is idempotent for identical retries and appends for genuinely new applications", async () => {
  const db = makeDb();
  const base = {
    kind: "applied",
    proposal: approvedMeta(),
    collectionName: "jobs",
    contentId: "job-1",
    contentType: "JOB",
    pageUrl: "/job/ssc-cgl-2026",
    page: { lastDate: "2099-12-31" },
    field: "metaDescription",
    oldValue: "",
    newValue: "First applied value.",
    snapshotId: "snap-1",
    actor: "admin",
    source: "apply-engine",
    at: NOW
  };

  const first = await recordChangeEvent(db, buildChangeEvent(base));
  assert.equal(first.written, true);
  assert.equal(first.reason, "appended");

  // Retried operation → identical core → skipped, no duplicate
  const retry = await recordChangeEvent(db, buildChangeEvent(base));
  assert.equal(retry.written, false);
  assert.equal(retry.reason, "idempotent-skip");
  assert.equal(retry.eventId, first.eventId);
  assert.equal(eventsIn(db).length, 1);

  // Genuinely new application of the same field (different value) → its own
  // deterministic event (content-addressed key); the original is preserved.
  const original = eventsIn(db)[0];
  const second = await recordChangeEvent(db, buildChangeEvent({ ...base, newValue: "Second applied value.", at: new Date("2026-09-01T00:00:00Z") }));
  assert.equal(second.written, true);
  assert.notEqual(second.eventId, first.eventId);
  assert.equal(eventsIn(db).length, 2);
  assert.equal(eventsIn(db)[0].newValue.value, "First applied value.", "original event must not be rewritten");
  assert.equal(original.eventId, eventsIn(db)[0].eventId);

  // Same key + same values but different rollback linkage → suffixed append
  // (history never rewritten, both variants preserved).
  const rollbackBase = { ...base, kind: "rolled_back", oldValue: "First applied value.", newValue: "" };
  const rb1 = await recordChangeEvent(db, buildChangeEvent({ ...rollbackBase, rolledBackFrom: null }));
  assert.equal(rb1.written, true);
  const rb2 = await recordChangeEvent(db, buildChangeEvent({ ...rollbackBase, rolledBackFrom: { eventId: "orig-1", idempotencyKey: "orig-1" } }));
  assert.equal(rb2.written, true);
  assert.equal(rb2.eventId, `${rb1.eventId}-2`, "same key, different core ⇒ suffixed append");
});

// ─── Integration: apply_engine produces ledger events ───────────────

function jobPage() {
  return {
    id: "job-1",
    title: "SSC CGL 2026 Recruitment Apply Online",
    h1: "SSC CGL 2026 Recruitment",
    type: "JOB",
    contentType: "JOB",
    status: "published",
    lastDate: "2099-12-31",
    startDate: "2099-01-01",
    metaDescription: "",
    organization: "SSC",
    vacancies: "10000"
  };
}

async function setupAppliedJob() {
  const db = makeDb();
  const proposal = approvedMeta();
  const result = await applyProposal(db, null, proposal, {
    actor: "admin-dashboard",
    page: jobPage(),
    now: NOW,
    reaudit: false
  });
  assert.equal(result.applied, true);
  return { db, proposal, result };
}

test("apply_engine.applyProposal creates exactly ONE ledger event with correct references", async () => {
  const { db, result } = await setupAppliedJob();
  const events = eventsIn(db);

  assert.equal(events.length, 1, `expected exactly one event, got ${events.length}`);
  const [event] = events;
  assert.equal(event.kind, "applied");
  assert.equal(event.contentId, "job-1");
  assert.equal(event.collection, "jobs");
  assert.equal(event.field, "metaDescription");
  assert.equal(event.oldValue.value, "");
  assert.equal(event.newValue.value, approvedMeta().proposedValue);
  assert.equal(event.snapshotId, result.snapshotId);
  assert.equal(event.proposalId, "p-meta");
  assert.equal(event.source, "apply-engine");
  assert.equal(event.manualApproved, true);
  assert.equal(event.autoApplied, false);
  assert.equal(event.lifecycle.status, "UPCOMING");
  assert.equal(event.gscJoinKey, "https://studygyaan.in/job/ssc-cgl-2026");
});

test("retrying the same apply does not duplicate the ledger event", async () => {
  const db = makeDb();
  const proposal = approvedMeta();
  const options = { actor: "admin-dashboard", page: jobPage(), now: NOW, reaudit: false };
  await applyProposal(db, null, proposal, options);
  // A retried operation (e.g. the proposal status update was lost) re-applies
  // the same change — the ledger must not duplicate it.
  await applyProposal(db, null, approvedMeta(), options);
  assert.equal(eventsIn(db).length, 1);
});

test("CHECK / preview never writes an applied-change event", async () => {
  const db = makeDb();
  const proposal = approvedMeta();
  const preview = previewProposal(proposal, jobPage());
  assert.equal(preview.applyable, true);
  // dry-run apply (the CHECK-style path) also writes no event
  const dry = await applyProposal(db, null, proposal, { actor: "admin", page: jobPage(), now: NOW, dryRun: true, reaudit: false });
  assert.equal(dry.applied, false);
  assert.equal(eventsIn(db).length, 0);
  assert.equal(db._writes.length, 0);
});

test("rejected proposal is not recorded as applied", async () => {
  const db = makeDb();
  const rejected = approvedMeta({ status: "rejected" });
  await assert.rejects(
    () => applyProposal(db, null, rejected, { actor: "admin", page: jobPage(), now: NOW, reaudit: false }),
    /approved/i
  );
  assert.equal(eventsIn(db).length, 0);
});

test("rollback creates a NEW event, references the original, and preserves history", async () => {
  const { db, proposal } = await setupAppliedJob();
  const appliedEventBefore = { ...eventsIn(db)[0] };

  // rollback reads the applied proposal record (status applied + snapshotId)
  const appliedProposal = { ...proposal, status: "applied", applied: true, snapshotId: appliedEventBefore.snapshotId };
  const rollbackAt = new Date("2026-08-27T06:00:00.000Z");
  const rollback = await rollbackProposal(db, null, appliedProposal, { actor: "admin-dashboard", now: rollbackAt });
  assert.equal(rollback.rolledBack, true);

  const events = eventsIn(db);
  assert.equal(events.length, 2, "rollback must be a separate event");
  const rollbackEvent = events.find((event) => event.kind === "rolled_back");
  const appliedEvent = events.find((event) => event.kind === "applied");
  assert.ok(rollbackEvent, "a rolled_back event must exist");
  assert.ok(appliedEvent, "the original applied event must still exist");
  // Original event preserved verbatim
  assert.deepEqual({ ...appliedEvent }, appliedEventBefore);
  // Rollback event linkage + values (undone value → restored value)
  assert.equal(rollbackEvent.rollbackOfEventId, appliedEvent.eventId);
  assert.equal(rollbackEvent.eventType, "seo-change-rolled-back");
  assert.equal(rollbackEvent.oldValue.value, approvedMeta().proposedValue);
  assert.equal(rollbackEvent.newValue.value, "");
  assert.equal(rollbackEvent.at, rollbackAt.toISOString());
  assert.equal(rollbackEvent.status, "rolled_back");
});

// ─── Integration: publish hook (auto-applied changes) ───────────────

test("publish hook auto-applied changes are recorded as automatic events", async () => {
  automationGuard.invalidateCache();
  const db = makeDb();
  const weakBlog = {
    id: "blog-events-1",
    type: "BLOG",
    contentType: "BLOG",
    url: "/blog/ssc-cgl-preparation-tips",
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

  const result = await triggerOptimizerAfterPublish(db, null, { ...weakBlog }, "blogs");
  assert.equal(result.status, "optimized", `fixture must apply changes, got ${result.status}`);

  const events = eventsIn(db);
  assert.ok(events.length >= 1, "auto-applied changes must be ledgered");
  for (const event of events) {
    assert.equal(event.source, "publish-hook");
    assert.equal(event.autoApplied, true);
    assert.equal(event.contentId, "blog-events-1");
    assert.equal(event.contentType, "BLOG");
    assert.equal(event.lifecycle.status, "NOT_APPLICABLE");
    assert.equal(event.gscJoinKey, "https://studygyaan.in/blog/ssc-cgl-preparation-tips");
  }
  // Distinct fields produce distinct deterministic events
  const ids = new Set(events.map((event) => event.eventId));
  assert.equal(ids.size, events.length);
});
