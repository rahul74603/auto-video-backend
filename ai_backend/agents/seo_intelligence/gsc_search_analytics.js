"use strict";

/**
 * Google Search Console Search Analytics collector — Phase 1 (measurement ONLY).
 *
 * Fetches DATED, RAW Search Analytics rows (clicks, impressions, ctr, position)
 * from the real Search Analytics API and stores them as per-date snapshots so
 * later phases can build evidence on actual Google search performance.
 *
 * What this module deliberately does NOT do:
 *   - no "SEO score" derivation (raw Google values are stored exactly)
 *   - no writes to public content collections
 *   - no imports of optimizer / apply-engine / learner logic
 *   - no synthetic rows — zero rows from Google are recorded as zero rows
 *
 * Credentials: the SAME service account already used by the URL Inspection /
 * sitemap agent (SERVICE_ACCOUNT_JSON secret, raw or base64 JSON) — no second
 * credential system. Scope is webmasters.readonly (read-only measurement).
 *
 * Firestore layout (new, additive — Phase 1 measurement storage):
 *   gsc_search_analytics_daily/{YYYY-MM-DD}                 day doc (status + metadata)
 *   gsc_search_analytics_daily/{YYYY-MM-DD}/rows/{rowId}    raw row (deterministic id)
 *   system_settings/seo_search_console.searchAnalyticsRunner runner status (merge)
 *
 * Idempotency: row ids are a deterministic hash of (rawPageUrl, query, country,
 * device) under the date's path, so a rerun for the same date overwrites the
 * same rows with the same values instead of duplicating. Rows are never
 * deleted — superseded rows are kept and counted for audit.
 */

const crypto = require("crypto");
const { google } = require("googleapis");
const { isAutomationEnabled } = require("../automation_guard");

const COLLECTION = "gsc_search_analytics_daily";
const SETTINGS = "system_settings";
const GSC_SETTINGS_DOC = "seo_search_console";
const SOURCE = "google-search-console";
const RUNNER_NAME = "gsc-search-analytics-ingest";
const READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const DEFAULT_SITE_URL = "sc-domain:studygyaan.in";
const DEFAULT_DIMENSIONS = ["date", "page", "query", "country", "device"];
const DEFAULT_DATA_STATE = "final"; // finalized data only — GSC latency preserved honestly
const DEFAULT_LOOKBACK_DAYS = 3;    // daily job refreshes a small recent window
const DEFAULT_END_OFFSET_DAYS = 2;  // only collect dates >= 2 days old (GSC finalization latency)
const MAX_ROW_LIMIT = 25000;        // Search Analytics API hard cap per request
const MAX_PAGES_PER_DAY = 4;        // 4 × 25k = 100k rows/day safety cap
const MAX_DAYS_PER_RUN_HARD = 31;   // backfill hard cap per run
const DEFAULT_MAX_DAYS_PER_RUN = 7; // backfill default cap per run
const DEFAULT_MAX_API_CALLS = 100;  // per-run API budget (rate-limit aware)
const MIN_DELAY_MS = 100;
const DEFAULT_DELAY_MS = 300;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─── Credentials (same architecture as the indexing agent) ──────────

function parseServiceAccount(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  try {
    return JSON.parse(value);
  } catch (firstError) {
    try {
      return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    } catch {
      throw new Error(`Service account JSON is invalid: ${firstError.message}`);
    }
  }
}

function createReadOnlyGoogleAuth(credentials) {
  if (!credentials) return null;
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [READONLY_SCOPE]
  });
}

// ─── API client (injectable for tests) ──────────────────────────────

/** Real Search Analytics query via googleapis (webmasters v3 surface). */
async function querySearchAnalytics({ auth, siteUrl, requestBody }) {
  const service = google.webmasters({ version: "v3", auth });
  const response = await service.searchanalytics.query({ siteUrl, requestBody });
  return response.data || {};
}

function scrubSecrets(value) {
  return String(value || "")
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key|token|secret)["'`\s:=]+[\w.-]+/gi, "$1 [redacted]")
    .slice(0, 500);
}

function classifyApiError(error) {
  const status = Number((error && (error.code ?? error.status)) || 0);
  const message = scrubSecrets(error && error.message ? error.message : error);
  if (status === 401 || status === 403) return { errorType: "permission", message };
  if (status === 429) return { errorType: "rate-limit", message };
  if (status === 400 && /permission|authorized|forbidden|oauth/i.test(message)) {
    return { errorType: "permission", message };
  }
  return { errorType: "api", message };
}

// ─── URL normalization ──────────────────────────────────────────────

/**
 * Conservative normalization for future page matching:
 *   - lowercase scheme+hostname (DNS is case-insensitive)
 *   - strip fragment (#...) — never identifies a different resource
 *   - strip default ports, collapse trailing slashes on the path
 *   - QUERY STRING IS PRESERVED — different query strings are NOT merged
 * The original Google URL is always kept verbatim in rawPageUrl.
 */
function normalizeGscPageUrl(rawUrl) {
  const raw = String(rawUrl == null ? "" : rawUrl);
  let normalized = "";
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    normalized = url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    // Unparsable value — keep it distinct rather than merging into something else.
    normalized = raw.trim();
  }
  return { rawPageUrl: raw, normalizedPageUrl: normalized };
}

/** Deterministic row id — same inputs always map to the same doc under a date. */
function buildGscRowId({ rawPageUrl, query, country, device }) {
  const basis = JSON.stringify([
    String(rawPageUrl == null ? "" : rawPageUrl),
    String(query == null ? "" : query),
    String(country == null ? "" : country),
    String(device == null ? "" : device)
  ]);
  return crypto.createHash("sha256").update(basis, "utf8").digest("hex").slice(0, 40);
}

// ─── Row extraction (raw values preserved exactly) ──────────────────

function rowFromApi(row, dimensions) {
  const keys = Array.isArray(row && row.keys) ? row.keys : [];
  const values = {};
  dimensions.forEach((dimension, index) => {
    values[dimension] = keys[index] == null ? "" : String(keys[index]);
  });
  return {
    date: values.date || null,
    page: values.page || "",
    query: values.query || "",
    country: values.country || "",
    device: values.device || "",
    // Google's numbers are stored EXACTLY as returned (no rounding, no rescaling).
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0)
  };
}

// ─── Date window helpers (UTC dates, explicit boundaries) ───────────

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isValidIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && isoDate(parsed) === value;
}

/**
 * Daily rolling window. endDate = now − endOffsetDays (GSC finalization
 * latency), startDate = endDate − (lookbackDays − 1). All dates are UTC.
 */
function computeDailyWindow(now = new Date(), lookbackDays = DEFAULT_LOOKBACK_DAYS, endOffsetDays = DEFAULT_END_OFFSET_DAYS) {
  const end = new Date(now.getTime());
  end.setUTCDate(end.getUTCDate() - endOffsetDays);
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - (lookbackDays - 1));
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

/**
 * Expand a window into chronological UTC dates, capped at maxDays.
 * Returns { dates, daysRemaining } so a bounded backfill can resume later.
 */
function expandWindow(startDate, endDate, maxDays = DEFAULT_MAX_DAYS_PER_RUN) {
  if (!isValidIsoDate(startDate)) throw new Error(`Invalid startDate (expected YYYY-MM-DD): ${startDate}`);
  if (!isValidIsoDate(endDate)) throw new Error(`Invalid endDate (expected YYYY-MM-DD): ${endDate}`);
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (start > end) throw new Error(`startDate (${startDate}) must not be after endDate (${endDate})`);
  const cap = Math.min(Math.max(1, maxDays), MAX_DAYS_PER_RUN_HARD);
  const totalDays = Math.round((end - start) / 86400000) + 1;
  const take = Math.min(totalDays, cap);
  const dates = [];
  for (let index = 0; index < take; index += 1) {
    dates.push(isoDate(new Date(start + index * 86400000)));
  }
  return { dates, daysRemaining: Math.max(0, totalDays - take) };
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

// ─── Per-day collection ─────────────────────────────────────────────

async function fetchDayRows(queryFn, { siteUrl, date, dimensions, dataState }) {
  const rows = [];
  let apiCalls = 0;
  let startRow = 0;
  while (apiCalls < MAX_PAGES_PER_DAY) {
    const requestBody = {
      startDate: date,
      endDate: date,
      dimensions,
      dataState,
      rowLimit: MAX_ROW_LIMIT,
      startRow
    };
    const data = await queryFn({ siteUrl, requestBody });
    apiCalls += 1;
    const batch = Array.isArray(data && data.rows) ? data.rows : [];
    rows.push(...batch);
    if (batch.length < MAX_ROW_LIMIT) {
      return { rows, apiCalls, truncated: false };
    }
    startRow += MAX_ROW_LIMIT;
  }
  return { rows, apiCalls, truncated: true };
}

async function readDayDoc(db, date) {
  try {
    const snap = await db.collection(COLLECTION).doc(date).get();
    return snap && snap.exists ? snap.data() : null;
  } catch {
    return null;
  }
}

/** Write row docs using Firestore batches when available (≤450 ops/batch), else sequential sets. */
async function writeRowDocs(db, date, rowDocs) {
  const rowsRef = db.collection(COLLECTION).doc(date).collection("rows");
  if (typeof db.batch === "function") {
    for (let offset = 0; offset < rowDocs.length; offset += 450) {
      const chunk = rowDocs.slice(offset, offset + 450);
      const batch = db.batch();
      for (const { id, data } of chunk) batch.set(rowsRef.doc(id), data);
      await batch.commit();
    }
    return;
  }
  for (const { id, data } of rowDocs) {
    await rowsRef.doc(id).set(data);
  }
}

/**
 * Collect ONE date. Explicitly records the requested window (the single date),
 * collection timestamp, property, dimensions and dataState. Zero rows from a
 * successful API call are recorded as an honest zero-row snapshot — that is
 * valid data, NOT an error. Errors never wipe previously collected rows.
 */
async function collectDay({ db, date, siteUrl, dimensions, dataState, queryFn, now = new Date(), dryRun = false }) {
  const startedAt = Date.now();
  const existing = db ? await readDayDoc(db, date) : null;
  const priorStatus = existing && typeof existing.status === "string" ? existing.status : null;
  const priorRowCount = existing && Number.isFinite(existing.rowCount) ? Number(existing.rowCount) : 0;
  const priorAggregates = existing && existing.aggregates ? existing.aggregates : null;
  const priorFirstCollectedAt = existing && existing.firstCollectedAt ? existing.firstCollectedAt : null;
  const priorRunCount = existing && Number.isFinite(existing.runCount) ? Number(existing.runCount) : 0;

  let fetched;
  try {
    fetched = await fetchDayRows(queryFn, { siteUrl, date, dimensions, dataState });
  } catch (error) {
    const classified = classifyApiError(error);
    const result = {
      date,
      status: "error",
      errorType: classified.errorType,
      error: classified.message,
      apiCalls: 0,
      rowCount: priorRowCount,
      dryRun
    };
    if (db && !dryRun) {
      await persistDayDoc(db, date, {
        siteUrl, dimensions, dataState,
        status: priorStatus === "success" || priorStatus === "zero-rows" ? priorStatus : "error",
        rowCount: priorRowCount,
        aggregates: priorAggregates,
        supersededRows: 0,
        keepNote: priorStatus ? "previous collection kept — this attempt failed" : null,
        firstCollectedAt: priorFirstCollectedAt,
        runCount: priorRunCount + 1,
        lastRun: {
          at: now.toISOString(),
          requestedWindow: { startDate: date, endDate: date },
          siteUrl, dimensions, dataState,
          status: "error",
          errorType: classified.errorType,
          error: classified.message,
          apiCalls: 0,
          rowsFetched: 0,
          durationMs: Date.now() - startedAt,
          truncated: false
        }
      });
    }
    return result;
  }

  const apiRows = fetched.rows;
  const rowDocsMap = new Map();
  for (const apiRow of apiRows) {
    const parsed = rowFromApi(apiRow, dimensions);
    const rowDate = parsed.date || date; // requested date is the source of truth
    const { rawPageUrl, normalizedPageUrl } = normalizeGscPageUrl(parsed.page);
    const id = buildGscRowId({ rawPageUrl, query: parsed.query, country: parsed.country, device: parsed.device });
    rowDocsMap.set(id, {
      id,
      data: {
        date: rowDate,
        rawPageUrl,
        normalizedPageUrl,
        query: parsed.query,
        country: parsed.country,
        device: parsed.device,
        clicks: parsed.clicks,
        impressions: parsed.impressions,
        ctr: parsed.ctr,
        position: parsed.position,
        source: SOURCE,
        collectedAt: now.toISOString()
      }
    });
  }
  const rowDocs = [...rowDocsMap.values()];

  // Derived sums over the collected raw rows (clearly labeled as derived; the
  // raw rows above are the evidence, these are convenience aggregates).
  let clicks = 0;
  let impressions = 0;
  let positionImpressionSum = 0;
  const pages = new Set();
  const queries = new Set();
  for (const { data } of rowDocs) {
    clicks += data.clicks;
    impressions += data.impressions;
    positionImpressionSum += data.position * data.impressions;
    if (data.normalizedPageUrl) pages.add(data.normalizedPageUrl);
    if (data.query) queries.add(data.query);
  }

  const status = rowDocs.length ? "success" : "zero-rows";
  const supersededRows = priorRowCount > rowDocs.length ? priorRowCount - rowDocs.length : 0;

  if (db && !dryRun) {
    await persistDayDoc(db, date, {
      siteUrl, dimensions, dataState,
      status,
      rowCount: rowDocs.length,
      aggregates: rowDocs.length
        ? { clicks, impressions, positionImpressionSum, pages: pages.size, queries: queries.size }
        : null,
      supersededRows,
      keepNote: null,
      firstCollectedAt: priorFirstCollectedAt || now.toISOString(),
      runCount: priorRunCount + 1,
      lastRun: {
        at: now.toISOString(),
        requestedWindow: { startDate: date, endDate: date },
        siteUrl, dimensions, dataState,
        status,
        errorType: null,
        error: null,
        apiCalls: fetched.apiCalls,
        rowsFetched: apiRows.length,
        durationMs: Date.now() - startedAt,
        truncated: fetched.truncated
      }
    });
    if (rowDocs.length) {
      await writeRowDocs(db, date, rowDocs);
    }
  }

  return {
    date,
    status,
    rowCount: rowDocs.length,
    apiCalls: fetched.apiCalls,
    truncated: fetched.truncated,
    rowsFetched: apiRows.length,
    supersededRows,
    dryRun
  };
}

async function persistDayDoc(db, date, fields) {
  await db.collection(COLLECTION).doc(date).set({
    date,
    source: SOURCE,
    ...fields
  }, { merge: false });
}

// ─── Runner (daily / backfill / probe) ──────────────────────────────

async function persistRunnerStatus(db, FieldValue, patch, options = {}) {
  if (!db || options.dryRun) return;
  const nowIso = new Date().toISOString();
  await db.collection(SETTINGS).doc(GSC_SETTINGS_DOC).set({
    searchAnalyticsRunner: {
      runner: RUNNER_NAME,
      lastRunAt: nowIso,
      ...patch
    },
    updatedAt: FieldValue ? FieldValue.serverTimestamp() : null
  }, { merge: true });
}

/** Read-only access probe: one tiny query, NO Firestore writes at all. */
async function probeSearchAnalyticsAccess({ queryFn, siteUrl, now = new Date() }) {
  const probeDate = new Date(now.getTime());
  probeDate.setUTCDate(probeDate.getUTCDate() - 10);
  const date = isoDate(probeDate);
  try {
    const data = await queryFn({
      siteUrl,
      requestBody: {
        startDate: date,
        endDate: date,
        dimensions: ["date"],
        dataState: DEFAULT_DATA_STATE,
        rowLimit: 1,
        startRow: 0
      }
    });
    const rows = Array.isArray(data && data.rows) ? data.rows.length : 0;
    return { ok: true, accessVerified: true, probeDate: date, rowsReturned: rows, message: `Search Analytics query succeeded for ${siteUrl} (probe returned ${rows} row(s)).` };
  } catch (error) {
    const classified = classifyApiError(error);
    return {
      ok: false,
      accessVerified: false,
      probeDate: date,
      errorType: classified.errorType,
      message: classified.message
    };
  }
}

/**
 * Main runner. Modes:
 *   daily     — collect the recent rolling window (default 3 days ending 2 days ago)
 *   backfill  — collect an explicit bounded window; already-successful dates are
 *               skipped (resumable) unless force=true
 *   probe     — read-only access verification, no writes
 *
 * The automation kill-switch (system_settings/automation → features.gsc_ingest,
 * default enabled, fail-open) is honored for daily/backfill. This runner NEVER
 * writes content collections and NEVER triggers optimization.
 */
async function runGscIngestRunner({ db, FieldValue = null, args = {}, deps = {} }) {
  const started = Date.now();
  const now = deps.now || new Date();
  const queryFn = deps.querySearchAnalytics || querySearchAnalytics;
  const getGuard = deps.isAutomationEnabled || isAutomationEnabled;
  const siteUrl = String(args.siteUrl || deps.siteUrl || DEFAULT_SITE_URL);
  const dimensions = Array.isArray(args.dimensions) && args.dimensions.length ? args.dimensions : DEFAULT_DIMENSIONS;
  const dataState = args.dataState || DEFAULT_DATA_STATE;
  const mode = ["daily", "backfill", "probe"].includes(args.mode) ? args.mode : "daily";
  const dryRun = Boolean(args.dryRun);
  const delayMs = Math.max(MIN_DELAY_MS, Number(args.delayMs != null ? args.delayMs : DEFAULT_DELAY_MS));
  const maxApiCalls = Math.max(1, Math.min(500, Number(args.maxApiCalls != null ? args.maxApiCalls : DEFAULT_MAX_API_CALLS)));

  if (mode === "probe") {
    const probe = await probeSearchAnalyticsAccess({ queryFn, siteUrl, now });
    return {
      ok: probe.ok,
      runner: RUNNER_NAME,
      mode,
      siteUrl,
      ...probe,
      durationMs: Date.now() - started,
      dryRun
    };
  }

  // Automation kill-switch (fail-open: a guard crash never blocks measurement).
  let guard = { enabled: true, reason: null };
  try {
    guard = await getGuard(db, "gsc_ingest");
  } catch (guardError) {
    console.warn("[gsc-ingest] automation guard check failed (continuing):", guardError && guardError.message);
  }
  if (!guard.enabled) {
    if (db && !dryRun) {
      await persistRunnerStatus(db, FieldValue, { lastStatus: "skipped", mode, skipReason: guard.reason, lastError: null });
    }
    console.log(`[gsc-ingest] ⏸️ Skipped: ${guard.reason}`);
    return { ok: true, skipped: true, reason: guard.reason, runner: RUNNER_NAME, mode, durationMs: Date.now() - started, dryRun };
  }

  const maxDaysPerRun = Math.max(1, Math.min(
    MAX_DAYS_PER_RUN_HARD,
    Number(args.maxDaysPerRun != null ? args.maxDaysPerRun : DEFAULT_MAX_DAYS_PER_RUN)
  ));

  let window;
  let dates;
  if (mode === "backfill") {
    window = { startDate: args.startDate, endDate: args.endDate };
    // Expand the whole window (hard cap 31). Already-collected dates are skipped
    // WITHOUT consuming the per-run budget, so reruns resume where they stopped.
    const expanded = expandWindow(args.startDate, args.endDate, MAX_DAYS_PER_RUN_HARD);
    dates = expanded.dates;
    if (expanded.daysRemaining > 0) {
      throw new Error(
        `Backfill window is too large (${expanded.daysRemaining + dates.length} days) — ` +
        `split it into windows of at most ${MAX_DAYS_PER_RUN_HARD} days`
      );
    }
  } else {
    window = computeDailyWindow(now, args.lookbackDays, args.endOffsetDays);
    const expanded = expandWindow(window.startDate, window.endDate, MAX_DAYS_PER_RUN_HARD);
    dates = expanded.dates;
  }

  const dayResults = [];
  let rowsCollected = 0;
  let apiCallsUsed = 0;
  let errorDays = 0;
  let newDaysProcessed = 0;
  // Daily mode refreshes its small window unconditionally; backfill is capped
  // at maxDaysPerRun NEW days per run (skipped days never consume the cap).
  const dayBudget = mode === "backfill" ? maxDaysPerRun : MAX_DAYS_PER_RUN_HARD;

  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index];

    // Resumable backfill: skip dates that already have collected data.
    if (mode === "backfill" && !args.force) {
      const existing = db ? await readDayDoc(db, date) : null;
      if (existing && existing.status === "success") {
        dayResults.push({ date, status: "skipped-already-collected", rowCount: Number(existing.rowCount || 0), apiCalls: 0 });
        continue;
      }
    }

    if (newDaysProcessed >= dayBudget) {
      dayResults.push({ date, status: "skipped-run-budget", apiCalls: 0 });
      continue;
    }

    if (apiCallsUsed >= maxApiCalls) {
      dayResults.push({ date, status: "skipped-api-budget", apiCalls: 0 });
      continue;
    }

    if (index > 0) await sleep(delayMs);

    const result = await collectDay({ db, date, siteUrl, dimensions, dataState, queryFn, now, dryRun });
    apiCallsUsed += result.apiCalls || 0;
    rowsCollected += result.rowCount || 0;
    if (result.status === "error") errorDays += 1;
    newDaysProcessed += 1;
    dayResults.push(result);
  }

  // Days still without collected data (errors + budget-skipped) — rerun resumes these.
  const collectedDates = new Set(
    dayResults
      .filter((d) => d.status === "success" || d.status === "zero-rows" || d.status === "skipped-already-collected")
      .map((d) => d.date)
  );
  const daysRemaining = dayResults.filter((d) => !collectedDates.has(d.date)).length;
  const capNote = mode === "backfill" && dayResults.some((d) => d.status === "skipped-run-budget")
    ? `capped at ${dayBudget} new day(s) per run — ${daysRemaining} day(s) remain; rerun to resume`
    : null;

  const lastStatus = errorDays === 0
    ? (dayResults.some((d) => d.status === "skipped-api-budget" || d.status === "skipped-run-budget") ? "partial" : "success")
    : errorDays === newDaysProcessed ? "error" : "partial";
  const firstError = dayResults.find((d) => d.status === "error");

  if (db && !dryRun) {
    await persistRunnerStatus(db, FieldValue, {
      lastStatus,
      mode,
      window,
      daysProcessed: dayResults.filter((d) => ["success", "zero-rows", "error"].includes(d.status)).length,
      daysRemaining,
      rowsCollected,
      apiCalls: apiCallsUsed,
      dimensions,
      dataState,
      siteUrl,
      lastError: firstError ? { type: firstError.errorType, message: firstError.error } : null
    });
  }

  return {
    ok: errorDays === 0,
    runner: RUNNER_NAME,
    mode,
    siteUrl,
    window,
    dimensions,
    dataState,
    days: dayResults,
    rowsCollected,
    apiCalls: apiCallsUsed,
    daysRemaining,
    capNote,
    lastStatus,
    durationMs: Date.now() - started,
    dryRun
  };
}

module.exports = {
  COLLECTION,
  SOURCE,
  RUNNER_NAME,
  DEFAULT_SITE_URL,
  DEFAULT_DIMENSIONS,
  DEFAULT_DATA_STATE,
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_END_OFFSET_DAYS,
  DEFAULT_MAX_DAYS_PER_RUN,
  READONLY_SCOPE,
  MAX_DAYS_PER_RUN_HARD,
  parseServiceAccount,
  createReadOnlyGoogleAuth,
  querySearchAnalytics,
  probeSearchAnalyticsAccess,
  normalizeGscPageUrl,
  buildGscRowId,
  rowFromApi,
  classifyApiError,
  scrubSecrets,
  computeDailyWindow,
  expandWindow,
  isValidIsoDate,
  collectDay,
  runGscIngestRunner,
  persistRunnerStatus
};
