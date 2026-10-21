"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  HEARTBEAT_DOC_PATH,
  OUTCOMES,
  buildHeartbeatPayload,
  writeHeartbeat,
} = require("../blog_heartbeat");

test("heartbeat doc path + outcomes stable hain", () => {
  assert.equal(HEARTBEAT_DOC_PATH, "system_status/blog_pipeline");
  assert.deepEqual(Object.values(OUTCOMES).sort(), ["cap_skip", "error", "published"]);
});

test("published payload me title/url/savedCount aate hain", () => {
  const p = buildHeartbeatPayload({
    outcome: "published",
    savedCount: 1,
    title: "Test Blog",
    url: "https://studygyaan.in/blog/x",
    reason: "topic:scout quality:90",
    runId: "run-1",
    finishedAt: "2026-10-21T00:00:00.000Z",
  });
  assert.equal(p.outcome, "published");
  assert.equal(p.savedCount, 1);
  assert.equal(p.title, "Test Blog");
  assert.equal(p.url, "https://studygyaan.in/blog/x");
  assert.equal(p.runId, "run-1");
  assert.equal(p.source, "auto_blog_v4");
});

test("cap_skip payload default savedCount 0 rakhta hai", () => {
  const p = buildHeartbeatPayload({ outcome: "cap_skip", reason: "daily cap full (2/2)" });
  assert.equal(p.outcome, "cap_skip");
  assert.equal(p.savedCount, 0);
  assert.match(p.reason, /cap full/);
});

test("unknown outcome error me normalize hota hai", () => {
  const p = buildHeartbeatPayload({ outcome: "kuch-bhi" });
  assert.equal(p.outcome, "error");
});

test("lambe fields truncate hote hain (Firestore safety)", () => {
  const p = buildHeartbeatPayload({ outcome: "error", title: "x".repeat(500), reason: "y".repeat(900) });
  assert.ok(p.title.length <= 200);
  assert.ok(p.reason.length <= 500);
});

test("writeHeartbeat mock db pe merge-write karta hai, kabhi throw nahi", async () => {
  let got = null;
  const db = { doc: (path) => ({ set: async (payload, opts) => { got = { path, payload, opts }; } }) };
  const ok = await writeHeartbeat(db, buildHeartbeatPayload({ outcome: "published", runId: "r1" }));
  assert.equal(ok, true);
  assert.equal(got.path, "system_status/blog_pipeline");
  assert.deepEqual(got.opts, { merge: true });
  assert.equal(got.payload.outcome, "published");
});

test("writeHeartbeat db-crash pe false deta hai (run fail nahi)", async () => {
  const badDb = { doc: () => { throw new Error("boom"); } };
  assert.equal(await writeHeartbeat(badDb, buildHeartbeatPayload({})), false);
  assert.equal(await writeHeartbeat(null, buildHeartbeatPayload({})), false);
});
