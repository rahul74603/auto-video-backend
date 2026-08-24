'use strict';

/**
 * platform_packaging.js — Platform-Specific Metadata (Phase 15 & 16)
 * 
 * Generates platform-specific title, description, hashtags, CTA, and link strategy.
 * SEO is relevance-first — only keywords relevant to the actual content.
 */

function generatePlatformPackage(content, opportunity, opts = {}) {
    const topic = content.title || content.topic || '';
    const org = content.organization || content.org || '';
    const category = opportunity?.category || detectSimpleCategory(content);
    const hookText = opts.hookText || topic;

    return {
        youtube: generateYouTube(topic, org, category, hookText, content),
        instagram: generateInstagram(topic, org, category, hookText, content),
        facebook: generateFacebook(topic, org, category, hookText, content),
        telegram: generateTelegram(topic, org, category, hookText, content),
        seo: generateSEO(topic, org, category, content)
    };
}

function generateYouTube(topic, org, category, hook, content) {
    return {
        title: truncate(`${hook} | ${org || 'StudyGyaan'} | ${category}`, 100),
        description: [
            hook,
            '',
            org ? `📌 Organization: ${org}` : '',
            content.vacancies ? `📊 Vacancies: ${content.vacancies}` : '',
            content.lastDate ? `📅 Last Date: ${content.lastDate}` : '',
            content.qualification ? `🎓 Eligibility: ${content.qualification}` : '',
            '',
            '🔗 Apply Online & Full Details: https://studygyaan.in',
            '',
            '#StudyGyaan #SarkariNaukri ' + generateHashtags(category, content).slice(0, 5).map(h => `#${h}`).join(' ')
        ].filter(Boolean).join('\n'),
        hashtags: generateHashtags(category, content).slice(0, 15),
        tags: generateRelevantTags(category, content),
        cta: 'Subscribe for daily sarkari naukri updates!',
        privacyStatus: 'public'
    };
}

function generateInstagram(topic, org, category, hook, content) {
    return {
        caption: [
            `${hook}`,
            '',
            org ? `🏢 ${org}` : '',
            content.vacancies ? `📊 ${content.vacancies} Posts` : '',
            content.lastDate ? `📅 Last Date: ${content.lastDate}` : '',
            '',
            '🔗 Link in bio for full details',
            '',
            generateHashtags(category, content).map(h => `#${h}`).join(' ')
        ].filter(Boolean).join('\n'),
        hashtags: generateHashtags(category, content),
        cta: 'Link in bio 👆'
    };
}

function generateFacebook(topic, org, category, hook, content) {
    return {
        caption: [
            `${hook}`,
            '',
            org ? `🏢 ${org}` : '',
            content.vacancies ? `Total Posts: ${content.vacancies}` : '',
            content.lastDate ? `Last Date: ${content.lastDate}` : '',
            content.qualification ? `Eligibility: ${content.qualification}` : '',
            '',
            '✅ Full details on StudyGyaan.in',
            '',
            generateHashtags(category, content).slice(0, 5).map(h => `#${h}`).join(' ')
        ].filter(Boolean).join('\n'),
        hashtags: generateHashtags(category, content).slice(0, 8),
        cta: 'Visit studygyaan.in for complete details'
    };
}

function generateTelegram(topic, org, category, hook, content) {
    return {
        message: [
            `📢 *${hook}*`,
            '',
            org ? `🏢 *${org}*` : '',
            content.vacancies ? `📊 Vacancies: *${content.vacancies}*` : '',
            content.lastDate ? `📅 Last Date: *${content.lastDate}*` : '',
            content.qualification ? `🎓 Eligibility: ${content.qualification}` : '',
            content.ageLimit ? `👤 Age: ${content.ageLimit}` : '',
            '',
            '🔗 [Full Details & Apply Online](https://studygyaan.in)',
            '',
            `📱 Join @studygyaan for daily updates`
        ].filter(Boolean).join('\n'),
        parseMode: 'Markdown',
        link: 'https://studygyaan.in',
        cta: 'Join channel for daily updates'
    };
}

function generateSEO(topic, org, category, content) {
    // Relevance-first SEO (Phase 16) — no unrelated tags
    const primaryKeyword = `${org || category || ''} ${getCoreTopic(topic)}`.trim();
    const secondaryKeywords = [];
    
    if (content.vacancies) secondaryKeywords.push(`${org} vacancy ${getCurrentYear()}`);
    if (content.lastDate) secondaryKeywords.push(`${org} last date apply online`);
    if (content.qualification) secondaryKeywords.push(`${org} eligibility ${content.qualification}`);
    if (category) secondaryKeywords.push(`${category.toLowerCase()} ${getCoreTopic(topic)}`);
    
    secondaryKeywords.push(`${org} apply online`);

    return {
        primaryKeyword: truncate(primaryKeyword, 60),
        secondaryKeywords: secondaryKeywords.slice(0, 5),
        brandKeyword: 'StudyGyaan',
        metaDescription: truncate(`${topic} - ${org ? org + ' ' : ''}${content.vacancies ? content.vacancies + ' vacancies, ' : ''}${content.lastDate ? 'last date ' + content.lastDate : ''} Full details at StudyGyaan`, 160),
        relevanceScore: computeRelevanceScore(primaryKeyword, content)
    };
}

function generateHashtags(category, content) {
    const tags = ['StudyGyaan', 'SarkariNaukri'];
    
    const categoryTags = {
        'SSC': ['SSC', 'SSCExams'],
        'RAILWAY': ['RailwayJobs', 'RRB'],
        'BANKING': ['BankJobs', 'IBPS'],
        'UPSC': ['UPSC', 'CivilServices'],
        'DEFENCE': ['DefenceJobs', 'IndianArmy'],
        'POLICE': ['PoliceJobs', 'PoliceBharti'],
        'TEACHING': ['TeacherJobs', 'TET'],
        'ENGINEERING': ['EngineeringJobs', 'JE'],
        'STATE': ['StateGovtJobs'],
        'RESULT': ['Result', 'ResultOut'],
        'ADMIT_CARD': ['AdmitCard'],
        'GENERAL': ['GovtJobs', 'JobAlert']
    };

    if (categoryTags[category]) tags.push(...categoryTags[category]);
    
    // Only add organization tag if it's a clear name
    if (content.organization && content.organization.length < 20 && /^[A-Za-z\s/.]+$/.test(content.organization)) {
        tags.push(content.organization.replace(/\s+/g, ''));
    }

    return [...new Set(tags)];
}

function generateRelevantTags(category, content) {
    const tags = ['sarkari naukri', 'govt jobs', 'studygyaan'];
    const org = content.organization || '';
    
    if (org) tags.push(`${org.toLowerCase()} vacancy`);
    if (category && category !== 'GENERAL') tags.push(`${category.toLowerCase()} jobs ${getCurrentYear()}`);
    if (content.qualification) tags.push(`${content.qualification} pass jobs`);
    
    return tags.slice(0, 10);
}

function getCoreTopic(topic) {
    return String(topic).split(/\s+/).slice(0, 3).join(' ');
}

function getCurrentYear() {
    return new Date().getFullYear();
}

function detectSimpleCategory(content) {
    const title = String(content.title || '').toLowerCase();
    if (/result/.test(title)) return 'RESULT';
    if (/admit card/.test(title)) return 'ADMIT_CARD';
    if (/ssc/.test(title)) return 'SSC';
    if (/railway|rrb/.test(title)) return 'RAILWAY';
    if (/bank|ibps|sbi/.test(title)) return 'BANKING';
    return 'GENERAL';
}

function computeRelevanceScore(keyword, content) {
    const title = String(content.title || '').toLowerCase();
    const kw = keyword.toLowerCase();
    
    let score = 50;
    if (title.includes(kw)) score += 20;
    if (content.organization && kw.includes(content.organization.toLowerCase())) score += 15;
    if (content.category && kw.includes(content.category.toLowerCase())) score += 10;
    
    return Math.min(100, score);
}

function truncate(str, max) {
    if (!str || str.length <= max) return str || '';
    return str.substring(0, max - 3) + '...';
}

module.exports = {
    generatePlatformPackage,
    generateYouTube,
    generateInstagram,
    generateFacebook,
    generateTelegram,
    generateSEO,
    generateHashtags,
    generateRelevantTags,
    computeRelevanceScore,
    truncate
};
