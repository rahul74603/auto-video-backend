"use strict";

/**
 * ============================================================================
 * 🛑 EMERGENCY KILL SWITCH — saare automation/charges ek command se band
 * ============================================================================
 * Daily 30-40 ₹ katne ka hal: ye Firestore `system_settings/automation` me
 * globalEnabled=false + emergencyPause=true set karta hai. Har automation
 * (GitHub Actions + Cloud Functions + image/story triggers) usko respect karta
 * hai, to saare AI/Gemini/TTS charges RUK jaate hain.
 *
 * Usage:
 *   node kill_switch.js --off   # SAB band (Emergency HOLD)
 *   node kill_switch.js --on    # wapas sab ON
 *   node kill_switch.js --status  # abhi kya haal hai
 *
 * NOTE: YE SIRF AUTOMATION BAND KARTA HAI — manual admin actions / user
 * traffic / hosting FIRESTORE READ-write free tier ke andar chalta rahega.
 * Pakka "0 ₹" ke liye Firestore free tier ka dhyan rakho.
 * ============================================================================
 */

const vc = require("./vertex/vertex_client");
const { fetchSettings, SETTINGS_COLLECTION, SETTINGS_DOC } = require("./agents/automation_guard");

async function getDB() {
  return vc.firestore();
}

async function setOff(reason) {
  const db = await getDB();
  if (!db) throw new Error("Firestore init failed — SERVICE_ACCOUNT_JSON check karo.");
  await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).set({
    globalEnabled: false,
    emergencyPause: true,
    pausedReason: reason || "🚨 Emergency HOLD — saare charges band",
    pausedAt: new Date().toISOString(),
  }, { merge: true });
  // invalidate cache
  const guard = require("./agents/automation_guard");
  guard.invalidateCache();
  console.log("🛑 EMERGENCY HOLD LAGAYA — sab automation band. Charges rukenge.");
}

async function setOn() {
  const db = await getDB();
  if (!db) throw new Error("Firestore init failed");
  await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).set({
    globalEnabled: true,
    emergencyPause: false,
    pausedReason: "",
    resumedAt: new Date().toISOString(),
  }, { merge: true });
  require("./agents/automation_guard").invalidateCache();
  console.log("✅ SAB ON — automations wapas chalu.");
}

async function status() {
  const db = await getDB();
  if (!db) { console.log("Firestore init failed"); return; }
  const snap = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).get();
  const s = snap.exists ? snap.data() : {};
  console.log("📊 Automation status:");
  console.log("   globalEnabled:", s.globalEnabled);
  console.log("   emergencyPause:", s.emergencyPause);
  console.log("   pausedReason:", s.pausedReason || "(none)");
  console.log("   pausedAt:", s.pausedAt || "(never)");
  const running = s.globalEnabled !== false && s.emergencyPause !== true;
  console.log(running
    ? "   ⚠️ ABHI SAB CHAL RAHA HAI — charges badh rahe hain. --off karo."
    : "   ✅ SAB BAND — charges ruke hue.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--off")) return setOff(args[args.indexOf("--off") + 1]);
  if (args.includes("--on")) return setOn();
  if (args.includes("--status")) return status();
  console.log("Usage:");
  console.log("  node kill_switch.js --off [reason]  # SAB band (Emergency HOLD)");
  console.log("  node kill_switch.js --on             # wapas sab ON");
  console.log("  node kill_switch.js --status          # abhi kya haal");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
