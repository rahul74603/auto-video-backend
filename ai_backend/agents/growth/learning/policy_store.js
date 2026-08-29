'use strict';

/**
 * learning/policy_store.js — Persisted Learned Policy (Growth Self-Learning, Phase 3)
 *
 * The learner (analytics/learner.js) discovers patterns from attributed
 * performance data. This module converts those patterns into a PERSISTED
 * POLICY document (Firestore: growth_policies/latest) that video generation
 * consumes BEFORE creating the next video.
 *
 * Structure:
 *   growth_policies/latest = {
 *     version, generatedAt, generator,
 *     platforms: {
 *       youtube: { dimensions: { hook: {...}, duration: {...}, ... } },
 *       facebook: { dimensions: { ... } }
 *     },
 *     stats: { patternCount, platforms, attributionCoverage }
 *   }
 *
 * Platform separation (Phase 13): patterns are grouped per platform and the
 * policy lookup is strictly platform-specific — a YouTube winner is NEVER
 * applied to Facebook and vice versa.
 *
 * Explore/exploit (Phase 14):
 *   - exploit the learned winner when confidence + sample requirements pass
 *   - otherwise keep controlled exploration (a non-winner is chosen on
 *     purpose so the system keeps gathering data)
 *   - winners decay: stale policies exploit less; expired policies are
 *     ignored entirely until fresh data re-qualifies them
 */

const crypto = require('crypto');

const POLICY_COLLECTION = 'growth_policies';
const POLICY_DOC = 'latest';
const POLICY_HISTORY_COLLECTION = 'growth_policies_history';

// Minimum samples before a winner may influence generation.
const MIN_SAMPLES = 5;
// Minimum confidence before a winner may influence generation.
const CONFIDENCE_THRESHOLD = 0.6;
// Base probability of exploiting the learned winner (80% exploit / 20% explore).
const EXPLOIT_BASE = 0.8;
// A confident winner exploits more often.
const EXPLOIT_HIGH_CONFIDENCE = 0.75;
const EXPLOIT_HIGH_CONFIDENCE_PROBABILITY = 0.85;
// Winner older than this is "stale" — exploit probability is halved.
const STALE_DAYS = 14;
// Winner older than this is "expired" — ignored until fresh data arrives.
const EXPIRE_DAYS = 30;

// patternType (learner) → policy dimension (generation)
const PATTERN_TO_DIMENSION = {
    DURATION: 'duration',
    HOOK: 'hook',
    PRESENTER: 'presenter',
    VISUAL_STYLE: 'visualStyle',
    MUSIC: 'music',
    CTA: 'cta',
    CONTENT_ANGLE: 'contentAngle',
    POST_TIME: 'postTime',
    CATEGORY: 'category'
};

const APPLIED_DIMENSIONS = ['duration', 'hook', 'presenter', 'visualStyle', 'music', 'cta', 'contentAngle'];

// ─── Policy construction ─────────────────────────────────────────────

function buildPolicyVersion(patterns, now) {
    const hash = crypto.createHash('sha256')
        .update(JSON.stringify(patterns || []))
        .digest('hex')
        .slice(0, 8);
    return `policy-${new Date(now).toISOString().replace(/[:.]/g, '-')}-${hash}`;
}

/**
 * Convert learner patterns into a persisted policy document.
 * Patterns must already be attribution-backed (the learner never emits a
 * pattern without real source data).
 */
function buildPolicy(patterns, opts = {}) {
    const now = opts.now || Date.now();
    const list = Array.isArray(patterns) ? patterns : [];
    const platforms = {};

    for (const pattern of list) {
        if (!pattern || !pattern.patternType) continue;
        const dimension = PATTERN_TO_DIMENSION[pattern.patternType];
        if (!dimension) continue;

        const platform = String(pattern.platform || 'unknown');
        if (!platforms[platform]) platforms[platform] = { platform, dimensions: {} };

        const existing = platforms[platform].dimensions[dimension];
        // First pattern for a dimension wins; learner emits one per
        // (patternType, platform) so collisions should not occur — but if
        // they do, keep the higher-confidence one.
        if (existing && (existing.confidence || 0) >= (pattern.confidence || 0)) continue;

        platforms[platform].dimensions[dimension] = {
            dimension,
            platform,
            winningPattern: pattern.winningPattern,
            averagePerformanceScore: pattern.averagePerformanceScore != null
                ? pattern.averagePerformanceScore
                : pattern.averageScore,
            averageScore: pattern.averageScore != null ? pattern.averageScore : pattern.averagePerformanceScore,
            sampleSize: pattern.sampleSize || 0,
            recentSampleSize: pattern.recentSampleSize || 0,
            exploredSampleSize: pattern.exploredSampleSize || 0,
            confidence: pattern.confidence || 0,
            distinctBuckets: pattern.distinctBuckets || 0,
            margin: pattern.margin || 0,
            runnerUp: pattern.runnerUp || null,
            // DURATION only: real average seconds of the winning bucket.
            targetSeconds: pattern.averageValueSeconds != null
                ? Math.round(pattern.averageValueSeconds)
                : null,
            category: pattern.category || null,
            lastUpdated: pattern.discoveredAt || now,
            lastUpdatedIso: new Date(pattern.discoveredAt || now).toISOString(),
            minSamples: MIN_SAMPLES,
            confidenceThreshold: CONFIDENCE_THRESHOLD
        };
    }

    const patternCount = Object.values(platforms)
        .reduce((sum, p) => sum + Object.keys(p.dimensions).length, 0);

    return {
        version: buildPolicyVersion(list, now),
        generatedAt: now,
        generatedAtIso: new Date(now).toISOString(),
        generator: 'growth-learner',
        exploitStrategy: {
            base: EXPLOIT_BASE,
            highConfidence: EXPLOIT_HIGH_CONFIDENCE_PROBABILITY,
            staleDays: STALE_DAYS,
            expireDays: EXPIRE_DAYS,
            minSamples: MIN_SAMPLES,
            confidenceThreshold: CONFIDENCE_THRESHOLD
        },
        platforms,
        stats: {
            patternCount,
            platforms: Object.keys(platforms),
            sourcePatternCount: list.length
        }
    };
}

// ─── Persistence ─────────────────────────────────────────────────────

async function savePolicy(db, policy) {
    if (!db || !policy) return null;
    // Latest — consumed by video generation.
    await db.collection(POLICY_COLLECTION).doc(POLICY_DOC).set(policy, { merge: false });
    // History — audit trail proving the policy actually updates over time.
    try {
        await db.collection(POLICY_HISTORY_COLLECTION).add({
            version: policy.version,
            generatedAt: policy.generatedAt,
            stats: policy.stats,
            platforms: policy.platforms
        });
    } catch { /* history is best-effort */ }
    return policy.version;
}

async function loadPolicy(db) {
    if (!db) return null;
    try {
        const snap = await db.collection(POLICY_COLLECTION).doc(POLICY_DOC).get();
        if (!snap || !snap.exists) return null;
        const data = typeof snap.data === 'function' ? snap.data() : snap.data;
        return data && data.platforms ? data : null;
    } catch {
        return null;
    }
}

/**
 * Platform-specific dimension lookup. Deliberately NO cross-platform
 * fallback — YouTube winners must not leak into Facebook decisions.
 */
function getDimension(policy, platform, dimension) {
    if (!policy || !policy.platforms || !dimension) return null;
    const platformKey = String(platform || 'unknown');
    const platformPolicy = policy.platforms[platformKey];
    if (!platformPolicy || !platformPolicy.dimensions) return null;
    return platformPolicy.dimensions[dimension] || null;
}

// ─── Decision engine (explore / exploit) ─────────────────────────────

function noDecision(dimension, reason, policy) {
    return {
        dimension,
        mode: 'none',
        value: null,
        winner: null,
        confidence: 0,
        sampleSize: 0,
        stale: false,
        reason,
        policyVersion: policy ? policy.version : null,
        applied: false
    };
}

/**
 * Decide a single generation dimension using the learned policy.
 *
 * Returns { mode: 'exploit' | 'explore' | 'none', value, ... }.
 *  - exploit: use the learned winner (confidence/sample/staleness gates passed)
 *  - explore: deliberately try a non-winner (controlled exploration)
 *  - none:    no usable learning — generation falls back to its safe default
 *
 * opts.candidates restricts the allowed values (e.g. approved anchors). If
 * the learned winner is not among them the decision degrades to 'none'
 * (never force an invalid value).
 */
function decide(dimension, opts = {}) {
    const policy = opts.policy || null;
    const platform = opts.platform || 'youtube';
    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const now = opts.now || Date.now();
    const candidates = Array.isArray(opts.candidates) ? opts.candidates.map(String) : null;

    const dim = getDimension(policy, platform, dimension);
    if (!dim) return noDecision(dimension, 'no learned policy for this dimension/platform', policy);

    if (!dim.winningPattern) {
        return noDecision(dimension, 'policy has no winning pattern', policy);
    }
    if ((dim.sampleSize || 0) < (dim.minSamples || MIN_SAMPLES)) {
        return noDecision(dimension, `insufficient samples (${dim.sampleSize || 0} < ${dim.minSamples || MIN_SAMPLES})`, policy);
    }
    if ((dim.confidence || 0) < (dim.confidenceThreshold || CONFIDENCE_THRESHOLD)) {
        return noDecision(dimension, `confidence below threshold (${dim.confidence} < ${dim.confidenceThreshold || CONFIDENCE_THRESHOLD})`, policy);
    }

    const ageMs = now - (dim.lastUpdated || 0);
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const staleDays = (policy.exploitStrategy && policy.exploitStrategy.staleDays) || STALE_DAYS;
    const expireDays = (policy.exploitStrategy && policy.exploitStrategy.expireDays) || EXPIRE_DAYS;
    const stale = ageDays > staleDays;
    if (ageDays > expireDays) {
        return noDecision(dimension, 'policy expired — winner is too old, needs fresh data', policy);
    }

    if (candidates && !candidates.includes(String(dim.winningPattern))) {
        return noDecision(dimension, 'learned winner is not an available candidate for this content', policy);
    }

    // Exploit probability: high confidence exploits most, stale winners less.
    let exploitProbability = EXPLOIT_BASE;
    if ((dim.confidence || 0) >= EXPLOIT_HIGH_CONFIDENCE) {
        exploitProbability = (policy.exploitStrategy && policy.exploitStrategy.highConfidence) || EXPLOIT_HIGH_CONFIDENCE_PROBABILITY;
    }
    if (stale) exploitProbability = exploitProbability * 0.5;

    const meta = {
        dimension,
        winner: dim.winningPattern,
        confidence: dim.confidence,
        sampleSize: dim.sampleSize,
        recentSampleSize: dim.recentSampleSize || 0,
        exploredSampleSize: dim.exploredSampleSize || 0,
        targetSeconds: dim.targetSeconds != null ? dim.targetSeconds : null,
        stale,
        policyVersion: policy ? policy.version : null,
        applied: true
    };

    const roll = rng();
    if (roll < exploitProbability) {
        return { ...meta, mode: 'exploit', value: dim.winningPattern, exploration: false, reason: `exploit learned winner (p=${exploitProbability.toFixed(2)}, roll=${roll.toFixed(2)})` };
    }

    // Controlled exploration: pick a random non-winner candidate.
    const alternatives = candidates
        ? candidates.filter((c) => c !== String(dim.winningPattern))
        : [];
    if (alternatives.length === 0) {
        // Nothing to explore — fall back to the winner but record that
        // exploration was attempted and impossible.
        return { ...meta, mode: 'explore', value: dim.winningPattern, exploration: true, explorationFallback: true, reason: 'exploration attempted but no alternative candidate exists' };
    }
    const value = alternatives[Math.floor(rng() * alternatives.length) % alternatives.length];
    return { ...meta, mode: 'explore', value, exploration: true, reason: `controlled exploration among ${alternatives.length} alternatives (roll=${roll.toFixed(2)})` };
}

module.exports = {
    POLICY_COLLECTION,
    POLICY_DOC,
    POLICY_HISTORY_COLLECTION,
    MIN_SAMPLES,
    CONFIDENCE_THRESHOLD,
    EXPLOIT_BASE,
    STALE_DAYS,
    EXPIRE_DAYS,
    PATTERN_TO_DIMENSION,
    APPLIED_DIMENSIONS,
    buildPolicy,
    buildPolicyVersion,
    savePolicy,
    loadPolicy,
    getDimension,
    decide
};
