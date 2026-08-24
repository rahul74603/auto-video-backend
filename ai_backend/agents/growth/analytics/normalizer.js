'use strict';

/**
 * analytics/normalizer.js — Metric Normalization (Phase 21)
 * 
 * Normalizes raw metrics into comparable scores 0-1.
 * Uses percentile-based normalization against baselines.
 */

function normalizeMetrics(metrics, baselines = {}) {
    if (!metrics) return { normalized: {}, scores: {} };

    const normalized = {};
    const scores = {};

    for (const [key, value] of Object.entries(metrics)) {
        if (value === null || value === undefined) {
            normalized[key] = null;
            scores[key] = null;
            continue;
        }

        const baseline = baselines[key];
        if (baseline && baseline.p50 > 0) {
            // Percentile-based normalization
            normalized[key] = value;
            if (value >= baseline.p90) scores[key] = 1.0;
            else if (value >= baseline.p75) scores[key] = 0.8;
            else if (value >= baseline.p50) scores[key] = 0.6;
            else if (value >= baseline.p25) scores[key] = 0.4;
            else scores[key] = 0.2;
        } else {
            // No baseline — use absolute thresholds
            normalized[key] = value;
            scores[key] = getAbsoluteScore(key, value);
        }
    }

    return { normalized, scores };
}

function getAbsoluteScore(metric, value) {
    const thresholds = {
        views: [100, 500, 1000, 5000, 10000],
        likes: [10, 50, 100, 500, 1000],
        comments: [5, 20, 50, 100, 200],
        shares: [2, 10, 30, 100, 200],
        saves: [1, 5, 15, 50, 100],
        watchTime: [30, 60, 120, 300, 600],
        retention: [0.2, 0.4, 0.6, 0.75, 0.9],
        completionRate: [0.2, 0.4, 0.6, 0.75, 0.9],
        clickThroughRate: [0.02, 0.04, 0.06, 0.08, 0.10],
        followersGained: [1, 5, 10, 50, 100]
    };

    const t = thresholds[metric];
    if (!t) return 0.5;

    for (let i = t.length - 1; i >= 0; i--) {
        if (value >= t[i]) return 0.2 + (i / t.length) * 0.8;
    }
    return 0.1;
}

function computePerformanceScore(scores) {
    if (!scores || Object.keys(scores).length === 0) return 0;

    const weights = {
        views: 0.15,
        retention: 0.20,
        completionRate: 0.15,
        engagement: 0.15,
        share: 0.15,
        followerGain: 0.10,
        clickThroughRate: 0.10
    };

    // Engagement = likes + comments combined
    const engagementScore = avg(scores.likes, scores.comments);
    const shareScore = scores.shares;
    const followerGainScore = scores.followersGained;

    let total = 0;
    let weightSum = 0;

    for (const [key, weight] of Object.entries(weights)) {
        let score = null;
        if (key === 'engagement') score = engagementScore;
        else if (key === 'share') score = shareScore;
        else if (key === 'followerGain') score = followerGainScore;
        else score = scores[key];

        if (score !== null && score !== undefined) {
            total += score * weight;
            weightSum += weight;
        }
    }

    return weightSum > 0 ? Math.round((total / weightSum) * 100) : 0;
}

function avg(...values) {
    const valid = values.filter(v => v !== null && v !== undefined);
    if (valid.length === 0) return null;
    return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function computeBaselines(performances) {
    if (!Array.isArray(performances) || performances.length === 0) return {};

    const baselines = {};
    for (const field of ['views', 'likes', 'comments', 'shares', 'retention', 'completionRate']) {
        const values = performances
            .map(p => p[field])
            .filter(v => v !== null && v !== undefined)
            .sort((a, b) => a - b);

        if (values.length < 5) continue;

        baselines[field] = {
            p25: percentile(values, 25),
            p50: percentile(values, 50),
            p75: percentile(values, 75),
            p90: percentile(values, 90)
        };
    }
    return baselines;
}

function percentile(sorted, p) {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)] || 0;
}

module.exports = {
    normalizeMetrics,
    getAbsoluteScore,
    computePerformanceScore,
    computeBaselines,
    avg,
    percentile
};
