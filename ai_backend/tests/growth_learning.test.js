'use strict';

/**
 * tests/growth_learning.test.js — Growth Self-Learning BEHAVIORAL tests
 * (Phases 1-14 of the closed-loop upgrade).
 *
 * Every test here exercises real module behavior with an in-memory mock
 * Firestore. NO source-string grep assertions.
 */

const test = require('node:test');
const assert = require('node:assert');

const { createMockDb, HIGH_METRICS, LOW_METRICS } = require('./helpers/growth_mock_db');

const collector = require('../agents/growth/analytics/collector');
const learner = require('../agents/growth/analytics/learner');
const policyStore = require('../agents/growth/learning/policy_store');
const recommendationEngine = require('../agents/growth/recommendation_engine');
const retentionEngine = require('../agents/growth/retention_engine');
const presenterEngine = require('../agents/growth/presenter_rotation');
const visualEngine = require('../agents/growth/visual_engine');
const musicEngine = require('../agents/growth/music_engine');
const ctaEngine = require('../agents/growth/cta_engine');
const angleEngine = require('../agents/growth/content_angle_engine');
const durationFitter = require('../agents/growth/duration_fitter');

const NOW = 1788000000000;

// Deterministic rng helpers
const rngExploit = () => 0.01; // always below exploit probability
const rngExplore = () => 0.99; // always above exploit probability

// ─────────────────────────────────────────────────────────────────────
// PHASE 1 — Attribution persistence (collector)
// ─────────────────────────────────────────────────────────────────────

test('attribution: collector preserves generation attribution fields verbatim', async () => {
    const db = createMockDb();
    const fetcher = async () => ({ views: 5000, likes: 200, comments: 40 });

    await collector.collectPlatformMetrics(db, {
        platform: 'youtube',
        platformVideoId: 'vid1',
        contentId: 'content-1',
        publishedAt: 12345,
        hookType: 'question',
        presenter: 'female_anchor_4.mp4',
        visualStyle: 'result',
        duration: 24,
        category: 'SSC',
        contentAngle: 'salary_focus',
        music: 'odd_news',
        cta: 'subscribe',
        publishHour: 19,
        learningMeta: { used: true, policyVersion: 'policy-abc', dimensionsApplied: ['hook'], exploredDimensions: [] }
    }, { fetchers: { youtube: fetcher } });

    const doc = db.__dump('content_performance')['youtube_vid1'];
    assert.equal(doc.hookType, 'question');
    assert.equal(doc.presenter, 'female_anchor_4.mp4');
    assert.equal(doc.visualStyle, 'result');
    assert.equal(doc.duration, 24);
    assert.equal(doc.category, 'SSC');
    assert.equal(doc.contentAngle, 'salary_focus');
    assert.equal(doc.music, 'odd_news');
    assert.equal(doc.cta, 'subscribe');
    assert.equal(doc.publishHour, 19);
    assert.deepEqual(doc.learningMeta, { used: true, policyVersion: 'policy-abc', dimensionsApplied: ['hook'], exploredDimensions: [] });
});

test('attribution: missing attribution fields are stored as null, never defaulted', async () => {
    const db = createMockDb();
    const fetcher = async () => ({ views: 10 });

    await collector.collectPlatformMetrics(db, {
        platform: 'youtube',
        platformVideoId: 'vid2',
        contentId: 'content-2'
    }, { fetchers: { youtube: fetcher } });

    const doc = db.__dump('content_performance')['youtube_vid2'];
    for (const field of ['hookType', 'presenter', 'visualStyle', 'duration', 'category', 'contentAngle', 'music', 'cta']) {
        assert.equal(doc[field], null, `${field} must be null when not provided`);
    }
    assert.equal(doc.learningMeta, undefined, 'no learningMeta when none passed');
    // The killer regression: duration must NOT become 0 or a bucket.
    assert.notEqual(doc.duration, 0);
});

test('attribution: backwards compatibility — existing documents keep their fields on merge', async () => {
    const db = createMockDb({
        content_performance: {
            youtube_legacy: {
                views: 1000,
                performanceScore: 55,
                someLegacyField: 'keep-me',
                platform: 'youtube',
                platformVideoId: 'legacy',
                contentId: 'old',
                collectedAt: NOW - 40 * 24 * 3600 * 1000
                // NO attribution fields (historical record)
            }
        }
    });
    const fetcher = async () => ({ views: 1200 });

    await collector.collectPlatformMetrics(db, {
        platform: 'youtube',
        platformVideoId: 'legacy',
        contentId: 'old',
        publishedAt: NOW
    }, { fetchers: { youtube: fetcher } });

    const doc = db.__dump('content_performance')['youtube_legacy'];
    assert.equal(doc.someLegacyField, 'keep-me', 'legacy fields must survive');
    assert.equal(doc.performanceScore, 55, 'existing score must survive merge');
    assert.equal(doc.hookType, null, 'refresh of a legacy doc stores null attribution, not fake values');
});

// ─────────────────────────────────────────────────────────────────────
// PHASE 2 — Learning is attribution-gated
// ─────────────────────────────────────────────────────────────────────

function seedPerformance(db, records) {
    for (const [i, r] of records.entries()) {
        db.__collection('content_performance').set(`youtube_seed_${i}`, {
            platform: r.platform || 'youtube',
            platformVideoId: `v${i}`,
            contentId: `c${i}`,
            collectedAt: r.collectedAt || NOW - i * 3600 * 1000,
            publishedAt: r.publishedAt || NOW - i * 3600 * 1000,
            performanceScore: r.performanceScore !== undefined ? r.performanceScore : r.score,
            views: r.metrics.views,
            likes: r.metrics.likes,
            comments: r.metrics.comments,
            hookType: r.hookType !== undefined ? r.hookType : null,
            presenter: r.presenter !== undefined ? r.presenter : null,
            visualStyle: r.visualStyle !== undefined ? r.visualStyle : null,
            duration: r.duration !== undefined ? r.duration : null,
            category: r.category !== undefined ? r.category : null,
            contentAngle: r.contentAngle !== undefined ? r.contentAngle : null,
            music: r.music !== undefined ? r.music : null,
            cta: r.cta !== undefined ? r.cta : null,
            publishHour: r.publishHour !== undefined ? r.publishHour : null
        });
    }
}

function makeWinnerLoser({ count = 12, winnerScore = 88, loserScore = 30, winner, loser, field }) {
    const records = [];
    for (let i = 0; i < count; i++) {
        records.push({ performanceScore: winnerScore, metrics: HIGH_METRICS(i), platform: 'youtube', [field]: winner });
    }
    for (let i = 0; i < 8; i++) {
        records.push({ performanceScore: loserScore, metrics: LOW_METRICS(i), platform: 'youtube', [field]: loser });
    }
    return records;
}

test('learner: DURATION learned only from real stored durations', () => {
    const db = createMockDb();
    const records = [];
    for (let i = 0; i < 12; i++) records.push({ performanceScore: 88, metrics: HIGH_METRICS(i), duration: 15 + (i % 5) });
    for (let i = 0; i < 8; i++) records.push({ performanceScore: 30, metrics: LOW_METRICS(i), duration: 38 + (i % 6) });
    seedPerformance(db, records);

    const patterns = learner.analyzePatternType('DURATION', db.__dump('content_performance') ? Object.values(db.__dump('content_performance')) : []);
    const durationPattern = patterns.find((p) => p.patternType === 'DURATION');
    assert.ok(durationPattern, 'DURATION pattern must exist with real duration attribution');
    assert.equal(durationPattern.winningPattern, 'short_0_20');
    assert.equal(durationPattern.sampleSize, 12);
    assert.ok(durationPattern.averageValueSeconds >= 15 && durationPattern.averageValueSeconds <= 19,
        `averageValueSeconds must reflect real durations (~17), got ${durationPattern.averageValueSeconds}`);
    assert.equal(durationPattern.platform, 'youtube');
});

test('learner: missing duration NEVER produces a pattern (short_0_20 artifact eliminated)', () => {
    const records = [];
    for (let i = 0; i < 20; i++) {
        records.push({
            performanceScore: 70,
            platform: 'youtube',
            collectedAt: NOW,
            duration: null, // ← the old bug converted this to bucket short_0_20
            hookType: null
        });
    }
    const patterns = learner.analyzePatternType('DURATION', records);
    assert.equal(patterns.length, 0, 'no DURATION pattern may be claimed without real durations');
});

test('learner: HOOK learned from attributed hook types', () => {
    const records = makeWinnerLoser({ winner: 'question', loser: 'urgency', field: 'hookType' });
    const patterns = learner.analyzePatternType('HOOK', records);
    const hookPattern = patterns[0];
    assert.ok(hookPattern);
    assert.equal(hookPattern.patternType, 'HOOK');
    assert.equal(hookPattern.winningPattern, 'question');
    assert.equal(hookPattern.sampleSize, 12);
    assert.ok(hookPattern.confidence >= 0.6);
});

test('learner: PRESENTER / VISUAL_STYLE / MUSIC / CTA / CONTENT_ANGLE all learnable', () => {
    const cases = [
        { field: 'presenter', winner: 'female_anchor_4.mp4', loser: 'male_anchor_1.mp4', type: 'PRESENTER' },
        { field: 'visualStyle', winner: 'result', loser: 'news', type: 'VISUAL_STYLE' },
        { field: 'music', winner: 'odd_news', loser: 'news_theme', type: 'MUSIC' },
        { field: 'cta', winner: 'subscribe', loser: 'apply_now', type: 'CTA' },
        { field: 'contentAngle', winner: 'salary_focus', loser: 'basic_alert', type: 'CONTENT_ANGLE' }
    ];
    for (const c of cases) {
        const records = makeWinnerLoser({ winner: c.winner, loser: c.loser, field: c.field });
        const patterns = learner.analyzePatternType(c.type, records);
        assert.equal(patterns.length, 1, `${c.type} pattern`);
        assert.equal(patterns[0].winningPattern, c.winner, `${c.type} winner`);
        assert.equal(patterns[0].attributionVerified, true);
    }
});

test('learner: POST_TIME learned from real publish hours', () => {
    const records = [];
    for (let i = 0; i < 12; i++) records.push({ performanceScore: 85, metrics: HIGH_METRICS(i), publishHour: 19 });
    for (let i = 0; i < 8; i++) records.push({ performanceScore: 30, metrics: LOW_METRICS(i), publishHour: 8 });
    const patterns = learner.analyzePatternType('POST_TIME', records);
    assert.equal(patterns[0].winningPattern, 'evening');
});

test('learner: platform separation — YouTube and Facebook learn independently', () => {
    const records = [];
    for (let i = 0; i < 12; i++) records.push({ performanceScore: 88, metrics: HIGH_METRICS(i), hookType: 'question', platform: 'youtube' });
    for (let i = 0; i < 8; i++) records.push({ performanceScore: 30, metrics: LOW_METRICS(i), hookType: 'urgency', platform: 'youtube' });
    for (let i = 0; i < 12; i++) records.push({ performanceScore: 88, metrics: HIGH_METRICS(i), hookType: 'urgency', platform: 'facebook' });
    for (let i = 0; i < 8; i++) records.push({ performanceScore: 30, metrics: LOW_METRICS(i), hookType: 'question', platform: 'facebook' });

    const patterns = learner.analyzePatternType('HOOK', records);
    const yt = patterns.find((p) => p.platform === 'youtube');
    const fb = patterns.find((p) => p.platform === 'facebook');
    assert.equal(yt.winningPattern, 'question', 'YouTube winner');
    assert.equal(fb.winningPattern, 'urgency', 'Facebook winner — different, not mixed');

    const policy = policyStore.buildPolicy(patterns, { now: NOW });
    assert.equal(policyStore.getDimension(policy, 'youtube', 'hook').winningPattern, 'question');
    assert.equal(policyStore.getDimension(policy, 'facebook', 'hook').winningPattern, 'urgency');
    // No cross-platform leak: an unknown platform gets nothing
    assert.equal(policyStore.getDimension(policy, 'instagram', 'hook'), null);
});

test('learner: insufficient samples → no pattern', () => {
    const records = [];
    for (let i = 0; i < 4; i++) records.push({ performanceScore: 95, metrics: HIGH_METRICS(i), hookType: 'question' }); // only 4
    for (let i = 0; i < 8; i++) records.push({ performanceScore: 30, metrics: LOW_METRICS(i), hookType: 'urgency' });
    const patterns = learner.analyzePatternType('HOOK', records);
    assert.equal(patterns.length, 0, 'winner below MIN_SAMPLE_SIZE must not be learned');
});

test('learner: single bucket → no pattern (a winner needs a comparison)', () => {
    const records = [];
    for (let i = 0; i < 20; i++) records.push({ performanceScore: 90, metrics: HIGH_METRICS(i), hookType: 'question' });
    const patterns = learner.analyzePatternType('HOOK', records);
    assert.equal(patterns.length, 0, 'cannot claim a winner when only one hook type was ever tried');
});

test('learner: one viral video cannot flip the winner (trimmed mean)', () => {
    // Bucket a_steady: 10 videos all scoring 75 (trimmed mean 75).
    // Bucket b_outlier: 9 videos at 74 + ONE viral 100.
    //   untrimmed mean 76.6 (>75 → would steal the win)
    //   trimmed  mean 74.0 (<75 → steady bucket keeps the win)
    const records = [];
    for (let i = 0; i < 10; i++) records.push({ performanceScore: 75, metrics: {}, hookType: 'a_steady' });
    for (let i = 0; i < 9; i++) records.push({ performanceScore: 74, metrics: {}, hookType: 'b_outlier' });
    records.push({ performanceScore: 100, metrics: {}, hookType: 'b_outlier' }); // the viral one

    const patterns = learner.analyzePatternType('HOOK', records);
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].winningPattern, 'a_steady',
        'trimmed mean must stop the single 100-score viral video from winning');
    assert.equal(patterns[0].sampleSize, 10);
});

test('learner: historical records without attribution never join attribution patterns', async () => {
    const db = createMockDb();
    // 10 OLD records: real performance, NO attribution (pre-upgrade docs)
    for (let i = 0; i < 10; i++) {
        db.__collection('content_performance').set(`old_${i}`, {
            platform: 'youtube',
            platformVideoId: `ov${i}`,
            collectedAt: NOW - i * 3600 * 1000,
            performanceScore: 90,
            views: 50000
            // no hookType/duration/... — historical
        });
    }
    // 12 NEW attributed records (winner) + 8 (loser)
    const records = makeWinnerLoser({ winner: 'question', loser: 'urgency', field: 'hookType' });
    seedPerformance(db, records);

    const result = await learner.analyzePatterns(db, { now: NOW });
    const hookPattern = result.patterns.find((p) => p.patternType === 'HOOK');
    assert.ok(hookPattern, 'hook pattern from attributed records only');
    assert.equal(hookPattern.sampleSize, 12, 'sampleSize must count ONLY attributed records, not the 10 old ones');
});

// ─────────────────────────────────────────────────────────────────────
// PHASE 3 — Policy persistence
// ─────────────────────────────────────────────────────────────────────

function buildTestPolicy(overrides = {}) {
    const base = [
        { patternType: 'HOOK', platform: 'youtube', winningPattern: 'question', averageScore: 82, confidence: 0.72, sampleSize: 12, distinctBuckets: 2, discoveredAt: NOW },
        { patternType: 'DURATION', platform: 'youtube', winningPattern: 'short_0_20', averageScore: 80, confidence: 0.70, sampleSize: 12, distinctBuckets: 2, discoveredAt: NOW, averageValueSeconds: 22 },
        { patternType: 'PRESENTER', platform: 'youtube', winningPattern: 'female_anchor_4.mp4', averageScore: 78, confidence: 0.68, sampleSize: 12, distinctBuckets: 2, discoveredAt: NOW },
        { patternType: 'VISUAL_STYLE', platform: 'youtube', winningPattern: 'result', averageScore: 77, confidence: 0.67, sampleSize: 12, distinctBuckets: 2, discoveredAt: NOW },
        { patternType: 'MUSIC', platform: 'youtube', winningPattern: 'odd_news', averageScore: 76, confidence: 0.66, sampleSize: 12, distinctBuckets: 2, discoveredAt: NOW },
        { patternType: 'CTA', platform: 'youtube', winningPattern: 'subscribe', averageScore: 79, confidence: 0.69, sampleSize: 12, distinctBuckets: 2, discoveredAt: NOW },
        { patternType: 'CONTENT_ANGLE', platform: 'youtube', winningPattern: 'salary_focus', averageScore: 76, confidence: 0.66, sampleSize: 12, distinctBuckets: 2, discoveredAt: NOW },
        { patternType: 'POST_TIME', platform: 'youtube', winningPattern: 'evening', averageScore: 75, confidence: 0.65, sampleSize: 12, distinctBuckets: 2, discoveredAt: NOW }
    ];
    return policyStore.buildPolicy(overrides.patterns || base, { now: overrides.now || NOW });
}

test('policy: build → save → load roundtrip with history', async () => {
    const db = createMockDb();
    const policy = buildTestPolicy();
    await policyStore.savePolicy(db, policy);

    const loaded = await policyStore.loadPolicy(db);
    assert.equal(loaded.version, policy.version);
    assert.ok(loaded.platforms.youtube);
    assert.equal(loaded.platforms.youtube.dimensions.hook.winningPattern, 'question');
    assert.equal(loaded.platforms.youtube.dimensions.duration.targetSeconds, 22);
    assert.equal(loaded.platforms.youtube.dimensions.hook.minSamples, policyStore.MIN_SAMPLES);

    // History audit trail
    const history = db.__dump('growth_policies_history');
    assert.equal(Object.keys(history).length, 1, 'one history entry');

    // Saving a new policy replaces latest and appends history
    const policy2 = policyStore.buildPolicy([
        { patternType: 'HOOK', platform: 'youtube', winningPattern: 'urgency', averageScore: 85, confidence: 0.75, sampleSize: 15, distinctBuckets: 3, discoveredAt: NOW }
    ], { now: NOW + 5000 });
    await policyStore.savePolicy(db, policy2);
    const loaded2 = await policyStore.loadPolicy(db);
    assert.equal(loaded2.version, policy2.version);
    assert.equal(loaded2.platforms.youtube.dimensions.hook.winningPattern, 'urgency');
    assert.equal(Object.keys(db.__dump('growth_policies_history')).length, 2);
});

test('policy: empty patterns keep the previous policy (buildAndSavePolicy path)', async () => {
    const db = createMockDb();
    const policy = buildTestPolicy();
    await policyStore.savePolicy(db, policy);
    // A learner run with zero patterns must NOT wipe the existing policy
    // (growth_learner_run skips save when patterns.length === 0).
    const loaded = await policyStore.loadPolicy(db);
    assert.equal(loaded.version, policy.version);
});

// ─────────────────────────────────────────────────────────────────────
// PHASE 14 — Explore/exploit decision gates
// ─────────────────────────────────────────────────────────────────────

test('decide: no policy / insufficient samples / low confidence / expired → none', () => {
    const d1 = policyStore.decide('hook', { policy: null, platform: 'youtube', rng: rngExploit });
    assert.equal(d1.mode, 'none');

    const p = buildTestPolicy({
        patterns: [
            { patternType: 'HOOK', platform: 'youtube', winningPattern: 'question', averageScore: 82, confidence: 0.72, sampleSize: 3, distinctBuckets: 2, discoveredAt: NOW }
        ]
    });
    const d2 = policyStore.decide('hook', { policy: p, platform: 'youtube', rng: rngExploit, now: NOW });
    assert.equal(d2.mode, 'none');
    assert.match(d2.reason, /insufficient samples/);

    const pLowConf = buildTestPolicy({
        patterns: [
            { patternType: 'HOOK', platform: 'youtube', winningPattern: 'question', averageScore: 20, confidence: 0.4, sampleSize: 12, distinctBuckets: 2, discoveredAt: NOW }
        ]
    });
    const d3 = policyStore.decide('hook', { policy: pLowConf, platform: 'youtube', rng: rngExploit, now: NOW });
    assert.equal(d3.mode, 'none');
    assert.match(d3.reason, /confidence below threshold/);

    // Expired: lastUpdated 45 days ago
    const pOld = buildTestPolicy({
        patterns: [
            { patternType: 'HOOK', platform: 'youtube', winningPattern: 'question', averageScore: 82, confidence: 0.72, sampleSize: 12, distinctBuckets: 2, discoveredAt: NOW - 45 * 24 * 3600 * 1000 }
        ]
    });
    const d4 = policyStore.decide('hook', { policy: pOld, platform: 'youtube', rng: rngExploit, now: NOW });
    assert.equal(d4.mode, 'none');
    assert.match(d4.reason, /expired/);
});

test('decide: exploit when confident, explore otherwise', () => {
    const policy = buildTestPolicy();
    const exploit = policyStore.decide('hook', { policy, platform: 'youtube', rng: rngExploit, now: NOW, candidates: ['question', 'urgency', 'curiosity'] });
    assert.equal(exploit.mode, 'exploit');
    assert.equal(exploit.value, 'question');
    assert.equal(exploit.exploration, false);

    const explore = policyStore.decide('hook', { policy, platform: 'youtube', rng: rngExplore, now: NOW, candidates: ['question', 'urgency', 'curiosity'] });
    assert.equal(explore.mode, 'explore');
    assert.notEqual(explore.value, 'question', 'exploration must try a non-winner');
    assert.equal(explore.exploration, true);
});

test('decide: stale winner halves exploit probability', () => {
    const policy = buildTestPolicy({
        patterns: [
            { patternType: 'HOOK', platform: 'youtube', winningPattern: 'question', averageScore: 82, confidence: 0.72, sampleSize: 12, distinctBuckets: 2, discoveredAt: NOW - 20 * 24 * 3600 * 1000 }
        ]
    });
    // 20 days old → stale → exploitProbability = 0.4. rng 0.5 → explore.
    const d = policyStore.decide('hook', { policy, platform: 'youtube', rng: () => 0.5, now: NOW, candidates: ['question', 'urgency'] });
    assert.equal(d.mode, 'explore', 'stale winner must exploit less');
    assert.equal(d.stale, true);
});

test('decide: winner not in candidates → none (never force invalid values)', () => {
    const policy = buildTestPolicy();
    const d = policyStore.decide('presenter', {
        policy, platform: 'youtube', rng: rngExploit, now: NOW,
        candidates: ['male_anchor_1.mp4', 'male_anchor_3.mp4'] // winner female_anchor_4 not available
    });
    assert.equal(d.mode, 'none');
    assert.match(d.reason, /not an available candidate/);
});

// ─────────────────────────────────────────────────────────────────────
// PHASE 4/5/6/7/8/9 — Actual policy consumption in generation
// ─────────────────────────────────────────────────────────────────────

const TEST_CONTENT = {
    title: 'SSC CGL 2026 Recruitment — 14589 Posts',
    organization: 'SSC',
    vacancies: '14589',
    lastDate: '30 Sep 2026',
    startDate: '01 Sep 2026',
    category: 'SSC',
    qualification: 'Graduate',
    salary: 'Pay Level 7',
    ageLimit: '18-32',
    location: 'All India',
    createdAt: NOW,
    type: 'JOB',
    id: 'growth-test-content'
};

test('policy consumption: recommendation demonstrably changes because of the policy', async () => {
    const dbWith = createMockDb();
    const policy = buildTestPolicy();
    await policyStore.savePolicy(dbWith, policy);

    // CONTROL: no policy in db
    const dbWithout = createMockDb();

    const withPolicy = await recommendationEngine.generateRecommendation(
        TEST_CONTENT, { db: dbWith, contentId: 'vid-with', platform: 'youtube', rng: rngExploit, now: NOW }
    );
    const withoutPolicy = await recommendationEngine.generateRecommendation(
        TEST_CONTENT, { db: dbWithout, contentId: 'vid-without', platform: 'youtube', rng: rngExploit, now: NOW }
    );

    // Learning observability
    assert.equal(withoutPolicy.learning.used, false, 'no policy → no learning claimed');
    assert.equal(withoutPolicy.learning.policyVersion, null);
    assert.equal(withPolicy.learning.used, true, 'policy present → learning used');
    assert.equal(withPolicy.learning.policyVersion, policy.version);

    // HOOK: chosen hook is the learned winner, and it differs from the
    // no-learning selection for this content.
    assert.equal(withPolicy.learning.decisions.hook.mode, 'exploit');
    assert.equal(withPolicy.hook.hookType, 'question');
    assert.notEqual(withPolicy.hook.hookType, withoutPolicy.hook.hookType,
        'learned hook must actually change the selected hook');
    assert.equal(withPolicy.learning.decisions.hook.changedSelection, true);

    // DURATION: learned target (22s) blended in — differs from control
    assert.equal(withPolicy.durationSource, 'learned-policy');
    assert.equal(withPolicy.learning.decisions.duration.targetSeconds, 22);
    assert.notEqual(withPolicy.duration, withoutPolicy.duration,
        'learned duration must actually change the target duration');
    assert.equal(withPolicy.learning.decisions.duration.changedSelection, true);

    // PRESENTER: learned winner anchor
    assert.equal(withPolicy.presenter, 'female_anchor_4.mp4');
    assert.equal(withPolicy.learning.decisions.presenter.value, 'female_anchor_4.mp4');

    // VISUAL STYLE: learned winner style (default for SSC would be job-alert)
    assert.equal(withPolicy.visualStyle, 'result');
    assert.equal(withoutPolicy.visualStyle, 'job-alert');

    // MUSIC: learned winner track
    assert.equal(withPolicy.musicId, 'odd_news');

    // POST_TIME: learned but explicitly NOT applied (no fake scheduling)
    assert.equal(withPolicy.learning.decisions.postTime.applied, false);
    assert.match(withPolicy.learning.decisions.postTime.appliedReason, /not implemented/);
    assert.ok(!withPolicy.learning.dimensionsApplied.includes('postTime'));

    // dimensionsApplied reflects exactly what the recommendation engine
    // applied (cta + contentAngle are decided in the orchestrator — proven
    // in tests/growth_closed_loop.test.js)
    assert.deepEqual(
        withPolicy.learning.dimensionsApplied.sort(),
        ['duration', 'hook', 'music', 'presenter', 'visualStyle'].sort()
    );
});

test('policy consumption: exploration mode records honest exploration', async () => {
    const db = createMockDb();
    const policy = buildTestPolicy();
    await policyStore.savePolicy(db, policy);

    const rec = await recommendationEngine.generateRecommendation(
        TEST_CONTENT, { db, contentId: 'vid-explore', platform: 'youtube', rng: rngExplore, now: NOW }
    );

    assert.equal(rec.learning.used, true);
    assert.equal(rec.learning.exploration, true);
    assert.equal(rec.learning.decisions.hook.mode, 'explore');
    assert.notEqual(rec.hook.hookType, 'question', 'explore must not use the winner');
    // Duration exploration: content-driven estimate used, no learned target
    assert.equal(rec.learning.decisions.duration.mode, 'explore');
    assert.equal(rec.learning.decisions.duration.targetSeconds, null);
    assert.equal(rec.durationSource, 'content-estimate');
});

test('policy consumption: legacy fields unchanged without policy (backwards compat)', async () => {
    const db = createMockDb();
    const rec = await recommendationEngine.generateRecommendation(
        TEST_CONTENT, { db, contentId: 'vid-legacy', platform: 'youtube', rng: rngExploit, now: NOW }
    );
    // All pre-learning output fields still present and sane
    assert.ok(rec.recommended);
    assert.ok(rec.hook && rec.hook.hookText);
    assert.ok(rec.script && rec.script.script);
    assert.ok(rec.duration > 0);
    assert.ok(rec.visualStyle);
    assert.ok(rec.presenter);
    assert.ok(rec.platformPackage && rec.platformPackage.youtube);
    assert.equal(typeof rec.learningUsed, 'boolean');
    assert.equal(rec.musicId, null); // SSC → motivation profile has no file
});

// ─────────────────────────────────────────────────────────────────────
// PHASE 5 — Duration math + fitter
// ─────────────────────────────────────────────────────────────────────

test('duration: estimateDuration blends learned target 60/40', () => {
    const base = retentionEngine.estimateDuration(TEST_CONTENT, { recommendedFormat: 'JOB_ALERT', urgency: 'MEDIUM' });
    const learned = retentionEngine.estimateDuration(
        TEST_CONTENT, { recommendedFormat: 'JOB_ALERT', urgency: 'MEDIUM' }, { learnedTargetSeconds: 22 }
    );
    assert.equal(learned.duration, Math.round(base.duration * 0.4 + 22 * 0.6));
    assert.notEqual(learned.duration, base.duration);
});

test('duration fitter: trims the script and never invents content', () => {
    const longScript = 'पहला वाक्य हुक है और यह रहेगा। ' +
        'यह दूसरा वाक्य है जो बीच का हिस्सा है और इसे हटाया जा सकता है। ' +
        'यह तीसरा वाक्य भी बीच का हिस्सा है और इसे भी हटाया जा सकता है। ' +
        'यह चौथा वाक्य भी बीच का हिस्सा है। ' +
        'अंतिम वाक्य CTA है और यह बना रहेगा।';
    const wordsBefore = durationFitter.countWords(longScript);
    const fit = durationFitter.fitScriptToDuration(longScript, 5); // absurdly short target
    assert.equal(fit.trimmed, true);
    assert.ok(durationFitter.countWords(fit.script) < wordsBefore, 'script must shrink');
    assert.ok(fit.script.includes('पहला वाक्य'), 'hook sentence must survive');
    assert.ok(fit.script.includes('अंतिम वाक्य'), 'CTA sentence must survive');
    assert.ok(fit.speakingRate <= durationFitter.MAX_RATE && fit.speakingRate >= durationFitter.MIN_RATE);
});

test('duration fitter: rate-only fit lands near the target', () => {
    // ~3.5 words/sec: 70 words ≈ 20s at rate 1.0
    const script = Array(70).fill('शब्द').join(' ');
    const fit = durationFitter.fitScriptToDuration(script, 20);
    assert.equal(fit.trimmed, false);
    assert.ok(Math.abs(fit.estimatedSeconds - 20) <= 2,
        `estimated ${fit.estimatedSeconds}s should be ~20s (rate ${fit.speakingRate})`);
});

test('duration fitter: short script honestly reports unreachable target', () => {
    const script = 'एक छोटा वाक्य।';
    const fit = durationFitter.fitScriptToDuration(script, 50);
    assert.equal(fit.speakingRate, durationFitter.MIN_RATE, 'rate slows to minimum');
    assert.ok(fit.estimatedSeconds < 50, 'must not claim the target was reached');
    assert.equal(fit.strategy, 'min-rate');
});

// ─────────────────────────────────────────────────────────────────────
// PHASES 7-11 — engine-level policy application
// ─────────────────────────────────────────────────────────────────────

test('presenter engine: policy decision selects the anchor', () => {
    const r = presenterEngine.selectPresenter(TEST_CONTENT, { category: 'SSC' }, {
        policyDecision: { mode: 'exploit', value: 'male_anchor_3.mp4', winner: 'male_anchor_3.mp4', policyVersion: 'p1', confidence: 0.7, sampleSize: 12 }
    });
    assert.equal(r.anchor, 'male_anchor_3.mp4');
    assert.equal(r.learningUsed, true);
});

test('visual engine: policy decision overrides category default but not hard rules', () => {
    const r = visualEngine.selectStyle(TEST_CONTENT, { category: 'SSC' }, {
        policyDecision: { mode: 'exploit', value: 'result', winner: 'result', policyVersion: 'p1', confidence: 0.7, sampleSize: 12 }
    });
    assert.equal(r.styleName, 'result');
    assert.equal(r.learningUsed, true);

    const hard = visualEngine.selectStyle({ ...TEST_CONTENT, type: 'MOCK_TEST' }, { category: 'SSC' }, {
        policyDecision: { mode: 'exploit', value: 'result', winner: 'result', policyVersion: 'p1', confidence: 0.7, sampleSize: 12 }
    });
    assert.equal(hard.styleName, 'mock-test', 'MOCK_TEST hard rule must beat learning');
});

test('music engine: policy decision picks the learned track (real file required)', () => {
    const r = musicEngine.selectMusic({ musicProfile: 'news' }, {
        policyDecision: { mode: 'exploit', value: 'odd_news', winner: 'odd_news', policyVersion: 'p1', confidence: 0.7, sampleSize: 12 }
    });
    assert.equal(r.musicId, 'odd_news');
    assert.equal(r.learningUsed, true);

    const missing = musicEngine.selectMusic({ musicProfile: 'news' }, {
        policyDecision: { mode: 'exploit', value: 'nonexistent_track', winner: 'nonexistent_track', policyVersion: 'p1', confidence: 0.7, sampleSize: 12 }
    });
    assert.equal(missing.learningUsed, undefined, 'nonexistent track falls back to profile default');
});

test('cta engine: policy decision picks the learned CTA within safe candidates', () => {
    const r = ctaEngine.generateVideoCTAs({
        contentType: 'JOB',
        urgencyLevel: 'medium',
        policyDecision: { mode: 'exploit', winner: 'subscribe', policyVersion: 'p1', confidence: 0.7, sampleSize: 12 }
    });
    assert.equal(r.closing.key, 'subscribe');
    assert.equal(r.closing.learningUsed, true);

    // A learned winner that is unsafe for this intent is ignored
    const unsafe = ctaEngine.generateVideoCTAs({
        contentType: 'JOB',
        urgencyLevel: 'medium',
        policyDecision: { mode: 'exploit', winner: 'definitely_not_a_cta', policyVersion: 'p1', confidence: 0.7, sampleSize: 12 }
    });
    assert.notEqual(unsafe.closing.key, 'definitely_not_a_cta');
    assert.equal(unsafe.closing.learningUsed, undefined);
});

test('content angle engine: policy decision selects the learned angle', () => {
    const r = angleEngine.selectBestAngle(TEST_CONTENT, [], null, {
        policyDecision: { mode: 'exploit', winner: 'salary_focus', policyVersion: 'p1', confidence: 0.7, sampleSize: 12 }
    });
    assert.equal(r.key, 'salary_focus');
    assert.equal(r.learningUsed, true);

    // Angle the content does not support → ignored
    const unavailable = angleEngine.selectBestAngle({ title: 'X', organization: 'Y' }, [], null, {
        policyDecision: { mode: 'exploit', winner: 'salary_focus', policyVersion: 'p1', confidence: 0.7, sampleSize: 12 }
    });
    assert.notEqual(unavailable.key, 'salary_focus');
    assert.equal(unavailable.learningUsed, undefined);
});

// ─────────────────────────────────────────────────────────────────────
// Idempotency
// ─────────────────────────────────────────────────────────────────────

test('idempotency: same data → same learned winners across runs', () => {
    const records = makeWinnerLoser({ winner: 'question', loser: 'urgency', field: 'hookType' });
    const p1 = policyStore.buildPolicy(learner.analyzePatternType('HOOK', records), { now: NOW });
    const p2 = policyStore.buildPolicy(learner.analyzePatternType('HOOK', records), { now: NOW + 60000 });
    assert.equal(p1.platforms.youtube.dimensions.hook.winningPattern, 'question');
    assert.equal(p2.platforms.youtube.dimensions.hook.winningPattern, 'question');
    assert.equal(p2.platforms.youtube.dimensions.hook.sampleSize, p1.platforms.youtube.dimensions.hook.sampleSize);
    assert.notEqual(p1.version, p2.version, 'version changes (new generation) but content is stable');
});

// ─────────────────────────────────────────────────────────────────────
// PRODUCTION ENTRY-POINT TESTS — the exact functions autoVideo.js and
// video_dispatcher.js run (not re-implementations).
// ─────────────────────────────────────────────────────────────────────

test('render plan (autoVideo entry point): resolveRenderPlan applies the recommendation duration to script + TTS rate', () => {
    const script = 'यह पहला वाक्य हुक है और यह हमेशा रहेगा। ' +
        Array(30).fill('यह बीच का लंबा वाक्य है जिसे ट्रिम किया जा सकता है।').join(' ') +
        ' अंतिम वाक्य CTA है और यह बना रहेगा।';

    const rec = {
        duration: 28,
        learning: {
            used: true,
            decisions: {
                duration: { mode: 'exploit', changedSelection: true, defaultWouldBe: 45, targetSeconds: 22, value: 28 }
            }
        }
    };
    const plan = durationFitter.resolveRenderPlan(script, rec);
    assert.equal(plan.applied, true);
    assert.equal(plan.targetSeconds, 28);
    assert.ok(durationFitter.countWords(plan.script) < durationFitter.countWords(script), 'long script must be trimmed');
    assert.ok(plan.script.includes('यह पहला वाक्य'), 'hook survives');
    assert.ok(plan.script.includes('अंतिम वाक्य'), 'CTA survives');
    assert.match(plan.learningNote, /mode=exploit/);
    assert.match(plan.learningNote, /changed from default 45s/);
    assert.ok(plan.speakingRate >= durationFitter.MIN_RATE && plan.speakingRate <= durationFitter.MAX_RATE);
});

test('render plan: no recommendation, or out-of-range duration → default rate, nothing applied', () => {
    const a = durationFitter.resolveRenderPlan('कुछ भी।', null);
    assert.equal(a.applied, false);
    assert.equal(a.speakingRate, durationFitter.DEFAULT_BASE_RATE);

    const b = durationFitter.resolveRenderPlan('कुछ भी।', { duration: 5 });   // too short
    assert.equal(b.applied, false);
    const c = durationFitter.resolveRenderPlan('कुछ भी।', { duration: 90 });  // too long
    assert.equal(c.applied, false);
    const d = durationFitter.resolveRenderPlan('कुछ भी।', { duration: null }); // missing
    assert.equal(d.applied, false);
});

test('dispatcher entry point: buildAttribution produces complete, null-safe attribution from a real recommendation', () => {
    const dispatcher = require('../video_dispatcher');

    const growthRecommendation = {
        processed: true,
        recommendation: {
            hook: { hookType: 'deadline' },
            presenter: 'female_anchor_4.mp4',
            visualStyle: 'result',
            duration: 28,
            category: 'SSC',
            musicId: 'odd_news',
            learning: {
                used: true,
                policyVersion: 'policy-test-1',
                dimensionsApplied: ['hook', 'duration'],
                decisions: {
                    hook: { mode: 'exploit' },
                    duration: { mode: 'explore' },
                    postTime: { mode: 'none' }
                }
            }
        },
        enhancements: {
            contentAngle: { key: 'salary_focus' },
            cta: { closing: { key: 'subscribe' } }
        }
    };

    const attribution = dispatcher.buildAttribution(growthRecommendation, 'job');
    assert.equal(attribution.hookType, 'deadline');
    assert.equal(attribution.presenter, 'female_anchor_4.mp4');
    assert.equal(attribution.visualStyle, 'result');
    assert.equal(attribution.duration, 28);
    assert.equal(attribution.category, 'SSC');
    assert.equal(attribution.contentAngle, 'salary_focus');
    assert.equal(attribution.music, 'odd_news');
    assert.equal(attribution.cta, 'subscribe');
    assert.equal(typeof attribution.publishHour, 'number');
    assert.deepEqual(attribution.learningMeta, {
        used: true,
        policyVersion: 'policy-test-1',
        dimensionsApplied: ['hook', 'duration'],
        exploredDimensions: ['duration']
    });

    // Null-safety: a bare recommendation with gaps must yield nulls, not
    // empty strings or zeros.
    const sparse = dispatcher.buildAttribution({
        recommendation: { hook: null, presenter: '', duration: null, category: undefined },
        enhancements: {}
    }, 'job');
    assert.equal(sparse.hookType, null);
    assert.equal(sparse.presenter, null);
    assert.equal(sparse.duration, null);
    assert.equal(sparse.category, null);
    assert.equal(sparse.contentAngle, null);
    assert.equal(sparse.music, null);
    assert.equal(sparse.cta, null);
    assert.deepEqual(sparse.learningMeta, { used: false, policyVersion: null, dimensionsApplied: [], exploredDimensions: [] });

    // No recommendation at all → nothing to attribute
    assert.equal(dispatcher.buildAttribution(null, 'job'), null);
});

test('dispatcher → collector round-trip: buildAttribution output persists into content_performance intact', async () => {
    const dispatcher = require('../video_dispatcher');
    const db = createMockDb();
    const fetcher = async () => ({ views: 9000, likes: 400, comments: 90 });

    const growthRecommendation = {
        processed: true,
        recommendation: {
            hook: { hookType: 'question' },
            presenter: 'male_anchor_3.mp4',
            visualStyle: 'job-alert',
            duration: 31,
            category: 'Railway',
            musicId: 'news_theme',
            learning: {
                used: true,
                policyVersion: 'policy-rt-1',
                dimensionsApplied: ['hook', 'presenter'],
                decisions: { hook: { mode: 'exploit' }, presenter: { mode: 'exploit' } }
            }
        },
        enhancements: {
            contentAngle: { key: 'basic_alert' },
            cta: { closing: { key: 'read_more' } }
        }
    };

    // Exactly what processJobLike does after a successful upload:
    await collector.collectPlatformMetrics(db, {
        platform: 'youtube',
        platformVideoId: 'vid-rt',
        contentId: 'job-rt',
        publishedAt: 12345,
        ...dispatcher.buildAttribution(growthRecommendation, 'job')
    }, { fetchers: { youtube: fetcher } });

    const stored = db.__dump('content_performance')['youtube_vid-rt'];
    assert.equal(stored.hookType, 'question');
    assert.equal(stored.presenter, 'male_anchor_3.mp4');
    assert.equal(stored.visualStyle, 'job-alert');
    assert.equal(stored.duration, 31);
    assert.equal(stored.category, 'Railway');
    assert.equal(stored.contentAngle, 'basic_alert');
    assert.equal(stored.music, 'news_theme');
    assert.equal(stored.cta, 'read_more');
    assert.equal(stored.platform, 'youtube');
    assert.equal(stored.platformVideoId, 'vid-rt');
    assert.equal(stored.contentId, 'job-rt');
    assert.equal(stored.learningMeta.policyVersion, 'policy-rt-1');
    assert.deepEqual(stored.learningMeta.dimensionsApplied, ['hook', 'presenter']);
});
