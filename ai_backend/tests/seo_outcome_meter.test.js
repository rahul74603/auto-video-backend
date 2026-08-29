"use strict";

/**
 * Phase 3 — SEO Outcome Meter tests (measurement ONLY).
 *
 * Behavioral tests with INJECTED GSC fixtures (never real Firestore, never
 * synthetic production data): windows, coverage honesty (missing ≠ zero),
 * documented metric semantics, exact page join, collision handling,
 * lifecycle carry-over, idempotency/recalculation, and runner safety
 * (writes only seo_change_outcomes + system_settings — never public
 * content, proposals, the Phase 2 event ledger, or GSC rows).
 *
 * Language contract under test: outcomes are OBSERVED before/after
 * differences (correlation, never causation).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const automationGuard = require("../agents/automation_guard");
const {
  DEFAULT_CONFIG,
  computeWindows,
  computeOutcome,
  measurementHash,
  measureEvent,
  runOutcomeMeter,
  dateRange
} = require("../agents/seo_intelligence/outcome_meter");

// Fixed clock: 2026-08-29 06:00 UTC → last finalized GSC date = 2026-08-27
// (DEFAULT finalityOffsetDays = 2, same semantics as Phase 1).
const NOW = new Date("2026-08-29T06:00:00.000Z");
const LAST_COMPLETED = "2026-08-27";
const PAGE = "https://studygyaan.in/job/ssc-cgl-2026"; // normalized (trailing slash stripped, query strings preserved)
const CHANGE_DATE = "2026-08-15";
const EVENT_AT = "2026-08-15T10:30:00.000Z";

// ─── Fixture helpers ─────────────────────────────────────────────────

function dayDoc(date, status = "success") {
  return { date, status, rowCount: 0, collectedAt: "2026-08-29T01:00:00.000Z" };
}

/** All GSC days from pre-window start through post-window end (change day has no day doc need). */
function baseDayDocs() {
  return dateRange("2026-08-08", "2026-08-22")
    .filter((date) => date !== CHANGE_DATE)
    .map((date) => dayDoc(date));
}

function gscRow({ date, page = PAGE, query = "ssc cgl 2026", country = "ind", device = "MOBILE", clicks = 10, impressions = 500, position = 8 }) {
  return {
    date,
    normalizedPageUrl: page,
    page: page,
    query,
    country,
    device,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position
  };
}

/**
 * Baseline GSC rows for the page:
 *   PRE  (08-08..08-14): q1 (10 clicks/500 imp/pos 8 MOBILE) + q2 (5/300/12 DESKTOP) per day
 *   POST (08-16..08-22): q1 (20/600/6) + q2 (5/300/12) per day
 * plus decoys that MUST be excluded: change-day rows, out-of-window rows,
 * a different page, the same page with a query string, and a future row.
 */
function baseRows() {
  const rows = [];
  for (const date of dateRange("2026-08-08", "2026-08-22")) {
    const pre = date <= "2026-08-14";
    if (date !== CHANGE_DATE) {
      rows.push(gscRow({ date, query: "ssc cgl 2026", device: "MOBILE", clicks: pre ? 10 : 20, impressions: pre ? 500 : 600, position: pre ? 8 : 6 }));
      rows.push(gscRow({ date, query: "ssc cgl apply online", device: "DESKTOP", clicks: 5, impressions: 300, position: 12 }));
    } else {
      rows.push(gscRow({ date, query: "CHANGE DAY ROW", clicks: 9999, impressions: 999999, position: 1 }));
    }
  }
  // Out-of-window decoys (before pre start / after post end)
  rows.push(gscRow({ date: "2026-08-07", clicks: 888, impressions: 8888, position: 1 }));
  rows.push(gscRow({ date: "2026-08-23", clicks: 777, impressions: 7777, position: 1 }));
  // Different page — must never join
  rows.push(gscRow({ date: "2026-08-10", page: "https://studygyaan.in/job/ssc-chsl-2026", clicks: 555, impressions: 5555, position: 1 }));
  // Same page, different query string — Phase 1 normalization preserves query strings → different page, must NOT merge
  rows.push(gscRow({ date: "2026-08-10", page: `${PAGE}?utm=whatsapp`, clicks: 444, impressions: 4444, position: 1 }));
  // Future row beyond the last finalized GSC date
  rows.push(gscRow({ date: "2026-08-28", clicks: 666, impressions: 6666, position: 1 }));
  return rows;
}

function baseEvent(overrides = {}) {
  return {
    eventId: "ev-main",
    kind: "applied",
    at: EVENT_AT,
    gscJoinKey: PAGE,
    pageUrl: "https://studygyaan.in/job/ssc-cgl-2026/",
    contentId: "job-1",
    collection: "jobs",
    contentType: "JOB",
    field: "metaDescription",
    fieldGroup: "meta",
    source: "apply-engine",
    lifecycle: { state: "ACTIVE", context: "lastDate 2026-12-31", asOf: EVENT_AT },
    eligibleForAutomaticOptimization: true,
    proposalId: "p-1",
    oldValue: { kind: "inline", value: "" },
    newValue: { kind: "inline", value: "SSC CGL 2026 apply online — last date 31/12/2026." },
    ...overrides
  };
}

/** Phase 2-style mock Firestore (doc get/set/update only). */
function makeDb(initial = {}) {
  const docs = { ...initial };
  const writes = [];
  return {
    _docs: docs,
    _writes: writes,
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            id,
            async get() {
              if (docs[key] !== undefined) return { exists: true, data: () => docs[key] };
              return { exists: false, data: () => ({}) };
            },
            async set(data) {
              writes.push(key);
              docs[key] = { ...(docs[key] || {}), ...data };
              return this;
            },
            async update(data) {
              writes.push(key);
              docs[key] = { ...(docs[key] || {}), ...data };
              return this;
            }
          };
        }
      };
    }
  };
}

/**
 * Injected loaders replacing the real Firestore queries. loadPageRows
 * deliberately returns a SUPERSET (all rows for all pages) so the engine's
 * exact-match join is exercised behaviorally (same defense-in-depth as the
 * real collectionGroup('rows').where('normalizedPageUrl','==',key) query).
 * The arrays are captured by reference so tests can simulate late-arriving
 * GSC data between runs.
 */
function makeLoaders(db, { dayDocs = [], rows = [], events = [] } = {}) {
  return {
    async loadDayDocs(start, end) {
      return dayDocs.filter((doc) => doc.date >= start && doc.date <= end);
    },
    async loadPageRows() {
      return rows.slice();
    },
    async loadPageEvents(gscJoinKey) {
      return events.filter((event) => event.gscJoinKey === gscJoinKey);
    },
    async loadRecentEvents(max) {
      return events
        .slice()
        .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
        .slice(0, max);
    },
    async loadEvent(eventId) {
      return db._docs[`seo_change_events/${eventId}`] || null;
    },
    async loadOutcome(outcomeId) {
      return db._docs[`seo_change_outcomes/${outcomeId}`] || null;
    }
  };
}

/** The outcome meter may ONLY write outcomes + its runner status — never content, proposals, events, or GSC data. */
function assertOnlyInternalWrites(db) {
  for (const key of db._writes) {
    assert.ok(
      key.startsWith("seo_change_outcomes/") || key === "system_settings/seo_intelligence",
      `outcome meter wrote outside its allowed collections: ${key}`
    );
  }
}

function assertAllFinite(value, path = "outcome") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `non-finite number at ${path}: ${value}`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => assertAllFinite(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) assertAllFinite(item, `${path}.${key}`);
  }
}

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} ≈ ${expected}`);
}

/** Measure one event end-to-end with injected fixtures. */
async function measureWithFixtures(db, { event = baseEvent(), dayDocs = baseDayDocs(), rows = baseRows(), events = [event], now = NOW, config } = {}) {
  return measureEvent(db, event, {
    deps: makeLoaders(db, { dayDocs, rows, events }),
    now,
    config: config || DEFAULT_CONFIG
  });
}

// ─── Baseline expectations (used across tests) ───────────────────────
// pre:  clicks 105, impressions 5600, ctr 105/5600 = 0.01875, weighted pos (8·500+12·300)·7/5600 = 9.5
// post: clicks 175, impressions 6300, ctr 175/6300, weighted pos (6·600+12·300)·7/6300 = 8.0

// ─── Window computation ──────────────────────────────────────────────

test("computeWindows: exact 7-day pre window immediately before the change, change day excluded", () => {
  const windows = computeWindows(EVENT_AT, NOW);
  assert.equal(windows.pre.start, "2026-08-08");
  assert.equal(windows.pre.end, "2026-08-14");
  assert.equal(windows.changeDate, CHANGE_DATE);
  assert.equal(dateRange(windows.pre.start, windows.pre.end).length, 7);
  assert.ok(!dateRange(windows.pre.start, windows.pre.end).includes(CHANGE_DATE));
});

test("computeWindows: exact 7-day post window after the change, change day excluded", () => {
  const windows = computeWindows(EVENT_AT, NOW);
  assert.equal(windows.post.start, "2026-08-16");
  assert.equal(windows.post.end, "2026-08-22");
  assert.equal(dateRange(windows.post.start, windows.post.end).length, 7);
  assert.ok(!dateRange(windows.post.start, windows.post.end).includes(CHANGE_DATE));
  assert.equal(windows.postFullyElapsed, true); // 08-22 ≤ last finalized 08-27
});

test("change-day GSC rows are excluded from both windows", async () => {
  const db = makeDb();
  const { outcome } = await measureWithFixtures(db);
  // Change-day decoy row: 9999 clicks / 999999 impressions — must not leak.
  assert.equal(outcome.preMetrics.clicks, 105);
  assert.equal(outcome.postMetrics.clicks, 175);
  assert.equal(outcome.preMetrics.impressions, 5600);
  assert.equal(outcome.postMetrics.impressions, 6300);
});

test("future / not-yet-final GSC days are excluded and flagged, not measured", async () => {
  const db = makeDb();
  // Change on 08-26 → post window 08-27..09-02; only 08-27 is finalized.
  const event = baseEvent({ eventId: "ev-late", at: "2026-08-26T09:00:00.000Z" });
  const dayDocs = dateRange("2026-08-19", "2026-08-27").map((date) => dayDoc(date));
  const rows = [
    ...dateRange("2026-08-19", "2026-08-25").map((date) => gscRow({ date, clicks: 10, impressions: 500, position: 8 })),
    gscRow({ date: "2026-08-27", clicks: 20, impressions: 600, position: 6 }),
    // Future decoy rows (08-28..09-02 raw rows that must never be counted):
    ...dateRange("2026-08-28", "2026-09-02").map((date) => gscRow({ date, clicks: 500, impressions: 5000, position: 1 }))
  ];
  const { outcome } = await measureWithFixtures(db, { event, dayDocs, rows });
  assert.equal(outcome.evidenceState, "incomplete_data");
  assert.deepEqual(outcome.dataCoverage.post.availableDays, ["2026-08-27"]);
  assert.deepEqual(outcome.dataCoverage.post.notYetAvailableDays, dateRange("2026-08-28", "2026-09-02"));
  assert.equal(outcome.dataCoverage.availableThrough, "2026-08-27");
  assert.equal(outcome.dataCoverage.expectedThrough, "2026-09-02");
  // Only the 08-27 row is measured — future rows excluded — and with just one
  // available post day the deltas are withheld entirely (no fabricated drop).
  assert.equal(outcome.postMetrics.impressions, 600);
  assert.equal(outcome.postMetrics.queryCount, 1);
  assert.equal(outcome.deltas.impressionsPct, null);
  assert.ok(outcome.deltas.note.includes("Deltas withheld"));
});

// ─── Coverage honesty (missing ≠ zero) ───────────────────────────────

test("missing GSC days are explicit coverage gaps and are NEVER treated as zero performance", async () => {
  const db = makeDb();
  // Five pre days were never collected (no day docs).
  const missing = dateRange("2026-08-10", "2026-08-14");
  const dayDocs = baseDayDocs().filter((doc) => !missing.includes(doc.date));
  const { outcome } = await measureWithFixtures(db, { dayDocs });
  assert.equal(outcome.evidenceState, "insufficient_data");
  assert.equal(outcome.dataCoverage.pre.availableCount, 2);
  assert.equal(outcome.dataCoverage.pre.expectedCount, 7);
  assert.deepEqual(outcome.dataCoverage.pre.missingDays, missing);
  // Metrics come ONLY from the two available days (2 × 15 clicks) — the five
  // missing days contribute nothing and are reported as missing, not zero.
  assert.equal(outcome.preMetrics.clicks, 30);
  assert.equal(outcome.preMetrics.impressions, 1600);
  // Deltas are withheld — a difference from mostly-missing days would be fabricated.
  assert.equal(outcome.deltas.clicks, null);
  assert.ok(outcome.deltas.note.includes("Deltas withheld"));
  assert.ok(outcome.evidenceStateReason.includes("missing"));
  assert.ok(outcome.evidenceStateReason.includes("NOT treated as zero"));
});

test("zero-rows GSC days are REAL zeros (available), distinct from missing days", async () => {
  const db = makeDb();
  // Post window collected successfully but returned zero rows → the page
  // genuinely had no impressions. This is a real zero, not missing data.
  const dayDocs = baseDayDocs().map((doc) => (doc.date >= "2026-08-16" ? dayDoc(doc.date, "zero-rows") : doc));
  const rows = baseRows().filter((row) => row.date <= "2026-08-14");
  const { outcome } = await measureWithFixtures(db, { dayDocs, rows });
  assert.equal(outcome.dataCoverage.post.availableCount, 7);
  assert.equal(outcome.dataCoverage.post.zeroRowDays.length, 7);
  assert.equal(outcome.dataCoverage.post.missingDays.length, 0);
  assert.equal(outcome.postMetrics.impressions, 0);
  assert.equal(outcome.postMetrics.rowCount, 0);
  assert.equal(outcome.postMetrics.ctr, null); // zero denominator → no fake CTR
  // Real-zero drop from 5600 → 0 impressions is measurable (pre > 0).
  assert.equal(outcome.deltas.impressionsPct, -100);
  assert.equal(outcome.evidenceState, "measured");
  // Contrast: identical post window with MISSING day docs is insufficient —
  // deltas are WITHHELD rather than fabricated from missing days.
  const db2 = makeDb();
  const dayDocs2 = baseDayDocs().filter((doc) => doc.date <= "2026-08-14");
  const { outcome: outcome2 } = await measureWithFixtures(db2, { dayDocs: dayDocs2 });
  assert.equal(outcome2.evidenceState, "insufficient_data");
  assert.equal(outcome2.deltas.impressionsPct, null); // never a fabricated -100%
  assert.equal(outcome2.deltas.impressions, null);
  assert.ok(outcome2.deltas.note.includes("Deltas withheld"));
});

test("no GSC rows and no day docs → no_data, never 'zero performance'", async () => {
  const db = makeDb();
  const { outcome } = await measureWithFixtures(db, { dayDocs: [], rows: [] });
  assert.equal(outcome.evidenceState, "no_data");
  assert.ok(outcome.evidenceStateReason.includes("nothing measured"));
  assert.equal(outcome.postMetrics.impressions, 0); // aggregate of zero rows
  assert.equal(outcome.preMetrics.impressions, 0);
  assertAllFinite(outcome);
});

test("no synthetic GSC data is ever written — only outcome documents", async () => {
  const db = makeDb();
  await measureWithFixtures(db);
  assertOnlyInternalWrites(db);
  for (const key of Object.keys(db._docs)) {
    assert.ok(!key.startsWith("gsc_search_analytics_daily"), `synthetic GSC data written: ${key}`);
    assert.ok(!key.startsWith("seo_change_events/"), `event ledger modified: ${key}`);
  }
});

// ─── Metric aggregation semantics ────────────────────────────────────

test("clicks aggregate as the SUM of GSC row clicks in each window", async () => {
  const db = makeDb();
  const { outcome } = await measureWithFixtures(db);
  assert.equal(outcome.preMetrics.clicks, 105); // 7 days × (10 + 5)
  assert.equal(outcome.postMetrics.clicks, 175); // 7 days × (20 + 5)
  assert.equal(outcome.deltas.clicks, 70);
  approx(outcome.deltas.clicksPct, (70 / 105) * 100);
});

test("impressions aggregate as the SUM of GSC row impressions in each window", async () => {
  const db = makeDb();
  const { outcome } = await measureWithFixtures(db);
  assert.equal(outcome.preMetrics.impressions, 5600); // 7 × (500 + 300)
  assert.equal(outcome.postMetrics.impressions, 6300); // 7 × (600 + 300)
  assert.equal(outcome.deltas.impressions, 700);
  assert.equal(outcome.deltas.impressionsPct, 12.5);
});

test("CTR = totalClicks / totalImpressions, NEVER a naive average of row CTRs", async () => {
  const db = makeDb();
  const { outcome } = await measureWithFixtures(db);
  assert.equal(outcome.preMetrics.ctr, 105 / 5600); // 0.01875
  approx(outcome.postMetrics.ctr, 175 / 6300);
  // Naive mean of row CTRs would be (0.02 + 1/60) / 2 ≈ 0.018333… — different.
  const naiveMean = (10 / 500 + 5 / 300) / 2;
  assert.notEqual(outcome.preMetrics.ctr, naiveMean);
  approx(outcome.preMetrics.ctr, 0.01875);
});

test("zero impressions → CTR/position are null and no fake percentages are produced", async () => {
  const db = makeDb();
  // Pre window rows exist but with zero impressions (zero denominator).
  const rows = baseRows().map((row) => (row.date <= "2026-08-14" && row.date !== CHANGE_DATE && row.normalizedPageUrl === PAGE
    ? { ...row, clicks: 0, impressions: 0, ctr: null, position: 0 }
    : row));
  const { outcome } = await measureWithFixtures(db, { rows });
  assert.equal(outcome.preMetrics.impressions, 0);
  assert.equal(outcome.preMetrics.ctr, null);
  assert.equal(outcome.preMetrics.avgPosition, null);
  assert.equal(outcome.deltas.ctrPct, null); // pre CTR unknown → no percentage
  assert.equal(outcome.deltas.impressionsPct, null); // pre = 0 → no fake percentage
  assert.equal(outcome.deltas.clicksPct, null);
  // Absolute deltas stay honest:
  assert.equal(outcome.deltas.impressions, 6300);
  assertAllFinite(outcome);
  assert.equal(outcome.evidenceState, "measured");
});

test("average position is impression-weighted (Σ position·impressions / Σ impressions), documented", async () => {
  const db = makeDb();
  const { outcome } = await measureWithFixtures(db);
  assert.equal(outcome.preMetrics.avgPosition, 9.5); // (8·500 + 12·300)·7 / 5600
  assert.equal(outcome.postMetrics.avgPosition, 8.0); // (6·600 + 12·300)·7 / 6300
  // Naive mean of row positions would be (8 + 12)/2 = 10 — different.
  assert.notEqual(outcome.preMetrics.avgPosition, 10);
  assert.equal(outcome.deltas.avgPosition, -1.5); // lower = generally better
  assert.ok(outcome.deltas.note.includes("Lower avg position number generally = better"));
});

test("query-level before/after comparison with small-sample honesty", async () => {
  const db = makeDb();
  const rows = baseRows().filter((row) => row.normalizedPageUrl === PAGE);
  // q3 appears only POST with tiny volume; q4 exists only PRE with solid volume.
  for (const date of dateRange("2026-08-16", "2026-08-22")) {
    rows.push(gscRow({ date, query: "ssc cgl notification 2026", clicks: 0, impressions: 1, position: 20 }));
  }
  for (const date of dateRange("2026-08-08", "2026-08-14")) {
    rows.push(gscRow({ date, query: "ssc cgl eligibility", clicks: 40, impressions: 2000, position: 5 }));
  }
  const { outcome } = await measureWithFixtures(db, { rows });
  const summary = outcome.querySummary;
  assert.equal(summary.sharedCount, 2);
  assert.equal(summary.appearedCount, 1);
  assert.equal(summary.disappearedCount, 1);
  const appeared = summary.appeared[0];
  assert.equal(appeared.query, "ssc cgl notification 2026");
  assert.equal(appeared.impressions, 7);
  assert.equal(appeared.lowEvidence, true); // 7 < smallSampleImpressions (10)
  const disappeared = summary.disappeared[0];
  assert.equal(disappeared.query, "ssc cgl eligibility");
  assert.equal(disappeared.lowEvidence, false);
  const shared = summary.shared.find((entry) => entry.query === "ssc cgl 2026");
  assert.equal(shared.pre.impressions, 3500);
  assert.equal(shared.post.impressions, 4200);
  assert.equal(shared.impressionsDelta, 700);
  assert.equal(shared.avgPositionDelta, -2);
  // Small-window absence is never declared a win/loss:
  assert.ok(summary.note.includes("NOT a win/loss"));
});

test("device dimension is preserved in the outcome", async () => {
  const db = makeDb();
  const { outcome } = await measureWithFixtures(db);
  const devices = new Map(outcome.deviceSummary.map((entry) => [entry.key, entry]));
  assert.equal(devices.get("MOBILE").preClicks, 70);
  assert.equal(devices.get("MOBILE").preImpressions, 3500);
  assert.equal(devices.get("MOBILE").postClicks, 140);
  assert.equal(devices.get("MOBILE").postImpressions, 4200);
  assert.equal(devices.get("DESKTOP").preClicks, 35);
  assert.equal(devices.get("DESKTOP").postImpressions, 2100);
});

test("country dimension is preserved in the outcome", async () => {
  const db = makeDb();
  const rows = baseRows();
  for (const date of dateRange("2026-08-08", "2026-08-22")) {
    if (date === CHANGE_DATE) continue;
    rows.push(gscRow({ date, query: "ssc cgl usa", country: "usa", device: "DESKTOP", clicks: 2, impressions: 100, position: 9 }));
  }
  const { outcome } = await measureWithFixtures(db, { rows });
  const countries = new Map(outcome.countrySummary.map((entry) => [entry.key, entry]));
  assert.ok(countries.has("ind"));
  assert.ok(countries.has("usa"));
  assert.equal(countries.get("usa").preImpressions, 700);
  assert.equal(countries.get("usa").postImpressions, 700);
});

// ─── Join strategy (exact normalized URL) ────────────────────────────

test("joins on the exact normalized page URL (same page, despite raw URL trailing slash)", async () => {
  const db = makeDb();
  const { outcome } = await measureWithFixtures(db);
  // The event's gscJoinKey equals the normalized URL; all PAGE rows joined,
  // other-page decoys excluded (other page + query-string variant).
  assert.equal(outcome.preMetrics.impressions, 5600);
  assert.equal(outcome.postMetrics.impressions, 6300);
  assert.equal(outcome.gscJoinKey, PAGE);
});

test("pages differing only by query string are NOT merged", async () => {
  const db = makeDb();
  const { outcome } = await measureWithFixtures(db);
  // The ?utm=whatsapp decoy contributes 4444 impressions/day if merged.
  assert.equal(outcome.preMetrics.impressions, 5600);
  assert.equal(outcome.postMetrics.impressions, 6300);
  assert.ok(!outcome.querySummary.shared.some((entry) => entry.query === "ssc cgl 2026" && entry.pre.impressions > 3500));
});

// ─── Determinism & idempotency ───────────────────────────────────────

test("one change event produces ONE deterministic outcome (same input → same output, same id, same hash)", async () => {
  const dayDocs = baseDayDocs();
  const rows = baseRows();
  const event = baseEvent();
  const first = computeOutcome({ event, dayDocs, pageRows: rows, otherEvents: [event], now: NOW });
  const second = computeOutcome({ event, dayDocs, pageRows: rows, otherEvents: [event], now: NOW });
  assert.deepEqual(first, second);
  assert.equal(first.outcomeId, "oc_ev-main");
  assert.equal(measurementHash(first), measurementHash(second));
});

test("retrying a measurement is idempotent — no duplicate document, no rewrite", async () => {
  const db = makeDb();
  const first = await measureWithFixtures(db);
  assert.equal(first.persisted.reason, "created");
  const docAfterFirst = { ...db._docs["seo_change_outcomes/oc_ev-main"] };
  const second = await measureWithFixtures(db);
  assert.equal(second.persisted.reason, "idempotent-skip");
  const doc = db._docs["seo_change_outcomes/oc_ev-main"];
  assert.equal(doc.revisionCount, 0);
  assert.equal(doc.revisions.length, 0);
  assert.equal(doc.firstMeasuredAt, docAfterFirst.firstMeasuredAt);
  assert.equal(doc.measuredAt, docAfterFirst.measuredAt);
  // Only the initial create wrote.
  assert.equal(db._writes.filter((key) => key.startsWith("seo_change_outcomes/")).length, 1);
  assertOnlyInternalWrites(db);
});

test("recalculation on late final GSC data updates the SAME document and preserves measurement history", async () => {
  const db = makeDb();
  const event = baseEvent({ eventId: "ev-recalc" });
  // Run 1 — early clock: post window (08-16..08-22) not yet finalized.
  const earlyNow = new Date("2026-08-20T06:00:00.000Z"); // last finalized 08-18
  const dayDocs = baseDayDocs().filter((doc) => doc.date <= "2026-08-18");
  const rows = baseRows().filter((row) => row.date <= "2026-08-18");
  const first = await measureEvent(db, event, {
    deps: makeLoaders(db, { dayDocs, rows, events: [event] }),
    now: earlyNow
  });
  assert.equal(first.evidenceState, "incomplete_data");
  const firstMeasuredAt = db._docs["seo_change_outcomes/oc_ev-recalc"].measuredAt;

  // Run 2 — late final data arrived for the full post window.
  const dayDocsFull = baseDayDocs();
  const rowsFull = baseRows();
  const second = await measureEvent(db, event, {
    deps: makeLoaders(db, { dayDocs: dayDocsFull, rows: rowsFull, events: [event] }),
    now: NOW
  });
  assert.equal(second.persisted.reason, "revised");
  const doc = db._docs["seo_change_outcomes/oc_ev-recalc"];
  assert.equal(doc.evidenceState, "measured");
  assert.equal(doc.revisionCount, 1);
  assert.equal(doc.revisions.length, 1);
  assert.equal(doc.revisions[0].evidenceState, "incomplete_data");
  assert.equal(doc.firstMeasuredAt, firstMeasuredAt); // history preserved
  assert.ok(doc.measuredAt >= firstMeasuredAt);
  assert.equal(Object.keys(db._docs).filter((key) => key.startsWith("seo_change_outcomes/")).length, 1); // same document
  assertOnlyInternalWrites(db);

  // Run 3 — same data again → deterministic no-op.
  const third = await measureEvent(db, event, {
    deps: makeLoaders(db, { dayDocs: dayDocsFull, rows: rowsFull, events: [event] }),
    now: NOW
  });
  assert.equal(third.persisted.reason, "idempotent-skip");
  assert.equal(db._docs["seo_change_outcomes/oc_ev-recalc"].revisionCount, 1);
});

// ─── Collision handling (confounding) ────────────────────────────────

test("nearby changes on the same page mark the outcome confounded (attribution limited)", async () => {
  const db = makeDb();
  const event = baseEvent();
  const nearby = baseEvent({ eventId: "ev-nearby", at: "2026-08-17T08:00:00.000Z", field: "title" });
  const { outcome } = await measureWithFixtures(db, { event, events: [event, nearby] });
  assert.equal(outcome.confounded, true);
  assert.equal(outcome.overlappingChangeCount, 1);
  assert.equal(outcome.sameFieldOverlapCount, 0); // different field
  assert.deepEqual(outcome.overlappingEventIds, ["ev-nearby"]);
  assert.equal(outcome.evidenceState, "confounded");
  assert.ok(outcome.evidenceStateReason.includes("attribution is limited"));
  // Measurement itself is still preserved (metrics computed, just flagged).
  assert.equal(outcome.preMetrics.clicks, 105);
  assertAllFinite(outcome);
});

test("attribution spans use ±2×windowDays: exactly 14 days apart still confounds, 15 does not", async () => {
  const event = baseEvent();
  const at14 = baseEvent({ eventId: "ev-14", at: "2026-08-01T00:00:00.000Z" }); // |Δ| = 14 → overlap
  const at15 = baseEvent({ eventId: "ev-15", at: "2026-07-31T00:00:00.000Z" }); // |Δ| = 15 → no overlap
  const out14 = computeOutcome({ event, dayDocs: baseDayDocs(), pageRows: baseRows(), otherEvents: [at14], now: NOW });
  const out15 = computeOutcome({ event, dayDocs: baseDayDocs(), pageRows: baseRows(), otherEvents: [at15], now: NOW });
  assert.equal(out14.confounded, true);
  assert.equal(out15.confounded, false);
  assert.equal(out15.evidenceState, "measured");
});

test("a distant change on the same page does not confound the outcome", async () => {
  const db = makeDb();
  const event = baseEvent();
  const distant = baseEvent({ eventId: "ev-distant", at: "2026-07-01T00:00:00.000Z" }); // |Δ| = 45
  const { outcome } = await measureWithFixtures(db, { event, events: [event, distant] });
  assert.equal(outcome.confounded, false);
  assert.equal(outcome.overlappingChangeCount, 0);
  assert.equal(outcome.evidenceState, "measured");
});

test("rolled-back changes are still changes — they count for confounding detection", async () => {
  const event = baseEvent();
  const rollback = baseEvent({
    eventId: "ev-rollback",
    kind: "rolled_back",
    at: "2026-08-18T08:00:00.000Z"
  });
  const outcome = computeOutcome({ event, dayDocs: baseDayDocs(), pageRows: baseRows(), otherEvents: [rollback], now: NOW });
  assert.equal(outcome.confounded, true);
  assert.equal(outcome.evidenceState, "confounded");
});

// ─── Lifecycle carry-over (context, never a trigger) ─────────────────

test("JOB lifecycle is carried into the outcome as context", async () => {
  const db = makeDb();
  const lifecycle = { state: "ACTIVE", context: "lastDate 2026-12-31", asOf: EVENT_AT };
  const { outcome } = await measureWithFixtures(db, { event: baseEvent({ lifecycle }) });
  assert.deepEqual(outcome.lifecycle, lifecycle);
  assert.equal(outcome.contentType, "JOB");
  assert.equal(outcome.lifecycleEligibleForOptimization, true);
});

test("FAST_TRACK lifecycle is carried into the outcome as context", async () => {
  const db = makeDb();
  const lifecycle = { state: "ACTIVE", context: "examDate 2026-09-15", asOf: EVENT_AT };
  const { outcome } = await measureWithFixtures(db, {
    event: baseEvent({ contentType: "FAST_TRACK", collection: "fast_track", lifecycle })
  });
  assert.deepEqual(outcome.lifecycle, lifecycle);
  assert.equal(outcome.contentType, "FAST_TRACK");
});

test("expired JOB outcome is historical context only — non-actionable, no new optimization", async () => {
  const db = makeDb();
  const lifecycle = { state: "EXPIRED", context: "lastDate 2026-01-01", asOf: "2026-01-02T00:00:00.000Z" };
  const { outcome } = await measureWithFixtures(db, {
    event: baseEvent({ lifecycle, eligibleForAutomaticOptimization: false })
  });
  assert.equal(outcome.lifecycle.state, "EXPIRED");
  assert.equal(outcome.lifecycleEligibleForOptimization, false);
  assert.equal(outcome.evidenceState, "measured"); // historical measurement preserved
  // Non-actionable: the ONLY write is the outcome document.
  assertOnlyInternalWrites(db);
});

test("expired FAST_TRACK outcome is historical context only — non-actionable", async () => {
  const db = makeDb();
  const lifecycle = { state: "EXPIRED", context: "examDate 2026-01-10", asOf: "2026-01-11T00:00:00.000Z" };
  const { outcome } = await measureWithFixtures(db, {
    event: baseEvent({ contentType: "FAST_TRACK", collection: "fast_track", lifecycle, eligibleForAutomaticOptimization: false })
  });
  assert.equal(outcome.lifecycle.state, "EXPIRED");
  assert.equal(outcome.lifecycleEligibleForOptimization, false);
  assert.equal(outcome.evidenceState, "measured");
  assertOnlyInternalWrites(db);
});

test("BLOG content measures without a lifecycle", async () => {
  const db = makeDb();
  const { outcome } = await measureWithFixtures(db, {
    event: baseEvent({ contentType: "BLOG", collection: "blogs", lifecycle: null, eligibleForAutomaticOptimization: null })
  });
  assert.equal(outcome.contentType, "BLOG");
  assert.equal(outcome.lifecycle, null);
  assert.equal(outcome.lifecycleEligibleForOptimization, false);
  assert.equal(outcome.evidenceState, "measured");
});

test("legacy Phase 2 events without optional fields measure safely with explicit defaults", async () => {
  const db = makeDb();
  // Oldest-shape event: no fieldGroup / lifecycle / eligibility / source /
  // proposalId / value payloads — the ledger has always allowed these to be absent.
  const legacy = {
    eventId: "ev-legacy",
    kind: "applied",
    at: EVENT_AT,
    gscJoinKey: PAGE,
    contentId: "job-9",
    collection: "jobs",
    contentType: "JOB",
    field: "title"
  };
  const { outcome } = await measureWithFixtures(db, { event: legacy, events: [legacy] });
  assert.equal(outcome.evidenceState, "measured");
  assert.equal(outcome.fieldGroup, "other");
  assert.equal(outcome.lifecycle, null);
  assert.equal(outcome.source, "");
  assert.equal(outcome.proposalId, null);
  assert.deepEqual(outcome.oldValue, { kind: "inline", value: null });
  assert.deepEqual(outcome.newValue, { kind: "inline", value: null });
  assertAllFinite(outcome);
});

// ─── Evidence states ─────────────────────────────────────────────────

test("no_change_observed when measured movement is within the no-change thresholds", async () => {
  const db = makeDb();
  const rows = baseRows().map((row) => (row.normalizedPageUrl === PAGE && row.date !== CHANGE_DATE
    ? { ...row, clicks: 10, impressions: 500, ctr: 10 / 500, position: 8 }
    : row));
  const { outcome } = await measureWithFixtures(db, { rows });
  assert.equal(outcome.evidenceState, "no_change_observed");
  assert.equal(outcome.deltas.impressionsPct, 0);
  assert.ok(outcome.evidenceStateReason.includes("diagnostic"));
});

test("measured outcome language is correlational, never causal", async () => {
  const db = makeDb();
  const { outcome } = await measureWithFixtures(db);
  assert.equal(outcome.evidenceState, "measured");
  assert.ok(outcome.evidenceStateReason.includes("correlation, not causation"));
  assert.ok(outcome.deltas.note.includes("correlation, not causation"));
  // Schema sanity for the documented outcome document:
  for (const key of [
    "schemaVersion", "outcomeId", "eventId", "contentId", "collection", "contentType",
    "pageUrl", "gscJoinKey", "field", "fieldGroup", "changeAt", "proposalId", "source",
    "lifecycle", "preWindow", "postWindow", "dataCoverage", "preMetrics", "postMetrics",
    "deltas", "querySummary", "countrySummary", "deviceSummary",
    "overlappingChangeCount", "confounded", "evidenceState"
  ]) {
    assert.ok(key in outcome, `missing schema field: ${key}`);
  }
  assert.equal(outcome.schemaVersion, 1);
});

// ─── Runner (runOutcomeMeter) ────────────────────────────────────────

const FIELD_VALUE = { serverTimestamp: () => "SERVER_TIMESTAMP" };

function runnerDeps(db, fixtures, now = NOW) {
  return { ...makeLoaders(db, fixtures), now };
}

test("runner: recent mode measures events without outcomes and skips events without gscJoinKey", async () => {
  automationGuard.invalidateCache();
  const db = makeDb();
  const event = baseEvent();
  const noJoinKey = baseEvent({ eventId: "ev-nokey", at: "2026-08-16T00:00:00.000Z" });
  delete noJoinKey.gscJoinKey;
  const summary = await runOutcomeMeter({
    db,
    FieldValue: FIELD_VALUE,
    args: { mode: "recent" },
    deps: runnerDeps(db, { dayDocs: baseDayDocs(), rows: baseRows(), events: [event, noJoinKey] })
  });
  assert.equal(summary.ok, true);
  assert.equal(summary.measured, 1);
  assert.equal(summary.created, 1);
  assert.equal(summary.results[0].eventId, "ev-main");
  assert.equal(summary.results[0].evidenceState, "measured");
  assert.deepEqual(summary.skipped, [{ eventId: "ev-nokey", reason: "no-gsc-join-key" }]);
  // Runner status recorded…
  const status = db._docs["system_settings/seo_intelligence"].outcomeRunner;
  assert.equal(status.lastStatus, "success");
  assert.equal(status.created, 1);
  // …and ONLY outcomes + runner status were written.
  assertOnlyInternalWrites(db);
});

test("runner: complete outcomes are NOT re-measured on the next daily run", async () => {
  automationGuard.invalidateCache();
  const db = makeDb();
  const event = baseEvent();
  const fixtures = { dayDocs: baseDayDocs(), rows: baseRows(), events: [event] };
  const first = await runOutcomeMeter({ db, FieldValue: FIELD_VALUE, args: { mode: "recent" }, deps: runnerDeps(db, fixtures) });
  assert.equal(first.created, 1);
  const writesAfterFirst = db._writes.length;

  automationGuard.invalidateCache();
  const second = await runOutcomeMeter({ db, FieldValue: FIELD_VALUE, args: { mode: "recent" }, deps: runnerDeps(db, fixtures) });
  assert.equal(second.measured, 0);
  assert.equal(second.created, 0);
  assert.equal(second.revised, 0);
  assert.equal(second.lastStatus, "success");
  // Only the runner status document was touched again — no outcome rewrite.
  assert.equal(db._writes.length - writesAfterFirst, 1);
  assert.equal(db._docs["seo_change_outcomes/oc_ev-main"].revisionCount, 0);
});

test("runner: incomplete outcomes are re-measured as late GSC data arrives, then settle", async () => {
  automationGuard.invalidateCache();
  const db = makeDb();
  const event = baseEvent({ eventId: "ev-late", at: "2026-08-26T09:00:00.000Z" });
  const dayDocs = dateRange("2026-08-19", "2026-08-27").map((date) => dayDoc(date));
  const rows = [
    ...dateRange("2026-08-19", "2026-08-25").map((date) => gscRow({ date, clicks: 10, impressions: 500, position: 8 })),
    gscRow({ date: "2026-08-27", clicks: 20, impressions: 600, position: 6 })
  ];
  const fixtures = { dayDocs, rows, events: [event] };

  const first = await runOutcomeMeter({ db, FieldValue: FIELD_VALUE, args: { mode: "recent" }, deps: runnerDeps(db, fixtures) });
  assert.equal(first.created, 1);
  assert.equal(first.results[0].evidenceState, "incomplete_data");
  assert.equal(db._docs["seo_change_outcomes/oc_ev-late"].dataCoverage.availableThrough, "2026-08-27");

  // Late final GSC data arrives for 08-28..09-02 and the clock advances.
  const laterNow = new Date("2026-09-04T06:00:00.000Z"); // last finalized 09-02
  for (const date of dateRange("2026-08-28", "2026-09-02")) {
    dayDocs.push(dayDoc(date));
    rows.push(gscRow({ date, clicks: 20, impressions: 600, position: 6 }));
  }
  automationGuard.invalidateCache();
  const second = await runOutcomeMeter({ db, FieldValue: FIELD_VALUE, args: { mode: "recent" }, deps: runnerDeps(db, fixtures, laterNow) });
  assert.equal(second.revised, 1);
  const doc = db._docs["seo_change_outcomes/oc_ev-late"];
  assert.equal(doc.evidenceState, "measured");
  assert.equal(doc.revisionCount, 1);
  assert.equal(doc.revisions[0].evidenceState, "incomplete_data");
  assert.equal(doc.dataCoverage.availableThrough, "2026-09-02");
  assert.equal(doc.postMetrics.impressions, 600 * 7); // 7 finalized post days (08-27..09-02)

  // Fully settled: the next daily run leaves it alone.
  automationGuard.invalidateCache();
  const third = await runOutcomeMeter({ db, FieldValue: FIELD_VALUE, args: { mode: "recent" }, deps: runnerDeps(db, fixtures, laterNow) });
  assert.equal(third.measured, 0);
  assert.equal(db._docs["seo_change_outcomes/oc_ev-late"].revisionCount, 1);
  assertOnlyInternalWrites(db);
});

test("runner: kill-switch disabled → skipped (fail-open when the settings doc is absent)", async () => {
  // Fail-open: no automation doc at all → the runner measures.
  automationGuard.invalidateCache();
  const db = makeDb();
  const event = baseEvent();
  const ran = await runOutcomeMeter({
    db,
    FieldValue: FIELD_VALUE,
    args: { mode: "recent" },
    deps: runnerDeps(db, { dayDocs: baseDayDocs(), rows: baseRows(), events: [event] })
  });
  assert.equal(ran.skippedRun, undefined);
  assert.equal(ran.created, 1);

  // Kill-switch off → skipped, nothing measured, only the status write remains.
  automationGuard.invalidateCache();
  const dbOff = makeDb({ "system_settings/automation": { globalEnabled: false } });
  const off = await runOutcomeMeter({
    db: dbOff,
    FieldValue: FIELD_VALUE,
    args: { mode: "recent" },
    deps: runnerDeps(dbOff, { dayDocs: baseDayDocs(), rows: baseRows(), events: [event] })
  });
  assert.equal(off.skippedRun, true);
  assert.equal(off.measured, undefined);
  assert.deepEqual(dbOff._writes, ["system_settings/seo_intelligence"]);
  assert.equal(dbOff._docs["system_settings/seo_intelligence"].outcomeRunner.lastStatus, "skipped");
  automationGuard.invalidateCache();
});

test("runner: dry-run computes but writes NOTHING", async () => {
  automationGuard.invalidateCache();
  const db = makeDb();
  const event = baseEvent();
  const summary = await runOutcomeMeter({
    db,
    FieldValue: FIELD_VALUE,
    args: { mode: "recent", dryRun: true },
    deps: runnerDeps(db, { dayDocs: baseDayDocs(), rows: baseRows(), events: [event] })
  });
  assert.equal(summary.dryRun, true);
  assert.equal(summary.measured, 1);
  assert.equal(summary.results[0].evidenceState, "measured");
  assert.equal(db._writes.length, 0);
  assert.equal(Object.keys(db._docs).length, 0);
});

test("runner: event mode measures exactly one event by id", async () => {
  automationGuard.invalidateCache();
  const db = makeDb({ "seo_change_events/ev-main": baseEvent() });
  const other = baseEvent({ eventId: "ev-other", at: "2026-08-16T00:00:00.000Z" });
  const summary = await runOutcomeMeter({
    db,
    FieldValue: FIELD_VALUE,
    args: { mode: "event", eventId: "ev-main" },
    deps: runnerDeps(db, { dayDocs: baseDayDocs(), rows: baseRows(), events: [baseEvent(), other] })
  });
  assert.equal(summary.measured, 1);
  assert.equal(summary.results[0].eventId, "ev-main");
  assert.equal(summary.created, 1);
  assert.ok(!("seo_change_outcomes/oc_ev-other" in db._docs));
  assertOnlyInternalWrites(db);
});

test("runner: event mode rejects unknown event ids", async () => {
  automationGuard.invalidateCache();
  const db = makeDb();
  await assert.rejects(
    runOutcomeMeter({
      db,
      FieldValue: FIELD_VALUE,
      args: { mode: "event", eventId: "does-not-exist" },
      deps: runnerDeps(db, {})
    }),
    /Change event not found/
  );
});

test("runner: recalc mode re-measures but is idempotent for unchanged data", async () => {
  automationGuard.invalidateCache();
  const db = makeDb();
  const event = baseEvent();
  const fixtures = { dayDocs: baseDayDocs(), rows: baseRows(), events: [event] };
  const first = await runOutcomeMeter({ db, FieldValue: FIELD_VALUE, args: { mode: "recent" }, deps: runnerDeps(db, fixtures) });
  assert.equal(first.created, 1);
  automationGuard.invalidateCache();
  const recalc = await runOutcomeMeter({ db, FieldValue: FIELD_VALUE, args: { mode: "recalc" }, deps: runnerDeps(db, fixtures) });
  assert.equal(recalc.measured, 1);
  assert.equal(recalc.unchanged, 1);
  assert.equal(recalc.revised, 0);
  assert.equal(db._docs["seo_change_outcomes/oc_ev-main"].revisionCount, 0);
  assertOnlyInternalWrites(db);
});

test("runner: the event ledger, public content, proposals, and GSC data are NEVER written", async () => {
  automationGuard.invalidateCache();
  const db = makeDb();
  const event = baseEvent();
  await runOutcomeMeter({
    db,
    FieldValue: FIELD_VALUE,
    args: { mode: "recalc" },
    deps: runnerDeps(db, { dayDocs: baseDayDocs(), rows: baseRows(), events: [event] })
  });
  // Every write target across a full recalc run:
  assert.deepEqual([...new Set(db._writes)].sort(), ["seo_change_outcomes/oc_ev-main", "system_settings/seo_intelligence"]);
  for (const key of Object.keys(db._docs)) {
    assert.ok(
      key.startsWith("seo_change_outcomes/") || key.startsWith("system_settings/"),
      `runner wrote outside measurement collections: ${key}`
    );
  }
});

test("runner honors the max-events cap", async () => {
  automationGuard.invalidateCache();
  const db = makeDb();
  const events = [];
  for (let index = 0; index < 8; index += 1) {
    events.push(baseEvent({ eventId: `ev-${index}`, at: `2026-08-1${index}T09:00:00.000Z` }));
  }
  const summary = await runOutcomeMeter({
    db,
    FieldValue: FIELD_VALUE,
    args: { mode: "recalc", maxEvents: 3 },
    deps: runnerDeps(db, { dayDocs: baseDayDocs(), rows: baseRows(), events })
  });
  assert.equal(summary.measured, 3);
  assert.equal(Object.keys(db._docs).filter((key) => key.startsWith("seo_change_outcomes/")).length, 3);
  assertOnlyInternalWrites(db);
});

// ─── Guardrail re-checks (Phase 1/2/Auto-Optimizer behavior untouched) ──

test("Phase 1 GSC normalization semantics are reused unchanged (finality offset = DEFAULT_END_OFFSET_DAYS)", () => {
  // The outcome meter must reuse Phase 1's finality constant rather than
  // redefining its own data-cutoff semantics.
  const { DEFAULT_END_OFFSET_DAYS } = require("../agents/seo_intelligence/gsc_search_analytics");
  assert.equal(DEFAULT_CONFIG.finalityOffsetDays, DEFAULT_END_OFFSET_DAYS);
});

test("outcome meter modules never touch the Growth learner or the optimizer", () => {
  // Behavioral guarantee: the measurement engine and runner expose no
  // learning/optimization APIs at all — measurement only.
  const api = require("../agents/seo_intelligence/outcome_meter");
  for (const banned of ["learn", "policy", "winner", "selectWinner", "propose", "applyProposal", "optimize", "train"]) {
    const hits = Object.keys(api).filter((key) => key.toLowerCase().includes(banned.toLowerCase()));
    assert.deepEqual(hits, [], `outcome meter must not expose ${banned} APIs (found: ${hits.join(", ")})`);
  }
});

// Keep the guard cache clean for any test that runs after this file.
test("cleanup: invalidate automation guard cache", () => {
  automationGuard.invalidateCache();
});
