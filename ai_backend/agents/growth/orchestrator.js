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

// New enhancement engines
const aiVisualEngine = require('./ai_visual_engine');
const layoutEngine = require('./layout_engine');
const deadlineEngine = require('./deadline_engine');
const faqEngine = require('./faq_engine');
const mobileQualityGate = require('./mobile_quality_gate');
const contentAngleEngine = require('./content_angle_engine');
const visualFatiguePrevention = require('./visual_fatigue_prevention');
const ctaEngine = require('./cta_engine');
const motionEngine = require('./motion_engine');
const costControlEngine = require('./cost_control_engine');
const contentSimilarityDetector = require('./content_similarity_detector');

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
        // NEW: Check content similarity to prevent duplicates
        if (flags.isEnabled('CONTENT_SIMILARITY_ENABLED') && db) {
            const recentContent = await getRecentContent(db, content.category, 10);
            const similarityCheck = contentSimilarityDetector.isTooSimilar(content, recentContent, {
                similarityThreshold: 0.75
            });
            
            if (similarityCheck.isTooSimilar) {
                log.stage('too_similar', { 
                    highestSimilarity: similarityCheck.highestSimilarity,
                    suggestions: similarityCheck.similarContent[0]?.breakdown
                });
                return { 
                    processed: false, 
                    reason: 'Content too similar to recent content',
                    similarity: similarityCheck
                };
            }
        }

        // NEW: Deadline intelligence
        let deadlineInfo = null;
        if (flags.isEnabled('DEADLINE_ENGINE_ENABLED') && content.lastDate) {
            deadlineInfo = deadlineEngine.calculateUrgency(content.lastDate);
            log.stage('deadline_calculated', { 
                state: deadlineInfo.state,
                daysLeft: deadlineInfo.daysLeft
            });
        }

        // NEW: FAQ opportunity detection
        let faqOpportunity = null;
        if (flags.isEnabled('FAQ_ENGINE_ENABLED')) {
            faqOpportunity = faqEngine.selectBestFAQ(content, opts.previouslyPublished || []);
            if (faqOpportunity.selected) {
                log.stage('faq_opportunity', { 
                    topic: faqOpportunity.faq.topic,
                    score: faqOpportunity.opportunityScore
                });
            }
        }

        // NEW: Content angle selection
        let contentAngle = null;
        if (flags.isEnabled('CONTENT_ANGLE_ENGINE_ENABLED')) {
            contentAngle = contentAngleEngine.selectBestAngle(
                content, 
                opts.recentAngles || [],
                opts.performanceData || null
            );
            log.stage('content_angle_selected', { 
                angle: contentAngle.key,
                name: contentAngle.name
            });
        }

        // NEW: Visual fatigue prevention
        let visualDiversity = null;
        if (flags.isEnabled('VISUAL_FATIGUE_PREVENTION_ENABLED') && db) {
            const recentVisuals = await visualFatiguePrevention.getRecentVisualHistory(db, { limit: 10 });
            const proposedVisual = {
                visualStyle: content.visualStyle || 'editorial',
                layout: content.layout || 'LAYOUT_A',
                presenter: content.presenter || 'presenter_1',
                hookType: content.hookType || 'urgency',
                contentAngle: contentAngle?.key || 'basic_alert'
            };
            visualDiversity = visualFatiguePrevention.calculateDiversityScore(proposedVisual, recentVisuals);
            log.stage('visual_diversity', { score: visualDiversity.score });
        }

        // NEW: AI Visual generation (with cost control)
        let aiVisual = null;
        if (flags.isEnabled('AI_VISUAL_ENABLED')) {
            const costCheck = await costControlEngine.checkImageGenerationAllowed(db, {
                budgetTier: opts.budgetTier || 'free',
                jobId: opts.contentId
            });
            
            if (costCheck.allowed) {
                // Check cache first
                const imagePrompt = aiVisualEngine.generatePrompt(content, {
                    placement: content.presenterPlacement || 'bottom'
                });
                const imageFingerprint = aiVisualEngine.hashString(imagePrompt);
                
                const cacheCheck = await costControlEngine.checkImageCache(db, imageFingerprint, {
                    budgetTier: opts.budgetTier || 'free'
                });
                
                if (cacheCheck.cached) {
                    aiVisual = { path: cacheCheck.path, cached: true };
                    log.stage('ai_visual_cached', { path: aiVisual.path });
                } else {
                    // Generate new image
                    const tempImagePath = aiVisualEngine.getTempImagePath(opts.contentId);
                    const imageResult = await aiVisualEngine.generateImage(imagePrompt, {
                        outputPath: tempImagePath,
                        timeout: 30000
                    });
                    
                    if (imageResult.success) {
                        aiVisual = imageResult;
                        await costControlEngine.storeImageInCache(db, imageFingerprint, imageResult.path, {
                            provider: imageResult.provider
                        });
                        await costControlEngine.logImageGeneration(db, {
                            jobId: opts.contentId,
                            provider: imageResult.provider,
                            success: true
                        });
                        log.stage('ai_visual_generated', { 
                            provider: imageResult.provider,
                            size: imageResult.size
                        });
                    } else {
                        log.stage('ai_visual_failed', { error: imageResult.error });
                    }
                }
            } else {
                log.stage('ai_visual_blocked', { reason: costCheck.reason });
            }
        }

        // NEW: Dynamic layout selection
        let layout = null;
        if (flags.isEnabled('DYNAMIC_LAYOUT_ENABLED')) {
            layout = layoutEngine.selectLayout(
                content,
                opts.recentLayouts || [],
                opts.performanceData || null
            );
            log.stage('layout_selected', { 
                layout: layout.key,
                name: layout.name
            });
        }

        // NEW: Motion profile selection
        let motionProfile = null;
        if (flags.isEnabled('MOTION_ENGINE_ENABLED') && aiVisual) {
            motionProfile = motionEngine.getMotionRecommendation({
                contentType: content.type || 'JOB',
                hasAIImage: true,
                textDensity: content.textDensity || 'medium',
                urgencyLevel: deadlineInfo?.urgencyLevel >= 7 ? 'high' : 'medium'
            });
            log.stage('motion_selected', { 
                profile: motionProfile.profile.name,
                intensity: motionProfile.intensity
            });
        }

        // Generate full recommendation with enhancements
        const recommendation = await generateRecommendation(content, {
            ...opts,
            db,
            contentId: opts.contentId,
            // Pass new data to recommendation engine
            deadlineInfo,
            faqOpportunity: faqOpportunity?.selected ? faqOpportunity.faq : null,
            contentAngle,
            aiVisual,
            layout,
            motionProfile
        });

        if (!recommendation.recommended) {
            log.stage('not_recommended', { reason: recommendation.reason });
            return { processed: false, reason: recommendation.reason, recommendation };
        }

        // NEW: Generate context-aware CTA
        let cta = null;
        if (flags.isEnabled('CTA_ENGINE_ENABLED')) {
            cta = ctaEngine.generateVideoCTAs({
                contentType: content.type || 'JOB',
                contentAngle: contentAngle?.key || 'basic_alert',
                urgencyLevel: deadlineInfo?.state === 'TODAY' || deadlineInfo?.state === 'TOMORROW' ? 'high' : 'medium',
                jobData: content
            });
            log.stage('cta_generated', { 
                opening: cta.opening,
                closing: cta.closing?.key
            });
        }

        // NEW: Mobile quality validation
        if (flags.isEnabled('MOBILE_QUALITY_GATE_ENABLED')) {
            const composition = {
                text: recommendation.script?.script || '',
                layout: layout || recommendation.layout,
                presenterZone: layout?.presenterZone,
                infoZone: layout?.infoZone,
                subtitleZone: recommendation.subtitleZone,
                firstFrameZone: recommendation.firstFrameZone
            };
            
            const qualityCheck = mobileQualityGate.performMobileQualityCheck(composition);
            
            if (!qualityCheck.passed) {
                log.stage('mobile_quality_failed', { 
                    issues: qualityCheck.issues,
                    score: qualityCheck.score
                });
                
                // Try to fix
                const fixAttempt = mobileQualityGate.attemptQualityFix(composition, qualityCheck.issues);
                log.stage('quality_fix_attempt', { 
                    issuesFixed: fixAttempt.issuesFixed,
                    remaining: fixAttempt.remainingIssues
                });
            } else {
                log.stage('mobile_quality_passed', { score: qualityCheck.score });
            }
        }

        log.stage('recommended', {
            contentScore: recommendation.contentScore,
            hook: recommendation.hook?.hookType,
            duration: recommendation.duration,
            breaking: recommendation.breaking,
            contentAngle: contentAngle?.key,
            layout: layout?.key,
            hasAIVisual: !!aiVisual,
            deadlineState: deadlineInfo?.state
        });

        // Store opportunity with enhanced data
        if (db) {
            await storeOpportunity(db, {
                ...recommendation,
                contentId: opts.contentId,
                // NEW fields
                contentAngle: contentAngle?.key,
                layout: layout?.key,
                visualDiversityScore: visualDiversity?.score,
                deadlineState: deadlineInfo?.state,
                faqTopic: faqOpportunity?.selected ? faqOpportunity.faq.topic : null,
                aiVisualProvider: aiVisual?.provider,
                motionProfile: motionProfile?.profile?.name,
                ctaKey: cta?.closing?.key
            });
        }

        log.stage('complete', {
            contentScore: recommendation.contentScore,
            reachPrediction: recommendation.reachPrediction,
            hookType: recommendation.hook?.hookType,
            contentAngle: contentAngle?.key,
            layout: layout?.key,
            hasAIVisual: !!aiVisual,
            deadlineState: deadlineInfo?.state
        });

        return {
            processed: true,
            recommendation,
            runId,
            // NEW return data
            enhancements: {
                contentAngle,
                layout,
                deadlineInfo,
                faqOpportunity: faqOpportunity?.selected ? faqOpportunity.faq : null,
                aiVisual,
                motionProfile,
                cta,
                visualDiversity
            }
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

/**
 * Get recent content for similarity checking
 */
async function getRecentContent(db, category, limit = 10) {
    if (!db) {
        return [];
    }
    
    try {
        const collection = 'content_opportunities';
        const snapshot = await db.collection(collection)
            .where('category', '==', category)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        return snapshot.docs.map(doc => doc.data());
    } catch (err) {
        console.log(`️ Failed to fetch recent content: ${err.message || err}`);
        return [];
    }
}

// Re-export all modules for convenience
module.exports = {
    processContent,
    generateRecommendation,
    computeContentScore,
    getRecentContent,
    
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
