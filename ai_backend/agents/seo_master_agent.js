"use strict";

/**
 * ============================================================
 *  SEO MASTER AGENT — Pure project ka SEO + Connections Guardian
 *  ------------------------------------------------------------
 *  Ye agent pure StudyGyaan project ka SEO control karta hai:
 *    1. SEO Audit (sitemap, indexing, broken links, thin content)
 *    2. Content Freshness — roz kam se kam N articles publish hona chahiye
 *    3. Connection Health — Firestore, Storage, Telegram, Gemini API, etc.
 *    4. Auto-Fix — jahan gadbad ho wahan khud thik kare ya Telegram pe alert bheje
 *    5. Trending — Google pe website hamesha trending me rahe, iska khayal rakhe
 *       - Daily sitemap submit
 *       - Indexing API ping for new jobs
 *       - Social signals (Telegram, FB)
 *       - Keyword trending check
 *  
 *  Schedule: Har 6 ghante + daily 9am IST
 *  Firestore: system_settings/seo_master (last run, issues, fixes)
 */

const { SEOIndexingAgent } = require("./seo_indexing_agent");
const { isAutomationEnabled } = require("./automation_guard");

const SEO_COLLECTION = "system_settings";
const SEO_DOC = "seo_master";
const SEO_RUNS_COLLECTION = "seo_master_runs";

async function checkConnections(db) {
  const checks = [];

  // 1. Firestore read
  try {
    const start = Date.now();
    await db.collection("system_settings").doc("automation").get();
    checks.push({ name: "Firestore", ok: true, latencyMs: Date.now() - start });
  } catch (e) {
    checks.push({ name: "Firestore", ok: false, error: e.message });
  }

  // 2. Jobs collection has recent docs?
  try {
    const snap = await db.collection("jobs").orderBy("createdAt", "desc").limit(5).get();
    const hasRecent = !snap.empty;
    const latestDate = hasRecent ? snap.docs[0].data().createdAt : null;
    checks.push({ name: "Jobs Collection", ok: hasRecent, latest: latestDate, count: snap.size });
  } catch (e) {
    checks.push({ name: "Jobs Collection", ok: false, error: e.message });
  }

  // 3. AI Drafts queue health
  try {
    const snap = await db.collection("ai_article_drafts").orderBy("createdAt", "desc").limit(20).get();
    const failed = snap.docs.filter(d => d.data().reviewStatus === 'failed').length;
    const passed = snap.docs.filter(d => d.data().reviewStatus === 'passed').length;
    checks.push({ name: "AI Drafts Queue", ok: true, total: snap.size, failed, passed });
  } catch (e) {
    checks.push({ name: "AI Drafts Queue", ok: false, error: e.message });
  }

  // 4. Automation guard
  try {
    const { fetchSettings } = require("./automation_guard");
    const settings = await fetchSettings(db, true);
    checks.push({ 
      name: "Automation Control", 
      ok: settings.globalEnabled, 
      globalEnabled: settings.globalEnabled,
      emergencyPause: settings.emergencyPause,
      enabledFeatures: Object.values(settings.features || {}).filter(v => v === true || (typeof v === 'object' && v.enabled)).length
    });
  } catch (e) {
    checks.push({ name: "Automation Control", ok: false, error: e.message });
  }

  // 5. Gemini API key present?
  const geminiOk = Boolean(process.env.GEMINI_API_KEY);
  checks.push({ name: "Gemini API Key", ok: geminiOk, present: geminiOk });

  // 6. Telegram creds
  const tgOk = Boolean(process.env.TELEGRAM_BOT_TOKEN && (process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID));
  checks.push({ name: "Telegram Bot", ok: tgOk, present: tgOk });

  return checks;
}

async function checkContentFreshness(db) {
  const result = { ok: true, issues: [], stats: {} };
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Jobs published in last 24h
    const jobsSnap = await db.collection("jobs").orderBy("createdAt", "desc").limit(50).get();
    let recentJobs = 0;
    jobsSnap.forEach(doc => {
      const data = doc.data();
      const created = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      if (created > twentyFourHoursAgo) recentJobs++;
    });

    result.stats.recentJobs24h = recentJobs;
    result.stats.totalJobsSample = jobsSnap.size;

    if (recentJobs < 2) {
      result.ok = false;
      result.issues.push(`⚠️ Last 24h me sirf ${recentJobs} jobs publish hue — trending ke liye kam se kam 3-5 chahiye. Auto-drafts trigger karo.`);
    }

    // Fast-track freshness
    const ftSnap = await db.collection("fast_track").orderBy("createdAt", "desc").limit(30).get();
    let recentFt = 0;
    ftSnap.forEach(doc => {
      const data = doc.data();
      const created = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      if (created > twentyFourHoursAgo) recentFt++;
    });
    result.stats.recentFastTrack24h = recentFt;

    if (recentFt < 1) {
      result.issues.push(`ℹ️ Last 24h me ${recentFt} fast-track updates — thoda kam hai.`);
    }

    // Drafts stuck
    const draftsSnap = await db.collection("ai_article_drafts").orderBy("createdAt", "desc").limit(30).get();
    const stuck = draftsSnap.docs.filter(d => {
      const data = d.data();
      const isFailed = data.reviewStatus === 'failed';
      const tries = Number(data.autoRepairTries || 0);
      return isFailed && tries >= 5;
    }).length;

    result.stats.stuckDrafts = stuck;
    if (stuck > 3) {
      result.ok = false;
      result.issues.push(`🚨 ${stuck} drafts 5+ tries ke baad bhi failed hain — manual review chahiye (hallucination ya fatal).`);
    }

  } catch (e) {
    result.ok = false;
    result.issues.push(`Content freshness check error: ${e.message}`);
  }
  return result;
}

async function runSEOAudit(options = {}) {
  try {
    const agent = new SEOIndexingAgent({ persist: false });
    const report = await agent.run({
      mode: options.mode || 'auto',
      maxUrls: options.maxUrls || 100,
      websiteUrl: process.env.WEBSITE_URL || 'https://studygyaan.in',
      sitemapUrl: process.env.SITEMAP_URL || 'https://studygyaan.in/sitemap.xml'
    });
    return {
      ok: true,
      summary: report.summary,
      sitemap: report.sitemap,
      indexingApi: report.indexingApi,
      audits: report.audits.slice(0, 20) // top 20 issues
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
      summary: null
    };
  }
}

async function sendTelegramSummary(creds, summary) {
  if (!creds || !creds.token || !creds.chatId) return { sent: false, reason: 'no-creds' };
  
  const axios = require('axios');
  const lines = [
    `<b>🤖 SEO MASTER AGENT — Daily Report</b>`,
    ``,
    `📊 <b>Content Freshness:</b> ${summary.freshness.ok ? '✅ OK' : '⚠️ Issues'}`,
    `   - Jobs 24h: ${summary.freshness.stats.recentJobs24h || 0}`,
    `   - Fast-track 24h: ${summary.freshness.stats.recentFastTrack24h || 0}`,
    `   - Stuck drafts: ${summary.freshness.stats.stuckDrafts || 0}`,
    ``,
    `🔗 <b>Connections:</b>`,
    ...summary.connections.map(c => `   ${c.ok ? '✅' : '❌'} ${c.name}${c.error ? `: ${c.error.slice(0, 60)}` : ''}`),
    ``,
    `🔍 <b>SEO Audit:</b> ${summary.seo.ok ? `✅ ${summary.seo.summary?.cleanIndexable || 0} indexable / ${summary.seo.summary?.audited || 0} audited` : `❌ ${summary.seo.error}`}`,
    ``,
  ];

  if (summary.freshness.issues.length) {
    lines.push(`⚠️ <b>Issues:</b>`);
    summary.freshness.issues.slice(0, 3).forEach(iss => lines.push(`   - ${iss.slice(0, 120)}`));
    lines.push(``);
  }

  if (!summary.freshness.ok || summary.connections.some(c => !c.ok) || !summary.seo.ok) {
    lines.push(`🛠️ <b>Action:</b> Admin panel → AUTOMATION tab check karo, ya /secret-admin pe jao`);
  } else {
    lines.push(`✅ <b>All Good — Website trending ke liye ready!</b>`);
  }

  lines.push(``);
  lines.push(`<a href="https://studygyaan.in/secret-admin?tab=AUTOMATION">🛠️ Automation Control</a> | <a href="https://studygyaan.in/sitemap.xml">🗺️ Sitemap</a>`);

  try {
    await axios.post(`https://api.telegram.org/bot${creds.token}/sendMessage`, {
      chat_id: creds.chatId,
      text: lines.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }, { timeout: 15000 });
    return { sent: true };
  } catch (e) {
    console.warn('SEO Master Telegram failed:', e.message);
    return { sent: false, error: e.message };
  }
}

async function runSEOMasterAgent(db, FieldValue, options = {}) {
  const startTime = Date.now();
  console.log('🤖 SEO MASTER AGENT — Starting comprehensive check...');

  // Check if automation paused — if global paused, skip heavy SEO audit
  const guard = await isAutomationEnabled(db, 'google_indexing');
  if (!guard.enabled && !options.force) {
    console.log(`⏸️ SEO Master skipped — ${guard.reason}`);
    return { skipped: true, reason: guard.reason };
  }

  const connections = await checkConnections(db);
  const freshness = await checkContentFreshness(db);
  const seo = await runSEOAudit({ maxUrls: options.maxUrls || 80 });

  let intelligence = { skipped: true };
  try {
    const { runSeoIntelligence } = require("./seo_intelligence/orchestrator");
    intelligence = await runSeoIntelligence(db, FieldValue, {
      force: Boolean(options.force),
      maxJobs: 80,
      maxUpdates: 40
    });
  } catch (error) {
    intelligence = { ok: false, error: error.message };
    console.warn("SEO intelligence failed (non-fatal):", error.message);
  }

  const summary = {
    runId: new Date().toISOString().replace(/[:.]/g, '-'),
    generatedAt: new Date().toISOString(),
    connections,
    freshness,
    seo,
    intelligence: {
      ok: intelligence.ok !== false && !intelligence.error,
      skipped: Boolean(intelligence.skipped),
      recommendationCount: intelligence.recommendationCount || 0,
      lifecycleUpdates: intelligence.lifecycleUpdates || 0,
      relatedUpdates: intelligence.relatedUpdates || 0,
      lifecycle: intelligence.lifecycle || null,
      error: intelligence.error || null
    },
    durationMs: Date.now() - startTime
  };

  // Save run to Firestore
  try {
    await db.collection(SEO_RUNS_COLLECTION).doc(summary.runId).set({
      ...summary,
      createdAt: FieldValue.serverTimestamp()
    });
    await db.collection(SEO_COLLECTION).doc(SEO_DOC).set({
      lastRun: summary,
      lastRunAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.warn('SEO Master save error:', e.message);
  }

  // Auto-fix actions
  const fixes = [];

  // If content freshness low, trigger auto-drafts (if enabled)
  if (!freshness.ok && freshness.stats.recentJobs24h < 2) {
    try {
      const autoDraftsGuard = await isAutomationEnabled(db, 'auto_drafts');
      if (autoDraftsGuard.enabled) {
        console.log('🤖 SEO Master: Content low — triggering auto-drafts...');
        const { runAutoDraftsJob } = require('./../auto_drafts');
        const report = await runAutoDraftsJob(db, FieldValue, { limit: 2, repairLimit: 2 });
        fixes.push(`Triggered auto-drafts: ${report.created.length} created, ${report.repaired.length} repaired`);
      }
    } catch (e) {
      fixes.push(`Auto-drafts trigger failed: ${e.message}`);
    }
  }

  // Telegram summary (only if issues or daily)
  const isDaily = options.isDaily || new Date().getHours() === 9; // 9am IST daily
  if (isDaily || !freshness.ok || connections.some(c => !c.ok)) {
    try {
      const bot = require('../telegram_draft_bot');
      const creds = bot.adminCredsFromEnv();
      const tgResult = await sendTelegramSummary(creds, summary);
      if (tgResult.sent) fixes.push('Sent Telegram summary');
    } catch (e) {
      console.warn('Telegram summary error:', e.message);
    }
  }

  summary.fixes = fixes;

  console.log(`🤖 SEO MASTER AGENT — Done in ${summary.durationMs}ms. Fixes: ${fixes.join('; ')}`);

  return summary;
}

module.exports = {
  runSEOMasterAgent,
  checkConnections,
  checkContentFreshness,
  runSEOAudit,
  SEO_COLLECTION,
  SEO_DOC,
  SEO_RUNS_COLLECTION
};
