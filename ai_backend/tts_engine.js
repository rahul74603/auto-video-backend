/**
 * tts_engine.js — 🎙️ Hindi TTS with an automatic, billing-free fallback
 * =====================================================================
 * Why this exists
 * ---------------
 * Google Cloud Text-to-Speech REQUIRES billing on the GCP project — even for
 * its free tier. With billing disabled the API returns:
 *
 *   7 PERMISSION_DENIED: This API method requires billing to be enabled.
 *
 * Firestore keeps working on the Spark plan, so the dispatcher finds and claims
 * work correctly, but rendering used to die at the voice-over step.
 *
 * This module keeps Google TTS as the preferred engine (better quality, and it
 * resumes automatically the moment billing is restored) and falls back to
 * Microsoft Edge's public Read Aloud voices, which need no API key, no billing
 * and no account.
 *
 * Engine order:
 *   1. Google Cloud TTS   — used when TTS_KEY_JSON is set AND billing is on
 *   2. Edge TTS           — free, no key; used automatically otherwise
 *
 * Set TTS_ENGINE=edge to skip Google entirely (faster, avoids a failed call
 * on every render while billing stays off).
 */

'use strict';

const fs = require('fs');

// Female/male Hindi voices, matched to the anchor gender by the callers.
const GOOGLE_VOICES = { female: 'hi-IN-Neural2-A', male: 'hi-IN-Neural2-C', neutral: 'hi-IN-Neural2-B' };
const EDGE_VOICES   = { female: 'hi-IN-SwaraNeural', male: 'hi-IN-MadhurNeural', neutral: 'hi-IN-SwaraNeural' };

function isBillingError(err) {
    const msg = (err && err.message) || String(err || '');
    return /billing/i.test(msg)
        || /PERMISSION_DENIED/i.test(msg)
        || /SERVICE_DISABLED/i.test(msg)
        || /has not been used in project/i.test(msg);
}

/**
 * Speech-only pronunciation layer. Applied at the script → TTS boundary.
 * Never rewrite URLs in SEO, descriptions, comments, or on-screen copy.
 * Display URL stays https://studygyaan.in.
 */
function normalizeSpeechText(text) {
    let spoken = String(text || '');
    spoken = spoken.replace(/https?:\/\/(?:www\.)?studygyaan\.in/gi, 'StudyGyaan dot in');
    spoken = spoken.replace(/\bwww\.studygyaan\.in\b/gi, 'StudyGyaan dot in');
    spoken = spoken.replace(/\bstudygyaan\.in\b/gi, 'StudyGyaan dot in');
    spoken = spoken.replace(/(StudyGyaan dot in)(?:\s+\1)+/gi, '$1');
    return spoken;
}

/** Map a Google voice name (or gender word) to a gender key. */
function genderOf(voice) {
    const v = String(voice || '').toLowerCase();
    if (v.includes('female') || v.endsWith('-a') || v.includes('swara')) return 'female';
    if (v.includes('male') || v.endsWith('-c') || v.includes('madhur')) return 'male';
    return 'neutral';
}

/* ------------------------------------------------------------------ */
/* Engine 1 — Google Cloud TTS (needs billing)                         */
/* ------------------------------------------------------------------ */

async function synthesizeGoogle(text, outputPath, opts = {}) {
    const raw = process.env.TTS_KEY_JSON;
    void opts;
    if (!raw || raw === 'test') throw new Error('TTS_KEY_JSON missing');

    let credentials;
    try {
        credentials = JSON.parse(raw);
    } catch {
        throw new Error('TTS_KEY_JSON is not valid JSON');
    }

    const textToSpeech = require('@google-cloud/text-to-speech');
    const client = new textToSpeech.TextToSpeechClient({ credentials });

    const voice = opts.googleVoice || GOOGLE_VOICES[genderOf(opts.gender || opts.googleVoice)];
    const [response] = await client.synthesizeSpeech({
        input: { text },
        voice: { languageCode: 'hi-IN', name: voice },
        audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: opts.speakingRate || 1.0,
            pitch: opts.pitch === undefined ? 0 : opts.pitch
        }
    });

    fs.writeFileSync(outputPath, response.audioContent, 'binary');
    return { engine: 'google', voice };
}

/* ------------------------------------------------------------------ */
/* Engine 2 — Microsoft Edge Read Aloud (free, no key, no billing)     */
/* ------------------------------------------------------------------ */

async function synthesizeEdge(text, outputPath, opts = {}) {
    const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

    const voice = opts.edgeVoice || EDGE_VOICES[genderOf(opts.gender || opts.googleVoice)];

    // Google's speakingRate (1.0 = normal) -> Edge's percentage string.
    const rate = opts.speakingRate ? Math.round((opts.speakingRate - 1) * 100) : 0;
    const ratePct = `${rate >= 0 ? '+' : ''}${rate}%`;

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = await tts.toStream(text, { rate: ratePct });

    await new Promise((resolve, reject) => {
        const chunks = [];
        const timer = setTimeout(() => reject(new Error('Edge TTS timed out after 90s')), 90000);

        audioStream.on('data', (chunk) => chunks.push(chunk));
        audioStream.on('error', (err) => { clearTimeout(timer); reject(err); });
        audioStream.on('end', () => {
            clearTimeout(timer);
            const buffer = Buffer.concat(chunks);
            if (buffer.length === 0) return reject(new Error('Edge TTS returned empty audio'));
            fs.writeFileSync(outputPath, buffer);
            resolve();
        });
    });

    try { tts.close(); } catch { /* ignore */ }
    return { engine: 'edge', voice };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Synthesize Hindi speech to an MP3 file, choosing the best available engine.
 *
 * @param {string} text        what to say
 * @param {string} outputPath  .mp3 destination
 * @param {object} [opts]
 *        opts.googleVoice   e.g. 'hi-IN-Neural2-A' (also decides the Edge gender)
 *        opts.edgeVoice     override the Edge voice
 *        opts.gender        'female' | 'male' | 'neutral'
 *        opts.speakingRate  1.0 = normal
 *        opts.pitch         Google only
 * @returns {Promise<{engine:string, voice:string}>}
 */
async function synthesize(text, outputPath, opts = {}) {
    if (!text || !String(text).trim()) throw new Error('TTS: empty text');

    const spoken = normalizeSpeechText(text);
    const forced = (process.env.TTS_ENGINE || '').toLowerCase();

    if (forced === 'edge') {
        console.log('🎙️ TTS engine: Edge (forced via TTS_ENGINE=edge)');
        const r = await _impl.edge(spoken, outputPath, opts);
        console.log(`✅ Audio ready (${r.engine} · ${r.voice})`);
        return r;
    }

    if (forced !== 'google') {
        // Default path: prefer Google, fall back automatically.
        try {
            const r = await _impl.google(spoken, outputPath, opts);
            console.log(`✅ Audio ready (${r.engine} · ${r.voice})`);
            return r;
        } catch (err) {
            const reason = (err && err.message ? err.message : String(err)).split('\n')[0].substring(0, 160);
            if (isBillingError(err)) {
                console.log('⚠️ Google TTS needs billing — free Edge TTS par switch kar rahe hain.');
                console.log(`   (${reason})`);
                console.log('   Tip: billing band rehne tak TTS_ENGINE=edge set karo, taaki ye call skip ho jaye.');
            } else {
                console.log(`⚠️ Google TTS failed (${reason}) — Edge TTS try kar rahe hain.`);
            }
            const r = await _impl.edge(spoken, outputPath, opts);
            console.log(`✅ Audio ready (${r.engine} · ${r.voice})`);
            return r;
        }
    }

    // TTS_ENGINE=google — no fallback, surface the real error.
    const r = await _impl.google(spoken, outputPath, opts);
    console.log(`✅ Audio ready (${r.engine} · ${r.voice})`);
    return r;
}

// Seams for tests: override to stub the network engines without touching the
// module loader (which upsets Node's parallel test runner).
const _impl = { google: synthesizeGoogle, edge: synthesizeEdge };

module.exports = {
    _impl,
    synthesize,
    synthesizeGoogle,
    synthesizeEdge,
    isBillingError,
    genderOf,
    normalizeSpeechText,
    GOOGLE_VOICES,
    EDGE_VOICES
};
