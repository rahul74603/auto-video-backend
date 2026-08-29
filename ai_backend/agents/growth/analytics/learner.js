'use strict';

/**
 * analytics/learner.js — Self-Learning Engine (Phase 24, 25, 37, 38 + Growth Self-Learning rewrite)
 *
 * Discovers patterns from REAL performance data. Post-rewrite guarantees:
 *
 *   1. ATTRIBUTION-GATED: a pattern is only emitted when the records
 *      actually contain the attribution field for that pattern type.
 *      Missing attribution (null/undefined) is NEVER converted into a
 *      value or a bucket. (Previously every record without `duration`
 *      silently became bucket "short_0_20" — a fake pattern.)
 *
 *   2. COMPARATIVE: a "winner" requires at least TWO distinct real
 *      buckets — you cannot know X is best if only X was ever tried.
 *
 *   3. PLATFORM-SEPARATED: patterns are discovered per platform
 *      (YouTube winners stay YouTube winners; Facebook is learned
 *      independently and never mixed in).
 *
 *   4. OUTLIER-RESISTANT: bucket averages use a trimmed mean (drop min
 *      and max) once a bucket has enough samples, so one viral video
 *      cannot crown itself the winner.
 *
 *   5. HONEST CONFIDENCE: confidence reflects sample size and score
 *      level, and is only attached to buckets with >= MIN_SAMPLE_SIZE.
 *
 * Patterns are persisted to growth_insights/latest (reporting) and are
 * converted by learning/policy_store.js into growth_policies/latest,
 * which video generation consumes (closed loop).
 */

const flags = require('../feature_flags');

const MIN_SAMPLE_SIZE = 5;
const CONFIDENCE_THRESHOLD = 0.6;
const ROLLING_WINDOW_DAYS = 30;
const RECENT_WINDOW_DAYS = 7;
const MAX_INFLUENCE = 0.3; // One outlier can't shift more than 30%

const PATTERN_TYPES = ['HOOK', 'PRESENTER', 'VISUAL_STYLE', 'DURATION', 'CTA', 'POST_TIME', 'CATEGORY', 'CONTENT_ANGLE', 'MUSIC'];

// How many real distinct buckets must exist before a "winner" is claimable.
const MIN_DISTINCT_BUCKETS = 2;

// Pattern type → attribution field on the content_performance record.
// POST_TIME is special: publishHour (stored) or the real publishedAt
// timestamp are both legitimate sources of publish-time truth.
const PATTERN_SOURCE_FIELD = {
    HOOK: 'hookType',
    PRESENTER: 'presenter',
    VISUAL_STYLE: 'visualStyle',
    DURATION: 'duration',
    CTA: 'cta',
    CONTENT_ANGLE: 'contentAngle',
    MUSIC: 'music',
    CATEGORY: 'category'
};

// ─── Main entry ──────────────────────────────────────────────────────

async function analyzePatterns(db, opts = {}) {
    if (!flags.isEnabled('LEARNER_ENABLED')) {
        return { patterns: [], reason: 'learner disabled' };
    }
    if (!db) {
        return { patterns: [], reason: 'no db' };
    }

    try {
        const windowStart = Date.now() - (opts.windowDays || ROLLING_WINDOW_DAYS) * 24 * 60 * 60 * 1000;

        const snap = await db.collection('content_performance')
            .where('collectedAt', '>=', windowStart)
            .limit(500)
            .get();

        if (snap.empty) return { patterns: [], reason: 'no performance data' };

        const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const patterns = [];

        // Analyze each pattern type (per-platform)
        for (const patternType of PATTERN_TYPES) {
            const typePatterns = analyzePatternType(patternType, records, opts);
            patterns.push(...typePatterns);
        }

        // Store insights (reporting artifact; the APPLIED artifact is the
        // policy built from these patterns by learning/policy_store.js).
        if (patterns.length > 0) {
            try {
                await db.collection('growth_insights').doc('latest').set({
                    patterns,
                    analyzedAt: Date.now(),
                    sampleSize: records.length,
                    windowDays: opts.windowDays || ROLLING_WINDOW_DAYS
                }, { merge: true });
            } catch (err) {
                console.log(`⚠️ insight store failed: ${err.message || err}`);
            }
        }

        return { patterns, sampleSize: records.length };
    } catch (err) {
        console.log(`⚠️ learner analysis failed: ${err.message || err}`);
        return { patterns: [], error: true, reason: err.message || 'analysis failed' };
    }
}

// ─── Pattern analysis ────────────────────────────────────────────────

/**
 * Analyze one pattern type across records, separated by platform.
 * Returns an array of patterns (one per platform that qualifies).
 */
function analyzePatternType(patternType, records, opts = {}) {
    const now = opts.now || Date.now();
    const patterns = [];

    const byPlatform = groupByPlatform(records);

    for (const [platform, platformRecords] of Object.entries(byPlatform)) {
        const pattern = analyzePatternForPlatform(patternType, platformRecords, platform, now);
        if (pattern) patterns.push(pattern);
    }

    return patterns;
}

function groupByPlatform(records) {
    const byPlatform = {};
    for (const record of records || []) {
        const platform = String(record && record.platform || 'unknown');
        if (!byPlatform[platform]) byPlatform[platform] = [];
        byPlatform[platform].push(record);
    }
    return byPlatform;
}

function analyzePatternForPlatform(patternType, records, platform, now) {
    const grouped = {};

    for (const record of records) {
        const key = getPatternKey(patternType, record);
        if (!key) continue; // missing attribution → excluded from this pattern

        if (!grouped[key]) grouped[key] = { scores: [], count: 0, values: [], recent: 0, explored: 0 };
        const score = record.performanceScore || 0;
        grouped[key].scores.push(score);
        grouped[key].count++;

        // Real numeric values (e.g. actual seconds) for DURATION targets.
        if (patternType === 'DURATION' && typeof record.duration === 'number' && record.duration > 0) {
            grouped[key].values.push(record.duration);
        }

        // Recent activity + exploration tracking for the winning bucket.
        if ((record.collectedAt || 0) >= now - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
            grouped[key].recent++;
        }
        const explored = record.learningMeta
            && Array.isArray(record.learningMeta.exploredDimensions)
            && record.learningMeta.exploredDimensions.includes(dimensionKeyOf(patternType));
        if (explored) grouped[key].explored++;
    }

    const bucketKeys = Object.keys(grouped);
    // COMPARATIVE GATE: without a second real bucket there is nothing to
    // win against — refuse to claim a pattern.
    if (bucketKeys.length < MIN_DISTINCT_BUCKETS) return null;

    // Eligible buckets = enough samples to trust their average.
    const eligible = bucketKeys.filter((key) => grouped[key].count >= MIN_SAMPLE_SIZE);
    if (eligible.length === 0) return null;

    // Winner = highest trimmed-mean average among eligible buckets.
    let best = null;
    let bestAvg = -1;
    let runnerUpKey = null;
    let runnerUpAvg = -1;

    for (const key of eligible) {
        const avg = trimmedMean(grouped[key].scores);
        if (avg > bestAvg) {
            runnerUpKey = best;
            runnerUpAvg = bestAvg;
            best = key;
            bestAvg = avg;
        } else if (avg > runnerUpAvg) {
            runnerUpKey = key;
            runnerUpAvg = avg;
        }
    }

    if (!best) return null;

    // Confidence: sample size + score level (same formula as before the
    // rewrite, now only ever applied to genuinely attributed buckets).
    const bestGroup = grouped[best];
    const confidence = Math.min(1, (bestGroup.count / 20) * 0.5 + (bestAvg / 100) * 0.5);
    if (confidence < CONFIDENCE_THRESHOLD) return null;

    const pattern = {
        patternType,
        platform,
        winningPattern: best,
        averageScore: Math.round(bestAvg),
        averagePerformanceScore: Math.round(bestAvg),
        confidence: Math.round(confidence * 100) / 100,
        sampleSize: bestGroup.count,
        recentSampleSize: bestGroup.recent,
        exploredSampleSize: bestGroup.explored,
        distinctBuckets: bucketKeys.length,
        margin: runnerUpKey ? Math.round(bestAvg - runnerUpAvg) : null,
        runnerUp: runnerUpKey,
        discoveredAt: now,
        sourceField: PATTERN_SOURCE_FIELD[patternType] || null,
        attributionVerified: true
    };

    // DURATION: carry the real average seconds of the winning bucket so
    // the policy can set an actual target (never a fabricated midpoint).
    if (patternType === 'DURATION' && bestGroup.values.length > 0) {
        pattern.averageValueSeconds = Math.round(trimmedMean(bestGroup.values));
    }

    // Category context where the record carries one (informational).
    const withCategory = records.find((r) => r.category && r.category !== '');
    if (withCategory) pattern.category = withCategory.category;

    return pattern;
}

/**
 * Mean with the single lowest and highest value dropped once the sample
 * is big enough — one viral video cannot carry a bucket alone.
 */
function trimmedMean(values) {
    const list = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (list.length === 0) return 0;
    if (list.length < 5) return list.reduce((s, v) => s + v, 0) / list.length;
    const sorted = [...list].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, -1);
    return trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
}

/**
 * Pattern key for a record. Returns null when the attribution needed for
 * this pattern type is genuinely absent — the caller must skip the
 * record. Missing values are NEVER defaulted or bucketed.
 */
function getPatternKey(patternType, record) {
    if (!record) return null;
    switch (patternType) {
        case 'HOOK':
            return nonEmptyString(record.hookType);
        case 'PRESENTER':
            return nonEmptyString(record.presenter);
        case 'VISUAL_STYLE':
            return nonEmptyString(record.visualStyle);
        case 'MUSIC':
            return nonEmptyString(record.music);
        case 'CTA':
            return nonEmptyString(record.cta);
        case 'CONTENT_ANGLE':
            return nonEmptyString(record.contentAngle);
        case 'CATEGORY':
            return nonEmptyString(record.category);
        case 'DURATION': {
            // Only REAL numeric durations participate. No `|| 0`, no fake
            // bucket for missing data (that produced the bogus
            // "short_0_20" recommendation).
            if (typeof record.duration !== 'number' || !Number.isFinite(record.duration) || record.duration <= 0) {
                return null;
            }
            const d = record.duration;
            if (d < 20) return 'short_0_20';
            if (d < 35) return 'medium_20_35';
            if (d < 50) return 'long_35_50';
            return 'xlong_50_plus';
        }
        case 'POST_TIME': {
            // publishHour is stored attribution; a real publishedAt
            // timestamp is equally legitimate. Both missing → null.
            let hour = null;
            if (typeof record.publishHour === 'number' && Number.isFinite(record.publishHour)) {
                hour = record.publishHour;
            } else if (record.publishedAt) {
                const ts = new Date(record.publishedAt).getTime();
                if (Number.isFinite(ts)) hour = new Date(ts).getHours();
            }
            if (hour === null) return null;
            if (hour >= 6 && hour < 10) return 'morning';
            if (hour >= 10 && hour < 14) return 'midday';
            if (hour >= 14 && hour < 18) return 'afternoon';
            if (hour >= 18 && hour < 22) return 'evening';
            return 'night';
        }
        default:
            return null;
    }
}

function nonEmptyString(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function dimensionKeyOf(patternType) {
    return {
        HOOK: 'hook',
        PRESENTER: 'presenter',
        VISUAL_STYLE: 'visualStyle',
        MUSIC: 'music',
        CTA: 'cta',
        CONTENT_ANGLE: 'contentAngle',
        DURATION: 'duration',
        POST_TIME: 'postTime',
        CATEGORY: 'category'
    }[patternType] || null;
}

// Phase 25 — Best Time Engine (reporting only; publishing is immediate)
async function recommendPublishTime(db, opts = {}) {
    if (!db) return { recommendedTime: null, reason: 'no db' };

    try {
        const snap = await db.collection('content_performance')
            .where('collectedAt', '>=', Date.now() - 60 * 24 * 60 * 60 * 1000)
            .limit(200)
            .get();

        if (snap.empty) return { recommendedTime: null, reason: 'no data' };

        const bySlot = {};
        for (const doc of snap.docs) {
            const d = doc.data();
            const publishedAt = d.publishedAt ? new Date(d.publishedAt) : null;
            if (!publishedAt) continue;

            const dayOfWeek = publishedAt.getDay();
            const hour = publishedAt.getHours();
            const key = `${dayOfWeek}_${hour}`;

            if (!bySlot[key]) bySlot[key] = { total: 0, count: 0 };
            bySlot[key].total += d.performanceScore || 0;
            bySlot[key].count++;
        }

        let best = null;
        let bestAvg = 0;
        for (const [slot, stats] of Object.entries(bySlot)) {
            if (stats.count < 3) continue;
            const avg = stats.total / stats.count;
            if (avg > bestAvg) { best = slot; bestAvg = avg; }
        }

        if (!best) return { recommendedTime: null, reason: 'insufficient data' };

        const [dayOfWeek, hour] = best.split('_').map(Number);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return {
            recommendedTime: { dayOfWeek: days[dayOfWeek], hour, confidence: Math.round(bestAvg) },
            reason: `best performing slot from ${bySlot[best].count} samples`
        };
    } catch (err) {
        return { recommendedTime: null, reason: err.message || 'failed' };
    }
}

// Phase 37 — AI Recommendations (human-readable reporting artifact; the
// APPLIED artifact is the policy in growth_policies/latest)
async function generateRecommendations(db, opts = {}) {
    const insights = await analyzePatterns(db, opts);
    const recommendations = [];

    for (const pattern of insights.patterns) {
        if (pattern.confidence < CONFIDENCE_THRESHOLD) continue;

        let action = '';
        switch (pattern.patternType) {
            case 'HOOK':
                action = `"${pattern.winningPattern}" hooks outperform others by ${pattern.averageScore}% avg score. Use more ${pattern.winningPattern} hooks for ${pattern.platform} content.`;
                break;
            case 'DURATION':
                action = `Videos ${pattern.winningPattern} seconds perform best on ${pattern.platform}. Adjust duration targets accordingly.`;
                break;
            case 'PRESENTER':
                action = `${pattern.winningPattern} presenter has higher performance on ${pattern.platform}.`;
                break;
            case 'POST_TIME':
                action = `Best posting time on ${pattern.platform}: ${pattern.winningPattern} (avg score ${pattern.averageScore}).`;
                break;
            case 'VISUAL_STYLE':
                action = `"${pattern.winningPattern}" visual style performs best on ${pattern.platform}.`;
                break;
            case 'MUSIC':
                action = `"${pattern.winningPattern}" music performs best on ${pattern.platform}.`;
                break;
            case 'CTA':
                action = `"${pattern.winningPattern}" CTA performs best on ${pattern.platform}.`;
                break;
            case 'CONTENT_ANGLE':
                action = `"${pattern.winningPattern}" content angle performs best on ${pattern.platform}.`;
                break;
        }

        if (action) {
            recommendations.push({
                action,
                patternType: pattern.patternType,
                platform: pattern.platform,
                category: pattern.category || null,
                confidence: pattern.confidence,
                sampleSize: pattern.sampleSize,
                reason: `based on ${pattern.sampleSize} samples with ${Math.round(pattern.confidence * 100)}% confidence`
            });
        }
    }

    return recommendations;
}

module.exports = {
    analyzePatterns,
    analyzePatternType,
    getPatternKey,
    recommendPublishTime,
    generateRecommendations,
    trimmedMean,
    MIN_SAMPLE_SIZE,
    CONFIDENCE_THRESHOLD,
    ROLLING_WINDOW_DAYS,
    MIN_DISTINCT_BUCKETS,
    PATTERN_TYPES,
    PATTERN_SOURCE_FIELD
};
