'use strict';

const FAST_TRACK_DISCOVERY_SOURCES = [
    { name: 'FreeJobAlert', url: 'https://www.freejobalert.com/feed/' },
    { name: 'SarkariExam', url: 'https://www.sarkariexam.com/feed' },
    { name: 'SarkariExamFeedburner', url: 'https://feeds.feedburner.com/SarkariExam' },
];

function normalizeFeedUrl(value) {
    try {
        const url = new URL(String(value || '').trim());
        url.hash = '';
        url.searchParams.sort();
        return url.toString().replace(/\/$/, '').toLowerCase();
    } catch {
        return '';
    }
}

function buildFastTrackSources(additionalSources = []) {
    const sources = [...FAST_TRACK_DISCOVERY_SOURCES, ...additionalSources];
    const unique = new Map();
    for (const source of sources) {
        if (!source || !source.url) continue;
        const key = normalizeFeedUrl(source.url);
        if (!key || unique.has(key)) continue;
        unique.set(key, {
            name: String(source.name || source.source || new URL(source.url).hostname),
            url: String(source.url),
        });
    }
    return [...unique.values()];
}

const OFFICIAL_HOSTS = new Set([
    'ibps.in',
    'iocl.com',
    'rbi.org.in',
    'nta.ac.in',
    'cbse.gov.in',
    'ssc.gov.in',
    'upsc.gov.in',
]);

function isOfficialSourceUrl(value) {
    try {
        const url = new URL(String(value || '').trim());
        if (url.protocol !== 'https:') return false;
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        if (OFFICIAL_HOSTS.has(host)) return true;
        return ['.gov.in', '.nic.in', '.ac.in', '.edu.in'].some((suffix) => host.endsWith(suffix));
    } catch {
        return false;
    }
}

function chooseEditorialAngle(title, category) {
    const angleByCategory = {
        Result: [
            'help candidates find the result and understand what to verify next',
            'explain the result-checking process and the details candidates should keep ready',
            'focus on reading the result notice carefully and verifying the next official step',
        ],
        'Admit Card': [
            'focus on downloading and checking the admit-card details before the exam',
            'help candidates verify their hall-ticket information and official instructions',
            'explain what to check on the admit card without inventing exam-day rules',
        ],
        'Answer Key': [
            'explain how to compare responses and verify the official objection instructions',
            'focus on checking the answer key, response sheet, and notice-backed next steps',
            'help candidates understand which answer-key details to verify on the official portal',
        ],
        Syllabus: [
            'show candidates how to use the published syllabus without adding unlisted topics',
            'organize the announced syllabus details into a practical, source-grounded guide',
            'focus on the stated exam sections and how candidates can verify the official PDF',
        ],
    };
    const choices = angleByCategory[category] || [
        'explain the specific update and the useful action candidates can verify from the source',
        'organize only the confirmed details and point out what remains to be checked officially',
        'help candidates understand this update without repeating generic recruitment boilerplate',
    ];
    const seed = `${String(title || '')}|${String(category || '')}`;
    let hash = 0;
    for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return choices[hash % choices.length];
}

module.exports = {
    FAST_TRACK_DISCOVERY_SOURCES,
    buildFastTrackSources,
    isOfficialSourceUrl,
    chooseEditorialAngle,
};
