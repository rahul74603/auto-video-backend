"use strict";

/**
 * Content-type-aware fact/quality gate for SEO proposals.
 *
 * Reuses fact_quality_reviewer claim helpers and editorial/FAQ/discover
 * checks. Does NOT call reviewArticle() — that enforces JOB 1600-word
 * publish rules which must not block blog/update/mock/material applies.
 *
 * Gate never writes public content.
 */

const { CLICKBAIT_RE } = require("./discover");
const { scoreFaqUsefulness } = require("./article_faq");
const { pathFromInternalUrl } = require("./linking_engine");
const {
  isFactField,
  isApplyableField,
  isPlanOnlyField,
  FACT_FIELDS
} = require("./proposal_model");

function fail(code, message) {
  return { ok: false, verdict: "fail", code, issues: [message], warnings: [] };
}

function pass(warnings = []) {
  return { ok: true, verdict: "pass", code: "ok", issues: [], warnings };
}

function textOfProposed(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function loadClaimHelpers() {
  try {
    return require("../article_agents/fact_quality_reviewer");
  } catch {
    return null;
  }
}

function gateRelatedLinks(value) {
  const list = Array.isArray(value) ? value : [];
  if (!list.length) return fail("APPLY_EMPTY_LINKS", "relatedLinks proposal is empty");
  for (const item of list) {
    const url = String(item && (item.url || item.href) || "");
    if (!url.startsWith("/") || url.startsWith("//")) {
      return fail("APPLY_BAD_LINK", `related link is not a same-origin path: ${url.slice(0, 80)}`);
    }
    if (pathFromInternalUrl(url) !== url.split("?")[0] && !url.startsWith("/govt-jobs")) {
      if (!pathFromInternalUrl(url) && !url.startsWith("/")) {
        return fail("APPLY_BAD_LINK", `related link rejected: ${url.slice(0, 80)}`);
      }
    }
  }
  return null;
}

function gateFaqs(value) {
  const review = scoreFaqUsefulness(value);
  if (review.issues.length) {
    return fail("APPLY_FAQ_QUALITY", review.issues.join("; "));
  }
  return null;
}

/**
 * @param {object} proposal
 * @param {object} [page]
 * @param {object} [source] optional { text, url, links, tables } for JOB/FAST_TRACK grounding
 */
function gateProposal(proposal, page = {}, source = null) {
  if (!proposal || typeof proposal !== "object") {
    return fail("APPLY_PROPOSAL_MISSING", "proposal is missing");
  }
  const field = String(proposal.field || "");
  const contentType = String(proposal.contentType || page.contentType || "OTHER").toUpperCase();
  const warnings = [];

  if (isFactField(field) || FACT_FIELDS.includes(field)) {
    return fail("APPLY_FACT_LOCK", `Fact field ${field} is locked and cannot be applied`);
  }
  if (proposal.level === "C") {
    return fail("APPLY_LEVEL_C", "Level C proposals are never applied");
  }
  if (isPlanOnlyField(field)) {
    return fail("APPLY_PLAN_ONLY", `${field} is a review plan, not a public-content write`);
  }
  if (!isApplyableField(field) && field !== "howToApply") {
    return fail("APPLY_FIELD_NOT_ALLOWLISTED", `Field ${field} is not in the apply allowlist`);
  }
  if (proposal.proposedValue == null && field !== "schemaMarkup" && field !== "includeJobPostingSchema") {
    return fail("APPLY_NO_VALUE", "No proposed value to apply");
  }

  if (field === "seoTitle" || field === "h1") {
    const title = String(proposal.proposedValue || "");
    if (!title.trim()) return fail("APPLY_EMPTY_TITLE", "Proposed title is empty");
    if (CLICKBAIT_RE.test(title)) return fail("APPLY_CLICKBAIT", "Proposed title looks like clickbait");
  }

  if (field === "faqs") {
    const faqFail = gateFaqs(proposal.proposedValue);
    if (faqFail) return faqFail;
  }

  if (field === "relatedLinks") {
    const linkFail = gateRelatedLinks(proposal.proposedValue);
    if (linkFail) return linkFail;
  }

  if (field === "schemaMarkup" || field === "includeJobPostingSchema") {
    const proposed = String(proposal.proposedValue || "");
    if (!/omit JobPosting|includeJobPostingSchema.?false/i.test(proposed) && proposal.proposedValue !== false) {
      return fail("APPLY_SCHEMA_NOT_OMIT", "Schema apply only allows omitting JobPosting for closed/expired jobs");
    }
  }

  if ((contentType === "MOCK_TEST") && (field === "questions" || field === "answers")) {
    return fail("APPLY_MOCK_QUESTIONS", "Mock questions/answers cannot be applied or invented");
  }

  if ((contentType === "JOB" || contentType === "FAST_TRACK") && source && source.text) {
    const helpers = loadClaimHelpers();
    if (helpers) {
      const index = helpers.buildGroundingIndex(source);
      const blob = textOfProposed(proposal.proposedValue);
      const claims = helpers.extractClaims(blob);
      const ungrounded = claims.filter((claim) => !helpers.isClaimGrounded(claim, index.haystackNorm, index.sourceNumbers));
      if (ungrounded.length) {
        return fail(
          "APPLY_UNGROUNDED",
          `Proposed ${field} has facts not in the source: ${ungrounded[0].kind} ${String(ungrounded[0].value).slice(0, 40)}`
        );
      }
    } else {
      warnings.push("fact-reviewer-unavailable: claim grounding skipped");
    }
  }

  if (contentType === "BLOG") {
    warnings.push("blog-gate: JOB 1600-word publish rule is not applied");
  }

  return pass(warnings);
}

function previewProposal(proposal, page = {}) {
  const gate = gateProposal(proposal, page, page.source || null);
  return {
    proposalId: proposal && proposal.id,
    url: proposal && proposal.url,
    contentType: proposal && proposal.contentType,
    field: proposal && proposal.field,
    oldValue: proposal && proposal.oldValue,
    proposedValue: proposal && proposal.proposedValue,
    level: proposal && proposal.level,
    status: proposal && proposal.status,
    requiresReview: proposal && proposal.requiresReview,
    applyable: gate.ok && proposal && proposal.status === "approved" && proposal.level !== "C",
    gate
  };
}

module.exports = {
  gateProposal,
  previewProposal
};
