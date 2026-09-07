'use strict';

/**
 * visual_engine.js — Visual Style Engine (Phase 10)
 * 
 * Style profiles for different content types. Current approved anchors remain
 * the only ones used. Adds controlled variation, not randomness.
 */

const APPROVED_ANCHORS = [
    'male_anchor_1.mp4',
    'male_anchor_3.mp4',
    'female_anchor_2.mp4',
    'female_anchor_4.mp4',
    'female_anchor_5.mp4'
];

const STYLE_PROFILES = {
    breaking: {
        anchor: 'any',
        background: 'red_gradient',
        typography: 'bold_sans',
        transition: 'quick_cut',
        captionStyle: 'highlight_red',
        animation: 'pulse',
        musicProfile: 'breaking',
        firstFramePriority: 'urgency_text'
    },
    news: {
        anchor: 'any',
        background: 'blue_gradient',
        typography: 'clean_sans',
        transition: 'fade',
        captionStyle: 'clean_white',
        animation: 'slide_in',
        musicProfile: 'news',
        firstFramePriority: 'topic_text'
    },
    'job-alert': {
        anchor: 'any',
        background: 'green_gradient',
        typography: 'bold_sans',
        transition: 'slide',
        captionStyle: 'highlight_green',
        animation: 'bounce_in',
        musicProfile: 'motivation',
        firstFramePriority: 'vacancy_text'
    },
    educational: {
        anchor: 'female',
        background: 'purple_gradient',
        typography: 'readable_serif',
        transition: 'cross_fade',
        captionStyle: 'clean_yellow',
        animation: 'gentle_fade',
        musicProfile: 'education',
        firstFramePriority: 'topic_text'
    },
    result: {
        anchor: 'any',
        background: 'gold_gradient',
        typography: 'bold_sans',
        transition: 'quick_cut',
        captionStyle: 'highlight_gold',
        animation: 'scale_in',
        musicProfile: 'motivation',
        firstFramePriority: 'result_text'
    },
    'admit-card': {
        anchor: 'any',
        background: 'orange_gradient',
        typography: 'bold_sans',
        transition: 'slide',
        captionStyle: 'highlight_orange',
        animation: 'bounce_in',
        musicProfile: 'news',
        firstFramePriority: 'date_text'
    },
    'mock-test': {
        anchor: 'female',
        background: 'indigo_gradient',
        typography: 'clean_sans',
        transition: 'fade',
        captionStyle: 'clean_white',
        animation: 'slide_in',
        musicProfile: 'education',
        firstFramePriority: 'subject_text'
    },
    motivational: {
        anchor: 'male',
        background: 'dark_gradient',
        typography: 'bold_serif',
        transition: 'cross_fade',
        captionStyle: 'highlight_white',
        animation: 'gentle_fade',
        musicProfile: 'motivation',
        firstFramePriority: 'quote_text'
    }
};

function selectStyle(content, opportunity, opts = {}) {
    const category = opportunity?.category || 'GENERAL';
    
    // Map category to style profile
    const categoryToStyle = {
        'RESULT': 'result',
        'ADMIT_CARD': 'admit-card',
        'SSC': 'job-alert',
        'RAILWAY': 'job-alert',
        'BANKING': 'job-alert',
        'DEFENCE': 'breaking',
        'POLICE': 'job-alert',
        'TEACHING': 'educational',
        'ENGINEERING': 'educational',
        'UPSC': 'educational',
        'STATE': 'news',
        'GENERAL': 'news'
    };

    let styleName = categoryToStyle[category] || 'news';
    
    // Override for urgency
    if (opportunity?.urgency === 'CRITICAL') styleName = 'breaking';
    if (content.type === 'MOCK_TEST') styleName = 'mock-test';

    const profile = STYLE_PROFILES[styleName] || STYLE_PROFILES.news;

    // Historical performance override (if available)
    if (opts.bestStyle) {
        return { ...profile, styleName: opts.bestStyle, overridden: true };
    }

    return { ...profile, styleName, overridden: false };
}

function selectAnchor(style, opts = {}) {
    if (opts.forcedAnchor) {
        if (APPROVED_ANCHORS.includes(opts.forcedAnchor)) return opts.forcedAnchor;
    }

    if (style.anchor === 'female') {
        const females = APPROVED_ANCHORS.filter(a => a.includes('female'));
        return females[opts.femaleIndex || 0] || APPROVED_ANCHORS[2];
    }
    if (style.anchor === 'male') {
        const males = APPROVED_ANCHORS.filter(a => a.includes('male'));
        return males[opts.maleIndex || 0] || APPROVED_ANCHORS[0];
    }

    // 'any' — use rotation from presenter engine or default
    return opts.rotationAnchor || APPROVED_ANCHORS[0];
}

module.exports = {
    APPROVED_ANCHORS,
    STYLE_PROFILES,
    selectStyle,
    selectAnchor
};
