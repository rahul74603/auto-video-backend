"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildProposal } = require("../agents/seo_intelligence/proposal_model");
const { gateProposal, previewProposal } = require("../agents/seo_intelligence/proposal_gate");
const { applyProposal, rollbackProposal, applyBatch, buildPatch } = require("../agents/seo_intelligence/apply_engine");
const { analyzeGscRows, gscStatusForPage } = require("../agents/seo_intelligence/gsc_insights");
const { compareAudits } = require("../agents/seo_intelligence/reaudit");
const { enqueueItems, runQueuedApplies } = require("../agents/seo_intelligence/batch_queue");
const { PUBLIC_CONTENT_COLLECTIONS } = require("../agents/seo_intelligence/audit_model");

const NOW = new Date("2026-08-26T00:00:00Z");

function approvedMeta() {
  return buildProposal({
    id: "p-meta",
    url: "/job/ssc-cgl-2026",
    contentType: "JOB",
    contentId: "job-1",
    field: "metaDescription",
    oldValue: "",
    proposedValue: "SSC CGL 2026 apply online. Last date 31/12/2026. Use the official link on this page.",
    evidenceIds: ["metadata:missing-description"],
    level: "B",
    status: "approved"
  });
}

function mockDb(docs, writes) {
  return {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              const key = `${name}/${id}`;
              if (docs[key]) return { exists: true, data: () => docs[key] };
              return { exists: false, data: () => ({}) };
            },
            async set(data, opts) {
              writes.push({ collection: name, id, data, opts });
              docs[`${name}/${id}`] = { ...(docs[`${name}/${id}`] || {}), ...data };
            }
          };
        }
      };
    }
  };
}

test("approval preview does not write public content", async () => {
  const writes = [];
  const proposal = approvedMeta();
  const preview = previewProposal(proposal, { title: "SSC CGL 2026 Recruitment Apply Online" });
  assert.equal(preview.applyable, true);
  assert.equal(writes.length, 0);
  assert.equal(preview.oldValue, "");
});

test("apply refuses pending and unapproved proposals", async () => {
  const pending = { ...approvedMeta(), status: "pending" };
  await assert.rejects(() => applyProposal(null, null, pending, { actor: "admin", dryRun: true }), /approved/i);
});

test("apply refuses level C and fact fields", async () => {
  const fact = buildProposal({
    id: "p-sal",
    contentType: "JOB",
    contentId: "job-1",
    field: "salary",
    proposedValue: "₹50,000",
    evidenceIds: ["x"],
    level: "C",
    status: "approved"
  });
  const gate = gateProposal(fact, { contentType: "JOB" });
  assert.equal(gate.ok, false);
  await assert.rejects(() => applyProposal(null, null, fact, { actor: "admin", dryRun: true }), /C|fact/i);
});

test("apply refuses plan-only fields (no HTML dump)", () => {
  const plan = buildProposal({
    id: "p-plan",
    contentType: "BLOG",
    contentId: "b1",
    field: "contentPlan",
    proposedValue: { suggestedSections: ["Steps"] },
    evidenceIds: ["content:thin-blog"],
    level: "B",
    status: "approved"
  });
  assert.equal(gateProposal(plan).ok, false);
  assert.throws(() => buildPatch(plan), /plan/i);
});

test("dry-run apply creates snapshot intent but no public write", async () => {
  const writes = [];
  const docs = {
    "jobs/job-1": { title: "SSC CGL 2026 Recruitment Apply Online", metaDescription: "" }
  };
  const db = mockDb(docs, writes);
  const result = await applyProposal(db, { serverTimestamp: () => "ts" }, approvedMeta(), {
    actor: "rahul@test",
    dryRun: true,
    now: NOW,
    page: docs["jobs/job-1"]
  });
  assert.equal(result.applied, false);
  assert.equal(result.dryRun, true);
  assert.ok(result.snapshot);
  assert.equal(writes.length, 0);
});

test("apply writes snapshot first then only allowlisted public fields", async () => {
  const writes = [];
  const docs = {
    "jobs/job-1": { title: "SSC CGL 2026", metaDescription: "" },
    "system_settings/seo_intelligence": { optimizationProposals: [approvedMeta()] }
  };
  const db = mockDb(docs, writes);
  const result = await applyProposal(db, { serverTimestamp: () => "ts" }, approvedMeta(), {
    actor: "rahul@test",
    now: NOW,
    skipNetwork: true,
    reaudit: false,
    page: docs["jobs/job-1"]
  });
  assert.equal(result.applied, true);
  assert.equal(result.claimedIndexed, false);
  const snapWrite = writes.find((w) => w.collection === "seo_apply_snapshots");
  const jobWrite = writes.find((w) => w.collection === "jobs");
  assert.ok(snapWrite, "snapshot must be written");
  assert.ok(jobWrite, "job patch must be written");
  assert.ok(writes.indexOf(snapWrite) < writes.indexOf(jobWrite), "snapshot before public write");
  assert.equal(Object.prototype.hasOwnProperty.call(jobWrite.data, "metaDescription"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(jobWrite.data, "salary"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(jobWrite.data, "vacancies"), false);
  assert.ok(!writes.some((w) => ["blogs", "fast_track", "mock_tests"].includes(w.collection)));
});

test("apply without actor is unauthorized", async () => {
  await assert.rejects(() => applyProposal(null, null, approvedMeta(), { dryRun: true }), /actor/i);
});

test("rollback restores snapshot old values", async () => {
  const writes = [];
  const proposal = { ...approvedMeta(), status: "applied", applied: true, snapshotId: "snap-1" };
  const docs = {
    "seo_apply_snapshots/snap-1": {
      id: "snap-1",
      collection: "jobs",
      documentId: "job-1",
      oldValues: { metaDescription: "old meta" },
      newValues: { metaDescription: "new meta" }
    },
    "jobs/job-1": { metaDescription: "new meta" },
    "system_settings/seo_intelligence": { optimizationProposals: [proposal] }
  };
  const db = mockDb(docs, writes);
  const result = await rollbackProposal(db, { serverTimestamp: () => "ts" }, proposal, { actor: "rahul@test", now: NOW });
  assert.equal(result.rolledBack, true);
  const jobWrite = writes.find((w) => w.collection === "jobs");
  assert.equal(jobWrite.data.metaDescription, "old meta");
});

test("batch apply caps at 5 and never includes level B by default", async () => {
  const batch = [{ ...approvedMeta(), id: "b-1", level: "B" }];
  for (let i = 0; i < 8; i += 1) {
    batch.push({
      ...approvedMeta(),
      id: `a-${i}`,
      contentId: `job-${i}`,
      level: "A",
      field: "authorName",
      proposedValue: "StudyGyaan Editorial Team"
    });
  }
  const result = await applyBatch(null, null, batch, { actor: "rahul@test", dryRun: true, max: 5 });
  assert.ok(result.processed <= 5);
  assert.ok(result.applied <= 5);
  assert.equal(result.autoApply, false);
  assert.ok(result.results.some((row) => row.skipped === "level-B-not-batched"));
});

test("queue enqueue is idempotent", () => {
  const once = enqueueItems([], ["p1", "p1", "p2"]);
  assert.equal(once.length, 2);
  const twice = enqueueItems(once, ["p2", "p3"]);
  assert.equal(twice.length, 3);
});

test("GSC insights stay unavailable without rows and never fabricate", () => {
  const empty = analyzeGscRows([]);
  assert.equal(empty.status, "unavailable");
  assert.equal(empty.fabricated, false);
  assert.deepEqual(empty.insights, []);
  const page = gscStatusForPage([], "/job/ssc");
  assert.equal(page.status, "unavailable");
  const observed = analyzeGscRows([
    { query: "bank po", page: "https://studygyaan.in/job/ssc-cgl-2026", clicks: 1, impressions: 400, ctr: 0.01, position: 8 }
  ]);
  assert.equal(observed.status, "observed");
  assert.ok(observed.insights.some((item) => item.kind === "GSC_QUERY_PAGE_MISMATCH" || item.kind === "GSC_LOW_CTR"));
});

test("re-audit comparison lists fixed vs remaining findings", () => {
  const diff = compareAudits(
    { health: { score: 60 }, findings: [{ id: "metadata:missing-description" }, { id: "faq:none" }] },
    { health: { score: 80 }, findings: [{ id: "faq:none" }] }
  );
  assert.deepEqual(diff.fixed, ["metadata:missing-description"]);
  assert.ok(diff.remaining.includes("faq:none"));
  assert.match(diff.note, /not a Google ranking score/i);
});

test("expired JobPosting omit patch only clears includeJobPostingSchema", () => {
  const proposal = buildProposal({
    id: "p-schema",
    contentType: "JOB",
    contentId: "job-1",
    field: "schemaMarkup",
    proposedValue: "omit JobPosting (keep Article)",
    evidenceIds: ["schema:expired-jobposting"],
    level: "A",
    status: "approved"
  });
  const patch = buildPatch(proposal);
  assert.deepEqual(patch, { includeJobPostingSchema: false });
});

test("public content allowlist still includes jobs/blogs and not snapshot collection", () => {
  assert.ok(PUBLIC_CONTENT_COLLECTIONS.includes("jobs"));
  assert.ok(!PUBLIC_CONTENT_COLLECTIONS.includes("seo_apply_snapshots"));
});

test("runQueuedApplies does not apply level B", async () => {
  const result = await runQueuedApplies(null, null, [approvedMeta()], { actor: "rahul@test", dryRun: true });
  assert.equal(result.applied, 0);
});
