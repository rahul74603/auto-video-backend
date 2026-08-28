'use strict';

/**
 * Category-aware video language + visual fallback tests.
 * Does not publish a video. Does not rewrite SEO.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const intent = require('../agents/growth/content_intent');
const hooks = require('../agents/growth/hook_engine');
const script = require('../agents/growth/script_engine');
const cta = require('../agents/growth/cta_engine');
const angles = require('../agents/growth/content_angle_engine');
const opp = require('../agents/growth/opportunity_engine');
const tts = require('../tts_engine');
const aiVisual = require('../agents/growth/ai_visual_engine');

const RESULT_CONTENT = {
    title: 'MPESB ADDET Result 2026',
    category: 'Result',
    type: 'FAST_TRACK',
    organization: 'MPESB',
    createdAt: Date.now()
};

const JOB_CONTENT = {
    title: 'SSC GD 2026 Vacancy',
    category: 'SSC',
    type: 'JOB',
    organization: 'SSC',
    vacancies: '5000',
    lastDate: '28 Aug 2026',
    qualification: '10th Pass'
};

function joinedHooks(content) {
    const result = hooks.generateHooks(content);
    return (result.hooks || []).map((h) => h.hookText).join(' | ');
}

test('intent: Result title/category is RESULT, not JOB', () => {
    assert.equal(intent.detectContentIntent(RESULT_CONTENT), 'RESULT');
    assert.equal(intent.forbidsApplyLanguage(RESULT_CONTENT), true);
    assert.equal(intent.detectContentIntent(JOB_CONTENT), 'JOB');
    assert.equal(intent.forbidsApplyLanguage(JOB_CONTENT), false);
});

test('1. Result hook/script/CTA must not use Apply language', () => {
    const hookText = joinedHooks(RESULT_CONTENT);
    assert.ok(hookText.length > 10, 'must generate Result hooks');
    assert.equal(intent.containsApplyLanguage(hookText), false);

    const built = script.buildScript(
        { category: 'RESULT', recommendedFormat: 'UPDATE', urgency: 'CRITICAL' },
        { hookText: 'Result Out: MPESB ADDET Result 2026' },
        RESULT_CONTENT
    );
    assert.ok(built.script);
    assert.equal(intent.containsApplyLanguage(built.script), false);
    assert.match(built.sections.cta, /result check/i);
    assert.match(built.sections.cta, /studygyaan\.in/i);

    const videoCtas = cta.generateVideoCTAs({
        contentType: 'FAST_TRACK',
        contentAngle: 'result_update',
        urgencyLevel: 'high',
        jobData: RESULT_CONTENT
    });
    assert.notEqual(videoCtas.closing.key, 'apply_now');
    assert.equal(intent.containsApplyLanguage(videoCtas.closing.template || ''), false);
    assert.equal(intent.containsApplyLanguage(String(videoCtas.opening)), false);
    const closingPos = cta.getPositionalCTA('closing', { jobData: RESULT_CONTENT, contentType: 'FAST_TRACK' });
    assert.equal(intent.containsApplyLanguage(closingPos), false);
    assert.match(String(closingPos), /result|selected|scorecard|check/i);
});

test('2. Result hook is result-specific and not MPESB-hardcoded', () => {
    const a = hooks.generateHooks(RESULT_CONTENT);
    const other = hooks.generateHooks({
        title: 'SSC CGL Result 2026 Declared',
        category: 'Result',
        type: 'FAST_TRACK',
        organization: 'SSC'
    });
    assert.ok(a.bestHook.hookText.includes('MPESB') || a.bestHook.hookText.includes('ADDET') || a.bestHook.hookText.includes('Result'));
    assert.ok(other.bestHook.hookText.includes('SSC') || other.bestHook.hookText.includes('CGL') || other.bestHook.hookText.includes('Result'));
    assert.notEqual(a.bestHook.hookText, other.bestHook.hookText);
    assert.equal(intent.containsApplyLanguage(a.bestHook.hookText), false);
    assert.match(a.bestHook.hookText, /result|scorecard|merit|cutoff|selection/i);
});

test('3. Spoken brand is StudyGyaan dot in; displayed URL stays https://studygyaan.in', () => {
    const built = script.buildScript(
        { category: 'RESULT', recommendedFormat: 'UPDATE' },
        { hookText: 'Result Out' },
        RESULT_CONTENT
    );
    assert.match(built.script, /studygyaan\.in/i);
    assert.doesNotMatch(built.script, /StudyGyaan dot in/);

    const original = 'Result check करने के लिए https://studygyaan.in visit करें।';
    const spoken = tts.normalizeSpeechText(original);
    assert.match(spoken, /StudyGyaan dot in/);
    assert.doesNotMatch(spoken, /https:\/\/studygyaan\.in/);
    assert.equal(original.includes('https://studygyaan.in'), true);

    const autoVideoSrc = fs.readFileSync(path.join(__dirname, '..', 'autoVideo.js'), 'utf8');
    assert.ok(autoVideoSrc.includes('https://studygyaan.in'));
    assert.ok(autoVideoSrc.includes('function generateSEO'));
});

test('4. JOB Apply language is still allowed and job SEO source is intact', () => {
    const hookText = joinedHooks(JOB_CONTENT);
    assert.ok(intent.containsApplyLanguage(hookText), 'JOB hooks may still say apply');

    const built = script.buildScript(
        { category: 'SSC', recommendedFormat: 'JOB_ALERT', urgency: 'MEDIUM' },
        { hookText: 'SSC GD में 5000 पद!' },
        JOB_CONTENT
    );
    assert.ok(intent.containsApplyLanguage(built.script));
    assert.match(built.sections.cta, /apply/i);

    const videoCtas = cta.generateVideoCTAs({
        contentType: 'JOB',
        contentAngle: 'basic_alert',
        urgencyLevel: 'medium',
        jobData: JOB_CONTENT
    });
    assert.ok(videoCtas.closing.key);
    const autoVideoSrc = fs.readFileSync(path.join(__dirname, '..', 'autoVideo.js'), 'utf8');
    assert.match(autoVideoSrc, /ApplyOnline/);
    assert.match(autoVideoSrc, /function generateSEO/);
});

test('5. Admit Card language is download/check, not Apply', () => {
    const content = {
        title: 'SSC GD Admit Card 2026',
        category: 'Admit Card',
        type: 'FAST_TRACK',
        organization: 'SSC'
    };
    assert.equal(intent.detectContentIntent(content), 'ADMIT_CARD');
    const hookText = joinedHooks(content);
    assert.equal(intent.containsApplyLanguage(hookText), false);
    assert.match(hookText, /admit card|hall ticket|download/i);

    const built = script.buildScript(
        { category: 'ADMIT_CARD', recommendedFormat: 'UPDATE' },
        { hookText: 'Admit Card Out' },
        content
    );
    assert.equal(intent.containsApplyLanguage(built.script), false);
    assert.match(built.script, /admit card|download/i);

    const videoCtas = cta.generateVideoCTAs({
        contentType: 'FAST_TRACK',
        jobData: content,
        urgencyLevel: 'high'
    });
    assert.notEqual(videoCtas.closing.key, 'apply_now');
    assert.ok(['download_now', 'share', 'visit_website'].includes(videoCtas.closing.key));
});

test('6. Answer Key language is check/objection, not Apply', () => {
    const content = {
        title: 'RRB NTPC Answer Key 2026',
        category: 'Answer Key',
        type: 'FAST_TRACK',
        organization: 'RRB'
    };
    assert.equal(intent.detectContentIntent(content), 'ANSWER_KEY');
    const hookText = joinedHooks(content);
    assert.equal(intent.containsApplyLanguage(hookText), false);
    assert.match(hookText, /answer key|objection/i);

    const built = script.buildScript(
        { category: 'ANSWER_KEY', recommendedFormat: 'UPDATE' },
        { hookText: 'Answer Key Out' },
        content
    );
    assert.equal(intent.containsApplyLanguage(built.script), false);
    assert.match(built.script, /answer key|objection/i);
});

test('8. Result angle is not generic common_mistake', () => {
    const available = angles.identifyAvailableAngles(RESULT_CONTENT);
    const keys = available.map((a) => a.key);
    assert.ok(!keys.includes('common_mistake'), 'generic common_mistake must not be available for Result');
    assert.ok(keys.includes('result_update') || keys.includes('result_check') || keys.includes('official_result'));
    const preferred = ['result_update', 'result_check', 'official_result', 'scorecard', 'merit_list', 'selection', 'cutoff'];
    assert.ok(preferred.some((k) => keys.includes(k)));

    const picked = angles.selectBestAngle(RESULT_CONTENT, []);
    assert.notEqual(picked.key, 'common_mistake');
    assert.ok(preferred.includes(picked.key) || picked.key === 'common_result_mistake');
});

test('opportunity: Result title is classified RESULT even if exam family is in the title', () => {
    assert.equal(opp.detectCategory({ title: 'SSC GD Result Out', category: 'SSC' }), 'RESULT');
    const types = opp.recommendHookTypes({ score: 4 }, 'RESULT');
    assert.ok(!types.includes('eligibility'));
    assert.ok(types.includes('direct_answer'));
});

test('7. AI HTTP 500 retries then category fallback, without crashing', async () => {
    const tmp = path.join(os.tmpdir(), `ai-500-${Date.now()}.jpg`);
    let calls = 0;
    const result = await aiVisual.generateImage('test prompt', {
        outputPath: tmp,
        maxAttempts: 2,
        httpClient: async () => {
            calls += 1;
            const err = new Error('Request failed with status code 500');
            err.response = { status: 500 };
            throw err;
        }
    });
    assert.equal(result.success, false);
    assert.equal(calls, 2, 'must retry once on HTTP 500');
    assert.equal(fs.existsSync(tmp), false);

    const fallback = aiVisual.resolveCategoryVisualFallback(RESULT_CONTENT, { seed: 3740820290 });
    assert.equal(fallback.kind, 'RESULT_CATEGORY_VISUAL');
    assert.ok(fallback.colors.bg1);
    assert.equal(fallback.intent, 'RESULT');
});

test('AI success is distinct from poster applied=true', async () => {
    const tmp = path.join(os.tmpdir(), `ai-ok-${Date.now()}.jpg`);
    const jpeg = Buffer.alloc(2048);
    jpeg[0] = 0xFF;
    jpeg[1] = 0xD8;
    const result = await aiVisual.generateImage('ok prompt', {
        outputPath: tmp,
        maxAttempts: 1,
        httpClient: async () => ({ data: jpeg })
    });
    try {
        assert.equal(result.success, true);
        assert.equal(result.generation, 'success');
        assert.equal(result.applied, undefined);
        assert.ok(fs.existsSync(tmp));
    } finally {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
});

test('visual fallback is seeded: different Result videos differ, same content retries match', () => {
    const a = aiVisual.resolveCategoryVisualFallback({
        title: 'MPESB ADDET Result 2026',
        category: 'Result',
        type: 'FAST_TRACK',
        id: 'mpesb-1'
    });
    const aRetry = aiVisual.resolveCategoryVisualFallback({
        title: 'MPESB ADDET Result 2026',
        category: 'Result',
        type: 'FAST_TRACK',
        id: 'mpesb-1'
    });
    const b = aiVisual.resolveCategoryVisualFallback({
        title: 'SSC CGL Result 2026 Declared',
        category: 'Result',
        type: 'FAST_TRACK',
        id: 'ssc-cgl-1'
    });
    assert.equal(a.kind, 'RESULT_CATEGORY_VISUAL');
    assert.equal(b.kind, 'RESULT_CATEGORY_VISUAL');
    assert.deepEqual(a, aRetry, 'same content retry must reuse the same fallback');
    assert.ok(a.paletteId !== b.paletteId || a.seed !== b.seed, 'different Result videos must not be forced identical');
});

test('generateImage 500 then success does not count as a second billed generation path', async () => {
    const tmp = path.join(os.tmpdir(), `ai-retry-ok-${Date.now()}.jpg`);
    const jpeg = Buffer.alloc(2048);
    jpeg[0] = 0xFF;
    jpeg[1] = 0xD8;
    let calls = 0;
    const result = await aiVisual.generateImage('retry prompt', {
        outputPath: tmp,
        maxAttempts: 2,
        httpClient: async () => {
            calls += 1;
            if (calls === 1) {
                const err = new Error('Request failed with status code 500');
                err.response = { status: 500 };
                throw err;
            }
            return { data: jpeg };
        }
    });
    try {
        assert.equal(result.success, true);
        assert.equal(calls, 2);
        assert.equal(result.attempt, 2);
        assert.equal(result.generation, 'success');
    } finally {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
});
