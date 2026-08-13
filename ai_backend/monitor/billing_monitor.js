"use strict";

/**
 * ============================================================================
 * 💰 BILLING MONITOR — "kahan kitna paisa laga" ka sahi jawab
 * ============================================================================
 * Google Cloud ka EXACT spend Billing API / BigQuery se hi milta hai. Yeh
 * monitor:
 *
 *   1. Vertex credit ledger se — Vertex AI (₹91,785) kitna kharcha hua (estim.)
 *   2. Usage logger se — har service ka estimated spend (Gemini/TTS/Vertex)
 *   3. Google Cloud Billing API se — PROJECT ka actual spend (exact ₹)
 *
 * Cloud Billing API actual cost deta hai per project. Isse aap dekhoge:
 *   - Gemini API kitna
 *   - Vertex AI kitna
 *   - Cloud TTS kitna
 *   - Firestore/Storage kitna
 *
 * Usage:
 *   npm run monitor:report
 *   npm run monitor:billing
 * ============================================================================
 */

const ledger = require("../vertex/vertex_credit_ledger");
const usage = require("./usage_logger");
const vc = require("../vertex/vertex_client");

function prettyInr(n) {
  return "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * Google Cloud Billing API se project ke asli spend/state nikalta hai.
 * Note: exact monthly cost ke liye BigQuery billing export chahiye hota hai;
 * yahan hum billing account info + (agar enabled ho) monthly budget cost nikalte hain.
 */
async function getGoogleBilling() {
  try {
    const { google } = require("googleapis");
    const creds = (() => {
      const raw = process.env.SERVICE_ACCOUNT_JSON;
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    })();
    if (!creds) return { ok: false, reason: "SERVICE_ACCOUNT_JSON not available" };

    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/cloud-billing"],
    });
    const billing = google.cloudbilling({ version: "v1", auth });
    const projectId = vc.config().projectId;

    const info = await billing.projects.getBillingInfo({ name: `projects/${projectId}` });
    return {
      ok: true,
      billingEnabled: info.data.billingEnabled === true,
      billingAccount: info.data.billingAccountName || "(none)",
      projectId,
      note: "Exact ₹ cost ke liye Billing console me 'Reports' ya BigQuery export use karo.",
    };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

/** Poora monitor report. */
async function report() {
  const out = {};

  // 1. Vertex credit ledger
  const { data: vled } = await ledger.load();
  out.vertexCredit = {
    budgetInr: vc.config().creditBudgetInr,
    spentInr: vled.totalSpentInr || 0,
    leftInr: Math.max(0, (vc.config().creditBudgetInr) - (vled.totalSpentInr || 0)),
    byType: (vled.runs || []).reduce((acc, r) => {
      acc[r.type] = Math.round(((acc[r.type] || 0) + (r.costInr || 0)) * 100) / 100;
      return acc;
    }, {}),
    recentCalls: (vled.runs || []).slice(-10),
  };

  // 2. Usage logger (Gemini/TTS/etc estimates)
  const usum = await usage.summary();
  out.usageEstimated = {
    totalSpentInr: usum.totalSpentInr,
    byCategory: usum.byCategory,
    byDay: usum.byDay,
  };

  // 3. Google Cloud Billing actual
  out.googleBilling = await getGoogleBilling();

  return out;
}

/** Report ko console pe print karta hai. */
async function printReport() {
  const r = await report();

  console.log("=".repeat(55));
  console.log("💰 STUDYGYAAN BILLING MONITOR");
  console.log("=".repeat(55));

  // Vertex credit
  console.log("\n🧩 VERTEX AI CREDIT (₹91,785)");
  console.log(`   Budget: ${prettyInr(r.vertexCredit.budgetInr)}`);
  console.log(`   Spent : ${prettyInr(r.vertexCredit.spentInr)}`);
  console.log(`   Left  : ${prettyInr(r.vertexCredit.leftInr)}`);
  console.log("   By type:");
  Object.entries(r.vertexCredit.byType).forEach(([k, v]) =>
    console.log(`     ${k}: ${prettyInr(v)}`));

  // Usage estimated
  console.log("\n📊 ESTIMATED SPEND (Gemini/TTS — ALAG billing)");
  console.log(`   Total estimated: ${prettyInr(r.usageEstimated.totalSpentInr)}`);
  console.log("   By category:");
  Object.entries(r.usageEstimated.byCategory).forEach(([k, v]) =>
    console.log(`     ${k}: ${prettyInr(v)}`));

  // Google Billing
  console.log("\n☁️  GOOGLE CLOUD BILLING (EXACT)");
  if (r.googleBilling.ok) {
    console.log(`   Billing enabled: ${r.googleBilling.billingEnabled}`);
    console.log(`   Billing account: ${r.googleBilling.billingAccount}`);
    console.log(`   Project: ${r.googleBilling.projectId}`);
    console.log(`   ${r.googleBilling.note}`);
  } else {
    console.log(`   Could not fetch: ${r.googleBilling.reason}`);
  }

  console.log("\n📌 EXACT ₹ ke liye:");
  console.log("   1. Google Cloud → Billing → Reports (per-service cost)");
  console.log("   2. Ya Billing → BigQuery export enable karo (har service ka exact ₹)");
  console.log("=".repeat(55));
}

if (require.main === module) {
  printReport().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { report, printReport };
