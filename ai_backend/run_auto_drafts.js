#!/usr/bin/env node
/**
 * run_auto_drafts.js — 🤖 AUTO-DRAFTS CLI RUNNER (GitHub Actions ke liye)
 * ========================================================================
 * Pehle ye kaam deleted Cloud Run scheduled function karta tha — ab GitHub
 * Actions (FREE) se chalta hai. Poora existing auto_drafts.js pipeline
 * as-is use hota hai:
 *
 *   job_drafts / fast_track (fresh, bina article wale)
 *        ↓
 *   source fetch (direct URL → search fallback)
 *        ↓
 *   adaptive grounded writer (1600-2500 words, 12 H2, FAQs, facts)
 *        ↓
 *   Fact & Quality review → fail pe self-repair
 *        ↓
 *   ai_article_drafts me DRAFT (publish KABHI khud nahi)
 *        ↓
 *   Telegram approve-card (sirf review-passed pe)
 *
 * Env: SERVICE_ACCOUNT_JSON (ya FIREBASE_SERVICE_ACCOUNT), GEMINI_API_KEY,
 *      TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID (optional — cards ke liye)
 * Args: --limit=N (default 2), --repair-limit=N (default 1)
 */

"use strict";

try { require("dotenv").config(); } catch (e) { /* optional */ }

const admin = require("firebase-admin");

if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id || "studymaterial-406ad"
        });
    } else {
        console.error("❌ SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT env missing!");
        process.exit(1);
    }
}

const db = admin.firestore();
const { FieldValue } = require("firebase-admin/firestore");

function argNum(name, fallback) {
    const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
    if (!arg) return fallback;
    const n = Number(arg.split("=")[1]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

(async () => {
    const { runAutoDraftsJob } = require("./auto_drafts");
    const limit = argNum("limit", 2);
    const repairLimit = argNum("repair-limit", 1);

    console.log(`🌅 AUTO-DRAFTS RUN — limit=${limit}, repairLimit=${repairLimit}`);
    const report = await runAutoDraftsJob(db, FieldValue, { limit, repairLimit });

    console.log("\n========== AUTO-DRAFTS REPORT ==========");
    console.log(JSON.stringify(report, null, 2));

    const created = (report && (report.created || report.drafted || 0)) || 0;
    const repaired = (report && (report.repaired || 0)) || 0;
    console.log(`\n🎉 DONE — ${created} naye AI drafts, ${repaired} repairs.`);
    console.log("   → Admin panel: JOBS AI tab → Browse AI Drafts me review karo.");
    process.exit(0);
})().catch((e) => {
    console.error("❌ FATAL:", e);
    process.exit(1);
});
