'use strict';

/**
 * script_engine.js — AI Script Engine for short-form video (Phase 5)
 * 
 * Produces retention-optimized scripts:
 * 1. HOOK
 * 2. CONTEXT
 * 3. MAIN VALUE
 * 4. IMPORTANT FACTS
 * 5. CTA
 * 
 * Avoids: long intros, filler, robotic language, excessive website promotion.
 */

const flags = require('./feature_flags');
const { detectContentIntent } = require('./content_intent');

const SCRIPT_STRUCTURES = {
    BREAKING_SHORT: {
        sections: ['hook', 'main_fact', 'cta'],
        targetWords: 40,
        description: '15-25 second breaking update'
    },
    UPDATE: {
        sections: ['hook', 'context', 'main_fact', 'cta'],
        targetWords: 60,
        description: '20-35 second update (result, admit card, etc)'
    },
    JOB_ALERT: {
        sections: ['hook', 'context', 'main_fact', 'important_facts', 'cta'],
        targetWords: 80,
        description: '30-45 second job alert'
    },
    DETAILED: {
        sections: ['hook', 'context', 'main_fact', 'important_facts', 'cta'],
        targetWords: 120,
        description: '45-60 second detailed explainer'
    }
};

function buildScript(opportunity, hook, content, opts = {}) {
    if (!flags.isEnabled('SCRIPT_ENGINE_ENABLED')) {
        return { script: null, reason: 'script engine disabled' };
    }

    const format = opportunity.recommendedFormat || 'JOB_ALERT';
    const structure = SCRIPT_STRUCTURES[format] || SCRIPT_STRUCTURES.JOB_ALERT;
    const facts = extractScriptFacts(content, opportunity);
    
    const sections = {};
    
    // 1. HOOK — use provided hook or generate from opportunity
    sections.hook = hook?.hookText || generateDefaultHook(opportunity, facts);
    
    // 2. CONTEXT — only if structure requires it
    if (structure.sections.includes('context')) {
        sections.context = buildContext(facts, opportunity);
    }
    
    // 3. MAIN VALUE
    sections.main_fact = buildMainFact(facts, opportunity);
    
    // 4. IMPORTANT FACTS
    if (structure.sections.includes('important_facts')) {
        sections.important_facts = buildImportantFacts(facts);
    }
    
    // 5. CTA
    sections.cta = buildCTA(facts, opportunity, opts);
    
    const fullScript = Object.values(sections).filter(Boolean).join(' ');
    const wordCount = fullScript.split(/\s+/).length;
    
    return {
        script: fullScript,
        sections,
        format,
        targetWords: structure.targetWords,
        actualWords: wordCount,
        estimatedDurationSec: Math.round(wordCount / 3.5), // ~3.5 words/sec for Hindi
        structure: structure.description
    };
}

function extractScriptFacts(content, opportunity) {
    return {
        org: content.organization || content.org || '',
        vacancies: content.vacancies || content.totalVacancies || '',
        lastDate: content.lastDate || '',
        startDate: content.startDate || '',
        topic: content.title || content.topic || '',
        category: content.category || '',
        qualification: content.qualification || '',
        ageLimit: content.ageLimit || '',
        salary: content.salary || '',
        location: content.location || content.state || '',
        applyUrl: content.officialUrl || content.applyUrl || 'studygyaan.in',
        keyFacts: opportunity?.keyFacts || []
    };
}

function resolveScriptIntent(opportunity, facts) {
    return detectContentIntent({
        category: opportunity?.category || facts?.category,
        type: opportunity?.contentType,
        title: facts?.topic
    });
}

function generateDefaultHook(opportunity, facts) {
    const intent = resolveScriptIntent(opportunity, facts);
    if (intent === 'RESULT') {
        return `${facts.topic || 'Result'} जारी हो गया है — अभी चेक करें`;
    }
    if (intent === 'ADMIT_CARD') {
        return `${facts.topic || 'Admit Card'} जारी — अभी download करें`;
    }
    if (intent === 'ANSWER_KEY') {
        return `${facts.topic || 'Answer Key'} जारी — अभी चेक करें`;
    }
    if (intent === 'SYLLABUS') {
        return `${facts.topic || 'Syllabus'} जारी — exam pattern देखें`;
    }
    if (opportunity.urgency === 'CRITICAL') {
        return `⚡ ${facts.topic || 'Breaking Update'} — ${facts.vacancies ? facts.vacancies + ' पद' : 'important news'}`;
    }
    if (facts.vacancies) {
        return `${facts.org || 'सरकारी'} में ${facts.vacancies} पद — ${facts.lastDate ? 'Last Date ' + facts.lastDate : 'अभी apply करो'}`;
    }
    return `${facts.topic || 'नई भर्ती'} — पूरी जानकारी देखिए`;
}

function buildContext(facts, opportunity) {
    const intent = resolveScriptIntent(opportunity, facts);
    const parts = [];
    if (facts.org) parts.push(`${facts.org} ने`);
    if (intent === 'RESULT') parts.push('result declare कर दिया है');
    else if (intent === 'ADMIT_CARD') parts.push('admit card release कर दिया है');
    else if (intent === 'ANSWER_KEY') parts.push('answer key जारी कर दी है');
    else if (intent === 'SYLLABUS') parts.push('syllabus update कर दिया है');
    else parts.push('नई भर्ती निकाली है');
    return parts.join(' ') + '।';
}

function buildMainFact(facts, opportunity) {
    const intent = resolveScriptIntent(opportunity, facts);
    if (intent === 'RESULT') {
        return `${facts.topic || 'Result'} जारी हो गया है। अपना Result, Scorecard और Merit List चेक करें।`;
    }
    if (intent === 'ADMIT_CARD') {
        return `${facts.topic || 'Admit Card'} जारी हो गया है। अपना Admit Card download करें और exam center चेक करें।`;
    }
    if (intent === 'ANSWER_KEY') {
        return `${facts.topic || 'Answer Key'} जारी हो गई है। Answer Key चेक करें और objection window देखें।`;
    }
    if (intent === 'SYLLABUS') {
        return `${facts.topic || 'Syllabus'} जारी हो गया है। Exam pattern और topics चेक करें।`;
    }
    const parts = [];
    if (facts.vacancies) parts.push(`कुल ${facts.vacancies} पदों पर भर्ती है`);
    if (facts.qualification) parts.push(`योग्यता: ${facts.qualification}`);
    if (facts.lastDate) parts.push(`Last Date: ${facts.lastDate}`);
    if (facts.startDate) parts.push(`Application Start: ${facts.startDate}`);
    return parts.join('। ') + (parts.length ? '।' : '');
}

function buildImportantFacts(facts) {
    const parts = [];
    if (facts.ageLimit) parts.push(`Age Limit: ${facts.ageLimit}`);
    if (facts.salary) parts.push(`Salary: ${facts.salary}`);
    if (facts.location) parts.push(`Posting: ${facts.location}`);
    if (facts.category) parts.push(`Category: ${facts.category}`);
    return parts.length ? parts.join('। ') + '।' : '';
}

function buildCTA(facts, opportunity, opts) {
    void opts;
    const intent = resolveScriptIntent(opportunity, facts);
    // Spoken brand is applied later in tts_engine.normalizeSpeechText.
    // Keep studygyaan.in here so captions / display copy stay as the real URL.
    if (intent === 'RESULT') {
        return `Result check करने के लिए studygyaan.in visit करें।`;
    }
    if (intent === 'ADMIT_CARD') {
        return `Admit Card download करने के लिए studygyaan.in पर जाएं।`;
    }
    if (intent === 'ANSWER_KEY') {
        return `Answer Key चेक करने के लिए studygyaan.in visit करें।`;
    }
    if (intent === 'SYLLABUS') {
        return `Syllabus देखने के लिए studygyaan.in visit करें।`;
    }
    if (facts.lastDate) {
        return `Last Date ${facts.lastDate} से पहले apply करें। Details studygyaan.in पर।`;
    }
    return `Apply करने के लिए studygyaan.in visit करें।`;
}

module.exports = {
    SCRIPT_STRUCTURES,
    buildScript,
    extractScriptFacts,
    generateDefaultHook,
    resolveScriptIntent,
    buildContext,
    buildMainFact,
    buildImportantFacts,
    buildCTA
};
