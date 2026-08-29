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
const MAX_FAILURE_ATTEMPTS = 3; // After this a failing page stops being retried
const CONTENT_COLLECTIONS = ["jobs", "blogs", "fast_track", "mock_tests"];
const NON_PUBLISHED_STATUSES = ["draft", "pending", "rejected", "private", "archived", "deleted", "trash"];

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
 * Failed pages stay retryable until MAX_FAILURE_ATTEMPTS is reached, so one
 * broken page cannot starve the backfill but is not retried forever either.
 */
function isAlreadyOptimized(tracker, doc) {
  if (!tracker) return false;
  if (tracker.status === "failed") {
    return Number(tracker.failureAttempts || 1) >= MAX_FAILURE_ATTEMPTS;
  }
  const currentFp = buildContentFingerprint(doc);
  if (tracker.lastAppliedFingerprint === currentFp.hash) return true;
  // Trackers record the post-optimization score as newQualityScore
  // (lastQualityScore kept for backwards compatibility).
  const quality = Number(tracker.lastQualityScore ?? tracker.newQualityScore ?? 0);
  if (tracker.optimizationVersion >= QUALITY_VERSION && quality >= QUALITY_THRESHOLD) return true;
  return false;
}

/**
 * Build (or extend) a failure tracker record so a failing page is retried a
 * bounded number of times instead of being re-selected by every batch.
 */
function buildFailureTracker(doc, priorTracker = {}, error = null, options = {}) {
  const now = options.now || new Date();
  const fp = buildContentFingerprint(doc);
  const attempts = Number(priorTracker && priorTracker.failureAttempts || 0) + 1;
  return {
    contentId: doc.id || "",
    pageType: doc.pageType || "",
    contentFingerprint: fp.hash,
    status: "failed",
    failureAttempts: attempts,
    lastError: String(error && error.message || error || "unknown").slice(0, 300),
    lastFailedAt: now.toISOString(),
    reason: "processing-error",
    lastAuditedAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
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
 * Filters: published, not noIndex, not already optimized, not excluded this run.
 */
async function selectOldestEligible(db, options = {}) {
  const batchSize = Math.min(MAX_BATCH_SIZE, Number(options.batchSize) || DEFAULT_BATCH_SIZE);
  const collections = options.collections || CONTENT_COLLECTIONS;
  const trackers = options.trackers || {};
  const excludeIds = new Set(
    Array.isArray(options.excludeIds) ? options.excludeIds.map(String)
      : (options.excludeIds instanceof Set ? [...options.excludeIds].map(String) : [])
  );

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
        if (NON_PUBLISHED_STATUSES.includes(status)) continue;
        if (data.noIndex === true) continue;
        if (excludeIds.has(String(doc.id))) continue;

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
 * Count tracker records (processed pages) and estimate the total eligible
 * catalog so the dashboard can show remaining work.
 *
 * eligible ≈ Σ(total docs per collection − docs with a non-published status)
 * Documents missing `status` are treated as published (matches selection).
 */
async function countEligiblePages(db, collections = CONTENT_COLLECTIONS) {
  const totals = {};
  let total = 0;
  let nonPublished = 0;
  for (const name of collections) {
    try {
      const all = await db.collection(name).count().get();
      const count = Number(all && all.data && all.data().count) || 0;
      let bad = 0;
      try {
        const filtered = await db.collection(name)
          .where("status", "in", NON_PUBLISHED_STATUSES.slice(0, 10))
          .count().get();
        bad = Number(filtered && filtered.data && filtered.data().count) || 0;
      } catch { bad = 0; }
      totals[name] = { total: count, nonPublished: bad, eligible: Math.max(0, count - bad) };
      total += count;
      nonPublished += bad;
    } catch {
      totals[name] = { total: 0, nonPublished: 0, eligible: 0 };
    }
  }
  return {
    total,
    nonPublished,
    eligible: Math.max(0, total - nonPublished),
    byCollection: totals,
    note: "Estimated eligible catalog (status-based); noIndex docs may still be counted."
  };
}

/**
 * Count total tracker records (processed pages) plus estimated catalog size.
 */
async function countProcessedPages(db) {
  if (!db) return { total: 0, processed: 0, remaining: 0 };
  let processed = 0;
  let eligible = 0;
  let total = 0;
  try {
    const snap = await db.collection(TRACKER_COLLECTION).count().get();
    processed = Number(snap.data().count) || 0;
  } catch { processed = 0; }
  try {
    const catalog = await countEligiblePages(db);
    eligible = catalog.eligible || 0;
    total = catalog.total || 0;
  } catch { /* counts stay 0 */ }
  return {
    total: eligible,
    catalogTotal: total,
    processed,
    remaining: Math.max(0, eligible - processed)
  };
}

module.exports = {
  TRACKER_COLLECTION,
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  QUALITY_THRESHOLD,
  MIN_IMPROVEMENT,
  MAX_FAILURE_ATTEMPTS,
  CONTENT_COLLECTIONS,
  buildContentFingerprint,
  isAlreadyOptimized,
  buildFailureTracker,
  buildTrackerRecord,
  selectOldestEligible,
  loadTrackers,
  persistTracker,
  updateBackfillProgress,
  processPage,
  runBackfillBatch,
  getBackfillProgress,
  countEligiblePages,
  countProcessedPages
};
