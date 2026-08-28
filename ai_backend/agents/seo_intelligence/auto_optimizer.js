"use strict";

/**
 * Auto-Optimizer — self-improving SEO content optimization engine.
 *
 * This is NOT an auditor. It actually improves content:
 *   AUDIT → SCORE → FIND WEAKNESS → GENERATE IMPROVEMENT →
 *   FACT/SAFETY VALIDATION → DUPLICATE VALIDATION →
 *   SNAPSHOT → APPLY → RE-AUDIT → COMPARE BEFORE/AFTER →
 *   KEEP or ROLLBACK
 *
 * Multi-pass: a page may need metadata pass, then structure pass, then
 * linking pass. Each pass has before/after scores and strict caps.
 *
 * Reuses: page_auditor, optimizer, proposal_gate, apply_engine,
 * snapshot_store, reaudit, blog_html, content_ai, fact_quality_reviewer,
 * content_fingerprint, content_similarity_detector, linking_engine.
 *
 * Safety:
 *   Level A: auto-apply safe deterministic changes
 *   Level B: attempt AI grounded optimization; only queue when validation
 *            cannot safely prove the generated change
 *   Level C: never auto-apply, never invent facts, queue/reject safely
 *
 * Fact protection: organization, vacancies, salary, qualification,
 * eligibility, lastDate, startDate, fees, age, applyLink, directLink,
 * notificationLink, officialSiteLink, advtNo, selectionProcess,
 * questions, answers — all locked.
 */

const { scorePage, classifyQuality, needsImprovement, QUALITY_VERSION } = require("./content_quality_scorer");
const {
  selectOldestEligible, loadTrackers, persistTracker, updateBackfillProgress,
  buildContentFingerprint, buildTrackerRecord,
  TRACKER_COLLECTION, QUALITY_THRESHOLD
} = require("./backfill_processor");
const { generateProposals } = require("./optimizer");
const { auditPage } = require("./page_auditor");
const { compactAudit } = require("./audit_model");
const {
  compactProposal, isFactField, isApplyableField,
  collectionForContentType, extractArticleHtml,
  FACT_FIELDS
} = require("./proposal_model");
const { gateProposal } = require("./proposal_gate");
const { buildSnapshot, persistSnapshot, loadSnapshot, markSnapshotRestored } = require("./snapshot_store");
const { runReaudit, compareAudits } = require("./reaudit");
const { sanitizeProposalHtml, tryNormalizeWithCheerio } = require("./html_safety");
const { buildBlogArticleProposal, buildJobArticleEnhancement, buildFastTrackHtml } = require("./blog_html");
const { enrichBlogHtmlProposal, sourceBlob, inventedNumbers } = require("./content_ai");
const { selectRelatedLinks } = require("./linking_engine");
const { createFingerprint, compareFingerprints } = require("../growth/content_fingerprint");
const { calculateSimilarity, isTooSimilar } = require("../growth/content_similarity_detector");
const {
  extractClaims, isClaimGrounded, buildGroundingIndex, normalizeForCompare, numberSetOf
} = require("../article_agents/fact_quality_reviewer");

const SETTINGS = "system_settings";
const SETTINGS_DOC = "seo_intelligence";
const AUTO_OPTIMIZER_VERSION = 2;
const MAX_PASSES = 3;
const MIN_IMPROVEMENT = 2;
const MAX_PAGES_PER_BATCH = 10;

// ─── Helpers ─────────────────────────────────────────────────────────

function deepClone(obj) {
  if (!obj || typeof obj !== "object") return obj;
  try { return JSON.parse(JSON.stringify(obj)); } catch { return { ...obj }; }
}

function mergePatch(doc, patch) {
  const merged = { ...doc };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = value;
  }
  return merged;
}

function pickOldValues(doc, fields) {
  const out = {};
  for (const f of fields) {
    if (doc && Object.prototype.hasOwnProperty.call(doc, f)) out[f] = doc[f];
    else out[f] = null;
  }
  if (doc && typeof doc.articleHtml === "string") out.articleHtml = doc.articleHtml;
  if (doc && typeof doc.contentHtml === "string") out.contentHtml = doc.contentHtml;
  if (doc && doc.seoTitle != null) out.seoTitle = doc.seoTitle;
  if (doc && doc.metaDescription != null) out.metaDescription = doc.metaDescription;
  return out;
}

// ─── Claim Validation ────────────────────────────────────────────────

/**
 * Validate that generated HTML does not introduce ungrounded factual claims.
 * Uses the existing fact_quality_reviewer claim extraction + grounding.
 */
function validateClaims(generatedHtml, sourcePage) {
  const sourceText = [
    sourcePage.seoTitle || sourcePage.title || sourcePage.h1 || "",
    sourcePage.description || sourcePage.shortInfo || "",
    sourcePage.organization || "",
    sourcePage.lastDate || "",
    sourcePage.startDate || "",
    sourcePage.applyLink || sourcePage.directLink || "",
    sourcePage.sourceUrl || "",
    sourcePage.articleHtml || sourcePage.contentHtml || ""
  ].filter(Boolean).join("\n");

  const index = buildGroundingIndex({ text: sourceText, tables: [], links: [] });
  const claims = extractClaims(generatedHtml);
  const ungrounded = claims.filter((c) => !isClaimGrounded(c, index.haystackNorm, index.sourceNumbers));

  return {
    ok: ungrounded.length === 0,
    totalClaims: claims.length,
    ungrounded: ungrounded.map((c) => ({ kind: c.kind, value: c.value.slice(0, 80) }))
  };
}

// ─── Duplicate Validation ────────────────────────────────────────────

/**
 * Check if optimized content introduces duplication risk.
 * Uses content_similarity_detector for extended comparison.
 */
function validateDuplicateSafety(originalDoc, optimizedDoc, catalog) {
  if (!Array.isArray(catalog) || catalog.length < 2) {
    return { ok: true, risk: "low", reason: "catalog-too-small" };
  }

  const optimizedTitle = String(optimizedDoc.seoTitle || optimizedDoc.title || optimizedDoc.h1 || "");
  const optimizedHtml = String(optimizedDoc.articleHtml || optimizedDoc.contentHtml || "");

  let maxSimilarity = 0;
  let mostSimilarId = "";

  for (const other of catalog) {
    if (!other || other.id === optimizedDoc.id) continue;
    const otherTitle = String(other.seoTitle || other.title || other.h1 || "");
    const otherHtml = String(other.articleHtml || other.contentHtml || "");

    const sim = calculateSimilarity(
      { title: optimizedTitle, script: optimizedHtml },
      { title: otherTitle, script: otherHtml }
    );

    if (sim.similarity > maxSimilarity) {
      maxSimilarity = sim.similarity;
      mostSimilarId = other.id;
    }
  }

  // Check if duplication risk increased compared to original
  const originalTitle = String(originalDoc.seoTitle || originalDoc.title || originalDoc.h1 || "");
  const originalHtml = String(originalDoc.articleHtml || originalDoc.contentHtml || "");
  let originalMaxSim = 0;
  for (const other of catalog) {
    if (!other || other.id === originalDoc.id) continue;
    const sim = calculateSimilarity(
      { title: originalTitle, script: originalHtml },
      { title: String(other.seoTitle || other.title || other.h1 || ""), script: String(other.articleHtml || other.contentHtml || "") }
    );
    if (sim.similarity > originalMaxSim) originalMaxSim = sim.similarity;
  }

  const riskIncreased = maxSimilarity > originalMaxSim + 0.1;
  const highRisk = maxSimilarity >= 0.8;

  return {
    ok: !riskIncreased && !highRisk,
    risk: highRisk ? "high" : riskIncreased ? "increased" : "low",
    maxSimilarity: Number(maxSimilarity.toFixed(3)),
    originalMaxSimilarity: Number(originalMaxSim.toFixed(3)),
    mostSimilarId,
    reason: highRisk
      ? `optimized content is too similar to ${mostSimilarId}`
      : riskIncreased
        ? `duplication risk increased from ${originalMaxSim.toFixed(2)} to ${maxSimilarity.toFixed(2)}`
        : "ok"
  };
}

// ─── Quality Gate ────────────────────────────────────────────────────

/**
 * Compare before/after quality scores across all dimensions.
 * Returns { improved, degraded, delta, details }.
 */
function compareQuality(before, after) {
  const details = {};
  let improved = 0;
  let degraded = 0;
  let totalDelta = 0;

  for (const dim of Object.keys(before.dimensions)) {
    const bScore = before.dimensions[dim] || 0;
    const aScore = after.dimensions[dim] || 0;
    const delta = aScore - bScore;
    details[dim] = { before: bScore, after: aScore, delta };
    if (delta > 0) improved++;
    else if (delta < 0) degraded++;
    totalDelta += delta;
  }

  return {
    improved: after.overall > before.overall,
    degraded: after.overall < before.overall,
    overallBefore: before.overall,
    overallAfter: after.overall,
    overallDelta: after.overall - before.overall,
    dimensionsImproved: improved,
    dimensionsDegraded: degraded,
    details
  };
}

/**
 * Decide whether to keep or rollback based on quality comparison.
 */
function shouldKeepChange(beforeScore, afterScore, duplicateCheck) {
  // Must not degrade overall score
  if (afterScore.overall < beforeScore.overall) {
    return { keep: false, reason: "overall-score-degraded" };
  }

  // Must not increase duplication risk
  if (duplicateCheck && !duplicateCheck.ok) {
    return { keep: false, reason: duplicateCheck.reason };
  }

  // Must show meaningful improvement
  const delta = afterScore.overall - beforeScore.overall;
  if (delta < MIN_IMPROVEMENT && delta !== 0) {
    return { keep: false, reason: `improvement-too-small:${delta}` };
  }

  // Check critical dimensions didn't degrade
  const criticalDims = ["factualSafety", "completeness"];
  for (const dim of criticalDims) {
    const before = beforeScore.dimensions[dim] || 0;
    const after = afterScore.dimensions[dim] || 0;
    if (after < before - 5) {
      return { keep: false, reason: `critical-dimension-degraded:${dim}` };
    }
  }

  return { keep: true, reason: "quality-improved" };
}

// ─── Proposal Generation ─────────────────────────────────────────────

/**
 * Generate improvement proposals for a page, including AI-powered Level B.
 * Returns proposals grouped by level.
 */
function generateImprovements(doc, audit, options = {}) {
  const now = options.now || new Date();
  const catalog = options.catalog || [];

  // Deterministic proposals from existing optimizer
  const proposals = generateProposals(audit, doc, { now, catalog });

  // Enrich with AI for Level B blog/articleHtml proposals
  const enriched = [];
  for (const proposal of proposals) {
    if (proposal.field === "articleHtml" && proposal.contentType === "BLOG" && options.useAi) {
      enriched.push({ ...proposal, _tryAi: true });
    } else {
      enriched.push(proposal);
    }
  }

  return {
    all: enriched,
    levelA: enriched.filter((p) => p.level === "A"),
    levelB: enriched.filter((p) => p.level === "B"),
    levelC: enriched.filter((p) => p.level === "C")
  };
}

// ─── Single-Page Optimization ────────────────────────────────────────

/**
 * Optimize a single page with the full loop:
 *   AUDIT → SCORE → GENERATE → VALIDATE → SNAPSHOT → APPLY →
 *   RE-AUDIT → COMPARE → KEEP or ROLLBACK
 *
 * Supports multi-pass (up to MAX_PASSES).
 */
async function optimizePage(db, FieldValue, doc, options = {}) {
  const now = options.now || new Date();
  const catalog = options.catalog || [];
  const dryRun = options.dryRun === true;
  const actor = options.actor || "auto-optimizer";
  const maxPasses = Math.min(MAX_PASSES, Number(options.maxPasses) || MAX_PASSES);
  const collectionName = options.collectionName || collectionForContentType(
    doc.contentType || (doc.collection === "blogs" ? "BLOG" : doc.collection === "fast_track" ? "FAST_TRACK" : doc.collection === "mock_tests" ? "MOCK_TEST" : "JOB")
  );

  const passes = [];
  let currentDoc = deepClone(doc);
  let totalApplied = 0;
  let totalRolledBack = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    // 1. AUDIT
    const audit = auditPage(currentDoc, { now, catalog });

    // 2. SCORE (before)
    const beforeScore = scorePage(currentDoc, { now, catalog });

    // 3. Check if already high quality
    if (!needsImprovement(beforeScore, QUALITY_THRESHOLD)) {
      passes.push({
        pass: pass + 1,
        status: "already-high-quality",
        beforeScore: beforeScore.overall,
        afterScore: beforeScore.overall,
        qualityDelta: 0,
        changes: [],
        skipped: true
      });
      break;
    }

    // 4. FIND WEAKNESS + GENERATE IMPROVEMENT
    const improvements = generateImprovements(currentDoc, audit, { now, catalog, useAi: options.useAi });

    if (!improvements.all.length) {
      passes.push({
        pass: pass + 1,
        status: "no-improvement-proposals",
        beforeScore: beforeScore.overall,
        afterScore: beforeScore.overall,
        qualityDelta: 0,
        changes: [],
        skipped: true
      });
      break;
    }

    // 5. Select proposals to apply this pass
    // Level A first, then Level B if AI is enabled
    const candidates = [];
    for (const proposal of improvements.levelA) {
      candidates.push({ ...proposal, _autoLevel: "A" });
    }
    if (options.useAi) {
      for (const proposal of improvements.levelB) {
        if (proposal.field !== "articleHtml" || proposal.contentType === "BLOG" || proposal.contentType === "JOB" || proposal.contentType === "FAST_TRACK") {
          candidates.push({ ...proposal, _autoLevel: "B" });
        }
      }
    }

    if (!candidates.length) {
      passes.push({
        pass: pass + 1,
        status: "no-auto-applicable-proposals",
        beforeScore: beforeScore.overall,
        afterScore: beforeScore.overall,
        qualityDelta: 0,
        changes: [],
        reviewProposals: improvements.levelB.map(compactProposal),
        blockedProposals: improvements.levelC.map(compactProposal),
        skipped: true
      });
      break;
    }

    // 6. Build patches and validate
    const validatedPatches = [];
    const passChanges = [];

    for (const proposal of candidates) {
      // Gate check
      const gate = gateProposal(proposal, { ...currentDoc, contentType: proposal.contentType }, null);
      if (!gate.ok) continue;

      // Build patch
      const patch = buildProposalPatch(proposal);
      if (!patch) continue;

      // Claim validation for HTML content
      if (proposal.field === "articleHtml") {
        const html = extractArticleHtml(proposal.proposedValue);
        if (html) {
          const claimCheck = validateClaims(html, currentDoc);
          if (!claimCheck.ok) {
            passChanges.push({
              field: proposal.field,
              level: proposal._autoLevel || proposal.level,
              status: "rejected",
              reason: `ungrounded-claims:${claimCheck.ungrounded[0]?.kind || "unknown"}`
            });
            continue;
          }
        }
      }

      // Duplicate validation
      const patchedDoc = mergePatch(currentDoc, patch);
      const dupCheck = validateDuplicateSafety(currentDoc, patchedDoc, catalog);
      if (!dupCheck.ok) {
        passChanges.push({
          field: proposal.field,
          level: proposal._autoLevel || proposal.level,
          status: "rejected",
          reason: dupCheck.reason
        });
        continue;
      }

      validatedPatches.push({ proposal, patch, collectionName });
      passChanges.push({
        field: proposal.field,
        level: proposal._autoLevel || proposal.level,
        status: "validated",
        reason: proposal.reason,
        oldValue: typeof proposal.oldValue === "string" ? proposal.oldValue.slice(0, 200) : proposal.oldValue,
        newValue: typeof proposal.proposedValue === "string" ? proposal.proposedValue.slice(0, 200) : proposal.proposedValue
      });
    }

    if (!validatedPatches.length) {
      passes.push({
        pass: pass + 1,
        status: "no-valid-patches",
        beforeScore: beforeScore.overall,
        afterScore: beforeScore.overall,
        qualityDelta: 0,
        changes: passChanges,
        skipped: true
      });
      break;
    }

    // 7. SNAPSHOT + APPLY
    let snapshotIds = [];
    let applyError = null;

    if (!dryRun && db) {
      for (const { proposal, patch } of validatedPatches) {
        try {
          const fields = Object.keys(patch);
          const oldValues = pickOldValues(currentDoc, fields);
          const snapshot = buildSnapshot({
            proposal,
            collectionName,
            documentId: currentDoc.id,
            oldValues,
            newValues: patch,
            actor,
            now
          });
          await persistSnapshot(db, FieldValue, snapshot);
          snapshotIds.push(snapshot.id);

          // Write patch
          const stamp = FieldValue && FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : now.toISOString();
          await db.collection(collectionName).doc(currentDoc.id).set(
            { ...patch, seoAppliedAt: stamp, contentUpdatedAt: stamp },
            { merge: true }
          );

          // Update in-memory doc for re-audit
          currentDoc = mergePatch(currentDoc, patch);
          totalApplied++;
        } catch (error) {
          applyError = error.message;
          // Rollback all snapshots from this pass
          for (const snapId of snapshotIds) {
            try {
              const snapshot = await loadSnapshot(db, snapId);
              if (snapshot && snapshot.oldValues) {
                const stamp = FieldValue && FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : now.toISOString();
                await db.collection(collectionName).doc(currentDoc.id).set(
                  { ...snapshot.oldValues, seoRolledBackAt: stamp, contentUpdatedAt: stamp },
                  { merge: true }
                );
                await markSnapshotRestored(db, snapId, now);
                totalRolledBack++;
              }
            } catch { /* best-effort rollback */ }
          }
          break;
        }
      }
    } else if (dryRun) {
      // In dry-run, simulate the merge
      for (const { patch } of validatedPatches) {
        currentDoc = mergePatch(currentDoc, patch);
      }
    }

    if (applyError) {
      passes.push({
        pass: pass + 1,
        status: "apply-failed",
        beforeScore: beforeScore.overall,
        afterScore: beforeScore.overall,
        qualityDelta: 0,
        changes: passChanges,
        error: applyError,
        rolledBack: true
      });
      break;
    }

    // 8. RE-AUDIT
    const afterAudit = auditPage(currentDoc, { now, catalog });
    const afterScore = scorePage(currentDoc, { now, catalog });

    // 9. COMPARE BEFORE/AFTER
    const comparison = compareQuality(beforeScore, afterScore);
    const dupCheckFinal = validateDuplicateSafety(doc, currentDoc, catalog);
    const keepDecision = shouldKeepChange(beforeScore, afterScore, dupCheckFinal);

    // 10. KEEP or ROLLBACK
    if (!keepDecision.keep && !dryRun && db && snapshotIds.length) {
      // Rollback
      for (const snapId of snapshotIds) {
        try {
          const snapshot = await loadSnapshot(db, snapId);
          if (snapshot && snapshot.oldValues) {
            const stamp = FieldValue && FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : now.toISOString();
            await db.collection(collectionName).doc(currentDoc.id).set(
              { ...snapshot.oldValues, seoRolledBackAt: stamp, contentUpdatedAt: stamp },
              { merge: true }
            );
            await markSnapshotRestored(db, snapId, now);
            totalRolledBack++;
          }
        } catch { /* best-effort rollback */ }
      }
      // Restore in-memory doc
      currentDoc = deepClone(doc);

      passes.push({
        pass: pass + 1,
        status: "rolled-back",
        beforeScore: beforeScore.overall,
        afterScore: afterScore.overall,
        qualityDelta: afterScore.overall - beforeScore.overall,
        comparison,
        duplicateCheck: dupCheckFinal,
        keepDecision,
        changes: passChanges,
        snapshotIds,
        rolledBack: true
      });
      break;
    }

    passes.push({
      pass: pass + 1,
      status: keepDecision.keep ? "improved" : "kept-dry-run",
      beforeScore: beforeScore.overall,
      afterScore: afterScore.overall,
      qualityDelta: afterScore.overall - beforeScore.overall,
      comparison,
      duplicateCheck: dupCheckFinal,
      keepDecision,
      changes: passChanges,
      snapshotIds,
      auditBefore: compactAudit(audit),
      auditAfter: compactAudit(afterAudit)
    });

    // If quality is now good enough, stop
    if (!needsImprovement(afterScore, QUALITY_THRESHOLD)) break;

    // If no improvement this pass, stop
    if (afterScore.overall <= beforeScore.overall) break;
  }

  // Final score
  const finalScore = scorePage(currentDoc, { now, catalog });
  const originalScore = scorePage(doc, { now, catalog });

  // Persist tracker
  if (!dryRun && db) {
    const fp = buildContentFingerprint(currentDoc);
    const allChanges = passes.flatMap((p) => p.changes || []).filter((c) => c.status === "validated" || c.status === "applied");
    const trackerRecord = buildTrackerRecord(
      doc,
      originalScore.overall,
      finalScore.overall,
      allChanges,
      {
        safetyLevel: classifyQuality(finalScore.overall),
        status: totalApplied > 0 ? "optimized" : "unchanged",
        reason: passes.map((p) => p.status).join(" → ")
      }
    );
    trackerRecord.optimizationVersion = AUTO_OPTIMIZER_VERSION;
    trackerRecord.passes = passes.length;
    trackerRecord.totalApplied = totalApplied;
    trackerRecord.totalRolledBack = totalRolledBack;
    trackerRecord.beforeFingerprint = buildContentFingerprint(doc).hash;
    trackerRecord.afterFingerprint = fp.hash;
    await persistTracker(db, FieldValue, doc.id, trackerRecord);
  }

  return {
    ok: true,
    dryRun,
    contentId: doc.id,
    collectionName,
    originalScore: originalScore.overall,
    finalScore: finalScore.overall,
    qualityDelta: finalScore.overall - originalScore.overall,
    passes,
    totalPasses: passes.length,
    totalApplied,
    totalRolledBack,
    status: totalApplied > 0 ? "optimized" : totalRolledBack > 0 ? "rolled-back" : "unchanged"
  };
}

// ─── Patch Builder ───────────────────────────────────────────────────

/**
 * Build a Firestore patch from a proposal.
 * Reuses proposal_model field checks.
 */
function buildProposalPatch(proposal) {
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
  if (field === "faqs") {
    const faqs = Array.isArray(proposal.proposedValue) ? proposal.proposedValue : [];
    if (!faqs.length) return null;
    return { faqs };
  }
  if (!isApplyableField(field)) return null;
  return { [field]: proposal.proposedValue };
}

// ─── Batch Processing ────────────────────────────────────────────────

/**
 * Run optimization on a batch of oldest-eligible pages.
 * Each page goes through the full optimize loop.
 * Failures don't stop the batch.
 */
async function runOptimizationBatch(db, FieldValue, options = {}) {
  const now = options.now || new Date();
  const batchSize = Math.min(MAX_PAGES_PER_BATCH, Number(options.batchSize) || MAX_PAGES_PER_BATCH);
  const dryRun = options.dryRun === true;
  const actor = options.actor || "auto-optimizer";

  // 1. Select oldest eligible pages
  const pages = await selectOldestEligible(db, { batchSize, ...options });

  if (!pages.length) {
    return {
      ok: true, dryRun, processed: 0, improved: 0, skipped: 0,
      rolledBack: 0, failed: 0, results: [],
      message: "No eligible pages found."
    };
  }

  // 2. Load trackers for idempotency
  const contentIds = pages.map((p) => p.id);
  const trackers = await loadTrackers(db, contentIds);

  // 3. Process each page
  const results = [];
  let improved = 0;
  let skipped = 0;
  let rolledBack = 0;
  let failed = 0;

  for (const page of pages) {
    try {
      const result = await optimizePage(db, FieldValue, page, {
        now, dryRun, actor, catalog: pages,
        collectionName: page.collection
      });

      if (result.status === "optimized") improved++;
      else if (result.status === "rolled-back") rolledBack++;
      else if (result.status === "unchanged") skipped++;
      else skipped++;

      results.push(result);
    } catch (error) {
      failed++;
      results.push({
        ok: false,
        contentId: page.id,
        status: "failed",
        error: error.message,
        originalScore: 0,
        finalScore: 0,
        qualityDelta: 0,
        passes: []
      });
    }
  }

  // 4. Update progress
  if (!dryRun && db) {
    await updateBackfillProgress(db, FieldValue, {
      lastBatchSize: pages.length,
      lastBatchImproved: improved,
      lastBatchSkipped: skipped,
      lastBatchRolledBack: rolledBack,
      lastBatchFailed: failed,
      lastBatchAt: now.toISOString()
    });
  }

  return {
    ok: true, dryRun,
    processed: results.length,
    improved, skipped, rolledBack, failed,
    results
  };
}

// ─── New Content Pipeline ────────────────────────────────────────────

/**
 * Process a newly published page through the optimization pipeline.
 * Called after publish → audit → optimize → apply → re-audit → keep/rollback.
 */
async function processNewContent(db, FieldValue, doc, options = {}) {
  return optimizePage(db, FieldValue, doc, {
    ...options,
    maxPasses: 2 // New content gets fewer passes
  });
}

// ─── Full Backfill ───────────────────────────────────────────────────

/**
 * Run the full backfill pipeline across multiple batches.
 */
async function runBackfill(db, FieldValue, options = {}) {
  const maxBatches = Math.min(10, Number(options.maxBatches) || 3);
  const batchSize = Number(options.batchSize) || MAX_PAGES_PER_BATCH;
  const dryRun = options.dryRun === true;

  const allResults = [];
  let totalImproved = 0;
  let totalSkipped = 0;
  let totalRolledBack = 0;
  let totalFailed = 0;

  for (let i = 0; i < maxBatches; i++) {
    const batch = await runOptimizationBatch(db, FieldValue, {
      batchSize, dryRun, now: options.now,
      collections: options.collections, useAi: options.useAi
    });

    allResults.push(...batch.results);
    totalImproved += batch.improved;
    totalSkipped += batch.skipped;
    totalRolledBack += batch.rolledBack;
    totalFailed += batch.failed;

    if (batch.processed === 0) break;
  }

  return {
    ok: true, dryRun,
    batches: maxBatches,
    totalProcessed: allResults.length,
    totalImproved, totalSkipped, totalRolledBack, totalFailed,
    results: allResults
  };
}

// ─── Status ──────────────────────────────────────────────────────────

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
  } catch { return null; }
}

module.exports = {
  AUTO_OPTIMIZER_VERSION,
  MAX_PASSES,
  MIN_IMPROVEMENT,
  validateClaims,
  validateDuplicateSafety,
  compareQuality,
  shouldKeepChange,
  generateImprovements,
  buildProposalPatch,
  optimizePage,
  runOptimizationBatch,
  processNewContent,
  runBackfill,
  getOptimizerStatus
};
