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
const policyStore = require('./learning/policy_store');
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
const { detectContentIntent } = require('./content_intent');

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
        // 🧠 LEARNED POLICY: load the persisted policy once (the APPLY half
        // of the closed loop). Best-effort — generation never depends on it.
        const learnedPolicy = (db && flags.isEnabled('LEARNER_ENABLED') && flags.isEnabled('APPLY_LEARNED_POLICY'))
            ? await policyStore.loadPolicy(db).catch(() => null)
            : null;
        const platform = opts.platform || 'youtube';
        const policyOpts = {
            policy: learnedPolicy,
            platform,
            rng: typeof opts.rng === 'function' ? opts.rng : Math.random,
            now: opts.now || Date.now()
        };
        if (learnedPolicy) {
            log.stage('learned_policy_loaded', {
                version: learnedPolicy.version,
                platforms: Object.keys(learnedPolicy.platforms || {})
            });
        }
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

        // NEW: Content angle selection — with learned policy (Phase 11)
        let contentAngle = null;
        let angleDecision = null;
        if (flags.isEnabled('CONTENT_ANGLE_ENGINE_ENABLED')) {
            // Recent angles prevent fatigue; fetched from the last stored
            // opportunities so rotation works in production too.
            let recentAngles = Array.isArray(opts.recentAngles) ? opts.recentAngles : null;
            if (!recentAngles && db) {
                recentAngles = await getRecentAngles(db, 10).catch(() => []);
            }
            const angleCandidates = contentAngleEngine
                .identifyAvailableAngles(content)
                .map((a) => a.key);
            angleDecision = policyStore.decide('contentAngle', { ...policyOpts, candidates: angleCandidates });
            contentAngle = contentAngleEngine.selectBestAngle(
                content,
                recentAngles || [],
                opts.performanceData || null,
                { policyDecision: angleDecision }
            );
            log.stage('content_angle_selected', { 
                angle: contentAngle.key,
                name: contentAngle.name,
                learningMode: angleDecision.mode
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

        // NEW: AI Visual generation (with cost control + visual diversity plan)
        let aiVisual = null;
        let visualPlan = null;
        if (flags.isEnabled('AI_VISUAL_ENABLED')) {
            // Deterministic visual plan: fingerprint -> scene/subject/camera/
            // lighting/style/seed + recent-video diversity guard.
            const recentAiVisuals = await visualFatiguePrevention
                .getRecentAiVisualHistory(db, { limit: 20 })
                .catch(() => []);
            visualPlan = aiVisualEngine.buildVisualPlan(content, {
                placement: content.presenterPlacement || 'bottom',
                recentVisualHistory: recentAiVisuals,
                contentId: opts.contentId
            });
            const imageFingerprint = visualPlan.cacheKey;

            log.stage('ai_visual_plan', {
                scene: visualPlan.scene,
                seed: visualPlan.seed,
                variant: visualPlan.variant,
                combination: visualPlan.combinationKey
            });

            // STEP 1 — Fast path: validated stable-cache hit.
            // Within the same workflow run (and therefore the same GitHub
            // Actions runner) the stable-cache file still exists. Reusing it
            // costs nothing, so we bypass cost control entirely and do NOT
            // count this as a new generation.
            const stablePath = aiVisualEngine.getStableCachePath(opts.contentId, imageFingerprint);
            if (aiVisualEngine.isUsableImage(stablePath)) {
                aiVisual = { path: stablePath, visualSource: 'ai', cached: true, reused: true, generation: 'cache', applied: false };
                log.stage('ai_visual_cache_hit', { path: stablePath, reused: true, generation: 'cache', applied: false, visualSource: 'ai' });
                console.log(`visual_source=ai provider=cache seed=${visualPlan.seed} path=${stablePath}`);
            } else {
                // STEP 2 — No validated cache. Apply cost control, then run
                // the hardened visual chain (AI → local fallback → category
                // fallback → background → template). AI is optional; when the
                // budget blocks it we run the SAME chain with tryAi:false.
                const costCheck = await costControlEngine.checkImageGenerationAllowed(db, {
                    budgetTier: opts.budgetTier || 'free',
                    jobId: opts.contentId
                });

                if (!costCheck.allowed) {
                    log.stage('ai_visual_blocked', { reason: costCheck.reason, generation: 'skipped' });
                    const resolved = await aiVisualEngine.resolveVisualBackground(content, {
                        contentId: opts.contentId,
                        visualPlan,
                        tryAi: false,
                        httpClient: opts.aiVisualHttpClient,
                        localOutputPath: opts.aiVisualLocalOutputPath
                    });
                    aiVisual = {
                        success: false,
                        path: resolved.path || null,
                        visualSource: resolved.visualSource,
                        generation: 'skipped',
                        applied: false,
                        fallback: resolved.categoryFallback
                            ? resolved.categoryFallback.kind
                            : resolved.visualSource,
                        categoryVisual: resolved.categoryFallback || null,
                        localFallback: resolved.localFallback || null
                    };
                    log.stage(`ai_visual_${resolved.visualSource}`, {
                        visualSource: resolved.visualSource,
                        variant: resolved.categoryFallback?.variant ?? resolved.localFallback?.variant ?? null,
                        seed: resolved.seed,
                        path: resolved.path || null,
                        generation: 'skipped',
                        applied: false
                    });
                } else {
                    // Check Firestore cache for a cross-run record. It may
                    // point at a stale /tmp/ path — we will overwrite it with
                    // the stable path below after a successful generation.
                    const cacheCheck = await costControlEngine.checkImageCache(db, imageFingerprint, {
                        budgetTier: opts.budgetTier || 'free'
                    }).catch(() => ({ cached: false }));

                    if (cacheCheck?.cached && aiVisualEngine.isUsableImage(cacheCheck.path)) {
                        // Firestore pointed at a still-valid file (rare in
                        // GitHub Actions, but possible if the same runner
                        // processed two dispatcher runs in a row). Reuse it.
                        aiVisual = { path: cacheCheck.path, visualSource: 'ai', cached: true, reused: true, generation: 'cache', applied: false };
                        log.stage('ai_visual_firestore_cache_hit', { path: cacheCheck.path, generation: 'cache', visualSource: 'ai' });
                        console.log(`visual_source=ai provider=firestore-cache seed=${visualPlan.seed} path=${cacheCheck.path}`);
                    } else {
                        // STEP 3 — Full hardened chain: AI attempt (with the
                        // image acceptance gate), then deterministic local
                        // fallback, then category fallback, then the existing
                        // background/template layers. Never throws.
                        const resolved = await aiVisualEngine.resolveVisualBackground(content, {
                            contentId: opts.contentId,
                            visualPlan,
                            tryAi: true,
                            timeout: 30000,
                            maxAttempts: 2,
                            httpClient: opts.aiVisualHttpClient,
                            localOutputPath: opts.aiVisualLocalOutputPath
                        });

                        if (resolved.visualSource === 'ai') {
                            const imageResult = resolved.ai;
                            aiVisual = { ...imageResult, visualSource: 'ai', generation: 'success', applied: false };
                            // Update Firestore cache to point at the stable
                            // path so subsequent runs have the best chance
                            // of finding a usable file.
                            await costControlEngine.storeImageInCache(db, imageFingerprint, resolved.path, {
                                provider: imageResult.provider
                            }).catch(() => {});
                            await costControlEngine.logImageGeneration(db, {
                                jobId: opts.contentId,
                                provider: imageResult.provider,
                                success: true
                            });
                            // Record the visual combination so the next N
                            // videos can avoid an immediate duplicate.
                            await visualFatiguePrevention.logAiVisualUsage(db, {
                                contentId: opts.contentId,
                                category: content.category,
                                fingerprint: imageFingerprint,
                                combination: visualPlan.combinationKey,
                                scene: visualPlan.scene,
                                subject: visualPlan.subject,
                                camera: visualPlan.camera,
                                lighting: visualPlan.lighting,
                                style: visualPlan.style,
                                seed: visualPlan.seed,
                                variant: visualPlan.variant
                            }).catch(() => {});
                            log.stage('ai_visual_generated', {
                                provider: imageResult.provider,
                                size: imageResult.size,
                                path: resolved.path,
                                seed: visualPlan.seed,
                                generation: 'success',
                                applied: false,
                                visualSource: 'ai'
                            });
                        } else {
                            // AI failed (or produced an invalid file) — the
                            // chain already fell through to a guaranteed
                            // local/category/background/template layer. The
                            // pipeline continues normally with that layer.
                            log.stage('ai_visual_failed', {
                                error: resolved.aiFailure || 'AI attempt failed',
                                generation: 'failed',
                                visualSource: resolved.visualSource
                            });
                            aiVisual = {
                                success: false,
                                path: resolved.path || null,
                                visualSource: resolved.visualSource,
                                generation: 'failed',
                                applied: false,
                                fallback: resolved.categoryFallback
                                    ? resolved.categoryFallback.kind
                                    : resolved.visualSource,
                                categoryVisual: resolved.categoryFallback || null,
                                localFallback: resolved.localFallback || null
                            };
                            log.stage(`ai_visual_${resolved.visualSource}`, {
                                visualSource: resolved.visualSource,
                                variant: resolved.categoryFallback?.variant ?? resolved.localFallback?.variant ?? null,
                                seed: resolved.seed,
                                path: resolved.path || null,
                                generation: 'failed',
                                applied: false
                            });
                        }
                    }
                }
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
        if (flags.isEnabled('MOTION_ENGINE_ENABLED') && aiVisual?.path) {
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
            learnedPolicy,
            rng: policyOpts.rng,
            now: policyOpts.now,
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

        // NEW: Generate context-aware CTA — with learned policy (Phase 10)
        let cta = null;
        let ctaDecision = null;
        if (flags.isEnabled('CTA_ENGINE_ENABLED')) {
            ctaDecision = policyStore.decide('cta', policyOpts);
            cta = ctaEngine.generateVideoCTAs({
                contentType: detectContentIntent(content),
                contentAngle: contentAngle?.key || 'basic_alert',
                urgencyLevel: deadlineInfo?.state === 'TODAY' || deadlineInfo?.state === 'TOMORROW' ? 'high' : 'medium',
                jobData: content,
                policyDecision: ctaDecision
            });
            log.stage('cta_generated', { 
                opening: cta.opening,
                closing: cta.closing?.key,
                learningMode: cta?.closing?.learningUsed ? ctaDecision.mode : 'none'
            });
        }

        // 🧠 Merge the orchestrator-side decisions (cta, contentAngle) into
        // the learning observability object built by the recommendation
        // engine, then recompute the summary fields.
        if (recommendation.learning) {
            if (angleDecision) {
                recommendation.learning.decisions.contentAngle = {
                    ...angleDecision,
                    value: contentAngle?.key || null,
                    defaultWouldBe: null,
                    changedSelection: !!contentAngle?.learningUsed
                };
            }
            if (ctaDecision) {
                recommendation.learning.decisions.cta = {
                    ...ctaDecision,
                    value: cta?.closing?.learningUsed ? cta.closing.key : null,
                    defaultWouldBe: null,
                    changedSelection: !!cta?.closing?.learningUsed
                };
            }
            recommendation.learning.dimensionsApplied = Object.entries(recommendation.learning.decisions)
                .filter(([dim, d]) => dim !== 'postTime' && d && d.mode && d.mode !== 'none' && d.applied !== false)
                .map(([dim]) => dim);
            recommendation.learning.used = recommendation.learning.dimensionsApplied.length > 0;
            recommendation.learningUsed = recommendation.learning.used;
            recommendation.learning.exploration = Object.values(recommendation.learning.decisions)
                .some((d) => d && d.mode === 'explore');

            log.stage('learning_applied', {
                used: recommendation.learning.used,
                policyVersion: recommendation.learning.policyVersion,
                dimensionsApplied: recommendation.learning.dimensionsApplied,
                exploration: recommendation.learning.exploration
            });
            console.log(
                `🧠 Learning: used=${recommendation.learning.used}` +
                ` version=${recommendation.learning.policyVersion || 'none'}` +
                ` dims=[${recommendation.learning.dimensionsApplied.join(',') || 'none'}]` +
                ` exploration=${recommendation.learning.exploration}`
            );
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
            hasAIVisual: !!(aiVisual && aiVisual.path),
            deadlineState: deadlineInfo?.state
        });

        // Store opportunity with enhanced data. NOTE: `detected: true` is
        // required by storeOpportunity — the recommendation object never
        // carried it, so opportunities were silently NEVER stored before
        // this fix (recent-angle/fatigue data was always empty).
        if (db) {
            await storeOpportunity(db, {
                ...recommendation,
                detected: true,
                contentId: opts.contentId,
                // NEW fields
                contentAngle: contentAngle?.key,
                layout: layout?.key,
                visualDiversityScore: visualDiversity?.score,
                deadlineState: deadlineInfo?.state,
                faqTopic: faqOpportunity?.selected ? faqOpportunity.faq.topic : null,
                aiVisualProvider: aiVisual?.provider,
                aiVisualSource: aiVisual?.visualSource || null,
                aiVisualScene: visualPlan?.scene,
                aiVisualCombination: visualPlan?.combinationKey,
                aiVisualSeed: visualPlan?.seed,
                aiVisualVariant: visualPlan?.variant,
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
            hasAIVisual: !!(aiVisual && aiVisual.path),
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
                visualPlan,
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
 * Get the content angles used by recent opportunities (fatigue prevention
 * + honest "what was tried before" data for the angle policy).
 */
async function getRecentAngles(db, limit = 10) {
    if (!db) return [];
    try {
        const snapshot = await db.collection('content_opportunities')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        return (snapshot.docs || [])
            .map((doc) => (typeof doc.data === 'function' ? doc.data() : doc))
            .map((data) => data && data.contentAngle)
            .filter((angle) => typeof angle === 'string' && angle.length > 0);
    } catch (err) {
        console.log(`⚠️ recent angles fetch failed: ${err.message || err}`);
        return [];
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
    
    // Learned policy (Growth Self-Learning)
    policy: require('./learning/policy_store'),

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
