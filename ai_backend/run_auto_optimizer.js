#!/usr/bin/env node
"use strict";

/**
 * GitHub Actions Auto-Content-Optimizer runner.
 *
 * Billing-safe: runs inside GitHub Actions only.
 * Reuses the existing auto_optimizer engine.
 * Processes oldest-eligible content in controlled batches.
 * Persists safe progress/results to Firestore.
 * Never prints or stores credentials/tokens/private keys.
 *
 * Usage:
 *   node run_auto_optimizer.js [--dry-run=true] [--batch-size=5] [--max-batches=2] [--use-ai=false]
 *
 * Environment:
 *   SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT — Firebase credentials
 *   OPTIMIZER_DRY_RUN — true/false (default: true)
 *   OPTIMIZER_BATCH_SIZE — 1-20 (default: 5)
 *   OPTIMIZER_MAX_BATCHES — 1-10 (default: 2)
 *   OPTIMIZER_USE_AI — true/false (default: false)
 *   GEMINI_API_KEY — optional, for AI-powered Level B improvements
 */

try { require("dotenv").config({ quiet: true }); } catch { /* optional */ }

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { runBackfill, getOptimizerStatus } = require("./agents/seo_intelligence/auto_optimizer");
const { getBackfillProgress, countProcessedPages } = require("./agents/seo_intelligence/backfill_processor");
const { redactSecrets } = require("./agents/seo_intelligence/intelligence");
const { isAutomationEnabled } = require("./agents/automation_guard");

const SETTINGS = "system_settings";
const SETTINGS_DOC = "seo_intelligence";
const RUNNER_NAME = "auto-content-optimizer";

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
    dryRun: boolValue(argValue("dry-run", env.OPTIMIZER_DRY_RUN), true),
    batchSize: intValue(argValue("batch-size", env.OPTIMIZER_BATCH_SIZE), 5, 1, 20),
    maxBatches: intValue(argValue("max-batches", env.OPTIMIZER_MAX_BATCHES), 2, 1, 10),
    useAi: boolValue(argValue("use-ai", env.OPTIMIZER_USE_AI), false),
    actor: String(env.GITHUB_ACTOR || env.USER || "github-actions").slice(0, 120),
    runId: String(env.GITHUB_RUN_ID || "local").slice(0, 80),
    sha: String(env.GITHUB_SHA || "").slice(0, 80)
  };
}

// ─── Firebase initialization ─────────────────────────────────────────

function parseServiceAccount(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  try { return JSON.parse(value); }
  catch (firstError) {
    try { return JSON.parse(Buffer.from(value, "base64").toString("utf8")); }
    catch { throw new Error(`Firebase service account JSON is invalid: ${firstError.message}`); }
  }
}

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

// ─── Status persistence ──────────────────────────────────────────────

function sanitizeError(error) {
  const raw = error && typeof error === "object"
    ? { name: error.name, message: error.message, code: error.code }
    : { message: String(error || "Unknown error") };
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    clean[key] = String(value)
      .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/gi, "[redacted]")
      .replace(/"private_key"\s*:\s*"(?:\\"|[^"])*"/gi, '"private_key":"[redacted]"')
      .replace(/"client_email"\s*:\s*"(?:\\"|[^"])*"/gi, '"client_email":"[redacted]"')
      .replace(/(token|secret|password|credential|api.?key|authorization|bearer)(\s*[:=]\s*)\S+/gi, "$1$2[redacted]")
      .slice(0, 800);
  }
  return clean;
}

async function persistOptimizerStatus(db, FieldValue, status, patch = {}, options = {}) {
  if (!db || options.dryRun) return;
  const nowIso = new Date().toISOString();
  await db.collection(SETTINGS).doc(SETTINGS_DOC).set({
    optimizerRunner: {
      runner: RUNNER_NAME,
      lastStatus: status,
      lastRunAt: nowIso,
      [`${status}At`]: nowIso,
      github: { actor: options.actor, runId: options.runId, sha: options.sha },
      ...patch
    },
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

function writeSummaryArtifact(summary, outputPath = path.resolve(process.cwd(), "auto_optimizer_summary.json")) {
  const safe = redactSecrets(summary);
  fs.writeFileSync(outputPath, JSON.stringify(safe, null, 2) + "\n", "utf8");
  return outputPath;
}

// ─── Reporting ───────────────────────────────────────────────────────

/**
 * Compact per-page detail for the summary artifact (dry-run AND live).
 * Shows exactly what the optimizer did / would do for each page.
 */
function buildPageDetails(report) {
  const results = Array.isArray(report && report.results) ? report.results : [];
  return results.map((result) => {
    const detail = result && result.detail ? result.detail : {};
    return {
      page: detail.contentId || result.contentId || "",
      collection: detail.collectionName || result.collectionName || "",
      contentType: detail.contentType || "",
      action: result.action || "",
      status: result.status || "",
      beforeScore: result.originalScore != null ? result.originalScore : detail.beforeScore,
      afterScore: result.finalScore != null ? result.finalScore : detail.afterScore,
      projectedAfterScore: detail.projectedAfterScore,
      beforeDimensions: detail.beforeDimensions || undefined,
      weakDimensions: detail.weakDimensions || [],
      detectedWeaknesses: detail.detectedWeaknesses || [],
      proposedImprovements: (detail.proposedImprovements || []).map((p) => ({
        field: p.field, level: p.level, source: p.source, aiRequired: p.aiRequired, reason: p.reason
      })),
      fieldsChanged: detail.fieldsChanged || [],
      bodyContentChanged: Boolean(detail.bodyContentChanged),
      deterministicAvailable: Boolean(detail.deterministicAvailable),
      aiRequired: Boolean(detail.aiRequired),
      validationResults: (detail.validationResults || []).map((v) => ({ field: v.field, stage: v.stage, status: v.status, reason: v.reason })),
      duplicateSafety: detail.duplicateSafety || undefined,
      factualSafety: detail.factualSafety || undefined,
      skipReason: result.skipReason || "",
      error: result.error || undefined
    };
  });
}

function summarizeActions(report) {
  const results = Array.isArray(report && report.results) ? report.results : [];
  const actions = { IMPROVE: 0, SKIP: 0, REVIEW: 0, BLOCK: 0 };
  for (const result of results) {
    if (result && actions[result.action] !== undefined) actions[result.action] += 1;
  }
  const improved = (results || []).filter((r) => r && typeof r.qualityDelta === "number" && r.qualityDelta > 0);
  const avgDelta = improved.length
    ? Number((improved.reduce((sum, r) => sum + r.qualityDelta, 0) / improved.length).toFixed(1))
    : 0;
  return { actions, avgScoreImprovement: avgDelta };
}

// ─── Main runner ─────────────────────────────────────────────────────

async function runAutoOptimizerRunner({ db, FieldValue, args, deps = {} }) {
  const started = Date.now();
  const effectiveFieldValue = FieldValue || admin.firestore.FieldValue;
  const run = deps.runBackfill || runBackfill;
  const getStatus = deps.getOptimizerStatus || getOptimizerStatus;
  const getProgress = deps.getBackfillProgress || getBackfillProgress;
  const getCounts = deps.countProcessedPages || countProcessedPages;
  const getGuard = deps.isAutomationEnabled || isAutomationEnabled;

  // Automation kill-switch coverage (Phase 0 hygiene): the optimizer honors
  // system_settings/automation → features.seo_optimizer exactly like the other
  // scheduled automations (globalEnabled / emergencyPause also apply).
  const guard = await getGuard(db, "seo_optimizer");
  if (!guard.enabled) {
    await persistOptimizerStatus(db, effectiveFieldValue, "skipped", {
      dryRun: args.dryRun,
      skipReason: guard.reason,
      lastError: null
    }, { dryRun: false, actor: args.actor, runId: args.runId, sha: args.sha });
    console.log(`[auto-optimizer] ⏸️ Skipped: ${guard.reason}`);
    return {
      ok: true,
      skipped: true,
      reason: guard.reason,
      runner: RUNNER_NAME,
      durationMs: Date.now() - started,
      dryRun: args.dryRun
    };
  }

  await persistOptimizerStatus(db, effectiveFieldValue, "running", {
    dryRun: args.dryRun,
    batchSize: args.batchSize,
    maxBatches: args.maxBatches,
    useAi: args.useAi,
    lastError: null
  }, { dryRun: false, actor: args.actor, runId: args.runId, sha: args.sha });

  try {
    // Get pre-run state
    const [preProgress, preCounts] = await Promise.all([
      getProgress(db).catch(() => null),
      getCounts(db).catch(() => ({ total: 0, processed: 0 }))
    ]);

    // Run the optimization
    const report = await run(db, effectiveFieldValue, {
      dryRun: args.dryRun,
      batchSize: args.batchSize,
      maxBatches: args.maxBatches,
      useAi: args.useAi
    });

    const durationMs = Date.now() - started;

    // Get post-run state
    const [postProgress, postCounts] = await Promise.all([
      getProgress(db).catch(() => null),
      getCounts(db).catch(() => ({ total: 0, processed: 0 }))
    ]);

    const pageDetails = buildPageDetails(report);
    const actionSummary = summarizeActions(report);
    const needsReview = pageDetails.filter((p) => p.action === "REVIEW" || p.action === "BLOCK");

    const successPatch = {
      lastReport: redactSecrets(report),
      durationMs,
      dryRun: args.dryRun,
      totalProcessed: report.totalProcessed,
      totalImproved: report.totalImproved,
      totalSkipped: report.totalSkipped,
      totalNeedsReview: report.totalNeedsReview || 0,
      totalBlocked: report.totalBlocked || 0,
      totalRolledBack: report.totalRolledBack,
      totalFailed: report.totalFailed,
      avgScoreImprovement: actionSummary.avgScoreImprovement,
      actions: actionSummary.actions,
      needsReviewPages: needsReview.map((p) => ({ page: p.page, action: p.action, skipReason: p.skipReason })).slice(0, 25),
      preRun: { progress: preProgress, counts: preCounts },
      postRun: { progress: postProgress, counts: postCounts }
    };

    await persistOptimizerStatus(db, effectiveFieldValue, "success", successPatch, {
      dryRun: false, actor: args.actor, runId: args.runId, sha: args.sha
    });

    const summary = redactSecrets({
      ok: true, runner: RUNNER_NAME, durationMs, args,
      report: { ...report, results: undefined },
      pageDetails,
      actions: actionSummary.actions,
      avgScoreImprovement: actionSummary.avgScoreImprovement,
      preRun: { counts: preCounts },
      postRun: { counts: postCounts }
    });

    writeSummaryArtifact(summary);

    // Human-readable per-page outcome so a dry-run is immediately readable
    for (const page of pageDetails) {
      const score = page.projectedAfterScore != null
        ? `${page.beforeScore} → ${page.projectedAfterScore} (projected)`
        : `${page.beforeScore} → ${page.afterScore}`;
      console.log(
        `[auto-optimizer] ${page.action || "?"} ${page.collection}/${page.page} | ${score}` +
        ` | body=${page.bodyContentChanged ? "changes" : "no-change"}` +
        ` | fields=[${(page.fieldsChanged || []).join(",")}]` +
        ` | deterministic=${page.deterministicAvailable ? "yes" : "no"}` +
        ` | aiRequired=${page.aiRequired ? "yes" : "no"}` +
        (page.skipReason ? ` | skipReason=${page.skipReason}` : "")
      );
    }
    return summary;
  } catch (error) {
    const durationMs = Date.now() - started;
    const safeError = sanitizeError(error);
    await persistOptimizerStatus(db, effectiveFieldValue, "failed", {
      durationMs, lastError: safeError
    }, { dryRun: false, actor: args.actor, runId: args.runId, sha: args.sha });

    const summary = redactSecrets({ ok: false, runner: RUNNER_NAME, durationMs, error: safeError });
    writeSummaryArtifact(summary);
    throw error;
  }
}

async function main() {
  const args = parseArgs();
  const db = initializeFirebase();

  console.log(
    `[auto-optimizer] Starting: dryRun=${args.dryRun}` +
    `${args.dryRun ? " (no writes to public content — scheduled runs always default to dry-run)" : " (LIVE — validated improvements are applied with snapshot + rollback)"}, ` +
    `batchSize=${args.batchSize}, maxBatches=${args.maxBatches}, useAi=${args.useAi}`
  );

  const summary = await runAutoOptimizerRunner({
    db, FieldValue: admin.firestore.FieldValue, args
  });

  console.log(JSON.stringify({
    ok: summary.ok,
    dryRun: args.dryRun,
    runner: summary.runner,
    durationMs: summary.durationMs,
    totalProcessed: summary.report?.totalProcessed || 0,
    totalImproved: summary.report?.totalImproved || 0,
    totalSkipped: summary.report?.totalSkipped || 0,
    totalNeedsReview: summary.report?.totalNeedsReview || 0,
    totalBlocked: summary.report?.totalBlocked || 0,
    totalRolledBack: summary.report?.totalRolledBack || 0,
    totalFailed: summary.report?.totalFailed || 0,
    avgScoreImprovement: summary.avgScoreImprovement || 0,
    actions: summary.actions || {},
    remaining: summary.postRun?.counts?.remaining ?? summary.postRun?.counts?.total ?? 0
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    const safe = sanitizeError(error);
    console.error("Auto-optimizer runner failed:", safe.message || safe.name || "Unknown error");
    process.exit(1);
  });
}

module.exports = {
  SETTINGS, SETTINGS_DOC, RUNNER_NAME,
  parseArgs, parseServiceAccount, sanitizeError,
  persistOptimizerStatus, writeSummaryArtifact,
  buildPageDetails, summarizeActions,
  runAutoOptimizerRunner, initializeFirebase
};
