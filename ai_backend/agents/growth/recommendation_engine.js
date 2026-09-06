'use strict';

/**
 * recommendation_engine.js — Central Decision Engine (Phase 31)
 * 
 * Before creating every video, chooses:
 * topic, hook, script style, presenter, visual style, duration,
 * music, subtitle style, platform, publish time
 * 
 * Based on: historical learning, current opportunity, platform, category
 */

const { detectOpportunity } = require('./opportunity_engine');
const { generateHooks, scoreHook } = require('./hook_engine');
const { buildScript } = require('./script_engine');
const { checkQualityGate } = require('./quality_gate');
const { estimateDuration, evaluateRetentionPotential } = require('./retention_engine');
const { selectStyle, selectAnchor } = require('./visual_engine');
const { selectPresenter } = require('./presenter_rotation');
const { generateFirstFrame } = require('./first_frame_engine');
const { selectMusic } = require('./music_engine');
const { predictReach } = require('./reach_predictor');
const { generatePlatformPackage } = require('./platform_packaging');
const { isBreaking, getDispatchPriority } = require('./breaking_mode');
const { checkDuplicate, storeFingerprint } = require('./content_fingerprint');
const flags = require('./feature_flags');

async function generateRecommendation(content, opts = {}) {
    if (!flags.isEnabled('RECOMMENDATION_ENGINE_ENABLED')) {
        return { recommended: false, reason: 'recommendation engine disabled' };
    }

    const db = opts.db || null;
    const platform = opts.platform || 'youtube';

    // 🧠 LEARNING FEEDBACK: Read historical insights to influence recommendation
    let historicalInsights = null;
    if (db && flags.isEnabled('LEARNER_ENABLED')) {
        try {
            const learner = require('./analytics/learner');
            const insightSnap = await db.collection('growth_insights').doc('latest').get();
            if (insightSnap.exists) {
                historicalInsights = insightSnap.data();
            }
        } catch { /* ignore — learning is optional */ }
    }

    // Step 1: Duplicate check
    const dupCheck = flags.isEnabled('DUPLICATE_DETECTION_ENABLED')
        ? await checkDuplicate(db, content)
        : { duplicate: false, type: 'NEW_CONTENT' };

    if (dupCheck.duplicate && dupCheck.type === 'EXACT_DUPLICATE') {
        return { recommended: false, reason: 'exact duplicate detected', duplicate: dupCheck };
    }

    // Step 2: Opportunity detection
    const opportunity = await detectOpportunity(content, opts);
    if (!opportunity.detected) {
        return { recommended: false, reason: opportunity.reason || 'no opportunity detected' };
    }

    // Step 3: Quality gate
    const quality = checkQualityGate(content);
    if (quality.status === 'quality_failed') {
        return { recommended: false, reason: 'quality gate failed', quality };
    }

    // Step 4: Hook generation & scoring — with learning feedback
    // Use historical insights to boost winning hook types (80/20 explore/exploit)
    let effectiveHookTypes = opportunity.recommendedHookTypes;
    let learningUsed = false;
    if (historicalInsights && historicalInsights.patterns) {
        const hookPattern = historicalInsights.patterns.find(p => p.patternType === 'HOOK');
        if (hookPattern && hookPattern.confidence >= 0.6 && hookPattern.sampleSize >= 5) {
            // 80% exploitation: put the winning hook type first
            if (Math.random() < 0.8) {
                effectiveHookTypes = [hookPattern.winningPattern, ...opportunity.recommendedHookTypes.filter(t => t !== hookPattern.winningPattern)];
                learningUsed = true;
            }
            // 20% exploration: use default ordering (already set above)
        }
    }

    const hookResult = generateHooks(content, {
        hookTypes: effectiveHookTypes,
        contentId: opts.contentId || ''
    });

    // Step 5: Duration estimation
    const duration = estimateDuration(content, opportunity, {
        platform,
        historicalDuration: opts.historicalDuration
    });

    // Step 6: Script generation
    const script = buildScript(opportunity, hookResult.bestHook, content, opts);

    // Step 7: Retention evaluation
    const retention = evaluateRetentionPotential(script);

    // Step 8: Visual style
    const visualStyle = selectStyle(content, opportunity, opts);

    // Step 9: Presenter selection
    const presenter = selectPresenter(content, opportunity, {
        visualStyle,
        performanceData: opts.performanceData
    });

    // Step 10: First frame
    const firstFrame = generateFirstFrame(content, opportunity);

    // Step 11: Music
    const music = selectMusic(visualStyle, opts);

    // Step 12: Reach prediction
    const reach = predictReach(content, opportunity, {
        hookScore: hookResult.bestHook?.hookScore?.total || 50,
        retentionScore: retention.score / 100,
        platform,
        hasHistoricalData: !!opts.performanceData
    });

    // Step 13: Platform packaging
    const platformPackage = generatePlatformPackage(content, opportunity, {
        hookText: hookResult.bestHook?.hookText
    });

    // Step 14: Content quality score (Phase 30)
    const contentScore = computeContentScore({
        quality: quality.score,
        hookQuality: hookResult.bestHook?.hookScore?.total || 0,
        retentionScore: retention.score,
        reachScore: reach.reachPredictionScore,
        visualFit: visualStyle.styleName ? 80 : 50,
        infoDensity: retention.stats ? Math.min(100, (retention.stats.numbersCount / Math.max(1, retention.stats.wordCount / 10)) * 100) : 50
    });

    // Step 15: Dispatch priority
    const dispatchPriority = getDispatchPriority({ data: content, kind: content.type || 'JOB' });

    // Step 16: Breaking mode check
    const breaking = isBreaking(content, opportunity);

    // Store fingerprint if not duplicate
    if (db && dupCheck.type !== 'EXACT_DUPLICATE') {
        await storeFingerprint(db, content, opts.contentId || dupCheck.fingerprint.hash);
    }

    const recommendation = {
        recommended: contentScore >= 40,
        contentId: opts.contentId || '',
        topic: content.title || content.topic || '',
        category: opportunity.category,
        breaking,
        contentScore,
        hook: hookResult.bestHook,
        hookAlternatives: hookResult.hooks.slice(0, 5),
        script,
        duration: duration.duration,
        visualStyle: visualStyle.styleName,
        presenter: presenter.anchor,
        firstFrame: firstFrame.bestFrame,
        music: music.musicFile,
        reachPrediction: reach.reachPredictionScore,
        qualityScore: quality.score,
        qualityStatus: quality.status,
        retentionScore: retention.score,
        platformPackage,
        dispatchPriority: dispatchPriority.priority,
        opportunityScore: opportunity.opportunityScore,
        duplicateCheck: dupCheck.type,
        learningUsed,
        historicalInsights: historicalInsights ? {
            patternsCount: (historicalInsights.patterns || []).length,
            analyzedAt: historicalInsights.analyzedAt
        } : null,
        generatedAt: Date.now()
    };

    return recommendation;
}

function computeContentScore(dimensions) {
    const weights = {
        quality: 0.20,
        hookQuality: 0.25,
        retentionScore: 0.20,
        reachScore: 0.15,
        visualFit: 0.10,
        infoDensity: 0.10
    };

    let total = 0;
    let weightSum = 0;
    for (const [key, weight] of Object.entries(weights)) {
        const value = dimensions[key] || 0;
        total += value * weight;
        weightSum += weight;
    }

    return weightSum > 0 ? Math.round(total / weightSum) : 0;
}

module.exports = {
    generateRecommendation,
    computeContentScore
};
