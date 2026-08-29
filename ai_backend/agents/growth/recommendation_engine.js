'use strict';

/**
 * recommendation_engine.js — Central Decision Engine (Phase 31 + Growth Self-Learning Phases 4-6)
 *
 * Before creating every video, chooses:
 * topic, hook, script style, presenter, visual style, duration,
 * music, subtitle style, platform, publish time
 *
 * Based on: the PERSISTED LEARNED POLICY (growth_policies/latest), the
 * current opportunity, platform and category.
 *
 * 🧠 CLOSED LOOP (Growth Self-Learning):
 *   The learner (analytics/learner.js) converts attributed performance
 *   data into patterns → learning/policy_store.js persists them as a
 *   policy → THIS ENGINE consumes that policy and demonstrably changes
 *   the video configuration:
 *
 *     hook        → learned winner receives a bounded score boost so the
 *                   FINAL selected hook (after scoring/sorting) changes
 *     duration    → learned target seconds are blended into the duration
 *                   estimate that drives script/TTS length
 *     presenter   → learned winner anchor is used by the renderer
 *     visualStyle → learned winner style profile is used
 *     music       → learned winner track is used
 *     cta         → learned winner closing CTA (orchestrator)
 *     contentAngle→ learned winner angle (orchestrator)
 *     postTime    → learned but NOT applied (upload flow is immediate;
 *                   scheduled publishing is not implemented — never faked)
 *
 * Every decision is recorded in `recommendation.learning` with the exact
 * mode (exploit / explore / none), confidence, sample size, the value that
 * WOULD have been chosen without learning, and whether the selection
 * actually changed. No learning is ever claimed without a real effect.
 */

const { detectOpportunity } = require('./opportunity_engine');
const { generateHooks, scoreHook } = require('./hook_engine');
const { buildScript } = require('./script_engine');
const { checkQualityGate } = require('./quality_gate');
const { estimateDuration, evaluateRetentionPotential } = require('./retention_engine');
const { selectStyle, selectAnchor, STYLE_PROFILES } = require('./visual_engine');
const { selectPresenter, PRESENTERS } = require('./presenter_rotation');
const { generateFirstFrame } = require('./first_frame_engine');
const { selectMusic, AVAILABLE_MUSIC } = require('./music_engine');
const { predictReach } = require('./reach_predictor');
const { generatePlatformPackage } = require('./platform_packaging');
const { isBreaking, getDispatchPriority } = require('./breaking_mode');
const { checkDuplicate, storeFingerprint } = require('./content_fingerprint');
const flags = require('./feature_flags');
const policyStore = require('./learning/policy_store');

// Learning must have measurable but bounded influence on hook ranking:
// the winner-type boost can never exceed 80% (0.8) of the max hook score.
const HOOK_BOOST_CAP = Math.round(100 * 0.8);
// Exploration support for non-winner hooks (small, so exploration stays
// honest: a much weaker hook still cannot beat a strong winner).
const HOOK_EXPLORE_SUPPORT = 5;

async function generateRecommendation(content, opts = {}) {
    if (!flags.isEnabled('RECOMMENDATION_ENGINE_ENABLED')) {
        return { recommended: false, reason: 'recommendation engine disabled' };
    }

    const db = opts.db || null;
    const platform = opts.platform || 'youtube';
    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const now = opts.now || Date.now();

    // 🧠 LEARNING FEEDBACK — load the persisted learned policy (the APPLY
    // half of the closed loop). The orchestrator may pre-load and pass it.
    let learnedPolicy = opts.learnedPolicy !== undefined ? opts.learnedPolicy : null;
    if (learnedPolicy === null && db && flags.isEnabled('LEARNER_ENABLED') && flags.isEnabled('APPLY_LEARNED_POLICY')) {
        learnedPolicy = await policyStore.loadPolicy(db).catch(() => null);
    }
    const policyActive = !!(learnedPolicy && learnedPolicy.platforms);

    // Legacy reporting artifact: growth_insights/latest still read for the
    // insights summary (the APPLIED artifact is the policy above).
    let historicalInsights = null;
    if (db && flags.isEnabled('LEARNER_ENABLED')) {
        try {
            const insightSnap = await db.collection('growth_insights').doc('latest').get();
            if (insightSnap.exists) {
                historicalInsights = insightSnap.data();
            }
        } catch { /* ignore — learning is optional */ }
    }

    const policyOpts = { policy: learnedPolicy, platform, rng, now };

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

    // Step 4: Hook generation & scoring — with LEARNED POLICY influence.
    // The learned winner is added to the generation list (if missing) so the
    // policy can genuinely compete; template/intent safety filtering still
    // applies inside generateHooks.
    let effectiveHookTypes = opportunity.recommendedHookTypes;
    const hookPolicyDim = policyStore.getDimension(learnedPolicy, platform, 'hook');
    if (hookPolicyDim && hookPolicyDim.winningPattern && !effectiveHookTypes.includes(hookPolicyDim.winningPattern)) {
        effectiveHookTypes = [hookPolicyDim.winningPattern, ...effectiveHookTypes];
    }

    const hookResult = generateHooks(content, {
        hookTypes: effectiveHookTypes,
        contentId: opts.contentId || ''
    });

    // Decision is made over the hook types that ACTUALLY got generated —
    // a learned winner with no template for this intent cannot be forced.
    const generatedHookTypes = [...new Set(hookResult.hooks.map((h) => h.hookType))];
    const hookDecision = policyStore.decide('hook', { ...policyOpts, candidates: generatedHookTypes });

    // Default selection (pure static scores — what would happen with no
    // learning). Kept for honest before/after comparison.
    const defaultBestHook = hookResult.bestHook || null;

    // Apply the learning influence to hook ranking: exploit boosts the
    // winner type; explore suppresses it and slightly supports the rest.
    let adjustedHooks = hookResult.hooks;
    let chosenHook = defaultBestHook;
    if (hookDecision.mode !== 'none' && hookDecision.winner && adjustedHooks.length > 0) {
        const boost = Math.min(HOOK_BOOST_CAP, 5 + Math.round(15 * (hookDecision.confidence || 0)));
        adjustedHooks = adjustedHooks.map((h) => {
            const isWinner = h.hookType === hookDecision.winner;
            let learningBoost = 0;
            if (hookDecision.mode === 'exploit' && isWinner) learningBoost = boost;
            else if (hookDecision.mode === 'explore') learningBoost = isWinner ? -boost : HOOK_EXPLORE_SUPPORT;
            return {
                ...h,
                hookScore: { ...h.hookScore, learningBoost, adjustedTotal: (h.hookScore.total || 0) + learningBoost }
            };
        });
        adjustedHooks.sort((a, b) => (b.hookScore.adjustedTotal || 0) - (a.hookScore.adjustedTotal || 0));
        chosenHook = adjustedHooks[0] || defaultBestHook;
    }

    // Step 5: Duration estimation — learned DURATION target blended in.
    // exploit → learned target seconds dominate (60%); explore → the
    // content-driven estimate IS the explored alternative.
    const durationDecision = policyStore.decide('duration', policyOpts);
    const learnedTargetSeconds = durationDecision.mode === 'exploit' && durationDecision.targetSeconds
        ? durationDecision.targetSeconds
        : null;
    const baseDuration = estimateDuration(content, opportunity, {
        platform,
        historicalDuration: opts.historicalDuration
    });
    const duration = learnedTargetSeconds
        ? estimateDuration(content, opportunity, {
            platform,
            historicalDuration: opts.historicalDuration,
            learnedTargetSeconds
        })
        : baseDuration;

    // Step 6: Script generation (hook text enters the spoken script — the
    // learned hook choice therefore changes the actual video audio). The
    // duration target (learned-policy blended when active) shapes the
    // script's word budget before rendering.
    const script = buildScript(opportunity, chosenHook, content, {
        ...opts,
        targetDurationSeconds: duration.duration
    });

    // Step 7: Retention evaluation
    const retention = evaluateRetentionPotential(script);

    // Step 8: Visual style — learned VISUAL_STYLE winner overrides the
    // category default (hard safety rules still win inside the engine).
    const styleCandidates = Object.keys(STYLE_PROFILES);
    const styleDecision = policyStore.decide('visualStyle', { ...policyOpts, candidates: styleCandidates });
    const defaultStyle = selectStyle(content, opportunity, opts);
    const visualStyle = styleDecision.mode !== 'none'
        ? selectStyle(content, opportunity, { ...opts, policyDecision: styleDecision })
        : defaultStyle;

    // Step 9: Presenter selection — learned PRESENTER winner (fallback to
    // deterministic rotation without learning).
    const presenterCandidates = Object.keys(PRESENTERS);
    const presenterDecision = policyStore.decide('presenter', { ...policyOpts, candidates: presenterCandidates });
    const defaultPresenter = selectPresenter(content, opportunity, { visualStyle, performanceData: opts.performanceData });
    const presenter = presenterDecision.mode !== 'none'
        ? selectPresenter(content, opportunity, { visualStyle, performanceData: opts.performanceData, policyDecision: presenterDecision })
        : defaultPresenter;

    // Step 10: First frame
    const firstFrame = generateFirstFrame(content, opportunity);

    // Step 11: Music — learned MUSIC winner (real file required).
    const musicCandidates = Object.keys(AVAILABLE_MUSIC);
    const musicDecision = policyStore.decide('music', { ...policyOpts, candidates: musicCandidates });
    const defaultMusic = selectMusic(visualStyle, opts);
    const music = musicDecision.mode !== 'none'
        ? selectMusic(visualStyle, { ...opts, policyDecision: musicDecision })
        : defaultMusic;

    // Step 12: Reach prediction
    const reach = predictReach(content, opportunity, {
        hookScore: chosenHook?.hookScore?.total || 50,
        retentionScore: retention.score / 100,
        platform,
        hasHistoricalData: !!opts.performanceData
    });

    // Step 13: Platform packaging
    const platformPackage = generatePlatformPackage(content, opportunity, {
        hookText: chosenHook?.hookText
    });

    // Step 14: Content quality score (Phase 30)
    const contentScore = computeContentScore({
        quality: quality.score,
        hookQuality: chosenHook?.hookScore?.total || 0,
        retentionScore: retention.score,
        reachScore: reach.reachPredictionScore,
        visualFit: visualStyle.styleName ? 80 : 50,
        infoDensity: retention.stats ? Math.min(100, (retention.stats.numbersCount / Math.max(1, retention.stats.wordCount / 10)) * 100) : 50
    });

    // Step 15: Dispatch priority
    const dispatchPriority = getDispatchPriority({ data: content, kind: content.type || 'JOB' });

    // Step 16: Breaking mode check
    const breaking = isBreaking(content, opportunity);

    // POST_TIME: learnable, but the current upload flow publishes
    // immediately — scheduled publishing is NOT implemented. Represent the
    // learned policy honestly and mark it NOT applied (never fake it).
    const postTimeDecision = policyStore.decide('postTime', policyOpts);
    postTimeDecision.applied = false;
    postTimeDecision.appliedReason = 'upload flow publishes immediately — scheduled publishing not implemented';

    // ─── Learning observability (Phase 15) ───
    const decisions = {
        hook: {
            ...hookDecision,
            value: chosenHook ? chosenHook.hookType : null,
            defaultWouldBe: defaultBestHook ? defaultBestHook.hookType : null,
            changedSelection: !!(chosenHook && defaultBestHook && chosenHook.hookType !== defaultBestHook.hookType),
            learningBoost: chosenHook?.hookScore?.learningBoost || 0
        },
        duration: {
            ...durationDecision,
            value: duration.duration,
            targetSeconds: learnedTargetSeconds,
            defaultWouldBe: baseDuration.duration,
            changedSelection: duration.duration !== baseDuration.duration
        },
        presenter: {
            ...presenterDecision,
            value: presenterDecision.mode !== 'none' ? presenter.anchor : null,
            defaultWouldBe: defaultPresenter.anchor,
            changedSelection: !!(presenterDecision.mode !== 'none' && presenter.anchor !== defaultPresenter.anchor)
        },
        visualStyle: {
            ...styleDecision,
            value: styleDecision.mode !== 'none' ? visualStyle.styleName : null,
            defaultWouldBe: defaultStyle.styleName,
            changedSelection: !!(styleDecision.mode !== 'none' && visualStyle.styleName !== defaultStyle.styleName)
        },
        music: {
            ...musicDecision,
            value: musicDecision.mode !== 'none' ? (music.musicId || music.musicFile) : null,
            defaultWouldBe: defaultMusic.musicId || defaultMusic.musicFile,
            changedSelection: !!(musicDecision.mode !== 'none'
                && (music.musicId || music.musicFile) !== (defaultMusic.musicId || defaultMusic.musicFile))
        },
        postTime: postTimeDecision
    };

    // contentAngle + cta decisions are made by the orchestrator (they need
    // engine data not available here); it merges them into this object.
    const dimensionsApplied = Object.entries(decisions)
        .filter(([dim, d]) => dim !== 'postTime' && d.mode && d.mode !== 'none' && d.applied !== false)
        .map(([dim]) => dim);

    const learning = {
        used: dimensionsApplied.length > 0,
        policyVersion: learnedPolicy ? learnedPolicy.version : null,
        platform,
        dimensionsApplied,
        decisions,
        exploration: Object.values(decisions).some((d) => d.mode === 'explore'),
        policyActive,
        insightsAnalyzedAt: historicalInsights ? historicalInsights.analyzedAt : null
    };

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
        hook: chosenHook,
        hookAlternatives: adjustedHooks.slice(0, 5),
        script,
        duration: duration.duration,
        durationSource: learnedTargetSeconds ? 'learned-policy' : 'content-estimate',
        visualStyle: visualStyle.styleName,
        presenter: presenter.anchor,
        firstFrame: firstFrame.bestFrame,
        music: music.musicFile,
        musicId: music.musicId || null,
        reachPrediction: reach.reachPredictionScore,
        qualityScore: quality.score,
        qualityStatus: quality.status,
        retentionScore: retention.score,
        platformPackage,
        dispatchPriority: dispatchPriority.priority,
        opportunityScore: opportunity.opportunityScore,
        duplicateCheck: dupCheck.type,
        learningUsed: learning.used,
        learning,
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
    computeContentScore,
    HOOK_BOOST_CAP
};
