"use strict";

/**
 * Legacy publish hook — intentionally disabled.
 *
 * SEO repairs are now generated as reviewable proposals by the daily,
 * oldest-first BLOG-only workflow. Publishing must not trigger silent public
 * content writes for BLOG, JOB, Fast Track, or any other content type.
 */

/**
 * Load a small same-collection catalog so the optimizer can propose real
 * internal links for newly published content. Best-effort: any failure
 * yields an empty catalog and the optimizer simply skips link proposals.
 */
async function loadCatalogForOptimization(db, collectionName) {
  if (!db || !collectionName) return [];
  try {
    const snap = await db.collection(collectionName)
      .orderBy("createdAt", "desc")
      .limit(CATALOG_LIMIT)
      .get();
    return (snap.docs || []).map((d) => {
      const data = typeof d.data === "function" ? d.data() : {};
      return { id: d.id, collection: collectionName, ...data };
    });
  } catch {
    return [];
  }
}

/**
 * Content-type-specific optimizer constraints.
 * MOCK_TEST and WEB_STORY get metadata-only improvements.
 */
const OPTIMIZER_ACTOR = "publish-hook-disabled";
const CATALOG_LIMIT = 15;

const TYPE_CONSTRAINTS = Object.freeze({
  MOCK_TEST: { maxPasses: 1, useAi: false, metadataOnly: true },
  WEB_STORY: { maxPasses: 1, useAi: false, metadataOnly: true },
  STUDY_MATERIAL: { maxPasses: 1, useAi: false, metadataOnly: true },
  COURSE: { maxPasses: 1, useAi: false, metadataOnly: true },
  EBOOK: { maxPasses: 1, useAi: false, metadataOnly: true },
  JOB: { maxPasses: 2, useAi: false },
  FAST_TRACK: { maxPasses: 2, useAi: false },
  BLOG: { maxPasses: 2, useAi: false },
  RESULT: { maxPasses: 1, useAi: false },
  ADMIT_CARD: { maxPasses: 1, useAi: false },
  ANSWER_KEY: { maxPasses: 1, useAi: false },
  SYLLABUS: { maxPasses: 1, useAi: false }
});

/**
 * Resolve content type from a document.
 */
function resolveContentType(doc) {
  if (doc.contentType) return String(doc.contentType).toUpperCase();
  if (doc.type) return String(doc.type).toUpperCase();
  if (doc.collection === "blogs" || doc.pageType === "blog") return "BLOG";
  if (doc.collection === "jobs") return "JOB";
  if (doc.collection === "fast_track") return "FAST_TRACK";
  if (doc.collection === "mock_tests") return "MOCK_TEST";
  if (doc.collection === "web_stories") return "WEB_STORY";
  if (doc.collection === "study_materials") return "STUDY_MATERIAL";
  if (doc.collection === "courses") return "COURSE";
  return "OTHER";
}

/**
 * Legacy entry point retained for callers during migration.
 * It always skips and never reads/writes a public content document.
 *
 * @returns {Promise<object|null>} Disabled/skipped status or null for invalid input
 */
async function triggerOptimizerAfterPublish(db, FieldValue, doc, collectionName) {
  if (!db || !doc || !doc.id || !collectionName) {
    return null;
  }

  const contentType = resolveContentType({ ...doc, collection: collectionName });
  // The old publish hook performed direct public-content writes. SEO repair is
  // now handled by the scheduled, oldest-first BLOG proposal workflow only;
  // publishing never triggers auto-repair for blogs, jobs, or Fast Track.
  return {
    skipped: true,
    reason: "publish-auto-repair-disabled; daily-blog-proposals-only",
    contentId: doc.id,
    contentType
  };
}

/**
 * Fire-and-forget trigger that wraps the entire call in a non-blocking pattern.
 * Use this when the caller should NOT await the optimizer.
 *
 * @param {object} db
 * @param {object} FieldValue
 * @param {object} doc
 * @param {string} collectionName
 * @param {object} [options]
 */
function triggerOptimizerNonBlocking(db, FieldValue, doc, collectionName, options = {}) {
  triggerOptimizerAfterPublish(db, FieldValue, doc, collectionName, options)
    .catch((err) => {
      console.error("[publish-hook] non-blocking trigger failed for %s:", doc && doc.id, err.message);
    });
}

module.exports = {
  triggerOptimizerAfterPublish,
  triggerOptimizerNonBlocking,
  resolveContentType,
  loadCatalogForOptimization,
  TYPE_CONSTRAINTS,
  OPTIMIZER_ACTOR
};
