'use strict';

/**
 * ai_visual_fallback.test.js — Hardened AI visual fallback chain tests.
 *
 * Covers the guaranteed-image architecture:
 *  1.  AI success               -> AI image used.
 *  2.  AI HTTP 500              -> local fallback image used.
 *  3.  AI timeout               -> local fallback image used.
 *  4.  AI invalid/corrupt image -> local fallback image used.
 *  5.  Different document fingerprints -> different deterministic fallbacks.
 *  6.  Same document fingerprint       -> same deterministic fallback.
 *  7.  Fallback image exists and is valid.
 *  8.  Complete video pipeline (growth orchestrator) continues after AI failure.
 *  9.  Category fallback still works if the local fallback itself cannot run.
 *  10. Final background/template fallback prevents image-related failure.
 *
 * No network access is required: the AI HTTP client is mocked and the local
 * generator renders real PNGs via sharp (an existing project dependency).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const aiVisualEngine = require('../agents/growth/ai_visual_engine');
const localVisualGenerator = require('../agents/growth/local_visual_generator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal JPEG whose SOF0 segment carries parseable dimensions. */
function makeJpegBuffer(width = 720, height = 1280) {
    const buf = Buffer.alloc(2048);
    let o = 0;
    buf[o++] = 0xFF; buf[o++] = 0xD8;                       // SOI
    buf[o++] = 0xFF; buf[o++] = 0xE0;                       // APP0
    buf[o++] = 0x00; buf[o++] = 0x04;
    buf[o++] = 0x00; buf[o++] = 0x00;
    buf[o++] = 0xFF; buf[o++] = 0xC0;                       // SOF0
    buf[o++] = 0x00; buf[o++] = 0x0B;                       // segment length 11
    buf[o++] = 0x08;                                        // precision
    buf[o++] = (height >> 8) & 0xFF; buf[o++] = height & 0xFF;
    buf[o++] = (width >> 8) & 0xFF; buf[o++] = width & 0xFF;
    buf[o++] = 0x01;                                        // 1 component
    buf[o++] = 0x01; buf[o++] = 0x11; buf[o++] = 0x00;
    buf[o++] = 0xFF; buf[o++] = 0xD9;                       // EOI
    return buf;
}

/** JPEG with a valid magic header but no parseable SOF (corrupt). */
function makeCorruptJpegBuffer() {
    const buf = Buffer.alloc(2048);
    buf[0] = 0xFF; buf[1] = 0xD8;
    return buf;
}

function tmpPath(name) {
    return path.join(os.tmpdir(), `avf-${name}-${Date.now()}-${Number(process.hrtime.bigint() % 1000000n)}.png`);
}

function sha256(p) {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function http500() {
    return async () => {
        const err = new Error('Request failed with status code 500');
        err.response = { status: 500 };
        throw err;
    };
}

function httpTimeout() {
    return async () => {
        const err = new Error('timeout of 30000ms exceeded');
        err.code = 'ECONNABORTED';
        throw err;
    };
}

function captureLogs(fn) {
    const original = console.log;
    const lines = [];
    console.log = (...args) => lines.push(args.map(String).join(' '));
    return Promise.resolve(fn()).finally(() => { console.log = original; })
        .then((result) => ({ result, lines }));
}

const CONTENT = {
    type: 'FAST_TRACK',
    documentId: 'doc-fallback-1',
    slug: 'mpesb-result-2026',
    category: 'Result',
    title: 'MPESB ADDET Result 2026',
    publishDate: '2026-08-26'
};

// ---------------------------------------------------------------------------
// 1. AI success -> AI image used
// ---------------------------------------------------------------------------
test('fallback chain: AI success uses the AI image (visual_source=ai)', async () => {
    const out = tmpPath('ai-ok');
    const jpeg = makeJpegBuffer();
    const chain = await aiVisualEngine.resolveVisualBackground(CONTENT, {
        contentId: CONTENT.documentId,
        aiOutputPath: out,
        localOutputPath: tmpPath('ai-ok-local'),
        httpClient: async () => ({ data: jpeg }),
        maxAttempts: 1
    });
    try {
        assert.equal(chain.visualSource, 'ai');
        assert.ok(chain.path, 'path must be present');
        assert.equal(chain.path, out);
        assert.equal(aiVisualEngine.isUsableImage(chain.path), true);
        const gate = aiVisualEngine.inspectImage(chain.path);
        assert.equal(gate.format, 'jpeg');
        assert.equal(gate.width, 720);
        assert.equal(gate.height, 1280);
        assert.equal(chain.ai.generation, 'success');
    } finally {
        if (fs.existsSync(out)) fs.unlinkSync(out);
    }
});

// ---------------------------------------------------------------------------
// 2. AI HTTP 500 -> local fallback image used
// ---------------------------------------------------------------------------
test('fallback chain: AI HTTP 500 falls to deterministic local image (visual_source=local_fallback)', async () => {
    const localOut = tmpPath('ai-500-local');
    let aiCalls = 0;
    const { result: chain, lines } = await captureLogs(() => aiVisualEngine.resolveVisualBackground(CONTENT, {
        contentId: CONTENT.documentId,
        aiOutputPath: tmpPath('ai-500'),
        localOutputPath: localOut,
        maxAttempts: 2,
        httpClient: async () => { aiCalls += 1; const err = new Error('Request failed with status code 500'); err.response = { status: 500 }; throw err; }
    }));
    try {
        assert.equal(aiCalls, 2, 'must retry once on HTTP 500 before falling back');
        assert.equal(chain.visualSource, 'local_fallback');
        assert.ok(chain.path);
        assert.equal(chain.path, localOut);
        assert.equal(aiVisualEngine.isUsableImage(chain.path), true);
        assert.match(chain.aiFailure, /500/);
        // Logs must clearly distinguish AI failure from the successful fallback.
        assert.ok(lines.some((l) => l.startsWith('ai_visual_failed reason=')), 'must log ai_visual_failed');
        assert.ok(lines.some((l) => l.startsWith('visual_source=local_fallback variant=')), 'must log the local fallback');
        assert.ok(lines.some((l) => l.includes('seed=')), 'local fallback log must include seed');
    } finally {
        if (fs.existsSync(localOut)) fs.unlinkSync(localOut);
    }
});

// ---------------------------------------------------------------------------
// 3. AI timeout -> local fallback image used
// ---------------------------------------------------------------------------
test('fallback chain: AI timeout falls to deterministic local image', async () => {
    const localOut = tmpPath('ai-timeout-local');
    const chain = await aiVisualEngine.resolveVisualBackground(CONTENT, {
        contentId: CONTENT.documentId,
        aiOutputPath: tmpPath('ai-timeout'),
        localOutputPath: localOut,
        maxAttempts: 2,
        httpClient: httpTimeout()
    });
    try {
        assert.equal(chain.visualSource, 'local_fallback');
        assert.equal(aiVisualEngine.isUsableImage(chain.path), true);
        assert.match(chain.aiFailure, /timeout/i);
    } finally {
        if (fs.existsSync(localOut)) fs.unlinkSync(localOut);
    }
});

// ---------------------------------------------------------------------------
// 4. AI invalid/corrupt image -> local fallback image used
// ---------------------------------------------------------------------------
test('fallback chain: non-image AI response is treated as AI failure', async () => {
    const localOut = tmpPath('ai-garbage-local');
    const chain = await aiVisualEngine.resolveVisualBackground(CONTENT, {
        contentId: CONTENT.documentId,
        aiOutputPath: tmpPath('ai-garbage'),
        localOutputPath: localOut,
        maxAttempts: 1,
        httpClient: async () => ({ data: Buffer.from('this is not an image at all') })
    });
    try {
        assert.equal(chain.visualSource, 'local_fallback');
        assert.equal(aiVisualEngine.isUsableImage(chain.path), true);
        assert.match(chain.aiFailure, /valid image|Image too small/i);
    } finally {
        if (fs.existsSync(localOut)) fs.unlinkSync(localOut);
    }
});

test('fallback chain: AI image with valid magic but corrupt body is rejected by the gate', async () => {
    const aiOut = tmpPath('ai-corrupt');
    const localOut = tmpPath('ai-corrupt-local');
    // generateImage accepts the fake magic bytes, but the acceptance gate must
    // reject the file (no parseable dimensions) exactly like an AI failure.
    const chain = await aiVisualEngine.resolveVisualBackground(CONTENT, {
        contentId: CONTENT.documentId,
        aiOutputPath: aiOut,
        localOutputPath: localOut,
        maxAttempts: 1,
        httpClient: async () => ({ data: makeCorruptJpegBuffer() })
    });
    try {
        assert.equal(chain.visualSource, 'local_fallback');
        assert.equal(fs.existsSync(aiOut), false, 'corrupt AI file must be removed');
        assert.equal(aiVisualEngine.isUsableImage(chain.path), true);
        assert.match(chain.aiFailure, /invalid image file/);
    } finally {
        if (fs.existsSync(aiOut)) fs.unlinkSync(aiOut);
        if (fs.existsSync(localOut)) fs.unlinkSync(localOut);
    }
});

// ---------------------------------------------------------------------------
// 5. Different document fingerprints -> different deterministic fallbacks
// ---------------------------------------------------------------------------
test('fallback uniqueness: different document fingerprints produce different fallback visuals', async () => {
    const outputs = [];
    const hashes = [];
    try {
        for (let i = 1; i <= 6; i++) {
            const content = { ...CONTENT, documentId: `doc-unique-${i}` };
            const out = tmpPath(`unique-${i}`);
            const r = await localVisualGenerator.generateLocalVisual(content, { outputPath: out });
            assert.equal(r.success, true);
            outputs.push(out);
            hashes.push(sha256(out));
        }
        assert.equal(new Set(hashes).size, hashes.length, 'every fingerprint must yield a distinct image');
        // Seeds themselves must all differ (they are the deterministic basis).
        const seeds = await Promise.all(outputs.map(async (out, i) => {
            const r = await localVisualGenerator.generateLocalVisual(
                { ...CONTENT, documentId: `doc-unique-${i + 1}` }, { outputPath: out });
            return r.seed;
        }));
        assert.equal(new Set(seeds).size, seeds.length);
    } finally {
        outputs.forEach((p) => { if (fs.existsSync(p)) fs.unlinkSync(p); });
    }
});

// ---------------------------------------------------------------------------
// 6. Same document fingerprint -> same deterministic fallback
// ---------------------------------------------------------------------------
test('fallback determinism: same fingerprint produces byte-identical fallback images', async () => {
    const outA = tmpPath('same-a');
    const outB = tmpPath('same-b');
    try {
        const a = await localVisualGenerator.generateLocalVisual(CONTENT, { outputPath: outA });
        const b = await localVisualGenerator.generateLocalVisual(CONTENT, { outputPath: outB });
        assert.equal(a.success, true);
        assert.equal(b.success, true);
        assert.equal(a.seed, b.seed);
        assert.equal(a.variant, b.variant);
        assert.equal(a.composition, b.composition);
        assert.equal(sha256(outA), sha256(outB), 'same content must render the same bytes');
    } finally {
        [outA, outB].forEach((p) => { if (fs.existsSync(p)) fs.unlinkSync(p); });
    }
});

test('fallback determinism: retry resolves the same stable local path', () => {
    const a = aiVisualEngine.getLocalFallbackPath(CONTENT.documentId, 'fp-abc');
    const b = aiVisualEngine.getLocalFallbackPath(CONTENT.documentId, 'fp-abc');
    assert.equal(a, b);
    assert.notEqual(a, aiVisualEngine.getLocalFallbackPath('other-doc', 'fp-abc'));
});

// ---------------------------------------------------------------------------
// 7. Fallback image exists and is valid
// ---------------------------------------------------------------------------
test('fallback validity: generated local image passes the full acceptance gate', async () => {
    const out = tmpPath('valid');
    try {
        const r = await localVisualGenerator.generateLocalVisual(CONTENT, { outputPath: out });
        assert.equal(r.success, true);
        assert.equal(fs.existsSync(out), true, 'file must exist');
        const stat = fs.statSync(out);
        assert.ok(stat.size > 100, 'file must be non-empty');
        assert.ok(stat.size < 5 * 1024 * 1024, 'file must stay within the 5MB limit');
        const gate = aiVisualEngine.inspectImage(out);
        assert.equal(gate.ok, true, `gate must accept the file (${gate.reason})`);
        assert.equal(gate.format, 'png');
        assert.equal(gate.width, 720);
        assert.equal(gate.height, 1280);
        assert.equal(aiVisualEngine.validateImage(out), true, 'quick validation must also accept PNG');
    } finally {
        if (fs.existsSync(out)) fs.unlinkSync(out);
    }
});

test('validation gate: corrupt/empty/oversized files are rejected', () => {
    const empty = tmpPath('empty');
    fs.writeFileSync(empty, '');
    const corrupt = tmpPath('corrupt');
    fs.writeFileSync(corrupt, makeCorruptJpegBuffer());
    const oversize = tmpPath('oversize');
    fs.writeFileSync(oversize, Buffer.alloc(5 * 1024 * 1024 + 1));
    try {
        assert.equal(aiVisualEngine.inspectImage('/tmp/definitely-missing-xyz.png').ok, false);
        assert.equal(aiVisualEngine.inspectImage(empty).ok, false);
        assert.equal(aiVisualEngine.inspectImage(corrupt).ok, false);
        assert.equal(aiVisualEngine.inspectImage(oversize).ok, false);
        assert.equal(aiVisualEngine.inspectImage(null).ok, false);
    } finally {
        [empty, corrupt, oversize].forEach((p) => { if (fs.existsSync(p)) fs.unlinkSync(p); });
    }
});

// ---------------------------------------------------------------------------
// 8. Complete video pipeline continues after AI failure
// ---------------------------------------------------------------------------

/** Minimal in-memory Firestore double covering the collections the growth
 *  orchestrator touches. */
class FakeFirestore {
    constructor() {
        this.data = {};
        this.fieldValue = {
            increment: (n) => ({ __inc: n }),
            serverTimestamp: () => ({ __ts: true })
        };
    }
    collection(name) {
        if (!this.data[name]) this.data[name] = {};
        const store = this.data[name];
        const self = this;
        const makeQuery = (filters = [], order = null, max = Infinity) => ({
            where(field, op, value) { return makeQuery([...filters, { field, op, value }], order, max); },
            orderBy(field, dir = 'asc') { return makeQuery(filters, { field, dir }, max); },
            limit(n) { return makeQuery(filters, order, n); },
            async get() {
                let entries = Object.entries(store);
                filters.forEach(({ field, op, value }) => {
                    entries = entries.filter(([, d]) => (op === '==' ? d[field] === value : true));
                });
                if (order) entries.sort((a, b) => (a[1][order.field] || 0) - (b[1][order.field] || 0));
                entries = entries.slice(0, max);
                const docs = entries.map(([id, value]) => ({
                    id,
                    exists: true,
                    data: () => ({ ...value }),
                    ref: self._ref(name, id)
                }));
                return { empty: docs.length === 0, size: docs.length, docs };
            }
        });
        return Object.assign(makeQuery(), {
            doc: (id) => self._ref(name, id),
            async add(payload) {
                const id = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                store[id] = { ...payload };
                return { id };
            }
        });
    }
    _ref(name, id) {
        const store = this.data[name];
        return {
            id,
            path: `${name}/${id}`,
            async get() {
                const value = store[id];
                return { exists: value !== undefined, id, data: () => (value ? { ...value } : undefined) };
            },
            async set(payload) { store[id] = { ...payload }; },
            async update(payload) { store[id] = { ...(store[id] || {}), ...payload }; }
        };
    }
    async runTransaction(fn) {
        const writes = [];
        const result = await fn({
            get: (ref) => ref.get(),
            update: (ref, payload) => writes.push([ref, payload]),
            set: (ref, payload) => writes.push([ref, payload])
        });
        for (const [ref, payload] of writes) await ref.set(payload);
        return result;
    }
}

test('pipeline continuation: growth orchestrator completes a video plan after AI failure', async () => {
    const orchestrator = require('../agents/growth/orchestrator');
    const db = new FakeFirestore();

    const localOut = tmpPath('pipeline-local');
    try {
        const result = await orchestrator.processContent(CONTENT, {
            contentId: CONTENT.documentId,
            db,
            runId: 'test-run-ai-fail',
            aiVisualHttpClient: http500(),
            aiVisualLocalOutputPath: localOut
        });

        assert.equal(result.processed, true, 'video plan must continue despite AI failure');
        const aiVisual = result.enhancements?.aiVisual;
        assert.ok(aiVisual, 'aiVisual enhancement must exist');
        assert.equal(aiVisual.visualSource, 'local_fallback');
        assert.equal(aiVisual.generation, 'failed', 'AI failure must stay visible, not reported as success');
        assert.ok(aiVisual.path, 'a real local image path must be attached');
        assert.equal(aiVisual.path, localOut);
        assert.equal(aiVisualEngine.isUsableImage(aiVisual.path), true, 'the fallback image must be usable by the poster');
        assert.ok(result.recommendation, 'the normal recommendation flow must still complete');
    } finally {
        if (fs.existsSync(localOut)) fs.unlinkSync(localOut);
    }
});

// ---------------------------------------------------------------------------
// 9. Category fallback still works if the local fallback itself cannot run
// ---------------------------------------------------------------------------
test('fallback chain: category fallback is used when the local fallback is disabled', async () => {
    const chain = await aiVisualEngine.resolveVisualBackground(CONTENT, {
        contentId: CONTENT.documentId,
        tryAi: false,
        allowLocalFallback: false
    });
    assert.equal(chain.visualSource, 'category_fallback');
    assert.ok(chain.categoryFallback);
    assert.equal(chain.categoryFallback.intent, 'RESULT');
    assert.ok(chain.categoryFallback.colors?.bg1, 'palette must carry colors for the poster theme');
    assert.equal(chain.path, null);
});

test('fallback chain: a failing local generator still lands on the category fallback', async () => {
    const original = localVisualGenerator.generateLocalVisual;
    localVisualGenerator.generateLocalVisual = async () => ({ success: false, error: 'sharp unavailable (simulated)' });
    try {
        const { result: chain, lines } = await captureLogs(() => aiVisualEngine.resolveVisualBackground(CONTENT, {
            contentId: CONTENT.documentId,
            tryAi: false,
            localOutputPath: tmpPath('gen-fail')
        }));
        assert.equal(chain.visualSource, 'category_fallback');
        assert.ok(chain.categoryFallback?.colors?.bg1);
        assert.ok(lines.some((l) => l.startsWith('local_visual_failed reason=')), 'must log the local generator failure');
        assert.ok(lines.some((l) => l.startsWith('visual_source=category_fallback variant=')), 'must log the category fallback');
    } finally {
        localVisualGenerator.generateLocalVisual = original;
    }
});

// ---------------------------------------------------------------------------
// 10. Final background/template fallback prevents image-related failure
// ---------------------------------------------------------------------------
test('fallback chain: background fallback is the layer behind the category fallback', async () => {
    const chain = await aiVisualEngine.resolveVisualBackground(CONTENT, {
        contentId: CONTENT.documentId,
        tryAi: false,
        allowLocalFallback: false,
        allowCategoryFallback: false
    });
    assert.equal(chain.visualSource, 'background_fallback');
    assert.equal(chain.path, null);
});

test('fallback chain: template fallback is the final guaranteed layer and never throws', async () => {
    const { result: chain, lines } = await captureLogs(() => aiVisualEngine.resolveVisualBackground(CONTENT, {
        contentId: CONTENT.documentId,
        tryAi: false,
        allowLocalFallback: false,
        allowCategoryFallback: false,
        allowBackgroundFallback: false
    }));
    assert.equal(chain.visualSource, 'template_fallback');
    assert.ok(lines.some((l) => l.startsWith('visual_source=template_fallback')), 'must log the template fallback');
});

// ---------------------------------------------------------------------------
// Extra safety: the chain must never throw, even with a throwing HTTP client
// ---------------------------------------------------------------------------
test('fallback chain: a throwing AI client never escapes the chain', async () => {
    const localOut = tmpPath('throwing-client-local');
    const chain = await aiVisualEngine.resolveVisualBackground(CONTENT, {
        contentId: CONTENT.documentId,
        aiOutputPath: tmpPath('throwing-client'),
        localOutputPath: localOut,
        maxAttempts: 1,
        httpClient: async () => { throw new Error('synchronous-ish network blowup'); }
    });
    try {
        assert.equal(chain.visualSource, 'local_fallback');
        assert.equal(aiVisualEngine.isUsableImage(chain.path), true);
    } finally {
        if (fs.existsSync(localOut)) fs.unlinkSync(localOut);
    }
});
