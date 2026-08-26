"use strict";

/**
 * Article FAQ helpers (distinct from the video growth faq_engine).
 * Answers must stay source-grounded. Generic / invented FAQs are rejected.
 */

const GENERIC_QUESTION_RE =
  /^(what is (a |the )?(government job|sarkari naukri|ssc)\??|सरकारी नौकरी क्या है\??)$/i;
const PLACEHOLDER_ANSWER_RE =
  /^(official notification\s*(में|me)?\s*देखें\.?|see official notification\.?|n\/a|na|-)$/i;

function normalizeFaqList(faqs) {
  return (Array.isArray(faqs) ? faqs : [])
    .map((faq) => ({
      question: String(faq?.question || "").replace(/\s+/g, " ").trim(),
      answer: String(faq?.answer || "").replace(/\s+/g, " ").trim()
    }))
    .filter((faq) => faq.question && faq.answer)
    .slice(0, 12);
}

function scoreFaqUsefulness(faqs) {
  const list = normalizeFaqList(faqs);
  const issues = [];
  const warnings = [];
  if (!list.length) return { issues, warnings, usefulCount: 0 };

  let placeholder = 0;
  let generic = 0;
  for (const faq of list) {
    if (GENERIC_QUESTION_RE.test(faq.question)) generic += 1;
    if (PLACEHOLDER_ANSWER_RE.test(faq.answer) || faq.answer.length < 18) placeholder += 1;
  }
  if (generic >= 2) issues.push("faq:generic-questions");
  if (list.length >= 4 && placeholder === list.length) {
    issues.push("faq:placeholder-answers");
  } else if (placeholder >= 3) {
    warnings.push("faq:weak-answers");
  }
  return { issues, warnings, usefulCount: list.length - placeholder };
}

function buildFaqPageSchema(faqs) {
  const list = normalizeFaqList(faqs);
  if (!list.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: list.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer }
    }))
  };
}

module.exports = {
  normalizeFaqList,
  scoreFaqUsefulness,
  buildFaqPageSchema,
  GENERIC_QUESTION_RE,
  PLACEHOLDER_ANSWER_RE
};
