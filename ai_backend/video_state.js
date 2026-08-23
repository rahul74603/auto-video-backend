/**
 * video_state.js — 🎬 Shared, Firebase-billing-independent video state machine
 * ============================================================================
 * Used by:
 *   - video_dispatcher.js   (GitHub Actions scheduled poller — the NEW primary path)
 *   - autoVideo.js          (JOB + FAST_TRACK renderer, also used by repository_dispatch)
 *   - mock_test_video.js    (MOCK TEST renderer)
 *
 * Why this file exists
 * --------------------
 * Video triggering must keep working while the Firebase project is on the
 * Spark (free) plan, i.e. WITHOUT Cloud Functions. GitHub Actions polls
 * Firestore directly with the SERVICE_ACCOUNT_JSON secret (Firestore itself is
 * available on Spark), claims a document atomically and only then renders.
 *
 * The old Cloud Function path (repository_dispatch → video_maker.yml) keeps
 * working: both paths call `claim()` before rendering, so whoever claims first
 * wins and no duplicate video is ever produced.
 *
 * Firestore fields written (all additive — nothing existing is removed):
 *   videoStatus       queued | processing | completed | upload_failed | failed
 *   videoTriggeredAt  when the item first entered the queue
 *   videoStartedAt    when a worker claimed it
 *   videoCompletedAt  when YouTube upload + bookkeeping finished
 *   videoFailedAt     when the last attempt failed
 *   videoError        short human readable error
 *   videoAttempts     number of claims so far (permanent-failure guard)
 *   videoLockId       id of the worker currently holding the claim
 *   videoWorker       'github-dispatcher' | 'repository-dispatch' | ...
 *   videoYouTubeId / videoYouTubeUrl
 *   (legacy, still written for backward compatibility)
 *   videoTriggered, youtubeVideoId, youtubeVideoUrl, videoCreatedAt, mockVideoMade
 */

'use strict';

const STATUS = Object.freeze({
    QUEUED: 'queued',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    UPLOAD_FAILED: 'upload_failed',
    FAILED: 'failed'
});

const KIND = Object.freeze({
    JOB: 'JOB',
    FAST_TRACK: 'FAST_TRACK',
    MOCK_TEST: 'MOCK_TEST'
});

const COLLECTION_BY_KIND = Object.freeze({
    [KIND.JOB]: 'jobs',
    [KIND.FAST_TRACK]: 'fast_track',
    [KIND.MOCK_TEST]: 'mock_tests'
});

// A claim older than this is considered abandoned (runner crashed / cancelled).
const DEFAULT_STALE_LOCK_MS = 45 * 60 * 1000;   // 45 minutes
// After this many failed attempts a document is never retried automatically.
const DEFAULT_MAX_ATTEMPTS = 3;
// If the legacy Cloud Function just dispatched a video, give that run some time
// before the poller also picks the document up (avoids duplicate renders).
const DEFAULT_LEGACY_GRACE_MS = 30 * 60 * 1000; // 30 minutes

// Freshness guard: auto-render ONLY content published within the last day.
// Older content — including legacy backlog and stale queued/failed docs — is
// never auto-rendered. Publishing fresh content is what triggers a video.
// Force a specific old doc manually with --doc=<id> --max-age-days=0.
const DEFAULT_MAX_AGE_DAYS = 1;

const JOB_BLOCKED_STATUSES = ['draft', 'pending', 'archived', 'rejected', 'unpublished', 'deleted', 'expired'];
const NON_JOB_TYPES = ['MATERIAL', 'AFFILIATE', 'FAST_TRACK', 'BLOG', 'NOTE', 'PDF', 'STORY'];
// Fields that only ever appear on uploaded study material rows inside `jobs`.
const MATERIAL_MARKERS = ['storagePath', 'downloadUrl', 'fileSize', 'fileUrl'];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function toMillis(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toMillis === 'function') {
        try { return value.toMillis(); } catch { return 0; }
    }
    if (typeof value.toDate === 'function') {
        try { return value.toDate().getTime(); } catch { return 0; }
    }
    if (typeof value._seconds === 'number') return value._seconds * 1000;
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}

function str(value) {
    return typeof value === 'string' ? value.trim() : (value === undefined || value === null ? '' : String(value).trim());
}

function lower(value) {
    return str(value).toLowerCase();
}

function shortError(err, max = 300) {
    const message = err && err.message ? err.message : String(err || 'Unknown error');
    return message.replace(/\s+/g, ' ').trim().substring(0, max);
}

function attemptsOf(data) {
    const raw = data && data.videoAttempts;
    return Number.isFinite(raw) ? raw : 0;
}

/** Item explicitly opted out of video generation by an admin. */
function isExcluded(data) {
    if (!data) return false;
    return data.videoExcluded === true || data.skipVideo === true || data.noVideo === true;
}

/** A video already exists (new field, legacy field, or mock-specific flag). */
function hasCompletedVideo(data) {
    if (!data) return false;
    if (data.videoStatus === STATUS.COMPLETED) return true;
    if (str(data.videoYouTubeId)) return true;
    if (str(data.youtubeVideoId)) return true;
    if (data.mockVideoMade === true) return true;
    return false;
}

/** Someone is rendering this document right now. */
function isLockActive(data, staleLockMs = DEFAULT_STALE_LOCK_MS) {
    if (!data || data.videoStatus !== STATUS.PROCESSING) return false;
    const startedAt = toMillis(data.videoStartedAt);
    if (!startedAt) return true;          // no timestamp → assume active (safe)
    return (Date.now() - startedAt) < staleLockMs;
}

/** Failed too many times — do not retry forever (PART 3 / PART 17). */
function isPermanentlyFailed(data, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
    if (!data) return false;
    const status = data.videoStatus;
    if (status !== STATUS.FAILED && status !== STATUS.UPLOAD_FAILED) return false;
    return attemptsOf(data) >= maxAttempts;
}

/**
 * The legacy Cloud Function (onJobPublishedNotify / onFastTrackApprovedSendTelegram)
 * dispatched a video very recently — let that GitHub Actions run finish first.
 */
function legacyDispatchInFlight(data, graceMs = DEFAULT_LEGACY_GRACE_MS) {
    if (!data) return false;
    if (data.videoStatus) return false;                 // new state machine wins
    if (data.videoTriggered !== true) return false;
    const triggeredAt = toMillis(data.videoTriggeredAt);
    if (!triggeredAt) return false;                     // unknown age → treat as stale, retry
    return (Date.now() - triggeredAt) < graceMs;
}

/* ------------------------------------------------------------------ */
/* Candidate evaluation (pure functions — unit tested)                 */
/* ------------------------------------------------------------------ */

/** Best available "content created/published" timestamp, in ms (0 = unknown). */
function publishedAtMs(data) {
    if (!data) return 0;
    return toMillis(data.publishedAt)
        || toMillis(data.createdAt)
        || toMillis(data.updatedAt)
        || 0;
}

function baseEligibility(data, opts = {}) {
    const maxAttempts = opts.maxAttempts || DEFAULT_MAX_ATTEMPTS;
    const staleLockMs = opts.staleLockMs || DEFAULT_STALE_LOCK_MS;
    const legacyGraceMs = opts.legacyGraceMs === undefined ? DEFAULT_LEGACY_GRACE_MS : opts.legacyGraceMs;
    const maxAgeDays = opts.maxAgeDays === undefined ? DEFAULT_MAX_AGE_DAYS : opts.maxAgeDays;

    if (!data) return { eligible: false, reason: 'no data' };
    if (isExcluded(data)) return { eligible: false, reason: 'excluded by admin flag' };
    if (hasCompletedVideo(data)) return { eligible: false, reason: 'video already completed' };
    if (isLockActive(data, staleLockMs)) return { eligible: false, reason: 'currently processing (lock active)' };
    if (isPermanentlyFailed(data, maxAttempts)) {
        return { eligible: false, reason: `failed ${attemptsOf(data)}x — needs manual reset` };
    }
    if (legacyDispatchInFlight(data, legacyGraceMs)) {
        return { eligible: false, reason: 'legacy Cloud Function dispatch still in grace period' };
    }
    if (maxAgeDays > 0) {
        const created = publishedAtMs(data);
        if (!created) {
            // No parseable timestamp at all: treat as backlog, not as fresh.
            // Legacy/imported docs without dates are exactly the "published long
            // before the dispatcher existed" content this guard exists to skip.
            return { eligible: false, reason: `unknown publish age (no parseable timestamp) — force with --max-age-days=0` };
        }
        if ((Date.now() - created) > maxAgeDays * 24 * 60 * 60 * 1000) {
            return { eligible: false, reason: `older than ${maxAgeDays}d backlog window` };
        }
    }
    return { eligible: true, reason: 'pending' };
}

// 🗓️ SHORTS CUTOFF — is date se PEHLE publish hue jobs/fast_track pe shorts
// kabhi nahi banenge (admin rule: "aaj se pehle wala sab bhool jao").
// OPT-IN: dispatcher opts.shortsCutoffMs pass karta hai (env VIDEO_SHORTS_CUTOFF).
// Forced/manual runs (maxAgeDays: 0) cutoff bhi bypass karte hain.
function beforeShortsCutoff(data, opts = {}) {
    if (opts.maxAgeDays === 0) return false;           // forced/manual run
    const cutoff = Number(opts.shortsCutoffMs) || 0;   // opt-in only
    if (!cutoff) return false;
    const published = publishedAtMs(data);
    if (!published) return false; // baseEligibility ka 'unknown publish age' message aayega
    return published < cutoff;
}

function evaluateJob(data, opts = {}) {
    const type = str(data && data.type).toUpperCase();
    // Legacy parity: onJobPublishedNotify skipped only when type was set and != JOB.
    // The jobs collection also stores MATERIAL / AFFILIATE docs — those always carry a type.
    if (type && type !== KIND.JOB) return { eligible: false, reason: `type=${type} (not a JOB)` };
    if (NON_JOB_TYPES.includes(type)) return { eligible: false, reason: `type=${type}` };

    const status = lower(data && data.status);
    if (status && JOB_BLOCKED_STATUSES.includes(status)) return { eligible: false, reason: `status=${status}` };
    if (data && data.isLive === false) return { eligible: false, reason: 'isLive=false' };
    if (!str(data && data.title)) return { eligible: false, reason: 'missing title' };
    if (!type && MATERIAL_MARKERS.some((field) => str(data && data[field]))) {
        return { eligible: false, reason: 'looks like an uploaded study material, not a job post' };
    }

    const base = baseEligibility(data, opts);
    if (!base.eligible) return base;
    if (beforeShortsCutoff(data, opts)) {
        return { eligible: false, reason: 'shorts cutoff se pehle publish hua — sirf naye publish pe short banti hai' };
    }
    return base;
}

function evaluateFastTrack(data, opts = {}) {
    const status = lower(data && data.status);
    if (status !== 'published') return { eligible: false, reason: `status=${status || 'missing'} (needs published)` };
    if (!str(data && data.title)) return { eligible: false, reason: 'missing title' };
    const base = baseEligibility(data, opts);
    if (!base.eligible) return base;
    if (beforeShortsCutoff(data, opts)) {
        return { eligible: false, reason: 'shorts cutoff se pehle publish hua — sirf naye publish pe short banti hai' };
    }
    return base;
}

function evaluateMockTest(data, opts = {}) {
    if (data && data.mockVideoMade === true) return { eligible: false, reason: 'mockVideoMade=true' };
    const status = lower(data && data.status);
    if (status && ['draft', 'archived', 'deleted'].includes(status)) return { eligible: false, reason: `status=${status}` };
    const questions = data && data.questions;
    if (!Array.isArray(questions) || questions.length === 0) return { eligible: false, reason: 'no questions' };
    if (!str(data && (data.title || data.subject))) return { eligible: false, reason: 'missing title/subject' };
    return baseEligibility(data, opts);
}

function evaluateCandidate(kind, data, opts = {}) {
    switch (kind) {
        case KIND.JOB: return evaluateJob(data, opts);
        case KIND.FAST_TRACK: return evaluateFastTrack(data, opts);
        case KIND.MOCK_TEST: return evaluateMockTest(data, opts);
        default: return { eligible: false, reason: `unknown kind ${kind}` };
    }
}

/* ------------------------------------------------------------------ */
/* Firestore helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Resolve the real document reference.
 * jobs/ documents often use an auto-id while `slug` is a separate field, so a
 * blind `.doc(slug)` update silently fails. Try docId → id → slug lookup.
 */
async function resolveDocRef(db, collection, { docId, id, slug } = {}) {
    const candidates = [docId, id].map(str).filter(Boolean);
    for (const candidate of candidates) {
        const ref = db.collection(collection).doc(candidate);
        const snap = await ref.get();
        if (snap.exists) return ref;
    }
    const slugValue = str(slug);
    if (slugValue) {
        const ref = db.collection(collection).doc(slugValue);
        const snap = await ref.get();
        if (snap.exists) return ref;
        const query = await db.collection(collection).where('slug', '==', slugValue).limit(1).get();
        if (!query.empty) return query.docs[0].ref;
    }
    return null;
}

function serverTimestamp(admin) {
    return admin.firestore.FieldValue.serverTimestamp();
}

/**
 * Atomically claim a document for rendering.
 * Returns { claimed:boolean, reason:string, data:object|null, attempts:number }
 */
async function claim(db, admin, kind, docRefOrId, options = {}) {
    const collection = options.collection || COLLECTION_BY_KIND[kind];
    if (!collection) throw new Error(`claim(): unknown kind ${kind}`);

    const ref = typeof docRefOrId === 'string'
        ? db.collection(collection).doc(docRefOrId)
        : docRefOrId;

    const runId = options.runId || `run-${Date.now()}`;
    const worker = options.worker || 'github-actions';
    const force = options.force === true;

    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { claimed: false, reason: 'document not found', data: null, attempts: 0 };

        const data = snap.data() || {};
        if (!force) {
            const verdict = evaluateCandidate(kind, data, options);
            if (!verdict.eligible) {
                return { claimed: false, reason: verdict.reason, data, attempts: attemptsOf(data) };
            }
        }

        const attempts = attemptsOf(data) + 1;
        tx.update(ref, {
            videoStatus: STATUS.PROCESSING,
            videoStartedAt: serverTimestamp(admin),
            videoTriggeredAt: data.videoTriggeredAt || serverTimestamp(admin),
            videoAttempts: attempts,
            videoLockId: runId,
            videoWorker: worker,
            videoError: admin.firestore.FieldValue.delete()
        });

        return { claimed: true, reason: 'claimed', data, attempts, ref };
    });
}

async function markCompleted(db, admin, collection, ref, payload = {}) {
    const docRef = typeof ref === 'string' ? db.collection(collection).doc(ref) : ref;
    const update = {
        videoStatus: STATUS.COMPLETED,
        videoCompletedAt: serverTimestamp(admin),
        videoTriggered: true,
        videoLockId: admin.firestore.FieldValue.delete(),
        videoError: admin.firestore.FieldValue.delete()
    };
    if (payload.videoId) {
        update.videoYouTubeId = payload.videoId;
        update.youtubeVideoId = payload.videoId;          // legacy field kept
    }
    if (payload.videoUrl) {
        update.videoYouTubeUrl = payload.videoUrl;
        update.youtubeVideoUrl = payload.videoUrl;        // legacy field kept
        update.videoCreatedAt = serverTimestamp(admin);   // legacy field kept
    }
    Object.assign(update, payload.extra || {});
    await docRef.update(update);
    return update;
}

async function markFailed(db, admin, collection, ref, error, options = {}) {
    const docRef = typeof ref === 'string' ? db.collection(collection).doc(ref) : ref;
    const status = options.uploadFailed ? STATUS.UPLOAD_FAILED : STATUS.FAILED;
    const update = {
        videoStatus: status,
        videoFailedAt: serverTimestamp(admin),
        videoError: shortError(error),
        videoLockId: admin.firestore.FieldValue.delete()
    };
    Object.assign(update, options.extra || {});
    await docRef.update(update);
    return update;
}

/** Release a claim without marking failure (e.g. dry-run / guard paused). */
async function releaseClaim(db, admin, collection, ref, reason = 'released') {
    const docRef = typeof ref === 'string' ? db.collection(collection).doc(ref) : ref;
    await docRef.update({
        videoStatus: STATUS.QUEUED,
        videoLockId: admin.firestore.FieldValue.delete(),
        videoError: shortError(reason)
    });
}

/**
 * Best-effort state write used by the renderers themselves (never throws).
 */
async function safeUpdate(db, admin, collection, locator, updater) {
    try {
        const ref = typeof locator === 'string'
            ? db.collection(collection).doc(locator)
            : (locator && locator.firestore ? locator : await resolveDocRef(db, collection, locator || {}));
        if (!ref) {
            console.log(`⚠️ video_state: ${collection} document not found — state update skipped`);
            return false;
        }
        await updater(ref);
        return true;
    } catch (err) {
        console.log(`⚠️ video_state: ${collection} state update skipped — ${shortError(err, 140)}`);
        return false;
    }
}

module.exports = {
    STATUS,
    KIND,
    COLLECTION_BY_KIND,
    DEFAULT_STALE_LOCK_MS,
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_LEGACY_GRACE_MS,
    DEFAULT_MAX_AGE_DAYS,
    toMillis,
    publishedAtMs,
    shortError,
    attemptsOf,
    isExcluded,
    hasCompletedVideo,
    isLockActive,
    isPermanentlyFailed,
    legacyDispatchInFlight,
    evaluateCandidate,
    evaluateJob,
    evaluateFastTrack,
    evaluateMockTest,
    resolveDocRef,
    claim,
    markCompleted,
    markFailed,
    releaseClaim,
    safeUpdate
};

/* ------------------------------------------------------------------ */
/* Daily YouTube quota guard                                           */
/* ------------------------------------------------------------------ */

/**
 * YouTube Data API v3 gives 10,000 quota units per day by default, and a single
 * upload costs roughly 1,750 (videos.insert alone is 1,600). That caps the
 * channel at about five uploads per day.
 *
 * Without a guard the scheduler would keep rendering after the quota is gone:
 * every render burns several minutes of CPU and then fails at the upload step,
 * and each failure counts toward the document's retry budget — so a genuinely
 * fine job could get marked permanently failed just because the day was full.
 *
 * The counter lives in Firestore so it is shared across runs.
 */
const QUOTA_DOC = 'system_settings/video_quota';
const DEFAULT_DAILY_VIDEO_LIMIT = 5;

function todayKey(now = new Date()) {
    // Bucket by IST day so the reset lines up with the site's audience.
    const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    return ist.toISOString().slice(0, 10);
}

/** How many videos have already been uploaded today. */
async function getDailyCount(db, now = new Date()) {
    try {
        const snap = await db.doc(QUOTA_DOC).get();
        if (!snap.exists) return 0;
        const data = snap.data() || {};
        return data.date === todayKey(now) ? (Number(data.count) || 0) : 0;
    } catch (err) {
        console.log(`⚠️ quota read failed (${shortError(err, 120)}) — treating as 0`);
        return 0;
    }
}

/** Record one successful upload against today's budget. */
async function recordUpload(db, admin, now = new Date()) {
    try {
        const ref = db.doc(QUOTA_DOC);
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.exists ? (snap.data() || {}) : {};
            const key = todayKey(now);
            const count = data.date === key ? (Number(data.count) || 0) : 0;
            tx.set(ref, {
                date: key,
                count: count + 1,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
    } catch (err) {
        // Never fail a completed video just because the counter did not save.
        console.log(`⚠️ quota update skipped — ${shortError(err, 120)}`);
    }
}

function dailyLimit() {
    const raw = Number(process.env.VIDEO_DAILY_LIMIT);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_VIDEO_LIMIT;
}

module.exports.QUOTA_DOC = QUOTA_DOC;
module.exports.DEFAULT_DAILY_VIDEO_LIMIT = DEFAULT_DAILY_VIDEO_LIMIT;
module.exports.todayKey = todayKey;
module.exports.getDailyCount = getDailyCount;
module.exports.recordUpload = recordUpload;
module.exports.dailyLimit = dailyLimit;
