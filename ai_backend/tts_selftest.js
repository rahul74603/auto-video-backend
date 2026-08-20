#!/usr/bin/env node
/**
 * tts_selftest.js — proves Hindi TTS works without Google billing.
 *
 * Run on a GitHub Actions runner (or any machine with internet):
 *   node tts_selftest.js
 *
 * Generates a short Hindi clip with whichever engine is available and reports
 * the engine, voice, file size and duration.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ttsEngine = require('./tts_engine');

const TEXT = 'नमस्ते! ये स्टडी ज्ञान का टेस्ट है। सरकारी नौकरी की जानकारी के लिए जुड़े रहें।';

function probeDuration(file) {
    return new Promise((resolve) => {
        let ffprobe;
        try {
            ffprobe = require('ffmpeg-static').replace(/ffmpeg$/, 'ffprobe');
        } catch { return resolve(null); }
        if (!fs.existsSync(ffprobe)) return resolve(null);
        const p = spawn(ffprobe, ['-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', file]);
        let out = '';
        p.stdout.on('data', (d) => { out += d; });
        p.on('close', () => resolve(parseFloat(out.trim()) || null));
        p.on('error', () => resolve(null));
    });
}

(async () => {
    const out = path.join(os.tmpdir(), `tts-selftest-${Date.now()}.mp3`);
    console.log('='.repeat(60));
    console.log('🎙️  Hindi TTS self-test');
    console.log(`   TTS_KEY_JSON present : ${Boolean(process.env.TTS_KEY_JSON)}`);
    console.log(`   TTS_ENGINE           : ${process.env.TTS_ENGINE || '(auto)'}`);
    console.log('='.repeat(60));

    try {
        const result = await ttsEngine.synthesize(TEXT, out, {
            googleVoice: 'hi-IN-Neural2-A',
            gender: 'female',
            speakingRate: 1.08
        });

        const size = fs.statSync(out).size;
        const dur = await probeDuration(out);

        console.log('');
        console.log(`   engine   : ${result.engine}`);
        console.log(`   voice    : ${result.voice}`);
        console.log(`   size     : ${size} bytes`);
        if (dur) console.log(`   duration : ${dur.toFixed(2)}s`);

        if (size < 1000) throw new Error(`audio suspiciously small (${size} bytes)`);

        console.log('');
        console.log('✅ TTS WORKS — video rendering can proceed without Google billing.');
        process.exit(0);
    } catch (err) {
        console.error('');
        console.error('❌ TTS FAILED:', err.message);
        process.exit(1);
    } finally {
        try { fs.unlinkSync(out); } catch { /* ignore */ }
    }
})();
