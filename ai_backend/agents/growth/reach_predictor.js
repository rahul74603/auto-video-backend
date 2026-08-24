'use strict';

/**
 * reach_predictor.js — Reach Prediction (Phase 29)
 * 
 * Predicts a reach score (0-100) for prioritization.
 * Uses predicted values, not guarantees.
 */

function predictReach(content, opportunity, opts = {}) {
    const scores = {};

    // Topic demand (based on category + historical)
    scores.topicDemand = computeTopicDemand(content, opportunity);

    // Freshness
    scores.freshness = opportunity?.freshnessScore || 0.5;

    // Audience fit
    scores.audienceFit = opportunity?.audienceFitScore || 0.5;

    // Hook quality
    scores.hookScore = (opts.hookScore || 50) / 100;

    // Historical topic performance
    scores.historicalPerf = opportunity?.historicalPerformanceScore || 0.5;

    // Expected retention (from script quality)
    scores.expectedRetention = opts.retentionScore || 0.5;

    // Content competition (inverted — less competition = higher score)
    scores.competition = 1 - (opportunity?.competitionScore || 0.5);

    // Platform fit
    scores.platformFit = computePlatformFit(content, opts.platform || 'youtube');

    // Weighted combination
    const weights = {
        topicDemand: 0.20,
        freshness: 0.15,
        audienceFit: 0.15,
        hookScore: 0.15,
        historicalPerf: 0.10,
        expectedRetention: 0.10,
        competition: 0.05,
        platformFit: 0.10
    };

    let total = 0;
    for (const [key, weight] of Object.entries(weights)) {
        total += (scores[key] || 0) * weight;
    }

    const reachScore = Math.round(total * 100);

    return {
        reachPredictionScore: reachScore,
        breakdown: scores,
        confidence: opts.hasHistoricalData ? 0.7 : 0.4,
        predicted: true,
        reason: `predicted from ${Object.keys(scores).length} factors`
    };
}

function computeTopicDemand(content, opportunity) {
    const category = opportunity?.category || 'GENERAL';
    const demandMap = {
        'RESULT': 0.95,
        'ADMIT_CARD': 0.90,
        'SSC': 0.85,
        'RAILWAY': 0.80,
        'BANKING': 0.75,
        'DEFENCE': 0.85,
        'POLICE': 0.85,
        'TEACHING': 0.70,
        'ENGINEERING': 0.65,
        'STATE': 0.75,
        'UPSC': 0.70,
        'GENERAL': 0.50
    };
    return demandMap[category] || 0.5;
}

function computePlatformFit(content, platform) {
    // Some content fits better on certain platforms
    const title = String(content.title || '').toLowerCase();
    
    if (platform === 'youtube_shorts') {
        if (/result|admit card|breaking/.test(title)) return 0.9;
        if (/exam|notification/.test(title)) return 0.8;
        return 0.7;
    }
    if (platform === 'instagram_reels') {
        if (/result|motivation/.test(title)) return 0.85;
        return 0.6;
    }
    if (platform === 'telegram') {
        return 0.85; // Telegram is always good for info-rich content
    }
    return 0.7;
}

module.exports = {
    predictReach,
    computeTopicDemand,
    computePlatformFit
};
