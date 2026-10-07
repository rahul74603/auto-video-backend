"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { pickDailyTopics, dayIndex, nextSetNumber, DEFAULT_TOPIC_POOL } = require("../auto_premium_sets");
const { countQuestions } = require("../premium_notes");

test("same day → same deterministic pair", () => {
  const d = new Date("2026-10-07T10:00:00Z");
  assert.deepEqual(pickDailyTopics(DEFAULT_TOPIC_POOL, d), pickDailyTopics(DEFAULT_TOPIC_POOL, d));
});

test("pair me duplicate topic nahi", () => {
  const d = new Date("2026-10-07T10:00:00Z");
  const [a, b] = pickDailyTopics(DEFAULT_TOPIC_POOL, d);
  assert.notEqual(a, b);
});

test("consecutive days → different pairs (rotation)", () => {
  const d1 = new Date("2026-10-07T10:00:00Z");
  const d2 = new Date("2026-10-08T10:00:00Z");
  const p1 = pickDailyTopics(DEFAULT_TOPIC_POOL, d1).join("|");
  const p2 = pickDailyTopics(DEFAULT_TOPIC_POOL, d2).join("|");
  assert.notEqual(p1, p2);
});

test("custom pool respected", () => {
  const d = new Date("2026-10-07T10:00:00Z");
  const picks = pickDailyTopics(["T1", "T2", "T3"], d);
  assert.equal(picks.length, 2);
  for (const p of picks) assert.ok(["T1", "T2", "T3"].includes(p));
});

test("dayIndex monotonic", () => {
  assert.ok(dayIndex(new Date("2026-10-08")) > dayIndex(new Date("2026-10-07")));
});

test("nextSetNumber = max+1", async () => {
  const fakeDb = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: () => ({
            limit: () => ({
              get: async () => ({
                forEach: (cb) => [
                  { data: () => ({ setNumber: 3 }) },
                  { data: () => ({ setNumber: 1 }) },
                ].forEach(cb),
              }),
            }),
          }),
        }),
      }),
    }),
  };
  assert.equal(await nextSetNumber(fakeDb, "p1", "t"), 4);
});

test("nextSetNumber db-fail pe 1", async () => {
  const badDb = { collection: () => { throw new Error("boom"); } };
  assert.equal(await nextSetNumber(badDb, "p", "t"), 1);
});

test("countQuestions 25-Q pattern detect karta hai", () => {
  const html = Array.from({ length: 25 }, (_, i) => `<div>Q.${i + 1} sample question?</div>`).join("");
  assert.equal(countQuestions(html), 25);
  assert.equal(countQuestions("<p>no questions here</p>"), 0);
});
