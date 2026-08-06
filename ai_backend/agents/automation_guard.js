/**
 * automation_guard.js — 🛑 GLOBAL KILL SWITCH + Per-Feature ON/OFF
 * ================================================================
 * Frontend Admin tab se control hota hai: Firestore doc
 *   `system_settings/automation`
 * 
 * Structure:
 * {
 *   globalEnabled: true/false,           // master switch — false = sab automation band
 *   emergencyPause: false,                // emergency hold (credit khatam etc)
 *   pausedReason: "Gemini credits low — salary tak hold",
 *   pausedAt: "2026-08-06T...",
 *   features: {
 *     auto_drafts: true/false,
 *     auto_drafts_repair: true/false,
 *     govt_jobs: true/false,
 *     fast_track: true/false,
 *     auto_blog: true/false,
 *     mock_test: true/false,
 *     pdf_gen: true/false,
 *     video_maker: true/false,
 *     long_video: true/false,
 *     web_stories: true/false,
 *     daily_alert: true/false,
 *     telegram_drafts: true/false,
 *     fb_post: true/false,
 *     google_indexing: true/false,
 *     payment_checker: true/false,
 *     note_processor: true/false,
 *     premium_notes: true/false
 *   }
 * }
 * 
 * Agar doc exist nahi karta, to default = sab enabled (backward compat).
 * 
 * Usage in Cloud Functions / GitHub Actions:
 *   const { isAutomationEnabled } = require('./agents/automation_guard');
 *   const check = await isAutomationEnabled(db, 'auto_drafts');
 *   if (!check.enabled) { console.log('Skipped:', check.reason); return; }
 */

const SETTINGS_COLLECTION = "system_settings";
const SETTINGS_DOC = "automation";

// Simple in-memory cache to avoid Firestore read storm (1 min TTL)
let cachedSettings = null;
let cacheFetchedAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 min

async function fetchSettings(db, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedSettings && (now - cacheFetchedAt) < CACHE_TTL_MS) {
    return cachedSettings;
  }

  try {
    const snap = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).get();
    if (!snap.exists) {
      // Default: all enabled
      cachedSettings = {
        globalEnabled: true,
        emergencyPause: false,
        pausedReason: "",
        pausedAt: null,
        features: {}
      };
    } else {
      cachedSettings = snap.data();
    }
    cacheFetchedAt = now;
    return cachedSettings;
  } catch (e) {
    console.warn("automation_guard fetch error:", e.message);
    // On error, allow by default (don't block production if Firestore down)
    return {
      globalEnabled: true,
      emergencyPause: false,
      features: {}
    };
  }
}

/**
 * Check if a specific feature is enabled.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} featureKey — e.g. 'auto_drafts', 'govt_jobs', etc. Use 'global' to check only global switch.
 * @returns {Promise<{enabled: boolean, reason: string, settings: any}>}
 */
async function isAutomationEnabled(db, featureKey = "global") {
  const settings = await fetchSettings(db);

  // Global kill switch
  if (settings.globalEnabled === false) {
    return {
      enabled: false,
      reason: `🌍 Global automation PAUSED${settings.pausedReason ? `: ${settings.pausedReason}` : ''}`,
      settings
    };
  }

  if (settings.emergencyPause === true) {
    return {
      enabled: false,
      reason: `🚨 Emergency PAUSE${settings.pausedReason ? `: ${settings.pausedReason}` : ' — credits low / salary tak hold'}`,
      settings
    };
  }

  if (featureKey === "global") {
    return { enabled: true, reason: "Global enabled", settings };
  }

  const features = settings.features || {};
  // If feature not explicitly set, default enabled = true
  if (features[featureKey] === undefined || features[featureKey] === true) {
    return { enabled: true, reason: "Feature enabled", settings };
  }

  if (typeof features[featureKey] === 'object') {
    // Support {enabled: bool, ...}
    if (features[featureKey].enabled === false) {
      return {
        enabled: false,
        reason: `Feature '${featureKey}' paused from admin panel`,
        settings
      };
    }
    return { enabled: true, reason: "Feature enabled", settings };
  }

  // false case
  if (features[featureKey] === false) {
    return {
      enabled: false,
      reason: `Feature '${featureKey}' is OFF (admin control)`,
      settings
    };
  }

  return { enabled: true, reason: "Default enabled", settings };
}

/**
 * For GitHub Actions — CLI check that exits with code 78 (neutral) if disabled
 * So workflow can skip remaining steps.
 */
async function cliCheck(db, featureKey) {
  const result = await isAutomationEnabled(db, featureKey);
  if (!result.enabled) {
    console.log(`⏸️ Automation PAUSED: ${result.reason} — skipping ${featureKey}`);
    // GitHub Actions: set output for later steps
    if (process.env.GITHUB_OUTPUT) {
      const fs = require('fs');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `enabled=false\nreason=${result.reason}\n`);
    }
    return false;
  }
  console.log(`✅ Automation enabled for ${featureKey}: ${result.reason}`);
  if (process.env.GITHUB_OUTPUT) {
    const fs = require('fs');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `enabled=true\n`);
  }
  return true;
}

// Invalidate cache (call after admin toggles)
function invalidateCache() {
  cachedSettings = null;
  cacheFetchedAt = 0;
}

module.exports = {
  SETTINGS_COLLECTION,
  SETTINGS_DOC,
  fetchSettings,
  isAutomationEnabled,
  cliCheck,
  invalidateCache
};
