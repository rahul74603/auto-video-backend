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
    // Institution / exam portals that are official but do not use .gov.in.
    'uiic.co.in',
    'ibpsreg.ibps.in',
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

/**
 * Resolve a direct official HTTPS URL from a publisher redirect only when the
 * decoded destination passes the same institution-host allowlist. Never fetch
 * an arbitrary URL just because it appeared in a redirect parameter.
 */
function resolveOfficialSourceUrl(value) {
    let candidate = String(value || '').trim();
    const redirectKeys = ['url', 'target', 'destination', 'dest', 'redirect', 'redirect_url', 'u', 'link'];

    for (let depth = 0; depth < 4 && candidate; depth += 1) {
        let parsed;
        try {
            parsed = new URL(candidate);
        } catch {
            return '';
        }
        if (isOfficialSourceUrl(parsed.toString())) return parsed.toString();
        if (parsed.protocol !== 'https:') return '';

        let next = '';
        for (const key of redirectKeys) {
            const value = parsed.searchParams.get(key);
            if (!value) continue;
            try {
                next = decodeURIComponent(value);
            } catch {
                next = value;
            }
            if (next && next !== candidate) break;
        }
        if (!next || next === candidate) return '';
        candidate = next;
    }
    return '';
}

function extractOfficialSourceCandidates(text) {
    const candidates = [];
    const seen = new Set();
    const pattern = /(?:URL:\s*|href=["'])(https?:\/\/[^\s)"'<>]+)/gi;
    for (const match of String(text || '').matchAll(pattern)) {
        const url = resolveOfficialSourceUrl(match[1].replace(/&amp;/g, '&'));
        if (!url || seen.has(url)) continue;
        seen.add(url);
        candidates.push(url);
    }
    return candidates;
}

const SOURCE_MATCH_STOP_WORDS = new Set([
    'the', 'and', 'for', 'from', 'with', 'under', 'notice', 'notification', 'recruitment',
    'vacancy', 'vacancies', 'result', 'admit', 'card', 'answer', 'key', 'syllabus', 'update',
    'application', 'apply', 'online', 'official', '2024', '2025', '2026', '2027',
]);

function sourceTerms(value) {
    return new Set(String(value || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((term) =>
        term.length >= 3 && !SOURCE_MATCH_STOP_WORDS.has(term) && !/^20\d{2}$/.test(term)
    ) || []);
}

/** Conservative identity check: official hosts alone do not prove the source
 * belongs to the discovered notice. Require distinctive title and, when known,
 * organization evidence before using extracted text as a verified source. */
function isOfficialSourceRelevant({ sourceText, title, organization } = {}) {
    const source = String(sourceText || '').toLowerCase();
    const sourceTokenSet = sourceTerms(source);
    const titleTerms = sourceTerms(title);
    const organizationTerms = sourceTerms(organization);
    if (!source || titleTerms.size === 0) return false;

    const titleHits = [...titleTerms].filter((term) => sourceTokenSet.has(term)).length;
    const organizationHits = [...organizationTerms].filter((term) => sourceTokenSet.has(term)).length;
    const organizationAcronyms = String(organization || '').match(/\b[A-Z]{2,}\b/g) || [];
    const acronymMatch = organizationAcronyms.some((acronym) =>
        new RegExp(`\\b${acronym.toLowerCase()}\\b`).test(source)
    );
    const organizationMatch = organizationTerms.size === 0
        || organizationHits >= Math.min(2, organizationTerms.size)
        || acronymMatch;

    if (!organizationMatch) return false;
    return titleHits >= Math.min(2, titleTerms.size);
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
    resolveOfficialSourceUrl,
    extractOfficialSourceCandidates,
    isOfficialSourceRelevant,
    chooseEditorialAngle,
};
