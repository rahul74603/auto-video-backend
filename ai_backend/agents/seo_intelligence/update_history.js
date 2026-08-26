"use strict";

/**
 * Append-only update history for published jobs / fast-track pages.
 * Never rewrites past entries. Caps at 30 rows so documents stay small.
 */

const TRACKED_FIELDS = Object.freeze([
  "title",
  "lastDate",
  "startDate",
  "examDate",
  "vacancies",
  "salary",
  "qualification",
  "applyLink",
  "directLink",
  "status",
  "updateDate"
]);

const MAX_ENTRIES = 30;

function asText(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function snapshotFields(doc) {
  const facts = doc?.facts && typeof doc.facts === "object" ? doc.facts : {};
  const out = {};
  for (const field of TRACKED_FIELDS) {
    out[field] = asText(doc?.[field] ?? facts[field]);
  }
  return out;
}

function diffFields(previous, next) {
  const changes = [];
  for (const field of TRACKED_FIELDS) {
    const from = asText(previous?.[field]);
    const to = asText(next?.[field]);
    if (from === to) continue;
    changes.push({ field, from: from.slice(0, 180), to: to.slice(0, 180) });
  }
  return changes;
}

function buildHistoryEntry(previousDoc, nextDoc, { at, reason } = {}) {
  const prev = snapshotFields(previousDoc || {});
  const next = snapshotFields(nextDoc || {});
  const changes = previousDoc ? diffFields(prev, next) : [];
  return {
    at: at || new Date().toISOString(),
    reason: reason || (previousDoc ? "updated" : "published"),
    changes
  };
}

function mergeUpdateHistory(existing, entry) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  if (!entry || typeof entry !== "object") return list.slice(-MAX_ENTRIES);
  if (entry.reason === "updated" && (!entry.changes || !entry.changes.length)) {
    return list.slice(-MAX_ENTRIES);
  }
  const last = list[list.length - 1];
  if (
    last
    && last.reason === entry.reason
    && JSON.stringify(last.changes || []) === JSON.stringify(entry.changes || [])
  ) {
    return list.slice(-MAX_ENTRIES);
  }
  list.push({
    at: String(entry.at || new Date().toISOString()).slice(0, 40),
    reason: String(entry.reason || "updated").slice(0, 40),
    changes: (entry.changes || []).slice(0, 12)
  });
  return list.slice(-MAX_ENTRIES);
}

module.exports = {
  TRACKED_FIELDS,
  MAX_ENTRIES,
  snapshotFields,
  diffFields,
  buildHistoryEntry,
  mergeUpdateHistory
};
