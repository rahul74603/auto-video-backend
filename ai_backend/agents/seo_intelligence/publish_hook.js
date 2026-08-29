"use strict";

/**
 * Publish Hook — fire-and-forget optimizer trigger for newly published content.
 *
 * Called after any successful content publish. The optimizer must NEVER
 * cause the publish to fail. All errors are caught, logged, and recorded.
 *
 * Safety:
 *   - Fire-and-forget: never blocks the caller
 *   - Failure-isolated: optimizer error ≠ publish error
 *   - Idempotent: uses existing fingerprint/tracker mechanism
 *   - Content-type-aware: different caps per type
 *   - Fact fields locked for all types
 *   - MOCK_TEST/WEB_STORY: metadata-only (no content rewriting)
 *
 * Reuses: auto_optimizer.processNewContent, content_quality_scorer,
 * backfill_processor tracker, snapshot_store.
 */

const { processNewContent } = require("./auto_optimizer");
const { scorePage, needsImprovement, QUALITY_THRESHOLD } = require("./content_quality_scorer");
const { buildContentFingerprint, isAlreadyOptimized, loadTrackers } = require("./backfill_processor");

const OPTIMIZER_ACTOR = "publish-hook";
const CATALOG_LIMIT = 15;

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
 * Fire-and-forget optimizer trigger for newly published content.
 *
 * Call this AFTER a successful Firestore publish. It will:
 *   1. Check if content needs improvement (score < threshold)
 *   2. If yes, run the full optimize loop (audit → score → generate →
 *      validate → snapshot → apply → re-audit → compare → keep/rollback)
 *   3. If no, skip silently
 *
 * NEVER throws. Errors are logged and optionally recorded on the document.
 *
 * @param {object} db - Firestore instance
 * @param {object} FieldValue - admin.firestore.FieldValue
 * @param {object} doc - The published document (must include id + collection)
 * @param {string} collectionName - Firestore collection name
 * @param {object} [options] - { useAi?, dryRun? }
 * @returns {Promise<object|null>} Result or null if skipped/failed
 */
async function triggerOptimizerAfterPublish(db, FieldValue, doc, collectionName, options = {}) {
  if (!db || !doc || !doc.id || !collectionName) {
    return null;
  }

  const contentType = resolveContentType({ ...doc, collection: collectionName });
  const constraints = TYPE_CONSTRAINTS[contentType] || { maxPasses: 1, useAi: false };

  // Automation kill-switch coverage (Phase 0 hygiene): honor
  // system_settings/automation → features.seo_optimizer. The guard check is
  // fail-open — a guard error can never block or fail the publish.
  try {
    const { isAutomationEnabled } = require("../automation_guard");
    const guard = await isAutomationEnabled(db, "seo_optimizer");
    if (!guard.enabled) {
      console.log("[publish-hook] %s skipped: %s", doc.id, guard.reason);
      return {
        skipped: true,
        reason: `automation-disabled: ${guard.reason}`,
        contentId: doc.id
      };
    }
  } catch (guardError) {
    console.warn(
      "[publish-hook] automation guard check failed (continuing):",
      guardError && guardError.message
    );
  }

  try {
    // Quick score check — skip if already high quality
    const quickScore = scorePage(doc, { now: new Date() });
    if (!needsImprovement(quickScore, QUALITY_THRESHOLD)) {
      console.log("[publish-hook] %s already high quality (%s), skipping", doc.id, quickScore.overall);
      return {
        skipped: true,
        reason: "already-high-quality",
        contentId: doc.id,
        score: quickScore.overall
      };
    }

    console.log("[publish-hook] %s quality=%s, running optimizer (type=%s)", doc.id, quickScore.overall, contentType);

    // Small same-collection catalog for internal-link proposals (best-effort)
    const catalog = await loadCatalogForOptimization(db, collectionName).catch(() => []);

    const result = await processNewContent(db, FieldValue, doc, {
      actor: OPTIMIZER_ACTOR,
      collectionName,
      maxPasses: constraints.maxPasses,
      useAi: options.useAi === true && constraints.useAi !== false,
      dryRun: options.dryRun === true,
      catalog
    });

    // Record optimizer result on the document (non-blocking)
    try {
      const stamp = FieldValue && FieldValue.serverTimestamp
        ? FieldValue.serverTimestamp()
        : new Date().toISOString();
      await db.collection(collectionName).doc(doc.id).set({
        optimizerProcessed: true,
        optimizerResult: result.status,
        optimizerOriginalScore: result.originalScore,
        optimizerFinalScore: result.finalScore,
        optimizerDelta: result.qualityDelta,
        optimizerPasses: result.totalPasses,
        optimizerApplied: result.totalApplied,
        optimizerRolledBack: result.totalRolledBack,
        optimizerAt: stamp
      }, { merge: true });
    } catch (recordErr) {
      console.warn("[publish-hook] failed to record result on %s:", doc.id, recordErr.message);
    }

    console.log(
      "[publish-hook] %s done: status=%s score=%s→%s (Δ%s) applied=%s rolledBack=%s",
      doc.id, result.status, result.originalScore, result.finalScore,
      result.qualityDelta, result.totalApplied, result.totalRolledBack
    );

    return result;
  } catch (error) {
    // NEVER let optimizer failure affect the caller
    console.error("[publish-hook] optimizer failed for %s:", doc.id, error.message);

    // Record failure on the document (best-effort)
    try {
      const stamp = FieldValue && FieldValue.serverTimestamp
        ? FieldValue.serverTimestamp()
        : new Date().toISOString();
      await db.collection(collectionName).doc(doc.id).set({
        optimizerProcessed: false,
        optimizerError: String(error.message || "").slice(0, 300),
        optimizerFailedAt: stamp
      }, { merge: true });
    } catch { /* best-effort */ }

    return null;
  }
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
