'use strict';

/**
 * trend_detector.js — Search/Trend Intelligence (Phase 28)
 * 
 * Optional trend provider interface. If no provider is configured,
 * uses internal historical data. Pipeline never depends on trends.
 */

const flags = require('./feature_flags');

class TrendProvider {
    async getTrends(opts = {}) { return []; }
    async getTrendScore(topic, opts = {}) { return 0; }
}

class InternalTrendProvider extends TrendProvider {
    constructor(db) {
        super();
        this.db = db;
    }

    async getTrends(opts = {}) {
        if (!this.db) return [];
        try {
            const snap = await this.db.collection('content_opportunities')
                .orderBy('opportunityScore', 'desc')
                .limit(opts.limit || 10)
                .get();
            return snap.docs.map(d => ({
                topic: d.data().topic,
                score: d.data().opportunityScore,
                source: 'internal'
            }));
        } catch {
            return [];
        }
    }

    async getTrendScore(topic, opts = {}) {
        if (!this.db || !topic) return 0;
        try {
            const normalized = String(topic).toLowerCase().trim();
            const snap = await this.db.collection('content_opportunities')
                .where('normalizedTopic', '==', normalized)
                .limit(1)
                .get();
            if (!snap.empty) return snap.docs[0].data().opportunityScore || 0;
        } catch { /* ignore */ }
        return 0;
    }
}

async function detectTrends(db, opts = {}) {
    if (!flags.isEnabled('TREND_ENGINE_ENABLED')) {
        return { trends: [], reason: 'trend engine disabled' };
    }

    const provider = opts.provider || new InternalTrendProvider(db);
    
    try {
        const trends = await provider.getTrends(opts);
        return {
            trends: trends.map((t, i) => ({
                rank: i + 1,
                topic: t.topic,
                trendScore: t.score || 0,
                source: t.source || 'internal',
                detectedAt: Date.now()
            })),
            provider: provider.constructor.name
        };
    } catch (err) {
        return { trends: [], error: true, reason: err.message || 'trend detection failed' };
    }
}

module.exports = {
    TrendProvider,
    InternalTrendProvider,
    detectTrends
};
