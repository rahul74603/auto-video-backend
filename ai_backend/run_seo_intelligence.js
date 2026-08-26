#!/usr/bin/env node
"use strict";

/**
 * GitHub Actions SEO Intelligence runner.
 *
 * Billing-safe replacement for the deleted browser -> Cloud Run SEO API path:
 * - runs inside GitHub Actions only
 * - reuses the existing SEO Intelligence orchestrator
 * - persists safe scan status/results to Firestore
 * - never prints or stores credentials/tokens/private keys
 * - never publishes, rewrites articles, or auto-creates pages
 */

try { require("dotenv").config({ quiet: true }); } catch { /* optional in local dev */ }

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { runSeoIntelligence } = require("./agents/seo_intelligence/orchestrator");
const { normalizeGscRows, redactSecrets } = require("./agents/seo_intelligence/intelligence");
const { checkConnections, checkContentFreshness } = require("./agents/seo_master_agent");

const SETTINGS = "system_settings";
const SETTINGS_DOC = "seo_intelligence";
const GSC_DOC = "seo_search_console";
const RUNNER_NAME = "github-actions";

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
    dryRun: boolValue(argValue("dry-run", env.SEO_DRY_RUN), false),
    maxJobs: intValue(argValue("limit", env.SEO_SCAN_LIMIT), 80, 1, 150),
    gscJson: argValue("gsc-json", env.SEO_GSC_JSON || ""),
    actor: String(env.GITHUB_ACTOR || env.USER || "github-actions").slice(0, 120),
    runId: String(env.GITHUB_RUN_ID || "local").slice(0, 80),
    sha: String(env.GITHUB_SHA || "").slice(0, 80)
  };
}

function parseServiceAccount(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  try {
    return JSON.parse(value);
  } catch (firstError) {
    try {
      return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    } catch {
      throw new Error(`Firebase service account JSON is invalid: ${firstError.message}`);
    }
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

function sanitizeError(error) {
  const raw = error && typeof error === "object"
    ? { name: error.name, message: error.message, code: error.code, status: error.status }
    : { message: String(error || "Unknown error") };
  const redacted = redactSecrets(raw);
  const clean = {};
  for (const [key, value] of Object.entries(redacted)) {
    if (value === undefined || value === null || value === "") continue;
    clean[key] = String(value)
      .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/gi, "[redacted-private-key]")
      .replace(/"private_key"\s*:\s*"(?:\\"|[^"])*"/gi, '"private_key":"[redacted]"')
      .replace(/"client_email"\s*:\s*"(?:\\"|[^"])*"/gi, '"client_email":"[redacted]"')
      .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted]")
      .replace(/(token|secret|password|credential|api.?key|authorization|bearer)(\s*[:=]\s*)\S+/gi, "$1$2[redacted]")
      .slice(0, 800);
  }
  return clean;
}

async function persistScanStatus(db, FieldValue, status, patch = {}, options = {}) {
  if (!db || options.dryRun) return;
  const nowIso = new Date().toISOString();
  const base = redactSecrets({
    runner: RUNNER_NAME,
    lastStatus: status,
    updatedAt: FieldValue.serverTimestamp(),
    [`${status}At`]: nowIso,
    ...patch
  });
  await db.collection(SETTINGS).doc(SETTINGS_DOC).set(base, { merge: true });
}

async function ingestGscJsonIfProvided(db, FieldValue, args, options = {}) {
  const raw = String(args.gscJson || "").trim();
  if (!raw) return { provided: false, rowCount: 0 };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid GSC JSON input: ${error.message}`);
  }
  const rows = normalizeGscRows(Array.isArray(parsed) ? parsed : parsed.rows);
  if (!rows.length) {
    throw new Error("GSC JSON contained no valid studygyaan.in Search Console rows");
  }

  if (!options.dryRun) {
    await db.collection(SETTINGS).doc(GSC_DOC).set({
      rows,
      source: "github-actions-manual-json-import",
      ingestedAt: new Date().toISOString(),
      ingestedBy: args.actor,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return { provided: true, rowCount: rows.length };
}

function writeSummaryArtifact(summary, outputPath = path.resolve(process.cwd(), "seo_intelligence_summary.json")) {
  const safe = redactSecrets(summary);
  fs.writeFileSync(outputPath, JSON.stringify(safe, null, 2) + "\n", "utf8");
  return outputPath;
}

async function runSeoIntelligenceRunner({ db, FieldValue, args, deps = {} }) {
  const started = Date.now();
  const effectiveFieldValue = FieldValue || admin.firestore.FieldValue;
  const run = deps.runSeoIntelligence || runSeoIntelligence;
  const getConnections = deps.checkConnections || checkConnections;
  const getFreshness = deps.checkContentFreshness || checkContentFreshness;

  await persistScanStatus(db, effectiveFieldValue, "running", {
    scanStartedAt: new Date().toISOString(),
    lastError: null,
    github: { actor: args.actor, runId: args.runId, sha: args.sha }
  }, { dryRun: args.dryRun });

  try {
    const gscImport = await ingestGscJsonIfProvided(db, effectiveFieldValue, args, { dryRun: args.dryRun });
    const [connections, freshness, report] = await Promise.all([
      getConnections(db).catch((error) => [{ name: "Connections", ok: false, error: sanitizeError(error).message || "failed" }]),
      getFreshness(db).catch((error) => ({ ok: false, stats: {}, issues: [sanitizeError(error).message || "Freshness check failed"] })),
      run(db, effectiveFieldValue, {
        force: true,
        dryRun: args.dryRun,
        maxJobs: args.maxJobs,
        maxUpdates: Math.min(args.maxJobs, 150)
      })
    ]);

    const durationMs = Date.now() - started;
    const successPatch = redactSecrets({
      lastRun: report,
      lastRunAt: effectiveFieldValue.serverTimestamp(),
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
      scanDurationMs: durationMs,
      recommendationCount: Number(report.recommendationCount || 0),
      lifecycleSummary: report.lifecycle || {},
      searchConsole: report.searchConsole || { enabled: false, rowCount: 0 },
      freshness,
      connections,
      policy: { autoPublish: false, autoCreatePages: false, inventFacts: false },
      gscImport,
      github: { actor: args.actor, runId: args.runId, sha: args.sha }
    });

    await persistScanStatus(db, effectiveFieldValue, "success", successPatch, { dryRun: args.dryRun });
    const summary = redactSecrets({ ok: true, dryRun: args.dryRun, runner: RUNNER_NAME, durationMs, report, freshness, connections, gscImport });
    if (!args.disableSummaryArtifact) writeSummaryArtifact(summary);
    return summary;
  } catch (error) {
    const durationMs = Date.now() - started;
    const safeError = sanitizeError(error);
    await persistScanStatus(db, effectiveFieldValue, "failed", {
      lastFailureAt: new Date().toISOString(),
      scanDurationMs: durationMs,
      lastError: safeError,
      github: { actor: args.actor, runId: args.runId, sha: args.sha }
    }, { dryRun: args.dryRun });
    const summary = redactSecrets({ ok: false, dryRun: args.dryRun, runner: RUNNER_NAME, durationMs, error: safeError });
    if (!args.disableSummaryArtifact) writeSummaryArtifact(summary);
    throw error;
  }
}

async function main() {
  const args = parseArgs();
  const db = initializeFirebase();
  const summary = await runSeoIntelligenceRunner({ db, FieldValue: admin.firestore.FieldValue, args });
  console.log(JSON.stringify({
    ok: summary.ok,
    dryRun: summary.dryRun,
    runner: summary.runner,
    durationMs: summary.durationMs,
    recommendationCount: summary.report?.recommendationCount || 0,
    gscRows: summary.report?.searchConsole?.rowCount || summary.gscImport?.rowCount || 0
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    const safe = sanitizeError(error);
    console.error("SEO Intelligence runner failed:", safe.message || safe.name || "Unknown error");
    process.exit(1);
  });
}

module.exports = {
  SETTINGS,
  SETTINGS_DOC,
  GSC_DOC,
  RUNNER_NAME,
  parseArgs,
  parseServiceAccount,
  sanitizeError,
  persistScanStatus,
  ingestGscJsonIfProvided,
  writeSummaryArtifact,
  runSeoIntelligenceRunner,
  initializeFirebase
};
