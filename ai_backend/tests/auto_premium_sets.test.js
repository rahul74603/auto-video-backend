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

// ---------- PHASE-3 v2: dedupe / exam-hierarchy / gates ----------
const { pickDailyCombo, normalizeQ, qHash, collectAvoidQuestions } = require("../auto_premium_sets");
const { isAcceptableSetSize, CURRENT_YEAR } = require("../premium_notes");
const { seoSlug, ensureFolder, renderSyllabusHtml } = require("../exam_blueprint");

test("normalizeQ + qHash deterministic (duplicate detection)", () => {
  const a = "Q.1  A train runs 60 km/h!  <p>find time</p>";
  const b = "q.1 a train runs 60 km/h find time";
  assert.equal(normalizeQ(a), normalizeQ(b));
  assert.equal(qHash(a), qHash(b));
  assert.notEqual(qHash(a), qHash("different question"));
});

test("collectAvoidQuestions Q-texts nikalta hai, FOLDER skip", async () => {
  const q = (n, body) => `<div>Q.${n} ${body.repeat(3)}</div>`;
  const docs = [
    { id: "a", data: () => ({ type: "article", content: q(1, "Old rivers question") + q(2, "Old mountains question") }) },
    { id: "b", data: () => ({ type: "FOLDER", content: "" }) },
    { id: "c", data: () => ({ type: "article", content: q(1, "Old polity articles question") }) },
  ];
  const fakeDb = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: () => ({
            limit: () => ({ get: async () => ({ forEach: (cb) => docs.forEach(cb) }) }),
          }),
        }),
      }),
    }),
  };
  const avoid = await collectAvoidQuestions(fakeDb, "pack", "folder");
  assert.ok(avoid.includes("Old rivers question"));
  assert.ok(avoid.includes("Old polity articles question"));
  assert.ok(!avoid.includes("FOLDER"));
});

test("pickDailyCombo subject+type deterministically rotate", () => {
  const bp = {
    subjects: [
      { name: "Maths", questionTypes: ["A", "B", "C"] },
      { name: "Reasoning", questionTypes: ["D", "E"] },
    ],
  };
  const d1 = new Date("2026-01-01T00:00:00Z");
  const d2 = new Date("2026-01-02T00:00:00Z");
  assert.deepEqual(pickDailyCombo(bp, 0, d1), pickDailyCombo(bp, 0, d1));
  assert.notEqual(pickDailyCombo(bp, 0, d1).subject.name, pickDailyCombo(bp, 0, d2).subject.name);
  const c = pickDailyCombo(bp, 0, d1);
  assert.ok(c.subject.questionTypes.includes(c.type));
  assert.equal(pickDailyCombo({ subjects: [] }, 0, d1), null);
  assert.equal(pickDailyCombo({ subjects: [{ name: "X", questionTypes: [] }] }, 0, d1).type, "Important Questions");
});

test("20-30 gate boundaries + dynamic year", () => {
  assert.equal(isAcceptableSetSize(19), false);
  assert.equal(isAcceptableSetSize(20), true);
  assert.equal(isAcceptableSetSize(25), true);
  assert.equal(isAcceptableSetSize(30), true);
  assert.equal(isAcceptableSetSize(31), false);
  assert.equal(CURRENT_YEAR, new Date().getFullYear());
});

test("seoSlug + syllabus doc render", () => {
  assert.equal(seoSlug("Railway Group D 2027"), "railway-group-d-2027");
  const html = renderSyllabusHtml(
    {
      exam: "Railway",
      section: "Group D",
      subjects: [{ name: "Maths", questionTypes: ["Percentage"] }],
      syllabus: { written: ["Fractions"], physical: ["1600m run"] },
      eligibility: { education: "10th", age: "18-33" },
    },
    2027
  );
  assert.ok(html.includes("Railway Group D"));
  assert.ok(html.includes("2027"));
  assert.ok(html.includes("1600m run"));
  assert.ok(html.includes("Percentage"));
});

test("ensureFolder idempotent (same title → same id, naya nahi)", async () => {
  const docs = [{ id: "f1", data: () => ({ title: "Railway Special 2027", parentId: null }) }];
  const added = [];
  const fakeDb = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: (field, op, val) => ({
            limit: () => ({
              get: async () => ({
                forEach: (cb) => docs.filter((d) => d.data().parentId === val).forEach(cb),
              }),
            }),
          }),
          add: async (d) => {
            const id = "new" + added.length;
            added.push({ id, ...d });
            return { id };
          },
        }),
      }),
    }),
  };
  assert.equal(await ensureFolder(fakeDb, "pack", null, "Railway Special 2027"), "f1");
  assert.equal(await ensureFolder(fakeDb, "pack", null, "SSC Special 2027"), "new0");
  assert.equal(added[0].type, "FOLDER");
  assert.equal(added[0].seoSlug, "ssc-special-2027");
});

// ---------- PHASE-3 v3: exam-default system ----------
const { combosForRun, DEFAULT_BLUEPRINTS } = require("../auto_premium_sets");
const { ensureExamPack, ensureHierarchy } = require("../exam_blueprint");

test("combosForRun alag subjects cover karta hai + deterministic", () => {
  const bp = {
    subjects: [
      { name: "Maths", questionTypes: ["A", "B"] },
      { name: "Reasoning", questionTypes: ["C"] },
      { name: "Science", questionTypes: ["D"] },
      { name: "GK", questionTypes: ["E"] },
    ],
  };
  const d1 = new Date("2026-01-01T00:00:00Z");
  const c = combosForRun(bp, 0, d1, 2);
  assert.equal(c.length, 2);
  assert.notEqual(c[0].subject.name, c[1].subject.name);
  assert.deepEqual(combosForRun(bp, 0, d1, 2), c);
  // 2 din me saare 4 subjects cover
  const d2 = new Date("2026-01-02T00:00:00Z");
  const names = new Set([...combosForRun(bp, 0, d1, 2), ...combosForRun(bp, 0, d2, 2), ...combosForRun(bp, 1, d1, 2), ...combosForRun(bp, 1, d2, 2)].map((x) => x.subject.name));
  assert.equal(names.size, 4);
  assert.ok(DEFAULT_BLUEPRINTS.length >= 2);
});

test("ensureExamPack idempotent — same title → same pack", async () => {
  const added = [];
  const fakeDb = {
    collection: (name) => {
      assert.equal(name, "courses");
      return {
        where: (f, op, val) => ({
          limit: () => ({
            get: async () => ({
              forEach: (cb) => {
                if (val.startsWith("Railway Special") && added.length) cb({ id: "packX" });
              },
            }),
          }),
        }),
        add: async (d) => {
          const id = "new" + added.length;
          added.push({ id, ...d });
          return { id };
        },
      };
    },
  };
  const first = await ensureExamPack(fakeDb, "Railway");
  assert.equal(first, "new0");
  assert.equal(added[0].autoCreated, true);
  const second = await ensureExamPack(fakeDb, "Railway");
  assert.equal(second, "packX");
  assert.equal(added.length, 1);
});

test("ensureHierarchy: section root folder + subjects andar", async () => {
  const store = [];
  const fakeDb = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: (f, op, val) => ({
            limit: () => ({
              get: async () => ({ forEach: (cb) => store.filter((d) => d.parentId === val).forEach((d) => cb({ id: d.id, data: () => d })) }),
            }),
          }),
          add: async (d) => {
            const id = "f" + store.length;
            store.push({ id, ...d });
            return { id };
          },
        }),
      }),
    }),
  };
  const bp = { exam: "Railway", section: "Group D", subjects: [{ name: "Maths" }, { name: "Hindi" }] };
  const h = await ensureHierarchy(fakeDb, "packX", bp);
  assert.equal(h.sectionFolderId, "f0");
  assert.equal(store[0].parentId, null);
  assert.equal(store[0].title, "Group D");
  assert.equal(store[1].parentId, "f0");
  assert.equal(store[1].title, "Maths");
  assert.equal(h.subjectFolders["Hindi"], "f2");
});

// ---------- USER RULE 2026-10-07: max 3 retry ----------
test("withRetries: 2 fail ke baad success → result; 3 fail → throw", async () => {
  const { withRetries } = require("../auto_premium_sets");
  const sleeps = [];
  let calls = 0;
  const ok = await withRetries(
    () => {
      calls++;
      if (calls < 3) throw new Error("boom");
      return "done";
    },
    { attempts: 3, sleepMs: 1, _sleep: async (ms) => sleeps.push(ms) }
  );
  assert.equal(ok, "done");
  assert.equal(calls, 3);
  assert.equal(sleeps.length, 2); // last attempt ke baad sleep NAHI

  calls = 0;
  await assert.rejects(
    withRetries(
      () => {
        calls++;
        throw new Error("hamesha fail");
      },
      { attempts: 3, sleepMs: 1, _sleep: async () => {} }
    ),
    /hamesha fail/
  );
  assert.equal(calls, 3); // 3 se zyada NAHI
});

// ---------- v3.2: multi-exam rotation ----------
test("pickBlueprintEntry: 4 din me saare 8 entries cover, slot alag", () => {
  const { pickBlueprintEntry, DEFAULT_BLUEPRINTS } = require("../auto_premium_sets");
  assert.equal(DEFAULT_BLUEPRINTS.length, 16);
  const exams = new Set(DEFAULT_BLUEPRINTS.map((b) => b.exam));
  assert.deepEqual([...exams].sort(), ["Banking", "Railway", "SSC", "Teaching"]);
  const seen = new Set();
  for (let d = 0; d < 8; d++) {
    const day = new Date(2026, 0, 1 + d);
    seen.add(pickBlueprintEntry(DEFAULT_BLUEPRINTS, 0, day).section);
    seen.add(pickBlueprintEntry(DEFAULT_BLUEPRINTS, 1, day).section);
  }
  assert.equal(seen.size, 16);
  // same din+slot deterministic
  const d = new Date(2026, 0, 1);
  assert.deepEqual(pickBlueprintEntry(DEFAULT_BLUEPRINTS, 0, d), pickBlueprintEntry(DEFAULT_BLUEPRINTS, 0, d));
  assert.equal(pickBlueprintEntry([], 0, d), null);
});
