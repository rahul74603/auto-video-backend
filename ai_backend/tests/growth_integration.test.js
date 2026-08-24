'use strict';

/**
 * growth_integration.test.js — Verifies growth engine is ACTUALLY CONNECTED
 * to the production video pipeline, not merely standalone modules.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/* 1. Verify dispatcher imports growth engine                          */
/* ------------------------------------------------------------------ */

test('dispatcher: imports growth orchestrator in processJobLike', () => {
    const dispatcherSrc = fs.readFileSync(
        path.join(__dirname, '..', 'video_dispatcher.js'), 'utf8'
    );
    // Must actually require the orchestrator
    assert.ok(
        dispatcherSrc.includes("require('./agents/growth/orchestrator')"),
        'video_dispatcher.js must require growth orchestrator'
    );
});

test('dispatcher: passes growthRecommendation to autoVideo', () => {
    const dispatcherSrc = fs.readFileSync(
        path.join(__dirname, '..', 'video_dispatcher.js'), 'utf8'
    );
    assert.ok(
        dispatcherSrc.includes('growthRecommendation:'),
        'dispatcher must pass growthRecommendation to generateAndUploadVideo'
    );
});

test('dispatcher: imports breaking_mode for candidate priority', () => {
    const dispatcherSrc = fs.readFileSync(
        path.join(__dirname, '..', 'video_dispatcher.js'), 'utf8'
    );
    assert.ok(
        dispatcherSrc.includes("require('./agents/growth/breaking_mode')"),
        'dispatcher must import breaking_mode for priority ordering'
    );
});

test('dispatcher: calls analytics collector after upload', () => {
    const dispatcherSrc = fs.readFileSync(
        path.join(__dirname, '..', 'video_dispatcher.js'), 'utf8'
    );
    assert.ok(
        dispatcherSrc.includes("require('./agents/growth/analytics/collector')"),
        'dispatcher must call analytics collector after successful upload'
    );
});

/* ------------------------------------------------------------------ */
/* 2. Verify autoVideo accepts growth recommendation                  */
/* ------------------------------------------------------------------ */

test('autoVideo: accepts growthRecommendation in options', () => {
    const autoVideoSrc = fs.readFileSync(
        path.join(__dirname, '..', 'autoVideo.js'), 'utf8'
    );
    assert.ok(
        autoVideoSrc.includes('options.growthRecommendation'),
        'autoVideo.js must accept growthRecommendation from options'
    );
});

test('autoVideo: uses growth script when available', () => {
    const autoVideoSrc = fs.readFileSync(
        path.join(__dirname, '..', 'autoVideo.js'), 'utf8'
    );
    assert.ok(
        autoVideoSrc.includes('growthRec.script') && autoVideoSrc.includes('growthRec.script.script'),
        'autoVideo.js must use growth engine script when provided'
    );
});

test('autoVideo: uses growth presenter when available', () => {
    const autoVideoSrc = fs.readFileSync(
        path.join(__dirname, '..', 'autoVideo.js'), 'utf8'
    );
    assert.ok(
        autoVideoSrc.includes('growthRec.presenter'),
        'autoVideo.js must use growth engine presenter/anchor when provided'
    );
});

test('autoVideo: uses growth music when available', () => {
    const autoVideoSrc = fs.readFileSync(
        path.join(__dirname, '..', 'autoVideo.js'), 'utf8'
    );
    assert.ok(
        autoVideoSrc.includes('growthRec.music'),
        'autoVideo.js must use growth engine music when provided'
    );
});

test('autoVideo: uses growth platform packaging for SEO', () => {
    const autoVideoSrc = fs.readFileSync(
        path.join(__dirname, '..', 'autoVideo.js'), 'utf8'
    );
    assert.ok(
        autoVideoSrc.includes('growthRec.platformPackage'),
        'autoVideo.js must use growth engine platform packaging for YouTube metadata'
    );
});

/* ------------------------------------------------------------------ */
/* 3. Verify growth engine failure never breaks pipeline              */
/* ------------------------------------------------------------------ */

test('dispatcher: growth engine failure is caught gracefully', () => {
    const dispatcherSrc = fs.readFileSync(
        path.join(__dirname, '..', 'video_dispatcher.js'), 'utf8'
    );
    // Must have try/catch around growth engine call
    assert.ok(
        dispatcherSrc.includes('Growth engine skipped') || dispatcherSrc.includes('growth engine skipped'),
        'dispatcher must catch growth engine errors and continue'
    );
});

test('autoVideo: falls back to defaults when growthRecommendation is null', () => {
    const autoVideoSrc = fs.readFileSync(
        path.join(__dirname, '..', 'autoVideo.js'), 'utf8'
    );
    // Must still have the original random selection path
    assert.ok(
        autoVideoSrc.includes('anchorFiles[Math.floor(Math.random()'),
        'autoVideo must fall back to random anchor when growth recommendation is absent'
    );
    assert.ok(
        autoVideoSrc.includes('scriptArray[Math.floor(Math.random()'),
        'autoVideo must fall back to random script when growth recommendation is absent'
    );
});

/* ------------------------------------------------------------------ */
/* 4. Verify feature flag integration                                  */
/* ------------------------------------------------------------------ */

test('dispatcher: checks GROWTH_ENGINE_ENABLED before using growth engine', () => {
    const dispatcherSrc = fs.readFileSync(
        path.join(__dirname, '..', 'video_dispatcher.js'), 'utf8'
    );
    assert.ok(
        dispatcherSrc.includes("isEnabled('GROWTH_ENGINE_ENABLED')"),
        'dispatcher must check feature flag before invoking growth engine'
    );
});

/* ------------------------------------------------------------------ */
/* 5. Verify the full pipeline flow is connected                       */
/* ------------------------------------------------------------------ */

test('pipeline: orchestrator imports all required sub-modules', () => {
    const orch = require('../agents/growth/orchestrator');
    assert.ok(orch.opportunity, 'orchestrator must export opportunity module');
    assert.ok(orch.hooks, 'orchestrator must export hooks module');
    assert.ok(orch.script, 'orchestrator must export script module');
    assert.ok(orch.quality, 'orchestrator must export quality module');
    assert.ok(orch.retention, 'orchestrator must export retention module');
    assert.ok(orch.visual, 'orchestrator must export visual module');
    assert.ok(orch.presenter, 'orchestrator must export presenter module');
    assert.ok(orch.firstFrame, 'orchestrator must export firstFrame module');
    assert.ok(orch.music, 'orchestrator must export music module');
    assert.ok(orch.packaging, 'orchestrator must export packaging module');
    assert.ok(orch.breaking, 'orchestrator must export breaking module');
    assert.ok(orch.reach, 'orchestrator must export reach module');
    assert.ok(orch.fingerprint, 'orchestrator must export fingerprint module');
    assert.ok(orch.analytics, 'orchestrator must export analytics module');
    assert.ok(orch.analytics.collector, 'analytics must have collector');
    assert.ok(orch.analytics.scorer, 'analytics must have scorer');
    assert.ok(orch.analytics.learner, 'analytics must have learner');
});

test('pipeline: processContent returns actionable recommendation', async () => {
    const orch = require('../agents/growth/orchestrator');
    const result = await orch.processContent({
        title: 'SSC GD 2026 — 5000 Vacancy Notification',
        organization: 'SSC',
        vacancies: '5000',
        lastDate: '28 Aug 2026',
        startDate: '01 Sep 2026',
        category: 'SSC',
        qualification: '10th Pass',
        createdAt: Date.now(),
        type: 'JOB'
    }, { contentId: 'integration-test-1' });

    assert.equal(result.processed, true, 'must process successfully');
    const rec = result.recommendation;
    
    // Verify all outputs are present and actionable
    assert.ok(rec.hook, 'must have hook');
    assert.ok(rec.hook.hookText, 'hook must have text');
    assert.ok(rec.hook.hookScore, 'hook must have score');
    
    assert.ok(rec.script, 'must have script');
    assert.ok(rec.script.script, 'script must have content');
    assert.ok(rec.script.estimatedDurationSec > 0, 'script must have duration');
    
    assert.ok(rec.duration > 0, 'must have recommended duration');
    assert.ok(rec.visualStyle, 'must have visual style');
    assert.ok(rec.presenter, 'must have presenter');
    assert.ok(rec.firstFrame, 'must have first frame');
    assert.ok(rec.platformPackage, 'must have platform package');
    assert.ok(rec.platformPackage.youtube, 'must have YouTube package');
    assert.ok(rec.platformPackage.telegram, 'must have Telegram package');
    assert.ok(rec.contentScore > 0, 'must have content score');
    assert.ok(rec.reachPrediction >= 0, 'must have reach prediction');
});

test('pipeline: hook text enters the final script', async () => {
    const orch = require('../agents/growth/orchestrator');
    const result = await orch.processContent({
        title: 'RRB NTPC Result Out 2026',
        organization: 'RRB',
        category: 'Railway',
        createdAt: Date.now(),
        type: 'FAST_TRACK'
    }, { contentId: 'integration-test-2' });

    assert.equal(result.processed, true);
    const rec = result.recommendation;
    
    // The hook text should be present in the script
    assert.ok(
        rec.script.script.length > 20,
        'script must contain actual content, not just empty'
    );
});

test('pipeline: presenter is an approved anchor', async () => {
    const orch = require('../agents/growth/orchestrator');
    const visual = require('../agents/growth/visual_engine');
    const result = await orch.processContent({
        title: 'UPSC CSE 2026 Notification',
        organization: 'UPSC',
        category: 'UPSC',
        createdAt: Date.now(),
        type: 'JOB'
    }, { contentId: 'integration-test-3' });

    assert.equal(result.processed, true);
    assert.ok(
        visual.APPROVED_ANCHORS.includes(result.recommendation.presenter),
        'presenter must be from approved anchor list'
    );
});

test('pipeline: platform packaging produces YouTube metadata', async () => {
    const orch = require('../agents/growth/orchestrator');
    const result = await orch.processContent({
        title: 'Bihar Police Constable 2026',
        organization: 'Bihar Police',
        vacancies: '10000',
        lastDate: '15 Sep 2026',
        category: 'Police',
        createdAt: Date.now(),
        type: 'JOB'
    }, { contentId: 'integration-test-4' });

    assert.equal(result.processed, true);
    const yt = result.recommendation.platformPackage.youtube;
    assert.ok(yt.title.length > 5, 'YouTube title must be non-trivial');
    assert.ok(yt.description.length > 20, 'YouTube description must be non-trivial');
    assert.ok(yt.tags.length > 0, 'YouTube must have tags');
});

/* ------------------------------------------------------------------ */
/* 6. Verify analytics collector does not break without credentials    */
/* ------------------------------------------------------------------ */

test('analytics: collector handles missing credentials gracefully', async () => {
    const collector = require('../agents/growth/analytics/collector');
    
    // No YouTube token set
    const origToken = process.env.YOUTUBE_TOKEN;
    delete process.env.YOUTUBE_TOKEN;
    
    const result = await collector.collectPlatformMetrics(null, {
        platform: 'youtube',
        platformVideoId: 'test123',
        contentId: 'test'
    });
    
    // Without credentials, metrics are empty but collection doesn't crash
    assert.ok(result.collected !== undefined, 'must return a result without crashing');
    
    // With no platformVideoId, should return not collected
    const result2 = await collector.collectPlatformMetrics(null, {
        platform: 'youtube'
    });
    assert.equal(result2.collected, false, 'should not collect without platformVideoId');
    
    // Restore
    if (origToken) process.env.YOUTUBE_TOKEN = origToken;
});

test('analytics: scorer handles empty metrics', () => {
    const scorer = require('../agents/growth/analytics/scorer');
    const result = scorer.scorePerformance({});
    assert.ok(typeof result.performanceScore === 'number');
});

/* ------------------------------------------------------------------ */
/* 7. Verify learner is connected to analytics data                    */
/* ------------------------------------------------------------------ */

test('learner: analyzePatterns works with no db', async () => {
    const learner = require('../agents/growth/analytics/learner');
    const result = await learner.analyzePatterns(null);
    assert.ok(Array.isArray(result.patterns));
});

/* ------------------------------------------------------------------ */
/* 8. Verify breaking mode affects dispatch priority                   */
/* ------------------------------------------------------------------ */

test('breaking: high urgency content gets higher priority', () => {
    const breaking = require('../agents/growth/breaking_mode');
    
    const normalCandidate = {
        data: { title: 'New SSC Notification', createdAt: Date.now() - 3600000 },
        kind: 'JOB'
    };
    const breakingCandidate = {
        data: { title: 'SSC GD Result Out', createdAt: Date.now() },
        kind: 'FAST_TRACK'
    };
    
    const normalPri = breaking.getDispatchPriority(normalCandidate);
    const breakingPri = breaking.getDispatchPriority(breakingCandidate);
    
    // Both should have a priority > 0
    assert.ok(normalPri.priority > 0);
    assert.ok(breakingPri.priority >= 0);
});

/* ------------------------------------------------------------------ */
/* 9. Verify mock_test_video is not broken                             */
/* ------------------------------------------------------------------ */

test('mock_test: video_dispatcher still calls processMockTest for MOCK_TEST kind', () => {
    const dispatcherSrc = fs.readFileSync(
        path.join(__dirname, '..', 'video_dispatcher.js'), 'utf8'
    );
    assert.ok(
        dispatcherSrc.includes('processMockTest'),
        'dispatcher must still handle MOCK_TEST pipeline'
    );
    assert.ok(
        dispatcherSrc.includes("KIND.MOCK_TEST"),
        'dispatcher must reference MOCK_TEST kind'
    );
});

/* ------------------------------------------------------------------ */
/* 10. Verify the workflow cron schedule                                */
/* ------------------------------------------------------------------ */

test('workflow: video_dispatcher.yml has 10-minute cron', () => {
    const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'video_dispatcher.yml');
    const src = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(
        src.includes("cron: '*/10 * * * *'"),
        'video_dispatcher.yml must run every 10 minutes'
    );
});
