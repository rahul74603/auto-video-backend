"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const V = require("../video_state");
const dispatcher = require("../video_dispatcher");
const { APPROVED_ANCHORS } = require("../autoVideo");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = () => Date.now();

/* ------------------------------------------------------------------ */
/* JOB eligibility                                                     */
/* ------------------------------------------------------------------ */

test("published JOB with a title is eligible", () => {
  const verdict = V.evaluateJob({ type: "JOB", title: "SSC GD Vacancy 2026", slug: "ssc-gd", createdAt: now() });
  assert.equal(verdict.eligible, true);
});

test("JOB without an explicit type is still eligible (legacy docs)", () => {
  assert.equal(V.evaluateJob({ title: "RRB NTPC Notification", createdAt: now() }).eligible, true);
});

test("non-JOB rows inside the jobs collection are skipped", () => {
  assert.equal(V.evaluateJob({ type: "MATERIAL", title: "Physics Notes", createdAt: now() }).eligible, false);
  assert.equal(V.evaluateJob({ type: "AFFILIATE", title: "Book Deal", createdAt: now() }).eligible, false);
});

test("uploaded study material without a type is detected and skipped", () => {
  const verdict = V.evaluateJob({
    title: "Maths_Notes",
    storagePath: "study_materials/x/file.pdf",
    createdAt: now()
  });
  assert.equal(verdict.eligible, false);
  assert.match(verdict.reason, /study material/);
});

test("draft JOB is skipped", () => {
  assert.equal(V.evaluateJob({ type: "JOB", title: "X", status: "draft", createdAt: now() }).eligible, false);
});

test("JOB without a title is skipped", () => {
  assert.equal(V.evaluateJob({ type: "JOB", title: "   ", createdAt: now() }).eligible, false);
});

/* ------------------------------------------------------------------ */
/* FAST_TRACK eligibility                                              */
/* ------------------------------------------------------------------ */

test("published fast_track item is eligible", () => {
  assert.equal(V.evaluateFastTrack({ status: "published", title: "UPSC Result Out", createdAt: now() }).eligible, true);
});

test("draft fast_track item is skipped", () => {
  const verdict = V.evaluateFastTrack({ status: "draft", title: "UPSC Result Out", createdAt: now() });
  assert.equal(verdict.eligible, false);
  assert.match(verdict.reason, /needs published/);
});

test("fast_track item without a status is skipped", () => {
  assert.equal(V.evaluateFastTrack({ title: "No status", createdAt: now() }).eligible, false);
});

/* ------------------------------------------------------------------ */
/* MOCK_TEST eligibility                                               */
/* ------------------------------------------------------------------ */

test("mock test with questions and mockVideoMade unset is eligible", () => {
  const verdict = V.evaluateMockTest({
    title: "GK Mock Test",
    questions: [{ q: "a" }, { q: "b" }],
    createdAt: now()
  });
  assert.equal(verdict.eligible, true);
});

test("mockVideoMade=true is never reprocessed", () => {
  const verdict = V.evaluateMockTest({ title: "GK", questions: [{ q: "a" }], mockVideoMade: true, createdAt: now() });
  assert.equal(verdict.eligible, false);
  assert.match(verdict.reason, /mockVideoMade/);
});

test("mock test without questions is skipped", () => {
  assert.equal(V.evaluateMockTest({ title: "Empty", questions: [], createdAt: now() }).eligible, false);
});

/* ------------------------------------------------------------------ */
/* Idempotency / duplicate prevention                                  */
/* ------------------------------------------------------------------ */

test("completed video is never regenerated (new field)", () => {
  const data = { type: "JOB", title: "X", videoStatus: V.STATUS.COMPLETED, createdAt: now() };
  assert.equal(V.evaluateJob(data).eligible, false);
});

test("completed video is never regenerated (legacy youtubeVideoId)", () => {
  const data = { type: "JOB", title: "X", youtubeVideoId: "abc123", createdAt: now() };
  assert.equal(V.evaluateJob(data).eligible, false);
});

test("an active processing lock blocks a second worker", () => {
  const data = {
    type: "JOB", title: "X", createdAt: now(),
    videoStatus: V.STATUS.PROCESSING,
    videoStartedAt: now() - 5 * 60 * 1000
  };
  const verdict = V.evaluateJob(data);
  assert.equal(verdict.eligible, false);
  assert.match(verdict.reason, /lock active/);
});

test("a stale processing lock is recoverable (crashed runner)", () => {
  const data = {
    type: "JOB", title: "X", createdAt: now(),
    videoStatus: V.STATUS.PROCESSING,
    videoStartedAt: now() - 2 * HOUR
  };
  assert.equal(V.evaluateJob(data).eligible, true);
});

test("legacy Cloud Function dispatch is respected during its grace window", () => {
  const data = {
    type: "JOB", title: "X", createdAt: now(),
    videoTriggered: true,
    videoTriggeredAt: now() - 60 * 1000
  };
  const verdict = V.evaluateJob(data);
  assert.equal(verdict.eligible, false);
  assert.match(verdict.reason, /grace period/);
});

test("a legacy dispatch that never produced a video is retried after the grace window", () => {
  const data = {
    type: "JOB", title: "X", createdAt: now(),
    videoTriggered: true,
    videoTriggeredAt: now() - 3 * HOUR
  };
  assert.equal(V.evaluateJob(data).eligible, true);
});

/* ------------------------------------------------------------------ */
/* Retry / permanent failure                                           */
/* ------------------------------------------------------------------ */

test("a failed video is retried while attempts remain", () => {
  const data = {
    type: "JOB", title: "X", createdAt: now(),
    videoStatus: V.STATUS.FAILED, videoAttempts: 1
  };
  assert.equal(V.evaluateJob(data).eligible, true);
});

test("a permanently failed video stops being retried", () => {
  const data = {
    type: "JOB", title: "X", createdAt: now(),
    videoStatus: V.STATUS.FAILED, videoAttempts: 3
  };
  const verdict = V.evaluateJob(data);
  assert.equal(verdict.eligible, false);
  assert.match(verdict.reason, /manual reset/);
});

test("upload_failed also counts toward the permanent-failure cap", () => {
  const data = {
    type: "JOB", title: "X", createdAt: now(),
    videoStatus: V.STATUS.UPLOAD_FAILED, videoAttempts: 3
  };
  assert.equal(V.evaluateJob(data).eligible, false);
});

/* ------------------------------------------------------------------ */
/* Admin controls and backlog window                                   */
/* ------------------------------------------------------------------ */

test("admin can exclude an item from video generation", () => {
  assert.equal(V.evaluateJob({ type: "JOB", title: "X", videoExcluded: true, createdAt: now() }).eligible, false);
  assert.equal(V.evaluateJob({ type: "JOB", title: "X", skipVideo: true, createdAt: now() }).eligible, false);
});

test("old backlog content is not auto-rendered", () => {
  const data = { type: "JOB", title: "Old job", createdAt: now() - 60 * DAY };
  const verdict = V.evaluateJob(data);
  assert.equal(verdict.eligible, false);
  assert.match(verdict.reason, /backlog window/);
});

test("the backlog window can be disabled for forced/manual runs", () => {
  const data = { type: "JOB", title: "Old job", createdAt: now() - 60 * DAY };
  assert.equal(V.evaluateJob(data, { maxAgeDays: 0 }).eligible, true);
});

test("content already in the state machine ignores the backlog window", () => {
  const data = {
    type: "JOB", title: "Old but queued", createdAt: now() - 60 * DAY,
    videoStatus: V.STATUS.FAILED, videoAttempts: 1
  };
  assert.equal(V.evaluateJob(data).eligible, true);
});

/* ------------------------------------------------------------------ */
/* Timestamp handling                                                  */
/* ------------------------------------------------------------------ */

test("toMillis understands Firestore Timestamps, Dates, ISO strings and epochs", () => {
  const ms = 1_700_000_000_000;
  assert.equal(V.toMillis({ toMillis: () => ms }), ms);
  assert.equal(V.toMillis({ _seconds: ms / 1000 }), ms);
  assert.equal(V.toMillis(new Date(ms)), ms);
  assert.equal(V.toMillis(new Date(ms).toISOString()), ms);
  assert.equal(V.toMillis(ms), ms);
  assert.equal(V.toMillis(null), 0);
  assert.equal(V.toMillis("not a date"), 0);
});

test("publishedAtMs prefers publishedAt then createdAt", () => {
  assert.equal(V.publishedAtMs({ publishedAt: 2000, createdAt: 1000 }), 2000);
  assert.equal(V.publishedAtMs({ createdAt: 1000 }), 1000);
  assert.equal(V.publishedAtMs({}), 0);
});

/* ------------------------------------------------------------------ */
/* Dispatcher CLI + payloads                                           */
/* ------------------------------------------------------------------ */

test("dispatcher defaults to all pipelines with a limit of one video", () => {
  const args = dispatcher.parseArgs([]);
  assert.equal(args.kind, "all");
  assert.equal(args.limit, 1);
  assert.equal(args.dryRun, false);
  assert.deepEqual(dispatcher.resolveKinds(args.kind), [V.KIND.JOB, V.KIND.FAST_TRACK, V.KIND.MOCK_TEST]);
});

test("dispatcher CLI flags are parsed", () => {
  const args = dispatcher.parseArgs(["--kind=mock_test", "--limit=3", "--dry-run", "--doc=abc", "--scan-limit=42"]);
  assert.equal(args.kind, "mock_test");
  assert.equal(args.limit, 3);
  assert.equal(args.dryRun, true);
  assert.equal(args.doc, "abc");
  assert.equal(args.scanLimit, 42);
  assert.deepEqual(dispatcher.resolveKinds(args.kind), [V.KIND.MOCK_TEST]);
});

test("kind aliases resolve and unknown kinds throw", () => {
  assert.deepEqual(dispatcher.resolveKinds("fasttrack"), [V.KIND.FAST_TRACK]);
  assert.deepEqual(dispatcher.resolveKinds("job,mock-test"), [V.KIND.JOB, V.KIND.MOCK_TEST]);
  assert.throws(() => dispatcher.resolveKinds("nonsense"), /Unknown --kind/);
});

test("JOB payload matches the repository_dispatch client_payload shape", () => {
  const payload = dispatcher.buildJobPayload("doc1", {
    title: "SSC GD 2026", slug: "ssc-gd-2026", category: "Result",
    organization: "SSC", vacancies: 50000, lastDate: "2026-09-01"
  });
  assert.equal(payload.type, "JOB");
  assert.equal(payload.id, "doc1");
  assert.equal(payload.slug, "ssc-gd-2026");
  assert.equal(payload.vacancies, "50000");
  Object.values(payload).forEach((v) => assert.equal(typeof v, "string"));
});

test("FAST_TRACK payload falls back to the document id when slug is missing", () => {
  const payload = dispatcher.buildFastTrackPayload("doc2", { title: "Result Out", org: "UPSC" });
  assert.equal(payload.type, "FAST_TRACK");
  assert.equal(payload.slug, "doc2");
  assert.equal(payload.organization, "UPSC");
  assert.equal(payload.category, "Default");
});

/* ------------------------------------------------------------------ */
/* Anchors (PART 8)                                                    */
/* ------------------------------------------------------------------ */

test("anchor selection is restricted to the five approved anchor files", () => {
  assert.deepEqual([...APPROVED_ANCHORS].sort(), [
    "female_anchor_2.mp4",
    "female_anchor_4.mp4",
    "female_anchor_5.mp4",
    "male_anchor_1.mp4",
    "male_anchor_3.mp4"
  ]);
});

test("every approved anchor file exists in the repository", () => {
  const fs = require("fs");
  const path = require("path");
  APPROVED_ANCHORS.forEach((file) => {
    assert.ok(fs.existsSync(path.join(__dirname, "..", file)), `missing anchor: ${file}`);
  });
});

/* ------------------------------------------------------------------ */
/* Firestore claim transaction                                         */
/* ------------------------------------------------------------------ */

function fakeAdmin() {
  return {
    firestore: Object.assign(() => ({}), {
      FieldValue: {
        serverTimestamp: () => "__ts__",
        delete: () => "__delete__"
      }
    })
  };
}

function fakeDb(docData, exists = true) {
  const updates = [];
  const ref = { id: "doc-1", __updates: updates };
  const db = {
    runTransaction: async (fn) => fn({
      get: async () => ({ exists, data: () => docData }),
      update: (_ref, payload) => updates.push(payload)
    }),
    collection: () => ({ doc: () => ref })
  };
  return { db, ref, updates };
}

test("claim() marks the document processing and increments attempts", async () => {
  const { db, ref, updates } = fakeDb({ type: "JOB", title: "X", createdAt: now() });
  const result = await V.claim(db, fakeAdmin(), V.KIND.JOB, ref, { runId: "run-7" });

  assert.equal(result.claimed, true);
  assert.equal(result.attempts, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].videoStatus, V.STATUS.PROCESSING);
  assert.equal(updates[0].videoLockId, "run-7");
  assert.equal(updates[0].videoAttempts, 1);
});

test("claim() refuses a document that already has a video (no duplicate)", async () => {
  const { db, ref, updates } = fakeDb({ type: "JOB", title: "X", videoStatus: V.STATUS.COMPLETED, createdAt: now() });
  const result = await V.claim(db, fakeAdmin(), V.KIND.JOB, ref, { runId: "run-8" });

  assert.equal(result.claimed, false);
  assert.equal(updates.length, 0);
});

test("claim() refuses a document locked by another live worker", async () => {
  const { db, ref, updates } = fakeDb({
    type: "JOB", title: "X", createdAt: now(),
    videoStatus: V.STATUS.PROCESSING, videoStartedAt: now() - 60_000, videoLockId: "other"
  });
  const result = await V.claim(db, fakeAdmin(), V.KIND.JOB, ref, { runId: "run-9" });

  assert.equal(result.claimed, false);
  assert.equal(updates.length, 0);
});

test("claim() reports a missing document instead of throwing", async () => {
  const { db, ref } = fakeDb(null, false);
  const result = await V.claim(db, fakeAdmin(), V.KIND.JOB, ref, { runId: "run-10" });
  assert.equal(result.claimed, false);
  assert.match(result.reason, /not found/);
});

test("claim({force}) overrides eligibility for manual re-runs", async () => {
  const { db, ref, updates } = fakeDb({ type: "JOB", title: "X", videoStatus: V.STATUS.COMPLETED, createdAt: now() });
  const result = await V.claim(db, fakeAdmin(), V.KIND.JOB, ref, { runId: "run-11", force: true });
  assert.equal(result.claimed, true);
  assert.equal(updates[0].videoStatus, V.STATUS.PROCESSING);
});

/* ------------------------------------------------------------------ */
/* Completion / failure bookkeeping                                    */
/* ------------------------------------------------------------------ */

test("markCompleted writes both the new and the legacy fields", async () => {
  const written = [];
  const ref = { update: async (payload) => written.push(payload) };
  await V.markCompleted({}, fakeAdmin(), "jobs", ref, {
    videoId: "vid123",
    videoUrl: "https://youtu.be/vid123"
  });

  const update = written[0];
  assert.equal(update.videoStatus, V.STATUS.COMPLETED);
  assert.equal(update.videoYouTubeId, "vid123");
  assert.equal(update.youtubeVideoId, "vid123");           // legacy preserved
  assert.equal(update.videoYouTubeUrl, "https://youtu.be/vid123");
  assert.equal(update.youtubeVideoUrl, "https://youtu.be/vid123"); // legacy preserved
  assert.equal(update.videoTriggered, true);
});

test("markCompleted can add engine-specific extras such as mockVideoMade", async () => {
  const written = [];
  const ref = { update: async (payload) => written.push(payload) };
  await V.markCompleted({}, fakeAdmin(), "mock_tests", ref, {
    videoId: "m1", videoUrl: "https://youtu.be/m1", extra: { mockVideoMade: true }
  });
  assert.equal(written[0].mockVideoMade, true);
});

test("markFailed distinguishes upload_failed from failed", async () => {
  const written = [];
  const ref = { update: async (payload) => written.push(payload) };

  await V.markFailed({}, fakeAdmin(), "jobs", ref, new Error("FFmpeg failed: code 1"));
  assert.equal(written[0].videoStatus, V.STATUS.FAILED);
  assert.match(written[0].videoError, /FFmpeg failed/);

  await V.markFailed({}, fakeAdmin(), "jobs", ref, new Error("quota exceeded"), { uploadFailed: true });
  assert.equal(written[1].videoStatus, V.STATUS.UPLOAD_FAILED);
});

test("videoError is trimmed to a concise single-line message", () => {
  const long = new Error("x".repeat(900) + "\nstack line");
  const short = V.shortError(long);
  assert.ok(short.length <= 300);
  assert.ok(!short.includes("\n"));
});

test("safeUpdate never throws when Firestore is unavailable", async () => {
  const db = { collection: () => { throw new Error("permission denied"); } };
  const ok = await V.safeUpdate(db, fakeAdmin(), "jobs", { slug: "x" }, async () => {});
  assert.equal(ok, false);
});
