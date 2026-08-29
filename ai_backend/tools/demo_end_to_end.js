#!/usr/bin/env node
"use strict";
/**
 * Realistic end-to-end demonstration of the Auto-Content-Optimizer.
 *
 * Runs the REAL runner (runAutoOptimizerRunner from run_auto_optimizer.js)
 * against representative StudyGyaan-style content through a mock Firestore:
 *   1. DRY-RUN  — exactly what the GitHub Actions workflow does
 *   2. LIVE RUN — proves real writes, snapshots, tracker, rollback safety
 *
 * Representative catalog (oldest first):
 *   2021 weak job    — classic old scraped record: thin body, no meta/author
 *   2022 thin blog   — 7-word guide stub
 *   2023 strong job  — already high quality, must be skipped
 *   2024 fast track  — short official update, no articleHtml
 */

const fs = require("node:fs");
const path = require("node:path");
const { runAutoOptimizerRunner } = require("../run_auto_optimizer");

function createMockDb() {
  const store = new Map();
  const writeLog = [];
  function col(name) {
    const base = {
      doc(id) {
        const key = `${name}/${id}`;
        return {
          async get() { return { exists: store.has(key), data: () => store.get(key) || {} }; },
          async set(data, opts) {
            writeLog.push(key);
            if (opts && opts.merge) store.set(key, { ...(store.get(key) || {}), ...data });
            else store.set(key, data);
            return this;
          },
          async update(data) { return this.set(data, { merge: true }); }
        };
      },
      count() {
        return {
          async get() {
            let count = 0;
            for (const k of store.keys()) if (k.startsWith(`${name}/`)) count++;
            return { data: () => ({ count }) };
          }
        };
      }
    };
    return {
      ...base,
      orderBy() {
        return {
          limit() {
            return {
              async get() {
                const docs = [];
                for (const [k, v] of store.entries()) {
                  if (k.startsWith(`${name}/`)) docs.push({ id: k.split("/")[1], data: () => v });
                }
                return { docs };
              }
            };
          }
        };
      },
      where(field, op, values) {
        if (field === "status" && op === "in") {
          return {
            count() {
              return {
                async get() {
                  let count = 0;
                  for (const [k, v] of store.entries()) {
                    if (k.startsWith(`${name}/`) && values.includes(String((v && v.status) || "").toLowerCase())) count++;
                  }
                  return { data: () => ({ count }) };
                }
              };
            }
          };
        }
        return base;
      }
    };
  }
  return { collection: col, _store: store, _writeLog: writeLog };
}

const FieldValue = { serverTimestamp: () => new Date().toISOString() };

const catalog = [
  {
    id: "ssc-cgl-2021", collection: "jobs", type: "JOB", status: "published",
    title: "SSC CGL 2021 Recruitment", seoTitle: "SSC CGL 2021 Recruitment",
    metaDescription: "", category: "SSC", organization: "SSC",
    lastDate: "20 September 2021", startDate: "01/06/2021",
    vacancies: "14589", salary: "Pay Level 7",
    applyLink: "https://ssc.gov.in/apply",
    articleHtml: "<p>SSC CGL 2021 apply now. Read the notification.</p>",
    createdAt: "2021-03-15T00:00:00Z", updatedAt: "2021-03-15T00:00:00Z",
    sourceUrl: "https://ssc.gov.in/notice-2021"
  },
  {
    id: "ssc-cgl-prep-guide", collection: "blogs", type: "BLOG", status: "published",
    title: "How to prepare for SSC CGL", seoTitle: "How to prepare for SSC CGL 2026",
    metaDescription: "Guide.", h1: "SSC CGL Preparation Guide", category: "SSC",
    articleHtml: "<h1>SSC CGL Preparation</h1><p>Short guide. Study daily.</p>",
    createdAt: "2022-06-20T00:00:00Z", updatedAt: "2022-06-20T00:00:00Z"
  },
  {
    id: "ibps-po-2023", collection: "jobs", type: "JOB", status: "published",
    title: "IBPS PO 2023 Recruitment", seoTitle: "IBPS PO 2023 Recruitment Apply Online",
    metaDescription: "IBPS PO 2023 recruitment: apply online before the last date using the official link. Complete details, important dates and the step-by-step application process are summarised on this page for quick reference.",
    h1: "IBPS PO 2023", category: "IBPS", organization: "IBPS",
    lastDate: "30 August 2023", startDate: "01/08/2023",
    vacancies: "3049", salary: "Pay Level 10", applyLink: "https://ibps.in/apply",
    authorName: "StudyGyaan Editorial Team",
    articleHtml: "<h1>IBPS PO 2023</h1><h2>Overview</h2><p>IBPS PO 2023 recruitment is open for candidates across India. This page summarises the official record: read every section and confirm final details on the official notice before applying. Keep your documents ready before starting the application. The process is fully online and takes a few minutes when prepared. Double-check each field before final submission of the form.</p><h2>Important dates</h2><p>Last date: 30 August 2023. Start date: 01/08/2023.</p><h2>आवेदन कैसे करें</h2><p>Apply online through the official portal: <a href=\"https://ibps.in/apply\">https://ibps.in/apply</a></p><ul><li>Step 1 read the notification</li><li>Step 2 register</li><li>Step 3 submit the form</li></ul>",
    relatedLinks: [{ title: "IBPS Hub", url: "/govt-jobs?exam=IBPS" }],
    createdAt: "2023-07-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
    sourceUrl: "https://ibps.in/notice"
  },
  {
    id: "rrb-admit-card-2024", collection: "fast_track", type: "FAST_TRACK", status: "published",
    title: "RRB NTPC Admit Card 2024 Released Download Link",
    seoTitle: "RRB NTPC Admit Card 2024 Released Download Link",
    shortInfo: "RRB NTPC admit card 2024 released on the official website. Download using your registration number and date of birth.",
    directLink: "https://rrbcdg.gov.in/admit-card",
    category: "RRB",
    createdAt: "2024-05-10T00:00:00Z", updatedAt: "2024-05-10T00:00:00Z"
  },
  {
    id: "draft-hidden", collection: "jobs", type: "JOB", status: "draft",
    title: "Draft should never be processed", createdAt: "2020-01-01T00:00:00Z"
  }
];

async function seed(db) {
  for (const doc of catalog) {
    await db.collection(doc.collection).doc(doc.id).set({ ...doc });
  }
}

(async () => {
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  AUTO-CONTENT-OPTIMIZER — END-TO-END DEMONSTRATION");
  console.log("  (real runner + real engine, mock Firestore, useAi=false)");
  console.log("══════════════════════════════════════════════════════════════\n");

  // ─── 1. DRY RUN ───────────────────────────────────────────────
  const dbDry = createMockDb();
  await seed(dbDry);
  dbDry._writeLog.length = 0; // ignore demo seeding writes
  const dryRunSummary = await runAutoOptimizerRunner({
    db: dbDry, FieldValue,
    args: { dryRun: true, batchSize: 5, maxBatches: 2, useAi: false, actor: "demo", runId: "demo-dry", sha: "" }
  });
  fs.writeFileSync(path.resolve(__dirname, "demo_dry_run_summary.json"), JSON.stringify(dryRunSummary, null, 2));

  console.log("\n────────── DRY-RUN RESULT (no writes) ──────────");
  console.log(`processed=${dryRunSummary.report.totalProcessed} wouldImprove=${dryRunSummary.report.totalImproved} ` +
    `skip(alreadyGood)=${dryRunSummary.pageDetails.filter((p) => p.action === "SKIP").length} ` +
    `needsReview=${dryRunSummary.report.totalNeedsReview} failed=${dryRunSummary.report.totalFailed}`);
  console.log(`engine writes to public collections during dry-run: ${dbDry._writeLog.filter((k) => !k.startsWith("system_settings/")).length}`);
  console.log(`runner status writes (admin-only system_settings, by design): ${dbDry._writeLog.filter((k) => k.startsWith("system_settings/")).length}`);
  for (const page of dryRunSummary.pageDetails) {
    console.log(`  ${page.action.padEnd(8)} ${page.collection}/${page.page}  ${page.beforeScore} → ${page.projectedAfterScore ?? page.afterScore}` +
      `${page.skipReason ? `  (${page.skipReason})` : ""}`);
    for (const imp of page.proposedImprovements) {
      console.log(`      • ${imp.field} [L${imp.level} ${imp.source}] ${String(imp.reason).slice(0, 70)}`);
    }
  }

  // ─── 2. LIVE RUN ──────────────────────────────────────────────
  const dbLive = createMockDb();
  await seed(dbLive);
  dbLive._writeLog.length = 0; // ignore demo seeding writes
  const liveSummary = await runAutoOptimizerRunner({
    db: dbLive, FieldValue,
    args: { dryRun: false, batchSize: 5, maxBatches: 2, useAi: false, actor: "demo", runId: "demo-live", sha: "" }
  });
  console.log("\n────────── LIVE RUN RESULT (real writes) ──────────");
  console.log(`processed=${liveSummary.report.totalProcessed} improved=${liveSummary.report.totalImproved} ` +
    `skipped=${liveSummary.report.totalSkipped} rolledBack=${liveSummary.report.totalRolledBack} failed=${liveSummary.report.totalFailed}`);
  console.log(`avg score improvement: +${liveSummary.avgScoreImprovement}`);
  for (const page of liveSummary.pageDetails) {
    console.log(`  ${page.action.padEnd(8)} ${page.collection}/${page.page}  ${page.beforeScore} → ${page.afterScore}` +
      `${page.skipReason ? `  (${page.skipReason})` : ""}`);
  }

  // prove the before/after of the weakest page
  const before = catalog[0];
  const after = dbLive._store.get("jobs/ssc-cgl-2021");
  console.log("\n────────── WEAK PAGE BEFORE/AFTER (jobs/ssc-cgl-2021) ──────────");
  console.log("BEFORE articleHtml:\n  " + before.articleHtml);
  console.log("\nAFTER articleHtml:\n  " + String(after.articleHtml).replace(/\n/g, "\n  "));
  console.log("\nmetaDescription BEFORE: '" + before.metaDescription + "'");
  console.log("metaDescription AFTER : '" + after.metaDescription + "'");
  console.log("\nFACT FIELDS (must be identical):");
  for (const f of ["organization", "lastDate", "startDate", "vacancies", "salary", "applyLink", "sourceUrl"]) {
    const same = String(after[f]) === String(before[f]);
    console.log(`  ${f.padEnd(14)} ${same ? "LOCKED ✓" : "CHANGED ✗"}  (${after[f]})`);
  }
  const snapshotCount = [...dbLive._store.keys()].filter((k) => k.startsWith("seo_apply_snapshots/")).length;
  const trackerCount = [...dbLive._store.keys()].filter((k) => k.startsWith("seo_backfill_tracker/")).length;
  console.log(`\nsnapshots written: ${snapshotCount}, trackers written: ${trackerCount}`);
  const ft = dbLive._store.get("fast_track/rrb-admit-card-2024");
  console.log(`fast_track rrb-admit-card-2024 after: ${ft && ft.optimizerProcessed ? "processed" : ""} articleHtml head: ${String(ft && ft.articleHtml || "").slice(0, 80)}`);

  // idempotency: re-run live — nothing left
  const rerun = await runAutoOptimizerRunner({
    db: dbLive, FieldValue,
    args: { dryRun: false, batchSize: 5, maxBatches: 2, useAi: false, actor: "demo", runId: "demo-live-2", sha: "" }
  });
  console.log(`\nRE-RUN (idempotency): processed=${rerun.report.totalProcessed} improved=${rerun.report.totalImproved} — nothing rewritten`);
  console.log("\npostRun counts:", JSON.stringify(liveSummary.postRun.counts));
})().catch((err) => {
  console.error("demo failed:", err);
  process.exit(1);
});
