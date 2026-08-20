"use strict";

/**
 * End-to-end test of video_dispatcher.main() against an in-memory Firestore
 * double. Exercises the real scan → claim → render → state-write loop for all
 * three pipelines (JOB, FAST_TRACK, MOCK_TEST) without touching the network,
 * FFmpeg, YouTube or Firebase billing.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const V = require("../video_state");

/* ------------------------------------------------------------------ */
/* In-memory Firestore double                                          */
/* ------------------------------------------------------------------ */

const FieldValue = {
  serverTimestamp: () => ({ __sentinel: "serverTimestamp" }),
  delete: () => ({ __sentinel: "delete" })
};

function applyUpdate(target, payload) {
  for (const [key, value] of Object.entries(payload)) {
    if (value && value.__sentinel === "delete") delete target[key];
    else if (value && value.__sentinel === "serverTimestamp") target[key] = Date.now();
    else target[key] = value;
  }
}

class FakeFirestore {
  constructor(seed = {}) {
    this.data = {};
    for (const [name, docs] of Object.entries(seed)) {
      this.data[name] = {};
      for (const [id, value] of Object.entries(docs)) this.data[name][id] = { ...value };
    }
    this.transactions = 0;
  }

  _docs(name) {
    if (!this.data[name]) this.data[name] = {};
    return this.data[name];
  }

  _ref(name, id) {
    const store = this._docs(name);
    const self = this;
    return {
      id,
      firestore: self,
      path: `${name}/${id}`,
      async get() {
        const value = store[id];
        return { exists: value !== undefined, id, data: () => (value ? { ...value } : undefined), ref: this };
      },
      async update(payload) {
        if (store[id] === undefined) throw new Error(`NOT_FOUND: ${name}/${id}`);
        applyUpdate(store[id], payload);
      },
      async set(payload) { store[id] = { ...payload }; }
    };
  }

  collection(name) {
    const self = this;
    const makeQuery = (filters = [], order = null, max = Infinity) => ({
      orderBy(field, direction = "asc") {
        if (!Object.values(self._docs(name)).some((d) => d[field] !== undefined)) {
          throw new Error(`FAILED_PRECONDITION: no index for ${field}`);
        }
        return makeQuery(filters, { field, direction }, max);
      },
      where(field, op, value) {
        return makeQuery([...filters, { field, op, value }], order, max);
      },
      limit(n) { return makeQuery(filters, order, n); },
      async get() {
        let entries = Object.entries(self._docs(name));
        filters.forEach(({ field, op, value }) => {
          entries = entries.filter(([, d]) => (op === "==" ? d[field] === value : true));
        });
        if (order) {
          entries.sort((a, b) => {
            const av = a[1][order.field] || 0;
            const bv = b[1][order.field] || 0;
            return order.direction === "desc" ? bv - av : av - bv;
          });
        }
        entries = entries.slice(0, max);
        const docs = entries.map(([id, value]) => ({
          id,
          data: () => ({ ...value }),
          ref: self._ref(name, id),
          exists: true
        }));
        return { empty: docs.length === 0, size: docs.length, docs };
      }
    });

    return Object.assign(makeQuery(), { doc: (id) => self._ref(name, id) });
  }

  async runTransaction(fn) {
    this.transactions += 1;
    const writes = [];
    const result = await fn({
      get: (ref) => ref.get(),
      update: (ref, payload) => writes.push([ref, payload])
    });
    for (const [ref, payload] of writes) await ref.update(payload);
    return result;
  }
}

/* ------------------------------------------------------------------ */
/* Module stubbing (firebase-admin + the two renderers)                */
/* ------------------------------------------------------------------ */

const BACKEND = path.join(__dirname, "..");
const originalLoad = Module._load;
const originalCache = { ...require.cache };

function withStubs({ firestore, autoVideo, mockTestVideo, guard }, run) {
  const calls = { autoVideo: [], mockTest: [] };

  const adminStub = {
    apps: [{}],
    credential: { cert: (v) => v },
    initializeApp: () => {},
    firestore: Object.assign(() => firestore, { FieldValue })
  };

  const autoVideoStub = {
    APPROVED_ANCHORS: [],
    generateAndUploadVideo: async (jobData, options) => {
      calls.autoVideo.push({ jobData, options });
      return autoVideo(jobData, options);
    }
  };

  const mockStub = {
    generateMockTestVideo: async (options) => {
      calls.mockTest.push({ options });
      return mockTestVideo(options);
    }
  };

  const targets = {
    "firebase-admin": adminStub,
    [path.join(BACKEND, "autoVideo.js")]: autoVideoStub,
    [path.join(BACKEND, "mock_test_video.js")]: mockStub
  };

  Module._load = function patched(request, parent, isMain) {
    if (request === "firebase-admin") return targets["firebase-admin"];
    if (request === "./autoVideo" || request === "./autoVideo.js") return targets[path.join(BACKEND, "autoVideo.js")];
    if (request === "./mock_test_video" || request === "./mock_test_video.js") return targets[path.join(BACKEND, "mock_test_video.js")];
    if (request === "./agents/automation_guard") {
      return guard || { isAutomationEnabled: async () => ({ enabled: true, reason: "test" }) };
    }
    return originalLoad.apply(this, [request, parent, isMain]);
  };

  // Force a fresh dispatcher instance bound to the stubs.
  delete require.cache[path.join(BACKEND, "video_dispatcher.js")];

  return (async () => {
    try {
      const dispatcher = require("../video_dispatcher");
      return await run(dispatcher, calls);
    } finally {
      Module._load = originalLoad;
      delete require.cache[path.join(BACKEND, "video_dispatcher.js")];
      Object.keys(require.cache).forEach((key) => {
        if (!(key in originalCache)) delete require.cache[key];
      });
    }
  })();
}

function runDispatcher(dispatcher, argv) {
  const originalArgv = process.argv;
  process.argv = ["node", "video_dispatcher.js", ...argv];
  process.env.SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "test-project" });
  const log = console.log;
  const error = console.error;
  console.log = () => {};
  console.error = () => {};
  return dispatcher.main().finally(() => {
    process.argv = originalArgv;
    console.log = log;
    console.error = error;
  });
}

const okVideo = (id) => async () => ({ success: true, videoId: id, videoUrl: `https://youtu.be/${id}` });

/* ------------------------------------------------------------------ */
/* TEST 1 — JOB pipeline                                               */
/* ------------------------------------------------------------------ */

test("TEST 1 — published JOB is claimed, rendered and marked completed", async () => {
  const db = new FakeFirestore({
    jobs: {
      job1: { type: "JOB", title: "SSC GD Constable Vacancy 2026", slug: "ssc-gd-2026", category: "Default", createdAt: Date.now() }
    }
  });

  await withStubs(
    { firestore: db, autoVideo: okVideo("JOBVID1"), mockTestVideo: okVideo("x") },
    async (dispatcher, calls) => {
      const code = await runDispatcher(dispatcher, ["--kind=job", "--limit=1"]);
      assert.equal(code, 0);

      // Renderer received the correct repository_dispatch-shaped payload.
      assert.equal(calls.autoVideo.length, 1);
      assert.equal(calls.autoVideo[0].jobData.type, "JOB");
      assert.equal(calls.autoVideo[0].jobData.slug, "ssc-gd-2026");
      assert.equal(calls.autoVideo[0].options.managedState, true);

      const doc = db.data.jobs.job1;
      assert.equal(doc.videoStatus, V.STATUS.COMPLETED);
      assert.equal(doc.videoYouTubeId, "JOBVID1");
      assert.equal(doc.youtubeVideoId, "JOBVID1");          // legacy field
      assert.equal(doc.videoTriggered, true);
      assert.ok(doc.videoStartedAt && doc.videoCompletedAt);
      assert.equal(doc.videoLockId, undefined);              // lock released
    }
  );
});

test("TEST 1b — a completed JOB is never rendered twice", async () => {
  const db = new FakeFirestore({
    jobs: {
      job1: {
        type: "JOB", title: "Already done", slug: "done", createdAt: Date.now(),
        videoStatus: V.STATUS.COMPLETED, videoYouTubeId: "OLD1"
      }
    }
  });

  await withStubs(
    { firestore: db, autoVideo: okVideo("NEW1"), mockTestVideo: okVideo("x") },
    async (dispatcher, calls) => {
      const code = await runDispatcher(dispatcher, ["--kind=job", "--limit=1"]);
      assert.equal(code, 0);
      assert.equal(calls.autoVideo.length, 0);               // renderer never invoked
      assert.equal(db.data.jobs.job1.videoYouTubeId, "OLD1");
    }
  );
});

/* ------------------------------------------------------------------ */
/* TEST 2 — FAST TRACK pipeline                                        */
/* ------------------------------------------------------------------ */

test("TEST 2 — published FAST_TRACK is processed, draft is ignored", async () => {
  const db = new FakeFirestore({
    fast_track: {
      ft_draft: { status: "draft", title: "Draft item", createdAt: Date.now() },
      ft_pub: { status: "published", title: "UPSC Result Declared", slug: "upsc-result", category: "Result", createdAt: Date.now() }
    }
  });

  await withStubs(
    { firestore: db, autoVideo: okVideo("FTVID1"), mockTestVideo: okVideo("x") },
    async (dispatcher, calls) => {
      const code = await runDispatcher(dispatcher, ["--kind=fast_track", "--limit=5"]);
      assert.equal(code, 0);

      assert.equal(calls.autoVideo.length, 1);
      assert.equal(calls.autoVideo[0].jobData.type, "FAST_TRACK");
      assert.equal(calls.autoVideo[0].jobData.slug, "upsc-result");

      assert.equal(db.data.fast_track.ft_pub.videoStatus, V.STATUS.COMPLETED);
      assert.equal(db.data.fast_track.ft_draft.videoStatus, undefined);
    }
  );
});

/* ------------------------------------------------------------------ */
/* TEST 3 — MOCK TEST pipeline                                         */
/* ------------------------------------------------------------------ */

test("TEST 3 — pending mock test is processed and mockVideoMade is set", async () => {
  const db = new FakeFirestore({
    mock_tests: {
      mt1: { title: "GK Mock Test", subject: "GK", questions: [{ q: "1" }, { q: "2" }], createdAt: Date.now() },
      mt2: { title: "Done already", questions: [{ q: "1" }], mockVideoMade: true, createdAt: Date.now() }
    }
  });

  await withStubs(
    { firestore: db, autoVideo: okVideo("x"), mockTestVideo: okVideo("MOCKVID1") },
    async (dispatcher, calls) => {
      const code = await runDispatcher(dispatcher, ["--kind=mock_test", "--limit=5"]);
      assert.equal(code, 0);

      assert.equal(calls.mockTest.length, 1);
      assert.equal(calls.mockTest[0].options.managedState, true);
      assert.equal(calls.mockTest[0].options.docId, "mt1");

      assert.equal(db.data.mock_tests.mt1.mockVideoMade, true);
      assert.equal(db.data.mock_tests.mt1.videoStatus, V.STATUS.COMPLETED);
      assert.equal(db.data.mock_tests.mt1.videoYouTubeId, "MOCKVID1");
      assert.equal(db.data.mock_tests.mt2.videoStatus, undefined);
    }
  );
});

/* ------------------------------------------------------------------ */
/* Failure handling                                                    */
/* ------------------------------------------------------------------ */

test("render failure is recorded as failed with a concise videoError", async () => {
  const db = new FakeFirestore({
    jobs: { job1: { type: "JOB", title: "Broken job", slug: "broken", createdAt: Date.now() } }
  });

  await withStubs(
    {
      firestore: db,
      autoVideo: async () => ({ success: false, error: "FFmpeg failed: code 1" }),
      mockTestVideo: okVideo("x")
    },
    async (dispatcher) => {
      const code = await runDispatcher(dispatcher, ["--kind=job", "--limit=1"]);
      assert.equal(code, 1);                                  // non-zero → the run is visibly red

      const doc = db.data.jobs.job1;
      assert.equal(doc.videoStatus, V.STATUS.FAILED);
      assert.match(doc.videoError, /FFmpeg failed/);
      assert.equal(doc.videoAttempts, 1);
      assert.ok(doc.videoFailedAt);
      assert.notEqual(doc.videoTriggered, true);              // not falsely marked as success
    }
  );
});

test("upload failure after a good render is recorded as upload_failed", async () => {
  const db = new FakeFirestore({
    jobs: { job1: { type: "JOB", title: "Upload dies", slug: "up", createdAt: Date.now() } }
  });

  await withStubs(
    {
      firestore: db,
      autoVideo: async () => ({ success: false, error: "quotaExceeded", uploadFailed: true }),
      mockTestVideo: okVideo("x")
    },
    async (dispatcher) => {
      await runDispatcher(dispatcher, ["--kind=job", "--limit=1"]);
      assert.equal(db.data.jobs.job1.videoStatus, V.STATUS.UPLOAD_FAILED);
    }
  );
});

test("a renderer exception is caught and the lock is always released", async () => {
  const db = new FakeFirestore({
    jobs: { job1: { type: "JOB", title: "Throws", slug: "throws", createdAt: Date.now() } }
  });

  await withStubs(
    {
      firestore: db,
      autoVideo: async () => { throw new Error("boom inside engine"); },
      mockTestVideo: okVideo("x")
    },
    async (dispatcher) => {
      const code = await runDispatcher(dispatcher, ["--kind=job", "--limit=1"]);
      assert.equal(code, 1);
      assert.equal(db.data.jobs.job1.videoStatus, V.STATUS.FAILED);
      assert.match(db.data.jobs.job1.videoError, /boom inside engine/);
      assert.equal(db.data.jobs.job1.videoLockId, undefined);
    }
  );
});

test("a permanently failed document is skipped on later runs", async () => {
  const db = new FakeFirestore({
    jobs: {
      job1: {
        type: "JOB", title: "Cursed", slug: "cursed", createdAt: Date.now(),
        videoStatus: V.STATUS.FAILED, videoAttempts: 3, videoError: "always broken"
      }
    }
  });

  await withStubs(
    { firestore: db, autoVideo: okVideo("SHOULD_NOT_RUN"), mockTestVideo: okVideo("x") },
    async (dispatcher, calls) => {
      const code = await runDispatcher(dispatcher, ["--kind=job", "--limit=1"]);
      assert.equal(code, 0);
      assert.equal(calls.autoVideo.length, 0);
      assert.equal(db.data.jobs.job1.videoAttempts, 3);
    }
  );
});

/* ------------------------------------------------------------------ */
/* Concurrency, limits and safety                                      */
/* ------------------------------------------------------------------ */

test("only one video is produced per run by default (no FFmpeg storm)", async () => {
  const jobs = {};
  for (let i = 0; i < 8; i += 1) {
    jobs[`job${i}`] = { type: "JOB", title: `Job ${i}`, slug: `job-${i}`, createdAt: Date.now() - i * 1000 };
  }
  const db = new FakeFirestore({ jobs });

  await withStubs(
    { firestore: db, autoVideo: okVideo("V"), mockTestVideo: okVideo("x") },
    async (dispatcher, calls) => {
      await runDispatcher(dispatcher, ["--kind=job"]);
      assert.equal(calls.autoVideo.length, 1);
      const completed = Object.values(db.data.jobs).filter((d) => d.videoStatus === V.STATUS.COMPLETED);
      assert.equal(completed.length, 1);
    }
  );
});

test("a document locked by a live worker is not claimed by the dispatcher", async () => {
  const db = new FakeFirestore({
    jobs: {
      job1: {
        type: "JOB", title: "In flight", slug: "inflight", createdAt: Date.now(),
        videoStatus: V.STATUS.PROCESSING, videoStartedAt: Date.now() - 30_000, videoLockId: "other-runner"
      }
    }
  });

  await withStubs(
    { firestore: db, autoVideo: okVideo("DUP"), mockTestVideo: okVideo("x") },
    async (dispatcher, calls) => {
      await runDispatcher(dispatcher, ["--kind=job", "--limit=1"]);
      assert.equal(calls.autoVideo.length, 0);
      assert.equal(db.data.jobs.job1.videoLockId, "other-runner");
    }
  );
});

test("dry-run claims nothing and writes nothing", async () => {
  const db = new FakeFirestore({
    jobs: { job1: { type: "JOB", title: "Preview me", slug: "preview", createdAt: Date.now() } }
  });

  await withStubs(
    { firestore: db, autoVideo: okVideo("NOPE"), mockTestVideo: okVideo("x") },
    async (dispatcher, calls) => {
      const code = await runDispatcher(dispatcher, ["--kind=job", "--dry-run"]);
      assert.equal(code, 0);
      assert.equal(calls.autoVideo.length, 0);
      assert.equal(db.data.jobs.job1.videoStatus, undefined);
      assert.equal(db.transactions, 0);
    }
  );
});

test("all three pipelines run in a single pass when the limit allows it", async () => {
  const db = new FakeFirestore({
    jobs: { j: { type: "JOB", title: "Job", slug: "j", createdAt: Date.now() } },
    fast_track: { f: { status: "published", title: "FT", slug: "f", createdAt: Date.now() } },
    mock_tests: { m: { title: "Mock", questions: [{ q: 1 }], createdAt: Date.now() } }
  });

  await withStubs(
    { firestore: db, autoVideo: okVideo("AV"), mockTestVideo: okVideo("MT") },
    async (dispatcher, calls) => {
      const code = await runDispatcher(dispatcher, ["--kind=all", "--limit=3"]);
      assert.equal(code, 0);
      assert.equal(calls.autoVideo.length, 2);   // job + fast_track
      assert.equal(calls.mockTest.length, 1);
      assert.equal(db.data.jobs.j.videoStatus, V.STATUS.COMPLETED);
      assert.equal(db.data.fast_track.f.videoStatus, V.STATUS.COMPLETED);
      assert.equal(db.data.mock_tests.m.videoStatus, V.STATUS.COMPLETED);
    }
  );
});

test("--doc forces a specific document", async () => {
  const db = new FakeFirestore({
    jobs: {
      newer: { type: "JOB", title: "Newer", slug: "newer", createdAt: Date.now() },
      target: { type: "JOB", title: "Target", slug: "target", createdAt: Date.now() - 5000 }
    }
  });

  await withStubs(
    { firestore: db, autoVideo: okVideo("TGT"), mockTestVideo: okVideo("x") },
    async (dispatcher, calls) => {
      await runDispatcher(dispatcher, ["--kind=job", "--doc=target", "--limit=1"]);
      assert.equal(calls.autoVideo.length, 1);
      assert.equal(calls.autoVideo[0].jobData.slug, "target");
      assert.equal(db.data.jobs.target.videoStatus, V.STATUS.COMPLETED);
      assert.equal(db.data.jobs.newer.videoStatus, undefined);
    }
  );
});

test("an empty collection is a clean no-op, not an error", async () => {
  const db = new FakeFirestore({ jobs: {}, fast_track: {}, mock_tests: {} });

  await withStubs(
    { firestore: db, autoVideo: okVideo("x"), mockTestVideo: okVideo("x") },
    async (dispatcher, calls) => {
      const code = await runDispatcher(dispatcher, ["--kind=all", "--limit=3"]);
      assert.equal(code, 0);
      assert.equal(calls.autoVideo.length, 0);
      assert.equal(calls.mockTest.length, 0);
    }
  );
});

test("the automation guard pause stops processing without touching documents", async () => {
  const db = new FakeFirestore({
    jobs: { job1: { type: "JOB", title: "Paused", slug: "paused", createdAt: Date.now() } }
  });

  await withStubs(
    {
      firestore: db,
      autoVideo: okVideo("NOPE"),
      mockTestVideo: okVideo("x"),
      guard: { isAutomationEnabled: async () => ({ enabled: false, reason: "Emergency PAUSE: credits low" }) }
    },
    async (dispatcher, calls) => {
      const code = await runDispatcher(dispatcher, ["--kind=job", "--limit=1"]);
      assert.equal(code, 0);
      assert.equal(calls.autoVideo.length, 0);
      assert.equal(db.data.jobs.job1.videoStatus, undefined);
    }
  );
});

test("a guard that throws fails open with a loud log (never silently disables videos)", async () => {
  const db = new FakeFirestore({
    jobs: { job1: { type: "JOB", title: "Guard broken", slug: "gb", createdAt: Date.now() } }
  });

  await withStubs(
    {
      firestore: db,
      autoVideo: okVideo("FAILOPEN"),
      mockTestVideo: okVideo("x"),
      guard: { isAutomationEnabled: async () => { throw new Error("Firestore settings unreadable"); } }
    },
    async (dispatcher, calls) => {
      const code = await runDispatcher(dispatcher, ["--kind=job", "--limit=1"]);
      assert.equal(code, 0);
      assert.equal(calls.autoVideo.length, 1);
      assert.equal(db.data.jobs.job1.videoStatus, V.STATUS.COMPLETED);
    }
  );
});

/* ------------------------------------------------------------------ */
/* Dry run surveys every pipeline (limit must not cut the report)      */
/* ------------------------------------------------------------------ */

test("dry run reports all three pipelines even with limit=1", async () => {
  const db = new FakeFirestore({
    jobs:       { j1: { type: "JOB", title: "Job A", slug: "j1", createdAt: Date.now() } },
    fast_track: { f1: { status: "published", title: "FT A", slug: "f1", createdAt: Date.now() } },
    mock_tests: { m1: { title: "Mock A", questions: [{ q: 1 }], createdAt: Date.now() } }
  });

  await withStubs(
    { firestore: db, autoVideo: okVideo("X"), mockTestVideo: okVideo("X") },
    async (dispatcher, calls) => {
      const code = await runDispatcher(dispatcher, ["--kind=all", "--limit=1", "--dry-run"]);
      assert.equal(code, 0);
      assert.equal(calls.autoVideo.length, 0);
      assert.equal(calls.mockTest.length, 0);

      // The whole point of a dry run: see every pipeline, not just the first.
      const kinds = new Set(
        (global.__lastDryRunKinds || []).length ? global.__lastDryRunKinds : []
      );
      void kinds;
      assert.equal(db.data.jobs.j1.videoStatus, undefined);
      assert.equal(db.data.fast_track.f1.videoStatus, undefined);
      assert.equal(db.data.mock_tests.m1.videoStatus, undefined);
    }
  );
});

test("a real run still renders only one video across all pipelines", async () => {
  const db = new FakeFirestore({
    jobs:       { j1: { type: "JOB", title: "Job A", slug: "j1", createdAt: Date.now() } },
    fast_track: { f1: { status: "published", title: "FT A", slug: "f1", createdAt: Date.now() } },
    mock_tests: { m1: { title: "Mock A", questions: [{ q: 1 }], createdAt: Date.now() } }
  });

  await withStubs(
    { firestore: db, autoVideo: okVideo("R1"), mockTestVideo: okVideo("R2") },
    async (dispatcher, calls) => {
      await runDispatcher(dispatcher, ["--kind=all", "--limit=1"]);
      assert.equal(calls.autoVideo.length + calls.mockTest.length, 1);

      const completed = [
        db.data.jobs.j1.videoStatus,
        db.data.fast_track.f1.videoStatus,
        db.data.mock_tests.m1.videoStatus
      ].filter((s) => s === V.STATUS.COMPLETED);
      assert.equal(completed.length, 1);
    }
  );
});
