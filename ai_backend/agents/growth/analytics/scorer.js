'use strict';

/**
 * analytics/scorer.js — Performance Scoring (Phase 21 & 23)
 * 
 * Computes normalized performance scores and winner detection.
 */

const { normalizeMetrics, computePerformanceScore, computeBaselines } = require('./normalizer');

function scorePerformance(metrics, baselines = {}) {
    const { normalized, scores } = normalizeMetrics(metrics, baselines);
    const performanceScore = computePerformanceScore(scores);

    return {
        performanceScore,
        normalizedScores: scores,
        rawMetrics: metrics,
        gradedAt: Date.now()
    };
}

function detectWinner(variants) {
    if (!Array.isArray(variants) || variants.length === 0) {
        return { winner: null, reason: 'no variants' };
    }

    // Filter variants with sufficient data
    const scored = variants
        .map(v => ({
            ...v,
            effectiveScore: computeEffectiveScore(v),
            sampleSize: v.sampleSize || 0
        }))
        .filter(v => v.sampleSize >= 3); // Minimum 3 data points

    if (scored.length === 0) {
        return { winner: null, reason: 'insufficient sample sizes' };
    }

    // Sort by effective score
    scored.sort((a, b) => b.effectiveScore - a.effectiveScore);

    const winner = scored[0];
    const runnerUp = scored[1];

    // Check if the lead is significant (at least 15% better)
    const leadSignificant = !runnerUp || 
        (winner.effectiveScore - runnerUp.effectiveScore) > runnerUp.effectiveScore * 0.15;

    return {
        winner: {
            variantId: winner.variantId,
            hookType: winner.hookType,
            hookText: winner.hookText,
            performanceScore: winner.effectiveScore,
            sampleSize: winner.sampleSize,
            metrics: winner.metrics
        },
        runnerUp: runnerUp ? {
            variantId: runnerUp.variantId,
            performanceScore: runnerUp.effectiveScore
        } : null,
        allVariants: scored.map(v => ({
            variantId: v.variantId,
            hookType: v.hookType,
            performanceScore: v.effectiveScore,
            sampleSize: v.sampleSize
        })),
        leadSignificant,
        confidence: scored.length >= 5 ? 0.8 : scored.length >= 3 ? 0.6 : 0.4,
        reason: leadSignificant ? 'significant lead' : 'close race — need more data'
    };
}

function computeEffectiveScore(variant) {
    const metrics = variant.metrics || {};
    const perfScore = variant.performanceScore || 0;
    const sampleSize = variant.sampleSize || 1;

    // Normalize by sample size (larger sample = more reliable)
    const sampleConfidence = Math.min(1, sampleSize / 10);

    // Weighted combination
    const viewsScore = normalizeValue(metrics.views, [100, 500, 1000, 5000, 10000]);
    const retentionScore = normalizeValue(metrics.retention, [0.2, 0.4, 0.6, 0.75, 0.9]);
    const engagementScore = normalizeValue(
        (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0),
        [5, 20, 50, 100, 200]
    );
    const completionScore = normalizeValue(metrics.completionRate, [0.2, 0.4, 0.6, 0.75, 0.9]);
    const followerScore = normalizeValue(metrics.followersGained, [1, 5, 10, 50, 100]);

    const combined = (
        viewsScore * 0.20 +
        retentionScore * 0.25 +
        engagementScore * 0.15 +
        completionScore * 0.20 +
        followerScore * 0.10 +
        (perfScore / 100) * 0.10
    ) * sampleConfidence;

    return Math.round(combined * 100);
}

function normalizeValue(value, thresholds) {
    if (!value || !thresholds) return 0;
    for (let i = thresholds.length - 1; i >= 0; i--) {
        if (value >= thresholds[i]) return (i + 1) / thresholds.length;
    }
    return value / thresholds[0] * 0.2;
}

module.exports = {
    scorePerformance,
    detectWinner,
    computeEffectiveScore,
    normalizeValue,
    computeBaselines
};
