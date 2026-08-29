'use strict';

/**
 * duration_fitter.js — Target-Duration Strategy (Growth Self-Learning, Phase 5)
 *
 * The rendered video's duration equals the TTS voice track length (ffmpeg
 * assembles the poster/anchor loop around the voice with -shortest). So a
 * learned target duration can only be honoured by shaping what is spoken
 * BEFORE rendering:
 *
 *   1. TRIM the script (sentence-aware, keeps the hook first sentence and
 *      the closing CTA sentence, drops middle sentences first). Content is
 *      only ever removed — nothing is ever invented.
 *   2. Adjust the TTS SPEAKING RATE within a safe, natural band
 *      (0.9× – 1.25×) to fine-tune the spoken length towards the target.
 *
 * Both knobs together give the learned duration policy real, bounded
 * influence over the actual rendered duration.
 */

// Hindi speech pace used by script_engine's estimate (~3.5 words/sec at rate 1.0).
const WORDS_PER_SECOND = 3.5;
const MIN_RATE = 0.9;
const MAX_RATE = 1.25;
const DEFAULT_BASE_RATE = 1.08;

function countWords(text) {
    if (!text) return 0;
    return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function splitSentences(text) {
    return String(text || '')
        .split(/(?<=[।!?.])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Trim a script to a word budget without inventing content.
 * Keeps: first sentence (the hook) + last sentence (the CTA) + as many
 * middle sentences as the budget allows.
 */
function trimScriptToWords(script, maxWords) {
    const sentences = splitSentences(script);
    if (sentences.length <= 2) return String(script || '').trim();

    const first = sentences[0];
    const last = sentences[sentences.length - 1];
    const middle = sentences.slice(1, -1);

    const fixedWords = countWords(first) + countWords(last);
    if (fixedWords >= maxWords) {
        // Extreme case: keep hook + CTA only.
        return [first, last].join(' ');
    }

    let budget = maxWords - fixedWords;
    const keptMiddle = [];
    for (const sentence of middle) {
        const words = countWords(sentence);
        if (words <= budget) {
            keptMiddle.push(sentence);
            budget -= words;
        }
    }
    return [first, ...keptMiddle, last].join(' ');
}

/**
 * Fit a script to a target duration (seconds).
 *
 * Returns:
 *   {
 *     script, speakingRate, estimatedSeconds, wordCount, targetSeconds,
 *     trimmed, strategy  // 'rate' | 'trim+rate' | 'min-rate' | 'none'
 *   }
 *
 * Never invents content: when the script is too SHORT for the target the
 * rate is only lowered to MIN_RATE and estimatedSeconds honestly reports
 * that the target cannot be fully reached without new content.
 */
function fitScriptToDuration(script, targetSeconds, opts = {}) {
    const minRate = opts.minRate || MIN_RATE;
    const maxRate = opts.maxRate || MAX_RATE;
    const baseRate = opts.baseRate || DEFAULT_BASE_RATE;
    const text = String(script || '').trim();
    const target = Number(targetSeconds);

    if (!text || !Number.isFinite(target) || target <= 0) {
        return {
            script: text,
            speakingRate: baseRate,
            estimatedSeconds: Math.round(countWords(text) / (WORDS_PER_SECOND * baseRate)),
            wordCount: countWords(text),
            targetSeconds: Number.isFinite(target) ? target : null,
            trimmed: false,
            strategy: 'none'
        };
    }

    let working = text;
    let trimmed = false;

    // Step 1 — trim if even the fastest safe rate cannot fit the script.
    const maxWords = Math.max(10, Math.floor(target * WORDS_PER_SECOND * maxRate));
    if (countWords(working) > maxWords) {
        working = trimScriptToWords(working, maxWords);
        trimmed = true;
    }

    // Step 2 — choose the speaking rate that lands closest to the target.
    const words = countWords(working);
    const rawRate = words / (target * WORDS_PER_SECOND);
    const rate = Math.min(maxRate, Math.max(minRate, Math.round(rawRate * 100) / 100));
    const estimatedSeconds = Math.round(words / (WORDS_PER_SECOND * rate));

    let strategy = 'rate';
    if (trimmed) strategy = 'trim+rate';
    else if (rate === minRate && estimatedSeconds < target) strategy = 'min-rate';

    return {
        script: working,
        speakingRate: rate,
        estimatedSeconds,
        wordCount: words,
        targetSeconds: target,
        trimmed,
        strategy
    };
}

/**
 * Pure helper: which speaking rate would the CURRENT script need to hit a
 * target? (No trimming — planning numbers only.)
 */
function planRate(script, targetSeconds, opts = {}) {
    const words = countWords(script);
    const target = Number(targetSeconds);
    const minRate = opts.minRate || MIN_RATE;
    const maxRate = opts.maxRate || MAX_RATE;
    if (!Number.isFinite(target) || target <= 0 || words === 0) {
        return { speakingRate: opts.baseRate || DEFAULT_BASE_RATE, estimatedSeconds: 0, wordCount: words };
    }
    const rawRate = words / (target * WORDS_PER_SECOND);
    const rate = Math.min(maxRate, Math.max(minRate, Math.round(rawRate * 100) / 100));
    return { speakingRate: rate, estimatedSeconds: Math.round(words / (WORDS_PER_SECOND * rate)), wordCount: words };
}

/**
 * Resolve the render plan for a video from its growth recommendation.
 * This is the EXACT entry point autoVideo.js uses: it reads the
 * recommendation's duration target (blended with the learned policy target
 * when learning is active), fits the script to it (trim + speaking rate)
 * and returns what the renderer must use.
 *
 * Returns { script, speakingRate, targetSeconds, estimatedSeconds,
 *           trimmed, strategy, applied, learningNote }.
 * `applied: false` when there is no usable target (unchanged default rate).
 */
function resolveRenderPlan(script, growthRec, opts = {}) {
    const defaultRate = opts.defaultRate || DEFAULT_BASE_RATE;
    const rec = growthRec && typeof growthRec === 'object' ? growthRec : null;

    const target = rec && Number.isFinite(Number(rec.duration))
        && Number(rec.duration) >= 10 && Number(rec.duration) <= 60
        ? Math.round(Number(rec.duration))
        : null;

    if (!target) {
        return {
            script: String(script || ''),
            speakingRate: defaultRate,
            targetSeconds: null,
            estimatedSeconds: Math.round(countWords(script) / (WORDS_PER_SECOND * defaultRate)),
            trimmed: false,
            strategy: 'none',
            applied: false,
            learningNote: ''
        };
    }

    const fit = fitScriptToDuration(script, target);
    const decision = rec.learning && rec.learning.decisions && rec.learning.decisions.duration
        ? rec.learning.decisions.duration
        : null;
    const learningNote = decision
        ? ` (mode=${decision.mode}${decision.changedSelection ? ', changed from default ' + decision.defaultWouldBe + 's' : ''})`
        : '';

    return {
        script: fit.script,
        speakingRate: fit.speakingRate,
        targetSeconds: target,
        estimatedSeconds: fit.estimatedSeconds,
        trimmed: fit.trimmed,
        strategy: fit.strategy,
        applied: true,
        learningNote
    };
}

module.exports = {
    WORDS_PER_SECOND,
    MIN_RATE,
    MAX_RATE,
    DEFAULT_BASE_RATE,
    fitScriptToDuration,
    trimScriptToWords,
    planRate,
    resolveRenderPlan,
    countWords
};
