'use strict';

/**
 * presenter_rotation.js — Intelligent Presenter Rotation (Phase 11)
 * 
 * Tracks presenter performance per category and selects the best presenter
 * based on historical data. Falls back to round-robin when no data exists.
 */

const visualEngine = require('./visual_engine');
const flags = require('./feature_flags');

const PRESENTERS = {
    'male_anchor_1.mp4': { id: 'male_1', gender: 'male', style: 'formal' },
    'male_anchor_3.mp4': { id: 'male_3', gender: 'male', style: 'energetic' },
    'female_anchor_2.mp4': { id: 'female_2', gender: 'female', style: 'warm' },
    'female_anchor_4.mp4': { id: 'female_4', gender: 'female', style: 'professional' },
    'female_anchor_5.mp4': { id: 'female_5', gender: 'female', style: 'youthful' }
};

/**
 * Deterministic rotation based on content ID + date
 * GitHub Actions har run fresh process hai, isliye module-level state kaam nahi karta
 * Ye function content ID aur date se consistent selection karta hai
 */
function selectPresenter(content, opportunity, opts = {}) {
    if (!flags.isEnabled('PRESENTER_ROTATION_ENABLED')) {
        return { anchor: visualEngine.APPROVED_ANCHORS[0], reason: 'rotation disabled' };
    }

    const style = opts.visualStyle || {};
    const category = opportunity?.category || 'GENERAL';
    const contentId = content.id || content.slug || content.title || 'default';
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Deterministic seed from content ID + date
    const seed = (contentId + today).split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);

    // If analytics data is available, use it
    if (opts.performanceData) {
        const best = findBestPresenter(opts.performanceData, category, style);
        if (best) return { anchor: best, reason: 'best performer from analytics' };
    }

    // Style-guided selection with deterministic rotation
    if (style.anchor === 'female') {
        const females = Object.keys(PRESENTERS).filter(a => a.includes('female'));
        const anchor = females[Math.abs(seed) % females.length];
        return { anchor, reason: 'style requires female' };
    }
    if (style.anchor === 'male') {
        const males = Object.keys(PRESENTERS).filter(a => a.includes('male'));
        const anchor = males[Math.abs(seed) % males.length];
        return { anchor, reason: 'style requires male' };
    }

    // 'any' — deterministic rotation among all approved anchors
    const allAnchors = visualEngine.APPROVED_ANCHORS;
    const anchor = allAnchors[Math.abs(seed) % allAnchors.length];
    return { anchor, reason: 'deterministic rotation' };
}

function findBestPresenter(performanceData, category, style) {
    if (!performanceData || !Array.isArray(performanceData)) return null;
    
    const byPresenter = {};
    for (const record of performanceData) {
        if (!record.presenter || !record.performanceScore) continue;
        if (record.category !== category && category !== 'GENERAL') continue;
        
        if (!byPresenter[record.presenter]) {
            byPresenter[record.presenter] = { total: 0, count: 0 };
        }
        byPresenter[record.presenter].total += record.performanceScore;
        byPresenter[record.presenter].count++;
    }

    let best = null;
    let bestAvg = 0;
    for (const [presenter, stats] of Object.entries(byPresenter)) {
        if (stats.count < 3) continue; // Need minimum sample
        const avg = stats.total / stats.count;
        if (avg > bestAvg && visualEngine.APPROVED_ANCHORS.includes(presenter)) {
            best = presenter;
            bestAvg = avg;
        }
    }
    return best;
}

module.exports = {
    PRESENTERS,
    selectPresenter,
    findBestPresenter
};
