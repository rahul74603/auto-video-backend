"use strict";

/**
 * SEO Outcome Meter entry point (Phase 3 — measurement ONLY).
 *
 * Connects Phase 1 GSC Search Analytics rows with Phase 2 SEO change events
 * and writes one outcome measurement per change event (before/after windows).
 *
 * Modes:
 *   node run_seo_outcomes.js --mode=recent
 *       (default) measure recent change events with missing/incomplete outcomes
 *   node run_seo_outcomes.js --mode=event --event-id=<id>
 *       measure one change event
 *   node run_seo_outcomes.js --mode=recalc
 *       force re-measure recent outcomes (unchanged measurements are no-ops;
 *       changed measurements append a revision — history preserved)
 *   --dry-run=true  compute but write nothing
 *
 * Honest measurement notes:
 *   - Outcomes are OBSERVED before/after differences (correlation, not causation).
 *   - Missing GSC days are coverage gaps, never zero performance.
 *   - Overlapping changes on the same page mark outcomes as confounded.
 *   - This runner writes ONLY seo_change_outcomes + system_settings/seo_intelligence.
 *     It never writes public content, proposals, GSC rows, or the event ledger,
 *     and it never triggers optimization or learning.
 */

require("dotenv").config();
const admin = require("firebase-admin");
const { runOutcomeMeter, DEFAULT_CONFIG } = require("./agents/seo_intelligence/outcome_meter");
const { parseServiceAccount } = require("./agents/seo_intelligence/gsc_search_analytics");

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
    mode: argValue("mode", env.SEO_OUTCOMES_MODE || "recent"),
    eventId: argValue("event-id", env.SEO_OUTCOMES_EVENT_ID || ""),
    maxEvents: intValue(argValue("max-events", env.SEO_OUTCOMES_MAX_EVENTS), 25, 1, 100),
    windowDays: intValue(argValue("window-days", env.SEO_OUTCOMES_WINDOW_DAYS), DEFAULT_CONFIG.windowDays, 3, 31),
    dryRun: boolValue(argValue("dry-run", env.SEO_OUTCOMES_DRY_RUN), false),
    actor: String(env.GITHUB_ACTOR || env.USER || "github-actions").slice(0, 120),
    runId: String(env.GITHUB_RUN_ID || "local").slice(0, 80)
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

  console.log(
    `[outcome-meter] Starting: mode=${args.mode}, windowDays=${args.windowDays} ` +
    `(pre/post = ${args.windowDays} completed GSC days around the change, change day excluded, ` +
    `finality offset ${DEFAULT_CONFIG.finalityOffsetDays}d), maxEvents=${args.maxEvents}, dryRun=${args.dryRun}`
  );
  console.log(
    "[outcome-meter] Measurement ONLY: observed before/after differences (correlation, not causation). " +
    "Missing GSC days are coverage gaps, never zero performance. No optimization, no learning."
  );

  const summary = await runOutcomeMeter({
    db,
    FieldValue: admin.firestore.FieldValue,
    args: {
      ...args,
      config: { ...DEFAULT_CONFIG, windowDays: args.windowDays }
    }
  });

  console.log(`\n[outcome-meter] Result: ${summary.lastStatus || (summary.skippedRun ? "skipped" : "?")} (${summary.durationMs}ms)`);
  if (summary.skippedRun) {
    console.log(`[outcome-meter] Skipped: ${summary.reason}`);
  } else {
    for (const result of summary.results || []) {
      const errorNote = result.error ? ` ERROR: ${result.error}` : "";
      console.log(
        `[outcome-meter] ${result.eventId}: ${result.evidenceState || "?"} (${result.action || "error"})${errorNote}`
      );
    }
    for (const skip of summary.skipped || []) {
      console.log(`[outcome-meter] skipped ${skip.eventId}: ${skip.reason}`);
    }
    console.log(
      `[outcome-meter] Totals: measured=${summary.measured}, created=${summary.created}, revised=${summary.revised}, ` +
      `unchanged=${summary.unchanged}, skipped=${(summary.skipped || []).length}`
    );
  }

  return summary;
}

if (require.main === module) {
  main()
    .then((summary) => process.exit(summary.ok ? 0 : 1))
    .catch((error) => {
      console.error("[outcome-meter] Failed:", error.stack || error.message);
      process.exit(1);
    });
}

module.exports = { parseArgs, initializeFirebase, main };
