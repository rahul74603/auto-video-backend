"use strict";

/**
 * Page SEO audit model — diagnostic records only.
 *
 * Health is StudyGyaan's Page SEO Health score, NOT a Google ranking score.
 * Phase 2 never applies fixes. autoFixLevel is advisory.
 */

const AUDIT_VERSION = 1;
const MAX_PAGE_AUDITS = 40;
const MAX_FINDINGS = 20;

const SEVERITIES = Object.freeze(["blocker", "high", "medium", "low"]);
const CONFIDENCES = Object.freeze(["observed", "heuristic", "gsc", "ai"]);
const AUTO_FIX_LEVELS = Object.freeze(["A", "B", "C"]);
const DIMENSIONS = Object.freeze([
  "technical",
  "metadata",
  "intent",
  "content",
  "topic",
  "internalLinks",
  "schema",
  "indexability",
  "freshness",
  "duplicate",
  "images",
  "faq",
  "trust",
  "gsc",
  "answerReadiness"
]);

const PAGE_TYPES = Object.freeze([
  "BLOG",
  "JOB",
  "FAST_TRACK",
  "MOCK_TEST",
  "STUDY_MATERIAL",
  "COURSE",
  "EBOOK",
  "WEB_STORY",
  "OTHER"
]);

const PUBLIC_CONTENT_COLLECTIONS = Object.freeze([
  "jobs",
  "blogs",
  "fast_track",
  "mock_tests",
  "study_materials",
  "studyMaterials",
  "courses",
  "web_stories",
  "job_drafts",
  "ai_article_drafts"
]);

const AUDIT_WRITE_ALLOWLIST = Object.freeze(["system_settings", "seo_intelligence_runs"]);

const SEVERITY_WEIGHT = Object.freeze({
  blocker: 25,
  high: 12,
  medium: 6,
  low: 2
});

function isValidSeverity(value) {
  return SEVERITIES.includes(value);
}

function isValidConfidence(value) {
  return CONFIDENCES.includes(value);
}

function isValidAutoFixLevel(value) {
  return AUTO_FIX_LEVELS.includes(value);
}

function assertAllowedAuditWrite(collectionName) {
  const name = String(collectionName || "");
  if (PUBLIC_CONTENT_COLLECTIONS.includes(name)) {
    const err = new Error(`page auditor refused to write public content collection: ${name}`);
    err.code = "AUDIT_WRITE_FORBIDDEN";
    throw err;
  }
  if (!AUDIT_WRITE_ALLOWLIST.includes(name)) {
    const err = new Error(`page auditor may only persist to ${AUDIT_WRITE_ALLOWLIST.join(", ")} (got ${name})`);
    err.code = "AUDIT_WRITE_FORBIDDEN";
    throw err;
  }
  return true;
}

function normalizeFinding(raw = {}) {
  const severity = isValidSeverity(raw.severity) ? raw.severity : "low";
  const confidence = isValidConfidence(raw.confidence) ? raw.confidence : "heuristic";
  const autoFixLevel = isValidAutoFixLevel(raw.autoFixLevel) ? raw.autoFixLevel : "B";
  const dimension = DIMENSIONS.includes(raw.dimension) ? raw.dimension : "content";
  const evidence = raw.evidence && typeof raw.evidence === "object"
    ? raw.evidence
    : { observed: String(raw.evidence || "").slice(0, 300) };
  return {
    id: String(raw.id || "unknown").slice(0, 80),
    dimension,
    severity,
    confidence,
    evidence,
    suggestedAction: String(raw.suggestedAction || "").slice(0, 400),
    autoFixLevel
  };
}

function countBySeverity(findings) {
  const counts = { blocker: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings || []) {
    if (counts[finding.severity] !== undefined) counts[finding.severity] += 1;
  }
  return counts;
}

function computeHealth(findings) {
  const counts = countBySeverity(findings);
  let score = 100;
  for (const finding of findings || []) {
    score -= SEVERITY_WEIGHT[finding.severity] || 0;
  }
  score = Math.max(0, Math.min(100, score));
  let label = "healthy";
  if (counts.blocker > 0 || score < 50) label = "critical";
  else if (counts.high > 0 || score < 70) label = "needs-work";
  else if (score < 85) label = "fair";
  return {
    score,
    label,
    note: "Page SEO Health is a StudyGyaan diagnostic score, not a Google ranking score."
  };
}

function computePriority(findings, extras = {}) {
  const counts = countBySeverity(findings);
  let priority = 20;
  if (counts.blocker) priority = 95;
  else if (counts.high) priority = 75;
  else if (counts.medium) priority = 45;
  const impressions = Number(extras.gscImpressions);
  if (Number.isFinite(impressions) && impressions >= 100) {
    priority = Math.min(99, priority + Math.round(Math.min(impressions, 2000) / 80));
  }
  return Math.max(1, Math.min(99, priority));
}

function mainOpportunity(findings) {
  const order = { blocker: 0, high: 1, medium: 2, low: 3 };
  const sorted = (findings || []).slice().sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  const top = sorted[0];
  if (!top) return "No issues detected in this diagnostic pass.";
  return top.suggestedAction || top.id;
}

function dimensionStatus(findings, dimension, fallback = "ok") {
  const hits = (findings || []).filter((item) => item.dimension === dimension);
  if (!hits.length) return fallback;
  if (hits.some((item) => item.severity === "blocker")) return "blocker";
  if (hits.some((item) => item.severity === "high")) return "high";
  if (hits.some((item) => item.severity === "medium")) return "medium";
  return "low";
}

function buildDimensions(findings, overrides = {}) {
  const out = {};
  for (const name of DIMENSIONS) {
    if (overrides[name] && overrides[name].status) {
      out[name] = {
        status: overrides[name].status,
        reason: overrides[name].reason || null,
        metrics: overrides[name].metrics || null
      };
      continue;
    }
    out[name] = {
      status: dimensionStatus(findings, name, "ok"),
      reason: null,
      metrics: (overrides[name] && overrides[name].metrics) || null
    };
  }
  return out;
}

function buildAuditRecord({
  url,
  contentType,
  contentId,
  auditedAt,
  findings,
  dimensionOverrides,
  extra
} = {}) {
  const normalized = (findings || []).map(normalizeFinding).slice(0, MAX_FINDINGS);
  const health = computeHealth(normalized);
  const counts = countBySeverity(normalized);
  const gscImpressions = extra && extra.gscImpressions;
  return {
    url: String(url || "").slice(0, 300),
    contentType: PAGE_TYPES.includes(contentType) ? contentType : "OTHER",
    contentId: String(contentId || "").slice(0, 120),
    auditedAt: auditedAt || new Date().toISOString(),
    auditVersion: AUDIT_VERSION,
    health,
    priority: computePriority(normalized, { gscImpressions }),
    dimensions: buildDimensions(normalized, dimensionOverrides),
    findings: normalized,
    summary: {
      counts,
      mainOpportunity: mainOpportunity(normalized),
      criticalCount: counts.blocker,
      highCount: counts.high
    }
  };
}

function compactAudit(audit) {
  const record = audit || {};
  const findings = (record.findings || []).slice(0, MAX_FINDINGS).map(normalizeFinding);
  return {
    url: record.url,
    contentType: record.contentType,
    contentId: record.contentId,
    auditedAt: record.auditedAt,
    auditVersion: record.auditVersion || AUDIT_VERSION,
    health: record.health,
    priority: record.priority,
    summary: record.summary,
    findings,
    dimensionStatus: Object.fromEntries(
      Object.entries(record.dimensions || {}).map(([key, value]) => [key, value && value.status])
    ),
    mainOpportunity: record.summary && record.summary.mainOpportunity,
    criticalCount: record.summary ? record.summary.criticalCount : 0,
    highCount: record.summary ? record.summary.highCount : 0
  };
}

function summarizeAudits(audits) {
  const list = Array.isArray(audits) ? audits : [];
  const scores = list.map((item) => Number(item.health && item.health.score)).filter((n) => Number.isFinite(n));
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return {
    count: list.length,
    max: MAX_PAGE_AUDITS,
    auditVersion: AUDIT_VERSION,
    avgHealth: avg,
    blockerPages: list.filter((item) => (item.criticalCount || (item.summary && item.summary.criticalCount) || 0) > 0).length,
    storage: "system_settings/seo_intelligence.pageAudits",
    preferredCollectionBlocked: "seo_page_audits requires admin-only Firestore rules before use",
    note: "Page SEO Health is diagnostic only. No Google ranking score. Phase 2 does not apply fixes."
  };
}

module.exports = {
  AUDIT_VERSION,
  MAX_PAGE_AUDITS,
  MAX_FINDINGS,
  SEVERITIES,
  CONFIDENCES,
  AUTO_FIX_LEVELS,
  DIMENSIONS,
  PAGE_TYPES,
  PUBLIC_CONTENT_COLLECTIONS,
  AUDIT_WRITE_ALLOWLIST,
  isValidSeverity,
  isValidConfidence,
  isValidAutoFixLevel,
  assertAllowedAuditWrite,
  normalizeFinding,
  countBySeverity,
  computeHealth,
  computePriority,
  mainOpportunity,
  buildDimensions,
  buildAuditRecord,
  compactAudit,
  summarizeAudits
};
