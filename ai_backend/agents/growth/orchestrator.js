'use strict';

/**
 * growth/orchestrator.js — Growth Engine Orchestrator (Phase 50)
 * 
 * Main entry point for the growth engine. Integrates all phases into
 * a unified pipeline that the video dispatcher can call.
 * 
 * Flow:
 *   CONTENT → OPPORTUNITY → QUALITY → HOOK → SCRIPT → SCORE → VIDEO PLAN → RENDER → DISTRIBUTION → ANALYTICS → LEARNING
 */

const flags = require('./feature_flags');
const { detectOpportunity, storeOpportunity } = require('./opportunity_engine');
const { generateHooks } = require('./hook_engine');
const { buildScript } = require('./script_engine');
const { checkQualityGate } = require('./quality_gate');
const { estimateDuration, evaluateRetentionPotential } = require('./retention_engine');
const { selectStyle, selectAnchor, APPROVED_ANCHORS } = require('./visual_engine');
const { selectPresenter } = require('./presenter_rotation');
const { generateFirstFrame } = require('./first_frame_engine');
const { selectMusic } = require('./music_engine');
const { generatePlatformPackage } = require('./platform_packaging');
const { isBreaking, getDispatchPriority } = require('./breaking_mode');
const { checkDuplicate, storeFingerprint } = require('./content_fingerprint');
const { predictReach } = require('./reach_predictor');
const { generateRecommendation, computeContentScore } = require('./recommendation_engine');
const { generateMutations } = require('./content_mutation');
const { classifyComment, extractOpportunitiesFromComments } = require('./comment_intelligence');
const { createRunLogger } = require('./logger');

async function processContent(content, opts = {}) {
    const runId = opts.runId || `growth-${Date.now()}`;
    const log = createRunLogger(runId);
    const db = opts.db || null;

    log.stage('start', { contentId: opts.contentId, type: content.type });

    if (!flags.isEnabled('GROWTH_ENGINE_ENABLED')) {
        log.stage('disabled', { reason: 'growth engine disabled' });
        return { processed: false, reason: 'growth engine disabled' };
    }

    try {
        // Generate full recommendation
        const recommendation = await generateRecommendation(content, {
            ...opts,
            db,
            contentId: opts.contentId
        });

        if (!recommendation.recommended) {
            log.stage('not_recommended', { reason: recommendation.reason });
            return { processed: false, reason: recommendation.reason, recommendation };
        }

        log.stage('recommended', {
            contentScore: recommendation.contentScore,
            hook: recommendation.hook?.hookType,
            duration: recommendation.duration,
            breaking: recommendation.breaking
        });

        // Store opportunity
        if (db) {
            await storeOpportunity(db, {
                ...recommendation,
                contentId: opts.contentId
            });
        }

        log.stage('complete', {
            contentScore: recommendation.contentScore,
            reachPrediction: recommendation.reachPrediction,
            hookType: recommendation.hook?.hookType
        });

        return {
            processed: true,
            recommendation,
            runId
        };
    } catch (err) {
        log.error('process', err);
        return {
            processed: false,
            error: true,
            reason: err.message || 'growth processing failed'
        };
    }
}

// Re-export all modules for convenience
module.exports = {
    processContent,
    generateRecommendation,
    computeContentScore,
    
    // Sub-modules
    opportunity: require('./opportunity_engine'),
    hooks: require('./hook_engine'),
    script: require('./script_engine'),
    quality: require('./quality_gate'),
    retention: require('./retention_engine'),
    visual: require('./visual_engine'),
    presenter: require('./presenter_rotation'),
    firstFrame: require('./first_frame_engine'),
    music: require('./music_engine'),
    fingerprint: require('./content_fingerprint'),
    breaking: require('./breaking_mode'),
    packaging: require('./platform_packaging'),
    reach: require('./reach_predictor'),
    mutation: require('./content_mutation'),
    comments: require('./comment_intelligence'),
    trend: require('./trend_detector'),
    flags: require('./feature_flags'),
    logger: require('./logger'),
    
    // Analytics
    analytics: {
        collector: require('./analytics/collector'),
        normalizer: require('./analytics/normalizer'),
        scorer: require('./analytics/scorer'),
        learner: require('./analytics/learner')
    },

    // Constants
    APPROVED_ANCHORS
};
