'use strict';

/**
 * hook_engine.js — Hook Generation & Scoring (Phase 6 & 7)
 * 
 * Generates multiple hook candidates per topic and scores them.
 * Hook categories: urgency, curiosity, eligibility, benefit, deadline,
 * fear-of-missing-out, question, surprising-fact, direct-answer, audience-specific
 */

const flags = require('./feature_flags');

const HOOK_TYPES = [
    'urgency', 'curiosity', 'eligibility', 'benefit', 'deadline',
    'fomo', 'question', 'surprising_fact', 'direct_answer', 'audience_specific'
];

// Template-based hook generation for Hindi/English/Hinglish content
const HOOK_TEMPLATES = {
    urgency: [
        (f) => `⚡ ${f.org || 'सरकारी'} — ${f.action || 'भर्ती'} — Last Date ${f.lastDate || 'जल्दी'}`,
        (f) => `${f.org || ''} में ${f.vacancies || 'बहुत'} पद — अभी apply करो`,
        (f) => `URGENT: ${f.topic || 'नई भर्ती'} — ${f.lastDate ? 'Last Date ' + f.lastDate : 'अभी apply करो'}`,
        (f) => `Breaking: ${f.topic || 'सरकारी नौकरी'} — ${f.vacancies || 'बड़ी'} vacancy`,
    ],
    curiosity: [
        (f) => `क्या आप जानते हैं? ${f.topic || 'ये भर्ती'} ${f.vacancies ? f.vacancies + ' पदों' : 'के लिए'} आ गई`,
        (f) => `${f.edu || '10वीं पास'} भी apply कर सकता है — ${f.topic || 'ये भर्ती'}`,
        (f) => `ये ${f.category || 'सरकारी'} नौकरी miss मत करना`,
        (f) => `${f.org || ''} ने निकाली बंपर भर्ती — details देखो`,
    ],
    eligibility: [
        (f) => `${f.edu || '10वीं'} PASS हो? ये भर्ती आपके लिए है`,
        (f) => `${f.edu || '12th Pass'} + ${f.age || ''} — ये नौकरी तुम्हारे लिए है`,
        (f) => `बिना exam की ${f.category || 'सरकारी'} नौकरी — ${f.org || ''}`,
        (f) => `${f.edu || 'Graduate'} हो तो ${f.org || 'इस'} भर्ती के लिए apply करो`,
    ],
    benefit: [
        (f) => `${f.org || 'सरकारी'} नौकरी — ${f.salary || 'अच्छी'} salary + benefits`,
        (f) => `${f.org || ''} में career बनाओ — ${f.vacancies || 'बड़े'} पद available`,
        (f) => `${f.category || 'सरकारी'} job + ${f.location || 'home state'} posting`,
        (f) => `Life changing opportunity — ${f.topic || 'ये भर्ती'}`,
    ],
    deadline: [
        (f) => `Last Date ${f.lastDate || 'नज़दीक'} — ${f.topic || 'भर्ती'} miss मत करना`,
        (f) => `सिर्फ ${f.daysLeft || 'कुछ'} दिन बाकी — ${f.topic || 'भर्ती'} का`,
        (f) => `${f.lastDate || 'जल्दी'} से पहले apply करो — ${f.org || ''}`,
        (f) => `Application closing soon — ${f.topic || 'नई भर्ती'}`,
    ],
    fomo: [
        (f) => `हर कोई apply कर रहा है — ${f.topic || 'ये भर्ती'}`,
        (f) => `ये opportunity बार बार नहीं आएगी — ${f.org || ''}`,
        (f) => ` lakh students apply करेंगे — आप पीछे मत रहो`,
        (f) => `Before it's too late — ${f.topic || 'इस भर्ती'} के लिए apply करो`,
    ],
    question: [
        (f) => `${f.org || ''} में नौकरी चाहिए?`,
        (f) => `${f.edu || '10वीं पास'} हो और job चाहते हो?`,
        (f) => `${f.category || 'सरकारी'} नौकरी की तैयारी कर रहे हो?`,
        (f) => `सरकारी नौकरी or private? ये भर्ती देखो पहले`,
    ],
    surprising_fact: [
        (f) => `${f.vacancies || 'हज़ारों'} पद — एक ही notification में`,
        (f) => `बिना written exam — ${f.org || ''} में सीधी भर्ती`,
        (f) => `सिर्फ ${f.edu || '10वीं'} pass में ${f.category || 'सरकारी'} job`,
        (f) => `${f.org || ''} ने अब तक की सबसे बड़ी भर्ती निकाली`,
    ],
    direct_answer: [
        (f) => `${f.topic || 'भर्ती'} — ${f.vacancies || ''} पद — ${f.lastDate || ''}`,
        (f) => `${f.org || ''}: ${f.vacancies || 'नए'} पद, ${f.lastDate ? 'last date ' + f.lastDate : 'apply now'}`,
        (f) => `Result Out: ${f.topic || ''} — check करो`,
        (f) => `${f.topic || ''} — full details, ${f.vacancies || 'vacancy'} + ${f.lastDate || 'dates'}`,
    ],
    audience_specific: [
        (f) => `${f.state || ''} के students के लिए खुशखबरी — ${f.topic || 'नई भर्ती'}`,
        (f) => `${f.edu || '10वीं/12वीं'} pass students — ये भर्ती तुम्हारे लिए है`,
        (f) => `${f.gender || ''}${f.edu || 'युवा'} — ${f.category || 'सरकारी'} job का मौका`,
        (f) => `ITI/Diploma holders — ${f.org || ''} में नौकरी`,
    ]
};

function extractHookFacts(content) {
    return {
        org: content.organization || content.org || '',
        vacancies: content.vacancies || content.totalVacancies || '',
        lastDate: content.lastDate || '',
        startDate: content.startDate || '',
        topic: content.title || content.topic || '',
        category: content.category || '',
        education: content.qualification || content.edu || '',
        edu: content.qualification || content.edu || '10वीं पास',
        age: content.ageLimit || '',
        salary: content.salary || '',
        location: content.location || content.state || '',
        state: content.state || '',
        action: content.action || 'भर्ती'
    };
}

function generateHooks(content, opts = {}) {
    if (!flags.isEnabled('HOOK_ENGINE_ENABLED')) {
        return { hooks: [], reason: 'hook engine disabled' };
    }

    const facts = extractHookFacts(content);
    const requestedTypes = opts.hookTypes || HOOK_TYPES;
    const hooks = [];

    for (const type of requestedTypes) {
        const templates = HOOK_TEMPLATES[type];
        if (!templates) continue;

        for (const template of templates) {
            try {
                const text = template(facts).trim();
                if (text.length > 5 && text.length < 200) {
                    hooks.push({
                        hookText: text,
                        hookType: type,
                        contentId: opts.contentId || '',
                        topic: content.title || content.topic || '',
                        version: hooks.length + 1
                    });
                }
            } catch {
                // Template rendering failed — skip this hook
            }
        }
    }

    // Score all hooks
    const scored = hooks.map(h => ({
        ...h,
        hookScore: scoreHook(h, content)
    }));

    // Sort by score descending
    scored.sort((a, b) => b.hookScore.total - a.hookScore.total);

    return {
        hooks: scored,
        bestHook: scored[0] || null,
        totalGenerated: scored.length
    };
}

function scoreHook(hook, content = {}) {
    const text = hook.hookText || '';
    const type = hook.hookType || '';

    // Clarity: is the hook easy to understand?
    const clarity = Math.min(1, text.length > 10 ? 0.7 : 0.3) +
        (text.includes('?') ? 0.1 : 0) +
        (text.split(' ').length <= 15 ? 0.2 : 0);

    // Relevance: does it mention the content topic?
    const topic = String(content.title || content.topic || '').toLowerCase();
    const relevance = topic && text.toLowerCase().split(' ').some(w => topic.includes(w) && w.length > 3) ? 0.8 : 0.4;

    // Curiosity: does it make you want to know more?
    const curiosityTypes = ['curiosity', 'surprising_fact', 'question'];
    const curiosity = curiosityTypes.includes(type) ? 0.8 : 0.5;

    // Urgency: does it create time pressure?
    const urgencyTypes = ['urgency', 'deadline', 'fomo'];
    const hasUrgencyWords = /last date|urgent|breaking|जल्दी|अभी|soon/i.test(text);
    const urgency = urgencyTypes.includes(type) || hasUrgencyWords ? 0.9 : 0.3;

    // Audience fit: does it speak to the target audience?
    const audienceTypes = ['audience_specific', 'eligibility'];
    const hasAudienceWords = /10वीं|12th|pass|student|युवा|ITI|diploma|graduate/i.test(text);
    const audienceFit = audienceTypes.includes(type) || hasAudienceWords ? 0.85 : 0.5;

    // Information density: facts per word
    const words = text.split(/\s+/).length;
    const hasNumbers = /\d+/.test(text);
    const infoDensity = (hasNumbers ? 0.3 : 0) + (words <= 12 ? 0.3 : words <= 20 ? 0.2 : 0.1);

    const total = Math.round(
        (clarity * 15 + relevance * 25 + curiosity * 20 + urgency * 20 + audienceFit * 10 + infoDensity * 10)
    );

    return {
        clarity: Math.round(clarity * 100) / 100,
        relevance: Math.round(relevance * 100) / 100,
        curiosity: Math.round(curiosity * 100) / 100,
        urgency: Math.round(urgency * 100) / 100,
        audienceFit: Math.round(audienceFit * 100) / 100,
        informationDensity: Math.round(infoDensity * 100) / 100,
        total: Math.min(100, total),
        predicted: true
    };
}

module.exports = {
    HOOK_TYPES,
    HOOK_TEMPLATES,
    extractHookFacts,
    generateHooks,
    scoreHook
};
