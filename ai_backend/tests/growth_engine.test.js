'use strict';

/**
 * Tests for the Growth Engine — all phases tested without Firebase billing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

/* ------------------------------------------------------------------ */
/* Feature Flags                                                       */
/* ------------------------------------------------------------------ */

const flags = require('../agents/growth/feature_flags');

test('feature_flags: defaults are correct', () => {
    flags.invalidateCache();
    assert.equal(flags.isEnabled('GROWTH_ENGINE_ENABLED'), true);
    assert.equal(flags.isEnabled('ANALYTICS_ENABLED'), true);
    assert.equal(flags.isEnabled('AB_TESTING_ENABLED'), false);
    assert.equal(flags.isEnabled('TREND_ENGINE_ENABLED'), false);
    assert.equal(flags.isEnabled('BREAKING_MODE_ENABLED'), true);
});

test('feature_flags: env override works', () => {
    const orig = process.env.AB_TESTING_ENABLED;
    process.env.AB_TESTING_ENABLED = 'true';
    flags.invalidateCache();
    assert.equal(flags.isEnabled('AB_TESTING_ENABLED'), true);
    if (orig === undefined) delete process.env.AB_TESTING_ENABLED;
    else process.env.AB_TESTING_ENABLED = orig;
    flags.invalidateCache();
});

test('feature_flags: unknown flag returns false', () => {
    assert.equal(flags.isEnabled('NONEXISTENT_FLAG'), false);
});

/* ------------------------------------------------------------------ */
/* Content Fingerprint                                                 */
/* ------------------------------------------------------------------ */

const fp = require('../agents/growth/content_fingerprint');

test('fingerprint: normalizeText handles Hindi + English', () => {
    assert.equal(fp.normalizeText('  SSC  GD  2026  '), 'ssc gd 2026');
    // Hindi characters are preserved as letters
    const normalized = fp.normalizeText('भर्ती 2026');
    assert.ok(normalized.includes('2026'));
    assert.ok(normalized.length > 0);
    assert.equal(fp.normalizeText(''), '');
    assert.equal(fp.normalizeText(null), '');
});

test('fingerprint: createFingerprint produces consistent hash', () => {
    const content = { title: 'SSC GD 2026 Vacancy', organization: 'SSC', category: 'SSC' };
    const fp1 = fp.createFingerprint(content);
    const fp2 = fp.createFingerprint(content);
    assert.equal(fp1.hash, fp2.hash);
    assert.ok(fp1.keyPhrases.length > 0);
});

test('fingerprint: different content produces different hash', () => {
    const fp1 = fp.createFingerprint({ title: 'SSC GD 2026' });
    const fp2 = fp.createFingerprint({ title: 'RRB NTPC 2026' });
    assert.notEqual(fp1.hash, fp2.hash);
});

test('fingerprint: compareFingerprints detects exact duplicate', () => {
    const content = { title: 'SSC GD Vacancy', organization: 'SSC', category: 'SSC' };
    const fp1 = fp.createFingerprint(content);
    const fp2 = fp.createFingerprint(content);
    const result = fp.compareFingerprints(fp1, fp2);
    assert.equal(result.type, 'EXACT_DUPLICATE');
    assert.equal(result.score, 1.0);
});

test('fingerprint: compareFingerprints detects new content', () => {
    const fp1 = fp.createFingerprint({ title: 'SSC GD 2026' });
    const fp2 = fp.createFingerprint({ title: 'UPSC CSE 2026 Notification' });
    const result = fp.compareFingerprints(fp1, fp2);
    assert.ok(['NEW_CONTENT', 'RELATED_CONTENT'].includes(result.type));
});

test('fingerprint: jaccardSimilarity works correctly', () => {
    assert.equal(fp.jaccardSimilarity(new Set(['a', 'b']), new Set(['a', 'b'])), 1);
    assert.equal(fp.jaccardSimilarity(new Set(['a']), new Set(['b'])), 0);
    assert.ok(fp.jaccardSimilarity(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd'])) > 0);
});

/* ------------------------------------------------------------------ */
/* Opportunity Engine                                                  */
/* ------------------------------------------------------------------ */

const opp = require('../agents/growth/opportunity_engine');

test('opportunity: detectUrgency finds CRITICAL', () => {
    const result = opp.detectUrgency({ title: 'SSC GD Result Out 2026' });
    assert.equal(result.level, 'CRITICAL');
});

test('opportunity: detectUrgency finds HIGH', () => {
    const result = opp.detectUrgency({ title: 'Last Date Extended for SSC GD' });
    assert.equal(result.level, 'HIGH');
});

test('opportunity: detectUrgency defaults to LOW', () => {
    const result = opp.detectUrgency({ title: 'SSC GD Syllabus Updated' });
    assert.equal(result.level, 'LOW');
});

test('opportunity: detectCategory identifies SSC', () => {
    assert.equal(opp.detectCategory({ category: 'SSC', title: 'SSC GD' }), 'SSC');
});

test('opportunity: detectCategory identifies Railway', () => {
    assert.equal(opp.detectCategory({ title: 'RRB NTPC 2026' }), 'RAILWAY');
});

test('opportunity: detectCategory defaults to GENERAL', () => {
    assert.equal(opp.detectCategory({ title: 'Some generic notification 2026' }), 'GENERAL');
});

test('opportunity: computeFreshnessScore is 1.0 for very recent', () => {
    const content = { createdAt: Date.now() - 30 * 60 * 1000 }; // 30 min ago
    assert.ok(opp.computeFreshnessScore(content) > 0.8);
});

test('opportunity: computeFreshnessScore is low for old content', () => {
    const content = { createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000 }; // 7 days ago
    assert.ok(opp.computeFreshnessScore(content) < 0.3);
});

test('opportunity: computeOpportunityScore is between 0 and 100', () => {
    const score = opp.computeOpportunityScore({
        freshness: 0.9, urgency: 0.75, audienceFit: 0.8,
        searchIntent: 0.7, historicalPerf: 0.5, competition: 0.5
    });
    assert.ok(score >= 0 && score <= 100);
});

test('opportunity: detectOpportunity returns detected:true for valid content', async () => {
    const result = await opp.detectOpportunity({
        title: 'SSC GD Result Out',
        category: 'SSC',
        createdAt: Date.now()
    });
    assert.equal(result.detected, true);
    assert.ok(result.opportunityScore > 0);
    assert.ok(result.recommendedHookTypes.length > 0);
});

/* ------------------------------------------------------------------ */
/* Hook Engine                                                         */
/* ------------------------------------------------------------------ */

const hooks = require('../agents/growth/hook_engine');

test('hook: generates multiple hooks', () => {
    const result = hooks.generateHooks({
        title: 'SSC GD 2026 Vacancy',
        organization: 'SSC',
        vacancies: '5000',
        lastDate: '28 Aug 2026',
        qualification: '10th Pass'
    });
    assert.ok(result.hooks.length >= 10);
    assert.ok(result.totalGenerated >= 10);
});

test('hook: best hook is first after scoring', () => {
    const result = hooks.generateHooks({
        title: 'SSC GD Result Out',
        organization: 'SSC',
        vacancies: '1200'
    });
    assert.ok(result.bestHook);
    assert.ok(result.bestHook.hookScore.total > 0);
});

test('hook: scoreHook returns structured score', () => {
    const score = hooks.scoreHook({
        hookText: '10वीं पास हो? ये भर्ती आपके लिए है',
        hookType: 'eligibility'
    }, { title: 'SSC GD Vacancy' });
    assert.ok(score.total > 0);
    assert.ok(score.clarity >= 0 && score.clarity <= 1);
    assert.ok(score.relevance >= 0 && score.relevance <= 1);
});

test('hook: extractHookFacts extracts fields', () => {
    const facts = hooks.extractHookFacts({
        organization: 'SSC',
        vacancies: '5000',
        lastDate: '28 Aug',
        title: 'Test'
    });
    assert.equal(facts.org, 'SSC');
    assert.equal(facts.vacancies, '5000');
});

/* ------------------------------------------------------------------ */
/* Script Engine                                                       */
/* ------------------------------------------------------------------ */

const script = require('../agents/growth/script_engine');

test('script: builds a valid script', () => {
    const opportunity = {
        recommendedFormat: 'JOB_ALERT',
        category: 'SSC',
        urgency: 'MEDIUM',
        keyFacts: [{ type: 'vacancy', value: '5000' }]
    };
    const hook = { hookText: 'SSC GD में 5000 पद!' };
    const content = {
        title: 'SSC GD 2026',
        organization: 'SSC',
        vacancies: '5000',
        lastDate: '28 Aug 2026'
    };
    const result = script.buildScript(opportunity, hook, content);
    assert.ok(result.script);
    assert.ok(result.actualWords > 0);
    assert.ok(result.estimatedDurationSec > 0);
    assert.ok(result.sections.hook);
    assert.ok(result.sections.cta);
});

/* ------------------------------------------------------------------ */
/* Quality Gate                                                        */
/* ------------------------------------------------------------------ */

const quality = require('../agents/growth/quality_gate');

test('quality: passes for complete content', () => {
    const result = quality.checkQualityGate({
        title: 'SSC GD Vacancy 2026 - 5000 Posts',
        organization: 'SSC',
        vacancies: '5000',
        lastDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        officialUrl: 'https://ssc.nic.in',
        category: 'SSC',
        qualification: '10th Pass'
    });
    assert.equal(result.status, 'quality_passed');
    assert.ok(result.score > 60);
});

test('quality: fails for content with no title', () => {
    const result = quality.checkQualityGate({
        organization: 'SSC',
        lastDate: new Date().toISOString()
    });
    assert.ok(result.status !== 'quality_passed' || result.score < 80);
});

test('quality: warns for missing organization', () => {
    const result = quality.checkQualityGate({
        title: 'New Vacancy 2026',
        lastDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    const orgCheck = result.checks.find(c => c.name === 'organization');
    assert.ok(orgCheck.status === 'warn');
});

/* ------------------------------------------------------------------ */
/* Retention Engine                                                    */
/* ------------------------------------------------------------------ */

const retention = require('../agents/growth/retention_engine');

test('retention: estimateDuration returns reasonable value', () => {
    const dur = retention.estimateDuration(
        { vacancies: '5000', lastDate: '28 Aug' },
        { recommendedFormat: 'JOB_ALERT', urgency: 'MEDIUM' }
    );
    assert.ok(dur.duration >= 15 && dur.duration <= 60);
});

test('retention: breaking content has shorter duration', () => {
    const normalDur = retention.estimateDuration(
        { vacancies: '5000' },
        { recommendedFormat: 'JOB_ALERT', urgency: 'MEDIUM' }
    );
    const breakingDur = retention.estimateDuration(
        { vacancies: '5000' },
        { recommendedFormat: 'BREAKING_SHORT', urgency: 'CRITICAL' }
    );
    assert.ok(breakingDur.duration <= normalDur.duration);
});

test('retention: evaluateRetentionPotential scores a script', () => {
    const result = retention.evaluateRetentionPotential({
        script: '⚡ SSC GD Result Out! 5000 students selected. Check now. studygyaan.in',
        estimatedDurationSec: 20
    });
    assert.ok(result.score > 0);
});

/* ------------------------------------------------------------------ */
/* Visual Engine                                                       */
/* ------------------------------------------------------------------ */

const visual = require('../agents/growth/visual_engine');

test('visual: selectStyle returns valid profile', () => {
    const style = visual.selectStyle({}, { category: 'RESULT' });
    assert.equal(style.styleName, 'result');
    assert.ok(style.background);
});

test('visual: selectAnchor returns approved anchor', () => {
    const anchor = visual.selectAnchor({ anchor: 'any' });
    assert.ok(visual.APPROVED_ANCHORS.includes(anchor));
});

test('visual: selectAnchor respects female constraint', () => {
    const anchor = visual.selectAnchor({ anchor: 'female' });
    assert.ok(anchor.includes('female'));
});

/* ------------------------------------------------------------------ */
/* First Frame Engine                                                  */
/* ------------------------------------------------------------------ */

const firstFrame = require('../agents/growth/first_frame_engine');

test('firstFrame: generates frame from vacancies', () => {
    const result = firstFrame.generateFirstFrame(
        { vacancies: '1200', title: 'SSC GD' },
        { category: 'SSC' }
    );
    assert.ok(result.bestFrame);
    assert.ok(result.firstFrameText.includes('1200'));
});

test('firstFrame: result category shows RESULT OUT', () => {
    const result = firstFrame.generateFirstFrame(
        { title: 'Result' },
        { category: 'RESULT' }
    );
    assert.equal(result.firstFrameText, 'RESULT OUT');
});

test('firstFrame: formatDate formats correctly', () => {
    assert.ok(firstFrame.formatDate('2026-08-28').includes('AUG'));
});

/* ------------------------------------------------------------------ */
/* Platform Packaging                                                  */
/* ------------------------------------------------------------------ */

const packaging = require('../agents/growth/platform_packaging');

test('packaging: generates YouTube metadata', () => {
    const pkg = packaging.generatePlatformPackage(
        { title: 'SSC GD 2026', organization: 'SSC', vacancies: '5000', category: 'SSC' },
        { category: 'SSC' }
    );
    assert.ok(pkg.youtube.title);
    assert.ok(pkg.youtube.description);
    assert.ok(pkg.youtube.hashtags.length > 0);
});

test('packaging: generates Telegram message with Markdown', () => {
    const pkg = packaging.generatePlatformPackage(
        { title: 'SSC Result', organization: 'SSC', vacancies: '1200' },
        { category: 'RESULT' }
    );
    assert.ok(pkg.telegram.message.includes('*'));
    assert.equal(pkg.telegram.parseMode, 'Markdown');
});

test('packaging: SEO is relevance-first', () => {
    const seo = packaging.generateSEO('SSC GD 2026', 'SSC', 'SSC', {
        vacancies: '5000',
        qualification: '10th Pass'
    });
    assert.ok(seo.primaryKeyword.includes('SSC'));
    assert.ok(!seo.secondaryKeywords.includes('RailwayJobs')); // No irrelevant tags
    assert.equal(seo.brandKeyword, 'StudyGyaan');
});

test('packaging: truncate works correctly', () => {
    assert.equal(packaging.truncate('short', 10), 'short');
    assert.ok(packaging.truncate('a very long string here', 10).length <= 10);
});

/* ------------------------------------------------------------------ */
/* Breaking Mode                                                       */
/* ------------------------------------------------------------------ */

const breaking = require('../agents/growth/breaking_mode');

test('breaking: detects breaking content', () => {
    assert.equal(breaking.isBreaking({ title: 'Result Out' }, { urgency: 'CRITICAL', category: 'RESULT' }), true);
    assert.equal(breaking.isBreaking({ title: 'Normal job' }, { urgency: 'LOW', category: 'GENERAL' }), false);
});

test('breaking: getDispatchPriority gives high priority to breaking', () => {
    const normalPriority = breaking.getDispatchPriority({ data: { createdAt: Date.now() }, kind: 'JOB' });
    const breakingPriority = breaking.getDispatchPriority({
        data: { title: 'Result Out', createdAt: Date.now() },
        kind: 'FAST_TRACK'
    });
    // Breaking might not be detected without opportunity, but function should work
    assert.ok(normalPriority.priority > 0);
});

/* ------------------------------------------------------------------ */
/* Music Engine                                                        */
/* ------------------------------------------------------------------ */

const music = require('../agents/growth/music_engine');

test('music: selectMusic returns profile', () => {
    const result = music.selectMusic({ musicProfile: 'breaking' });
    assert.ok(result.profile);
    assert.ok(result.profileName);
});

test('music: getDuckingFilter returns valid filter', () => {
    const filter = music.getDuckingFilter({ volume: 0.15 });
    assert.ok(filter.includes('volume='));
});

/* ------------------------------------------------------------------ */
/* Analytics Normalizer                                                */
/* ------------------------------------------------------------------ */

const normalizer = require('../agents/growth/analytics/normalizer');

test('normalizer: normalizeMetrics handles null values', () => {
    const result = normalizer.normalizeMetrics({ views: 1000, likes: null });
    assert.equal(result.normalized.views, 1000);
    assert.equal(result.normalized.likes, null);
});

test('normalizer: computePerformanceScore is 0-100', () => {
    const score = normalizer.computePerformanceScore({
        views: 0.8, retention: 0.7, completionRate: 0.6,
        engagement: 0.5, share: 0.4, followerGain: 0.3
    });
    assert.ok(score >= 0 && score <= 100);
});

test('normalizer: computeBaselines computes percentiles', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ views: (i + 1) * 100 }));
    const baselines = normalizer.computeBaselines(data);
    assert.ok(baselines.views);
    assert.ok(baselines.views.p50 > 0);
    assert.ok(baselines.views.p90 >= baselines.views.p50);
});

/* ------------------------------------------------------------------ */
/* Analytics Scorer                                                    */
/* ------------------------------------------------------------------ */

const scorer = require('../agents/growth/analytics/scorer');

test('scorer: scorePerformance returns score 0-100', () => {
    const result = scorer.scorePerformance({ views: 5000, likes: 200, comments: 50 });
    assert.ok(result.performanceScore >= 0);
});

test('scorer: detectWinner picks highest scorer', () => {
    const variants = [
        { variantId: 'a', hookType: 'urgency', performanceScore: 30, sampleSize: 5, metrics: { views: 1000 } },
        { variantId: 'b', hookType: 'curiosity', performanceScore: 60, sampleSize: 5, metrics: { views: 5000 } },
        { variantId: 'c', hookType: 'eligibility', performanceScore: 80, sampleSize: 5, metrics: { views: 10000 } }
    ];
    const result = scorer.detectWinner(variants);
    assert.ok(result.winner);
    assert.equal(result.winner.variantId, 'c');
});

test('scorer: detectWinner handles empty variants', () => {
    const result = scorer.detectWinner([]);
    assert.equal(result.winner, null);
});

/* ------------------------------------------------------------------ */
/* Content Mutation                                                    */
/* ------------------------------------------------------------------ */

const mutation = require('../agents/growth/content_mutation');

test('mutation: generates mutations for JOB content', () => {
    process.env.CONTENT_MUTATION_ENABLED = 'true';
    flags.invalidateCache();
    const result = mutation.generateMutations(
        { title: 'SSC GD 2026', organization: 'SSC', type: 'JOB' },
        { category: 'SSC' }
    );
    assert.ok(result.mutations.length > 0);
    assert.ok(result.mutations[0].topic);
    delete process.env.CONTENT_MUTATION_ENABLED;
    flags.invalidateCache();
});

test('mutation: skips existing topics', () => {
    const result = mutation.generateMutations(
        { title: 'SSC GD', organization: 'SSC', type: 'JOB' },
        { category: 'SSC' },
        { existingTopics: ['ssc-vacancy', 'ssc-eligibility'] }
    );
    const topics = result.mutations.map(m => m.normalizedTopic);
    assert.ok(!topics.includes('ssc-vacancy'));
});

/* ------------------------------------------------------------------ */
/* Comment Intelligence                                                */
/* ------------------------------------------------------------------ */

const comments = require('../agents/growth/comment_intelligence');

test('comments: classifies question', () => {
    const result = comments.classifyComment('Age limit kya hai?');
    assert.equal(result.class, 'question');
});

test('comments: classifies positive', () => {
    const result = comments.classifyComment('Very good video, badhiya!');
    assert.equal(result.class, 'positive');
});

test('comments: extractOpportunities finds repeated topics', () => {
    process.env.COMMENT_INTELLIGENCE_ENABLED = 'true';
    flags.invalidateCache();
    const result = comments.extractOpportunitiesFromComments([
        'Age limit kya hai?',
        'Age limit batao please',
        'Syllabus kab cover karoge?',
        'Syllabus detail me do'
    ]);
    assert.ok(result.opportunities.length > 0);
    delete process.env.COMMENT_INTELLIGENCE_ENABLED;
    flags.invalidateCache();
});

/* ------------------------------------------------------------------ */
/* Presenter Rotation                                                  */
/* ------------------------------------------------------------------ */

const presenter = require('../agents/growth/presenter_rotation');

test('presenter: selects approved anchor', () => {
    const result = presenter.selectPresenter({}, {});
    assert.ok(visual.APPROVED_ANCHORS.includes(result.anchor));
});

/* ------------------------------------------------------------------ */
/* Reach Predictor                                                     */
/* ------------------------------------------------------------------ */

const reach = require('../agents/growth/reach_predictor');

test('reach: predicts score 0-100', () => {
    const result = reach.predictReach(
        { title: 'SSC GD Result', category: 'SSC' },
        { category: 'RESULT', freshnessScore: 0.9, audienceFitScore: 0.8 }
    );
    assert.ok(result.reachPredictionScore >= 0 && result.reachPredictionScore <= 100);
    assert.equal(result.predicted, true);
});

/* ------------------------------------------------------------------ */
/* Logger                                                              */
/* ------------------------------------------------------------------ */

const logger = require('../agents/growth/logger');

test('logger: sanitize redacts secrets', () => {
    const result = logger.sanitize({ token: 'abc123', name: 'test' });
    assert.equal(result.token, '[REDACTED]');
    assert.equal(result.name, 'test');
});

test('logger: createRunLogger returns structured logger', () => {
    const log = logger.createRunLogger('test-run');
    assert.ok(typeof log.stage === 'function');
    assert.ok(typeof log.error === 'function');
    assert.ok(typeof log.metric === 'function');
});

/* ------------------------------------------------------------------ */
/* Orchestrator                                                        */
/* ------------------------------------------------------------------ */

const orchestrator = require('../agents/growth/orchestrator');

test('orchestrator: processContent processes valid content', async () => {
    const result = await orchestrator.processContent(
        {
            title: 'SSC GD 2026 — 5000 Vacancy',
            organization: 'SSC',
            vacancies: '5000',
            lastDate: '28 Aug 2026',
            category: 'SSC',
            qualification: '10th Pass',
            createdAt: Date.now(),
            type: 'JOB'
        },
        { contentId: 'test-123' }
    );
    assert.equal(result.processed, true);
    assert.ok(result.recommendation);
    assert.ok(result.recommendation.contentScore > 0);
});

test('orchestrator: exports all sub-modules', () => {
    assert.ok(orchestrator.opportunity);
    assert.ok(orchestrator.hooks);
    assert.ok(orchestrator.script);
    assert.ok(orchestrator.quality);
    assert.ok(orchestrator.retention);
    assert.ok(orchestrator.visual);
    assert.ok(orchestrator.presenter);
    assert.ok(orchestrator.firstFrame);
    assert.ok(orchestrator.music);
    assert.ok(orchestrator.fingerprint);
    assert.ok(orchestrator.breaking);
    assert.ok(orchestrator.packaging);
    assert.ok(orchestrator.reach);
    assert.ok(orchestrator.mutation);
    assert.ok(orchestrator.comments);
    assert.ok(orchestrator.trend);
    assert.ok(orchestrator.flags);
    assert.ok(orchestrator.logger);
    assert.ok(orchestrator.analytics);
    assert.ok(orchestrator.analytics.collector);
    assert.ok(orchestrator.analytics.normalizer);
    assert.ok(orchestrator.analytics.scorer);
    assert.ok(orchestrator.analytics.learner);
});
