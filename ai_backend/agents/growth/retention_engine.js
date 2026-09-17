'use strict';

/**
 * retention_engine.js — Retention-Oriented Script Planner (Phase 8 & 9)
 * 
 * Estimates optimal duration and structures content for maximum retention.
 * Dynamic duration based on content type, facts, urgency, and platform.
 */

const flags = require('./feature_flags');

// Starting heuristics (Phase 8) — SHORTS REACH WINDOW (12-22s) se update:
// 10-22s shorts ko hi reach milta hai (user-observed data), isliye JOB_ALERT
// aur UPDATE (jobs + fast_track) ab is window me target hote hain. FULL
// DETAIL phir bhi hoti hai — duration_fitter script ko isi budget me fit
// karta hai (hook + saare facts + CTA, rate 1.0-1.25x).
const DURATION_DEFAULTS = {
    BREAKING_SHORT: { min: 10, max: 22, target: 15 },
    UPDATE: { min: 12, max: 22, target: 18 },
    JOB_ALERT: { min: 12, max: 22, target: 18 },
    DETAILED: { min: 40, max: 60, target: 50 }
};

const PLATFORM_DEFAULTS = {
    youtube_shorts: { maxDuration: 60, targetDuration: 30 },
    instagram_reels: { maxDuration: 90, targetDuration: 30 },
    facebook_reels: { maxDuration: 90, targetDuration: 35 },
    telegram: { maxDuration: 120, targetDuration: 45 }
};

function estimateDuration(content, opportunity, opts = {}) {
    if (!flags.isEnabled('GROWTH_ENGINE_ENABLED')) {
        return { duration: 30, reason: 'engine disabled' };
    }

    const format = opportunity?.recommendedFormat || 'JOB_ALERT';
    const defaults = DURATION_DEFAULTS[format] || DURATION_DEFAULTS.JOB_ALERT;
    
    const platform = opts.platform || 'youtube_shorts';
    const platformDefaults = PLATFORM_DEFAULTS[platform] || PLATFORM_DEFAULTS.youtube_shorts;

    // Factor 1: Content type base
    let duration = defaults.target;

    // Factor 2: Number of key facts
    const factCount = countFacts(content, opportunity);
    if (factCount <= 2) duration = Math.max(defaults.min, duration - 10);
    else if (factCount >= 6) duration = Math.min(defaults.max, duration + 10);

    // Factor 3: Urgency — urgent content should be shorter
    if (opportunity?.urgency === 'CRITICAL') {
        duration = Math.max(12, duration - 10);
    }

    // Factor 4: Historical optimal duration (if available from analytics)
    if (opts.historicalDuration) {
        duration = Math.round(duration * 0.6 + opts.historicalDuration * 0.4);
    }

    // Factor 4b — 🧠 LEARNED POLICY (Growth Self-Learning Phase 5): the
    // learned DURATION winner's real average seconds. Learning-dominant
    // blend (60% learned / 40% content-driven) so the persisted policy has
    // measurable influence on the target duration that generation uses.
    if (opts.learnedTargetSeconds && Number.isFinite(opts.learnedTargetSeconds) && opts.learnedTargetSeconds > 0) {
        duration = Math.round(duration * 0.4 + opts.learnedTargetSeconds * 0.6);
    }

    // Factor 4c — 🎯 SHORTS REACH WINDOW HARD CLAMP: jobs/fast_track videos
    // 12-22s se bahar NAHI ja sakti — learned policy ya historical data
    // chahe kuch bhi bole (purane 35-45s data se drag-up block). Learning
    // window ke ANDAR refine karti hai, bahar nahi kheench sakti.
    if (format === 'JOB_ALERT' || format === 'UPDATE' || format === 'BREAKING_SHORT') {
        duration = Math.min(22, Math.max(12, duration));
    }

    // Factor 5: Platform constraints
    duration = Math.min(duration, platformDefaults.maxDuration);

    // Ensure within reasonable bounds
    duration = Math.max(10, Math.min(120, duration));

    return {
        duration,
        format,
        platform,
        minDuration: defaults.min,
        maxDuration: defaults.max,
        factCount,
        reason: `based on ${format} + ${factCount} facts + ${opportunity?.urgency || 'normal'} urgency`
    };
}

function countFacts(content, opportunity) {
    let count = 0;
    if (content.organization) count++;
    if (content.vacancies) count++;
    if (content.lastDate) count++;
    if (content.startDate) count++;
    if (content.qualification) count++;
    if (content.ageLimit) count++;
    if (content.salary) count++;
    if (content.location) count++;
    if (opportunity?.keyFacts) count += opportunity.keyFacts.length;
    return count;
}

function evaluateRetentionPotential(script, opts = {}) {
    if (!script || !script.script) return { score: 0, issues: ['no script'] };

    const text = script.script;
    const words = text.split(/\s+/);
    const issues = [];
    let score = 70; // Base score

    // First 3 seconds value (first ~10 words)
    const openingWords = words.slice(0, 10).join(' ');
    const hasStrongOpening = /⚡|breaking|urgent|result|last date|\d+/.test(openingWords);
    if (hasStrongOpening) score += 10;
    else issues.push('weak opening — no urgency/fact in first 3 seconds');

    // Information density
    const numbersCount = (text.match(/\d+/g) || []).length;
    const densityRatio = numbersCount / Math.max(1, words.length / 10);
    if (densityRatio >= 2) score += 10;
    else if (densityRatio < 0.5) {
        score -= 10;
        issues.push('low information density — not enough numbers/facts');
    }

    // CTA position (should be near the end)
    const ctaIndex = text.indexOf('studygyaan');
    if (ctaIndex > 0) {
        const ctaPosition = ctaIndex / text.length;
        if (ctaPosition > 0.7) score += 5;
        else issues.push('CTA too early — push it to the end');
    }

    // Sentence length — short sentences retain better
    const sentences = text.split(/[।.!?]/).filter(s => s.trim().length > 0);
    const avgSentenceWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / Math.max(1, sentences.length);
    if (avgSentenceWords <= 10) score += 5;
    else if (avgSentenceWords > 15) {
        score -= 5;
        issues.push(`sentences too long (avg ${Math.round(avgSentenceWords)} words) — break them up`);
    }

    // Duration appropriateness
    if (script.estimatedDurationSec) {
        if (script.estimatedDurationSec >= 15 && script.estimatedDurationSec <= 60) score += 5;
        else if (script.estimatedDurationSec > 90) {
            score -= 10;
            issues.push('too long for short-form — consider trimming');
        }
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        issues,
        stats: {
            wordCount: words.length,
            sentenceCount: sentences.length,
            avgSentenceWords: Math.round(avgSentenceWords),
            numbersCount,
            estimatedDurationSec: script.estimatedDurationSec
        }
    };
}

module.exports = {
    estimateDuration,
    countFacts,
    evaluateRetentionPotential,
    DURATION_DEFAULTS,
    PLATFORM_DEFAULTS
};
