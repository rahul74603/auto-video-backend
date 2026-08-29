"use strict";

/**
 * Phase 1 — GSC Search Analytics collector tests.
 * All Google API access is injected (no live credentials needed).
 * Covers: success, multi-date/page/query, zero rows, API error, permission
 * error, deterministic + idempotent storage, duplicate reruns, URL
 * normalization, collection metadata, raw-metric preservation, no credential
 * persistence, bounded/resumable backfill, date boundaries, kill-switch,
 * probe mode, and batch-write path parity.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const automationGuard = require("../agents/automation_guard");
const collector = require("../agents/seo_intelligence/gsc_search_analytics");
const {
  normalizeGscPageUrl,
  buildGscRowId,
  rowFromApi,
  classifyApiError,
  computeDailyWindow,
  expandWindow,
  collectDay,
  runGscIngestRunner
} = collector;

const DAY = "2026-08-20";
const SITE = "sc-domain:studygyaan.in";
const DIMS = ["date", "page", "query", "country", "device"];

// ─── Mock Firestore ─────────────────────────────────────────────────

function createMockDb({ withBatch = false } = {}) {
  const store = new Map();
  const writes = [];
  const asDoc = (key) => ({ exists: store.has(key), data: () => store.get(key) });
  function col(name) {
    return {
      doc(id) {
        const key = `${name}/${id}`;
        const self = {
          async get() { return asDoc(key); },
          async set(data, opts) {
            writes.push(key);
            if (opts && opts.merge) store.set(key, { ...(store.get(key) || {}), ...data });
            else store.set(key, data);
            return self;
          },
          collection(subName) {
            // Sub-collection rows live under "<name>/<id>/<subName>/<rowId>" keys.
            return col(`${key}/${subName}`);
          }
        };
        return self;
      }
    };
  }
  const db = {
    _store: store,
    _writes: writes,
    collection: col
  };
  if (withBatch) {
    db.batch = () => {
      const pending = [];
      return {
        set(ref, data) { pending.push({ key: `${ref._key}`, data, merge: false }); return this; },
        async commit() {
          for (const op of pending) {
            writes.push(op.key);
            store.set(op.key, op.data);
          }
          pending.length = 0;
        }
      };
    };
    // Give sub-collection doc() refs a stable _key so batch can record them.
    const originalCollection = db.collection;
    // Patch: doc() returns object with _key; simplest is to rebuild col with keys.
  }
  return db;
}

// Build the mock with batch support by threading a key through doc refs.
function createMockDbFull({ withBatch = false } = {}) {
  const store = new Map();
  const writes = [];
  const asDoc = (key) => ({ exists: store.has(key), data: () => store.get(key) });
  function makeDocRef(key) {
    const ref = {
      _key: key,
      id: key.split("/").pop(),
      async get() { return asDoc(key); },
      async set(data, opts) {
        writes.push(key);
        if (opts && opts.merge) store.set(key, { ...(store.get(key) || {}), ...data });
        else store.set(key, data);
        return ref;
      },
      collection(subName) { return { doc: (id) => makeDocRef(`${key}/${subName}/${id}`) }; }
    };
    return ref;
  }
  const db = {
    _store: store,
    _writes: writes,
    collection: (name) => ({ doc: (id) => makeDocRef(`${name}/${id}`) })
  };
  if (withBatch) {
    db.batch = () => {
      const pending = [];
      return {
        set(ref, data) { pending.push({ key: ref._key, data }); return this; },
        async commit() {
          for (const op of pending) {
            writes.push(op.key);
            store.set(op.key, op.data);
          }
          pending.length = 0;
        }
      };
    };
  }
  return db;
}

// ─── Fixtures ───────────────────────────────────────────────────────

function apiRow(overrides = {}) {
  const { date = DAY, page = "https://studygyaan.in/job/ssc-cgl-2026/", query = "ssc cgl 2026", country = "ind", device = "MOBILE", clicks = 12, impressions = 800, ctr = 0.015, position = 8.123456 } = overrides;
  return { keys: [date, page, query, country, device], clicks, impressions, ctr, position };
}

function makeQueryFn(responses, options = {}) {
  const requests = [];
  const fn = async ({ siteUrl, requestBody }) => {
    requests.push({ siteUrl, requestBody });
    if (options.failWith) throw options.failWith;
    const responder = responses;
    if (typeof responder === "function") return responder({ siteUrl, requestBody });
    return { rows: responder || [] };
  };
  fn.requests = requests;
  return fn;
}

const FIELD_WHITELIST = new Set([
  "date", "rawPageUrl", "normalizedPageUrl", "query", "country", "device",
  "clicks", "impressions", "ctr", "position", "source", "collectedAt"
]);

function assertNoCredentials(db) {
  for (const [key, value] of db._store.entries()) {
    const serialized = JSON.stringify(value);
    assert.doesNotMatch(serialized, /private_key|Bearer |client_email|refresh_token|access_token/i, `credential-like data in ${key}: ${serialized.slice(0, 200)}`);
    if (key.includes("/rows/")) {
      for (const field of Object.keys(value)) {
        assert.ok(FIELD_WHITELIST.has(field), `unexpected field "${field}" in row doc ${key}`);
      }
    }
  }
}

// ─── URL normalization ──────────────────────────────────────────────

test("URL normalization: lowercase host, strip fragment + trailing slash; query preserved; raw kept verbatim", () => {
  const result = normalizeGscPageUrl("HTTPS://StudyGyaan.IN/Job/ssc-cgl-2026/#apply");
  assert.equal(result.rawPageUrl, "HTTPS://StudyGyaan.IN/Job/ssc-cgl-2026/#apply");
  assert.equal(result.normalizedPageUrl, "https://studygyaan.in/Job/ssc-cgl-2026");
  // Path case is NOT lowered (paths can be case-sensitive) — different paths stay distinct.
  assert.notEqual(normalizeGscPageUrl("https://studygyaan.in/job/a").normalizedPageUrl, normalizeGscPageUrl("https://studygyaan.in/job/A").normalizedPageUrl);
  // Different query strings are NOT merged.
  assert.notEqual(
    normalizeGscPageUrl("https://studygyaan.in/job/a?x=1").normalizedPageUrl,
    normalizeGscPageUrl("https://studygyaan.in/job/a?x=2").normalizedPageUrl
  );
  // Equivalent URLs collapse.
  assert.equal(
    normalizeGscPageUrl("https://www.example.com:443/a///").normalizedPageUrl,
    normalizeGscPageUrl("https://www.example.com/a").normalizedPageUrl
  );
});

test("buildGscRowId is deterministic and distinguishes page/query/country/device", () => {
  const basis = { rawPageUrl: "https://studygyaan.in/job/a", query: "q", country: "ind", device: "MOBILE" };
  assert.equal(buildGscRowId(basis), buildGscRowId({ ...basis }));
  assert.notEqual(buildGscRowId(basis), buildGscRowId({ ...basis, query: "q2" }));
  assert.notEqual(buildGscRowId(basis), buildGscRowId({ ...basis, device: "DESKTOP" }));
});

test("rowFromApi maps keys by dimension order and preserves raw numbers exactly", () => {
  const row = rowFromApi({ keys: [DAY, "https://studygyaan.in/a", "ssc", "ind", "MOBILE"], clicks: 3, impressions: 971, ctr: 0.0456789, position: 12.345678 }, DIMS);
  assert.equal(row.date, DAY);
  assert.equal(row.page, "https://studygyaan.in/a");
  assert.equal(row.query, "ssc");
  assert.equal(row.country, "ind");
  assert.equal(row.device, "MOBILE");
  assert.equal(row.ctr, 0.0456789);
  assert.equal(row.position, 12.345678);
  assert.equal(row.clicks, 3);
  assert.equal(row.impressions, 971);
});

// ─── Single-day collection ──────────────────────────────────────────

test("successful collection stores rows with EXACT raw metrics + metadata; multiple pages and queries", async () => {
  const db = createMockDbFull();
  const now = new Date("2026-08-29T03:00:00.000Z");
  const queryFn = makeQueryFn([
    apiRow({ page: "https://studygyaan.in/job/ssc-cgl-2026/", query: "ssc cgl 2026", clicks: 12, impressions: 800, ctr: 0.015, position: 8.123456 }),
    apiRow({ page: "https://studygyaan.in/job/ssc-cgl-2026/", query: "ssc cgl apply", clicks: 5, impressions: 300, ctr: 0.016666666666666666, position: 11.5 }),
    apiRow({ page: "https://studygyaan.in/blog/prep-tips", query: "ssc cgl preparation", clicks: 2, impressions: 50, ctr: 0.04, position: 22.75 })
  ]);

  const result = await collectDay({ db, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn, now });

  assert.equal(result.status, "success");
  assert.equal(result.rowCount, 3);
  assert.equal(result.apiCalls, 1);
  assert.equal(result.truncated, false);

  const dayDoc = db._store.get(`gsc_search_analytics_daily/${DAY}`);
  assert.equal(dayDoc.status, "success");
  assert.equal(dayDoc.rowCount, 3);
  assert.equal(dayDoc.siteUrl, SITE);
  assert.deepEqual(dayDoc.dimensions, DIMS);
  assert.equal(dayDoc.dataState, "final");
  assert.equal(dayDoc.source, "google-search-console");
  assert.equal(dayDoc.firstCollectedAt, now.toISOString());
  assert.equal(dayDoc.runCount, 1);
  assert.equal(dayDoc.lastRun.requestedWindow.startDate, DAY);
  assert.equal(dayDoc.lastRun.requestedWindow.endDate, DAY);
  assert.equal(dayDoc.lastRun.apiCalls, 1);
  assert.equal(dayDoc.lastRun.rowsFetched, 3);
  assert.ok(dayDoc.lastRun.durationMs >= 0);
  // Derived aggregates over raw rows (convenience, clearly labeled).
  assert.equal(dayDoc.aggregates.clicks, 19);
  assert.equal(dayDoc.aggregates.impressions, 1150);
  assert.equal(dayDoc.aggregates.pages, 2);
  assert.equal(dayDoc.aggregates.queries, 3);
  assert.ok(Math.abs(dayDoc.aggregates.positionImpressionSum - (8.123456 * 800 + 11.5 * 300 + 22.75 * 50)) < 1e-6);

  const rows = [...db._store.entries()].filter(([key]) => key.includes("/rows/"));
  assert.equal(rows.length, 3);
  for (const [, value] of rows) {
    assert.equal(value.source, "google-search-console");
    assert.equal(value.date, DAY);
    assert.ok(value.rawPageUrl.startsWith("https://studygyaan.in/"));
    assert.equal(value.normalizedPageUrl, value.rawPageUrl.replace(/\/$/, ""));
    // Exact raw values preserved — no rounding, no rescaling.
    assert.ok([0.015, 0.016666666666666666, 0.04].includes(value.ctr));
    assert.ok([8.123456, 11.5, 22.75].includes(value.position));
  }
  assertNoCredentials(db);
});

test("zero-row response is recorded as valid zero-rows data, not an error", async () => {
  const db = createMockDbFull();
  const queryFn = makeQueryFn([]);

  const result = await collectDay({ db, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn, now: new Date() });

  assert.equal(result.status, "zero-rows");
  assert.equal(result.rowCount, 0);
  const dayDoc = db._store.get(`gsc_search_analytics_daily/${DAY}`);
  assert.equal(dayDoc.status, "zero-rows");
  assert.equal(dayDoc.rowCount, 0);
  assert.equal(dayDoc.aggregates, null);
  assert.equal(dayDoc.lastRun.status, "zero-rows");
  assert.equal(dayDoc.lastRun.error, null);
  assert.equal([...db._store.entries()].filter(([key]) => key.includes("/rows/")).length, 0);
});

test("API error (500) is distinguishable: status=error, errorType=api, no rows written", async () => {
  const db = createMockDbFull();
  const queryFn = makeQueryFn([], { failWith: Object.assign(new Error("Internal backend error"), { code: 500 }) });

  const result = await collectDay({ db, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn, now: new Date() });

  assert.equal(result.status, "error");
  assert.equal(result.errorType, "api");
  assert.match(result.error, /Internal backend error/);
  const dayDoc = db._store.get(`gsc_search_analytics_daily/${DAY}`);
  assert.equal(dayDoc.status, "error");
  assert.equal(dayDoc.lastRun.status, "error");
  assert.equal(dayDoc.lastRun.errorType, "api");
  assert.equal(db._writes.filter((key) => key.includes("/rows/")).length, 0);
});

test("permission error (403) is classified as errorType=permission", async () => {
  const db = createMockDbFull();
  const queryFn = makeQueryFn([], { failWith: Object.assign(new Error("Request had insufficient authentication scopes."), { code: 403 }) });

  const result = await collectDay({ db, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn, now: new Date() });

  assert.equal(result.status, "error");
  assert.equal(result.errorType, "permission");
  assert.equal(db._store.get(`gsc_search_analytics_daily/${DAY}`).lastRun.errorType, "permission");
});

test("error during a refresh NEVER wipes previously collected rows for that date", async () => {
  const db = createMockDbFull();
  const now = new Date();
  await collectDay({ db, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn: makeQueryFn([apiRow()]), now });
  const failing = makeQueryFn([], { failWith: Object.assign(new Error("boom"), { code: 500 }) });

  const result = await collectDay({ db, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn: failing, now });

  assert.equal(result.status, "error");
  const dayDoc = db._store.get(`gsc_search_analytics_daily/${DAY}`);
  // Data availability status stays success; the failed attempt is in lastRun.
  assert.equal(dayDoc.status, "success");
  assert.equal(dayDoc.rowCount, 1);
  assert.equal(dayDoc.runCount, 2);
  assert.equal(dayDoc.lastRun.status, "error");
  assert.equal([...db._store.entries()].filter(([key]) => key.includes("/rows/")).length, 1);
});

test("duplicate rerun is idempotent: same deterministic doc ids, same counts, no duplicates", async () => {
  const db = createMockDbFull();
  const rows = [
    apiRow({ page: "https://studygyaan.in/job/a/", query: "q1" }),
    apiRow({ page: "https://studygyaan.in/job/a/", query: "q2", device: "DESKTOP" }),
    apiRow({ page: "https://studygyaan.in/job/b", query: "q1" })
  ];

  const first = await collectDay({ db, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn: makeQueryFn(rows), now: new Date() });
  const firstRowKeys = db._writes.filter((key) => key.includes("/rows/")).sort();
  const dayDocFirst = db._store.get(`gsc_search_analytics_daily/${DAY}`);

  const second = await collectDay({ db, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn: makeQueryFn(rows), now: new Date() });
  const secondRowKeys = db._writes.filter((key) => key.includes("/rows/")).slice(firstRowKeys.length).sort();
  const dayDocSecond = db._store.get(`gsc_search_analytics_daily/${DAY}`);

  assert.equal(first.rowCount, 3);
  assert.equal(second.rowCount, 3);
  assert.deepEqual(secondRowKeys, firstRowKeys); // identical deterministic ids
  assert.equal([...db._store.entries()].filter(([key]) => key.includes("/rows/")).length, 3); // no duplicates
  assert.equal(dayDocSecond.rowCount, 3);
  assert.equal(dayDocSecond.runCount, 2);
  assert.equal(dayDocSecond.status, dayDocFirst.status);
  assert.equal(dayDocSecond.aggregates.clicks, dayDocFirst.aggregates.clicks);
});

test("shrinking rerun keeps superseded rows for audit and records the count", async () => {
  const db = createMockDbFull();
  await collectDay({ db, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn: makeQueryFn([apiRow(), apiRow({ query: "q2" })]), now: new Date() });
  const result = await collectDay({ db, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn: makeQueryFn([apiRow()]), now: new Date() });

  const dayDoc = db._store.get(`gsc_search_analytics_daily/${DAY}`);
  assert.equal(result.rowCount, 1);
  assert.equal(dayDoc.rowCount, 1);
  assert.equal(dayDoc.supersededRows, 1);
  // Old row kept for audit — never deleted.
  assert.equal([...db._store.entries()].filter(([key]) => key.includes("/rows/")).length, 2);
});

test("batch-write path produces identical storage to the sequential path", async () => {
  const rows = [];
  for (let index = 0; index < 500; index += 1) {
    rows.push(apiRow({ page: `https://studygyaan.in/job/page-${index}`, query: `q-${index}` }));
  }
  const sequentialDb = createMockDbFull();
  const batchDb = createMockDbFull({ withBatch: true });
  const now = new Date();

  await collectDay({ db: sequentialDb, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn: makeQueryFn(rows), now });
  await collectDay({ db: batchDb, date: DAY, siteUrl: SITE, dimensions: DIMS, dataState: "final", queryFn: makeQueryFn(rows), now });

  assert.equal(batchDb._store.size, sequentialDb._store.size);
  for (const [key, value] of sequentialDb._store.entries()) {
    const expected = JSON.parse(JSON.stringify(value));
    const actual = JSON.parse(JSON.stringify(batchDb._store.get(key)));
    // durationMs legitimately varies run-to-run; everything else must match.
    if (expected.lastRun) delete expected.lastRun.durationMs;
    if (actual.lastRun) delete actual.lastRun.durationMs;
    assert.deepEqual(actual, expected, `mismatch at ${key}`);
  }
  assert.equal(batchDb._store.get(`gsc_search_analytics_daily/${DAY}`).rowCount, 500);
});

// ─── Date windows ───────────────────────────────────────────────────

test("daily window is UTC-based with an explicit finality offset", () => {
  const now = new Date("2026-08-29T18:45:00.000Z"); // late in the UTC day
  const window = computeDailyWindow(now, 3, 2);
  assert.deepEqual(window, { startDate: "2026-08-25", endDate: "2026-08-27" });
  // Midnight boundary
  const midnight = new Date("2026-01-01T00:00:00.000Z");
  assert.deepEqual(computeDailyWindow(midnight, 2, 2), { startDate: "2025-12-29", endDate: "2025-12-30" });
});

test("expandWindow validates dates, orders chronologically, and caps per-run days", () => {
  const expanded = expandWindow("2026-08-01", "2026-08-20", 7);
  assert.equal(expanded.dates.length, 7);
  assert.equal(expanded.dates[0], "2026-08-01");
  assert.equal(expanded.dates[6], "2026-08-07");
  assert.equal(expanded.daysRemaining, 13);
  const full = expandWindow("2026-08-01", "2026-08-03", 31);
  assert.deepEqual(full, { dates: ["2026-08-01", "2026-08-02", "2026-08-03"], daysRemaining: 0 });
  assert.throws(() => expandWindow("2026-08-05", "2026-08-01", 7), /must not be after/);
  assert.throws(() => expandWindow("not-a-date", "2026-08-01", 7), /Invalid startDate/);
  assert.throws(() => expandWindow("2026-13-01", "2026-08-01", 7), /Invalid startDate/);
});

// ─── Runner ─────────────────────────────────────────────────────────

test("runner: daily mode collects multiple dates with per-day requests and records window metadata", async () => {
  automationGuard.invalidateCache();
  const db = createMockDbFull();
  const queryFn = makeQueryFn(({ requestBody }) => {
    assert.equal(requestBody.startDate, requestBody.endDate, "one request per date");
    assert.equal(requestBody.dataState, "final");
    assert.deepEqual(requestBody.dimensions, DIMS);
    assert.equal(requestBody.rowLimit, 25000);
    return { rows: requestBody.startDate === "2026-08-25" ? [apiRow({ date: "2026-08-25" })] : [] };
  });

  const summary = await runGscIngestRunner({
    db,
    args: { mode: "daily", lookbackDays: 3, endOffsetDays: 2 },
    deps: { querySearchAnalytics: queryFn, now: new Date("2026-08-29T05:00:00.000Z") }
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.mode, "daily");
  assert.deepEqual(summary.window, { startDate: "2026-08-25", endDate: "2026-08-27" });
  assert.equal(summary.days.length, 3);
  assert.equal(queryFn.requests.length, 3);
  assert.deepEqual(summary.days.map((day) => day.date), ["2026-08-25", "2026-08-26", "2026-08-27"]);
  assert.equal(summary.days[0].status, "success");
  assert.equal(summary.days[1].status, "zero-rows");
  assert.equal(summary.rowsCollected, 1);
  assert.equal(summary.lastStatus, "success");

  // Runner status persisted to the existing GSC settings doc (merge semantics).
  const status = db._store.get("system_settings/seo_search_console");
  assert.equal(status.searchAnalyticsRunner.lastStatus, "success");
  assert.deepEqual(status.searchAnalyticsRunner.window, { startDate: "2026-08-25", endDate: "2026-08-27" });
  assert.equal(status.searchAnalyticsRunner.rowsCollected, 1);
  assert.equal(status.searchAnalyticsRunner.apiCalls, 3);
  assertNoCredentials(db);
});

test("runner: backfill is bounded, resumable, and skips already-collected dates", async () => {
  automationGuard.invalidateCache();
  const db = createMockDbFull();
  // First backfill run: 5-day window capped at 3 days per run.
  let callCount = 0;
  const queryFn = makeQueryFn(() => {
    callCount += 1;
    return { rows: [apiRow()] };
  });

  const first = await runGscIngestRunner({
    db,
    args: { mode: "backfill", startDate: "2026-08-01", endDate: "2026-08-05", maxDaysPerRun: 3 },
    deps: { querySearchAnalytics: queryFn, now: new Date("2026-08-29T05:00:00.000Z") }
  });

  assert.equal(first.days.length, 5); // 3 collected + 2 budget-skipped, all visible
  assert.equal(first.days.filter((day) => day.status === "success").length, 3);
  assert.equal(first.days.filter((day) => day.status === "skipped-run-budget").length, 2);
  assert.equal(first.daysRemaining, 2);
  assert.match(first.capNote, /capped at 3 new day/);
  assert.equal(callCount, 3);
  assert.equal(first.ok, true);
  assert.equal(first.lastStatus, "partial"); // budget-skipped days = partial, resumable

  // Second run: 3 dates already collected → skipped without API calls; final 2 collected.
  const second = await runGscIngestRunner({
    db,
    args: { mode: "backfill", startDate: "2026-08-01", endDate: "2026-08-05", maxDaysPerRun: 3 },
    deps: { querySearchAnalytics: queryFn, now: new Date("2026-08-29T05:00:00.000Z") }
  });

  assert.equal(callCount, 5); // only 2 new API calls
  assert.equal(second.days.filter((day) => day.status === "skipped-already-collected").length, 3);
  assert.equal(second.daysRemaining, 0);
  assert.equal(second.rowsCollected, 2);
  assert.equal(db._store.get("gsc_search_analytics_daily/2026-08-05").status, "success");
});

test("runner: backfill continues after an error day; failed date retried on rerun, others skipped", async () => {
  automationGuard.invalidateCache();
  const db = createMockDbFull();
  const attemptsByDate = new Map();
  const queryFn = makeQueryFn(({ requestBody }) => {
    const date = requestBody.startDate;
    const attempts = (attemptsByDate.get(date) || 0) + 1;
    attemptsByDate.set(date, attempts);
    if (date === "2026-08-02" && attempts === 1) {
      throw Object.assign(new Error("backend error"), { code: 500 });
    }
    return { rows: [apiRow({ date })] };
  });

  const first = await runGscIngestRunner({
    db,
    args: { mode: "backfill", startDate: "2026-08-01", endDate: "2026-08-03", maxDaysPerRun: 7 },
    deps: { querySearchAnalytics: queryFn, now: new Date("2026-08-29T05:00:00.000Z") }
  });

  assert.equal(first.ok, false);
  assert.equal(first.lastStatus, "partial");
  assert.equal(first.days.find((day) => day.date === "2026-08-02").status, "error");
  assert.equal(first.days.find((day) => day.date === "2026-08-01").status, "success");
  assert.equal(first.days.find((day) => day.date === "2026-08-03").status, "success");
  assert.equal(db._store.get("gsc_search_analytics_daily/2026-08-02").status, "error");

  const second = await runGscIngestRunner({
    db,
    args: { mode: "backfill", startDate: "2026-08-01", endDate: "2026-08-03", maxDaysPerRun: 7 },
    deps: { querySearchAnalytics: queryFn, now: new Date("2026-08-29T05:00:00.000Z") }
  });

  // 08-01 and 08-03 skipped (collected); 08-02 was an error → retried and succeeds now.
  assert.equal(second.days.filter((day) => day.status === "skipped-already-collected").length, 2);
  assert.equal(second.days.find((day) => day.date === "2026-08-02").status, "success");
  assert.equal(second.ok, true);
});

test("runner: kill-switch (features.gsc_ingest=false) skips collection entirely", async () => {
  automationGuard.invalidateCache();
  automationGuard.invalidateCache();
  const db = createMockDbFull();
  await db.collection("system_settings").doc("automation").set({
    globalEnabled: true,
    emergencyPause: false,
    features: { gsc_ingest: false }
  });
  const queryFn = makeQueryFn([apiRow()]);

  const summary = await runGscIngestRunner({
    db,
    args: { mode: "daily" },
    deps: { querySearchAnalytics: queryFn, now: new Date("2026-08-29T05:00:00.000Z") }
  });

  assert.equal(summary.skipped, true);
  assert.match(summary.reason, /gsc_ingest|OFF|paused/i);
  assert.equal(queryFn.requests.length, 0);
  assert.equal(db._writes.filter((key) => key.startsWith("gsc_search_analytics_daily")).length, 0);
  assert.equal(db._store.get("system_settings/seo_search_console").searchAnalyticsRunner.lastStatus, "skipped");
});

test("runner: dry-run performs API requests but writes nothing", async () => {
  automationGuard.invalidateCache();
  const db = createMockDbFull();
  const queryFn = makeQueryFn([apiRow()]);

  const summary = await runGscIngestRunner({
    db,
    args: { mode: "daily", dryRun: true },
    deps: { querySearchAnalytics: queryFn, now: new Date("2026-08-29T05:00:00.000Z") }
  });

  assert.equal(summary.dryRun, true);
  assert.equal(queryFn.requests.length, 3);
  assert.equal(db._writes.length, 0);
});

test("runner: API budget stops collection with an explicit partial status", async () => {
  automationGuard.invalidateCache();
  const db = createMockDbFull();
  const queryFn = makeQueryFn([apiRow()]);

  const summary = await runGscIngestRunner({
    db,
    args: { mode: "daily", maxApiCalls: 1 },
    deps: { querySearchAnalytics: queryFn, now: new Date("2026-08-29T05:00:00.000Z") }
  });

  assert.equal(summary.lastStatus, "partial");
  assert.equal(summary.days.filter((day) => day.status === "skipped-api-budget").length, 2);
  assert.equal(queryFn.requests.length, 1);
});

test("runner: probe mode verifies access with a single tiny query and writes NOTHING", async () => {
  automationGuard.invalidateCache();
  const db = createMockDbFull();
  const queryFn = makeQueryFn(({ requestBody }) => {
    assert.deepEqual(requestBody.dimensions, ["date"]);
    assert.equal(requestBody.rowLimit, 1);
    return { rows: [{ keys: ["2026-08-19"], clicks: 1, impressions: 5, ctr: 0.2, position: 3 }] };
  });

  const probe = await runGscIngestRunner({
    db,
    args: { mode: "probe" },
    deps: { querySearchAnalytics: queryFn, now: new Date("2026-08-29T05:00:00.000Z") }
  });

  assert.equal(probe.ok, true);
  assert.equal(probe.accessVerified, true);
  assert.equal(probe.probeDate, "2026-08-19");
  assert.equal(queryFn.requests.length, 1);
  assert.equal(db._writes.length, 0);
});

test("runner: probe failure reports the permission error without writes", async () => {
  automationGuard.invalidateCache();
  const db = createMockDbFull();
  const queryFn = makeQueryFn([], { failWith: Object.assign(new Error("User does not have access"), { code: 403 }) });

  const probe = await runGscIngestRunner({
    db,
    args: { mode: "probe" },
    deps: { querySearchAnalytics: queryFn, now: new Date("2026-08-29T05:00:00.000Z") }
  });

  assert.equal(probe.ok, false);
  assert.equal(probe.errorType, "permission");
  assert.equal(db._writes.length, 0);
});

test("runner: invalid backfill window fails fast without API calls", async () => {
  automationGuard.invalidateCache();
  const db = createMockDbFull();
  const queryFn = makeQueryFn([apiRow()]);

  await assert.rejects(
    () => runGscIngestRunner({
      db,
      args: { mode: "backfill", startDate: "2026-08-10", endDate: "2026-08-01" },
      deps: { querySearchAnalytics: queryFn }
    }),
    /must not be after/
  );
  assert.equal(queryFn.requests.length, 0);
  assert.equal(db._writes.length, 0);
});

test("runner: no writes outside gsc_search_analytics_daily + system_settings (public content untouched)", async () => {
  automationGuard.invalidateCache();
  const db = createMockDbFull();
  const queryFn = makeQueryFn([apiRow()]);
  await runGscIngestRunner({
    db,
    args: { mode: "daily" },
    deps: { querySearchAnalytics: queryFn, now: new Date("2026-08-29T05:00:00.000Z") }
  });
  for (const key of db._writes) {
    assert.ok(
      key.startsWith("gsc_search_analytics_daily/") || key === "system_settings/seo_search_console",
      `unexpected write target: ${key}`
    );
  }
});

// ─── Error classification ───────────────────────────────────────────

test("classifyApiError separates permission / rate-limit / api errors and scrubs tokens", () => {
  assert.equal(classifyApiError(Object.assign(new Error("no access"), { code: 403 })).errorType, "permission");
  assert.equal(classifyApiError(Object.assign(new Error("unauthorized"), { code: 401 })).errorType, "permission");
  assert.equal(classifyApiError(Object.assign(new Error("quota"), { code: 429 })).errorType, "rate-limit");
  assert.equal(classifyApiError(Object.assign(new Error("boom"), { code: 500 })).errorType, "api");
  assert.equal(classifyApiError(new Error("network down")).errorType, "api");
  const scrubbed = classifyApiError(Object.assign(new Error("Bearer ya29.a0AfH6SMBearer-token xyz failed"), { code: 500 }));
  assert.doesNotMatch(scrubbed.message, /ya29\./);
  assert.match(scrubbed.message, /redacted/);
});
