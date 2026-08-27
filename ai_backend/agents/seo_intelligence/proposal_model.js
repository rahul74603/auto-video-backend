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
const STATUSES = Object.freeze(["pending", "approved", "rejected"]);
const LEVELS = Object.freeze(["A", "B", "C"]);

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

function assertAllowedProposalWrite(collectionName) {
  return assertAllowedAuditWrite(collectionName);
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
  return {
    id: record.id,
    url: record.url,
    contentType: record.contentType,
    contentId: record.contentId,
    field: record.field,
    oldValue: typeof record.oldValue === "string" ? record.oldValue.slice(0, 280) : record.oldValue,
    proposedValue: record.proposedValue,
    reason: record.reason,
    evidenceIds: record.evidenceIds,
    severity: record.severity,
    confidence: record.confidence,
    level: record.level,
    requiresReview: record.requiresReview,
    status: record.status,
    applied: false,
    createdAt: record.createdAt,
    auditVersion: record.auditVersion
  };
}

function summarizeProposals(proposals) {
  const list = Array.isArray(proposals) ? proposals : [];
  const byLevel = { A: 0, B: 0, C: 0 };
  const byStatus = { pending: 0, approved: 0, rejected: 0 };
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
    preferredCollectionBlocked: "seo_optimization_proposals requires admin-only Firestore rules before use",
    note: "Phase 3 proposals are reviewable only. Approved does not apply. No public content writes."
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
    if (old && (old.status === "approved" || old.status === "rejected") && (!item.status || item.status === "pending")) {
      return { ...item, status: old.status, applied: false, reviewedAt: old.reviewedAt || null };
    }
    return { ...item, applied: false };
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
  STATUSES,
  LEVELS,
  FACT_FIELDS,
  PUBLIC_CONTENT_COLLECTIONS,
  AUDIT_WRITE_ALLOWLIST,
  MAX_PAGE_AUDITS,
  isFactField,
  assertAllowedProposalWrite,
  slugId,
  buildProposal,
  compactProposal,
  summarizeProposals,
  mergeProposalStatuses,
  setProposalStatus,
  sortFindings
};
