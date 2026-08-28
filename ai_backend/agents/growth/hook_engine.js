'use strict';

/**
 * hook_engine.js — Hook Generation & Scoring (Phase 6 & 7)
 * 
 * Generates multiple hook candidates per topic and scores them.
 * Hook categories: urgency, curiosity, eligibility, benefit, deadline,
 * fear-of-missing-out, question, surprising-fact, direct-answer, audience-specific
 */

const flags = require('./feature_flags');
const { detectContentIntent, forbidsApplyLanguage, containsApplyLanguage } = require('./content_intent');

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
        (f) => f.edu ? `${f.edu} भी apply कर सकता है — ${f.topic || 'ये भर्ती'}` : `${f.topic || 'ये'} — अभी चेक करें`,
        (f) => `ये ${f.category || 'सरकारी'} नौकरी miss मत करना`,
        (f) => `${f.org || ''} ने निकाली बंपर भर्ती — details देखो`,
    ],
    eligibility: [
        (f) => f.edu ? `${f.edu} PASS हो? ये भर्ती आपके लिए है` : `${f.org || ''} भर्ती — eligibility check करें`,
        (f) => f.edu && f.age ? `${f.edu} + ${f.age} — ये नौकरी तुम्हारे लिए` : `${f.topic || 'भर्ती'} — eligibility details`,
        (f) => `बिना exam की ${f.category || 'सरकारी'} नौकरी — ${f.org || ''}`,
        (f) => f.edu ? `${f.edu} हो तो ${f.org || 'इस'} भर्ती के लिए apply करो` : `${f.vacancies || ''} पद — apply करें`,
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
        (f) => f.vacancies ? `${f.vacancies} पद — एक ही notification में` : `${f.topic || 'बड़ी भर्ती'} — details देखें`,
        (f) => `बिना written exam — ${f.org || ''} में सीधी भर्ती`,
        (f) => f.edu ? `सिर्फ ${f.edu} pass में ${f.category || 'सरकारी'} job` : `${f.category || 'Important'} update — अभी चेक करें`,
        (f) => `${f.org || ''} ने बड़ी भर्ती निकाली — ${f.vacancies || ''} पद`,
    ],
    direct_answer: [
        (f) => `${f.topic || 'भर्ती'} — ${f.vacancies || ''} पद — ${f.lastDate || ''}`,
        (f) => `${f.org || ''}: ${f.vacancies || 'नए'} पद, ${f.lastDate ? 'last date ' + f.lastDate : 'apply now'}`,
        (f) => `Result Out: ${f.topic || ''} — check करो`,
        (f) => `${f.topic || ''} — full details, ${f.vacancies || 'vacancy'} + ${f.lastDate || 'dates'}`,
    ],
    audience_specific: [
        (f) => f.edu ? `${f.edu} वालों के लिए — ${f.topic || 'बड़ी भर्ती'}` : `${f.org || ''} में ${f.vacancies || ''} पद`,
        (f) => f.edu ? `${f.edu} pass वालों — ये ${f.category || 'भर्ती'} तुम्हारे लिए` : `${f.topic || 'नई भर्ती'} — अभी apply करें`,
        (f) => `${f.gender || ''}${f.edu || 'युवा'} — ${f.category || 'सरकारी'} job का मौका`,
        (f) => `ITI/Diploma holders — ${f.org || ''} में नौकरी`,
    ]
};

// Category-aware hooks. JOB templates above keep Apply language.
// RESULT / ADMIT_CARD / ANSWER_KEY / SYLLABUS never use Apply / भर्ती-apply copy.
const INTENT_HOOK_TEMPLATES = {
    RESULT: {
        urgency: [
            (f) => `⚡ Result Out: ${f.topic || 'Result'} — अभी चेक करें`,
            (f) => `Breaking: ${f.topic || 'Result'} जारी हो गया है`,
            (f) => `${f.org || ''} Result declared — अभी देखें`,
            (f) => `URGENT: ${f.topic || 'Result'} — scorecard चेक करें`
        ],
        curiosity: [
            (f) => `क्या आपका result आ गया? ${f.topic || ''}`,
            (f) => `${f.topic || 'Result'} — merit list में नाम है क्या?`,
            (f) => `${f.org || ''} result में cutoff क्या रही?`,
            (f) => `${f.topic || 'Result'} का scorecard अभी देखें`
        ],
        benefit: [
            (f) => `${f.topic || 'Result'} — official result + scorecard`,
            (f) => `${f.org || ''} Result: merit list और cutoff चेक करें`,
            (f) => `Selection list live — ${f.topic || 'Result'}`,
            (f) => `${f.topic || 'Result'} declared — अपना नंबर देखें`
        ],
        question: [
            (f) => `${f.topic || 'Result'} आ गया क्या?`,
            (f) => `आपका ${f.org || ''} result निकला?`,
            (f) => `${f.topic || 'Result'} में selection हुआ?`,
            (f) => `Cutoff कितनी गई? ${f.topic || 'Result'} चेक करें`
        ],
        surprising_fact: [
            (f) => `${f.topic || 'Result'} जारी — merit list चेक करें`,
            (f) => `${f.org || ''} ने result declare कर दिया`,
            (f) => `Scorecard + cutoff — ${f.topic || 'Result'}`,
            (f) => `${f.topic || 'Result'} Out — official result देखें`
        ],
        direct_answer: [
            (f) => `Result Out: ${f.topic || ''} — अभी चेक करें`,
            (f) => `${f.topic || 'Result'} जारी हो गया है`,
            (f) => `${f.org || ''} Result declared — scorecard देखें`,
            (f) => `${f.topic || 'Result'} — merit list / selection list`
        ]
    },
    ADMIT_CARD: {
        urgency: [
            (f) => `⚡ Admit Card Out: ${f.topic || ''} — अभी download करें`,
            (f) => `Breaking: ${f.topic || 'Admit Card'} जारी`,
            (f) => `${f.org || ''} hall ticket live — अभी चेक करें`,
            (f) => `URGENT: ${f.topic || 'Admit Card'} download करें`
        ],
        curiosity: [
            (f) => `${f.topic || 'Admit Card'} आ गया? Exam center चेक करें`,
            (f) => `Hall ticket में क्या लिखा है? ${f.topic || ''}`,
            (f) => `${f.org || ''} admit card — timing और center देखें`,
            (f) => `${f.topic || 'Admit Card'} download हो गया क्या?`
        ],
        benefit: [
            (f) => `${f.topic || 'Admit Card'} — exam center + timing`,
            (f) => `Hall ticket download — ${f.org || ''}`,
            (f) => `${f.topic || 'Admit Card'} जारी — documents तैयार रखें`,
            (f) => `Call letter live — ${f.topic || 'Admit Card'}`
        ],
        question: [
            (f) => `${f.topic || 'Admit Card'} download किया?`,
            (f) => `Exam center पता है? ${f.org || ''} hall ticket देखें`,
            (f) => `${f.topic || 'Admit Card'} आ गया क्या?`,
            (f) => `बिना hall ticket entry? ${f.topic || ''} चेक करें`
        ],
        surprising_fact: [
            (f) => `${f.topic || 'Admit Card'} जारी हो गया है`,
            (f) => `${f.org || ''} ने hall ticket release कर दिया`,
            (f) => `Exam date नज़दीक — ${f.topic || 'Admit Card'}`,
            (f) => `${f.topic || 'Admit Card'} Out — अभी download करें`
        ],
        direct_answer: [
            (f) => `Admit Card Out: ${f.topic || ''} — download करें`,
            (f) => `${f.topic || 'Admit Card'} जारी — hall ticket चेक करें`,
            (f) => `${f.org || ''} call letter live`,
            (f) => `${f.topic || 'Admit Card'} — exam center देखें`
        ]
    },
    ANSWER_KEY: {
        urgency: [
            (f) => `⚡ Answer Key Out: ${f.topic || ''} — अभी चेक करें`,
            (f) => `Breaking: ${f.topic || 'Answer Key'} जारी`,
            (f) => `Objection window खुली — ${f.topic || 'Answer Key'}`,
            (f) => `URGENT: ${f.org || ''} official key देखें`
        ],
        curiosity: [
            (f) => `${f.topic || 'Answer Key'} में कितने सही हुए?`,
            (f) => `Cutoff का अंदाज़ा — ${f.topic || 'Answer Key'}`,
            (f) => `${f.org || ''} key से objection डालना है?`,
            (f) => `Provisional key आ गई? ${f.topic || ''}`
        ],
        benefit: [
            (f) => `${f.topic || 'Answer Key'} — answers मिलाएं`,
            (f) => `Official key + objection — ${f.org || ''}`,
            (f) => `${f.topic || 'Answer Key'} से expected cutoff देखें`,
            (f) => `Question paper + key — ${f.topic || 'Answer Key'}`
        ],
        question: [
            (f) => `${f.topic || 'Answer Key'} चेक की?`,
            (f) => `Objection डालना है? ${f.org || ''} key देखें`,
            (f) => `${f.topic || 'Answer Key'} आ गई क्या?`,
            (f) => `Expected cutoff कितनी? ${f.topic || ''} key चेक करें`
        ],
        surprising_fact: [
            (f) => `${f.topic || 'Answer Key'} जारी हो गई है`,
            (f) => `${f.org || ''} ने official key release कर दी`,
            (f) => `Objection window — ${f.topic || 'Answer Key'}`,
            (f) => `${f.topic || 'Answer Key'} Out — अभी मिलाएं`
        ],
        direct_answer: [
            (f) => `Answer Key Out: ${f.topic || ''} — अभी चेक करें`,
            (f) => `${f.topic || 'Answer Key'} जारी — objection देखें`,
            (f) => `${f.org || ''} official / provisional key live`,
            (f) => `${f.topic || 'Answer Key'} — answers चेक करें`
        ]
    },
    SYLLABUS: {
        urgency: [
            (f) => `⚡ New Syllabus: ${f.topic || ''} — अभी देखें`,
            (f) => `Exam pattern बदल गया — ${f.topic || 'Syllabus'}`,
            (f) => `Breaking: ${f.org || ''} syllabus जारी`,
            (f) => `URGENT: ${f.topic || 'Syllabus'} PDF चेक करें`
        ],
        curiosity: [
            (f) => `${f.topic || 'Syllabus'} में नया क्या है?`,
            (f) => `कौन से topics आए? ${f.topic || 'Syllabus'}`,
            (f) => `${f.org || ''} exam pattern क्या है?`,
            (f) => `${f.topic || 'Syllabus'} updated हो गया?`
        ],
        benefit: [
            (f) => `${f.topic || 'Syllabus'} — topic-wise PDF`,
            (f) => `Latest exam pattern — ${f.org || ''}`,
            (f) => `${f.topic || 'Syllabus'} से तैयारी शुरू करें`,
            (f) => `Updated syllabus — ${f.topic || ''}`
        ],
        question: [
            (f) => `${f.topic || 'Syllabus'} देख लिया?`,
            (f) => `नया pattern पता है? ${f.org || ''} syllabus चेक करें`,
            (f) => `${f.topic || 'Syllabus'} बदल गया क्या?`,
            (f) => `कौन से topics important हैं? ${f.topic || ''}`
        ],
        surprising_fact: [
            (f) => `${f.topic || 'Syllabus'} जारी हो गया है`,
            (f) => `${f.org || ''} ने exam pattern update कर दिया`,
            (f) => `New syllabus — ${f.topic || ''}`,
            (f) => `${f.topic || 'Syllabus'} Out — PDF चेक करें`
        ],
        direct_answer: [
            (f) => `Syllabus Out: ${f.topic || ''} — अभी देखें`,
            (f) => `${f.topic || 'Syllabus'} जारी — exam pattern चेक करें`,
            (f) => `${f.org || ''} latest syllabus live`,
            (f) => `${f.topic || 'Syllabus'} — topic list देखें`
        ]
    }
};

function templatesForIntent(intent, type) {
    if (forbidsApplyLanguage(intent)) {
        return (INTENT_HOOK_TEMPLATES[intent] && INTENT_HOOK_TEMPLATES[intent][type]) || [];
    }
    return HOOK_TEMPLATES[type] || [];
}

function extractHookFacts(content) {
    return {
        org: content.organization || content.org || '',
        vacancies: content.vacancies || content.totalVacancies || '',
        lastDate: content.lastDate || '',
        startDate: content.startDate || '',
        topic: content.title || content.topic || '',
        category: content.category || '',
        education: content.qualification || content.edu || '',
        edu: content.qualification || content.edu || '',  // empty if not provided
        age: content.ageLimit || '',
        salary: content.salary || '',
        location: content.location || content.state || '',
        state: content.state || '',
        action: content.action || 'भर्ती',
        type: content.type || 'JOB',  // JOB, FAST_TRACK, MOCK_TEST
        intent: detectContentIntent(content)
    };
}

function generateHooks(content, opts = {}) {
    if (!flags.isEnabled('HOOK_ENGINE_ENABLED')) {
        return { hooks: [], reason: 'hook engine disabled' };
    }

    const facts = extractHookFacts(content);
    const intent = facts.intent;
    const requestedTypes = opts.hookTypes || HOOK_TYPES;
    const hooks = [];

    for (const type of requestedTypes) {
        const templates = templatesForIntent(intent, type);
        if (!templates || templates.length === 0) continue;

        for (const template of templates) {
            try {
                const text = template(facts).trim();
                if (text.length <= 5 || text.length >= 200) continue;
                if (forbidsApplyLanguage(intent) && containsApplyLanguage(text)) continue;
                hooks.push({
                    hookText: text,
                    hookType: type,
                    contentId: opts.contentId || '',
                    topic: content.title || content.topic || '',
                    intent,
                    version: hooks.length + 1
                });
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
