const test = require("node:test");
const assert = require("node:assert");

// pickPendingMockTest — fake Firestore, zero network.
// REGRESSION: unordered limit(300) window-ke-bahar ke pending tests miss
// karta tha → maker "Nothing pending" bolke exit, videos achanak band.

function fakeDoc(id, data) {
  return { id, ref: { id }, data: () => data };
}

function fakeDb(docs, { failOrdered = false } = {}) {
  const snap = { empty: docs.length === 0, docs };
  return {
    collection: () => ({
      orderBy: () => ({
        limit: () => ({
          get: async () => {
            if (failOrdered) throw new Error("no index");
            return snap;
          },
        }),
      }),
      limit: () => ({ get: async () => snap }),
    }),
  };
}

const ELIGIBLE = (title) => ({ title, questions: [{ qText: "q?" }], status: "" });

test("pickPendingMockTest: newest eligible first + histogram", async () => {
  const { pickPendingMockTest } = require("../mock_test_video");
  const docs = [
    fakeDoc("done-old", { ...ELIGIBLE("Old"), mockVideoMade: true }),
    fakeDoc("new-pending", ELIGIBLE("New")),
    fakeDoc("older-pending", ELIGIBLE("Older")),
  ];
  const pick = await pickPendingMockTest(fakeDb(docs), { limit: 300 });
  assert.equal(pick.targetDoc.id, "new-pending");
  assert.equal(pick.scanned, 3);
  assert.equal(pick.ordered, true);
  assert.deepEqual(pick.histogram, { "mockVideoMade=true": 1, eligible: 2 });
});

test("pickPendingMockTest: ordered fail pe unordered-fallback se target", async () => {
  const { pickPendingMockTest } = require("../mock_test_video");
  const docs = [fakeDoc("pending-1", ELIGIBLE("P1"))];
  const pick = await pickPendingMockTest(fakeDb(docs, { failOrdered: true }), { limit: 300 });
  assert.equal(pick.ordered, false);
  assert.equal(pick.targetDoc.id, "pending-1");
});

test("pickPendingMockTest: koi eligible nahi + khali collection", async () => {
  const { pickPendingMockTest } = require("../mock_test_video");
  const done = [
    fakeDoc("d1", { ...ELIGIBLE("D1"), mockVideoMade: true }),
    fakeDoc("d2", { title: "NoQ" }),
    fakeDoc("d3", { ...ELIGIBLE("D3"), videoStatus: "failed", videoAttempts: 3 }),
  ];
  const none = await pickPendingMockTest(fakeDb(done), { limit: 300 });
  assert.equal(none.targetDoc, null);
  assert.equal(none.scanned, 3);
  assert.equal(none.histogram["mockVideoMade=true"], 1);
  assert.equal(none.histogram["no questions"], 1);
  assert.equal(none.histogram["failed 3x — needs manual reset"], 1);

  const empty = await pickPendingMockTest(fakeDb([]), { limit: 300 });
  assert.equal(empty.targetDoc, null);
  assert.equal(empty.scanned, 0);
  assert.deepEqual(empty.histogram, {});
});
