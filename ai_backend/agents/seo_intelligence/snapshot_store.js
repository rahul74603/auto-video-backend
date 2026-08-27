"use strict";

const { SNAPSHOT_COLLECTION, slugId } = require("./proposal_model");

function buildSnapshot({
  proposal,
  collectionName,
  documentId,
  oldValues,
  newValues,
  actor,
  now
}) {
  const createdAt = now instanceof Date ? now.toISOString() : (now || new Date().toISOString());
  const id = slugId(["snap", proposal && proposal.id, Date.parse(createdAt) || "x"]);
  return {
    id,
    proposalId: String(proposal && proposal.id || "").slice(0, 120),
    collection: String(collectionName || "").slice(0, 80),
    documentId: String(documentId || "").slice(0, 120),
    url: String(proposal && proposal.url || "").slice(0, 300),
    field: String(proposal && proposal.field || ""),
    oldValues: oldValues && typeof oldValues === "object" ? oldValues : {},
    newValues: newValues && typeof newValues === "object" ? newValues : {},
    articleHtml: typeof (oldValues && oldValues.articleHtml) === "string"
      ? oldValues.articleHtml.slice(0, 200000)
      : null,
    seoTitle: oldValues && oldValues.seoTitle != null ? oldValues.seoTitle : (oldValues && oldValues.title) || null,
    metaDescription: oldValues && oldValues.metaDescription != null ? oldValues.metaDescription : null,
    createdAt,
    actor: String(actor || "unknown").slice(0, 120),
    restored: false
  };
}

async function persistSnapshot(db, FieldValue, snapshot) {
  if (!db) return { written: false };
  const stamp = FieldValue && FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : new Date().toISOString();
  await db.collection(SNAPSHOT_COLLECTION).doc(snapshot.id).set({
    ...snapshot,
    createdAtServer: stamp
  }, { merge: true });
  return { written: true, collection: SNAPSHOT_COLLECTION, id: snapshot.id };
}

async function loadSnapshot(db, snapshotId) {
  if (!db || !snapshotId) return null;
  const snap = await db.collection(SNAPSHOT_COLLECTION).doc(String(snapshotId)).get();
  const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
  if (!exists) return null;
  return typeof snap.data === "function" ? snap.data() : null;
}

async function markSnapshotRestored(db, snapshotId, now) {
  if (!db || !snapshotId) return;
  await db.collection(SNAPSHOT_COLLECTION).doc(String(snapshotId)).set({
    restored: true,
    restoredAt: now instanceof Date ? now.toISOString() : (now || new Date().toISOString())
  }, { merge: true });
}

module.exports = {
  SNAPSHOT_COLLECTION,
  buildSnapshot,
  persistSnapshot,
  loadSnapshot,
  markSnapshotRestored
};
