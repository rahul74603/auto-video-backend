"use strict";

/**
 * Auto-Optimizer — controlled automatic content quality pipeline.
 *
 * Two modes:
 *   1. BACKFILL: oldest eligible → audit → improve → validate → snapshot → safe apply → next
 *   2. LATEST:   publish → audit → improve → validate → safe apply
 *
 * Safety architecture (preserved from existing system):
 *   CHECK = inspection only
 *   APPROVE = status only
 *   APPLY = snapshot + allowlisted write
 *
 * Every automatic write:
 *   - snapshot first
 *   - allowlisted fields only
 *   - validation after write
 *   - rollback possible
 *   - audit log
 *   - before/after values
 *   - reason
 *   - quality score before/after
 *
 * Level A: safe automatic improvement
 * Level B: improvement possible but requires stronger validation
 * Level C: factual/source-sensitive; NEVER auto-write
 */

const { scorePage, classifyQuality, needsImprovement, QUALITY_VERSION } = require("./content_quality_scorer");
const { processPage, runBackfillBatch, getBackfillProgress, buildContentFingerprint, buildTrackerRecord, persistTracker, updateBackfillProgress, TRACKER_COLLECTION, QUALITY_THRESHOLD } = require("./backfill_processor");
const { generateProposals } = require("./optimizer");
const { auditPage } = require("./page_auditor");
const { compactAudit } = require("./audit_model");
const { compactProposal, isFactField, isApplyableField, collectionForContentType } = require("./proposal_model");
const { gateProposal } = require("./proposal_gate");
const { buildSnapshot, persistSnapshot } = require("./snapshot_store");
const { sanitizeProposalHtml, tryNormalizeWithCheerio } = require("./html_safety");
const { extractArticleHtml } = require("./proposal_model");

const SETTINGS = "system_settings";
const SETTINGS_DOC = "seo_intelligence";
const AUTO_OPTIMIZER_VERSION = 1;

/**
 * Build a patch from a proposal (same logic as apply_engine.buildPatch).
 */
function buildAutoPatch(proposal) {
  const field = String(proposal.field || "");
  if (isFactField(field)) return null;
  if (field === "schemaMarkup" || field === "includeJobPostingSchema") {
    return { includeJobPostingSchema: false };
  }
  if (field === "relatedLinks") {
    const links = (Array.isArray(proposal.proposedValue) ? proposal.proposedValue : [])
      .filter((item) => item && String(item.url || "").startsWith("/") && !String(item.url).startsWith("//"))
      .slice(0, 8);
    return { relatedLinks: links };
  }
  if (field === "articleHtml") {
    const html = extractArticleHtml(proposal.proposedValue);
    if (!html || !html.trim()) return null;
    const safe = sanitizeProposalHtml(html);
    if (!safe.ok) return null;
    const normalized = tryNormalizeWithCheerio(safe.html, null);
    return { articleHtml: normalized };
  }
  if (!isApplyableField(field)) return null;
  return { [field]: proposal.proposedValue };
}

/**
 * Process a single page for automatic optimization.
 * Only applies Level A changes. Level B/C go to review queue.
 */
async function autoOptimizePage(db, FieldValue, doc, options = {}) {
  const now = options.now || new Date();
  const catalog = options.catalog || [];
  const dryRun = options.dryRun === true;
  const actor = options.actor || "auto-optimizer";

  // 1. Quality audit
  const audit = auditPage(doc, { now, catalog });

  // 2. Quality score (before)
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

  // 4. Generate proposals
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

  // 5. Separate by level
  const levelA = proposals.filter((p) => p.level === "A");
  const levelB = proposals.filter((p) => p.level === "B");
  const levelC = proposals.filter((p) => p.level === "C");

  // 6. Build patches for Level A only
  const patches = [];
  const appliedChanges = [];

  for (const proposal of levelA) {
    const patch = buildAutoPatch(proposal);
    if (!patch) continue;

    // Gate check
    const collectionName = collectionForContentType(proposal.contentType);
    const page = { ...doc, contentType: proposal.contentType };
    const gate = gateProposal(proposal, page, null);
    if (!gate.ok) continue;

    patches.push({ proposal, patch, collectionName });
    appliedChanges.push({
      field: proposal.field,
      level: "A",
      reason: proposal.reason,
      oldValue: typeof proposal.oldValue === "string" ? proposal.oldValue.slice(0, 200) : proposal.oldValue,
      newValue: typeof proposal.proposedValue === "string" ? proposal.proposedValue.slice(0, 200) : proposal.proposedValue
    });
  }

  // 7. If no safe patches, return as needs-review
  if (!patches.length) {
    return {
      status: "needs-review",
      reason: "no-safe-auto-apply-changes",
      contentId: doc.id,
      beforeScore: beforeScore.overall,
      afterScore: beforeScore.overall,
      qualityDelta: 0,
      changes: proposals.map((p) => ({
        field: p.field,
        level: p.level,
        reason: p.reason
      })),
      proposals: proposals.map(compactProposal),
      levelBProposals: levelB.map(compactProposal),
      levelCProposals: levelC.map(compactProposal),
      safetyLevel: levelB.length > 0 ? "B" : "C",
      audit: compactAudit(audit)
    };
  }

  // 8. Apply patches (with snapshot)
  if (!dryRun && db) {
    for (const { proposal, patch, collectionName } of patches) {
      try {
        // Snapshot first
        const oldValues = {};
        for (const field of Object.keys(patch)) {
          oldValues[field] = doc[field] ?? null;
        }
        const snapshot = buildSnapshot({
          proposal,
          collectionName,
          documentId: proposal.contentId || doc.id,
          oldValues,
          newValues: patch,
          actor,
          now
        });
        await persistSnapshot(db, FieldValue, snapshot);

        // Write patch
        const stamp = FieldValue && FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : now.toISOString();
        await db.collection(collectionName).doc(proposal.contentId || doc.id).set(
          { ...patch, seoAppliedAt: stamp, contentUpdatedAt: stamp },
          { merge: true }
        );
      } catch (error) {
        console.warn(`[auto-optimizer] apply failed for ${doc.id}:`, error.message);
      }
    }
  }

  // 9. Estimate after score
  const estimatedAfter = Math.min(100, beforeScore.overall + patches.length * 5);

  // 10. Persist tracker
  if (!dryRun && db) {
    const trackerRecord = buildTrackerRecord(
      doc,
      beforeScore.overall,
      estimatedAfter,
      appliedChanges,
      {
        safetyLevel: "A",
        status: "auto-applied",
        reason: "safe-automatic-improvement"
      }
    );
    await persistTracker(db, FieldValue, doc.id, trackerRecord);
  }

  return {
    status: "auto-applied",
    reason: "safe-automatic-improvement",
    contentId: doc.id,
    beforeScore: beforeScore.overall,
    afterScore: estimatedAfter,
    qualityDelta: estimatedAfter - beforeScore.overall,
    changes: appliedChanges,
    appliedPatches: patches.length,
    reviewProposals: levelB.length + levelC.length,
    safetyLevel: "A",
    audit: compactAudit(audit)
  };
}

/**
 * Process a newly published page.
 * Called after publish → audit → improve → validate → safe apply.
 */
async function processNewContent(db, FieldValue, doc, options = {}) {
  const now = options.now || new Date();
  const catalog = options.catalog || [];

  // Quick quality check
  const beforeScore = scorePage(doc, { now, catalog });

  // If already high quality, just record it
  if (!needsImprovement(beforeScore, QUALITY_THRESHOLD)) {
    if (db) {
      const fp = buildContentFingerprint(doc);
      await persistTracker(db, FieldValue, doc.id, {
        contentId: doc.id,
        pageType: doc.pageType || "",
        contentFingerprint: fp.hash,
        optimizationVersion: QUALITY_VERSION,
        previousQualityScore: beforeScore.overall,
        newQualityScore: beforeScore.overall,
        qualityDelta: 0,
        changes: [],
        status: "already-high-quality",
        reason: "new-content-already-good",
        lastAuditedAt: now.toISOString(),
        lastOptimizedAt: now.toISOString(),
        lastAppliedFingerprint: fp.hash
      });
    }
    return {
      status: "skipped",
      reason: "already-high-quality",
      contentId: doc.id,
      beforeScore: beforeScore.overall,
      afterScore: beforeScore.overall,
      qualityDelta: 0
    };
  }

  // Run auto-optimization
  return autoOptimizePage(db, FieldValue, doc, { now, catalog, ...options });
}

/**
 * Run the full backfill pipeline.
 * Processes oldest eligible content in batches.
 */
async function runBackfill(db, FieldValue, options = {}) {
  const maxBatches = Math.min(10, Number(options.maxBatches) || 3);
  const batchSize = Number(options.batchSize) || 10;
  const dryRun = options.dryRun === true;

  const allResults = [];
  let totalImproved = 0;
  let totalSkipped = 0;
  let totalNeedsReview = 0;
  let totalFailed = 0;

  for (let i = 0; i < maxBatches; i++) {
    const batch = await runBackfillBatch(db, FieldValue, {
      batchSize,
      dryRun,
      now: options.now,
      collections: options.collections
    });

    allResults.push(...batch.results);
    totalImproved += batch.improved;
    totalSkipped += batch.skipped;
    totalNeedsReview += batch.needsReview;
    totalFailed += batch.failed;

    // If no pages were processed, stop
    if (batch.processed === 0) break;
  }

  return {
    ok: true,
    dryRun,
    batches: maxBatches,
    totalProcessed: allResults.length,
    totalImproved,
    totalSkipped,
    totalNeedsReview,
    totalFailed,
    results: allResults
  };
}

/**
 * Get the current auto-optimizer status.
 */
async function getOptimizerStatus(db) {
  if (!db) return null;
  try {
    const snap = await db.collection(SETTINGS).doc(SETTINGS_DOC).get();
    const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
    if (!exists) return null;
    const data = typeof snap.data === "function" ? snap.data() : {};
    return {
      backfillProgress: data.backfillProgress || null,
      lastRun: data.lastRun || null,
      optimizationApply: data.optimizationApply || false,
      autoOptimizerVersion: AUTO_OPTIMIZER_VERSION
    };
  } catch {
    return null;
  }
}

module.exports = {
  AUTO_OPTIMIZER_VERSION,
  buildAutoPatch,
  autoOptimizePage,
  processNewContent,
  runBackfill,
  getOptimizerStatus
};
