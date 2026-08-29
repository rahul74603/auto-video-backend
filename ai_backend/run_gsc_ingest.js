"use strict";

/**
 * GSC Search Analytics ingest entry point (Phase 1 — measurement only).
 *
 * Modes:
 *   node run_gsc_ingest.js --mode=daily
 *       Collect the recent rolling window (default: 3 days ending 2 days ago,
 *       dataState=final). Safe to run repeatedly — rows are deterministic.
 *   node run_gsc_ingest.js --mode=backfill --start-date=2026-08-01 --end-date=2026-08-20
 *       Bounded, resumable historical backfill (default max 7 days per run;
 *       already-collected dates are skipped). Rerun to continue.
 *   node run_gsc_ingest.js --mode=probe
 *       Read-only access verification — one tiny query, NO Firestore writes.
 *
 * Honest data notes:
 *   - Search Console data is NOT real-time. dataState=final means Google has
 *     finalized the rows; recent dates may legitimately return zero rows.
 *   - Zero rows are recorded as zero rows (valid data, not an error).
 *   - Raw Google values (clicks/impressions/ctr/position) are stored exactly;
 *     no SEO score is derived here.
 *   - This runner never writes public content and never triggers optimization.
 */

require("dotenv").config();
const admin = require("firebase-admin");
const {
  runGscIngestRunner,
  createReadOnlyGoogleAuth,
  parseServiceAccount,
  querySearchAnalytics,
  DEFAULT_SITE_URL,
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_END_OFFSET_DAYS,
  DEFAULT_MAX_DAYS_PER_RUN
} = require("./agents/seo_intelligence/gsc_search_analytics");

// ─── Argument parsing ────────────────────────────────────────────────

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function intValue(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseArgs(env = process.env) {
  return {
    mode: argValue("mode", env.GSC_INGEST_MODE || "daily"),
    startDate: argValue("start-date", env.GSC_INGEST_START_DATE || ""),
    endDate: argValue("end-date", env.GSC_INGEST_END_DATE || ""),
    lookbackDays: intValue(argValue("lookback-days", env.GSC_INGEST_LOOKBACK_DAYS), DEFAULT_LOOKBACK_DAYS, 1, 31),
    endOffsetDays: intValue(argValue("end-offset-days", env.GSC_INGEST_END_OFFSET_DAYS), DEFAULT_END_OFFSET_DAYS, 0, 31),
    maxDaysPerRun: intValue(argValue("max-days-per-run", env.GSC_INGEST_MAX_DAYS_PER_RUN), DEFAULT_MAX_DAYS_PER_RUN, 1, 31),
    maxApiCalls: intValue(argValue("max-api-calls", env.GSC_INGEST_MAX_API_CALLS), 100, 1, 500),
    delayMs: intValue(argValue("delay-ms", env.GSC_INGEST_DELAY_MS), 300, 100, 10000),
    force: boolValue(argValue("force", env.GSC_INGEST_FORCE), false),
    dryRun: boolValue(argValue("dry-run", env.GSC_INGEST_DRY_RUN), false),
    siteUrl: argValue("site-url", env.SEARCH_CONSOLE_SITE_URL || DEFAULT_SITE_URL),
    actor: String(env.GITHUB_ACTOR || env.USER || "github-actions").slice(0, 120),
    runId: String(env.GITHUB_RUN_ID || "local").slice(0, 80),
    sha: String(env.GITHUB_SHA || "").slice(0, 80)
  };
}

// ─── Firebase initialization (same credentials as the other runners) ─

function initializeFirebase(env = process.env) {
  if (admin.apps.length) return admin.firestore();
  const raw = env.SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT;
  const serviceAccount = parseServiceAccount(raw);
  if (!serviceAccount) {
    throw new Error("SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT GitHub secret is required");
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || env.GCLOUD_PROJECT || env.FIREBASE_PROJECT_ID || "studymaterial-406ad"
  });
  return admin.firestore();
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const db = initializeFirebase();

  // Same service account as the URL Inspection / sitemap agent, but with the
  // read-only webmasters scope — this is measurement, nothing is mutated in GSC.
  const credentials = parseServiceAccount(process.env.SERVICE_ACCOUNT_JSON);
  const auth = createReadOnlyGoogleAuth(credentials);

  const windowNote = args.mode === "backfill"
    ? `${args.startDate} → ${args.endDate} (max ${args.maxDaysPerRun} day(s) per run, resumable)`
    : `rolling window: last ${args.lookbackDays} day(s) ending ${args.endOffsetDays} day(s) ago (UTC, dataState=final)`;

  console.log(
    `[gsc-ingest] Starting: mode=${args.mode}, site=${args.siteUrl}, window=${windowNote}, ` +
    `dimensions=[date,page,query,country,device], dryRun=${args.dryRun}` +
    (args.dryRun ? " (no Firestore writes)" : "")
  );
  console.log(
    "[gsc-ingest] Note: Search Console data is not real-time — finalized ('final') data for recent dates " +
    "can legitimately return zero rows; zero rows are recorded as zero rows."
  );

  const summary = await runGscIngestRunner({
    db,
    FieldValue: admin.firestore.FieldValue,
    args,
    deps: { querySearchAnalytics: (request) => querySearchAnalytics({ auth, ...request }) }
  });

  console.log(`\n[gsc-ingest] Result: ${summary.lastStatus || (summary.mode === "probe" ? (summary.ok ? "probe-ok" : "probe-failed") : "?")} (${summary.durationMs}ms)`);

  if (summary.mode === "probe") {
    console.log(`[gsc-ingest] Probe ${summary.ok ? "SUCCEEDED" : "FAILED"}: ${summary.message}`);
    console.log(
      summary.ok
        ? "[gsc-ingest] Access verified — Search Analytics data can be collected."
        : "[gsc-ingest] If this is a permission error: open Search Console → Settings → Users & permissions " +
          "and make sure the service account's email has access to the property (the same account already " +
          "performs URL Inspection + sitemap submit, so property access should already exist)."
    );
  } else {
    for (const day of summary.days || []) {
      const errorNote = day.error ? ` error=${day.errorType}: ${day.error}` : "";
      const skipNote = day.status && day.status.startsWith("skipped-") ? " (no API call)" : "";
      console.log(`[gsc-ingest] ${day.date}: ${day.status} rows=${day.rowCount} apiCalls=${day.apiCalls || 0}${skipNote}${errorNote}`);
    }
    console.log(
      `[gsc-ingest] Totals: rows=${summary.rowsCollected}, apiCalls=${summary.apiCalls}, ` +
      `daysRemaining=${summary.daysRemaining}${summary.capNote ? ` — ${summary.capNote}` : ""}`
    );
  }

  return summary;
}

if (require.main === module) {
  main()
    .then((summary) => process.exit(summary.ok ? 0 : 1))
    .catch((error) => {
      console.error("[gsc-ingest] Failed:", error.stack || error.message);
      process.exit(1);
    });
}

module.exports = { parseArgs, initializeFirebase, main };
