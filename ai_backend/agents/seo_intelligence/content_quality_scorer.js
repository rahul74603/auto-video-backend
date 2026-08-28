"use strict";

/**
 * Content Quality Scorer — multi-dimensional quality audit for StudyGyaan pages.
 *
 * Produces a 0–100 quality score from existing page data.
 * Never invents facts. Never rewrites content. Read-only diagnostic.
 *
 * Dimensions:
 *   completeness  — title, meta, body, headings, tables, lists
 *   factualSafety — source citation, official links, fact presence
 *   searchIntent  — title/meta alignment with detected intent
 *   readability   — word count, sentence length, structure
 *   structure     — headings hierarchy, sections, lists
 *   internalLinking — related links, body links
 *   metadata      — seoTitle, metaDescription, h1, author, imageAlt
 *   trust         — author, source, official links
 *   freshness     — age, update recency
 *   duplicationRisk — title similarity with catalog
 */

const { detectExamFamily, detectContentKind } = require("./taxonomy");
const { classifySearchIntent, assessIntentAlignment } = require("./search_intent");
const { classifyJobLifecycle } = require("./job_lifecycle");
const { scoreFaqUsefulness } = require("./article_faq");
const { findImagesMissingAlt } = require("./image_seo");
const { CLICKBAIT_RE, isAllCapsTitle } = require("./discover");
const { pathFromInternalUrl, SITE_HOST } = require("./linking_engine");

const QUALITY_VERSION = 1;

const DIMENSION_WEIGHTS = Object.freeze({
  completeness: 20,
  factualSafety: 15,
  searchIntent: 10,
  readability: 10,
  structure: 10,
  internalLinking: 10,
  metadata: 10,
  trust: 5,
  freshness: 5,
  duplicationRisk: 5
});

const SHORT_OK_TYPES = new Set(["FAST_TRACK", "MOCK_TEST", "STUDY_MATERIAL", "COURSE", "EBOOK", "WEB_STORY"]);
const UPDATE_KINDS = new Set(["ADMIT_CARD", "RESULT", "ANSWER_KEY", "NEWS", "SYLLABUS"]);

function plainText(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function countWords(textOrHtml) {
  const source = String(textOrHtml || "");
  const text = source.includes("<") ? plainText(source) : source;
  return text.split(/\s+/).filter((t) => /[A-Za-z0-9ऀ-ॿ]/.test(t.replace(/[.,;:!?'"\-–—|/\\[\]{}%₹]+/g, ""))).length;
}

function countTags(html, tag) {
  const re = new RegExp(`<${tag}\\b`, "gi");
  return (String(html || "").match(re) || []).length;
}

function titleOf(doc) {
  return String(doc.seoTitle || doc.title || doc.h1 || "").replace(/\s+/g, " ").trim();
}

function metaOf(doc) {
  return String(doc.metaDescription || doc.description || doc.excerpt || doc.shortInfo || "").replace(/\s+/g, " ").trim();
}

function htmlOf(doc) {
  return String(doc.articleHtml || doc.contentHtml || doc.content || doc.description || doc.shortInfo || "");
}

function isoDate(value) {
  if (!value) return "";
  try {
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  } catch { return ""; }
}

function detectPageType(doc) {
  const collection = String(doc.collection || "");
  const rawType = String(doc.typeRaw || doc.type || doc.articleType || "").toUpperCase().replace(/-/g, "_");
  if (collection === "blogs" || rawType === "BLOG") return "BLOG";
  if (collection === "mock_tests" || rawType === "MOCK_TEST") return "MOCK_TEST";
  if (collection === "web_stories" || rawType === "WEB_STORY") return "WEB_STORY";
  if (collection === "courses") return "COURSE";
  if (collection === "study_materials" || collection === "studyMaterials") return "STUDY_MATERIAL";
  if (collection === "fast_track" || rawType === "FAST_TRACK") return "FAST_TRACK";
  if (rawType === "EBOOK") return "EBOOK";
  if (collection === "jobs") return "JOB";
  return "OTHER";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function listAnchorHrefs(html) {
  const hrefs = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(String(html || "")))) hrefs.push(match[1]);
  return hrefs;
}

function internalHrefCount(html, relatedLinks) {
  const hrefs = listAnchorHrefs(html || "");
  let internal = 0;
  for (const href of hrefs) {
    if (href.startsWith("/") && !href.startsWith("//")) internal += 1;
    else if (pathFromInternalUrl(href)) internal += 1;
    else {
      try {
        const parsed = new URL(href);
        if (parsed.hostname === SITE_HOST || parsed.hostname.endsWith(`.${SITE_HOST}`)) internal += 1;
      } catch { /* ignore */ }
    }
  }
  const stored = Array.isArray(relatedLinks) ? relatedLinks.filter((item) => item && (item.url || item.href)).length : 0;
  return { inBody: internal, stored, total: internal + stored };
}

// ─── Dimension scorers ───────────────────────────────────────────────

function scoreCompleteness(doc, pageType) {
  let score = 50; // base
  const title = titleOf(doc);
  const meta = metaOf(doc);
  const html = htmlOf(doc);
  const text = plainText(html);
  const words = countWords(html || text);
  const h2 = countTags(html, "h2");
  const tables = countTags(html, "table");
  const lists = countTags(html, "ul") + countTags(html, "ol");

  if (title) score += 10;
  else score -= 20;

  if (meta) score += 8;
  else if (pageType === "BLOG" || pageType === "JOB") score -= 10;

  if (SHORT_OK_TYPES.has(pageType)) {
    // Short-form content: no word-count penalty
    if (text || doc.shortInfo || doc.description) score += 10;
    if (pageType === "MOCK_TEST" && Array.isArray(doc.questions) && doc.questions.length) score += 15;
  } else {
    if (words >= 400) score += 12;
    else if (words >= 200) score += 6;
    else if (words < 50) score -= 15;
  }

  if (h2 >= 2) score += 5;
  if (tables >= 1) score += 3;
  if (lists >= 1) score += 3;

  if (pageType === "JOB") {
    if (doc.lastDate || doc.startDate) score += 4;
    if (doc.organization) score += 3;
    if (doc.applyLink || doc.directLink) score += 5;
  }

  return clamp(score, 0, 100);
}

function scoreFactualSafety(doc, pageType) {
  let score = 60;
  const sourceUrl = String(doc.sourceUrl || (doc.sourceCitation && doc.sourceCitation.url) || "").trim();
  const officialLink = doc.applyLink || doc.directLink;

  if (sourceUrl || officialLink) score += 20;
  else if (pageType === "JOB" || pageType === "FAST_TRACK") score -= 15;

  if (pageType === "JOB") {
    if (doc.organization) score += 5;
    if (doc.lastDate) score += 5;
    if (doc.vacancies || doc.salary || doc.qualification) score += 5;
  }

  if (pageType === "FAST_TRACK") {
    if (doc.shortInfo || doc.description) score += 10;
    if (Array.isArray(doc.officialLinks) && doc.officialLinks.length) score += 5;
  }

  return clamp(score, 0, 100);
}

function scoreSearchIntent(doc, pageType, contentKind) {
  const title = titleOf(doc);
  if (!title) return 30;

  const intent = classifySearchIntent({
    type: pageType === "FAST_TRACK" ? "FAST_TRACK" : pageType,
    title,
    contentKind,
    category: doc.category
  });

  const alignment = assessIntentAlignment({
    title,
    metaDescription: metaOf(doc),
    intent
  });

  let score = 70;
  if (alignment.aligned) score += 25;
  else score -= 20;

  if (CLICKBAIT_RE.test(title) || isAllCapsTitle(title)) score -= 25;

  return clamp(score, 0, 100);
}

function scoreReadability(doc, pageType) {
  const html = htmlOf(doc);
  const text = plainText(html);
  const words = countWords(html || text);

  if (SHORT_OK_TYPES.has(pageType)) {
    // Short-form: readability is about clarity, not length
    if (text && text.length > 0) return 75;
    return 50;
  }

  let score = 60;
  if (words >= 300 && words <= 2000) score += 20;
  else if (words >= 200) score += 10;
  else if (words < 100) score -= 15;

  const h2 = countTags(html, "h2");
  if (h2 >= 2) score += 10;
  if (h2 >= 4) score += 5;

  const lists = countTags(html, "ul") + countTags(html, "ol");
  if (lists >= 1) score += 5;

  return clamp(score, 0, 100);
}

function scoreStructure(doc, pageType) {
  const html = htmlOf(doc);
  const h1 = countTags(html, "h1");
  const h2 = countTags(html, "h2");
  const h3 = countTags(html, "h3");
  const tables = countTags(html, "table");
  const lists = countTags(html, "ul") + countTags(html, "ol");

  let score = 50;

  if (h1 === 1) score += 15;
  else if (h1 === 0 && html.includes("<")) score -= 10;
  else if (h1 > 1) score -= 5;

  if (h2 >= 2) score += 15;
  else if (h2 === 1) score += 8;

  if (h3 >= 1) score += 5;
  if (tables >= 1) score += 5;
  if (lists >= 1) score += 5;

  if (pageType === "JOB") {
    const blob = `${html} ${doc.description || ""}`;
    if (/आवेदन कैसे|how to apply|apply online/i.test(blob)) score += 5;
  }

  return clamp(score, 0, 100);
}

function scoreInternalLinking(doc, pageType) {
  const html = htmlOf(doc);
  const counts = internalHrefCount(html, doc.relatedLinks);

  let score = 40;
  if (counts.total >= 3) score += 35;
  else if (counts.total >= 1) score += 20;

  if (counts.stored >= 2) score += 10;
  if (counts.inBody >= 1) score += 15;

  return clamp(score, 0, 100);
}

function scoreMetadata(doc, pageType) {
  const title = titleOf(doc);
  const meta = metaOf(doc);

  let score = 40;

  if (title) {
    score += 15;
    if (title.length >= 30 && title.length <= 65) score += 10;
    else if (title.length > 65 && title.length <= 70) score += 5;
    else if (title.length > 70) score -= 5;
    if (CLICKBAIT_RE.test(title) || isAllCapsTitle(title)) score -= 15;
  } else {
    score -= 20;
  }

  if (meta) {
    score += 10;
    if (meta.length >= 110 && meta.length <= 160) score += 10;
    else if (meta.length >= 70 && meta.length <= 180) score += 5;
  } else if (pageType === "BLOG" || pageType === "JOB") {
    score -= 10;
  }

  const author = String(doc.authorName || doc.author || "").trim();
  if (author) score += 5;

  return clamp(score, 0, 100);
}

function scoreTrust(doc, pageType) {
  let score = 50;

  const author = String(doc.authorName || doc.author || "").trim();
  if (author) score += 20;

  const sourceUrl = String(doc.sourceUrl || (doc.sourceCitation && doc.sourceCitation.url) || "").trim();
  if (sourceUrl) score += 15;

  const officialLink = doc.applyLink || doc.directLink;
  if (officialLink) score += 15;

  return clamp(score, 0, 100);
}

function scoreFreshness(doc, pageType, now) {
  const updated = isoDate(doc.updatedAt || doc.publishedAt || doc.createdAt);
  if (!updated) return 50;

  const ageDays = Math.floor((now.getTime() - new Date(updated).getTime()) / 86400000);
  if (!Number.isFinite(ageDays)) return 50;

  let score = 80;
  if (ageDays <= 30) score = 95;
  else if (ageDays <= 90) score = 85;
  else if (ageDays <= 180) score = 70;
  else if (ageDays <= 365) score = 55;
  else score = 35;

  return clamp(score, 0, 100);
}

function scoreDuplicationRisk(doc, catalog) {
  const title = titleOf(doc);
  if (!title || !Array.isArray(catalog) || catalog.length < 2) return 80;

  const titleTokens = title.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/).filter((t) => t.length > 3);
  const titleSet = new Set(titleTokens);

  let maxSimilarity = 0;
  for (const other of catalog) {
    if (!other || other.id === doc.id) continue;
    const otherTitle = titleOf(other);
    if (!otherTitle) continue;
    const otherTokens = otherTitle.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/).filter((t) => t.length > 3);
    if (!otherTokens.length || !titleSet.size) continue;
    let hits = 0;
    for (const t of otherTokens) if (titleSet.has(t)) hits++;
    const sim = hits / Math.max(titleSet.size, otherTokens.length);
    if (sim > maxSimilarity) maxSimilarity = sim;
  }

  let score = 90;
  if (maxSimilarity >= 0.9) score = 20;
  else if (maxSimilarity >= 0.7) score = 45;
  else if (maxSimilarity >= 0.5) score = 65;

  return clamp(score, 0, 100);
}

// ─── Main scorer ─────────────────────────────────────────────────────

function scorePage(doc, options = {}) {
  const now = options.now || new Date();
  const pageType = detectPageType(doc);
  const contentKind = doc.contentKind || detectContentKind({
    type: pageType === "FAST_TRACK" ? "FAST_TRACK" : pageType,
    title: titleOf(doc),
    category: doc.category
  });

  const dimensions = {
    completeness: scoreCompleteness(doc, pageType),
    factualSafety: scoreFactualSafety(doc, pageType),
    searchIntent: scoreSearchIntent(doc, pageType, contentKind),
    readability: scoreReadability(doc, pageType),
    structure: scoreStructure(doc, pageType),
    internalLinking: scoreInternalLinking(doc, pageType),
    metadata: scoreMetadata(doc, pageType),
    trust: scoreTrust(doc, pageType),
    freshness: scoreFreshness(doc, pageType, now),
    duplicationRisk: scoreDuplicationRisk(doc, options.catalog)
  };

  let weighted = 0;
  let totalWeight = 0;
  for (const [dim, score] of Object.entries(dimensions)) {
    const weight = DIMENSION_WEIGHTS[dim] || 0;
    weighted += score * weight;
    totalWeight += weight;
  }
  const overall = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;

  return {
    overall: clamp(overall, 0, 100),
    dimensions,
    pageType,
    contentKind,
    qualityVersion: QUALITY_VERSION,
    scoredAt: now.toISOString()
  };
}

function classifyQuality(score) {
  if (score >= 75) return "A"; // safe automatic improvement
  if (score >= 50) return "B"; // improvement possible, needs validation
  return "C"; // factual/source-sensitive, never auto-write
}

function needsImprovement(scoreResult, threshold = 75) {
  return scoreResult.overall < threshold;
}

module.exports = {
  QUALITY_VERSION,
  DIMENSION_WEIGHTS,
  scorePage,
  classifyQuality,
  needsImprovement,
  scoreCompleteness,
  scoreFactualSafety,
  scoreSearchIntent,
  scoreReadability,
  scoreStructure,
  scoreInternalLinking,
  scoreMetadata,
  scoreTrust,
  scoreFreshness,
  scoreDuplicationRisk,
  detectPageType,
  titleOf,
  metaOf,
  htmlOf,
  countWords,
  plainText
};
