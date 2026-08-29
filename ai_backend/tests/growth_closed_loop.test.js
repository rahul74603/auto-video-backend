'use strict';

/**
 * tests/growth_closed_loop.test.js — CLOSED-LOOP SELF-LEARNING PROOF
 * (Growth Self-Learning Phase 16)
 *
 * This is a REAL behavioral integration test of the full loop:
 *
 *   1. Generate video A (control, no learning)          → config recorded
 *   2. Insert attributed performance for A + history     → real collector path
 *   3. Run scorer + learner                              → real pipeline functions
 *   4. Verify learned policy appears                     → growth_policies/latest
 *   5. Generate video B                                  → consumes the policy
 *   6. Verify B's configuration differs BECAUSE of learning
 *   7. Verify the learned duration reaches the RENDER plan (script/TTS rate)
 *   8. Insert attributed performance for B (with learningMeta)
 *   9. Re-run scorer + learner + policy builder          → policy updates
 *  10. Seed a superior competitor + re-run               → winner FLIPS
 *  11. Generate video C                                  → uses the NEW winner
 *
 * No source-string greps. Everything runs against real modules with an
 * in-memory Firestore mock.
 */

const test = require('node:test');
const assert = require('node:assert');

const { createMockDb, HIGH_METRICS, LOW_METRICS } = require('./helpers/growth_mock_db');

const collector = require('../agents/growth/analytics/collector');
const policyStore = require('../agents/growth/learning/policy_store');
const recommendationEngine = require('../agents/growth/recommendation_engine');
const hookEngine = require('../agents/growth/hook_engine');
const durationFitter = require('../agents/growth/duration_fitter');
const learnerRun = require('../growth_learner_run');

const rngExploit = () => 0.01; // always exploits when a policy qualifies
const t0 = Date.now();

// Content for the three videos (different jobs — different fingerprints)
const CONTENT_A = {
    title: 'SSC CGL 2026 Recruitment — 14589 Posts',
    organization: 'SSC', vacancies: '14589', lastDate: '30 Sep 2026',
    startDate: '01 Sep 2026', category: 'SSC', qualification: 'Graduate',
    salary: 'Pay Level 7', ageLimit: '18-32', location: 'All India',
    createdAt: t0, type: 'JOB', id: 'job-a'
};
const CONTENT_B = {
    title: 'RRB NTPC 2026 Graduate Level Recruitment — 11555 Posts',
    organization: 'Railway', vacancies: '11555', lastDate: '15 Oct 2026',
    startDate: '01 Oct 2026', category: 'Railway', qualification: 'Graduate',
    salary: 'Level 2', ageLimit: '18-33', location: 'All India',
    createdAt: t0 + 1000, type: 'JOB', id: 'job-b'
};
const CONTENT_C = {
    title: 'IBPS PO 2026 Recruitment — 5208 Posts',
    organization: 'IBPS', vacancies: '5208', lastDate: '05 Nov 2026',
    startDate: '10 Oct 2026', category: 'Banking', qualification: 'Graduate',
    salary: 'Scale 1', ageLimit: '20-30', location: 'All India',
    createdAt: t0 + 2000, type: 'JOB', id: 'job-c'
};

/**
 * Insert an attributed performance record via the REAL collector path
 * (the same call video_dispatcher.js makes after upload).
 */
async function insertPerformance(db, { videoId, contentId, attribution, metrics }) {
    const fetchers = { youtube: async () => metrics };
    return collector.collectPlatformMetrics(db, {
        platform: 'youtube',
        platformVideoId: videoId,
        contentId,
        publishedAt: t0 - 3600 * 1000,
        ...attribution
    }, { fetchers });
}

test('CLOSED LOOP: performance → learning → policy → next video → new performance → policy update', async () => {
    // ─────────────────────────────────────────────────────────────
    // STEP 1 — CONTROL: generate videos A and B WITHOUT any learning.
    // ─────────────────────────────────────────────────────────────
    const controlDb = createMockDb(); // no growth_policies → no learning
    const control = await recommendationEngine.generateRecommendation(
        CONTENT_A, { db: controlDb, contentId: 'video-a', platform: 'youtube', rng: rngExploit, now: t0 }
    );
    assert.equal(control.recommended, true, 'control recommendation must succeed');
    assert.equal(control.learning.used, false, 'BEFORE LEARNING: learning must NOT be claimed');
    assert.equal(control.learning.policyVersion, null);
    assert.equal(control.durationSource, 'content-estimate');

    const defaultHook = control.hook.hookType;
    const defaultPresenter = control.presenter;
    const defaultDuration = control.duration;

    // A second control for video B's content (also without learning) so the
    // "changed because of learning" claim is measured against B's own
    // no-learning default, not just A's.
    const controlB = await recommendationEngine.generateRecommendation(
        CONTENT_B, { db: controlDb, contentId: 'video-b-control', platform: 'youtube', rng: rngExploit, now: t0 }
    );
    assert.equal(controlB.learning.used, false);
    const defaultHookB = controlB.hook.hookType;
    const defaultDurationB = controlB.duration;

    // Pick a learned winner that (a) video B can actually generate and
    // (b) differs from BOTH no-learning defaults, so the change is provable.
    const bHookTypes = [
        ...controlB.hookAlternatives.map((h) => h.hookType),
        ...[...new Set(hookEngine.generateHooks(CONTENT_B, { contentId: 'video-b' }).hooks.map((h) => h.hookType))]
    ];
    const WINNER_HOOK = bHookTypes.find((t) => t !== defaultHook && t !== defaultHookB);
    assert.ok(WINNER_HOOK, 'need a hook type different from both defaults');
    assert.ok(bHookTypes.includes(WINNER_HOOK), 'winner must be generatable for video B');

    const { APPROVED_ANCHORS } = require('../agents/growth/visual_engine');
    const WINNER_PRESENTER = APPROVED_ANCHORS.find((a) => a !== defaultPresenter);

    // ─────────────────────────────────────────────────────────────
    // STEP 2 — INSERT ATTRIBUTED PERFORMANCE (video A + history).
    // 12 high performers sharing the winning configuration, 8 low
    // performers sharing the losing configuration. Every dimension
    // gets two real buckets.
    // ─────────────────────────────────────────────────────────────
    const db = createMockDb();

    const winnerAttribution = (i) => ({
        hookType: WINNER_HOOK,
        presenter: WINNER_PRESENTER,
        visualStyle: 'result',
        duration: 15 + (i % 5),       // short_0_20 bucket (15-19s)
        category: 'SSC',
        contentAngle: 'salary_focus',
        music: 'odd_news',
        cta: 'subscribe',
        publishHour: 19,               // evening
        learningMeta: i === 0
            ? { used: true, policyVersion: 'policy-legacy', dimensionsApplied: ['hook'], exploredDimensions: ['hook'] }
            : { used: false, policyVersion: null, dimensionsApplied: [], exploredDimensions: [] }
    });
    const loserAttribution = (i) => ({
        hookType: defaultHook,
        presenter: defaultPresenter,
        visualStyle: 'news',
        duration: 38 + (i % 6),       // long_35_50 bucket
        category: 'SSC',
        contentAngle: 'basic_alert',
        music: 'news_theme',
        cta: 'apply_now',
        publishHour: 8,                // morning
        learningMeta: { used: false, policyVersion: null, dimensionsApplied: [], exploredDimensions: [] }
    });

    for (let i = 0; i < 12; i++) {
        await insertPerformance(db, { videoId: `hist-w-${i}`, contentId: `hist-w-${i}`, attribution: winnerAttribution(i), metrics: HIGH_METRICS(i) });
    }
    for (let i = 0; i < 8; i++) {
        await insertPerformance(db, { videoId: `hist-l-${i}`, contentId: `hist-l-${i}`, attribution: loserAttribution(i), metrics: LOW_METRICS(i) });
    }

    // Attribution really persisted?
    const perfDump = db.__dump('content_performance');
    assert.equal(perfDump['youtube_hist-w-0'].hookType, WINNER_HOOK);
    assert.equal(typeof perfDump['youtube_hist-w-0'].duration, 'number');

    // ─────────────────────────────────────────────────────────────
    // STEP 3 — RUN THE REAL SCORER + LEARNER PIPELINE
    // ─────────────────────────────────────────────────────────────
    const scored = await learnerRun.scoreAllPerformance(db);
    assert.equal(scored, 20, 'all 20 records must be scored');
    // Idempotent: second run scores nothing new
    const scoredAgain = await learnerRun.scoreAllPerformance(db);
    assert.equal(scoredAgain, 0, 'scoring must be idempotent');

    const learning = await learnerRun.runLearning(db);
    const byType = Object.fromEntries(learning.patterns.map((p) => [`${p.patternType}:${p.platform}`, p]));

    assert.equal(byType['HOOK:youtube'].winningPattern, WINNER_HOOK);
    assert.equal(byType['HOOK:youtube'].sampleSize, 12);
    assert.equal(byType['HOOK:youtube'].exploredSampleSize, 1, 'explored sample counted from learningMeta');
    assert.equal(byType['DURATION:youtube'].winningPattern, 'short_0_20');
    assert.ok(byType['DURATION:youtube'].averageValueSeconds >= 15 && byType['DURATION:youtube'].averageValueSeconds <= 19);
    assert.equal(byType['PRESENTER:youtube'].winningPattern, WINNER_PRESENTER);
    assert.equal(byType['VISUAL_STYLE:youtube'].winningPattern, 'result');
    assert.equal(byType['MUSIC:youtube'].winningPattern, 'odd_news');
    assert.equal(byType['CTA:youtube'].winningPattern, 'subscribe');
    assert.equal(byType['CONTENT_ANGLE:youtube'].winningPattern, 'salary_focus');
    assert.equal(byType['POST_TIME:youtube'].winningPattern, 'evening');

    // Insights persisted (reporting artifact)
    assert.ok(db.__dump('growth_insights')['latest'], 'growth_insights/latest written');

    // ─────────────────────────────────────────────────────────────
    // STEP 4 — POLICY PERSISTED (the apply-half artifact)
    // ─────────────────────────────────────────────────────────────
    const policyResult1 = await learnerRun.buildAndSavePolicy(db, learning);
    assert.ok(policyResult1.version, 'policy version');
    const policy1 = await policyStore.loadPolicy(db);
    assert.equal(policy1.version, policyResult1.version);
    assert.equal(policy1.platforms.youtube.dimensions.hook.winningPattern, WINNER_HOOK);
    assert.equal(policy1.platforms.youtube.dimensions.duration.targetSeconds,
        byType['DURATION:youtube'].averageValueSeconds);

    // ─────────────────────────────────────────────────────────────
    // STEP 5 — GENERATE VIDEO B WITH THE LEARNED POLICY ACTIVE
    // ─────────────────────────────────────────────────────────────
    const videoB = await recommendationEngine.generateRecommendation(
        CONTENT_B, { db, contentId: 'video-b', platform: 'youtube', rng: rngExploit, now: t0 }
    );

    // ─────────────────────────────────────────────────────────────
    // STEP 6 — B'S CONFIGURATION DIFFERS SPECIFICALLY BECAUSE OF LEARNING
    // ─────────────────────────────────────────────────────────────
    assert.equal(videoB.learning.used, true, 'AFTER LEARNING: learning must be used');
    assert.equal(videoB.learning.policyVersion, policy1.version, 'policy version traceable');

    // HOOK — the learned winner, not the default
    assert.equal(videoB.learning.decisions.hook.mode, 'exploit');
    assert.equal(videoB.hook.hookType, WINNER_HOOK);
    assert.equal(videoB.learning.decisions.hook.changedSelection, true);

    // DURATION — blended toward the learned target (measured against B's
    // own no-learning default)
    const bDurationDecision = videoB.learning.decisions.duration;
    assert.equal(bDurationDecision.mode, 'exploit');
    assert.equal(videoB.durationSource, 'learned-policy');
    assert.equal(bDurationDecision.defaultWouldBe, defaultDurationB);
    assert.ok(
        Math.abs(videoB.duration - defaultDurationB) >= 3,
        `duration must move toward the learned target (${videoB.duration} vs default ${defaultDurationB})`
    );

    // PRESENTER — learned winner anchor
    assert.equal(videoB.presenter, WINNER_PRESENTER);

    // VISUAL STYLE + MUSIC — learned winners
    assert.equal(videoB.visualStyle, 'result');
    assert.equal(videoB.musicId, 'odd_news');

    // POST_TIME — learned but honestly NOT applied
    assert.equal(videoB.learning.decisions.postTime.applied, false);
    assert.ok(!videoB.learning.dimensionsApplied.includes('postTime'));

    // B differs from the control A on the learned dimensions
    assert.notEqual(videoB.hook.hookType, defaultHook);
    assert.notEqual(videoB.presenter, defaultPresenter);
    assert.notEqual(videoB.duration, defaultDuration);

    // ─────────────────────────────────────────────────────────────
    // STEP 7 — RENDER-LEVEL DURATION INFLUENCE (what autoVideo.js does):
    // the learned target drives TTS speaking rate + script word budget, and
    // the rendered video's length equals the voice track length. Without a
    // target autoVideo speaks at a fixed 1.08 rate.
    // ─────────────────────────────────────────────────────────────
    const scriptText = videoB.script.script;
    const fitB = durationFitter.fitScriptToDuration(scriptText, videoB.duration);
    const NO_TARGET_RATE = 1.08; // autoVideo's fixed rate when no target exists
    const noTargetEstimate = Math.round(
        fitB.wordCount / (durationFitter.WORDS_PER_SECOND * NO_TARGET_RATE)
    );
    assert.notEqual(fitB.speakingRate, NO_TARGET_RATE,
        'the learned duration must change the TTS rate from the fixed no-learning default');
    assert.ok(
        Math.abs(fitB.estimatedSeconds - videoB.duration) < Math.abs(noTargetEstimate - videoB.duration),
        `render plan with learning (${fitB.estimatedSeconds}s @ rate ${fitB.speakingRate}) must land closer to the learned target ${videoB.duration}s than the no-learning plan (${noTargetEstimate}s @ rate ${NO_TARGET_RATE})`
    );
    assert.ok(fitB.speakingRate >= durationFitter.MIN_RATE && fitB.speakingRate <= durationFitter.MAX_RATE);
    // And with a LONG script the target also trims what is spoken (proven in
    // the unit tests) — the rendered duration follows the learned target.

    // ─────────────────────────────────────────────────────────────
    // STEP 8 — PUBLISH B AND COLLECT ITS ATTRIBUTED PERFORMANCE
    // (exactly what video_dispatcher.js does after upload)
    // ─────────────────────────────────────────────────────────────
    await insertPerformance(db, {
        videoId: 'video-b',
        contentId: 'video-b',
        metrics: HIGH_METRICS(20),
        attribution: {
            hookType: videoB.hook.hookType,
            presenter: videoB.presenter,
            visualStyle: videoB.visualStyle,
            duration: videoB.duration,
            category: 'Railway',
            contentAngle: 'salary_focus',
            music: videoB.musicId,
            cta: 'subscribe',
            publishHour: 19,
            learningMeta: {
                used: videoB.learning.used,
                policyVersion: videoB.learning.policyVersion,
                dimensionsApplied: videoB.learning.dimensionsApplied,
                exploredDimensions: []
            }
        }
    });
    const bPerf = db.__dump('content_performance')['youtube_video-b'];
    assert.equal(bPerf.learningMeta.policyVersion, policy1.version, 'B attributed to the policy that generated it');

    // ─────────────────────────────────────────────────────────────
    // STEP 9 — NEW PERFORMANCE → SCORER → LEARNER → POLICY UPDATE
    // ─────────────────────────────────────────────────────────────
    const scoredB = await learnerRun.scoreAllPerformance(db);
    assert.equal(scoredB, 1, 'only video B is newly scored');
    const learning2 = await learnerRun.runLearning(db);
    const policyResult2 = await learnerRun.buildAndSavePolicy(db, learning2);

    assert.notEqual(policyResult2.version, policyResult1.version, 'policy version must advance');
    const policy2 = await policyStore.loadPolicy(db);
    assert.equal(policy2.platforms.youtube.dimensions.hook.sampleSize, 13,
        'B joined the winning hook bucket (12 + 1)');
    assert.equal(policy2.platforms.youtube.dimensions.hook.winningPattern, WINNER_HOOK, 'winner stable after reinforcement');
    assert.equal(Object.keys(db.__dump('growth_policies_history')).length, 2, 'history trail grows');

    // ─────────────────────────────────────────────────────────────
    // STEP 10 — A SUPERIOR COMPETITOR EMERGES → WINNER MUST FLIP
    // ─────────────────────────────────────────────────────────────
    // Choose the flip target: the hook type video C's content scores
    // highest by static scoring, as long as it isn't the old winner — so
    // the flipped policy is both consumable and deterministically chosen.
    const cHooks = hookEngine.generateHooks(CONTENT_C, { contentId: 'video-c' }).hooks;
    const cAvailable = [...new Set(cHooks.map((h) => h.hookType))];
    const NEW_WINNER = cHooks[0] && cHooks[0].hookType !== WINNER_HOOK
        ? cHooks[0].hookType
        : cAvailable.find((t) => t !== WINNER_HOOK);
    assert.ok(NEW_WINNER, 'need a flip target generatable for content C');

    for (let i = 0; i < 10; i++) {
        await insertPerformance(db, {
            videoId: `super-${i}`,
            contentId: `super-${i}`,
            metrics: {
                views: 80000 + i * 3000, likes: 3000 + i * 100, comments: 600 + i * 20,
                shares: 700 + i * 20, followersGained: 400 + i * 10,
                saves: null, watchTime: null, averageViewDuration: null, retention: null,
                completionRate: null, rewatchRate: null, clickThroughRate: null
            },
            attribution: {
                hookType: NEW_WINNER,
                presenter: WINNER_PRESENTER,
                visualStyle: 'result',
                duration: 15 + (i % 5),
                category: 'Banking',
                contentAngle: 'salary_focus',
                music: 'odd_news',
                cta: 'subscribe',
                publishHour: 19,
                learningMeta: { used: false, policyVersion: null, dimensionsApplied: [], exploredDimensions: [] }
            }
        });
    }

    await learnerRun.scoreAllPerformance(db);
    const learning3 = await learnerRun.runLearning(db);
    const hookPattern3 = learning3.patterns.find((p) => p.patternType === 'HOOK' && p.platform === 'youtube');
    assert.equal(hookPattern3.winningPattern, NEW_WINNER, 'the superior hook must take over the win');

    const policyResult3 = await learnerRun.buildAndSavePolicy(db, learning3);
    const policy3 = await policyStore.loadPolicy(db);
    assert.equal(policy3.platforms.youtube.dimensions.hook.winningPattern, NEW_WINNER, 'persisted policy flipped');
    assert.notEqual(policy3.version, policy2.version);

    // ─────────────────────────────────────────────────────────────
    // STEP 11 — VIDEO C CONSUMES THE UPDATED POLICY
    // ─────────────────────────────────────────────────────────────
    const videoC = await recommendationEngine.generateRecommendation(
        CONTENT_C, { db, contentId: 'video-c', platform: 'youtube', rng: rngExploit, now: t0 }
    );
    assert.equal(videoC.learning.used, true);
    assert.equal(videoC.learning.policyVersion, policy3.version, 'C runs on the UPDATED policy');
    assert.equal(videoC.hook.hookType, NEW_WINNER, 'C uses the flipped winner — policy update reached generation');
    assert.notEqual(videoC.hook.hookType, videoB.hook.hookType,
        'B and C use different hooks because the policy learned between them');

    // ─── CLOSED LOOP PROVEN ───
    // performance → learning → policy → next video config → new
    // performance → policy update → next video config
});

test('CLOSED LOOP (orchestrator level): cta + contentAngle policies applied and persisted with the opportunity', async () => {
    const flags = require('../agents/growth/feature_flags');

    // Disable the AI-visual network path for this test (policy application
    // does not depend on it; the visual chain falls back deterministically).
    const hadAiVisual = process.env.AI_VISUAL_ENABLED;
    process.env.AI_VISUAL_ENABLED = 'false';
    flags.invalidateCache();

    try {
        const db = createMockDb();
        const t = Date.now();
        const policy = policyStore.buildPolicy([
            { patternType: 'HOOK', platform: 'youtube', winningPattern: 'question', averageScore: 82, confidence: 0.72, sampleSize: 12, distinctBuckets: 3, discoveredAt: t },
            { patternType: 'CTA', platform: 'youtube', winningPattern: 'subscribe', averageScore: 79, confidence: 0.69, sampleSize: 12, distinctBuckets: 3, discoveredAt: t },
            { patternType: 'CONTENT_ANGLE', platform: 'youtube', winningPattern: 'salary_focus', averageScore: 76, confidence: 0.66, sampleSize: 12, distinctBuckets: 4, discoveredAt: t }
        ], { now: t });
        await policyStore.savePolicy(db, policy);

        const orchestrator = require('../agents/growth/orchestrator');
        const result = await orchestrator.processContent({
            title: 'UPSC EPFO 2026 Recruitment — 250 Posts',
            organization: 'UPSC', vacancies: '250', lastDate: '20 Oct 2026',
            startDate: '01 Oct 2026', category: 'UPSC', qualification: 'Graduate',
            salary: 'Level 8', ageLimit: '21-30', location: 'All India',
            createdAt: t, type: 'JOB', id: 'orch-test'
        }, { contentId: 'orch-test', db, rng: rngExploit, now: t, platform: 'youtube' });

        assert.equal(result.processed, true, 'orchestrator must process');

        // CTA policy applied end-to-end
        assert.equal(result.enhancements.cta.closing.key, 'subscribe');
        assert.equal(result.enhancements.cta.closing.learningUsed, true);
        assert.equal(result.recommendation.learning.decisions.cta.mode, 'exploit');
        assert.equal(result.recommendation.learning.decisions.cta.value, 'subscribe');

        // Content-angle policy applied end-to-end
        assert.equal(result.enhancements.contentAngle.key, 'salary_focus');
        assert.equal(result.enhancements.contentAngle.learningUsed, true);
        assert.equal(result.recommendation.learning.decisions.contentAngle.mode, 'exploit');

        // Both orchestrator dimensions land in the summary
        assert.ok(result.recommendation.learning.dimensionsApplied.includes('cta'));
        assert.ok(result.recommendation.learning.dimensionsApplied.includes('contentAngle'));
        assert.equal(result.recommendation.learning.used, true);
        assert.equal(result.recommendation.learning.policyVersion, policy.version);

        // The stored opportunity carries the learning trace (this is what
        // the dispatcher attributes against after upload)
        const opportunities = db.__dump('content_opportunities');
        const stored = Object.values(opportunities)[0];
        assert.ok(stored, 'opportunity must be stored');
        assert.equal(stored.learning.used, true);
        assert.equal(stored.learning.policyVersion, policy.version);
        assert.ok(stored.learning.dimensionsApplied.includes('cta'));
        assert.equal(stored.ctaKey, 'subscribe');
        assert.equal(stored.contentAngle, 'salary_focus');
    } finally {
        if (hadAiVisual === undefined) delete process.env.AI_VISUAL_ENABLED;
        else process.env.AI_VISUAL_ENABLED = hadAiVisual;
        flags.invalidateCache();
    }
});
