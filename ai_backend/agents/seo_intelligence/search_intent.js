"use strict";

/**
 * Search-intent classifier for StudyGyaan pages.
 * Aligns title/meta with what a real user is trying to do.
 * Never creates extra pages for the same intent.
 */

const { CONTENT_KINDS, detectContentKind } = require("./taxonomy");

const INTENTS = Object.freeze({
  APPLY: "APPLY",
  LATEST_UPDATE: "LATEST_UPDATE",
  INFORMATIONAL: "INFORMATIONAL",
  PRACTICE: "PRACTICE",
  NAVIGATIONAL: "NAVIGATIONAL"
});

function classifySearchIntent(input = {}) {
  const kind = input.contentKind || detectContentKind(input);
  if (kind === CONTENT_KINDS.MOCK_TEST) return INTENTS.PRACTICE;
  if (kind === CONTENT_KINDS.JOB) return INTENTS.APPLY;
  if (
    kind === CONTENT_KINDS.ADMIT_CARD
    || kind === CONTENT_KINDS.RESULT
    || kind === CONTENT_KINDS.ANSWER_KEY
    || kind === CONTENT_KINDS.NEWS
  ) {
    return INTENTS.LATEST_UPDATE;
  }
  if (kind === CONTENT_KINDS.SYLLABUS || kind === CONTENT_KINDS.BLOG || kind === CONTENT_KINDS.MATERIAL) {
    return INTENTS.INFORMATIONAL;
  }
  return INTENTS.INFORMATIONAL;
}

function titleMatchesIntent(title, intent) {
  const text = String(title || "").toLowerCase();
  if (!text) return false;
  if (intent === INTENTS.APPLY) {
    return /\b(apply|application|recruitment|vacancy|bharti|भर्ती|आवेदन|notification)\b/i.test(text);
  }
  if (intent === INTENTS.LATEST_UPDATE) {
    return /\b(result|admit|answer\s*key|merit|cut[\s-]?off|declared|released|परिणाम|एडमिट)\b/i.test(text);
  }
  if (intent === INTENTS.PRACTICE) {
    return /\b(mock|practice|test|quiz|प्रैक्टिस)\b/i.test(text);
  }
  return true;
}

function assessIntentAlignment({ title, metaDescription, intent }) {
  const warnings = [];
  if (!titleMatchesIntent(title, intent)) {
    warnings.push(`intent:title-mismatch:${intent}`);
  }
  const meta = String(metaDescription || "");
  if (intent === INTENTS.APPLY && meta && !/\b(apply|last date|vacanc|eligibility|आवेदन|तिथि)\b/i.test(meta)) {
    warnings.push("intent:meta-missing-apply-cue");
  }
  return { aligned: warnings.length === 0, warnings };
}

module.exports = {
  INTENTS,
  classifySearchIntent,
  titleMatchesIntent,
  assessIntentAlignment
};
