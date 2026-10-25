'use strict';

/* =====================================================================
   🌟 blog_discover.js — Google Discover readiness helpers (PURE — no deps)
   =====================================================================
   Kyun bana: blogs ban to rahe the par Discover/search me kahin dikh nahi
   rahe the. Audit me content-side killers mile:
     1) Clickbait emoji titles ("🔥 Breaking:", "🏆 Top Secrets:") —
        Discover aise titles ko demote karta hai.
     2) Random evergreen pool topics — fresh/trending nahi.
     3) Generic AI images + fabrication-prone prompts (flash-lite).
   Ye module titles ko Discover-safe banata hai + readiness score deta hai.
   auto_blog.js (v4) ise use karta hai. 100% pure → unit-testable.
   ===================================================================== */

// Discover demote karta hai: sensational/clickbait openers (EN + Hinglish)
const CLICKBAIT_OPENERS = [
    'breaking', 'breaking news', 'latest update', 'just in', 'exclusive',
    'shocking', 'shocker', 'top secrets', 'secret', 'secrets revealed',
    'you won\'t believe', 'jaw dropping', 'jaw-dropping', 'viral',
    'big alert', 'big breaking', 'taza khabar', 'badi khabar', 'धमाका',
];
// Body me bhi ye patterns clickbait/misleading lagte hain
const CLICKBAIT_BODY_PATTERNS = [
    /you won.?t believe/i, /shocking truth/i, /secret (trick|method|formula)/i,
    /100% (guarantee|selection|success|pass)/i, /guaranteed selection/i,
    /overnight success/i, /get rich quick/i,
];

// Emoji + symbols jo title me kabhi nahi (Discover + SERP dono me kharab)
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}]/gu;

/**
 * AI title ko Discover-safe banao: emoji hatao, clickbait prefix hatao,
 * spaces fix karo, word-boundary par maxLen tak kaato.
 * @returns {string} clean title (kabhi empty nahi — fallback topic)
 */
function cleanDiscoverTitle(raw, topic = '', maxLen = 70) {
    let t = String(raw || '').replace(EMOJI_RE, ' ').replace(/\s+/g, ' ').trim();
    // Leading clickbait opener + separator ("Breaking:", "Exclusive -", "Top Secrets |") hatao
    for (let i = 0; i < 3; i++) {
        const m = t.match(/^([^:|\-–—]{2,40})[:|\-–—]\s*(.+)$/);
        if (!m) break;
        const head = m[1].trim().toLowerCase();
        if (CLICKBAIT_OPENERS.some((op) => head === op || head.startsWith(op + ' '))) {
            t = m[2].trim();
        } else {
            break;
        }
    }
    // "Title (October 2026)" jaisa trailing date-suffix hatao (dates meta me hain)
    t = t.replace(/\s*\((january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(\s+20\d{2})?\)\s*$/i, '').trim();
    t = t.replace(/\s*\|\s*studygyaan\s*$/i, '').trim();
    if (!t && topic) t = String(topic).replace(EMOJI_RE, ' ').replace(/\s+/g, ' ').trim();
    if (t.length > maxLen) {
        const cut = t.lastIndexOf(' ', maxLen);
        t = (cut > maxLen * 0.55 ? t.slice(0, cut) : t.slice(0, maxLen)).trim();
    }
    return t;
}

/** Title ab bhi clickbait hai? (gate + logging ke liye) */
function isClickbaitTitle(title) {
    const t = String(title || '');
    if (EMOJI_RE.test(t)) return true;
    EMOJI_RE.lastIndex = 0;
    const head = (t.split(/[:|\-–—]/)[0] || '').trim().toLowerCase();
    if (head && CLICKBAIT_OPENERS.some((op) => head === op || head.startsWith(op + ' '))) return true;
    return CLICKBAIT_BODY_PATTERNS.some((re) => re.test(t));
}

/** HTML tags/script/style hatakar asli text words gino (quality gate ke liye) */
function stripWords(html) {
    const text = String(html || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return 0;
    return text.split(' ').filter(Boolean).length;
}

function countTag(html, tag) {
    const m = String(html || '').match(new RegExp(`<${tag}[\\s>]`, 'gi'));
    return m ? m.length : 0;
}

/** FAQ section maujood? (schema detection h3+? pattern se match) */
function hasFaqSection(html, minQuestions = 4) {
    const matches = String(html || '').match(/<h3[^>]*>([^<]*\?[^<]*)<\/h3>/gi);
    return (matches ? matches.length : 0) >= minQuestions;
}

/** Sources/स्रोत section maujood? (trend-grounded blogs ke liye zaroori) */
function hasSourcesSection(html) {
    return /<h2[^>]*>([^<]*(स्रोत|sources?|आधिकारिक\s*(लिंक|स्रोत|वेबसाइट))[^<]*)<\/h2>/i.test(String(html || ''));
}

/** Devanagari → Roman (Hinglish-style) — Hindi titles se readable SEO slugs.
 *  Pehle: "उत्तराखंड पुलिस भर्ती 2026..." → "2026-1600-cm" (kachra!) ya fallback.
 *  Ab:   → "uttarakhand-pulis-bharti-2026-..." (readable + keywords!) */
const DEVANAGARI_PRE = [
    // Conjuncts/nukta-forms jinka compositional result galat aata hai (string match, pehle)
    ['ज्ञ', 'gy'], ['क़', 'q'], ['ख़', 'kh'], ['ग़', 'gh'], ['ज़', 'z'], ['फ़', 'f'],
    ['ड़', 'ड'], ['ढ़', 'ढ'], // precomposed nukta → plain (nukta drop)
];
const DEVANAGARI_MAP = {
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u',
    'ऋ': 'ri', 'ॠ': 'ri', 'ऌ': 'lri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
    'ऍ': 'e', 'ऑ': 'o', 'ऑ': 'o', 'ॐ': 'om',
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
    'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
    'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri', 'ॄ': 'ri',
    'ॅ': 'e', 'े': 'e', 'ै': 'ai', 'ॉ': 'o', 'ो': 'o', 'ौ': 'au',
    'ं': 'n', 'ँ': 'n', 'ः': 'h',
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
    '।': ' ', '॥': ' ', '्': '', '़': '', '‌': '', '‍': '',
};
const DEVANAGARI_CONSONANTS = new Set(
    'कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह'.split('')
);
// Inherent-'a' (schwa): vyanjan ke baad halant/matra/nukta/chandrabindu NA ho,
// aur agla akshar Devanagari vyanjan ho → 'a' jodo. Shabd-ant me mat jodo
// (schwa-deletion: कमल→kamal, पुलिस→pulis, par पद→pad, पर→par).
function transliterateDevanagari(text) {
    let s = String(text || '');
    for (const [dev, rom] of DEVANAGARI_PRE) s = s.split(dev).join(rom);
    const chars = [...s];
    let out = '';
    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (!DEVANAGARI_CONSONANTS.has(ch)) {
            out += (ch in DEVANAGARI_MAP) ? DEVANAGARI_MAP[ch]
                : (/[\u0900-\u097F]/.test(ch) ? '' : ch); // unknown marks drop, Latin as-is
            continue;
        }
        out += DEVANAGARI_MAP[ch];
        const next = chars[i + 1];
        // Inherent 'a': agla akshar vyanjan ho YA anusvara-type mark (ंँः) ho —
        // ye inherent vowel ko maarte NAHI (खं→khan). Halant/matra/nukta maarte
        // hain → bare. Shabd-ant (space/end) pe bhi bare (schwa-deletion).
        if (next && (DEVANAGARI_CONSONANTS.has(next) || next === 'ं' || next === 'ँ' || next === 'ः')) out += 'a';
    }
    return out;
}

/** Clean keyword slug (ugly timestamp-hash nahi; Hindi titles transliterate hote hain) */
function buildKeywordSlug(title, maxLen = 70) {
    const slug = transliterateDevanagari(title)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!slug) return 'studygyaan-blog';
    if (slug.length <= maxLen) return slug;
    // Word-boundary cut (beech-shabd me katne se "masterpla" jaisa kachra nahi)
    const cut = slug.substring(0, maxLen);
    const dash = cut.lastIndexOf('-');
    return ((dash > 20 ? cut.substring(0, dash) : cut).replace(/-+$/, '')) || 'studygyaan-blog';
}

/**
 * Discover readiness score 0-100 + issues list.
 * Gate: score >= 60 aur issues me koi 'fail' nahi → publish-ready.
 */
function scoreDiscoverReadiness({ title, html, imageUrl, excerpt, isTrend = false }) {
    const issues = [];
    let score = 0;

    // Title (25)
    const t = String(title || '');
    if (!t) {
        issues.push({ level: 'fail', msg: 'title missing' });
    } else {
        if (isClickbaitTitle(t)) {
            issues.push({ level: 'fail', msg: 'clickbait/emoji title — Discover demote karega' });
        } else {
            score += 12;
            if (t.length >= 40 && t.length <= 75) score += 8;
            else issues.push({ level: 'warn', msg: `title length ${t.length} (ideal 40-75)` });
            if (/20\d{2}/.test(t)) score += 5; // timely signal (sirf trend blogs me)
            else if (isTrend) issues.push({ level: 'warn', msg: 'trend blog title me year nahi' });
            else score += 5;
        }
    }

    // Content depth (35)
    const words = stripWords(html);
    if (words < 1200) {
        issues.push({ level: words < 700 ? 'fail' : 'warn', msg: `sirf ${words} words (min 1200)` });
    } else {
        score += 15;
        if (words >= 1800) score += 5;
    }
    const h2 = countTag(html, 'h2');
    if (h2 < 5) issues.push({ level: 'warn', msg: `sirf ${h2} H2 (min 5)` });
    else score += 5;
    const tables = countTag(html, 'table');
    if (tables >= 1) score += 5;
    else issues.push({ level: 'warn', msg: 'koi data table nahi' });
    if (hasFaqSection(html)) score += 5;
    else issues.push({ level: 'warn', msg: 'FAQ section missing (min 4 Q&A)' });

    // Trust (25)
    if (isTrend) {
        if (hasSourcesSection(html)) score += 15;
        else issues.push({ level: 'fail', msg: 'trend blog me Sources/स्रोत section missing' });
    } else {
        score += 15;
    }
    if (CLICKBAIT_BODY_PATTERNS.some((re) => re.test(String(html || '')))) {
        issues.push({ level: 'fail', msg: 'body me misleading/clickbait claims' });
    } else {
        score += 10;
    }

    // Presentation (15)
    if (imageUrl && /^https:\/\//i.test(imageUrl)) score += 10;
    else issues.push({ level: 'fail', msg: 'hero image missing' });
    const ex = String(excerpt || '');
    if (ex.length >= 80 && ex.length <= 200) score += 5;
    else issues.push({ level: 'warn', msg: 'excerpt 80-200 chars hona chahiye' });

    score = Math.max(0, Math.min(100, score));
    return { score, issues, words, ready: score >= 60 && !issues.some((i) => i.level === 'fail') };
}

module.exports = {
    CLICKBAIT_OPENERS,
    CLICKBAIT_BODY_PATTERNS,
    cleanDiscoverTitle,
    isClickbaitTitle,
    stripWords,
    countTag,
    hasFaqSection,
    hasSourcesSection,
    buildKeywordSlug,
    transliterateDevanagari,
    scoreDiscoverReadiness,
};
