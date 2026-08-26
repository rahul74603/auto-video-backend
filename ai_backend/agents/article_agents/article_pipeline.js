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

/**
 * Sanitize the draft ka "origin" pointer (kis source se banaya gaya — JOBS AI
 * draft row ya Fast Track manager item). Publish ke baad origin doc bhi delete
 * hone wala hai — isliye yahan STRICT whitelist: sirf in do collections ko hi
 * delete kar paayega, koi arbitrary collection kabhi nahi.
 */
const ORIGIN_DELETE_COLLECTIONS = new Set(["job_drafts", "fast_track"]);

function sanitizeOriginRef(raw) {
  if (!raw || typeof raw !== "object") return null;
  const collection = String(raw.collection || "").trim();
  const id = String(raw.id || "").trim();
  if (!ORIGIN_DELETE_COLLECTIONS.has(collection)) return null;
  if (!id || id.length > 150 || /[/\\]/.test(id)) return null;
  return { collection, id };
}

const crypto = require("crypto");
const { ARTICLE_TYPES, EDITORIAL_AUTHOR, MAX_REPAIR_ATTEMPTS } = require("./constants");
const { generateJobArticle, normalizeJobArticle } = require("./job_article_writer");
const { generateFastTrackArticle, normalizeFastTrackArticle } = require("./fast_track_article_writer");
const { reviewArticle } = require("./fact_quality_reviewer");
const { toIsoDateString } = require("../growth/date_normalizer");
const { assertSourceArticleWorthy } = require("./source_adequacy_gate");
const { fetchAndExtractSource } = require("./source_fetcher");
const { normalizeArticleHtml } = require("./article_html_utils");
const {
  repairArticleDeterministically,
  splitReviewIssues
} = require("./article_repairer");
const { enrichContentDocument } = require("../seo_intelligence/enrich");
const { buildHistoryEntry, mergeUpdateHistory } = require("../seo_intelligence/update_history");

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
    // Apply/re-review ko wahi grounding evidence chahiye jo writer ne dekha tha.
    // 12k truncation se long PDFs ke aakhri facts jhoothe "hallucination" lagte
    // the; 60k Firestore's document limit ke andar rehte hue full input rakhta hai.
    text: String(source.text || "").slice(0, 60000),
    tables: packTables(source.tables),
    links: (source.links || []).slice(0, 80),
    sha256: crypto.createHash("sha256").update(String(source.text || "")).digest("hex")
  };
}

/**
 * Run the full generate→review chain with the SELF-HEALING AGENT LOOP:
 *
 *   attempt N: writer → deterministic self-repair → independent review
 *     - verdict PASS  → done
 *     - FAIL + issues writer-fixable hain → issues feedback me dekar dobara likhwao
 *     - FAIL + fatal issues (duplicate/expired/speculative) → retry bekaar hai, stop
 *
 * Sab attempts me se BEST-score draft save hota hai; review failure sirf record
 * hoti hai (`reviewStatus:'failed'`) aur publishing blocked rehti hai. Manual
 * REGENERATE ab shayad hi kabhi chahiye ho — agent khud theek karta hai.
 */
async function runGeneratePipeline({ type, sourceUrl, instructions, mode, source, existing, feedbackIssues, strategyGuidance }, deps = {}) {
  const cleanArticleType = cleanType(type);
  const fetchedSource = source || (await fetchAndExtractSource(sourceUrl, deps.fetchDeps));
  // Snapshot se aaya source ho to packed tables ko normal shape me lao.
  fetchedSource.tables = unpackTables(fetchedSource.tables);
  // ⭐ "मना कर देना" GATE — source me real notification content nahi (block-page /
  // shell text) to writer tak jaane hi mat do; warna 'संभावित' nonsense article banti hai.
  assertSourceArticleWorthy(fetchedSource);
  const generate = writerFor(cleanArticleType);
  const renormalize =
    cleanArticleType === ARTICLE_TYPES.JOB ? normalizeJobArticle : normalizeFastTrackArticle;

  const maxAttempts = Math.max(1, Number(deps.maxRepairAttempts) || MAX_REPAIR_ATTEMPTS);
  let feedback = Array.isArray(feedbackIssues) ? feedbackIssues.map(String) : [];
  let best = null;
  let attemptsRun = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptsRun = attempt;
    let article;
    try {
      article = await generate(
        { source: fetchedSource, instructions, feedbackIssues: feedback, strategyGuidance },
        deps.writerDeps || {}
      );
    } catch (writerErr) {
      // Retry-attempt me writer crash (rate-limit/JSON fail...) ho to pehle ka
      // BEST draft bachao — pehla hi attempt faila ho tabhi error aage badhega.
      if (best) {
        console.warn(
          `[article-agent] attempt ${attempt} writer fail — best-so-far draft rakhte hain:`,
          writerErr.message
        );
        break;
      }
      throw writerErr;
    }

    // ⭐ Deterministic self-repair — writer ki chhoti galtiyan (ungrounded facts
    // numbers, khaali date-box, SEO overshoot...) LLM-luck ke bina yahin theek.
    const repairs = repairArticleDeterministically(article, fetchedSource);
    if (repairs.length) {
      // Repairs ke baad wordCount/structuredData dobara compute karo.
      article = renormalize(article, { source: fetchedSource });
      console.log(`[article-agent] self-repair (attempt ${attempt}): ${repairs.join(", ")}`);
    }

    const review = reviewArticle({
      type: article.type,
      article,
      source: fetchedSource,
      existing
    });

    const record = { article, review, attempt, repairs };
    if (
      !best ||
      review.verdict === "pass" ||
      (best.review.verdict !== "pass" && review.score > best.review.score)
    ) {
      best = record;
    }

    if (review.verdict === "pass") {
      if (attempt > 1) {
        console.log(`[article-agent] ✅ review PASS on attempt ${attempt}/${maxAttempts} (self-healing loop)`);
      }
      break;
    }

    const { fatal, fixable } = splitReviewIssues(review.issues);
    console.warn(
      `[article-agent] ❌ review FAIL (attempt ${attempt}/${maxAttempts}): ` +
        `${review.issues.slice(0, 6).join(" | ")}`
    );
    if (fatal.length) {
      console.warn(
        `[article-agent] non-fixable issues (${fatal.slice(0, 3).join(", ")}) — retry se theek nahi honge, rok rahe hain`
      );
      break;
    }
    if (!fixable.length || attempt === maxAttempts) break;
    // ⭐ Writer ko pichli failings batao — andhere me dobara wahi galti na kare.
    feedback = review.issues;
  }

  const draft = buildDraftRecord({
    type: cleanArticleType,
    article: best.article,
    review: best.review,
    source: fetchedSource,
    mode,
    instructions,
    repair: {
      attempts: attemptsRun,
      bestAttempt: best.attempt,
      passedOnAttempt: best.review.verdict === "pass" ? best.attempt : null,
      log: best.repairs
    }
  });
  return draft;
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
  // apply-flow: admin ke jaan-bujh kar bhare facts clear NAHI karne — sirf
  // safe deterministic repairs (SEO trims + khaali date-box harvest).
  repairArticleDeterministically(normalized, source, { applyMode: true });
  const review = reviewArticle({ type: normalized.type, article: normalized, source, existing });
  return { article: normalized, review };
}

/**
 * Assemble the Firestore draft document. This function must NEVER return a
 * published record — publication is a separate guarded step.
 */
function buildDraftRecord({ type, article, review, source, mode, instructions, repair }) {
  return {
    type: article.type, // 'JOB' | 'FAST_TRACK' — kept compatible with site schema
    articleType: type,
    status: "draft", // draft-first: automatic pipelines can never publish directly
    publishBlocked: review.verdict !== "pass",
    reviewStatus: review.verdict === "pass" ? "passed" : "failed",
    reviewReport: review,
    // ⭐ Self-healing agent loop ka audit trail (admin panel me dikhta hai)
    repairAttempts: repair?.attempts || 1,
    repairBestAttempt: repair?.bestAttempt || 1,
    repairPassedOnAttempt: repair?.passedOnAttempt ?? null,
    repairLog: (repair?.log || []).slice(0, 10).map((s) => String(s).slice(0, 140)),
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
  const reviewVerdict = String(draft.reviewReport?.verdict || "").toLowerCase();
  if (
    draft.reviewStatus !== "passed" ||
    reviewVerdict !== "pass" ||
    draft.publishBlocked === true
  ) {
    const err = new Error(
      `Publish blocked: Fact & Quality review ${draft.reviewStatus === "failed" || reviewVerdict === "fail" ? "FAILED" : "not passed yet"}` +
        (draft.reviewReport?.issues?.length ? ` — ${draft.reviewReport.issues.slice(0, 3).join("; ")}` : "")
    );
    err.code = "PUBLISH_BLOCKED";
    throw err;
  }
  if (draft.authorName !== EDITORIAL_AUTHOR) {
    const err = new Error(`Publish blocked: author must be ${EDITORIAL_AUTHOR}`);
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
  const iso = toIsoDateString(raw);
  if (iso) return iso;
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
  const seo = enrichContentDocument({
    type: "JOB",
    title: mapped.title,
    h1: draft.h1,
    seoTitle: draft.seoTitle,
    metaDescription: mapped.metaDescription,
    facts: draft.facts || {},
    faqs: mapped.faqs,
    wordCount: mapped.wordCount,
    sourceUrl: mapped.sourceUrl,
    articleHtml: mapped.articleHtml
  });
  return stripEmpty({ ...mapped, ...seo });
}

/** Map a passed FAST_TRACK draft to the existing `fast_track` document shape. */
function buildFastTrackPublishPayload(draft, draftId) {
  const facts = draft.facts || {};
  const mapped = {
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
  };
  const seo = enrichContentDocument({
    type: "FAST_TRACK",
    title: mapped.title,
    h1: draft.h1,
    seoTitle: draft.seoTitle,
    metaDescription: mapped.metaDescription,
    facts,
    category: mapped.category,
    organization: mapped.org,
    faqs: mapped.faqs,
    wordCount: mapped.wordCount,
    sourceUrl: mapped.sourceUrl,
    articleHtml: mapped.articleHtml
  });
  return stripEmpty({ ...mapped, ...seo });
}

function buildPublishPayload(draft, draftId) {
  const type = draft.type === "JOB" || draft.articleType === ARTICLE_TYPES.JOB ? "JOB" : "FAST_TRACK";
  return {
    collection: type === "JOB" ? "jobs" : "fast_track",
    payload: type === "JOB" ? buildJobPublishPayload(draft, draftId) : buildFastTrackPublishPayload(draft, draftId)
  };
}

/**
 * Guarded publish of a passed draft into jobs/fast_track.
 * Shared by /articles/publish route + Telegram approve buttons.
 * Review gate PHIR se lagta hai (assertPublishable) — console/telegram dono safe.
 * db + FieldValue parameter se lete hain (module unit-testable rehta hai).
 */
async function publishDraftRecord(db, FieldValue, draft, draftId) {
  assertPublishable(draft);

  const { collection, payload } = buildPublishPayload(draft, draftId);
  const targetId = draft.publishedDocId
    || `${draft.type === "JOB" ? "job" : "ft"}-${String(draft.slug || draftId).slice(0, 90)}`;

  let existing = null;
  try {
    const existingSnap = await db.collection(collection).doc(targetId).get();
    if (existingSnap.exists) existing = existingSnap.data();
  } catch {
    existing = null;
  }

  const historyEntry = buildHistoryEntry(existing, payload, {
    reason: existing ? "updated" : "published"
  });
  const updateHistory = mergeUpdateHistory(existing?.updateHistory, historyEntry);

  await db
    .collection(collection)
    .doc(targetId)
    .set(
      {
        ...payload,
        updateHistory,
        createdAt: existing?.createdAt || FieldValue.serverTimestamp(),
        publishedAt: existing?.publishedAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

  // ⭐ Publish ke turant baad draft DELETE — duplicate records nahi rehte.
  await db
    .collection(DRAFT_COLLECTION)
    .doc(draftId)
    .delete()
    .catch((e) => console.warn(`publish: draft ${draftId} auto-delete failed:`, e.message));

  // ⭐ Origin source-record bhi saaf (JOBS AI draft row / Fast Track raw item).
  const originRef = sanitizeOriginRef(draft.originRef);
  let originDeleted = false;
  if (originRef) {
    originDeleted = await db
      .collection(originRef.collection)
      .doc(originRef.id)
      .delete()
      .then(() => true)
      .catch((e) => {
        console.warn(`publish: origin ${originRef.collection}/${originRef.id} delete failed:`, e.message);
        return false;
      });
  }

  return { collection, docId: targetId, payload, originDeleted };
}

module.exports = {
  DRAFT_COLLECTION,
  cleanType,
  runGeneratePipeline,
  reReview,
  buildDraftRecord,
  assertPublishable,
  publishDraftRecord,
  buildJobPublishPayload,
  buildFastTrackPublishPayload,
  buildPublishPayload,
  normalizeArticleHtml,
  sanitizeJobDate,
  sanitizeJobFee,
  packTables,
  unpackTables,
  sanitizeOriginRef
};
