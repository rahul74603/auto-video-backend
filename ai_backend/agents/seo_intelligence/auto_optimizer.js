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
 *   Level B: deterministic improvements (structure/meta/links/FAQs built
 *            from facts already on the record) are applied ONLY after the
 *            full validation gauntlet: proposal gate → claim grounding →
 *            duplicate safety → snapshot → apply → re-audit → compare →
 *            keep/rollback. AI is an optional enhancement for Level B
 *            articleHtml; when AI is unavailable/fails/invents facts the
 *            deterministic proposal is used instead. AI never a hard dep.
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
  buildContentFingerprint, buildTrackerRecord, isAlreadyOptimized,
  buildFailureTracker, countProcessedPages,
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
const { buildChangeEvent, tryRecordChangeEvent, buildIdempotencyKey, findAppliedEventByKey } = require("./change_events");
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
const AUTO_OPTIMIZER_VERSION = 3;
const MAX_PASSES = 3;
const MIN_IMPROVEMENT = 2;
const MAX_PAGES_PER_BATCH = 10;
const WEAK_DIMENSION_THRESHOLD = 70;

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
  // Capture ONLY the pre-patch values for the fields this patch touches.
  // (Unconditional inclusion of articleHtml/seoTitle/metaDescription in every
  // snapshot previously caused later snapshot restores to clobber earlier
  // ones with already-patched values during multi-patch rollback.)
  const out = {};
  const wanted = new Set(fields);
  if (wanted.has("articleHtml") || wanted.has("contentHtml")) {
    if (doc && typeof doc.articleHtml === "string") wanted.add("articleHtml");
    if (doc && typeof doc.contentHtml === "string") wanted.add("contentHtml");
  }
  for (const f of wanted) {
    if (doc && Object.prototype.hasOwnProperty.call(doc, f)) out[f] = doc[f];
    else out[f] = null;
  }
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
    // A malformed catalog entry must never poison other pages' validation
    let otherTitle = "";
    let otherHtml = "";
    try {
      otherTitle = String(other.seoTitle || other.title || other.h1 || "");
      otherHtml = String(other.articleHtml || other.contentHtml || "");
    } catch { continue; }

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
    let otherTitle = "";
    let otherHtml = "";
    try {
      otherTitle = String(other.seoTitle || other.title || other.h1 || "");
      otherHtml = String(other.articleHtml || other.contentHtml || "");
    } catch { continue; }
    const sim = calculateSimilarity(
      { title: originalTitle, script: originalHtml },
      { title: otherTitle, script: otherHtml }
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

/** True when a proposal came from (or requires) AI rather than deterministic rules. */
function isAiProposal(proposal) {
  return String(proposal && (proposal.htmlSource || proposal.source) || "") === "ai-proposal";
}

/**
 * Generate improvement proposals for a page.
 * Deterministic proposals (Level A + B) are ALWAYS produced — they are built
 * from facts already on the record. AI is an optional enhancement, marked
 * with _tryAi, attempted only when options.useAi is true.
 */
function generateImprovements(doc, audit, options = {}) {
  const now = options.now || new Date();
  const catalog = options.catalog || [];

  // Deterministic proposals from existing optimizer
  const proposals = generateProposals(audit, doc, { now, catalog });

  // Mark BLOG articleHtml proposals for optional AI enhancement
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
    levelC: enriched.filter((p) => p.level === "C"),
    deterministicAvailable: enriched.some((p) => p.level !== "C" && !isAiProposal(p) && p.proposedValue != null),
    aiRequired: enriched.some((p) => isAiProposal(p) || p._tryAi === true)
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
  const pageContentType = String(doc.contentType || (
    collectionName === "blogs" ? "BLOG" : collectionName === "fast_track" ? "FAST_TRACK" : collectionName === "mock_tests" ? "MOCK_TEST" : "JOB"
  ));

  const passes = [];
  let currentDoc = deepClone(doc);
  let totalApplied = 0;
  let totalRolledBack = 0;
  let netApplied = 0; // patches applied minus patches later rolled back
  let wouldApply = 0; // dry-run: number of validated patches that WOULD be applied
  let aiAttempted = false;
  let aiUsed = false;
  let safetyBlocked = false; // at least one proposal rejected by claim/duplicate/HTML safety
  let lastSkipReason = "";
  let bodyContentChanged = false;
  const fieldsChanged = new Set();
  const proposedImprovements = [];
  let lastDuplicateCheck = null;
  let lastClaimCheck = null;
  const validationResults = [];

  // Initial audit + score for reporting
  const initialAudit = auditPage(doc, { now, catalog });
  const initialScore = scorePage(doc, { now, catalog });
  const weakDimensions = Object.entries(initialScore.dimensions || {})
    .filter(([, score]) => score < WEAK_DIMENSION_THRESHOLD)
    .map(([dim]) => dim);

  let pageAction = "REVIEW"; // refined below; SKIP when already high quality
  let alreadyHighQuality = false;
  let deterministicAvailable = false;

  for (let pass = 0; pass < maxPasses; pass++) {
    // 1. AUDIT
    const audit = auditPage(currentDoc, { now, catalog });

    // 2. SCORE (before)
    const beforeScore = scorePage(currentDoc, { now, catalog });

    // 3. Check if already high quality
    if (!needsImprovement(beforeScore, QUALITY_THRESHOLD)) {
      alreadyHighQuality = true;
      lastSkipReason = "already-high-quality";
      passes.push({
        pass: pass + 1,
        status: "already-high-quality",
        beforeScore: beforeScore.overall,
        afterScore: beforeScore.overall,
        qualityDelta: 0,
        changes: [],
        skipped: true,
        skipReason: "already-high-quality"
      });
      break;
    }

    // 4. FIND WEAKNESS + GENERATE IMPROVEMENT
    const improvements = generateImprovements(currentDoc, audit, {
      now, catalog, useAi: options.useAi, generateJson: options.generateJson
    });
    deterministicAvailable = deterministicAvailable || Boolean(improvements.deterministicAvailable);

    for (const proposal of improvements.all) {
      if (proposedImprovements.length >= 10) break;
      proposedImprovements.push({
        field: proposal.field,
        level: proposal.level,
        source: proposal.htmlSource || proposal.source || "deterministic-optimizer",
        reason: proposal.reason,
        aiRequired: Boolean(proposal._tryAi) || isAiProposal(proposal)
      });
    }

    if (!improvements.all.length) {
      lastSkipReason = "no-improvement-proposals";
      passes.push({
        pass: pass + 1,
        status: "no-improvement-proposals",
        beforeScore: beforeScore.overall,
        afterScore: beforeScore.overall,
        qualityDelta: 0,
        changes: [],
        skipped: true,
        skipReason: "no-improvement-proposals"
      });
      break;
    }

    // 5. Select proposals to apply this pass.
    //    Level A: always. Level B: deterministic improvements are applied
    //    through the full validation gauntlet (gate → claims → duplicate →
    //    snapshot → re-audit → keep/rollback). AI enhancement is attempted
    //    only when useAi is true and falls back to the deterministic value.
    const candidates = [];
    for (const proposal of improvements.levelA) {
      candidates.push({ ...proposal, _autoLevel: "A" });
    }
    for (const proposal of improvements.levelB) {
      if (proposal.field === "articleHtml"
        && !["BLOG", "JOB", "FAST_TRACK"].includes(proposal.contentType)) {
        continue; // articleHtml applies only to body-capable types
      }
      let candidate = { ...proposal, _autoLevel: "B" };

      // Optional AI enhancement (never a hard dependency)
      if (proposal._tryAi && options.useAi) {
        aiAttempted = true;
        try {
          const deterministic = {
            articleHtml: extractArticleHtml(proposal.proposedValue),
            contentPlan: proposal.proposedValue && proposal.proposedValue.contentPlan,
            insufficientSource: Boolean(proposal.proposedValue && proposal.proposedValue.insufficientSource),
            htmlSource: proposal.htmlSource,
            preview: proposal.proposedValue && proposal.proposedValue.preview,
            reason: proposal.reason
          };
          const enriched = await enrichBlogHtmlProposal(currentDoc, { id: "content:thin-blog", evidence: { words: 0 } }, deterministic, {
            useAi: true,
            generateJson: options.generateJson,
            catalog
          });
          if (enriched && enriched.articleHtml) {
            candidate = {
              ...proposal,
              proposedValue: {
                articleHtml: enriched.articleHtml,
                preview: enriched.preview || null,
                contentPlan: enriched.contentPlan || deterministic.contentPlan,
                insufficientSource: Boolean(enriched.insufficientSource),
                htmlSource: enriched.htmlSource
              },
              reason: enriched.reason || proposal.reason,
              source: enriched.htmlSource || proposal.source,
              htmlSource: enriched.htmlSource,
              _autoLevel: "B",
              _aiEnhanced: enriched.htmlSource === "ai-proposal"
            };
            if (candidate._aiEnhanced) aiUsed = true;
          }
        } catch (aiError) {
          // AI failure never blocks the pipeline — keep deterministic proposal
          validationResults.push({
            field: proposal.field,
            stage: "ai-enrichment",
            status: "fallback",
            reason: `ai-failed:${String(aiError && aiError.message || aiError).slice(0, 120)}`
          });
        }
      }

      candidates.push(candidate);
    }

    if (!candidates.length) {
      lastSkipReason = "no-auto-applicable-proposals";
      passes.push({
        pass: pass + 1,
        status: "no-auto-applicable-proposals",
        beforeScore: beforeScore.overall,
        afterScore: beforeScore.overall,
        qualityDelta: 0,
        changes: [],
        reviewProposals: improvements.levelB.map(compactProposal),
        blockedProposals: improvements.levelC.map(compactProposal),
        skipped: true,
        skipReason: "no-auto-applicable-proposals"
      });
      break;
    }

    // 6. Build patches and validate
    const validatedPatches = [];
    const passChanges = [];

    // Grounding context for the gate: internal-link anchors may copy titles of
    // already-published catalog pages verbatim — those numbers are grounded in
    // the site's own content, not invented. The page's own record is included
    // so date/vacancy claims from existing fields stay grounded. Dates/money/
    // vacancy/percent claims are additionally validated via validateClaims.
    const gateSource = {
      text: [
        sourceBlob(currentDoc),
        (Array.isArray(catalog) ? catalog : [])
          .map((c) => [c && c.title, c && c.seoTitle, c && c.h1]
            .filter(Boolean).map(String).join(" "))
          .filter(Boolean)
          .join("\n")
      ].filter(Boolean).join("\n"),
      url: currentDoc.sourceUrl || currentDoc.sourceCitation && currentDoc.sourceCitation.url || null
    };

    for (const proposal of candidates) {
      // Gate check
      const gate = gateProposal(proposal, { ...currentDoc, contentType: proposal.contentType }, gateSource);
      if (!gate.ok) {
        safetyBlocked = safetyBlocked || /UNSAFE_HTML|UNGROUNDED|FACT_LOCK|LEVEL_C/.test(String(gate.code || ""));
        validationResults.push({
          field: proposal.field, stage: "gate", status: "rejected", reason: gate.code || gate.issues && gate.issues[0] || "gate-failed"
        });
        continue;
      }

      // Build patch
      const patch = buildProposalPatch(proposal);
      if (!patch) {
        validationResults.push({ field: proposal.field, stage: "patch", status: "rejected", reason: "no-applyable-patch" });
        continue;
      }

      // Claim validation for HTML content — never allow invented facts
      if (proposal.field === "articleHtml") {
        const html = extractArticleHtml(proposal.proposedValue);
        if (html) {
          const claimCheck = validateClaims(html, currentDoc);
          lastClaimCheck = claimCheck;
          if (!claimCheck.ok) {
            safetyBlocked = true;
            passChanges.push({
              field: proposal.field,
              level: proposal._autoLevel || proposal.level,
              status: "rejected",
              reason: `ungrounded-claims:${claimCheck.ungrounded[0]?.kind || "unknown"}`
            });
            validationResults.push({
              field: proposal.field, stage: "claims", status: "rejected",
              reason: `ungrounded-claims:${claimCheck.ungrounded[0]?.kind || "unknown"}`
            });
            continue;
          }
        }
      }

      // Duplicate validation
      const patchedDoc = mergePatch(currentDoc, patch);
      const dupCheck = validateDuplicateSafety(currentDoc, patchedDoc, catalog);
      lastDuplicateCheck = dupCheck;
      if (!dupCheck.ok) {
        safetyBlocked = true;
        passChanges.push({
          field: proposal.field,
          level: proposal._autoLevel || proposal.level,
          status: "rejected",
          reason: dupCheck.reason
        });
        validationResults.push({
          field: proposal.field, stage: "duplicate-safety", status: "rejected", reason: dupCheck.reason
        });
        continue;
      }

      validatedPatches.push({ proposal, patch, collectionName });
      passChanges.push({
        field: proposal.field,
        level: proposal._autoLevel || proposal.level,
        status: "validated",
        reason: proposal.reason,
        aiEnhanced: Boolean(proposal._aiEnhanced),
        oldValue: typeof proposal.oldValue === "string" ? proposal.oldValue.slice(0, 200) : proposal.oldValue,
        newValue: typeof proposal.proposedValue === "string" ? proposal.proposedValue.slice(0, 200) : (proposal.proposedValue && proposal.proposedValue.articleHtml ? "[articleHtml]" : proposal.proposedValue)
      });
      validationResults.push({
        field: proposal.field, stage: "validate",
        status: "validated",
        reason: "gate+claims+duplicate passed",
        aiEnhanced: Boolean(proposal._aiEnhanced)
      });
    }

    if (!validatedPatches.length) {
      lastSkipReason = safetyBlocked ? "safety-blocked" : "no-valid-patches";
      passes.push({
        pass: pass + 1,
        status: "no-valid-patches",
        beforeScore: beforeScore.overall,
        afterScore: beforeScore.overall,
        qualityDelta: 0,
        changes: passChanges,
        skipped: true,
        skipReason: lastSkipReason
      });
      break;
    }

    // 7. SNAPSHOT + APPLY
    let snapshotIds = [];
    let applyError = null;
    const passStartDoc = deepClone(currentDoc);
    const eventSource = options.eventSource || "auto-optimizer";
    const appliedEventRefs = []; // { snapshot, proposal } — for rollback linkage

    // Phase 2 measurement hook — a rollback is its own ledger event; the
    // original applied event is referenced and preserved. Best-effort only.
    const recordOptimizerRollbackEvent = async (snapshot, snapId) => {
      try {
        const ref = appliedEventRefs.find((item) => item.snapshot && item.snapshot.id === snapId) || null;
        const proposalRef = ref ? ref.proposal : { id: snapshot.proposalId };
        for (const field of Object.keys(snapshot.oldValues || {})) {
          const idempotencyKey = buildIdempotencyKey({
            kind: "applied",
            contentId: snapshot.documentId || currentDoc.id,
            field,
            proposalId: proposalRef && proposalRef.id,
            oldValue: snapshot.oldValues[field],
            newValue: (snapshot.newValues || {})[field] == null ? null : (snapshot.newValues || {})[field]
          });
          const original = await findAppliedEventByKey(db, idempotencyKey);
          await tryRecordChangeEvent(db, buildChangeEvent({
            kind: "rolled_back",
            proposal: proposalRef,
            collectionName,
            contentId: snapshot.documentId || currentDoc.id,
            contentType: pageContentType,
            pageUrl: doc.url || (proposalRef && proposalRef.url) || "",
            page: doc,
            field,
            oldValue: (snapshot.newValues || {})[field] == null ? null : (snapshot.newValues || {})[field],
            newValue: snapshot.oldValues[field] == null ? null : snapshot.oldValues[field],
            snapshotId: snapshot.id || snapId,
            actor,
            source: eventSource,
            at: now,
            rolledBackFrom: original
          }), `optimizePage-rollback:${field}`);
        }
      } catch { /* ledger is best-effort; rollback itself already succeeded */ }
    };

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

          // Phase 2 measurement hook — one ledger event per applied field.
          // Never blocks the optimizer (best-effort, logged on failure).
          for (const field of fields) {
            await tryRecordChangeEvent(db, buildChangeEvent({
              kind: "applied",
              proposal,
              collectionName,
              contentId: currentDoc.id,
              contentType: pageContentType,
              pageUrl: doc.url || proposal.url || "",
              page: doc,
              field,
              oldValue: oldValues[field] == null ? null : oldValues[field],
              newValue: patch[field] == null ? null : patch[field],
              snapshotId: snapshot.id,
              actor,
              source: eventSource,
              at: now
            }), `optimizePage:${field}`);
          }
          appliedEventRefs.push({ snapshot, proposal });

          // Update in-memory doc for re-audit
          currentDoc = mergePatch(currentDoc, patch);
          totalApplied++;
          netApplied++;
          for (const field of Object.keys(patch)) fieldsChanged.add(field);
          if (Object.keys(patch).some((f) => f === "articleHtml" || f === "contentHtml")) bodyContentChanged = true;
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
                await recordOptimizerRollbackEvent(snapshot, snapId);
                totalRolledBack++;
                netApplied = Math.max(0, netApplied - 1);
              }
            } catch { /* best-effort rollback */ }
          }
          break;
        }
      }
    } else if (dryRun) {
      // In dry-run, simulate the merge (no writes anywhere)
      for (const { patch } of validatedPatches) {
        currentDoc = mergePatch(currentDoc, patch);
        wouldApply += 1;
        for (const field of Object.keys(patch)) fieldsChanged.add(field);
        if (Object.keys(patch).some((f) => f === "articleHtml" || f === "contentHtml")) bodyContentChanged = true;
      }
    }

    if (applyError) {
      lastSkipReason = `apply-failed:${applyError}`;
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
    lastDuplicateCheck = dupCheckFinal;
    const keepDecision = shouldKeepChange(beforeScore, afterScore, dupCheckFinal);

    // 10. KEEP or ROLLBACK
    if (!keepDecision.keep) {
      if (!dryRun && db && snapshotIds.length) {
        // Rollback: restore the pre-pass snapshot values
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
              await recordOptimizerRollbackEvent(snapshot, snapId);
              totalRolledBack++;
              netApplied = Math.max(0, netApplied - 1);
            }
          } catch { /* best-effort rollback */ }
        }
      }
      // Restore in-memory doc (both modes) so the final score is truthful
      currentDoc = deepClone(passStartDoc);
      lastSkipReason = `rolled-back:${keepDecision.reason}`;
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
        rolledBack: true,
        skipReason: `rolled-back:${keepDecision.reason}`
      });
      safetyBlocked = true;
      break;
    }

    passes.push({
      pass: pass + 1,
      status: "improved",
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

    // If no improvement this pass, stop — do not endlessly rewrite
    if (afterScore.overall <= beforeScore.overall) break;
  }

  // Final score
  const finalScore = scorePage(currentDoc, { now, catalog });
  const originalScore = scorePage(doc, { now, catalog });
  const finalAudit = auditPage(currentDoc, { now, catalog });

  // Determine the page-level action:
  //   IMPROVE — real (or dry-run simulated) validated improvement applied and kept
  //   SKIP    — page already meets the quality threshold; nothing to do
  //   REVIEW  — page is weak but no safe improvement could be generated
  //   BLOCK   — safety systems (claims/duplicate/rollback) stopped the change
  let status;
  if (dryRun) {
    status = wouldApply > 0 ? "would-improve" : "unchanged";
  } else {
    status = netApplied > 0 ? "optimized" : totalRolledBack > 0 ? "rolled-back" : "unchanged";
  }

  if (dryRun) {
    pageAction = wouldApply > 0 ? "IMPROVE" : (alreadyHighQuality ? "SKIP" : (safetyBlocked ? "BLOCK" : "REVIEW"));
  } else if (status === "optimized") {
    pageAction = "IMPROVE";
  } else if (status === "rolled-back") {
    pageAction = "BLOCK";
  } else {
    pageAction = alreadyHighQuality ? "SKIP" : (safetyBlocked ? "BLOCK" : "REVIEW");
  }

  if (!lastSkipReason) {
    lastSkipReason = alreadyHighQuality ? "already-high-quality"
      : (status === "optimized" || status === "would-improve") ? ""
        : "weak-but-no-safe-improvement";
  }

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
        status: netApplied > 0 ? "optimized" : "unchanged",
        reason: passes.map((p) => p.status).join(" → ")
      }
    );
    trackerRecord.optimizationVersion = AUTO_OPTIMIZER_VERSION;
    trackerRecord.passes = passes.length;
    trackerRecord.totalApplied = totalApplied;
    trackerRecord.totalRolledBack = totalRolledBack;
    trackerRecord.beforeFingerprint = buildContentFingerprint(doc).hash;
    trackerRecord.afterFingerprint = fp.hash;
    trackerRecord.action = pageAction;
    trackerRecord.skipReason = lastSkipReason;
    await persistTracker(db, FieldValue, doc.id, trackerRecord);
  }

  const result = {
    ok: true,
    dryRun,
    contentId: doc.id,
    collectionName,
    contentType: initialScore.pageType,
    originalScore: originalScore.overall,
    finalScore: finalScore.overall,
    qualityDelta: finalScore.overall - originalScore.overall,
    passes,
    totalPasses: passes.length,
    totalApplied,
    totalRolledBack,
    netApplied,
    wouldApply,
    status,
    action: pageAction,
    skipReason: status === "optimized" || status === "would-improve" ? "" : lastSkipReason,
    // Page-level diagnostics (safe to surface in reports/dashboard)
    detail: {
      contentId: doc.id,
      collectionName,
      contentType: initialScore.pageType,
      beforeScore: originalScore.overall,
      beforeDimensions: initialScore.dimensions,
      weakDimensions,
      detectedWeaknesses: (initialAudit.findings || []).map((f) => f.id),
      proposedImprovements,
      fieldsChanged: [...fieldsChanged],
      bodyContentChanged,
      deterministicAvailable,
      aiRequired: aiUsed,
      aiAttempted,
      projectedAfterScore: dryRun ? finalScore.overall : undefined,
      validationResults,
      duplicateSafety: lastDuplicateCheck
        ? { ok: lastDuplicateCheck.ok, risk: lastDuplicateCheck.risk, maxSimilarity: lastDuplicateCheck.maxSimilarity }
        : { ok: true, risk: "low", note: "not-evaluated" },
      factualSafety: lastClaimCheck
        ? { ok: lastClaimCheck.ok, totalClaims: lastClaimCheck.totalClaims, ungroundedCount: (lastClaimCheck.ungrounded || []).length }
        : { ok: true, note: "no-html-claims-to-check" },
      fixedWeaknesses: (initialAudit.findings || []).map((f) => f.id)
        .filter((id) => !(finalAudit.findings || []).some((f) => f.id === id))
    }
  };
  return result;
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
 *
 * options.excludeIds — Set/Array of contentIds already processed in this run
 * (dry-run does not persist trackers, so in-run de-duplication is applied here).
 */
async function runOptimizationBatch(db, FieldValue, options = {}) {
  const now = options.now || new Date();
  const batchSize = Math.min(MAX_PAGES_PER_BATCH, Number(options.batchSize) || MAX_PAGES_PER_BATCH);
  const dryRun = options.dryRun === true;
  const actor = options.actor || "auto-optimizer";
  const excludeIds = new Set(
    Array.isArray(options.excludeIds) ? options.excludeIds.map(String)
      : (options.excludeIds instanceof Set ? [...options.excludeIds].map(String) : [])
  );

  // 1. Select oldest eligible candidate pages (fetch extra so tracker
  //    filtering and in-run de-duplication cannot starve a batch).
  const candidatePages = await selectOldestEligible(db, {
    ...options,
    excludeIds,
    batchSize: Math.max(batchSize, Math.min(20, batchSize * 2))
  });

  if (!candidatePages.length) {
    return {
      ok: true, dryRun, processed: 0, improved: 0, skipped: 0,
      needsReview: 0, blocked: 0, rolledBack: 0, failed: 0, results: [],
      message: "No eligible pages found."
    };
  }

  // 2. Load trackers for idempotency and filter already-optimized pages
  //    BEFORE processing them (so re-runs skip finished work).
  const contentIds = candidatePages.map((p) => p.id);
  const trackers = await loadTrackers(db, contentIds);
  const pages = candidatePages
    .filter((p) => !excludeIds.has(String(p.id)))
    .filter((p) => !isAlreadyOptimized(trackers[p.id], p))
    .slice(0, batchSize);

  if (!pages.length) {
    return {
      ok: true, dryRun, processed: 0, improved: 0, skipped: 0,
      needsReview: 0, blocked: 0, rolledBack: 0, failed: 0, results: [],
      message: "No eligible pages found after idempotency filtering."
    };
  }

  // 3. Process each page — one failure never stops the batch
  const results = [];
  let improved = 0;
  let skipped = 0;
  let needsReview = 0;
  let blocked = 0;
  let rolledBack = 0;
  let failed = 0;

  for (const page of pages) {
    try {
      const result = await optimizePage(db, FieldValue, page, {
        now, dryRun, actor, catalog: pages,
        collectionName: page.collection,
        useAi: options.useAi,
        generateJson: options.generateJson
      });

      if (result.status === "optimized" || result.status === "would-improve") improved++;
      else if (result.status === "rolled-back") { rolledBack++; blocked++; }
      else if (result.action === "SKIP") skipped++;
      else if (result.action === "BLOCK") { blocked++; skipped++; }
      else { needsReview++; skipped++; }

      results.push(result);
    } catch (error) {
      failed++;
      results.push({
        ok: false,
        contentId: page.id,
        collectionName: page.collection,
        status: "failed",
        action: "REVIEW",
        error: error.message,
        originalScore: 0,
        finalScore: 0,
        qualityDelta: 0,
        passes: []
      });
      // Persist a failure tracker (live mode) so a permanently broken page
      // cannot starve the backfill, while single failures stay retryable.
      if (!dryRun && db) {
        try {
          const prior = trackers[page.id] || {};
          await persistTracker(db, FieldValue, page.id, buildFailureTracker(page, prior, error, { now }));
        } catch { /* tracker write is best-effort */ }
      }
    }
  }

  // 4. Update progress
  if (!dryRun && db) {
    let processedCount = null;
    try {
      const counts = await countProcessedPages(db);
      processedCount = counts.processed || 0;
    } catch { /* best-effort */ }
    await updateBackfillProgress(db, FieldValue, {
      lastBatchSize: pages.length,
      lastBatchImproved: improved,
      lastBatchSkipped: skipped,
      lastBatchNeedsReview: needsReview,
      lastBatchBlocked: blocked,
      lastBatchRolledBack: rolledBack,
      lastBatchFailed: failed,
      lastBatchAt: now.toISOString(),
      ...(processedCount != null ? { processedTotal: processedCount } : {})
    });
  }

  return {
    ok: true, dryRun,
    processed: results.length,
    improved, skipped, needsReview, blocked, rolledBack, failed,
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
 * Oldest-first. In dry-run, pages already processed earlier in the same run
 * are excluded so a run never double-counts or re-simulates the same page.
 */
async function runBackfill(db, FieldValue, options = {}) {
  const maxBatches = Math.min(10, Number(options.maxBatches) || 3);
  const batchSize = Number(options.batchSize) || MAX_PAGES_PER_BATCH;
  const dryRun = options.dryRun === true;

  const allResults = [];
  const processedIds = new Set();
  let totalImproved = 0;
  let totalSkipped = 0;
  let totalNeedsReview = 0;
  let totalBlocked = 0;
  let totalRolledBack = 0;
  let totalFailed = 0;
  let batchesRun = 0;

  for (let i = 0; i < maxBatches; i++) {
    const batch = await runOptimizationBatch(db, FieldValue, {
      batchSize, dryRun, now: options.now,
      collections: options.collections, useAi: options.useAi,
      generateJson: options.generateJson,
      excludeIds: processedIds
    });

    batchesRun += 1;
    for (const result of batch.results) {
      if (result && result.contentId) processedIds.add(String(result.contentId));
    }
    allResults.push(...batch.results);
    totalImproved += batch.improved;
    totalSkipped += batch.skipped;
    totalNeedsReview += batch.needsReview || 0;
    totalBlocked += batch.blocked || 0;
    totalRolledBack += batch.rolledBack;
    totalFailed += batch.failed;

    if (batch.processed === 0) break;
  }

  return {
    ok: true, dryRun,
    batches: batchesRun,
    totalProcessed: allResults.length,
    totalImproved, totalSkipped, totalNeedsReview, totalBlocked,
    totalRolledBack, totalFailed,
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
  WEAK_DIMENSION_THRESHOLD,
  validateClaims,
  validateDuplicateSafety,
  compareQuality,
  shouldKeepChange,
  generateImprovements,
  isAiProposal,
  buildProposalPatch,
  optimizePage,
  runOptimizationBatch,
  processNewContent,
  runBackfill,
  getOptimizerStatus
};
