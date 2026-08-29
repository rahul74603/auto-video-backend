"use strict";

/**
 * SEO Change Events Ledger — Phase 2 (change history / attribution foundation).
 *
 * Every SEO/content change that is actually APPLIED (or rolled back) produces
 * one immutable event in the `seo_change_events` collection so a later phase
 * can join it with dated GSC Search Analytics rows and measure real outcomes.
 *
 * What this module is:
 *   - append-only event ledger (never rewrites history)
 *   - deterministic idempotency: a retried APPLY of the SAME change never
 *     duplicates the event; a genuinely NEW application of the same field
 *     appends a suffixed event instead of overwriting
 *   - records lifecycle at change time (reuses the authoritative job_lifecycle
 *     classifier; EXPIRED is a hard safety boundary for future automatic
 *     optimization)
 *   - stores a GSC join key using the EXACT Phase 1 page-URL normalization
 *
 * What this module is NOT:
 *   - it does not apply, approve, reject or optimize anything
 *   - it does not calculate outcomes, rankings or "improvements"
 *   - it never stores secrets or credentials
 *
 * Large values (articleHtml, big objects) are stored as a compact
 * representation (field, length, hash, preview) + a reference to the snapshot
 * that already safely stores the full old/new values. The existing
 * snapshot/rollback mechanism is untouched.
 */

const crypto = require("crypto");
const { classifyJobLifecycle } = require("./job_lifecycle");
const { normalizeGscPageUrl } = require("./gsc_search_analytics");

const EVENTS_COLLECTION = "seo_change_events";
const SCHEMA_VERSION = 1;
const SITE_ORIGIN = "https://studygyaan.in";

// Values larger than this are stored compactly (hash + length + preview +
// snapshot reference) instead of being duplicated into every event.
const INLINE_STRING_LIMIT = 800;
const INLINE_SERIALIZED_LIMIT = 1200;
const PREVIEW_LIMIT = 200;

const FIELD_GROUPS = Object.freeze({
  seoTitle: "metadata",
  metaDescription: "metadata",
  h1: "metadata",
  authorName: "metadata",
  imageAlt: "metadata",
  articleHtml: "content",
  contentHtml: "content",
  relatedLinks: "internal-links",
  faqs: "faq",
  schemaMarkup: "schema",
  includeJobPostingSchema: "schema",
  structuredData: "schema",
  howToApply: "how-to-apply"
});

// Lifecycle statuses that make a page INELIGIBLE as a future automatic
// optimization target. EXPIRED is the hard safety boundary from the content
// policy; UNKNOWN means we could not prove the page is active, so a future
// automatic optimizer must not touch it either (manual/admin work still can).
const AUTOMATIC_OPTIMIZATION_BLOCKED_LIFECYCLE = Object.freeze(["EXPIRED", "UNKNOWN"]);

// ─── Deterministic hashing ──────────────────────────────────────────

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function valueHash(value) {
  return sha256(stableStringify(value)).slice(0, 40);
}

// ─── Compact value representation ───────────────────────────────────

/**
 * Small values are stored inline (exact). Large values are stored as a compact
 * representation referencing the snapshot that already holds the full value.
 * Deterministic: same value → same representation.
 */
function toEventValue(value, { snapshotId, field } = {}) {
  if (value === null || value === undefined) {
    return { kind: "inline", value: null };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { kind: "inline", value };
  }
  if (typeof value === "string") {
    if (value.length <= INLINE_STRING_LIMIT) {
      return { kind: "inline", value };
    }
    return {
      kind: "compact",
      field: String(field || ""),
      length: value.length,
      hash: valueHash(value),
      preview: value.slice(0, PREVIEW_LIMIT),
      snapshotId: String(snapshotId || "") || null
    };
  }
  const serialized = stableStringify(value);
  if (serialized.length <= INLINE_SERIALIZED_LIMIT) {
    return { kind: "inline", value };
  }
  return {
    kind: "compact",
    field: String(field || ""),
    length: serialized.length,
    hash: valueHash(value),
    preview: serialized.slice(0, PREVIEW_LIMIT),
    snapshotId: String(snapshotId || "") || null
  };
}

/** Strip a stored event value back to its comparable core (for idempotency). */
function eventValueCore(eventValue) {
  if (!eventValue || typeof eventValue !== "object") return eventValue;
  if (eventValue.kind === "inline") return stableStringify(eventValue.value);
  return stableStringify({ kind: "compact", hash: eventValue.hash, length: eventValue.length });
}

// ─── GSC join key ───────────────────────────────────────────────────

/**
 * Deterministic join key matching Phase 1's `normalizedPageUrl` on stored GSC
 * rows (same normalizeGscPageUrl). Path-only URLs are anchored to the site
 * origin. Query strings are preserved — different query strings are NEVER
 * merged into another URL.
 */
function buildGscJoinKey(pageUrl) {
  const raw = String(pageUrl || "").trim();
  if (!raw) return "";
  const absolute = raw.startsWith("/") ? `${SITE_ORIGIN}${raw}` : raw;
  return normalizeGscPageUrl(absolute).normalizedPageUrl;
}

// ─── Lifecycle at change time ───────────────────────────────────────

/**
 * Lifecycle classification for the ledger. Reuses the authoritative
 * classifyJobLifecycle (job_lifecycle.js):
 *   - JOB: classified as-is
 *   - FAST_TRACK: same lastDate/startDate thresholds (no authoritative
 *     FAST_TRACK classifier exists; fast-track docs share the lastDate
 *     semantics when present, else UNKNOWN)
 *   - other content types: NOT_APPLICABLE (no date-based lifecycle exists —
 *     the event still records type + lifecycle so nothing is hard-coded out)
 */
function classifyLifecycleForLedger(page, contentType, now = new Date()) {
  const doc = page && typeof page === "object" ? page : {};
  const type = String(contentType || doc.type || "").toUpperCase();
  if (type === "JOB" || type === "JOBS") {
    const life = classifyJobLifecycle(doc, now);
    return {
      status: life.status,
      source: "job_lifecycle",
      daysUntilLastDate: life.daysUntilLastDate,
      reason: life.reason || null
    };
  }
  if (type === "FAST_TRACK") {
    const facts = doc.facts && typeof doc.facts === "object" ? doc.facts : {};
    const lastDate = doc.lastDate || facts.lastDate || "";
    const startDate = doc.startDate || facts.startDate || "";
    if (!lastDate) {
      return { status: "UNKNOWN", source: "fast-track-last-date", daysUntilLastDate: null, reason: "no-last-date" };
    }
    const life = classifyJobLifecycle({ lastDate, startDate }, now);
    return {
      status: life.status,
      source: "fast-track-last-date",
      daysUntilLastDate: life.daysUntilLastDate,
      reason: life.reason || null
    };
  }
  return { status: "NOT_APPLICABLE", source: "none", daysUntilLastDate: null, reason: `content-type:${type || "unknown"}` };
}

/** EXPIRED (and UNKNOWN) pages can never be automatic optimization targets. */
function isEligibleForAutomaticOptimization(lifecycleStatus) {
  return !AUTOMATIC_OPTIMIZATION_BLOCKED_LIFECYCLE.includes(String(lifecycleStatus || "").toUpperCase());
}

function fieldGroupOf(field) {
  return FIELD_GROUPS[String(field || "")] || "other";
}

// ─── Event building ─────────────────────────────────────────────────

function isoNow(now) {
  if (!now) return new Date().toISOString();
  return now instanceof Date ? now.toISOString() : String(now);
}

/**
 * Deterministic idempotency key for "this change to this page's field".
 * Retried operations recompute the same key; the persist step upserts by it.
 */
function buildIdempotencyKey({ kind, contentId, field, proposalId, oldValue, newValue }) {
  return sha256([
    kind || "applied",
    String(contentId || ""),
    String(field || ""),
    String(proposalId || ""),
    valueHash(oldValue),
    valueHash(newValue)
  ].join("|")).slice(0, 40);
}

/**
 * Build one ledger event. `proposal` may be a legacy/partial proposal — every
 * derived field degrades gracefully (null), never throws.
 */
function buildChangeEvent({
  kind = "applied",
  proposal,
  collectionName,
  contentId,
  contentType,
  pageUrl,
  page,
  field,
  oldValue,
  newValue,
  snapshotId,
  actor,
  source,
  at,
  rolledBackFrom
}) {
  const record = proposal && typeof proposal === "object" ? proposal : {};
  const effectiveContentId = String(contentId || record.contentId || "").slice(0, 120);
  const effectiveField = String(field || record.field || "");
  const effectiveType = String(contentType || record.contentType || "").toUpperCase();
  const effectiveUrl = String(pageUrl || record.url || "");
  const atIso = isoNow(at);
  const lifecycle = classifyLifecycleForLedger(page, effectiveType, at instanceof Date ? at : new Date(atIso));
  const idempotencyKey = buildIdempotencyKey({
    kind,
    contentId: effectiveContentId,
    field: effectiveField,
    proposalId: record.id,
    oldValue,
    newValue
  });
  const sourceText = String(source || "");
  const autoSources = ["auto-optimizer", "publish-hook"];
  const isAutoSource = autoSources.some((name) => sourceText === name || sourceText.startsWith(`${name}:`));

  const event = {
    schemaVersion: SCHEMA_VERSION,
    eventId: idempotencyKey,
    idempotencyKey,
    kind,
    eventType: kind === "rolled_back" ? "seo-change-rolled-back" : "seo-change-applied",
    // Page identity
    contentId: effectiveContentId,
    collection: String(collectionName || "").slice(0, 80),
    contentType: effectiveType,
    pageUrl: effectiveUrl.slice(0, 300),
    gscJoinKey: buildGscJoinKey(effectiveUrl),
    // Lifecycle at change time
    lifecycle,
    eligibleForAutomaticOptimization: isEligibleForAutomaticOptimization(lifecycle.status),
    // What changed (compact representation for large values)
    field: effectiveField,
    fieldGroup: fieldGroupOf(effectiveField),
    oldValue: toEventValue(oldValue, { snapshotId, field: effectiveField }),
    newValue: toEventValue(newValue, { snapshotId, field: effectiveField }),
    // Proposal references
    proposalId: record.id ? String(record.id).slice(0, 120) : null,
    proposalCreatedAt: record.createdAt || null,
    proposalLevel: record.level || null,
    proposalConfidence: record.confidence || null,
    proposalRequiresReview: typeof record.requiresReview === "boolean" ? record.requiresReview : null,
    proposalReason: record.reason ? String(record.reason).slice(0, 800) : null,
    proposalSource: record.source || null,
    // Apply details
    snapshotId: snapshotId ? String(snapshotId).slice(0, 120) : null,
    actor: String(actor || "unknown").slice(0, 120),
    source: String(source || "unknown").slice(0, 80),
    manualApproved: Boolean(record.status === "approved" || record.status === "applied"),
    autoApplied: isAutoSource,
    // Rollback linkage
    rollbackOfEventId: rolledBackFrom ? String(rolledBackFrom.eventId || rolledBackFrom.idempotencyKey).slice(0, 60) : null,
    rollbackOfIdempotencyKey: rolledBackFrom ? String(rolledBackFrom.idempotencyKey || rolledBackFrom.eventId).slice(0, 60) : null,
    status: kind === "rolled_back" ? "rolled_back" : "applied",
    at: atIso,
    createdAt: atIso
  };
  return event;
}

function eventCoreIdentity(event) {
  return stableStringify({
    kind: event.kind,
    contentId: event.contentId,
    field: event.field,
    proposalId: event.proposalId,
    oldValue: eventValueCore(event.oldValue),
    newValue: eventValueCore(event.newValue),
    rollbackOfEventId: event.rollbackOfEventId || null
  });
}

async function readEvent(db, eventId) {
  if (!db || !eventId) return null;
  try {
    const snap = await db.collection(EVENTS_COLLECTION).doc(eventId).get();
    if (!snap || !snap.exists) return null;
    return typeof snap.data === "function" ? snap.data() : null;
  } catch {
    return null;
  }
}

/**
 * Append one event, idempotently.
 *   - event id absent        → write it (the normal case)
 *   - event exists, identical core (same change) → retried operation, SKIP
 *   - event exists, different core (genuinely new application of the same
 *     field) → append with a -2/-3… suffix; history is never rewritten
 * Returns { written, eventId, reason }.
 */
async function recordChangeEvent(db, event) {
  if (!db || !event || !event.eventId) return { written: false, eventId: null, reason: "no-db" };
  const core = eventCoreIdentity(event);
  let candidateId = event.eventId;
  for (let attempt = 2; attempt <= 25; attempt += 1) {
    const existing = await readEvent(db, candidateId);
    if (!existing) {
      const doc = { ...event, eventId: candidateId };
      await db.collection(EVENTS_COLLECTION).doc(candidateId).set(doc, { merge: false });
      return { written: true, eventId: candidateId, reason: "appended" };
    }
    const existingCore = eventCoreIdentity(existing);
    if (existingCore === core) {
      // Same change recorded already — a retried APPLY must not duplicate it.
      return { written: false, eventId: candidateId, reason: "idempotent-skip" };
    }
    candidateId = `${event.eventId}-${attempt}`;
  }
  return { written: false, eventId: null, reason: "too-many-events-for-key" };
}

/**
 * Measurement hook for apply/rollback paths. NEVER throws — a ledger failure
 * must not break an apply or a rollback (the snapshot/rollback mechanism
 * remains the safety net of record).
 */
async function tryRecordChangeEvent(db, event, contextLabel = "change-event") {
  try {
    return await recordChangeEvent(db, event);
  } catch (error) {
    console.warn(`[change-events] ${contextLabel} ledger write failed (apply/rollback continues):`, error && error.message);
    return { written: false, eventId: null, reason: "error" };
  }
}

/** Find the most recent applied event for an idempotency key (for rollback linkage). */
async function findAppliedEventByKey(db, idempotencyKey) {
  if (!db || !idempotencyKey) return null;
  const base = await readEvent(db, idempotencyKey);
  if (base && base.kind === "applied") return base;
  for (let attempt = 2; attempt <= 25; attempt += 1) {
    const event = await readEvent(db, `${idempotencyKey}-${attempt}`);
    if (!event) break;
    if (event.kind === "applied") return event;
  }
  return null;
}

module.exports = {
  EVENTS_COLLECTION,
  SCHEMA_VERSION,
  SITE_ORIGIN,
  FIELD_GROUPS,
  AUTOMATIC_OPTIMIZATION_BLOCKED_LIFECYCLE,
  buildGscJoinKey,
  classifyLifecycleForLedger,
  isEligibleForAutomaticOptimization,
  fieldGroupOf,
  toEventValue,
  valueHash,
  stableStringify,
  buildIdempotencyKey,
  buildChangeEvent,
  recordChangeEvent,
  tryRecordChangeEvent,
  findAppliedEventByKey
};
