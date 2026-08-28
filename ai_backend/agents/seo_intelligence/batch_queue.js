"use strict";

/**
 * Capped apply queue. Never auto-runs. Level B is not batch-applied.
 * Idempotent: applied proposals are skipped. Lock is a timestamp on the
 * admin settings doc — not a public-content lock.
 */

const { QUEUE_COLLECTION, MAX_APPLY_BATCH } = require("./proposal_model");
const { applyBatch } = require("./apply_engine");

const SETTINGS = "system_settings";
const SETTINGS_DOC = "seo_intelligence";
const LOCK_MS = 2 * 60 * 1000;

function enqueueItems(existing, ids, { levelFilter } = {}) {
  const current = Array.isArray(existing) ? existing : [];
  const used = new Set(current.map((item) => item && item.proposalId));
  const extra = [];
  for (const id of ids || []) {
    const proposalId = String(id || "").trim();
    if (!proposalId || used.has(proposalId)) continue;
    extra.push({
      proposalId,
      status: "queued",
      levelFilter: levelFilter || "A",
      enqueuedAt: new Date().toISOString()
    });
    used.add(proposalId);
  }
  return current.concat(extra).slice(0, 40);
}

async function acquireLock(db, FieldValue, now) {
  if (!db) return true;
  const ref = db.collection(SETTINGS).doc(SETTINGS_DOC);
  const snap = await ref.get();
  const data = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists) && typeof snap.data === "function"
    ? snap.data()
    : {};
  const until = data && data.applyLockUntil;
  const untilMs = until && typeof until.toMillis === "function" ? until.toMillis() : Date.parse(until || 0);
  if (Number.isFinite(untilMs) && untilMs > now.getTime()) {
    return false;
  }
  await ref.set({
    applyLockUntil: FieldValue && FieldValue.serverTimestamp ? new Date(now.getTime() + LOCK_MS).toISOString() : new Date(now.getTime() + LOCK_MS).toISOString(),
    applyLockOwner: "seo-apply-queue"
  }, { merge: true });
  return true;
}

async function runQueuedApplies(db, FieldValue, proposals, options = {}) {
  const now = options.now || new Date();
  const locked = await acquireLock(db, FieldValue, now);
  if (!locked) return { ok: false, skipped: "locked" };
  const approvedA = (proposals || []).filter((item) => item && item.status === "approved" && item.level === "A");
  return applyBatch(db, FieldValue, approvedA, {
    ...options,
    max: Math.min(MAX_APPLY_BATCH, Number(options.max) || MAX_APPLY_BATCH),
    allowLevelB: false
  });
}

module.exports = {
  QUEUE_COLLECTION,
  enqueueItems,
  runQueuedApplies,
  MAX_APPLY_BATCH
};
