'use strict';

/**
 * content_intent.js — Category-aware content intent for video language.
 *
 * Detects RESULT / ADMIT_CARD / ANSWER_KEY / SYLLABUS / JOB from title +
 * category + type. Used to keep Apply language on JOB videos while forbidding
 * it on result-style updates. This is NOT a global "apply" ban.
 */

const APPLY_FORBIDDEN_INTENTS = new Set(['RESULT', 'ADMIT_CARD', 'ANSWER_KEY', 'SYLLABUS']);

const INTENT_KEYWORDS = {
    RESULT: [
        'result', 'merit list', 'selection list', 'scorecard', 'marksheet',
        'cutoff', 'cut off', 'cut-off', 'final result', 'result declared',
        'result out', 'result जारी'
    ],
    ADMIT_CARD: [
        'admit card', 'hall ticket', 'call letter', 'e-admit', 'eadmit'
    ],
    ANSWER_KEY: [
        'answer key', 'objection', 'provisional key', 'official key'
    ],
    SYLLABUS: [
        'syllabus', 'exam pattern'
    ]
};

const DISPLAY_CATEGORY = {
    RESULT: 'Result',
    ADMIT_CARD: 'Admit Card',
    ANSWER_KEY: 'Answer Key',
    SYLLABUS: 'Syllabus',
    JOB: 'Default'
};

const APPLY_LANGUAGE_RE = /\bapply\b|अप्लाई|आवेदन/i;

function normalizeIntentToken(value) {
    return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function detectContentIntent(content = {}) {
    const category = String(content.category || '');
    const type = String(content.type || content.contentType || '');
    const title = String(content.title || content.topic || '');
    const combined = `${category} ${type} ${title}`.toLowerCase();

    const catNorm = normalizeIntentToken(category);
    if (APPLY_FORBIDDEN_INTENTS.has(catNorm) || catNorm === 'JOB') {
        return catNorm;
    }

    // Title / category keywords beat FAST_TRACK / exam-family labels.
    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
        if (keywords.some((kw) => combined.includes(kw))) return intent;
    }

    if (type === 'JOB' || catNorm === 'JOB') return 'JOB';
    if (type === 'FAST_TRACK') return 'FAST_TRACK';
    return 'GENERAL';
}

function forbidsApplyLanguage(intentOrContent) {
    const intent = typeof intentOrContent === 'string'
        ? intentOrContent
        : detectContentIntent(intentOrContent || {});
    return APPLY_FORBIDDEN_INTENTS.has(intent);
}

function containsApplyLanguage(text) {
    return APPLY_LANGUAGE_RE.test(String(text || ''));
}

function displayCategoryForIntent(intent) {
    return DISPLAY_CATEGORY[intent] || 'Default';
}

module.exports = {
    APPLY_FORBIDDEN_INTENTS,
    INTENT_KEYWORDS,
    APPLY_LANGUAGE_RE,
    detectContentIntent,
    forbidsApplyLanguage,
    containsApplyLanguage,
    displayCategoryForIntent,
    normalizeIntentToken
};
