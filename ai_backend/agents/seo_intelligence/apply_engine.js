"use strict";

/**
 * SEO apply engine — the ONLY module that may write public content for SEO.
 *
 * Order: verify proposal → approval → actor → fact lock → gate → snapshot
 * → allowlisted field write → history → mark applied → indexing request
 * → re-audit. Never auto-applies. Never mass-applies Level B.
 */

const {
  isFactField,
  isApplyableField,
  isPlanOnlyField,
  collectionForContentType,
  extractArticleHtml,
  PUBLIC_CONTENT_COLLECTIONS,
  MAX_APPLY_BATCH,
  SNAPSHOT_COLLECTION,
  BODY_COLLECTION
} = require("./proposal_model");
const { gateProposal, previewProposal } = require("./proposal_gate");
const { sanitizeProposalHtml, tryNormalizeWithCheerio } = require("./html_safety");
const { buildSnapshot, persistSnapshot, loadSnapshot, markSnapshotRestored } = require("./snapshot_store");
const { requestIndexingAfterApply } = require("./indexing_hooks");
const { runReaudit } = require("./reaudit");

const SETTINGS = "system_settings";
const SETTINGS_DOC = "seo_intelligence";

function applyError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function nowIso(now) {
  if (!now) return new Date().toISOString();
  return now instanceof Date ? now.toISOString() : String(now);
}

function pickOldValues(doc, fields) {
  const out = {};
  for (const field of fields) {
    if (doc && Object.prototype.hasOwnProperty.call(doc, field)) out[field] = doc[field];
    else out[field] = null;
  }
  if (doc && typeof doc.articleHtml === "string") out.articleHtml = doc.articleHtml;
  if (doc && typeof doc.contentHtml === "string") out.contentHtml = doc.contentHtml;
  if (doc && doc.seoTitle != null) out.seoTitle = doc.seoTitle;
  if (doc && doc.metaDescription != null) out.metaDescription = doc.metaDescription;
  return out;
}

function buildPatch(proposal) {
  const field = String(proposal.field || "");
  if (isFactField(field)) {
    throw applyError("APPLY_FACT_LOCK", `Fact field ${field} cannot be applied`);
  }
  if (isPlanOnlyField(field)) {
    throw applyError("APPLY_PLAN_ONLY", `${field} is a plan, not an applied public field`);
  }
  if (field === "schemaMarkup" || field === "includeJobPostingSchema") {
    return { includeJobPostingSchema: false };
  }
  if (field === "howToApplySection") {
    const value = proposal.proposedValue || {};
    if (!value.officialUrl) throw applyError("APPLY_NO_VALUE", "howToApply is missing officialUrl");
    return { howToApply: value };
  }
  if (!isApplyableField(field) && field !== "howToApply") {
    throw applyError("APPLY_FIELD_NOT_ALLOWLISTED", `Field ${field} is not allowlisted for apply`);
  }
  if (field === "relatedLinks") {
    const links = (Array.isArray(proposal.proposedValue) ? proposal.proposedValue : [])
      .filter((item) => item && String(item.url || "").startsWith("/") && !String(item.url).startsWith("//"))
      .slice(0, 8);
    return { relatedLinks: links };
  }
  if (field === "articleHtml") {
    const html = extractArticleHtml(proposal.proposedValue);
    if (!html || !html.trim()) throw applyError("APPLY_NO_VALUE", "articleHtml is missing");
    const safe = sanitizeProposalHtml(html);
    if (!safe.ok) throw applyError("APPLY_UNSAFE_HTML", (safe.issues || []).join("; ") || "unsafe HTML");
    const normalized = tryNormalizeWithCheerio(safe.html, proposal.h1 || null);
    return { articleHtml: normalized };
  }
  return { [field]: proposal.proposedValue };
}

async function resolveProposalBody(db, proposal) {
  const value = proposal && proposal.proposedValue;
  if (!value || typeof value !== "object" || !value.htmlRef || extractArticleHtml(value).length > 2000) {
    return proposal;
  }
  if (!db) return proposal;
  const snap = await db.collection(BODY_COLLECTION).doc(String(value.htmlRef)).get();
  const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
  if (!exists) throw applyError("APPLY_HTML_BODY_MISSING", "seo_proposal_bodies document is missing");
  const data = typeof snap.data === "function" ? snap.data() : {};
  const html = typeof data.articleHtml === "string" ? data.articleHtml : "";
  if (!html) throw applyError("APPLY_NO_VALUE", "proposal body has no articleHtml");
  return {
    ...proposal,
    proposedValue: { ...value, articleHtml: html }
  };
}

function assertActor(actor) {
  const value = String(actor || "").trim();
  if (!value) throw applyError("APPLY_UNAUTHORIZED", "actor is required before any public content write");
  return value;
}

function assertApproved(proposal) {
  if (!proposal) throw applyError("APPLY_PROPOSAL_MISSING", "proposal is missing");
  if (proposal.status === "applied") throw applyError("APPLY_IDEMPOTENT", "proposal already applied");
  if (proposal.status !== "approved") {
    throw applyError("APPLY_NOT_APPROVED", `proposal status must be approved (got ${proposal.status || "none"})`);
  }
  if (proposal.level === "C") throw applyError("APPLY_LEVEL_C", "Level C is never applied");
}

async function readDocument(db, collectionName, documentId) {
  if (!db) return null;
  const snap = await db.collection(collectionName).doc(documentId).get();
  const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
  if (!exists) return null;
  const data = typeof snap.data === "function" ? snap.data() : {};
  return { id: documentId, ...data };
}

async function writePublicPatch(db, collectionName, documentId, patch, stamp) {
  if (!PUBLIC_CONTENT_COLLECTIONS.includes(collectionName) && collectionName !== "studyMaterials") {
    throw applyError("APPLY_COLLECTION_FORBIDDEN", `Refusing write to ${collectionName}`);
  }
  await db.collection(collectionName).doc(documentId).set(
    { ...patch, seoAppliedAt: stamp, contentUpdatedAt: stamp },
    { merge: true }
  );
}

async function updateProposalRecord(db, FieldValue, proposalId, patch) {
  const ref = db.collection(SETTINGS).doc(SETTINGS_DOC);
  const snap = await ref.get();
  const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
  const data = exists && typeof snap.data === "function" ? snap.data() : {};
  const list = Array.isArray(data.optimizationProposals) ? data.optimizationProposals : [];
  const next = list.map((item) => (item && item.id === proposalId ? { ...item, ...patch } : item));
  const history = Array.isArray(data.applyHistory) ? data.applyHistory.slice(0, 19) : [];
  history.unshift({
    proposalId,
    status: patch.status,
    snapshotId: patch.snapshotId || null,
    at: patch.appliedAt || patch.rolledBackAt || nowIso(),
    field: patch.field || null
  });
  await ref.set(
    {
      optimizationProposals: next,
      applyHistory: history,
      optimizationApply: false
    },
    { merge: true }
  );
  return next;
}

/**
 * Apply one approved proposal. Public writes happen only after snapshot persist.
 */
async function applyProposal(db, FieldValue, proposal, options = {}) {
  const actor = assertActor(options.actor);
  assertApproved(proposal);
  const collectionName = options.collectionName || collectionForContentType(proposal.contentType);
  if (!collectionName) throw applyError("APPLY_NO_COLLECTION", `No collection mapping for ${proposal.contentType}`);
  if (!proposal.contentId) throw applyError("APPLY_NO_DOCUMENT", "proposal contentId is required");

  const resolved = await resolveProposalBody(db, proposal);
  const page = options.page || await readDocument(db, collectionName, proposal.contentId) || {};
  const gate = gateProposal(resolved, { ...page, contentType: resolved.contentType }, options.source || page.source || null);
  if (!gate.ok) throw applyError(gate.code, gate.issues[0] || "quality gate failed");

  const patch = buildPatch(resolved);
  const fields = Object.keys(patch);
  const oldValues = pickOldValues(page, fields);
  const snapshot = buildSnapshot({
    proposal,
    collectionName,
    documentId: proposal.contentId,
    oldValues,
    newValues: patch,
    actor,
    now: options.now
  });

  if (options.dryRun || !db) {
    return {
      ok: true,
      dryRun: true,
      applied: false,
      snapshot,
      patch,
      gate,
      indexing: { requested: false, claimedIndexed: false, skipped: "dry-run" }
    };
  }

  await persistSnapshot(db, FieldValue, snapshot);
  const stamp = FieldValue && FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : nowIso(options.now);
  await writePublicPatch(db, collectionName, proposal.contentId, patch, stamp);
  const appliedAt = nowIso(options.now);
  await updateProposalRecord(db, FieldValue, proposal.id, {
    status: "applied",
    applied: true,
    snapshotId: snapshot.id,
    appliedAt,
    actor,
    lastError: null
  });

  const indexing = await requestIndexingAfterApply(proposal.url, {
    dryRun: false,
    skipNetwork: options.skipNetwork !== false,
    notify: options.notify
  });

  let reaudit = null;
  if (options.reaudit !== false) {
    const mergedPage = {
      ...page,
      ...patch,
      id: proposal.contentId,
      collection: collectionName,
      url: proposal.url,
      contentType: proposal.contentType
    };
    reaudit = runReaudit(mergedPage, { now: options.now || new Date(), beforeAudit: options.beforeAudit || null });
  }

  return {
    ok: true,
    dryRun: false,
    applied: true,
    snapshotId: snapshot.id,
    collection: collectionName,
    documentId: proposal.contentId,
    fields,
    gate,
    indexing,
    reaudit: reaudit ? reaudit.comparison : null,
    claimedIndexed: false
  };
}

async function rollbackProposal(db, FieldValue, proposal, options = {}) {
  const actor = assertActor(options.actor);
  if (!proposal || (proposal.status !== "applied" && !proposal.snapshotId)) {
    throw applyError("ROLLBACK_NOT_APPLIED", "rollback requires an applied proposal with a snapshot");
  }
  const collectionName = options.collectionName || collectionForContentType(proposal.contentType);
  const snapshot = options.snapshot || await loadSnapshot(db, proposal.snapshotId);
  if (!snapshot || !snapshot.oldValues) {
    throw applyError("ROLLBACK_NO_SNAPSHOT", "snapshot not found; cannot restore");
  }
  if (!db) {
    return { ok: true, dryRun: true, restored: snapshot.oldValues };
  }
  const stamp = FieldValue && FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : nowIso(options.now);
  const restore = { ...snapshot.oldValues };
  await writePublicPatch(db, collectionName, snapshot.documentId || proposal.contentId, {
    ...restore,
    seoRolledBackAt: stamp
  }, stamp);
  await markSnapshotRestored(db, snapshot.id || proposal.snapshotId, options.now);
  await updateProposalRecord(db, FieldValue, proposal.id, {
    status: "rolled_back",
    applied: false,
    rolledBackAt: nowIso(options.now),
    snapshotId: proposal.snapshotId,
    actor,
    lastError: null
  });
  return {
    ok: true,
    dryRun: false,
    rolledBack: true,
    snapshotId: proposal.snapshotId,
    collection: collectionName,
    documentId: snapshot.documentId || proposal.contentId
  };
}

async function applyBatch(db, FieldValue, proposals, options = {}) {
  const list = Array.isArray(proposals) ? proposals : [];
  const max = Math.min(MAX_APPLY_BATCH, Number(options.max) || MAX_APPLY_BATCH);
  const results = [];
  let applied = 0;
  let processed = 0;
  for (const proposal of list) {
    if (processed >= max) break;
    if (!proposal || proposal.status !== "approved") continue;
    if (proposal.level === "C") continue;
    if (proposal.field === "articleHtml") {
      results.push({ id: proposal.id, skipped: "articleHtml-not-batched" });
      continue;
    }
    if (proposal.level === "B" && options.allowLevelB !== true) {
      results.push({ id: proposal.id, skipped: "level-B-not-batched" });
      continue;
    }
    processed += 1;
    try {
      const result = await applyProposal(db, FieldValue, proposal, options);
      results.push({ id: proposal.id, ...result });
      if (result.applied || result.dryRun) applied += 1;
    } catch (error) {
      results.push({ id: proposal.id, ok: false, code: error.code, error: error.message });
    }
  }
  return { ok: true, applied, processed, max, results, autoApply: false };
}

module.exports = {
  previewProposal,
  buildPatch,
  resolveProposalBody,
  applyProposal,
  rollbackProposal,
  applyBatch,
  SETTINGS,
  SETTINGS_DOC,
  SNAPSHOT_COLLECTION,
  MAX_APPLY_BATCH
};
