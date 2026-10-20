'use strict';

/* =====================================================================
   📡 blog_trend_scout.js — Self Trend-Search Agent (blogs ke liye)
   =====================================================================
   USER: "jo trending hai khud search kare 2-3 topics, unpe best quality
   blog banaye — jaldi discover ho. Din me 2 only but best."

   Kaise kaam karta hai (100% FREE, koi API key nahi):
   1) Google Trends India daily RSS → aaj kya search ho raha hai + kitna
      volume ("100K+ searches") — REAL demand signal.
   2) Google News RSS (niche queries: sarkari naukri, SSC, admit card...)
      → fresh news + source URLs (blog grounding ke liye).
   3) Niche filter (study/jobs/current-affairs) + scoring + shield
      (site pe already maujood topics dobara nahi).
   4) Top 3 picks → system_configs/blog_trend_queue (auto_blog v4 wahi se
      uthata hai) + content_opportunities me record (admin visibility).

   trending_radar.js se farak: radar GSC-gap + feed-urgency dekhta hai
   (peeche ka data); scout LIVE search trends dekhta hai (aaj ki demand).
   Dono saath chalte hain — auto_blog pehle scout queue, phir radar queue,
   aakhir me random pool uthata hai.
   ===================================================================== */

const admin = (() => {
    try {
        return require('firebase-admin');
    } catch {
        return null; // pure-helper tests bina deps ke chal sakte hain
    }
})();

function getDb() {
    if (!admin) throw new Error('firebase-admin missing — npm ci chalao');
    if (!admin.apps.length) {
        const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
        if (serviceAccountVar) {
            admin.initializeApp({
                credential: admin.credential.cert(JSON.parse(serviceAccountVar)),
                projectId: 'studymaterial-406ad'
            });
        } else {
            admin.initializeApp();
        }
    }
    return admin.firestore();
}

// ------------------------------------------------------------------
// PURE HELPERS (unit-testable)
// ------------------------------------------------------------------

// Niche keywords with weights — hamari site: study/jobs/current-affairs
const NICHE_KEYWORDS = [
    // Exams (high)
    ['ssc', 12], ['upsc', 12], ['ibps', 12], ['railway', 12], ['rrb', 12],
    ['ntpc', 12], ['group d', 12], ['ctet', 12], ['neet', 10], ['jee', 10],
    ['up police', 12], ['police bharti', 12], ['agniveer', 12], ['nda', 10],
    ['cds', 10], ['gate', 10], ['cat', 8], ['clat', 8], ['cuet', 10],
    // Jobs (high)
    ['sarkari naukri', 14], ['sarkari result', 14], ['govt job', 12],
    ['recruitment', 12], ['bharti', 12], ['vacancy', 12], ['vacancies', 12],
    ['notification', 10], ['apply online', 10], ['rojgar', 10],
    // Timely update types (high)
    ['admit card', 14], ['hall ticket', 12], ['result', 10], ['parinaam', 10],
    ['answer key', 12], ['cut off', 12], ['cutoff', 12], ['merit list', 10],
    ['exam date', 12], ['exam city', 10], ['syllabus', 10], ['exam pattern', 10],
    ['question paper', 10], ['previous year', 8], ['mock test', 8],
    // Study/current-affairs (medium)
    ['current affairs', 12], ['current affair', 12], ['gk', 8], ['general knowledge', 10],
    ['scholarship', 10], ['admission', 8], ['board exam', 10], ['cbse', 10],
    ['up board', 10], ['bihar board', 10], ['scholarship', 10], ['yojana', 8],
    ['scheme', 6], ['free coaching', 10], ['study material', 8], ['preparation', 8],
    ['exam preparation', 10], ['time table', 6], ['date sheet', 8],
    // Career guidance (medium-low)
    ['career', 6], ['after 12th', 8], ['after graduation', 8], ['salary', 6],
    ['eligibility', 8], ['qualification', 6], ['age limit', 6], ['selection process', 6],
];

// Bilkul banned — hamari niche se bahar (sports/entertainment/politics gossip)
const BLOCK_KEYWORDS = [
    'cricket', 'ipl', 'football', 'fifa', 'wrestling', 'olympics', 'match score',
    'movie', 'film release', 'box office', 'bollywood', 'bigg boss', 'web series',
    'song release', 'concert', 'stock market', 'sensex', 'nifty', 'share price',
    'bitcoin', 'crypto', 'gold price', 'silver price', 'petrol price', 'diesel price',
    'weather', 'mausam', 'earthquake', 'accident', 'murder', 'crime news',
    'election result', 'exit poll', 'vote counting', 'lok sabha election',
];

const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'by',
    'ka', 'ki', 'ke', 'me', 'mein', 'se', 'ko', 'par', 'aur', 'hai', 'hain',
    'kya', 'kab', 'kaise', 'kahan', 'new', 'latest', 'live', 'check', 'here',
]);

function normalizeTopic(t) {
    return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Niche relevance 0-100. Blocked topic → -1 (kabhi pick nahi). */
function nicheScore(title) {
    const t = normalizeTopic(title);
    if (!t || t.length < 6) return 0;
    if (BLOCK_KEYWORDS.some((kw) => t.includes(kw))) return -1;
    let score = 0;
    for (const [kw, w] of NICHE_KEYWORDS) {
        if (t.includes(kw)) score += w;
    }
    return Math.min(100, score);
}

/** "100K+" / "2M+" / "5000+" → numeric (scoring ke liye) */
function trafficValue(traffic) {
    const m = String(traffic || '').replace(/,/g, '').match(/([\d.]+)\s*([KMB])?\+?/i);
    if (!m) return 0;
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
    return Math.round(parseFloat(m[1]) * mult);
}

function trafficScore(traffic) {
    const v = trafficValue(traffic);
    if (v >= 1e6) return 40;
    if (v >= 2e5) return 32;
    if (v >= 5e4) return 24;
    if (v >= 2e4) return 16;
    if (v >= 5e3) return 8;
    if (v > 0) return 3;
    return 0;
}

function decodeXmlEntities(s) {
    return String(s || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
        .trim();
}

/**
 * Google Trends daily RSS parse.
 * @returns {Array<{title, traffic, trafficRaw, pubDate, news: Array<{title,url,source}>}>}
 */
function parseTrendsRss(xml) {
    const out = [];
    const items = String(xml || '').match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    for (const item of items) {
        const title = decodeXmlEntities((item.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
        if (!title || title.length < 3) continue;
        const trafficRaw = decodeXmlEntities((item.match(/<ht:approx_traffic[^>]*>([\s\S]*?)<\/ht:approx_traffic>/i) || [])[1] || '');
        const pubDate = decodeXmlEntities((item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || '');
        const news = [];
        const newsBlocks = item.match(/<ht:news_item[\s>][\s\S]*?<\/ht:news_item>/gi) || [];
        for (const nb of newsBlocks.slice(0, 5)) {
            const nTitle = decodeXmlEntities((nb.match(/<ht:news_item_title[^>]*>([\s\S]*?)<\/ht:news_item_title>/i) || [])[1] || '');
            const nUrl = decodeXmlEntities((nb.match(/<ht:news_item_url[^>]*>([\s\S]*?)<\/ht:news_item_url>/i) || [])[1] || '');
            const nSource = decodeXmlEntities((nb.match(/<ht:news_item_source[^>]*>([\s\S]*?)<\/ht:news_item_source>/i) || [])[1] || '');
            if (nTitle && nUrl) news.push({ title: nTitle, url: nUrl, source: nSource });
        }
        out.push({ title, traffic: trafficValue(trafficRaw), trafficRaw, pubDate, news });
    }
    return out;
}

/**
 * Google News RSS parse.
 * @returns {Array<{title, link, pubDate, source}>}
 */
function parseNewsRss(xml) {
    const out = [];
    const items = String(xml || '').match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    for (const item of items) {
        let title = decodeXmlEntities((item.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
        if (!title || title.length < 8) continue;
        title = title.replace(/\s+-\s+[^-]{2,60}$/, '').trim(); // "Headline - Source" → headline
        const link = decodeXmlEntities((item.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '');
        const pubDate = decodeXmlEntities((item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || '');
        const source = decodeXmlEntities((item.match(/<source[^>]*>([\s\S]*?)<\/source>/i) || [])[1] || '');
        if (!link) continue;
        out.push({ title, link, pubDate, source });
    }
    return out;
}

function significantTokens(title) {
    return normalizeTopic(title)
        .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

/** Do titles same story hain? (2+ significant tokens overlap) */
function sameStory(a, b) {
    const ta = significantTokens(a);
    const tb = new Set(significantTokens(b));
    if (!ta.length || !tb.size) return false;
    return ta.filter((w) => tb.has(w)).length >= 2;
}

/** Niche category map (auto_blog MASTER_POOL keys se match) */
function mapCategory(title) {
    const t = normalizeTopic(title);
    if (/(recruit|vacanc|bharti|sarkari naukri|rojgar|notification|apply online|teacher vacancy)/.test(t)) return 'Job_Alerts';
    if (/(syllabus|exam pattern|cut ?off|previous year|question paper|mock test)/.test(t)) return 'Syllabus_Guide';
    if (/(strategy|tips|how to (prepare|crack|study)|time management|revision)/.test(t)) return 'Exam_Strategies';
    if (/(career|after 12th|after graduation|salary|scope)/.test(t)) return 'Career_Guidance';
    if (/(motivat|success story|stress|habits)/.test(t)) return 'Student_Life_Motivation';
    if (/(history|polity|geography|economy|concepts|explained)/.test(t)) return 'Academic_Deep_Dive';
    return 'Trending_Education_News'; // admit/result/news/current-affairs default
}

function freshnessScore(pubDate, now) {
    const ms = Date.parse(pubDate);
    if (Number.isNaN(ms)) return 0;
    const hours = (now - ms) / 3600000;
    if (hours < 0 || hours > 96) return 0;
    if (hours <= 24) return 10;
    if (hours <= 48) return 6;
    return 3;
}

/**
 * Trend + news items ko story-clusters me jodo, score karo, top picks nikalo.
 * @returns {Array<{topic, angle, category, keywords, sources, trendEvidence, score}>}
 */
function buildScoutPicks({ trendItems = [], newsItems = [], shieldTitles = [], alreadyQueued = [], now = Date.now(), maxPicks = 3 }) {
    const shields = [...(shieldTitles || []), ...(alreadyQueued || [])].map(normalizeTopic).filter(Boolean);
    const blocked = (topic) => shields.some((s) => {
        if (!s) return false;
        const k = normalizeTopic(topic);
        return k.includes(s) || s.includes(k) || sameStory(k, s);
    });

    // 1) News items ko story clusters me group karo
    const clusters = [];
    for (const item of newsItems) {
        const ns = nicheScore(item.title);
        if (ns < 0) continue; // blocked niche
        let placed = false;
        for (const c of clusters) {
            if (sameStory(c.rep.title, item.title)) {
                c.items.push({ ...item, niche: ns });
                placed = true;
                break;
            }
        }
        if (!placed) clusters.push({ rep: item, items: [{ ...item, niche: ns }] });
    }

    // 2) Har cluster score karo (+ Trends corroboration bonus)
    const scored = [];
    for (const c of clusters) {
        const best = [...c.items].sort((a, b) => (b.niche - a.niche) || (b.title.length - a.title.length))[0];
        const topic = best.title;
        if (nicheScore(topic) < 8) continue;
        if (blocked(topic)) continue;
        const distinctSources = new Map();
        for (const it of c.items) {
            const key = (it.source || it.link).toLowerCase();
            if (!distinctSources.has(key) && distinctSources.size < 4) {
                distinctSources.set(key, { title: it.title, url: it.link, source: it.source || 'News', publishedAt: it.pubDate || '' });
            }
        }
        // Google Trends me bhi hai? → strong demand proof
        let trendHit = null;
        for (const tr of trendItems) {
            if (sameStory(tr.title, topic) || normalizeTopic(topic).includes(normalizeTopic(tr.title)) || normalizeTopic(tr.title).includes(normalizeTopic(topic))) {
                if (!trendHit || tr.traffic > trendHit.traffic) trendHit = tr;
            }
        }
        const corroboration = Math.min(24, (distinctSources.size - 1) * 8);
        const fresh = Math.max(...c.items.map((it) => freshnessScore(it.pubDate, now)));
        const niche = Math.min(20, Math.round(nicheScore(topic) * 0.2));
        const trend = trendHit ? trafficScore(trendHit.trafficRaw) : 0;
        const score = corroboration + fresh + niche + trend;

        const keywords = [...new Set(significantTokens(topic))].slice(0, 8);
        const trendEvidence = trendHit
            ? `Google Trends India: ${trendHit.trafficRaw || 'trending'} searches`
            : `${distinctSources.size} news sources (last 72h)`;
        scored.push({
            topic,
            angle: suggestAngle(topic),
            category: mapCategory(topic),
            keywords,
            sources: [...distinctSources.values()],
            trendEvidence,
            score,
        });
    }

    // 3) Standalone Trends (news me na mile par niche + high volume)
    for (const tr of trendItems) {
        const ns = nicheScore(tr.title);
        if (ns < 14) continue; // standalone ke liye strong niche match zaroori
        if (blocked(tr.title)) continue;
        if (scored.some((p) => sameStory(p.topic, tr.title))) continue;
        const sources = (tr.news || []).slice(0, 4).map((n) => ({
            title: n.title, url: n.url, source: n.source || 'News', publishedAt: tr.pubDate || '',
        }));
        scored.push({
            topic: tr.title,
            angle: suggestAngle(tr.title),
            category: mapCategory(tr.title),
            keywords: [...new Set(significantTokens(tr.title))].slice(0, 8),
            sources,
            trendEvidence: `Google Trends India: ${tr.trafficRaw || 'trending'} searches`,
            score: trafficScore(tr.trafficRaw) + Math.min(20, Math.round(ns * 0.2)) + freshnessScore(tr.pubDate, now),
        });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, maxPicks);
}

/** Topic se blog angle (template-based, no AI — free) */
function suggestAngle(topic) {
    const t = normalizeTopic(topic);
    if (/(admit card|hall ticket)/.test(t)) return 'Kaise download karein + exam-day guide (step-by-step)';
    if (/(result|parinaam|merit list)/.test(t)) return 'Kaise check karein + cut-off analysis + aage kya';
    if (/(answer key|cut ?off)/.test(t)) return 'Objection process + expected cut-off analysis';
    if (/(recruit|vacanc|bharti|notification)/.test(t)) return 'Eligibility, dates, fees, selection — complete guide';
    if (/(syllabus|exam pattern)/.test(t)) return 'Topic-wise breakdown + weightage + strategy';
    if (/(question paper|previous year)/.test(t)) return 'Analysis + important topics + practice plan';
    if (/(current affairs)/.test(t)) return 'Exam-oriented explainer with key facts';
    if (/(admission|scholarship)/.test(t)) return 'Eligibility + dates + kaise apply karein';
    if (/(salary|career|after 12th|after graduation)/.test(t)) return 'Scope, salary, growth — honest comparison';
    if (/(board|date sheet|time table)/.test(t)) return 'Dates + preparation plan + important topics';
    return 'Complete explainer: kya hai, kiska fayda, aage kya karein';
}

// Niche news queries (Google News RSS — free, no key). Mix EN+HI.
const NEWS_QUERIES = [
    'sarkari naukri recruitment',
    'SSC exam admit card result',
    'railway recruitment vacancy',
    'UPSC exam notification',
    'board result date sheet',
    'current affairs exam',
    'teacher vacancy recruitment',
    'police bharti vacancy',
];

async function fetchText(fetchImpl, url, timeoutMs = 12000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudyGyaanTrendScout/1.0)' },
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

async function runBlogTrendScout({ db = getDb(), logger = console.log, fetchImpl = fetch, now = Date.now() } = {}) {
    const summary = { trendItems: 0, newsItems: 0, picks: 0, queued: 0, errors: [] };
    logger('📡 Blog Trend Scout starting...');

    // ---- 1) Google Trends India daily ----
    let trendItems = [];
    try {
        const xml = await fetchText(fetchImpl, 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=IN');
        trendItems = parseTrendsRss(xml);
        summary.trendItems = trendItems.length;
        logger(`📈 Google Trends IN: ${trendItems.length} topics`);
    } catch (e) {
        summary.errors.push('trends: ' + e.message);
        logger('⚠️ Trends RSS fail: ' + e.message);
    }

    // ---- 2) Google News niche queries ----
    let newsItems = [];
    for (const q of NEWS_QUERIES) {
        try {
            const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}%20when%3A3d&hl=hi&gl=IN&ceid=IN%3Ahi`;
            const xml = await fetchText(fetchImpl, url);
            const items = parseNewsRss(xml);
            newsItems.push(...items);
            logger(`📰 "${q}": ${items.length} news`);
        } catch (e) {
            summary.errors.push(`news "${q}": ${e.message}`);
        }
    }
    summary.newsItems = newsItems.length;

    // ---- 3) Shield: site pe already kya hai ----
    let shieldTitles = [];
    try {
        const [b, j, f] = await Promise.all([
            db.collection('blogs').orderBy('date', 'desc').limit(100).get().catch(() => null),
            db.collection('jobs').orderBy('createdAt', 'desc').limit(100).get().catch(() => null),
            db.collection('fast_track').orderBy('createdAt', 'desc').limit(100).get().catch(() => null),
        ]);
        if (b) b.forEach((d) => shieldTitles.push(d.data().title || ''));
        if (j) j.forEach((d) => shieldTitles.push(d.data().title || ''));
        if (f) f.forEach((d) => shieldTitles.push(d.data().title || ''));
    } catch (e) {
        summary.errors.push('shield: ' + e.message);
    }

    // ---- 4) Queue + pichhle 7 din ke picks (repeat roko) ----
    let alreadyQueued = [];
    let oldQueue = [];
    const queueRef = db.collection('system_configs').doc('blog_trend_queue');
    try {
        const existing = await queueRef.get();
        if (existing.exists && Array.isArray(existing.data().queue)) {
            oldQueue = existing.data().queue;
            oldQueue.forEach((q) => alreadyQueued.push(q.topic || ''));
        }
        const prev = await db.collection('content_opportunities')
            .where('source', '==', 'blog_trend_scout')
            .where('createdAt', '>', now - 7 * 86400000).limit(50).get();
        prev.forEach((d) => alreadyQueued.push(d.data().topic || ''));
    } catch { /* first run */ }

    // ---- 5) Score + top 3 ----
    const picks = buildScoutPicks({ trendItems, newsItems, shieldTitles, alreadyQueued, now, maxPicks: 3 });
    summary.picks = picks.length;
    logger(`🎯 Scout picks: ${picks.length}`);

    for (const p of picks) {
        logger(`   • [${p.category}] ${p.topic} (score ${p.score} | ${p.trendEvidence})`);
        try {
            await db.collection('content_opportunities').add({
                topic: p.topic,
                normalizedTopic: normalizeTopic(p.topic),
                opportunityScore: p.score,
                kind: 'blog',
                source: 'blog_trend_scout',
                category: p.category,
                angle: p.angle,
                keywords: p.keywords,
                trendEvidence: p.trendEvidence,
                sourceCount: (p.sources || []).length,
                createdAt: now,
            });
        } catch (e) {
            summary.errors.push('store: ' + e.message);
        }
    }

    // ---- 6) Queue (max 4 — 2/day × 2 din buffer) ----
    try {
        const queue = [...oldQueue, ...picks.map((p) => ({ ...p, pickedAt: now }))].slice(0, 4);
        summary.queued = picks.length;
        await queueRef.set({
            lastRun: now,
            status: 'completed',
            lastPicks: picks.map((p) => `[${p.category}] ${p.topic}`),
            lastCounts: { trends: summary.trendItems, news: summary.newsItems, picks: picks.length },
            queue,
            errors: summary.errors.slice(0, 5),
        }, { merge: true });
    } catch (e) {
        summary.errors.push('status: ' + e.message);
    }

    logger(`📡 Scout done — picks:${summary.picks} queued:${summary.queued} errors:${summary.errors.length}`);
    return summary;
}

module.exports = {
    NICHE_KEYWORDS,
    BLOCK_KEYWORDS,
    NEWS_QUERIES,
    normalizeTopic,
    nicheScore,
    trafficValue,
    trafficScore,
    decodeXmlEntities,
    parseTrendsRss,
    parseNewsRss,
    significantTokens,
    sameStory,
    mapCategory,
    freshnessScore,
    suggestAngle,
    buildScoutPicks,
    runBlogTrendScout,
};

if (require.main === module) {
    runBlogTrendScout()
        .then(() => process.exit(0))
        .catch((e) => { console.error('❌ Scout fatal:', e.message); process.exit(1); });
}
