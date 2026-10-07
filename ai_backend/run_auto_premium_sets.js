#!/usr/bin/env node
/**
 * run_auto_premium_sets.js — 🕐 CLI: Daily auto premium set generation.
 * =====================================================================
 * GitHub Actions cron se chalta hai (FREE compute — Firebase pe zero load):
 *   2:30 AM IST → node run_auto_premium_sets.js --slot=0
 *   3:20 AM IST → node run_auto_premium_sets.js --slot=1
 *
 * Env: SERVICE_ACCOUNT_JSON (admin SDK), GEMINI_API_KEY.
 * Koi set banne me fail hua to exit code 1 (workflow red dikhega — silent fail NAHI).
 */

const admin = require("firebase-admin");

const svcRaw = process.env.SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
if (!svcRaw) {
  console.error("SERVICE_ACCOUNT_JSON missing");
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svcRaw)) });

const { runDailyPremiumSets } = require("./auto_premium_sets");

function arg(name, dflt) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : dflt;
}

(async () => {
  const slot = Number(arg("slot", "0"));
  const db = admin.firestore();
  console.log(`📚 Daily auto premium sets — slot ${slot} (${new Date().toISOString()})`);
  const report = await runDailyPremiumSets(db, { slot });
  console.log(JSON.stringify(report, null, 2));
  const ok = !report.skipped && report.errors.length === 0 && report.sets.length > 0;
  process.exit(ok ? 0 : report.skipped ? 0 : 1);
})().catch((e) => {
  console.error("Auto premium sets FAILED:", e);
  process.exit(1);
});
