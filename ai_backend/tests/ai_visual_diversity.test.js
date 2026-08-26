'use strict';

/**
 * ai_visual_diversity.test.js — Dynamic AI visual diversity + cleanup tests.
 *
 * Verifies:
 * 1. Same content => same visual fingerprint.
 * 2. Different content IDs => different fingerprints/seeds.
 * 3. Different titles/categories => prompt changes.
 * 4. Scene/prompt selection is deterministic.
 * 5. Presenter placement/safe area remains present.
 * 6. No-text / negative prompt remains present.
 * 7. Pollinations URL contains a per-content deterministic seed.
 * 8. Cache behaviour remains stable.
 * 9. Retry reuses the cached image.
 * 10. AI failure still falls back.
 * 11. Recent visual diversity guard prevents immediate duplicate combinations.
 * 12. No cPanel trigger code remains.
 * 13. No dist-artifact deployment system remains.
 * 14. Normal npm/Vite build remains intact.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const aiVisualEngine = require('../agents/growth/ai_visual_engine');
const visualFatiguePrevention = require('../agents/growth/visual_fatigue_prevention');

const JPEG_HEADER = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);

function makeFakeJpeg(filePath, size = 1024) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.alloc(size);
    JPEG_HEADER.copy(buf, 0);
    fs.writeFileSync(filePath, buf);
    return filePath;
}

// Repository root for cleanup scans
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// 1. Same content => same fingerprint / seed / prompt
// ---------------------------------------------------------------------------
test('ai_visual_diversity: same content produces the same fingerprint and seed', () => {
    const content = {
        type: 'JOB',
        documentId: 'job-001',
        slug: 'railway-recruitment-2026',
        category: 'RAILWAY',
        title: 'Railway Recruitment 2026',
        publishDate: '2026-08-26'
    };
    const fp1 = aiVisualEngine.visualFingerprint(content);
    const fp2 = aiVisualEngine.visualFingerprint(content);

    assert.equal(fp1.hash, fp2.hash, 'hash must be stable');
    assert.equal(fp1.seed, fp2.seed, 'seed must be stable');
    assert.equal(fp1.cacheKey, fp2.cacheKey, 'cacheKey must be stable');

    const plan1 = aiVisualEngine.buildVisualPlan(content);
    const plan2 = aiVisualEngine.buildVisualPlan(content);
    assert.equal(plan1.prompt, plan2.prompt, 'prompt must be stable');
    assert.equal(plan1.seed, plan2.seed, 'plan seed must be stable');
    assert.equal(plan1.cacheKey, plan2.cacheKey, 'plan cacheKey must be stable');
});

// ---------------------------------------------------------------------------
// 2. Different content IDs => different fingerprints/seeds
// ---------------------------------------------------------------------------
test('ai_visual_diversity: different content IDs get different seeds/fingerprints', () => {
    const base = {
        type: 'JOB',
        slug: 'same-slug',
        category: 'RAILWAY',
        title: 'Same Title'
    };
    const a = { ...base, documentId: 'job-111' };
    const b = { ...base, documentId: 'job-222' };

    const fpA = aiVisualEngine.visualFingerprint(a);
    const fpB = aiVisualEngine.visualFingerprint(b);

    assert.notEqual(fpA.hash, fpB.hash, 'different IDs must change fingerprint');
    assert.notEqual(fpA.seed, fpB.seed, 'different IDs must change seed');

    const planA = aiVisualEngine.buildVisualPlan(a);
    const planB = aiVisualEngine.buildVisualPlan(b);
    assert.notEqual(planA.seed, planB.seed);
    assert.notEqual(planA.combinationKey, planB.combinationKey);
});

// ---------------------------------------------------------------------------
// 3. Different titles/categories => prompt changes
// ---------------------------------------------------------------------------
test('ai_visual_diversity: different titles/categories change the visual prompt', () => {
    const police = aiVisualEngine.buildVisualPlan({
        type: 'JOB',
        documentId: 'police-1',
        slug: 'police-bharti',
        category: 'POLICE',
        title: 'Police Bharti 2026'
    });
    const banking = aiVisualEngine.buildVisualPlan({
        type: 'JOB',
        documentId: 'bank-1',
        slug: 'bank-recruitment',
        category: 'BANKING',
        title: 'Bank Recruitment 2026'
    });
    const policeV2 = aiVisualEngine.buildVisualPlan({
        type: 'JOB',
        documentId: 'police-1',
        slug: 'police-bharti',
        category: 'POLICE',
        title: 'Police Bharti 2026 · New Notification'
    });

    assert.notEqual(police.prompt, banking.prompt, 'category must change prompt');
    assert.notEqual(police.prompt, policeV2.prompt, 'title must change prompt');
    assert.notEqual(police.combinationKey, banking.combinationKey);

    // The prompt should reflect the category's realistic scene, not a clone.
    assert.ok(/police/i.test(police.prompt), 'police prompt should mention police scene');
    assert.ok(/bank/i.test(banking.prompt), 'banking prompt should mention banking scene');
});

// ---------------------------------------------------------------------------
// 4. Scene selection is deterministic
// ---------------------------------------------------------------------------
test('ai_visual_diversity: scene selection is deterministic', () => {
    const content = { type: 'JOB', documentId: 'defence-9', slug: 'defence', category: 'DEFENCE', title: 'Defence Bharti' };
    const p1 = aiVisualEngine.buildVisualPlan(content);
    const p2 = aiVisualEngine.buildVisualPlan(content);
    assert.equal(p1.scene, p2.scene);
    assert.equal(p1.subject, p2.subject);
    assert.equal(p1.camera, p2.camera);
    assert.equal(p1.lighting, p2.lighting);
    assert.equal(p1.style, p2.style);
});

// ---------------------------------------------------------------------------
// 5. Presenter placement / safe area remains present
// ---------------------------------------------------------------------------
test('ai_visual_diversity: presenter safe area is always present', () => {
    const content = { type: 'JOB', documentId: 'job-safe', slug: 'safe', category: 'RAILWAY', title: 'Safe Area' };
    for (const placement of ['bottom', 'left', 'right', 'center']) {
        const plan = aiVisualEngine.buildVisualPlan(content, { placement });
        assert.ok(/presenter overlay/i.test(plan.prompt), `${placement} must keep presenter overlay safe area`);
        assert.ok(/vertical 9:16/i.test(plan.prompt), `prompt must stay vertical 9:16`);
    }
});

// ---------------------------------------------------------------------------
// 6. Negative prompt / no-text instructions present
// ---------------------------------------------------------------------------
test('ai_visual_diversity: negative prompt blocks text/logos/watermark', () => {
    const plan = aiVisualEngine.buildVisualPlan({
        type: 'JOB', documentId: 'job-neg', slug: 'neg', category: 'SSC', title: 'No Text'
    });
    const prompt = plan.prompt.toLowerCase();
    assert.ok(prompt.includes('no text'), 'must include no text');
    assert.ok(prompt.includes('no typography'), 'must include no typography');
    assert.ok(prompt.includes('no logos'), 'must include no logos');
    assert.ok(prompt.includes('no watermark'), 'must include no watermark');
    assert.ok(prompt.includes('no fake government emblem'), 'must block fake government emblem');
    assert.ok(prompt.includes('no fake document text'), 'must block fake document text');
    assert.ok(isValidFirestoreId(plan.cacheKey), 'cacheKey must be Firestore-safe');
});

function isValidFirestoreId(id) {
    return typeof id === 'string' && id.length > 0 && /^[a-z0-9-]+$/i.test(id);
}

// ---------------------------------------------------------------------------
// 7. Pollinations URL contains per-content seed
// ---------------------------------------------------------------------------
test('ai_visual_diversity: Pollinations URL contains a per-content seed', () => {
    const contentA = { type: 'JOB', documentId: 'job-a', slug: 'a', category: 'RAILWAY', title: 'Railway A' };
    const contentB = { type: 'JOB', documentId: 'job-b', slug: 'b', category: 'BANKING', title: 'Bank B' };
    const planA = aiVisualEngine.buildVisualPlan(contentA);
    const planB = aiVisualEngine.buildVisualPlan(contentB);

    const urlA = aiVisualEngine.buildImageUrl(planA.prompt, { seed: planA.seed });
    const urlB = aiVisualEngine.buildImageUrl(planB.prompt, { seed: planB.seed });

    assert.ok(urlA.includes('width=720'), 'width must stay 720');
    assert.ok(urlA.includes('height=1280'), 'height must stay 1280');
    assert.ok(urlA.includes('nologo=true'), 'must keep nologo');
    assert.ok(urlA.includes(`&seed=${planA.seed}`), 'must include content seed');
    assert.ok(urlB.includes(`&seed=${planB.seed}`), 'must include content seed');
    assert.notEqual(planA.seed, planB.seed, 'different content must have different seeds');
    assert.notEqual(urlA, urlB, 'different content must generate different URLs');
});

// ---------------------------------------------------------------------------
// 8. Cache behaviour remains stable
// ---------------------------------------------------------------------------
test('ai_visual_diversity: stable cache path remains deterministic', () => {
    const p1 = aiVisualEngine.getStableCachePath('job-cache', 'ai-abc');
    const p2 = aiVisualEngine.getStableCachePath('job-cache', 'ai-abc');
    assert.equal(p1, p2);
    const p3 = aiVisualEngine.getStableCachePath('job-cache', 'ai-xyz');
    assert.notEqual(p1, p3, 'different fingerprint must change cache path');
});

// ---------------------------------------------------------------------------
// 9. Retry reuses the cached image
// ---------------------------------------------------------------------------
test('ai_visual_diversity: retry reuses the same cached image', () => {
    const content = { type: 'JOB', documentId: 'job-retry', slug: 'retry', category: 'POLICE', title: 'Retry Image' };
    const plan = aiVisualEngine.buildVisualPlan(content);
    const stablePath = aiVisualEngine.getStableCachePath('job-retry', plan.cacheKey);
    makeFakeJpeg(stablePath);
    try {
        assert.equal(aiVisualEngine.validateImage(stablePath), true, 'cached image must validate');
        // A retry computes the same plan + cacheKey => same file is reused.
        const retryPlan = aiVisualEngine.buildVisualPlan(content);
        const retryPath = aiVisualEngine.getStableCachePath('job-retry', retryPlan.cacheKey);
        assert.equal(retryPath, stablePath, 'retry must resolve to the same cached path');
        assert.equal(retryPlan.prompt, plan.prompt, 'retry must keep the same prompt');
    } finally {
        if (fs.existsSync(stablePath)) fs.unlinkSync(stablePath);
    }
});

// ---------------------------------------------------------------------------
// 10. AI failure still falls back
// ---------------------------------------------------------------------------
test('ai_visual_diversity: generateImage failure returns the safe fallback result', async () => {
    const tmpPath = path.join(os.tmpdir(), `ai-fallback-${Date.now()}.jpg`);
    const result = await aiVisualEngine.generateImage('test prompt', {
        outputPath: tmpPath,
        httpClient: async () => { throw new Error('Pollinations unavailable'); }
    });
    assert.equal(result.success, false);
    assert.ok(result.error, 'must surface an error string');
    assert.equal(result.provider, 'pollinations');
    assert.equal(fs.existsSync(tmpPath), false, 'partial output must be cleaned up');
});

// ---------------------------------------------------------------------------
// 11. Recent visual diversity guard prevents immediate duplicate combinations
// ---------------------------------------------------------------------------
test('ai_visual_diversity: guard avoids reusing a recent visual combination', () => {
    const content = { type: 'JOB', documentId: 'job-guard', slug: 'guard', category: 'POLICE', title: 'Guard Test' };

    const base = aiVisualEngine.buildVisualPlan(content, { recentVisualHistory: [] });
    const history = [{ combination: base.combinationKey, scene: base.scene, seed: base.seed }];
    const guarded = aiVisualEngine.buildVisualPlan(content, { recentVisualHistory: history });

    assert.notEqual(guarded.combinationKey, base.combinationKey, 'must move to a fresh combination');
    assert.notEqual(guarded.seed, base.seed, 'must move to a different seed');

    // The guarded result must ALSO be deterministic when re-run.
    const guardedAgain = aiVisualEngine.buildVisualPlan(content, { recentVisualHistory: history });
    assert.equal(guarded.combinationKey, guardedAgain.combinationKey);
    assert.equal(guarded.prompt, guardedAgain.prompt);
});

test('ai_visual_diversity: same content may reuse its own recorded combination (retry stable)', () => {
    const content = { type: 'JOB', documentId: 'job-own', slug: 'own', category: 'POLICE', title: 'Own Retry' };
    const base = aiVisualEngine.buildVisualPlan(content, { recentVisualHistory: [] });

    // The same content's OWN previous run should NOT force it to a new variant.
    const ownHistory = [{
        contentId: 'job-own',
        combination: base.combinationKey,
        scene: base.scene,
        seed: base.seed,
        fingerprint: base.cacheKey
    }];
    const ownRetry = aiVisualEngine.buildVisualPlan(content, {
        recentVisualHistory: ownHistory,
        contentId: 'job-own'
    });
    assert.equal(ownRetry.combinationKey, base.combinationKey, 'own content must keep its visual');
    assert.equal(ownRetry.prompt, base.prompt, 'own content must keep the same prompt');
});

test('ai_visual_diversity: guard rejects a DIFFERENT content that recorded the same combination/fingerprint', () => {
    const content = { type: 'JOB', documentId: 'job-guard-1', slug: 'guard', category: 'POLICE', title: 'Guard Test' };
    const base = aiVisualEngine.buildVisualPlan(content, { recentVisualHistory: [] });

    // Even if another content's history entry carries the same combination and
    // fingerprint digest, it must NOT be treated as "own" and must be avoided.
    const otherHistory = [{
        contentId: 'job-guard-other',
        combination: base.combinationKey,
        scene: base.scene,
        seed: base.seed,
        fingerprint: base.cacheKey
    }];
    const guarded = aiVisualEngine.buildVisualPlan(content, { recentVisualHistory: otherHistory });

    assert.notEqual(guarded.combinationKey, base.combinationKey, 'different content must be pushed to a fresh combination');
    const guardedAgain = aiVisualEngine.buildVisualPlan(content, { recentVisualHistory: otherHistory });
    assert.equal(guarded.combinationKey, guardedAgain.combinationKey, 'guarded selection must still be deterministic');
});

test('ai_visual_diversity: visual fatigue engine exposes AI history helpers', () => {
    assert.equal(typeof visualFatiguePrevention.getRecentAiVisualHistory, 'function');
    assert.equal(typeof visualFatiguePrevention.logAiVisualUsage, 'function');
});

// ---------------------------------------------------------------------------
// 12. No cPanel trigger code remains
// ---------------------------------------------------------------------------
test('cleanup: no cPanel video trigger / repository_dispatch / webhook/token code remains', () => {
    const patterns = [
        /cpanel.*repository_dispatch/i,
        /repository_dispatch.*cpanel/i,
        /cpanel.*webhook/i,
        /cpanel.*instant.*video/i,
        /cpanel.*video.*trigger/i,
        /cpanel.*(token|pat).*video/i,
        /cpanel.*(node|api).*video.*trigger/i,
        /cpanel.*(render|dispatch).*video/i
    ];
    const files = walk(REPO_ROOT).filter(f =>
        /\.(js|ts|tsx|yml|yaml|md|json|sh|ps1|cjs|php)$/i.test(f) &&
        !/\/tests\//.test(f) && !/\.test\.[jt]s$/.test(f)
    );
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        for (const pattern of patterns) {
            assert.ok(!pattern.test(text), `Dropped cPanel trigger pattern found (${pattern}) in ${relativeRepo(file)}`);
        }
    }
});

// ---------------------------------------------------------------------------
// 13. No dist-artifact deployment system remains
// ---------------------------------------------------------------------------
test('cleanup: no dist.zip / frontend build artifact deployment system remains', () => {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, '.github', 'workflows', 'frontend-build.yml')), false);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, 'ai_backend', 'github_workflows', 'frontend-build.yml')), false);

    const repoFiles = fs.readdirSync(REPO_ROOT);
    const distZip = repoFiles.find(f => /^dist.*\.zip$/i.test(f));
    assert.equal(distZip, undefined, 'dist.zip artifact must not exist in repo root');

    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    assert.ok(!/^\s*dist\.zip\s*$/m.test(gitignore), '.gitignore must not mark dist.zip as an artifact');
});

// ---------------------------------------------------------------------------
// 14. Normal npm/Vite build remains intact
// ---------------------------------------------------------------------------
test('cleanup: normal npm/Vite build remains intact', () => {
    const rootPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const buildScript = rootPkg.scripts && rootPkg.scripts.build;
    assert.ok(buildScript, 'package.json must keep a build script');
    assert.ok(buildScript.includes('vite build'), 'build script must still invoke vite build');
    assert.ok(buildScript.includes('tsc -b'), 'build script must still type-check');

    // Normal dist output stays ignored as a build output (not an artifact).
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    assert.ok(/^dist\/$/m.test(gitignore), 'dist/ must remain the normal Vite build output');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else out.push(full);
    }
    return out;
}

function relativeRepo(file) {
    return path.relative(REPO_ROOT, file);
}
