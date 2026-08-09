"use strict";

/**
 * Deterministic, source-only fact recovery for JOB drafts.
 *
 * The writer occasionally leaves an info-box field empty (or the repair layer
 * clears an ungrounded value). This module fills a small set of fields only
 * from text that was actually fetched from the source. Article prose is never
 * used as evidence, so a hallucination cannot become a "verified" fact merely
 * by being repeated in the body.
 */

const { ARTICLE_TYPES } = require("./constants");

const MAX_FACT_LENGTH = 220;

function cleanFact(value, max = MAX_FACT_LENGTH) {
  return String(value || "")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:;|\-–—]+|[\s;|\-–—]+$/g, "")
    .trim()
    .slice(0, max);
}

function flattenTables(tables) {
  const cells = [];
  for (const table of Array.isArray(tables) ? tables : []) {
    const rows = Array.isArray(table) ? table : table?.rows;
    for (const row of Array.isArray(rows) ? rows : []) {
      const rowCells = Array.isArray(row) ? row : row?.cells;
      if (Array.isArray(rowCells)) cells.push(rowCells.map((cell) => String(cell || "")).join(" | "));
    }
  }
  return cells.join("\n");
}

function sourceCorpus(source) {
  return [source?.pageTitle, source?.text, flattenTables(source?.tables)]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
}

function firstCaptured(text, patterns, max = MAX_FACT_LENGTH) {
  for (const pattern of patterns) {
    const flags = pattern.flags.replace(/g/g, "");
    const match = new RegExp(pattern.source, flags).exec(text);
    const value = cleanFact(match?.[1] || "", max);
    if (value) return value;
  }
  return "";
}

function extractSalary(text) {
  // Protect the period in "Rs." from being mistaken for sentence end.
  const salaryText = String(text || "").replace(/\bRs\./gi, "Rs");
  // Prefer a labelled salary/pay line. This prevents an application fee from
  // being mistaken for salary merely because both contain a rupee amount.
  const labelled = firstCaptured(salaryText, [
    /(?:salary|pay\s*scale|pay\s*level|वेतन(?:मान)?|सैलरी|remuneration|emoluments?|stipend)\s*[:\-–—]?\s*([^\n.;।]{2,200})/i,
    /((?:pay\s*level|level)\s*[-:]?\s*\d{1,2}[^\n.;।]{0,150}(?:₹|rs\.?|inr)?\s*\d[\d,]*(?:\.\d+)?[^\n.;।]{0,50})/i
  ]);
  if (labelled && /\d/.test(labelled)) return labelled;

  // Some notices list only "₹1,60,000 PMT" or "CTC 12 LPA" in a table.
  return firstCaptured(salaryText, [
    /((?:₹|rs\.?|inr)\s*\d[\d,]*(?:\.\d+)?\s*(?:pmt|per\s*month|\/month|lpa|per\s*annum|ctc))/i,
    /((?:ctc\s*)?\d+(?:\.\d+)?\s*(?:lpa|pmt|per\s*month|\/month|per\s*annum))/i
  ]);
}

function extractVacancies(text) {
  const value = firstCaptured(text, [
    /(?:total\s*)?(?:vacanc(?:y|ies)|posts?|पदों?|रिक्ति(?:यां)?|वैकेंसी)\s*[:\-–—]?\s*(\d[\d,]*)/i,
    /(\d[\d,]*)\s*(?:vacanc(?:y|ies)|posts?|पदों?|रिक्ति(?:यां)?|वैकेंसी)/i
  ], 30);
  if (!value) return "";
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) && numeric > 0 && numeric < 1_000_000 ? value : "";
}

function extractQualification(text) {
  return firstCaptured(text, [
    /(?:essential\s*)?(?:educational\s*)?(?:qualification|eligibility|योग्यता|शैक्षणिक\s*योग्यता)\s*[:\-–—]\s*([^\n.;।]{4,200})/i
  ]);
}

function extractOrganization(text) {
  return firstCaptured(text, [
    /(?:organization|organisation|department|संस्थान|संगठन|विभाग)\s*[:\-–—]\s*([^\n.;।|]{3,150})/i
  ], 160);
}

/**
 * Fill only empty JOB facts. Returns field names that were recovered.
 */
function harvestSmartFacts(article, source) {
  const filled = [];
  const type = String(article?.type || "").toLowerCase().replace(/_/g, "-");
  if (!article || (type !== ARTICLE_TYPES.JOB && type !== "job")) return filled;
  if (!article.facts || typeof article.facts !== "object") article.facts = {};

  const corpus = sourceCorpus(source);
  if (!corpus) return filled;

  const candidates = {
    salary: extractSalary(corpus),
    vacancies: extractVacancies(corpus),
    qualification: extractQualification(corpus),
    organization: extractOrganization(corpus)
  };

  for (const [field, value] of Object.entries(candidates)) {
    if (!value || String(article.facts[field] || "").trim()) continue;
    article.facts[field] = value;
    filled.push(field);
  }
  return filled;
}

module.exports = {
  harvestSmartFacts,
  sourceCorpus,
  flattenTables,
  extractSalary,
  extractVacancies,
  extractQualification,
  extractOrganization,
  cleanFact
};
