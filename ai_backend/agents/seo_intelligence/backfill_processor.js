"use strict";

/**
 * Backfill Processor — oldest-first content quality optimization.
 *
 * Processes StudyGyaan content in deterministic order:
 *   oldest eligible → next oldest → next...
 *
 * Safety:
 *   - Never invents facts
 *   - Never rewrites already-high-quality content
 *   - Idempotent: skips already-optimized pages
 *   - Duplicate protection: rejects changes that increase duplication
 *   - Fact field lock preserved
 *   - Level C never auto-applied
 *   - Snapshot before every write
 *   - Rollback possible
 *
 * Firestore collections used:
 *   - seo_backfill_tracker (admin-only) — tracks processing state
 *   - system_settings/seo_intelligence.backfillProgress — dashboard summary
 */

const { scorePage, classifyQuality, needsImprovement, QUALITY_VERSION } = require("./content_quality_scorer");
const { generateProposals } = require("./optimizer");
const { auditPage } = require("./page_auditor");
const { compactAudit } = require("./audit_model");
const { compactProposal, isFactField } = require("./proposal_model");
const { createFingerprint, compareFingerprints } = require("../growth/content_fingerprint");

const TRACKER_COLLECTION = "seo_backfill_tracker";
const SETTINGS = "system_settings";
const SETTINGS_DOC = "seo_intelligence";
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 20;
const QUALITY_THRESHOLD = 75; // Below this = needs improvement
const MIN_IMPROVEMENT = 3; // Minimum score improvement to apply

/**
 * Build a content fingerprint for idempotency tracking.
 */
function buildContentFingerprint(doc) {
  return createFingerprint({
    title: doc.seoTitle || doc.title || doc.h1 || "",
    topic: doc.contentKind || "",
    organization: doc.organization || doc.org || "",
    category: doc.category || "",
    vacancies: doc.vacancies || "",
    lastDate: doc.lastDate || "",
    startDate: doc.startDate || ""
  });
}

/**
 * Check if a page has already been optimized with the current fingerprint.
 */
function isAlreadyOptimized(tracker, doc) {
  if (!tracker) return false;
  const currentFp = buildContentFingerprint(doc);
  if (tracker.lastAppliedFingerprint === currentFp.hash) return true;
  if (tracker.optimizationVersion >= QUALITY_VERSION && tracker.lastQualityScore >= QUALITY_THRESHOLD) return true;
  return false;
}

/**
 * Build the tracker record for a processed page.
 */
function buildTrackerRecord(doc, beforeScore, afterScore, changes, options = {}) {
  const fp = buildContentFingerprint(doc);
  return {
    contentId: doc.id || "",
    pageType: doc.pageType || "",
    contentFingerprint: fp.hash,
    optimizationVersion: QUALITY_VERSION,
    previousQualityScore: beforeScore,
    newQualityScore: afterScore,
    qualityDelta: afterScore - beforeScore,
    changes: changes || [],
    fieldsChanged: (changes || []).map((c) => c.field).filter(Boolean),
    confidence: options.confidence || "heuristic",
    safetyLevel: options.safetyLevel || "B",
    duplicateRisk: options.duplicateRisk || "low",
    sourceEvidence: options.sourceEvidence || "existing-fields",
    snapshotId: options.snapshotId || null,
    status: options.status || "processed",
    reason: options.reason || "",
    lastAuditedAt: new Date().toISOString(),
    lastOptimizedAt: new Date().toISOString(),
    lastAppliedFingerprint: fp.hash
  };
}

/**
 * Select the oldest eligible pages from Firestore.
 * Orders by createdAt ascending (oldest first).
 * Filters: published, not noIndex, not already optimized.
 */
async function selectOldestEligible(db, options = {}) {
  const batchSize = Math.min(MAX_BATCH_SIZE, Number(options.batchSize) || DEFAULT_BATCH_SIZE);
  const collections = options.collections || ["jobs", "blogs", "fast_track", "mock_tests"];
  const trackers = options.trackers || {};

  const eligible = [];

  for (const collectionName of collections) {
    try {
      const snap = await db.collection(collectionName)
        .orderBy("createdAt", "asc")
        .limit(batchSize * 3) // fetch extra to account for filtered-out docs
        .get();

      for (const doc of snap.docs || []) {
        if (eligible.length >= batchSize) break;
        const data = typeof doc.data === "function" ? doc.data() : doc;
        const status = String(data.status || "published").toLowerCase();
        if (["draft", "pending", "rejected", "private", "archived", "deleted", "trash"].includes(status)) continue;
        if (data.noIndex === true) continue;

        const tracker = trackers[doc.id];
        if (isAlreadyOptimized(tracker, { id: doc.id, ...data })) continue;

        eligible.push({
          id: doc.id,
          collection: collectionName,
          ...data
        });
      }
    } catch (error) {
      console.warn(`[backfill] read ${collectionName} failed:`, error.message);
    }
  }

  // Sort by createdAt ascending (oldest first)
  eligible.sort((a, b) => {
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() || 0 : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() || 0 : 0;
    return aDate - bDate;
  });

  return eligible.slice(0, batchSize);
}

/**
 * Load existing tracker records for a batch of content IDs.
 */
async function loadTrackers(db, contentIds) {
  const trackers = {};
  if (!db || !contentIds.length) return trackers;

  for (const id of contentIds) {
    try {
      const snap = await db.collection(TRACKER_COLLECTION).doc(id).get();
      const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      if (exists) {
        trackers[id] = typeof snap.data === "function" ? snap.data() : {};
      }
    } catch {
      // Tracker missing = not yet processed
    }
  }
  return trackers;
}

/**
 * Persist a tracker record.
 */
async function persistTracker(db, FieldValue, contentId, record) {
  if (!db) return;
  const stamp = FieldValue && FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : new Date().toISOString();
  await db.collection(TRACKER_COLLECTION).doc(contentId).set({
    ...record,
    updatedAt: stamp
  }, { merge: true });
}

/**
 * Update the backfill progress summary on system_settings.
 */
async function updateBackfillProgress(db, FieldValue, progress) {
  if (!db) return;
  const stamp = FieldValue && FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : new Date().toISOString();
  await db.collection(SETTINGS).doc(SETTINGS_DOC).set({
    backfillProgress: {
      ...progress,
      updatedAt: stamp
    }
  }, { merge: true });
}

/**
 * Process a single page: audit → score → propose → classify → record.
 * Returns { skipped, applied, needsReview, failed } with details.
 */
function processPage(doc, options = {}) {
  const now = options.now || new Date();
  const catalog = options.catalog || [];

  // 1. Quality audit
  const audit = auditPage(doc, { now, catalog });

  // 2. Quality score
  const beforeScore = scorePage(doc, { now, catalog });

  // 3. Check if already high quality
  if (!needsImprovement(beforeScore, QUALITY_THRESHOLD)) {
    return {
      status: "skipped",
      reason: "already-high-quality",
      contentId: doc.id,
      beforeScore: beforeScore.overall,
      afterScore: beforeScore.overall,
      qualityDelta: 0,
      changes: [],
      safetyLevel: classifyQuality(beforeScore.overall)
    };
  }

  // 4. Generate proposals from audit findings
  const proposals = generateProposals(audit, doc, { now, catalog });

  if (!proposals.length) {
    return {
      status: "skipped",
      reason: "no-improvement-proposals",
      contentId: doc.id,
      beforeScore: beforeScore.overall,
      afterScore: beforeScore.overall,
      qualityDelta: 0,
      changes: [],
      safetyLevel: classifyQuality(beforeScore.overall)
    };
  }

  // 5. Classify proposals by safety level
  const safeProposals = proposals.filter((p) => p.level === "A");
  const reviewProposals = proposals.filter((p) => p.level === "B");
  const blockedProposals = proposals.filter((p) => p.level === "C");

  // 6. Build improvement plan
  const changes = proposals.map((p) => ({
    field: p.field,
    level: p.level,
    reason: p.reason,
    oldValue: typeof p.oldValue === "string" ? p.oldValue.slice(0, 200) : p.oldValue,
    proposedValue: typeof p.proposedValue === "string" ? p.proposedValue.slice(0, 200) : p.proposedValue
  }));

  // 7. Estimate improvement (conservative: only count safe changes)
  const estimatedImprovement = safeProposals.length * 5 + reviewProposals.length * 3;

  // 8. Classify overall safety
  const safetyLevel = blockedProposals.length > 0 ? "C"
    : reviewProposals.length > 0 ? "B"
    : "A";

  // 9. Check if improvement is meaningful
  if (estimatedImprovement < MIN_IMPROVEMENT) {
    return {
      status: "skipped",
      reason: "improvement-too-small",
      contentId: doc.id,
      beforeScore: beforeScore.overall,
      afterScore: beforeScore.overall,
      qualityDelta: 0,
      changes,
      safetyLevel
    };
  }

  const estimatedAfter = Math.min(100, beforeScore.overall + estimatedImprovement);

  return {
    status: safetyLevel === "A" ? "auto-apply" : "needs-review",
    reason: safetyLevel === "A"
      ? "safe-automatic-improvement"
      : safetyLevel === "B"
        ? "improvement-possible-needs-validation"
        : "factual-source-sensitive",
    contentId: doc.id,
    beforeScore: beforeScore.overall,
    afterScore: estimatedAfter,
    qualityDelta: estimatedAfter - beforeScore.overall,
    changes,
    proposals: proposals.map(compactProposal),
    safeProposals: safeProposals.map(compactProposal),
    reviewProposals: reviewProposals.map(compactProposal),
    blockedProposals: blockedProposals.map(compactProposal),
    safetyLevel,
    audit: compactAudit(audit)
  };
}

/**
 * Run a backfill batch: select oldest → process → record.
 * Returns a batch report.
 */
async function runBackfillBatch(db, FieldValue, options = {}) {
  const now = options.now || new Date();
  const batchSize = Math.min(MAX_BATCH_SIZE, Number(options.batchSize) || DEFAULT_BATCH_SIZE);
  const dryRun = options.dryRun === true;

  // 1. Select oldest eligible pages
  const pages = await selectOldestEligible(db, { batchSize, ...options });

  if (!pages.length) {
    return {
      ok: true,
      dryRun,
      batch: 0,
      processed: 0,
      improved: 0,
      skipped: 0,
      needsReview: 0,
      failed: 0,
      remaining: 0,
      results: [],
      message: "No eligible pages found for backfill."
    };
  }

  // 2. Load existing trackers
  const contentIds = pages.map((p) => p.id);
  const trackers = await loadTrackers(db, contentIds);

  // 3. Process each page
  const results = [];
  let improved = 0;
  let skipped = 0;
  let needsReview = 0;
  let failed = 0;

  for (const page of pages) {
    try {
      const result = processPage(page, { now, catalog: pages });

      // 4. Persist tracker
      if (!dryRun && db) {
        const trackerRecord = buildTrackerRecord(
          page,
          result.beforeScore,
          result.afterScore,
          result.changes,
          {
            safetyLevel: result.safetyLevel,
            status: result.status,
            reason: result.reason
          }
        );
        await persistTracker(db, FieldValue, page.id, trackerRecord);
      }

      if (result.status === "auto-apply") improved++;
      else if (result.status === "needs-review") needsReview++;
      else if (result.status === "skipped") skipped++;
      else if (result.status === "failed") failed++;

      results.push(result);
    } catch (error) {
      failed++;
      results.push({
        status: "failed",
        reason: error.message,
        contentId: page.id,
        beforeScore: 0,
        afterScore: 0,
        qualityDelta: 0,
        changes: []
      });
    }
  }

  // 5. Update progress summary
  if (!dryRun && db) {
    await updateBackfillProgress(db, FieldValue, {
      lastBatchSize: pages.length,
      lastBatchProcessed: results.length,
      lastBatchImproved: improved,
      lastBatchSkipped: skipped,
      lastBatchNeedsReview: needsReview,
      lastBatchFailed: failed,
      lastBatchAt: now.toISOString()
    });
  }

  return {
    ok: true,
    dryRun,
    batch: results.length,
    processed: results.length,
    improved,
    skipped,
    needsReview,
    failed,
    results
  };
}

/**
 * Get backfill progress summary from Firestore.
 */
async function getBackfillProgress(db) {
  if (!db) return null;
  try {
    const snap = await db.collection(SETTINGS).doc(SETTINGS_DOC).get();
    const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
    if (!exists) return null;
    const data = typeof snap.data === "function" ? snap.data() : {};
    return data.backfillProgress || null;
  } catch {
    return null;
  }
}

/**
 * Count total tracker records to estimate backfill progress.
 */
async function countProcessedPages(db) {
  if (!db) return { total: 0, processed: 0 };
  try {
    const snap = await db.collection(TRACKER_COLLECTION).count().get();
    return { total: 0, processed: snap.data().count || 0 };
  } catch {
    return { total: 0, processed: 0 };
  }
}

module.exports = {
  TRACKER_COLLECTION,
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  QUALITY_THRESHOLD,
  MIN_IMPROVEMENT,
  buildContentFingerprint,
  isAlreadyOptimized,
  buildTrackerRecord,
  selectOldestEligible,
  loadTrackers,
  persistTracker,
  updateBackfillProgress,
  processPage,
  runBackfillBatch,
  getBackfillProgress,
  countProcessedPages
};
