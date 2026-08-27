"use strict";

/**
 * SEO optimization proposal model — Phase 3.
 *
 * Proposals are reviewable only. Approved status does NOT apply anything.
 * Never writes public content collections.
 *
 * seo_optimization_proposals is NOT used: current Firestore catch-all
 * would make that collection public-read. Persist on
 * system_settings/seo_intelligence.optimizationProposals (admin-only).
 */

const {
  PUBLIC_CONTENT_COLLECTIONS,
  AUDIT_WRITE_ALLOWLIST,
  assertAllowedAuditWrite,
  AUDIT_VERSION,
  MAX_PAGE_AUDITS
} = require("./audit_model");

const PROPOSAL_VERSION = 1;
const MAX_PROPOSALS_PER_PAGE = 6;
const MAX_PROPOSALS = 80;
const MAX_APPLY_BATCH = 5;
const SNAPSHOT_COLLECTION = "seo_apply_snapshots";
const QUEUE_COLLECTION = "seo_apply_queue";
const BODY_COLLECTION = "seo_proposal_bodies";
const MAX_HTML_PROPOSALS = 12;
const MAX_HTML_CHARS = 20000;
const HTML_INLINE_CHARS = 8000;
const STATUSES = Object.freeze(["pending", "approved", "rejected", "applied", "failed", "rolled_back"]);
const LEVELS = Object.freeze(["A", "B", "C"]);
const REVIEW_STATUSES = Object.freeze(["approved", "rejected"]);
const TERMINAL_STATUSES = Object.freeze(["applied", "rolled_back", "rejected"]);

const CONTENT_COLLECTION_MAP = Object.freeze({
  BLOG: "blogs",
  JOB: "jobs",
  FAST_TRACK: "fast_track",
  MOCK_TEST: "mock_tests",
  STUDY_MATERIAL: "study_materials",
  COURSE: "courses",
  EBOOK: "jobs",
  WEB_STORY: "web_stories"
});

const APPLYABLE_FIELDS = Object.freeze([
  "seoTitle",
  "metaDescription",
  "h1",
  "authorName",
  "imageAlt",
  "faqs",
  "relatedLinks",
  "includeJobPostingSchema",
  "schemaMarkup",
  "howToApply",
  "articleHtml"
]);

const APPLY_WRITE_ALLOWLIST = Object.freeze([
  "system_settings",
  "seo_intelligence_runs",
  SNAPSHOT_COLLECTION,
  QUEUE_COLLECTION,
  BODY_COLLECTION
]);

const PLAN_ONLY_FIELDS = Object.freeze([
  "contentPlan",
  "headingPlan",
  "contentTable",
  "howToApplySection"
]);

const FACT_FIELDS = Object.freeze([
  "organization",
  "vacancies",
  "salary",
  "qualification",
  "eligibility",
  "dates",
  "lastDate",
  "startDate",
  "fees",
  "fee",
  "age",
  "applyLink",
  "notificationLink",
  "officialSiteLink",
  "directLink",
  "advtNo",
  "selectionProcess",
  "questions",
  "answers",
  "officialFacts"
]);

function isFactField(field) {
  return FACT_FIELDS.includes(String(field || ""));
}

function collectionForContentType(contentType) {
  return CONTENT_COLLECTION_MAP[String(contentType || "").toUpperCase()] || null;
}

function isApplyableField(field) {
  return APPLYABLE_FIELDS.includes(String(field || ""));
}

function isPlanOnlyField(field) {
  return PLAN_ONLY_FIELDS.includes(String(field || ""));
}

function assertAllowedProposalWrite(collectionName) {
  return assertAllowedAuditWrite(collectionName);
}

function assertAllowedApplyWrite(collectionName) {
  const name = String(collectionName || "");
  if (PUBLIC_CONTENT_COLLECTIONS.includes(name)) {
    const err = new Error(`apply internals refused to treat public content as a snapshot store: ${name}`);
    err.code = "APPLY_WRITE_FORBIDDEN";
    throw err;
  }
  if (!APPLY_WRITE_ALLOWLIST.includes(name) && !AUDIT_WRITE_ALLOWLIST.includes(name)) {
    const err = new Error(`apply internals may only persist to ${APPLY_WRITE_ALLOWLIST.join(", ")} (got ${name})`);
    err.code = "APPLY_WRITE_FORBIDDEN";
    throw err;
  }
  return true;
}

function extractArticleHtml(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.articleHtml === "string") {
    return value.articleHtml;
  }
  return "";
}

function compactHtmlProposed(value) {
  if (typeof value === "string") {
    const html = value.slice(0, MAX_HTML_CHARS);
    return {
      articleHtml: html,
      previewText: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280)
    };
  }
  if (!value || typeof value !== "object") return value;
  const html = typeof value.articleHtml === "string" ? value.articleHtml.slice(0, MAX_HTML_CHARS) : value.articleHtml;
  const preview = value.preview && typeof value.preview === "object" ? value.preview : {};
  return {
    articleHtml: html,
    previewText: value.previewText
      || (typeof html === "string" ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280) : ""),
    headings: Array.isArray(preview.headings) ? preview.headings.slice(0, 12) : (Array.isArray(value.headings) ? value.headings.slice(0, 12) : []),
    wordCount: preview.wordCount != null ? preview.wordCount : (value.wordCount != null ? value.wordCount : null),
    contentPlan: value.contentPlan || null,
    insufficientSource: Boolean(value.insufficientSource),
    htmlSource: value.htmlSource || null,
    htmlRef: value.htmlRef || null
  };
}

function slugId(parts) {
  return String(parts.filter(Boolean).join("-"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "proposal";
}

function buildProposal(raw = {}) {
  const field = String(raw.field || "");
  const level = LEVELS.includes(raw.level) ? raw.level : "B";
  const status = STATUSES.includes(raw.status) ? raw.status : "pending";
  const factLocked = isFactField(field);
  const effectiveLevel = factLocked ? "C" : level;
  const proposedValue = factLocked ? null : (raw.proposedValue === undefined ? null : raw.proposedValue);
  const requiresReview = effectiveLevel !== "A";
  return {
    id: String(raw.id || slugId([raw.contentId, field, (raw.evidenceIds || [])[0]])).slice(0, 120),
    url: String(raw.url || "").slice(0, 300),
    contentType: String(raw.contentType || "OTHER"),
    contentId: String(raw.contentId || "").slice(0, 120),
    field,
    oldValue: raw.oldValue === undefined ? null : raw.oldValue,
    proposedValue,
    reason: String(raw.reason || "").slice(0, 800),
    evidenceIds: Array.isArray(raw.evidenceIds) ? raw.evidenceIds.map(String).slice(0, 12) : [],
    severity: raw.severity || "low",
    confidence: raw.confidence || "heuristic",
    level: effectiveLevel,
    requiresReview,
    status,
    applied: false,
    createdAt: raw.createdAt || new Date().toISOString(),
    auditVersion: raw.auditVersion || AUDIT_VERSION,
    proposalVersion: PROPOSAL_VERSION,
    source: raw.source || "deterministic-optimizer"
  };
}

function compactProposal(proposal) {
  const record = buildProposal(proposal);
  const isHtml = record.field === "articleHtml";
  return {
    id: record.id,
    url: record.url,
    contentType: record.contentType,
    contentId: record.contentId,
    field: record.field,
    oldValue: typeof record.oldValue === "string"
      ? record.oldValue.slice(0, isHtml ? 2000 : 280)
      : record.oldValue,
    proposedValue: isHtml ? compactHtmlProposed(record.proposedValue) : record.proposedValue,
    reason: record.reason,
    evidenceIds: record.evidenceIds,
    severity: record.severity,
    confidence: record.confidence,
    level: record.level,
    requiresReview: record.requiresReview,
    status: record.status,
    applied: Boolean(proposal && proposal.applied),
    snapshotId: proposal && proposal.snapshotId ? String(proposal.snapshotId).slice(0, 120) : null,
    appliedAt: proposal && proposal.appliedAt ? proposal.appliedAt : null,
    rolledBackAt: proposal && proposal.rolledBackAt ? proposal.rolledBackAt : null,
    lastError: proposal && proposal.lastError ? String(proposal.lastError).slice(0, 300) : null,
    createdAt: record.createdAt,
    auditVersion: record.auditVersion,
    source: record.source,
    htmlSource: proposal && proposal.htmlSource ? String(proposal.htmlSource).slice(0, 40) : (record.source || null),
    insufficientSource: Boolean(proposal && (proposal.insufficientSource || (proposal.proposedValue && proposal.proposedValue.insufficientSource)))
  };
}

function summarizeProposals(proposals) {
  const list = Array.isArray(proposals) ? proposals : [];
  const byLevel = { A: 0, B: 0, C: 0 };
  const byStatus = { pending: 0, approved: 0, rejected: 0, applied: 0, failed: 0, rolled_back: 0 };
  for (const item of list) {
    if (byLevel[item.level] !== undefined) byLevel[item.level] += 1;
    if (byStatus[item.status] !== undefined) byStatus[item.status] += 1;
  }
  return {
    count: list.length,
    max: MAX_PROPOSALS,
    perPage: MAX_PROPOSALS_PER_PAGE,
    byLevel,
    byStatus,
    storage: "system_settings/seo_intelligence.optimizationProposals",
    snapshots: SNAPSHOT_COLLECTION,
    preferredCollectionBlocked: "seo_optimization_proposals remains unused (would be public-read under catch-all rules)",
    note: "Approve never writes public content. Only applyProposal after snapshot + fact/quality gate may write allowlisted fields."
  };
}

/**
 * Approve/reject a pending proposal. Never sets applied=true.
 * Never mutates public content.
 */
function mergeProposalStatuses(previous, next) {
  const prevById = new Map((Array.isArray(previous) ? previous : []).map((item) => [item && item.id, item]));
  return (Array.isArray(next) ? next : []).map((item) => {
    const old = prevById.get(item && item.id);
    if (old && ["approved", "rejected", "applied", "failed", "rolled_back"].includes(old.status)
      && (!item.status || item.status === "pending")) {
      return {
        ...item,
        status: old.status,
        applied: Boolean(old.applied),
        snapshotId: old.snapshotId || item.snapshotId || null,
        appliedAt: old.appliedAt || null,
        rolledBackAt: old.rolledBackAt || null,
        reviewedAt: old.reviewedAt || null
      };
    }
    return { ...item, applied: Boolean(item.applied) };
  });
}

function setProposalStatus(proposals, id, status, { now } = {}) {
  const nextStatus = String(status || "");
  if (!["approved", "rejected"].includes(nextStatus)) {
    const err = new Error(`proposal status must be approved or rejected (got ${nextStatus})`);
    err.code = "PROPOSAL_STATUS_INVALID";
    throw err;
  }
  const list = Array.isArray(proposals) ? proposals : [];
  return list.map((item) => {
    if (!item || item.id !== id) return item;
    if (item.status !== "pending") return item;
    return {
      ...item,
      status: nextStatus,
      applied: false,
      reviewedAt: (now || new Date()).toISOString()
    };
  });
}

function sortFindings(findings) {
  const order = { blocker: 0, high: 1, medium: 2, low: 3 };
  return (findings || []).slice().sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
}

module.exports = {
  PROPOSAL_VERSION,
  MAX_PROPOSALS_PER_PAGE,
  MAX_PROPOSALS,
  MAX_APPLY_BATCH,
  SNAPSHOT_COLLECTION,
  QUEUE_COLLECTION,
  BODY_COLLECTION,
  APPLY_WRITE_ALLOWLIST,
  MAX_HTML_PROPOSALS,
  MAX_HTML_CHARS,
  HTML_INLINE_CHARS,
  STATUSES,
  LEVELS,
  REVIEW_STATUSES,
  TERMINAL_STATUSES,
  FACT_FIELDS,
  CONTENT_COLLECTION_MAP,
  APPLYABLE_FIELDS,
  PLAN_ONLY_FIELDS,
  PUBLIC_CONTENT_COLLECTIONS,
  AUDIT_WRITE_ALLOWLIST,
  MAX_PAGE_AUDITS,
  isFactField,
  isApplyableField,
  isPlanOnlyField,
  collectionForContentType,
  assertAllowedProposalWrite,
  assertAllowedApplyWrite,
  extractArticleHtml,
  compactHtmlProposed,
  slugId,
  buildProposal,
  compactProposal,
  summarizeProposals,
  mergeProposalStatuses,
  setProposalStatus,
  sortFindings
};
