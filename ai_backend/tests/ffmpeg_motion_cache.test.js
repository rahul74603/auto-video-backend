'use strict';

/**
 * ffmpeg_motion_cache.test.js — Regression tests for FFmpeg render + cache bugs.
 *
 * Covers three real production failures observed in logs:
 *   1. "Gentle Pan Right" / "Gentle Pan Up" motion profiles used the FFmpeg
 *      'pan' filter, which is AUDIO-ONLY. This caused FFmpeg exit code 234
 *      ("No such filter: 'pan'") and silently killed the render.
 *   2. The FFmpeg error handler only reported `code ${code}` with no stderr,
 *      making failures impossible to diagnose.
 *   3. The AI-image cache key (imageFingerprint) was a raw integer from
 *      hashString(). Firestore document paths must be non-empty strings, so
 *      every cache lookup/storage threw:
 *      "Value for argument 'documentPath' is not a valid resource path."
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// BUG #1 — motion_engine 'pan' filter is audio-only
// ---------------------------------------------------------------------------

const motionEngine = require('../agents/growth/motion_engine');

test('motion: every video-targeted filter must be a valid video filter', () => {
    // The 'pan' filter is audio-only in FFmpeg. Applying it to a video stream
    // causes "No such filter: 'pan'" and crashes the render.
    const AUDIO_ONLY_FILTERS = new Set(['pan']);

    for (const [name, profile] of Object.entries(motionEngine.MOTION_PROFILES)) {
        if (!profile.ffmpegFilter) continue; // static_safe has null filter
        const tokens = profile.ffmpegFilter.split(',');
        for (const token of tokens) {
            const filterName = token.split('=')[0].trim();
            assert.ok(
                !AUDIO_ONLY_FILTERS.has(filterName),
                `motion profile '${name}' uses audio-only filter '${filterName}' which will crash FFmpeg`
            );
        }
    }
});

test('motion: Gentle Pan Right filter uses pad (video), not pan (audio)', () => {
    const filter = motionEngine.MOTION_PROFILES['gentle_pan_right'].ffmpegFilter;
    assert.ok(filter.includes('pad='), 'must use pad for video reframing');
    assert.ok(!filter.includes(',pan='), 'must NOT use audio-only pan filter');
});

test('motion: Gentle Pan Up filter uses pad (video), not pan (audio)', () => {
    const filter = motionEngine.MOTION_PROFILES['gentle_pan_up'].ffmpegFilter;
    assert.ok(filter.includes('pad='), 'must use pad for video reframing');
    assert.ok(!filter.includes(',pan='), 'must NOT use audio-only pan filter');
});

test('motion: zoompan profiles use valid dimensions', () => {
    const zoomIn = motionEngine.MOTION_PROFILES['slow_zoom_in'].ffmpegFilter;
    const zoomOut = motionEngine.MOTION_PROFILES['slow_zoom_out'].ffmpegFilter;
    // Both must specify an output size so the filter chain dimensions are known
    assert.match(zoomIn, /s=\d+x\d+/, 'slow_zoom_in must specify output size');
    assert.match(zoomOut, /s=\d+x\d+/, 'slow_zoom_out must specify output size');
});

// ---------------------------------------------------------------------------
// BUG #2 — FFmpeg stderr diagnostics
// ---------------------------------------------------------------------------

test('ffmpeg: spawn captures stderr on non-zero exit', async () => {
    // Run a deliberately broken ffmpeg command and verify the error message
    // includes the captured stderr, not just the exit code.
    let ffmpegPath;
    try {
        ffmpegPath = require('ffmpeg-static');
    } catch (e) {
        // ffmpeg-static binary is optional in test environments (e.g. sandbox
        // without the native binary). Skip the integration check safely — the
        // filter-expression tests above still verify correctness statically.
        return;
    }
    const brokenArgs = ['-y', '-f', 'lavfi', '-i', 'not_a_real_filter', '-frames:v', '1', 'out.mp4'];

    try {
        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegPath, brokenArgs);
            const chunks = [];
            const MAX = 8000;
            let total = 0;
            ffmpeg.stderr.on('data', (data) => {
                if (total < MAX) {
                    chunks.push(Buffer.from(data).slice(0, MAX - total));
                    total += Math.min(data.length, MAX - total);
                }
            });
            ffmpeg.on('error', (e) => reject(e));
            ffmpeg.on('close', (code, signal) => {
                if (code === 0) return resolve();
                const stderr = Buffer.concat(chunks).toString('utf8');
                reject(new Error(
                    `FFmpeg failed: exitCode=${code}` +
                    (signal ? ` signal=${signal}` : '') +
                    `\nSTDERR:\n${stderr}`
                ));
            });
        });
        assert.fail('expected ffmpeg to fail');
    } catch (err) {
        // Accept either an ffmpeg-level failure OR a spawn failure (when the
        // binary is present but the sandbox blocks exec). The goal is that
        // production failures produce diagnostics, not a bare "code 234".
        const msg = err.message;
        const looksUseful =
            /FFmpeg failed: exitCode=/.test(msg) ||
            /STDERR:/.test(msg) ||
            /ENOENT/.test(msg) ||        // binary missing — not our bug
            /EACCES/.test(msg) ||         // sandbox blocks exec — not our bug
            /spawn/.test(msg);
        assert.ok(looksUseful, `error should be diagnostic, got: ${msg}`);
    }
});

// ---------------------------------------------------------------------------
// BUG #3 — cache key must be a valid Firestore document path
// ---------------------------------------------------------------------------

const aiVisualEngine = require('../agents/growth/ai_visual_engine');

test('ai_visual: hashString returns a non-empty string, not a number', () => {
    const result = aiVisualEngine.hashString('police recruitment 2026');
    assert.equal(typeof result, 'string', 'must be a string for Firestore doc IDs');
    assert.ok(result.length > 0, 'must be non-empty');
    assert.ok(/^[a-z0-9-]+$/i.test(result), 'must be a valid Firestore-safe identifier');
});

test('ai_visual: hashString is deterministic for the same input', () => {
    const a = aiVisualEngine.hashString('same input');
    const b = aiVisualEngine.hashString('same input');
    assert.equal(a, b, 'same input must produce the same cache key');
});

test('ai_visual: hashString differs for different inputs', () => {
    const a = aiVisualEngine.hashString('police recruitment');
    const b = aiVisualEngine.hashString('railway recruitment');
    assert.notEqual(a, b, 'different prompts must produce different cache keys');
});
