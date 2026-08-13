"use strict";

/**
 * ============================================================================
 * 📊 MONITOR CLI — kitna paisa laga, kahan, kaha se
 * ============================================================================
 * Usage:
 *   node monitor/monitor_cli.js --report     # poori report
 *   node monitor/monitor_cli.js --billing    # Google Cloud actual billing info
 *   node monitor/monitor_cli.js --usage      # estimated spend per category
 *   node monitor/monitor_cli.js --recent     # recent calls
 * ============================================================================
 */

const { report } = require("./billing_monitor");
const usage = require("./usage_logger");

function prettyInr(n) {
  return "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--billing")) {
    const { getGoogleBilling } = require("./billing_monitor");
    const b = await getGoogleBilling();
    console.log("☁️  GOOGLE CLOUD BILLING");
    if (b.ok) {
      console.log("   Billing enabled:", b.billingEnabled);
      console.log("   Billing account:", b.billingAccount);
      console.log("   Project:", b.projectId);
      console.log("   ", b.note);
    } else {
      console.log("   ❌", b.reason);
    }
    return;
  }

  if (args.includes("--usage")) {
    const s = await usage.summary();
    console.log("📊 ESTIMATED SPEND (by category)");
    console.log("   Total:", prettyInr(s.totalSpentInr));
    Object.entries(s.byCategory).forEach(([k, v]) => console.log(`   ${k}: ${prettyInr(v)}`));
    console.log("\n📅 By day");
    Object.entries(s.byDay).forEach(([k, v]) => console.log(`   ${k}: ${prettyInr(v)}`));
    return;
  }

  if (args.includes("--recent")) {
    const s = await usage.summary();
    console.log("🕒 RECENT CALLS (last 15)");
    (s.calls || []).slice(-15).forEach((c) =>
      console.log(`   ${c.at} | ${c.category} | ${prettyInr(c.costInr)} | ${c.note || ""}`));
    return;
  }

  // default: full report
  const { printReport } = require("./billing_monitor");
  await printReport();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
