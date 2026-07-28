"use strict";

/**
 * =======================================================
 *  ARTICLE AGENT PIPELINE (draft-first, publish-guarded)
 * =======================================================
 * Orchestrates:
 *   1. safe source fetch          (source_fetcher)
 *   2. Job Writer OR Fast Track Writer (separate agents)
 *   3. Fact & Quality Reviewer    (verification, duplicate & stuffing guard)
 *   4. Draft record assembly      (always status:'draft')
 *
 * PUBLISHING RULES
 *  - Automatic mode: draft only. Direct publish is impossible — the pipeline
 *    never produces a published record and `assertPublishable` is required
 *    before any collection write.
 *  - A draft is publishable only when the independent reviewer verdict is
 *    'pass' (`reviewStatus === 'passed'`).
 */

const crypto = require("crypto");
const { ARTICLE_TYPES, EDITORIAL_AUTHOR } = require("./constants");
const { generateJobArticle, normalizeJobArticle } = require("./job_article_writer");
const { generateFastTrackArticle, normalizeFastTrackArticle } = require("./fast_track_article_writer");
const { reviewArticle, parseDateFlexible } = require("./fact_quality_reviewer");
const { fetchAndExtractSource } = require("./source_fetcher");
const { normalizeArticleHtml } = require("./article_html_utils");

const DRAFT_COLLECTION = "ai_article_drafts";

function cleanType(type) {
  const lower = String(type || "").toLowerCase().replace(/_/g, "-");
  if (lower === ARTICLE_TYPES.JOB || lower === "job") return ARTICLE_TYPES.JOB;
  if (lower === ARTICLE_TYPES.FAST_TRACK || lower === "fasttrack" || lower === "fast-track") {
    return ARTICLE_TYPES.FAST_TRACK;
  }
  const err = new Error(`Unknown article type '${type}'. Use 'job' or 'fast-track'.`);
  err.code = "UNKNOWN_ARTICLE_TYPE";
  throw err;
}

function writerFor(type) {
  return type === ARTICLE_TYPES.JOB ? generateJobArticle : generateFastTrackArticle;
}

/** Compact, reviewable snapshot of the fetched source (for re-checks without re-downloading). */

/**
 * Firestore arrays ke andar arrays allow nahi karta ("invalid nested entity"),
 * isliye tables ko save karte waqt object-shape me pack karte hain:
 *   [["a","b"],["c"]]  →  [{ rows: [{ cells: ["a","b"] }, { cells: ["c"] }] }]
 */
function packTables(tables) {
  return (Array.isArray(tables) ? tables : []).slice(0, 15).map((rows) => ({
    rows: (Array.isArray(rows) ? rows : []).slice(0, 80).map((cells) => ({
      cells: (Array.isArray(cells) ? cells : []).slice(0, 14).map((c) => String(c ?? "").slice(0, 300))
    }))
  }));
}

/** Pack kiye tables ko wapas normal array-of-arrays shape me laata hai.
 *  Dono shapes sambhalta hai (fresh in-memory arrays bhi pass-through hote hain). */
function unpackTables(stored) {
  if (!Array.isArray(stored)) return [];
  return stored
    .map((t) => {
      if (Array.isArray(t)) return t; // fresh/unpacked shape
      if (t && Array.isArray(t.rows)) {
        return t.rows.map((r) => (r && Array.isArray(r.cells) ? r.cells : [])).filter((r) => r.length);
      }
      return [];
    })
    .filter((r) => r.length);
}

function snapshotOf(source) {
  return {
    url: source.url,
    fetchedAt: source.fetchedAt,
    pageTitle: source.pageTitle || "",
    text: String(source.text || "").slice(0, 12000),
    tables: packTables(source.tables),
    links: (source.links || []).slice(0, 80),
    sha256: crypto.createHash("sha256").update(String(source.text || "")).digest("hex")
  };
}

/**
 * Run the full generate→review chain. Always returns a draft record;
 * review failure is recorded (`reviewStatus:'failed'`) and publishing stays blocked.
 */
async function runGeneratePipeline({ type, sourceUrl, instructions, mode, source, existing }, deps = {}) {
  const cleanArticleType = cleanType(type);
  const fetchedSource = source || (await fetchAndExtractSource(sourceUrl, deps.fetchDeps));
  // Snapshot se aaya source ho to packed tables ko normal shape me lao.
  fetchedSource.tables = unpackTables(fetchedSource.tables);
  const generate = writerFor(cleanArticleType);
  const article = await generate(
    { source: fetchedSource, instructions },
    deps.writerDeps || {}
  );
  const review = reviewArticle({
    type: article.type,
    article,
    source: fetchedSource,
    existing
  });
  return buildDraftRecord({
    type: cleanArticleType,
    article,
    review,
    source: fetchedSource,
    mode,
    instructions
  });
}

/**
 * Re-run the reviewer over an already-edited article (Apply flow) using the
 * stored source snapshot.
 */
function reReview({ type, article, sourceSnapshot, existing }) {
  const source = { ...(sourceSnapshot || {}), tables: unpackTables(sourceSnapshot?.tables) };
  const normalized =
    type === ARTICLE_TYPES.JOB
      ? normalizeJobArticle(article, { source })
      : normalizeFastTrackArticle(article, { source });
  const review = reviewArticle({ type: normalized.type, article: normalized, source, existing });
  return { article: normalized, review };
}

/**
 * Assemble the Firestore draft document. This function must NEVER return a
 * published record — publication is a separate guarded step.
 */
function buildDraftRecord({ type, article, review, source, mode, instructions }) {
  return {
    type: article.type, // 'JOB' | 'FAST_TRACK' — kept compatible with site schema
    articleType: type,
    status: "draft", // draft-first: automatic pipelines can never publish directly
    publishBlocked: review.verdict !== "pass",
    reviewStatus: review.verdict === "pass" ? "passed" : "failed",
    reviewReport: review,
    title: article.facts.title || article.h1,
    h1: article.h1,
    slug: article.slug,
    seoTitle: article.seoTitle,
    metaDescription: article.metaDescription,
    shortDescription: article.shortDescription,
    articleHtml: article.contentHtml,
    faqs: article.faqs,
    facts: article.facts,
    officialLinks: article.officialLinks,
    keywords: article.keywords,
    structuredData: JSON.stringify(article.structuredData),
    authorName: EDITORIAL_AUTHOR,
    wordCount: article.wordCount,
    sourceUrl: source.url,
    sourceSnapshot: snapshotOf(source),
    mode: mode === "auto" ? "auto" : "manual",
    instructions: String(instructions || "").slice(0, 1500),
    publishedDocId: null,
    publishedCollection: null,
    version: 1
  };
}

/**
 * Guard executed right before any write into a public collection.
 * Throws with code PUBLISH_BLOCKED when review failed or draft was edited
 * after the last successful review, and ALREADY_PUBLISHED on re-publish.
 */
function assertPublishable(draft) {
  if (!draft || typeof draft !== "object") {
    const err = new Error("Draft not found");
    err.code = "DRAFT_NOT_FOUND";
    throw err;
  }
  if (draft.status === "published") {
    const err = new Error("Draft is already published");
    err.code = "ALREADY_PUBLISHED";
    throw err;
  }
  if (draft.reviewStale === true) {
    const err = new Error("Draft was edited after the last review — run Apply/Regenerate (review) first");
    err.code = "PUBLISH_BLOCKED";
    throw err;
  }
  if (draft.reviewStatus !== "passed") {
    const err = new Error(
      `Publish blocked: Fact & Quality review ${draft.reviewStatus === "failed" ? "FAILED" : "not passed yet"}` +
        (draft.reviewReport?.issues?.length ? ` — ${draft.reviewReport.issues.slice(0, 3).join("; ")}` : "")
    );
    err.code = "PUBLISH_BLOCKED";
    throw err;
  }
  return true;
}

const JOB_FIELD_MAP = [
  ["organization", "organization"],
  ["advtNo", "advtNo"],
  ["category", "category"],
  ["startDate", "startDate"],
  ["lastDate", "lastDate"],
  ["examDate", "examDate"],
  ["vacancies", "vacancies"],
  ["salary", "salary"],
  ["qualification", "qualification"],
  ["minAge", "minAge"],
  ["ageLimit", "ageLimit"],
  ["location", "location"],
  ["selectionProcess", "selectionProcess"],
  ["eligibility", "eligibility"],
  ["feeGen", "feeGen"],
  ["feeSCST", "feeSCST"],
  ["feeFemale", "feeFemale"],
  ["feeOBC", "feeOBC"],
  ["applicationFee", "applicationFee"],
  ["applyLink", "applyLink"],
  ["notificationLink", "notificationLink"],
  ["officialSiteLink", "officialSiteLink"]
];

function stripEmpty(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Job panel ke date fields sanitize karo:
 *  - parseable date → ISO yyyy-mm-dd (site ka countdown/format kabhi na toote)
 *  - digit-wala partial text ("Sept 2026 expected") → waise ka waisa rakho
 *  - junk placeholder ("as per rules", "नियमों के अनुसार", "-") → DROP (field chhup jayega)
 */
function sanitizeJobDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = parseDateFlexible(raw);
  if (parsed) return parsed.toISOString().slice(0, 10);
  return /\d/.test(raw) ? raw.slice(0, 40) : "";
}

/**
 * Fee fields sanitize karo — site ka template khud ₹ lagata hai, isliye
 * AI wali ₹/Rs hatao: "₹1000/-" → "1000", "₹Nil"/"Free" → "0",
 * digit hi na ho (text junk) → DROP.
 */
function sanitizeJobFee(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/\d/.test(raw)) {
    return /(nil|free|no\s*fee|n\/a|na\b)/i.test(raw) ? "0" : "";
  }
  const num = raw.replace(/,/g, "").match(/\d+/);
  return num ? num[0] : "";
}

/** Map a passed JOB draft to the existing `jobs` document shape (back-compatible). */
function buildJobPublishPayload(draft, draftId) {
  const facts = draft.facts || {};
  const mapped = {
    title: draft.title,
    slug: draft.slug,
    metaDescription: draft.metaDescription,
    description: draft.shortDescription || draft.metaDescription,
    articleHtml: draft.articleHtml,
    faqs: draft.faqs || [],
    officialLinks: draft.officialLinks || [],
    schemaMarkup: draft.structuredData || "",
    authorName: EDITORIAL_AUTHOR,
    author: EDITORIAL_AUTHOR,
    type: "JOB",
    status: "published",
    keywords: draft.keywords || [],
    wordCount: draft.wordCount || 0,
    sourceUrl: draft.sourceUrl || "",
    publishedFromDraftId: draftId
  };
  for (const [from, to] of JOB_FIELD_MAP) mapped[to] = facts[from];
  // Site ke info-box ke liye dates/fees sanitize (galat format/junk panel me na jaye)
  mapped.startDate = sanitizeJobDate(mapped.startDate);
  mapped.lastDate = sanitizeJobDate(mapped.lastDate);
  mapped.examDate = sanitizeJobDate(mapped.examDate);
  for (const feeField of ["feeGen", "feeOBC", "feeSCST", "feeFemale"]) {
    mapped[feeField] = sanitizeJobFee(mapped[feeField]);
  }
  if (typeof mapped.applicationFee === "string") {
    mapped.applicationFee = mapped.applicationFee.replace(/₹\s*₹+/g, "₹").trim();
  }
  return stripEmpty(mapped);
}

/** Map a passed FAST_TRACK draft to the existing `fast_track` document shape. */
function buildFastTrackPublishPayload(draft, draftId) {
  const facts = draft.facts || {};
  return stripEmpty({
    title: draft.title,
    slug: draft.slug,
    category: facts.category || "Other",
    org: facts.org || "",
    updateDate: facts.updateDate || "",
    directLink: facts.directLink || "",
    shortInfo: draft.shortDescription || draft.metaDescription || "",
    description: draft.shortDescription || "",
    metaDescription: draft.metaDescription,
    articleHtml: draft.articleHtml,
    faqs: draft.faqs || [],
    officialLinks: draft.officialLinks || [],
    schemaMarkup: draft.structuredData || "",
    authorName: EDITORIAL_AUTHOR,
    status: "published",
    keywords: draft.keywords || [],
    wordCount: draft.wordCount || 0,
    sourceUrl: draft.sourceUrl || "",
    publishedFromDraftId: draftId
  });
}

function buildPublishPayload(draft, draftId) {
  const type = draft.type === "JOB" || draft.articleType === ARTICLE_TYPES.JOB ? "JOB" : "FAST_TRACK";
  return {
    collection: type === "JOB" ? "jobs" : "fast_track",
    payload: type === "JOB" ? buildJobPublishPayload(draft, draftId) : buildFastTrackPublishPayload(draft, draftId)
  };
}

module.exports = {
  DRAFT_COLLECTION,
  cleanType,
  runGeneratePipeline,
  reReview,
  buildDraftRecord,
  assertPublishable,
  buildJobPublishPayload,
  buildFastTrackPublishPayload,
  buildPublishPayload,
  normalizeArticleHtml,
  sanitizeJobDate,
  sanitizeJobFee,
  packTables,
  unpackTables
};
