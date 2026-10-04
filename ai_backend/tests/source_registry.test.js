"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { DEFAULT_SOURCES, getEnabledSources, recordSourceCheck } = require("../source_registry");

function fakeDbWith(docs) {
  return {
    collection: () => ({
      where: () => ({
        limit: () => ({
          get: async () => ({
            empty: docs.length === 0,
            docs: docs.map((d) => ({ id: d.name, data: () => d })),
          }),
        }),
      }),
    }),
  };
}

test("registry sources returned when present", async () => {
  const db = fakeDbWith([{ name: "SSC", url: "https://ssc.gov.in/rss.xml", tier: 1, enabled: true }]);
  const sources = await getEnabledSources(db);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].name, "SSC");
});

test("docs without url filtered", async () => {
  const db = fakeDbWith([{ name: "Bad", enabled: true }, { name: "Good", url: "https://upsc.gov.in/feed", enabled: true }]);
  const sources = await getEnabledSources(db);
  assert.deepEqual(sources.map((s) => s.name), ["Good"]);
});

test("empty registry falls back to DEFAULT_SOURCES (7 legacy feeds)", async () => {
  const sources = await getEnabledSources(fakeDbWith([]));
  assert.equal(sources.length, 7);
  assert.equal(sources, DEFAULT_SOURCES);
});

test("db failure falls back, never throws", async () => {
  const badDb = { collection: () => { throw new Error("boom"); } };
  const sources = await getEnabledSources(badDb);
  assert.equal(sources.length, 7);
});

test("recordSourceCheck success + failure patches", async () => {
  const writes = {};
  const db = {
    collection: () => ({
      doc: (id) => ({
        set: async (patch) => { writes[id] = { ...writes[id], ...patch }; },
      }),
    }),
  };
  await recordSourceCheck(db, "FreeJobAlert", { ok: true, itemCount: 9 });
  assert.equal(writes.FreeJobAlert.status, "ok");
  assert.equal(writes.FreeJobAlert.lastItemCount, 9);
  assert.equal(writes.FreeJobAlert.lastError, null);
  await recordSourceCheck(db, "FreeJobAlert", { ok: false, error: "429 too many" });
  assert.equal(writes.FreeJobAlert.status, "error");
  assert.equal(writes.FreeJobAlert.lastError, "429 too many");
});

test("recordSourceCheck without db never throws", async () => {
  await recordSourceCheck(null, "X", { ok: true });
});
