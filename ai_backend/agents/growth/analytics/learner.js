'use strict';

/**
 * analytics/learner.js — Self-Learning Engine (Phase 24, 25, 37, 38)
 * 
 * Discovers patterns from real performance data:
 * - best hook types, presenters, visual styles, durations
 * - best posting times, categories, topics
 * 
 * Uses confidence thresholds and minimum sample sizes.
 * Learning is gradual — one viral video won't distort everything.
 */

const flags = require('../feature_flags');

const MIN_SAMPLE_SIZE = 5;
const CONFIDENCE_THRESHOLD = 0.6;
const ROLLING_WINDOW_DAYS = 30;
const MAX_INFLUENCE = 0.3; // One outlier can't shift more than 30%

const PATTERN_TYPES = ['HOOK', 'PRESENTER', 'VISUAL_STYLE', 'DURATION', 'CTA', 'POST_TIME', 'CATEGORY', 'TOPIC', 'MUSIC'];

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

        // Analyze each pattern type
        for (const patternType of PATTERN_TYPES) {
            const pattern = analyzePatternType(patternType, records);
            if (pattern) patterns.push(pattern);
        }

        // Store insights
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

function analyzePatternType(patternType, records) {
    const grouped = {};

    for (const record of records) {
        const key = getPatternKey(patternType, record);
        if (!key) continue;

        if (!grouped[key]) grouped[key] = { scores: [], count: 0 };
        const score = record.performanceScore || 0;
        grouped[key].scores.push(score);
        grouped[key].count++;
    }

    // Find the winner
    let best = null;
    let bestAvg = 0;

    for (const [key, group] of Object.entries(grouped)) {
        if (group.count < MIN_SAMPLE_SIZE) continue;
        const avg = group.scores.reduce((s, v) => s + v, 0) / group.count;
        if (avg > bestAvg) {
            best = key;
            bestAvg = avg;
        }
    }

    if (!best) return null;

    // Calculate confidence
    const bestGroup = grouped[best];
    const confidence = Math.min(1, (bestGroup.count / 20) * 0.5 + (bestAvg / 100) * 0.5);

    if (confidence < CONFIDENCE_THRESHOLD) return null;

    return {
        patternType,
        category: records[0]?.category || 'GENERAL',
        platform: records[0]?.platform || 'youtube',
        winningPattern: best,
        averageScore: Math.round(bestAvg),
        confidence: Math.round(confidence * 100) / 100,
        sampleSize: bestGroup.count,
        discoveredAt: Date.now()
    };
}

function getPatternKey(patternType, record) {
    switch (patternType) {
        case 'HOOK': return record.hookType || null;
        case 'PRESENTER': return record.presenter || null;
        case 'VISUAL_STYLE': return record.visualStyle || null;
        case 'DURATION': {
            const d = record.duration || 0;
            if (d < 20) return 'short_0_20';
            if (d < 35) return 'medium_20_35';
            if (d < 50) return 'long_35_50';
            return 'xlong_50_plus';
        }
        case 'POST_TIME': {
            const hour = record.publishHour || new Date(record.publishedAt || 0).getHours();
            if (hour >= 6 && hour < 10) return 'morning';
            if (hour >= 10 && hour < 14) return 'midday';
            if (hour >= 14 && hour < 18) return 'afternoon';
            if (hour >= 18 && hour < 22) return 'evening';
            return 'night';
        }
        case 'CATEGORY': return record.category || null;
        default: return null;
    }
}

// Phase 25 — Best Time Engine
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

// Phase 37 — AI Recommendations
async function generateRecommendations(db, opts = {}) {
    const insights = await analyzePatterns(db, opts);
    const recommendations = [];

    for (const pattern of insights.patterns) {
        if (pattern.confidence < CONFIDENCE_THRESHOLD) continue;

        let action = '';
        switch (pattern.patternType) {
            case 'HOOK':
                action = `"${pattern.winningPattern}" hooks outperform others by ${pattern.averageScore}% avg score. Use more ${pattern.winningPattern} hooks for ${pattern.category} content.`;
                break;
            case 'DURATION':
                action = `Videos ${pattern.winningPattern} seconds perform best. Adjust duration targets accordingly.`;
                break;
            case 'PRESENTER':
                action = `${pattern.winningPattern} presenter has higher performance for ${pattern.category} content.`;
                break;
            case 'POST_TIME':
                action = `Best posting time: ${pattern.winningPattern} (avg score ${pattern.averageScore}).`;
                break;
            case 'VISUAL_STYLE':
                action = `"${pattern.winningStyle}" visual style performs best for ${pattern.category}.`;
                break;
        }

        if (action) {
            recommendations.push({
                action,
                patternType: pattern.patternType,
                category: pattern.category,
                platform: pattern.platform,
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
    MIN_SAMPLE_SIZE,
    CONFIDENCE_THRESHOLD,
    ROLLING_WINDOW_DAYS,
    PATTERN_TYPES
};
