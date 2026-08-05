"use strict";

/**
 * =====================================================================
 *  ARTICLE SELF-REPAIR AGENT (deterministic layer — no LLM luck)
 * =====================================================================
 *  Review se PEHLE article ko deterministic rules se theek karta hai,
 *  taaki "writer ki chhoti galti" publish-block na ban jaye:
 *
 *   1. SEO hard-limits enforce  (seoTitle ≤ 70, metaDescription ≤ 170)
 *   2. facts info-box cleaning  — jisme aisa number/date hai jo SOURCE me
 *      hai hi nahi, wo field CLEAR (galat data site ke box me kabhi nahi)
 *   3. facts dates harvest      — body me likhi dates khaali info-box me bharo
 *   4. ungrounded FAQs DROP     — jisme source-me-na-mila number ho (tabhi
 *      jab 4+ FAQs bachti hon aur word-floor na toote)
 *
 *  Jo cheezein deterministically theek nahi ho sakti (word-count kam,
 *  sections missing, body-prose me ungrounded claims...) unke liye
 *  article_pipeline ka AUTO-REPAIR LOOP writer ko review-feedback dekar
 *  dobara likhwata hai.
 *
 *  Ye module writer ke prompt ke liye VERIFIED FACT SHEET bhi banata hai —
 *  source me maujood numbers/dates/amounts ki STRICT ALLOWLIST — taaki
 *  writer hallucinate kar hi na sake ("jo list me nahi, wo likhna mana").
 */

const {
  buildGroundingIndex,
  extractClaims,
  isClaimGrounded,
  numberSetOf
} = require("./fact_quality_reviewer");
const { harvestFactsDates } = require("./facts_date_harvester");
const {
  ARTICLE_TYPES,
  WORD_TARGET_MIN_JOB,
  WORD_TARGET_MIN_FAST_TRACK
} = require("./constants");
const { countWords } = require("./article_html_utils");

/**
 * Facts fields jinme GALAT number seedha site ke info-box me publish ho jata
 * hai — isliye ungrounded number milne par inhe CLEAR kar dena hi safe hai.
 * (title/organization jaise identity fields clear NAHI karte — wo review ka
 * org-name check pakadta hai.)
 */
const JOB_NUMERIC_FACT_FIELDS = [
  "startDate",
  "lastDate",
  "examDate",
  "vacancies",
  "salary",
  "minAge",
  "ageLimit",
  "feeGen",
  "feeSCST",
  "feeFemale",
  "feeOBC",
  "applicationFee"
];
const FT_NUMERIC_FACT_FIELDS = ["updateDate", "totalCandidates"];

const SEO_TITLE_MAX = 70;
const META_MAX = 170;

function normalizedType(articleType) {
  return String(articleType || "").toLowerCase().replace(/_/g, "-");
}

function minWordsFor(articleType) {
  return normalizedType(articleType) === ARTICLE_TYPES.FAST_TRACK
    ? WORD_TARGET_MIN_FAST_TRACK
    : WORD_TARGET_MIN_JOB;
}

/**
 * Source extract se verified numbers/dates/amounts ki allowlist.
 * Writer prompt me STRICT FACT SHEET ki tarah inject hota hai.
 */
function buildGroundingFactSheet(source) {
  const { haystack } = buildGroundingIndex(source);
  const claims = extractClaims(haystack);
  const numbers = [...numberSetOf(haystack)]
    .filter((n) => n.length <= 12)
    .sort((a, b) => Number(a) - Number(b) || a.length - b.length)
    .slice(0, 80);
  const uniq = (kind, cap) =>
    [...new Set(claims.filter((c) => c.kind === kind).map((c) => c.value.trim()))].slice(0, cap);
  const dates = uniq("date", 30);
  const amounts = uniq("money", 20);
  const vacancies = uniq("vacancy", 12);

  const lines = [
    "================ ⭐ VERIFIED FACT SHEET — STRICT ALLOWLIST (yahi ground truth hai) ================",
    "SOURCE EXTRACT me sirf ye numbers/dates/amounts maujood hain:",
    numbers.length ? `NUMBERS: ${numbers.join(", ")}` : "NUMBERS: (none found)",
    dates.length ? `DATES: ${dates.join(" | ")}` : "DATES: (none found)",
    amounts.length ? `AMOUNTS: ${amounts.join(" | ")}` : "AMOUNTS: (none found)",
    vacancies.length ? `POSTS/VACANCY PHRASES: ${vacancies.join(" | ")}` : "",
    "HARD RULE: article body, FAQs aur facts me jo bhi number / date / amount / percentage likho,",
    "wo upar ki lists me MILNA chahiye. Jo list me NA ho use likhna = hallucination = automatic FAIL.",
    "Koi fact source me na ho to uska JSON field \"\" khaali chhodo aur prose me sirf itna likho:",
    "'Official Notification में देखें' — apna koi number bilkul nahi."
  ];
  return { numbers, dates, amounts, vacancies, promptBlock: lines.filter(Boolean).join("\n") };
}

/**
 * Deterministic self-repair. Article ko in-place theek karta hai.
 * @param {object} article normalized writer article
 * @param {object} source fetched source extract
 * @param {object} [options] applyMode=true → sirf safe trims/harvest (admin-edits flow;
 *                 admin ne jaan-bujh kar bhari facts ko clear nahi karte)
 * @returns {string[]} kin cheezon ko repair kiya (draft record me log hota hai)
 */
function repairArticleDeterministically(article, source, { applyMode = false } = {}) {
  const repairs = [];
  if (!article || typeof article !== "object") return repairs;
  if (!article.facts || typeof article.facts !== "object") article.facts = {};

  // 1. SEO hard limits — reviewer in par issue banata hai
  const seoTitle = String(article.seoTitle || "");
  if (seoTitle.length > SEO_TITLE_MAX) {
    article.seoTitle = seoTitle.slice(0, SEO_TITLE_MAX).trim();
    repairs.push(`seo:title-trimmed:${seoTitle.length}→${article.seoTitle.length}`);
  }
  const meta = String(article.metaDescription || "");
  if (meta.length > META_MAX) {
    article.metaDescription = meta.slice(0, META_MAX).trim();
    repairs.push(`seo:meta-trimmed:${meta.length}→${article.metaDescription.length}`);
  }

  const index = source && source.text ? buildGroundingIndex(source) : null;

  // 2. facts info-box: ungrounded number/date → CLEAR (galat data publish kabhi nahi)
  if (index && !applyMode) {
    const fields =
      normalizedType(article.type) === ARTICLE_TYPES.FAST_TRACK
        ? FT_NUMERIC_FACT_FIELDS
        : JOB_NUMERIC_FACT_FIELDS;
    for (const field of fields) {
      const value = String(article.facts[field] || "").trim();
      if (!value) continue;
      const nums = [...numberSetOf(value)];
      if (nums.length && nums.some((n) => !index.sourceNumbers.has(n))) {
        article.facts[field] = "";
        repairs.push(`facts:${field}:cleared-ungrounded`);
      }
    }
  }

  // 3. facts dates harvest — body ki dates khaali info-box me bharo (JOB only)
  const filled = harvestFactsDates(article);
  for (const field of filled) repairs.push(`facts:${field}:harvested-from-body`);

  // 4. Ungrounded FAQs DROP — sirf jab 4+ FAQs bachti hon (reviewer min 4)
  //    aur word-floor na toot'ta ho (reviewer word-count bhi check karta hai).
  if (index && !applyMode && Array.isArray(article.faqs) && article.faqs.length > 4) {
    const badIdx = [];
    article.faqs.forEach((faq, i) => {
      const text = `${faq?.question || ""} ${faq?.answer || ""}`;
      const claims = extractClaims(text);
      if (claims.some((c) => !isClaimGrounded(c, index.haystackNorm, index.sourceNumbers))) {
        badIdx.push(i);
      }
    });
    if (badIdx.length) {
      const kept = article.faqs.filter((_, i) => !badIdx.includes(i));
      const droppedText = article.faqs
        .filter((_, i) => badIdx.includes(i))
        .map((f) => `${f.question} ${f.answer}`)
        .join(" ");
      const wordFloor = minWordsFor(article.type);
      const projectedWords = (article.wordCount || 0) - countWords(droppedText);
      if (kept.length >= 4 && projectedWords >= wordFloor) {
        article.faqs = kept;
        repairs.push(`faqs:dropped-ungrounded:${badIdx.length}`);
      }
    }
  }

  return repairs;
}

/**
 * Review-issue classifier: retry se theek hone wale vs kabhi theek na hone wale.
 * Fatal issues (duplicate content, expired notification, speculative, source
 * problems) par writer ko dobara likhwana sirf time/Gemini-quota waste hai —
 * pipeline wahi ruk jaata hai.
 */
const FATAL_ISSUE_RE = /^(duplicate:|freshness:expired|speculative:|source:)/;

function splitReviewIssues(issues) {
  const fatal = [];
  const fixable = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    (FATAL_ISSUE_RE.test(String(issue)) ? fatal : fixable).push(issue);
  }
  return { fatal, fixable };
}

module.exports = {
  repairArticleDeterministically,
  buildGroundingFactSheet,
  splitReviewIssues,
  FATAL_ISSUE_RE
};
