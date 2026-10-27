const test = require("node:test");
const assert = require("node:assert");
const V = require("../video_state");

// claim() transaction-retry — fake Firestore, zero network.
// REGRESSION: dispatcher run tx-expired INVALID_ARGUMENT pe poora red (exit 1).
// Ab: transient pe fresh-tx retry (3x), logical-false/non-transient pe turant wapas.

function txExpired() {
  const e = new Error("3 INVALID_ARGUMENT: The referenced transaction has expired or is no longer valid.");
  e.code = 3;
  return e;
}

function fakeDb({ data, failTimes = 0, failErr = null }) {
  let calls = 0;
  const tx = {
    get: async () => ({ exists: true, data: () => data }),
    update: () => {},
  };
  return {
    calls: () => calls,
    collection: () => ({ doc: () => ({}) }),
    runTransaction: async (fn) => {
      calls++;
      if (calls <= failTimes) throw failErr || txExpired();
      return fn(tx);
    },
  };
}

const FAKE_ADMIN = { firestore: { FieldValue: { serverTimestamp: () => "TS", delete: () => "DEL" } } };
const ELIGIBLE_MOCK = { title: "T", questions: [{ qText: "q?" }] };

test("isTransientTxError: tx-expiry + retryable codes true, baaki false", () => {
  assert.equal(V.isTransientTxError(txExpired()), true);
  assert.equal(V.isTransientTxError(Object.assign(new Error("aborted"), { code: 10 })), true);
  assert.equal(V.isTransientTxError(Object.assign(new Error("unavailable"), { code: 14 })), true);
  assert.equal(V.isTransientTxError(Object.assign(new Error("deadline"), { code: 4 })), true);
  assert.equal(V.isTransientTxError(Object.assign(new Error("bad arg"), { code: 3 })), false);
  assert.equal(V.isTransientTxError(Object.assign(new Error("denied"), { code: 7 })), false);
  assert.equal(V.isTransientTxError(null), false);
  assert.equal(V.isTransientTxError(new Error("boom")), false);
});

test("claim: 2 transient fails ke baad 3rd attempt success", async () => {
  const db = fakeDb({ data: ELIGIBLE_MOCK, failTimes: 2 });
  const out = await V.claim(db, FAKE_ADMIN, V.KIND.MOCK_TEST, "doc1", { runId: "t", maxAgeDays: 0 });
  assert.equal(out.claimed, true);
  assert.equal(out.attempts, 1);
  assert.equal(db.calls(), 3);
});

test("claim: logical ineligible pe retry NAHI (1 call)", async () => {
  const db = fakeDb({ data: { ...ELIGIBLE_MOCK, mockVideoMade: true } });
  const out = await V.claim(db, FAKE_ADMIN, V.KIND.MOCK_TEST, "doc1", { runId: "t", maxAgeDays: 0 });
  assert.equal(out.claimed, false);
  assert.equal(db.calls(), 1);
});

test("claim: non-transient throw turant (1 call, no retry)", async () => {
  const denied = Object.assign(new Error("denied"), { code: 7 });
  const db = fakeDb({ data: ELIGIBLE_MOCK, failTimes: 5, failErr: denied });
  await assert.rejects(() => V.claim(db, FAKE_ADMIN, V.KIND.MOCK_TEST, "doc1", { runId: "t" }), /denied/);
  assert.equal(db.calls(), 1);
});

test("claim: lagatar transient pe 3 attempts ke baad throw", async () => {
  const db = fakeDb({ data: ELIGIBLE_MOCK, failTimes: 9 });
  await assert.rejects(() => V.claim(db, FAKE_ADMIN, V.KIND.MOCK_TEST, "doc1", { runId: "t" }), /expired/);
  assert.equal(db.calls(), 3);
});
