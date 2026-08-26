"use strict";

/**
 * Search Console / CTR / content-gap / recommendation helpers.
 * Never invents analytics. Never auto-creates pages.
 */

const { detectExamFamily, detectContentKind, EXPECTED_CLUSTER_KINDS, CONTENT_KINDS } = require("./taxonomy");
const { classifyJobLifecycle } = require("./job_lifecycle");

const SECRET_KEY_RE = /(token|secret|password|credential|service.?account|api.?key|private.?key|authorization|bearer)/i;

function redactSecrets(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => redactSecrets(item, depth + 1));
  if (typeof value !== "object") return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = redactSecrets(val, depth + 1);
    }
  }
  return out;
}

function isStudyGyaanPage(page) {
  const value = String(page || "").trim();
  if (!value) return false;
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.hostname === "studygyaan.in" || url.hostname.endsWith(".studygyaan.in");
  } catch {
    return false;
  }
}

function normalizeGscRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  for (const row of list.slice(0, 500)) {
    const keys = Array.isArray(row?.keys) ? row.keys : [];
    const query = String(row.query || keys[0] || "").trim().slice(0, 200);
    const page = String(row.page || keys[1] || keys[0] || "").trim().slice(0, 300);
    if (!isStudyGyaanPage(page) && !query) continue;
    if (page && !isStudyGyaanPage(page)) continue;
    out.push({
      query,
      page,
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      ctr: Number(row.ctr) || 0,
      position: Number(row.position) || 0
    });
  }
  return out;
}

function findCtrOpportunities(rows, { minImpressions = 100, maxCtr = 0.02, maxPosition = 12 } = {}) {
  return normalizeGscRows(rows)
    .filter((row) => row.impressions >= minImpressions && row.ctr < maxCtr && row.position > 0 && row.position <= maxPosition)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25)
    .map((row) => ({
      kind: "CTR",
      title: `Low CTR: ${row.query || row.page}`,
      reason: `${row.impressions} impressions, CTR ${(row.ctr * 100).toFixed(1)}%, avg position ${row.position.toFixed(1)}`,
      suggestedAction: "Rewrite title/meta to name the exam, year and action (Apply / Check Result). Keep facts; do not auto-publish.",
      page: row.page,
      query: row.query,
      autoCreate: false,
      priority: Math.min(99, Math.round(row.impressions / 20))
    }));
}

function findContentGaps(documents) {
  const docs = Array.isArray(documents) ? documents : [];
  const byFamily = new Map();
  for (const doc of docs) {
    const family = doc.examFamily || detectExamFamily(doc);
    if (family === "GENERAL") continue;
    if (!byFamily.has(family)) byFamily.set(family, new Set());
    byFamily.get(family).add(doc.contentKind || detectContentKind(doc));
  }

  const recs = [];
  for (const [family, kinds] of byFamily) {
    if (!kinds.has(CONTENT_KINDS.JOB) && kinds.size < 2) continue;
    for (const expected of EXPECTED_CLUSTER_KINDS) {
      if (kinds.has(expected)) continue;
      recs.push({
        kind: "CONTENT_GAP",
        title: `Missing ${expected} in ${family} cluster`,
        reason: `${family} has ${[...kinds].join(", ")} but no ${expected} page.`,
        suggestedAction:
          expected === CONTENT_KINDS.MOCK_TEST
            ? "If a real syllabus exists, consider a bilingual mock test. Do not invent questions from thin air."
            : "Only write this page when an official source (PDF/notice) is available. Do not auto-create.",
        examFamily: family,
        missingKind: expected,
        autoCreate: false,
        priority: expected === CONTENT_KINDS.ADMIT_CARD || expected === CONTENT_KINDS.RESULT ? 70 : 45
      });
    }
  }
  return recs.slice(0, 40);
}

function lifecycleRecommendations(documents, now) {
  const recs = [];
  for (const doc of documents || []) {
    if ((doc.contentKind || detectContentKind(doc)) !== CONTENT_KINDS.JOB) continue;
    const life = classifyJobLifecycle(doc, now);
    if (life.status === "CLOSING_SOON") {
      recs.push({
        kind: "LIFECYCLE",
        title: `Closing soon: ${String(doc.title || "").slice(0, 80)}`,
        reason: `Last date in ${life.daysUntilLastDate} day(s).`,
        suggestedAction: "Keep the page accurate; do not spam republish. A reminder video is optional via the existing dispatcher.",
        examFamily: doc.examFamily || detectExamFamily(doc),
        page: doc.url || "",
        autoCreate: false,
        priority: 80
      });
    }
  }
  return recs.slice(0, 15);
}

function rankRecommendations(lists) {
  const merged = [];
  const seen = new Set();
  for (const list of lists) {
    for (const rec of list || []) {
      const key = `${rec.kind}|${rec.title}|${rec.examFamily || ""}|${rec.page || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        ...rec,
        autoCreate: false,
        priority: Number(rec.priority) || 40
      });
    }
  }
  merged.sort((a, b) => b.priority - a.priority);
  return merged.slice(0, 60);
}

function buildDashboard({ freshness, connections, lifecycle, gaps, ctr, recommendations, gsc, intelligence }) {
  return redactSecrets({
    generatedAt: new Date().toISOString(),
    freshness: freshness || null,
    connections: connections || [],
    lifecycle: lifecycle || {},
    gaps: (gaps || []).slice(0, 20),
    ctr: (ctr || []).slice(0, 20),
    recommendations: (recommendations || []).slice(0, 30),
    searchConsole: gsc
      ? { enabled: Boolean(gsc.enabled), rowCount: (gsc.rows || []).length, error: gsc.error || null }
      : { enabled: false, rowCount: 0 },
    intelligence: intelligence || null,
    policy: {
      autoPublish: false,
      autoCreatePages: false,
      inventFacts: false,
      hideAiUsage: false
    }
  });
}

module.exports = {
  redactSecrets,
  isStudyGyaanPage,
  normalizeGscRows,
  findCtrOpportunities,
  findContentGaps,
  lifecycleRecommendations,
  rankRecommendations,
  buildDashboard
};
