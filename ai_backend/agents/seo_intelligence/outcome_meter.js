"use strict";

/**
 * SEO Outcome Meter — Phase 3 (measurement ONLY).
 *
 * Connects REAL Phase 1 GSC Search Analytics rows with REAL Phase 2 SEO change
 * events and produces one outcome measurement per change event:
 *
 *   CHANGE EVENT (gscJoinKey + changeAt)
 *   + PRE window  (7 completed GSC days immediately before the change,
 *                  change day excluded)
 *   + POST window (7 days after the change, change day excluded, future /
 *                  not-yet-final days excluded)
 *   → observed before/after difference (correlation, NEVER causation)
 *
 * What this module does NOT do:
 *   - no learning, no policies, no winner selection, no exploration
 *   - no proposal generation, no content writes, no optimization triggers
 *   - no synthetic GSC data — missing days stay missing (coverage is explicit)
 *   - no causal claims — language is "observed", "before/after difference"
 *
 * Metric semantics (documented, mirrors Phase 1 dashboard):
 *   - clicks / impressions: sums over the page's GSC rows in the window
 *   - CTR = totalClicks / totalImpressions  (NEVER a naive average of row CTRs)
 *   - average position = Σ(position × impressions) / Σ(impressions)
 *     (impression-weighted, same aggregation as Phase 1's
 *     positionImpressionSum; lower position number generally = better)
 *   - percentage deltas only where the denominator > 0
 *
 * Firestore access uses ONLY automatic single-field indexes:
 *   - gsc_search_analytics_daily:  where('date','>=',x).where('date','<=',y)
 *   - collectionGroup('rows'):     where('normalizedPageUrl','==',gscJoinKey)
 *   - seo_change_events:           where('gscJoinKey','==',key) / orderBy('at')
 * No composite indexes are required.
 */

const crypto = require("crypto");
const { isAutomationEnabled } = require("../automation_guard");
const { DEFAULT_END_OFFSET_DAYS } = require("./gsc_search_analytics");

const OUTCOMES_COLLECTION = "seo_change_outcomes";
const EVENTS_COLLECTION = "seo_change_events";
const GSC_DAILY_COLLECTION = "gsc_search_analytics_daily";
const GSC_ROWS_COLLECTION = "rows";
const SETTINGS = "system_settings";
const SEO_SETTINGS_DOC = "seo_intelligence";
const RUNNER_NAME = "seo-outcome-meter";
const SCHEMA_VERSION = 1;

// ─── Configuration (explicit defaults, all overridable per call) ────
const DEFAULT_CONFIG = Object.freeze({
  windowDays: 7,            // PRE and POST window length in GSC days
  finalityOffsetDays: DEFAULT_END_OFFSET_DAYS, // reuse Phase 1 finality (dates ≥ today−2 are final)
  minWindowDays: 3,         // minimum AVAILABLE days per window to call a fully-elapsed outcome "measured"
  smallSampleImpressions: 10, // query observations below this are flagged low-evidence
  maxQueryEntries: 20,      // per querySummary bucket (counts always reflect the full set)
  maxDimensionEntries: 10,  // country/device summary rows kept
  overlapDays: 14           // another change within ±14 days overlaps attribution spans
});

const NO_CHANGE_THRESHOLDS = Object.freeze({
  impressionsPct: 5,        // |Δ%| below this counts as "no change"
  clicksPct: 5,
  ctr: 0.005,               // absolute CTR fraction difference
  avgPosition: 0.5          // absolute weighted-average position difference
});

const MAX_EVENTS_PER_RUN_DEFAULT = 25;
const MAX_EVENTS_PER_RUN_HARD = 100;

// ─── Date helpers (UTC date strings, GSC semantics) ─────────────────

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value) {
  return new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
}

function addDays(isoDateString, days) {
  const date = parseIsoDate(isoDateString);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function dateDiffDays(aIso, bIso) {
  return Math.round((parseIsoDate(aIso).getTime() - parseIsoDate(bIso).getTime()) / 86400000);
}

function dateRange(startIso, endIso) {
  const out = [];
  let cursor = startIso;
  while (dateDiffDays(endIso, cursor) >= 0) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

function changeDateOf(event) {
  return String(event && event.at || "").slice(0, 10);
}

/** Latest GSC date considered finalized (same finality semantics as Phase 1). */
function lastCompletedDate(now = new Date(), finalityOffsetDays = DEFAULT_CONFIG.finalityOffsetDays) {
  const date = new Date(now.getTime());
  date.setUTCDate(date.getUTCDate() - finalityOffsetDays);
  return isoDate(date);
}

// ─── Window computation (deterministic) ─────────────────────────────

function computeWindows(eventAt, now, config = DEFAULT_CONFIG) {
  const changeDate = String(eventAt || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(changeDate)) {
    throw new Error(`Invalid event timestamp (expected ISO date): ${eventAt}`);
  }
  const lastCompleted = lastCompletedDate(now, config.finalityOffsetDays);
  const pre = {
    start: addDays(changeDate, -config.windowDays),
    end: addDays(changeDate, -1) // change day excluded
  };
  const post = {
    start: addDays(changeDate, 1), // change day excluded
    end: addDays(changeDate, config.windowDays)
  };
  return {
    changeDate,
    lastCompleted,
    pre,
    post,
    postFullyElapsed: dateDiffDays(post.end, lastCompleted) <= 0, // post.end ≤ last finalized GSC date
    expectedThrough: post.end
  };
}

// ─── Coverage (explicit availability; missing ≠ zero) ───────────────

function computeCoverage(windowRange, dayDocs, lastCompleted) {
  const byDate = new Map(dayDocs.map((doc) => [String(doc.date), doc]));
  const availableDays = [];
  const zeroRowDays = [];
  const missingDays = [];
  const notYetAvailableDays = [];
  for (const date of windowRange) {
    if (dateDiffDays(date, lastCompleted) > 0) {
      notYetAvailableDays.push(date); // future / not-yet-final GSC day
      continue;
    }
    const doc = byDate.get(date);
    if (doc && (doc.status === "success" || doc.status === "zero-rows")) {
      availableDays.push(date);
      if (doc.status === "zero-rows") zeroRowDays.push(date);
    } else {
      missingDays.push(date); // no collected day doc OR an errored collection
    }
  }
  return {
    availableDays,
    zeroRowDays,
    missingDays,
    notYetAvailableDays,
    availableCount: availableDays.length,
    expectedCount: availableDays.length + missingDays.length + notYetAvailableDays.length
  };
}

// ─── Metric aggregation (documented semantics) ──────────────────────

function aggregateRows(rows) {
  let clicks = 0;
  let impressions = 0;
  let positionImpressionSum = 0;
  const queries = new Set();
  for (const row of rows) {
    clicks += Number(row.clicks || 0);
    impressions += Number(row.impressions || 0);
    positionImpressionSum += Number(row.position || 0) * Number(row.impressions || 0);
    if (row.query) queries.add(String(row.query));
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    avgPosition: impressions > 0 ? positionImpressionSum / impressions : null,
    queryCount: queries.size,
    rowCount: rows.length
  };
}

function pctDelta(preValue, postValue) {
  if (preValue == null || postValue == null) return null;
  if (!(preValue > 0)) return null; // zero denominator → no fake percentage
  return ((postValue - preValue) / preValue) * 100;
}

function absDelta(preValue, postValue) {
  if (preValue == null || postValue == null) return null;
  return postValue - preValue;
}

function computeDeltas(preMetrics, postMetrics) {
  return {
    clicks: absDelta(preMetrics.clicks, postMetrics.clicks),
    clicksPct: pctDelta(preMetrics.clicks, postMetrics.clicks),
    impressions: absDelta(preMetrics.impressions, postMetrics.impressions),
    impressionsPct: pctDelta(preMetrics.impressions, postMetrics.impressions),
    ctr: absDelta(preMetrics.ctr, postMetrics.ctr),
    ctrPct: pctDelta(preMetrics.ctr, postMetrics.ctr),
    avgPosition: absDelta(preMetrics.avgPosition, postMetrics.avgPosition),
    queryCount: absDelta(preMetrics.queryCount, postMetrics.queryCount),
    note: "Observed before/after differences (correlation, not causation). Lower avg position number generally = better. Percentage deltas omitted where the pre value was 0 or unknown."
  };
}

/**
 * Deltas are WITHHELD when either window has fewer than minWindowDays
 * available GSC days — a difference computed from mostly-missing days would
 * fabricate movement (e.g. a misleading -100% when no post data exists).
 * The coverage fields state exactly what was and was not available.
 */
function withheldDeltas(preCoverage, postCoverage, config) {
  void preCoverage; void postCoverage; void config;
  return {
    clicks: null,
    clicksPct: null,
    impressions: null,
    impressionsPct: null,
    ctr: null,
    ctrPct: null,
    avgPosition: null,
    queryCount: null,
    note: "Deltas withheld: fewer than the minimum available GSC days in at least one window. Missing days are coverage gaps, not zero performance — no before/after difference is claimed from them."
  };
}

// ─── Query / dimension breakdowns ───────────────────────────────────

function groupByQuery(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row.query || "");
    if (!map.has(key)) map.set(key, { clicks: 0, impressions: 0, positionImpressionSum: 0 });
    const entry = map.get(key);
    entry.clicks += Number(row.clicks || 0);
    entry.impressions += Number(row.impressions || 0);
    entry.positionImpressionSum += Number(row.position || 0) * Number(row.impressions || 0);
  }
  return map;
}

function queryEntry(query, entry, { smallSampleImpressions }) {
  return {
    query,
    clicks: entry.clicks,
    impressions: entry.impressions,
    ctr: entry.impressions > 0 ? entry.clicks / entry.impressions : null,
    avgPosition: entry.impressions > 0 ? entry.positionImpressionSum / entry.impressions : null,
    lowEvidence: entry.impressions < smallSampleImpressions
  };
}

/**
 * Query-level before/after comparison. Queries absent from a window are NOT
 * declared won/lost — small observations are flagged lowEvidence and the
 * summary records counts only, capped entry lists.
 */
function computeQuerySummary(preRows, postRows, config) {
  const pre = groupByQuery(preRows);
  const post = groupByQuery(postRows);
  const shared = [];
  const appeared = [];
  const disappeared = [];
  for (const [query, entry] of pre) {
    if (post.has(query)) {
      const postEntry = post.get(query);
      shared.push({
        query,
        pre: queryEntry(query, entry, config),
        post: queryEntry(query, postEntry, config),
        clicksDelta: absDelta(entry.clicks, postEntry.clicks),
        impressionsDelta: absDelta(entry.impressions, postEntry.impressions),
        ctrDelta: absDelta(
          entry.impressions > 0 ? entry.clicks / entry.impressions : null,
          postEntry.impressions > 0 ? postEntry.clicks / postEntry.impressions : null
        ),
        avgPositionDelta: absDelta(
          entry.impressions > 0 ? entry.positionImpressionSum / entry.impressions : null,
          postEntry.impressions > 0 ? postEntry.positionImpressionSum / postEntry.impressions : null
        )
      });
    } else {
      disappeared.push(queryEntry(query, entry, config));
    }
  }
  for (const [query, entry] of post) {
    if (!pre.has(query)) appeared.push(queryEntry(query, entry, config));
  }
  const byImpressions = (list) => list.slice().sort((a, b) => b.impressions - a.impressions);
  return {
    sharedCount: shared.length,
    appearedCount: appeared.length,
    disappearedCount: disappeared.length,
    shared: byImpressions(shared).slice(0, config.maxQueryEntries),
    appeared: byImpressions(appeared).slice(0, config.maxQueryEntries),
    disappeared: byImpressions(disappeared).slice(0, config.maxQueryEntries),
    note: "Absence from one window is NOT a win/loss — small observations are flagged lowEvidence. Entries are diagnostic only."
  };
}

function computeDimensionSummary(preRows, postRows, dimension, config) {
  const totals = new Map();
  const add = (rows, side) => {
    for (const row of rows) {
      const key = String(row[dimension] || "unknown");
      if (!totals.has(key)) totals.set(key, { key, preClicks: 0, preImpressions: 0, postClicks: 0, postImpressions: 0 });
      const entry = totals.get(key);
      entry[`${side}Clicks`] += Number(row.clicks || 0);
      entry[`${side}Impressions`] += Number(row.impressions || 0);
    }
  };
  add(preRows, "pre");
  add(postRows, "post");
  return [...totals.values()]
    .sort((a, b) => (b.preImpressions + b.postImpressions) - (a.preImpressions + a.postImpressions))
    .slice(0, config.maxDimensionEntries);
}

// ─── Confounding / collision detection ──────────────────────────────

/**
 * Another change on the SAME page whose attribution span
 * [changeDate−windowDays, changeDate+windowDays] intersects this event's span
 * — i.e. |Δdays| ≤ 2×windowDays (default ±14 days with 7-day windows) —
 * makes before/after attribution limited. Individual events are preserved;
 * every overlapping outcome is marked confounded.
 */
function detectOverlappingChanges(event, otherEvents, config) {
  const changeDate = changeDateOf(event);
  const overlapLimit = config.windowDays * 2;
  const overlapping = [];
  const sameField = [];
  for (const other of otherEvents) {
    if (!other || other.eventId === event.eventId) continue;
    const diff = Math.abs(dateDiffDays(changeDateOf(other), changeDate));
    if (diff > overlapLimit) continue;
    overlapping.push(other);
    if (String(other.field || "") === String(event.field || "")) sameField.push(other);
  }
  return {
    overlappingChangeCount: overlapping.length,
    sameFieldOverlapCount: sameField.length,
    overlappingEventIds: overlapping.slice(0, 5).map((item) => String(item.eventId || "")).filter(Boolean),
    confounded: overlapping.length > 0
  };
}

// ─── Evidence state ─────────────────────────────────────────────────

function computeEvidenceState({ preCoverage, postCoverage, postFullyElapsed, confounding, deltas, config }) {
  const totalAvailable = preCoverage.availableCount + postCoverage.availableCount;
  if (totalAvailable === 0) {
    return {
      evidenceState: "no_data",
      evidenceStateReason: "No collected GSC days are available in either window — nothing measured."
    };
  }
  if (!postFullyElapsed) {
    return {
      evidenceState: "incomplete_data",
      evidenceStateReason: `Post window runs through ${postCoverage.end || ""} and final GSC data is not yet available for all of it (${postCoverage.availableCount} of ${postCoverage.expectedCount} expected post days collected so far). This outcome will be recalculated as data arrives.`
    };
  }
  if (preCoverage.availableCount < config.minWindowDays || postCoverage.availableCount < config.minWindowDays) {
    return {
      evidenceState: "insufficient_data",
      evidenceStateReason: `Only ${preCoverage.availableCount}/${preCoverage.expectedCount} pre and ${postCoverage.availableCount}/${postCoverage.expectedCount} post GSC days are available (${preCoverage.missingDays.length + postCoverage.missingDays.length} missing). Missing days are NOT treated as zero performance.`
    };
  }
  if (confounding.confounded) {
    return {
      evidenceState: "confounded",
      evidenceStateReason: `${confounding.overlappingChangeCount} other change(s) on this page within ±${config.windowDays * 2} days — attribution is limited; observed movement cannot be attributed to this change alone.`
    };
  }
  const flat = (value, limit) => value != null && Math.abs(value) < limit;
  const allDefined = deltas.impressionsPct != null && deltas.clicksPct != null
    && deltas.ctr != null && deltas.avgPosition != null;
  if (allDefined
    && flat(deltas.impressionsPct, NO_CHANGE_THRESHOLDS.impressionsPct)
    && flat(deltas.clicksPct, NO_CHANGE_THRESHOLDS.clicksPct)
    && flat(deltas.ctr, NO_CHANGE_THRESHOLDS.ctr)
    && flat(deltas.avgPosition, NO_CHANGE_THRESHOLDS.avgPosition)) {
    return {
      evidenceState: "no_change_observed",
      evidenceStateReason: "Measured — observed movement is within the no-change thresholds (diagnostic, not a ranking claim)."
    };
  }
  return {
    evidenceState: "measured",
    evidenceStateReason: "Measured from available final GSC days. Observed before/after difference (correlation, not causation)."
  };
}

// ─── Outcome computation (pure engine) ──────────────────────────────

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function measurementHash(outcome) {
  const { revisions, revisionCount, measuredAt, firstMeasuredAt, ...core } = outcome;
  void revisions; void revisionCount; void measuredAt; void firstMeasuredAt;
  return crypto.createHash("sha256").update(stableStringify(core), "utf8").digest("hex").slice(0, 40);
}

/**
 * Compute one outcome from raw inputs. Pure — all data access is injected by
 * the caller, which keeps the measurement engine fully testable.
 */
function computeOutcome({ event, dayDocs, pageRows, otherEvents, now = new Date(), config = DEFAULT_CONFIG }) {
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config };
  const windows = computeWindows(event.at, now, effectiveConfig);
  const preDates = dateRange(windows.pre.start, windows.pre.end);
  const postDates = dateRange(windows.post.start, windows.post.end);

  // Exact-match page join: gscJoinKey === row.normalizedPageUrl. Query strings
  // are preserved by normalization, so page?a=1 and page?a=2 never merge.
  const joinKey = String(event.gscJoinKey || "");
  const joinedRows = pageRows.filter((row) => String(row.normalizedPageUrl || "") === joinKey);
  const inWindow = (row) => {
    const date = String(row.date || "");
    return (date >= windows.pre.start && date <= windows.post.end);
  };
  const windowedRows = joinedRows.filter(inWindow);
  // Coverage first: metrics are computed ONLY over days whose GSC collection
  // succeeded (day doc status success|zero-rows). Rows belonging to missing,
  // errored, or not-yet-final days are excluded — a missing day must never
  // leak into a metric and is never treated as a zero either.
  const preCoverage = computeCoverage(preDates, dayDocs, windows.lastCompleted);
  const postCoverage = computeCoverage(postDates, dayDocs, windows.lastCompleted);
  const preAvailable = new Set(preCoverage.availableDays);
  const postAvailable = new Set(postCoverage.availableDays);
  const preRows = windowedRows.filter((row) => preAvailable.has(String(row.date || "")));
  const postRows = windowedRows.filter((row) => postAvailable.has(String(row.date || "")));

  const preMetrics = aggregateRows(preRows);
  const postMetrics = aggregateRows(postRows);
  const deltasUsable = preCoverage.availableCount >= effectiveConfig.minWindowDays
    && postCoverage.availableCount >= effectiveConfig.minWindowDays;
  const deltas = deltasUsable
    ? computeDeltas(preMetrics, postMetrics)
    : withheldDeltas(preCoverage, postCoverage, effectiveConfig);
  const querySummary = computeQuerySummary(preRows, postRows, effectiveConfig);
  const countrySummary = computeDimensionSummary(preRows, postRows, "country", effectiveConfig);
  const deviceSummary = computeDimensionSummary(preRows, postRows, "device", effectiveConfig);
  const confounding = detectOverlappingChanges(event, otherEvents, effectiveConfig);
  const evidence = computeEvidenceState({
    preCoverage: { ...preCoverage, end: windows.pre.end },
    postCoverage: { ...postCoverage, end: windows.post.end },
    postFullyElapsed: windows.postFullyElapsed,
    confounding,
    deltas,
    config: effectiveConfig
  });

  const availableThrough = postCoverage.availableDays.length
    ? postCoverage.availableDays[postCoverage.availableDays.length - 1]
    : null;

  return {
    schemaVersion: SCHEMA_VERSION,
    outcomeId: `oc_${String(event.eventId || "")}`,
    eventId: String(event.eventId || ""),
    eventKind: String(event.kind || "applied"),
    eventAt: String(event.at || ""),
    changeAt: String(event.at || ""),
    changeDate: windows.changeDate,
    contentId: String(event.contentId || ""),
    collection: String(event.collection || ""),
    contentType: String(event.contentType || ""),
    pageUrl: String(event.pageUrl || ""),
    gscJoinKey: joinKey,
    field: String(event.field || ""),
    fieldGroup: String(event.fieldGroup || "other"),
    oldValue: event.oldValue || { kind: "inline", value: null },
    newValue: event.newValue || { kind: "inline", value: null },
    proposalId: event.proposalId || null,
    source: String(event.source || ""),
    lifecycle: event.lifecycle || null,
    lifecycleEligibleForOptimization: Boolean(event.eligibleForAutomaticOptimization),
    windowConfig: {
      windowDays: effectiveConfig.windowDays,
      finalityOffsetDays: effectiveConfig.finalityOffsetDays,
      minWindowDays: effectiveConfig.minWindowDays
    },
    preWindow: { start: windows.pre.start, end: windows.pre.end, expectedDays: preDates.length },
    postWindow: { start: windows.post.start, end: windows.post.end, expectedDays: postDates.length },
    dataCoverage: {
      pre: preCoverage,
      post: postCoverage,
      availableThrough,
      expectedThrough: windows.expectedThrough,
      lastCompletedDate: windows.lastCompleted,
      note: "available = collected final GSC day (zero-rows days are real zeros); missing = no collected day doc; notYetAvailable = after the final GSC date. Missing days are NEVER treated as zero performance."
    },
    preMetrics,
    postMetrics,
    deltas,
    querySummary,
    countrySummary,
    deviceSummary,
    ...confounding,
    ...evidence,
    // Measurement metadata is added by persistOutcome (measuredAt/revisions).
  };
}

// ─── Data access (real Firestore; injectable for tests) ─────────────

function createDefaultLoaders(db) {
  return {
    async loadDayDocs(startDate, endDate) {
      const snap = await db.collection(GSC_DAILY_COLLECTION)
        .where("date", ">=", startDate)
        .where("date", "<=", endDate)
        .get();
      return (snap.docs || []).map((docSnap) => docSnap.data());
    },
    async loadPageRows(gscJoinKey) {
      const snap = await db.collectionGroup(GSC_ROWS_COLLECTION)
        .where("normalizedPageUrl", "==", gscJoinKey)
        .get();
      return (snap.docs || []).map((docSnap) => docSnap.data());
    },
    async loadPageEvents(gscJoinKey) {
      const snap = await db.collection(EVENTS_COLLECTION)
        .where("gscJoinKey", "==", gscJoinKey)
        .get();
      return (snap.docs || []).map((docSnap) => docSnap.data());
    },
    async loadRecentEvents(max) {
      const snap = await db.collection(EVENTS_COLLECTION)
        .orderBy("at", "desc")
        .limit(max)
        .get();
      return (snap.docs || []).map((docSnap) => docSnap.data());
    },
    async loadEvent(eventId) {
      const snap = await db.collection(EVENTS_COLLECTION).doc(String(eventId)).get();
      return snap && snap.exists ? snap.data() : null;
    },
    async loadOutcome(outcomeId) {
      const snap = await db.collection(OUTCOMES_COLLECTION).doc(String(outcomeId)).get();
      return snap && snap.exists ? snap.data() : null;
    }
  };
}

// ─── Persistence (idempotent, revision-preserving) ──────────────────

/**
 * Deterministic outcome ids: one outcome per event (`oc_<eventId>`), so
 * re-measuring the same event never creates a duplicate document.
 * Recalculation model: if the measurement changed (late GSC data, finalized
 * windows), the SAME document is updated and the previous measurement is
 * preserved in a bounded `revisions` list (last 10). Identical recalculations
 * are no-ops. Raw GSC rows and the original change event are never touched.
 */
async function persistOutcome(db, outcome, { dryRun = false } = {}) {
  if (!db || dryRun) {
    return { written: false, reason: dryRun ? "dry-run" : "no-db", outcome };
  }
  const outcomeId = outcome.outcomeId;
  const hash = measurementHash(outcome);
  const existing = await db.collection(OUTCOMES_COLLECTION).doc(outcomeId).get();
  const exists = existing && existing.exists;
  const nowIso = new Date().toISOString();

  if (exists) {
    const previous = existing.data();
    if (previous && previous.measurementHash === hash) {
      return { written: false, reason: "idempotent-skip", outcomeId, evidenceState: outcome.evidenceState };
    }
    const revisions = Array.isArray(previous.revisions) ? previous.revisions : [];
    const revisionEntry = {
      measuredAt: previous.measuredAt || null,
      evidenceState: previous.evidenceState || null,
      availableThrough: previous.availableThrough != null ? previous.availableThrough
        : (previous.dataCoverage && previous.dataCoverage.availableThrough) || null,
      measurementHash: previous.measurementHash || null
    };
    await db.collection(OUTCOMES_COLLECTION).doc(outcomeId).set({
      ...outcome,
      measurementHash: hash,
      firstMeasuredAt: previous.firstMeasuredAt || revisionEntry.measuredAt || nowIso,
      measuredAt: nowIso,
      revisionCount: (Number(previous.revisionCount) || 0) + 1,
      revisions: [...revisions.slice(-9), revisionEntry]
    }, { merge: false });
    return { written: true, reason: "revised", outcomeId, evidenceState: outcome.evidenceState };
  }

  await db.collection(OUTCOMES_COLLECTION).doc(outcomeId).set({
    ...outcome,
    measurementHash: hash,
    firstMeasuredAt: nowIso,
    measuredAt: nowIso,
    revisionCount: 0,
    revisions: []
  }, { merge: false });
  return { written: true, reason: "created", outcomeId, evidenceState: outcome.evidenceState };
}

/** Measure ONE change event end-to-end (load → compute → persist). */
async function measureEvent(db, event, { deps = {}, now = new Date(), config = DEFAULT_CONFIG, dryRun = false } = {}) {
  const loaders = { ...createDefaultLoaders(db), ...deps };
  if (!event || !event.gscJoinKey) {
    return { measured: false, reason: "no-gsc-join-key" };
  }
  const windows = computeWindows(event.at, now, config);
  const [dayDocs, pageRows, pageEvents] = await Promise.all([
    loaders.loadDayDocs(windows.pre.start, windows.post.end),
    loaders.loadPageRows(event.gscJoinKey),
    loaders.loadPageEvents(event.gscJoinKey)
  ]);
  const outcome = computeOutcome({ event, dayDocs, pageRows, otherEvents: pageEvents, now, config });
  const persisted = await persistOutcome(db, outcome, { dryRun });
  return { measured: true, outcome, persisted, evidenceState: outcome.evidenceState };
}

// ─── Runner ─────────────────────────────────────────────────────────

async function persistRunnerStatus(db, FieldValue, patch, options = {}) {
  if (!db || options.dryRun) return;
  await db.collection(SETTINGS).doc(SEO_SETTINGS_DOC).set({
    outcomeRunner: {
      runner: RUNNER_NAME,
      lastRunAt: new Date().toISOString(),
      ...patch
    },
    updatedAt: FieldValue ? FieldValue.serverTimestamp() : null
  }, { merge: true });
}

/**
 * Outcome meter runner. Modes:
 *   recent (default) — measure recent change events that have no outcome yet,
 *                      plus outcomes still awaiting complete GSC windows
 *   event             — measure one event (--event-id)
 *   recalc            — force re-measure the most recent outcomes (idempotent:
 *                      unchanged measurements are no-ops)
 *
 * The automation kill-switch (features.seo_outcomes, default enabled,
 * fail-open) is honored. This runner writes ONLY to seo_change_outcomes and
 * system_settings/seo_intelligence — never content, proposals, GSC rows, or
 * the Phase 2 event ledger.
 */
async function runOutcomeMeter({ db, FieldValue = null, args = {}, deps = {} }) {
  const started = Date.now();
  const now = deps.now || new Date();
  const config = { ...DEFAULT_CONFIG, ...(args.config || {}) };
  const loaders = { ...createDefaultLoaders(db), ...deps };
  const mode = ["recent", "event", "recalc"].includes(args.mode) ? args.mode : "recent";
  const dryRun = Boolean(args.dryRun);
  const maxEvents = Math.max(1, Math.min(
    MAX_EVENTS_PER_RUN_HARD,
    Number(args.maxEvents != null ? args.maxEvents : MAX_EVENTS_PER_RUN_DEFAULT)
  ));

  // Automation kill-switch (fail-open — measurement never blocks on guard errors).
  let guard = { enabled: true, reason: null };
  try {
    guard = await (deps.isAutomationEnabled || isAutomationEnabled)(db, "seo_outcomes");
  } catch (guardError) {
    console.warn("[outcome-meter] automation guard check failed (continuing):", guardError && guardError.message);
  }
  if (!guard.enabled) {
    if (db && !dryRun) {
      await persistRunnerStatus(db, FieldValue, { lastStatus: "skipped", skipReason: guard.reason, lastError: null }, { dryRun });
    }
    console.log(`[outcome-meter] ⏸️ Skipped: ${guard.reason}`);
    return { ok: true, skippedRun: true, reason: guard.reason, runner: RUNNER_NAME, mode, durationMs: Date.now() - started, dryRun };
  }

  let candidates = [];
  const skipped = [];
  if (mode === "event") {
    const event = args.eventId ? await loaders.loadEvent(args.eventId) : null;
    if (!event) {
      throw new Error(`Change event not found: ${args.eventId}`);
    }
    candidates = [event];
  } else if (mode === "recalc") {
    const recent = await loaders.loadRecentEvents(Math.max(maxEvents, MAX_EVENTS_PER_RUN_DEFAULT));
    candidates = recent.filter((event) => event && event.gscJoinKey);
    for (const event of recent.filter((item) => item && !item.gscJoinKey)) {
      skipped.push({ eventId: event.eventId, reason: "no-gsc-join-key" });
    }
  } else {
    const scan = Math.max(maxEvents * 4, 100);
    const recent = await loaders.loadRecentEvents(scan);
    const lastCompleted = lastCompletedDate(now, config.finalityOffsetDays);
    for (const event of recent) {
      if (!event) continue;
      if (!event.gscJoinKey) {
        skipped.push({ eventId: event.eventId, reason: "no-gsc-join-key" });
        continue;
      }
      const existing = await loaders.loadOutcome(`oc_${event.eventId}`);
      if (!existing) {
        candidates.push(event);
        continue;
      }
      // Re-measure outcomes that are still incomplete or whose available GSC
      // data has advanced since the last measurement (target = min of the
      // expected window end and the last finalized GSC date — a fully
      // elapsed outcome with complete data is NOT re-measured daily).
      const coverage = (existing.dataCoverage || {});
      const expectedThrough = String(coverage.expectedThrough || "");
      const targetThrough = expectedThrough && expectedThrough < lastCompleted ? expectedThrough : lastCompleted;
      const availableThrough = String(coverage.availableThrough || "");
      const incomplete = existing.evidenceState === "incomplete_data"
        || availableThrough < targetThrough;
      if (incomplete && candidates.length < maxEvents * 2) {
        candidates.push(event);
      }
      if (candidates.length >= maxEvents) break;
    }
  }

  candidates = candidates.slice(0, maxEvents);

  const results = [];
  let created = 0;
  let revised = 0;
  let unchanged = 0;
  let errorCount = 0;

  for (const event of candidates) {
    try {
      const measured = await measureEvent(db, event, { deps: loaders, now, config, dryRun });
      if (!measured.measured) {
        skipped.push({ eventId: event.eventId, reason: measured.reason });
        continue;
      }
      if (measured.persisted.reason === "created") created += 1;
      else if (measured.persisted.reason === "revised") revised += 1;
      else unchanged += 1;
      results.push({
        eventId: event.eventId,
        outcomeId: measured.persisted.outcomeId || measured.outcome.outcomeId,
        evidenceState: measured.evidenceState,
        action: measured.persisted.reason
      });
    } catch (error) {
      errorCount += 1;
      results.push({ eventId: event.eventId, error: String(error && error.message || error) });
    }
  }

  const lastStatus = errorCount === 0 ? "success" : errorCount === candidates.length && candidates.length > 0 ? "error" : "partial";
  if (db && !dryRun) {
    await persistRunnerStatus(db, FieldValue, {
      lastStatus,
      mode,
      measured: candidates.length,
      created,
      revised,
      unchanged,
      skipped: skipped.length,
      lastError: errorCount ? results.find((item) => item.error)?.error : null
    }, { dryRun });
  }

  return {
    ok: errorCount === 0,
    runner: RUNNER_NAME,
    mode,
    measured: candidates.length,
    created,
    revised,
    unchanged,
    skipped,
    results,
    lastStatus,
    durationMs: Date.now() - started,
    dryRun
  };
}

module.exports = {
  OUTCOMES_COLLECTION,
  EVENTS_COLLECTION,
  GSC_DAILY_COLLECTION,
  RUNNER_NAME,
  SCHEMA_VERSION,
  DEFAULT_CONFIG,
  NO_CHANGE_THRESHOLDS,
  MAX_EVENTS_PER_RUN_DEFAULT,
  computeWindows,
  computeCoverage,
  aggregateRows,
  computeDeltas,
  computeQuerySummary,
  computeDimensionSummary,
  detectOverlappingChanges,
  computeEvidenceState,
  computeOutcome,
  measurementHash,
  persistOutcome,
  measureEvent,
  runOutcomeMeter,
  createDefaultLoaders,
  lastCompletedDate,
  addDays,
  dateDiffDays,
  dateRange
};
