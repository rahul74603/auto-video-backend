'use strict';

/* =====================================================================
   📡 trending_radar.js — Niche Trend Miner (roz chalta hai, khud research)
   USER (2026-10-10): "trending khud dhunde, hamari niche ke hisab se,
   khud bana kar bheje — lagatar reach aaye"

   Do signal sources (dono FREE, koi naya API key nahi):
   1) GSC gap mining  — gsc_search_analytics_daily se wo queries jahan
      impressions hain par position kharab (8+) = log dhund rahe hain,
      ham capture nahi kar rahe → blog/mock opportunities.
   2) Official feed radar — source_registry ke feeds me URGENCY wale
      titles (result/admit card/answer key) jo site pe abhi nahi hain →
      fast track opportunities.

   Output:
   - content_opportunities me scored picks (trend_detector/Shorts bhi padhta hai)
   - system_configs/trending_radar.blogQueue → auto_blog agla blog isi se likhta hai
     (demand-driven blog, random roulette ki jagah)
   - system_configs/trending_radar status → admin STATUS tab

   SAFETY: fast track/jobs kabhi self-publish NAHI (draft+approval flow intact).
   Radar sirf blog topic queue karta hai; blog pipeline ka quality+duplicate
   check wahi lagta hai. Never silently fail: status doc hamesha likhta hai.
   ===================================================================== */

const admin = require('firebase-admin');
const { detectUrgency } = require('./agents/growth/opportunity_engine');
const { getEnabledSources, recordSourceCheck } = require('./source_registry');

// Lazy init — tests pure helpers ko bina Firebase ke require kar sakte hain
function getDb() {
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

const FASTTRACK_KW = [
    'result', 'admit card', 'answer key', 'cut off', 'cutoff', 'merit list',
    'score card', 'document verification', 'exam date', 'application status',
    'interview', 'final answer', 'provisional',
];
const MOCK_KW = [
    'previous year', 'question paper', 'mock test', 'practice set', 'syllabus',
    'exam pattern', 'important questions', 'preparation strategy', 'study material',
    'memory based',
];

/** Query/title ko best content-type se map karo. Default = blog. */
function classifyKind(text) {
    const t = String(text || '').toLowerCase();
    if (FASTTRACK_KW.some((kw) => t.includes(kw))) return 'fasttrack';
    if (MOCK_KW.some((kw) => t.includes(kw))) return 'mock';
    return 'blog';
}

function normalizeTopic(t) {
    return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * GSC gap score (0-100): impressions + kharab position + unmet demand.
 * Chhoti site ke scale pe tuned (impressions 10-200 bhi meaningful).
 */
function scoreGap({ impressions, bestPosition, clicks }) {
    const imp = Number(impressions) || 0;
    const pos = Number(bestPosition) || 0;
    const clk = Number(clicks) || 0;
    if (imp < 5 || pos < 8 || pos > 60) return 0;

    const impScore = Math.min(40, Math.round(Math.sqrt(imp) * 4));
    const posScore = Math.min(30, Math.round((pos - 7) * 1.2));
    const unmetScore = clk < imp * 0.03 ? 20 : clk < imp * 0.08 ? 10 : 0;
    return Math.min(100, impScore + posScore + unmetScore);
}

/** RSS/Atom XML se titles nikaalo (basic entities decode). */
function extractRssTitles(xml) {
    const out = [];
    const re = /<title[^>]*>([\s\S]*?)<\/title>/gi;
    let m;
    while ((m = re.exec(xml || '')) !== null) {
        const raw = m[1]
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
            .trim();
        if (raw && raw.length > 8) out.push(raw);
    }
    return out;
}

function simpleOverlap(a, b) {
    const x = normalizeTopic(a);
    const y = normalizeTopic(b);
    if (!x || !y) return false;
    return x.includes(y) || y.includes(x);
}

/**
 * GSC gaps + feed urgency titles ko merge karke scored opportunity list.
 * @param {Array<{query:string, impressions:number, clicks:number, bestPosition:number}>} gscAgg
 * @param {Array<string>} sourceTitles
 * @param {Array<string>} shieldTitles  (site pe already maujood titles)
 * @param {Array<string>} alreadyQueued (pichhle 7 din ke radar topics)
 */
function buildRadarOpportunities({ gscAgg, sourceTitles, shieldTitles, alreadyQueued, maxPicks = 10 }) {
    const map = new Map();
    const put = (topic, score, kind, meta) => {
        const key = normalizeTopic(topic);
        if (!key || key.length < 6) return;
        if (alreadyQueued.some((t) => simpleOverlap(t, key))) return;
        if (shieldTitles.some((t) => simpleOverlap(t, key))) return;
        const prev = map.get(key);
        if (!prev || prev.opportunityScore < score) {
            map.set(key, { topic: key, opportunityScore: score, kind, ...meta });
        }
    };

    // 1) GSC demand gaps
    for (const row of gscAgg || []) {
        const score = scoreGap(row);
        if (score <= 0) continue;
        put(row.query, score, classifyKind(row.query), {
            source: 'gsc',
            impressions: row.impressions,
            bestPosition: row.bestPosition,
        });
    }

    // 2) Official feeds ki urgency
    for (const title of sourceTitles || []) {
        const urg = detectUrgency({ title });
        if (!urg || (urg.level !== 'CRITICAL' && urg.level !== 'HIGH')) continue;
        const score = Math.min(100, (urg.score || 50) + 25);
        put(title, score, 'fasttrack', { source: 'feed', urgency: urg.level });
    }

    return [...map.values()]
        .sort((a, b) => b.opportunityScore - a.opportunityScore)
        .slice(0, maxPicks);
}

// ------------------------------------------------------------------
// MAIN RUN
// ------------------------------------------------------------------

async function runTrendingRadar({ db = getDb(), logger = console.log, fetchImpl = fetch, now = Date.now() } = {}) {
    const summary = { gscRows: 0, feedTitles: 0, picks: 0, queuedBlogs: 0, errors: [] };
    logger('📡 Trending Radar starting...');

    // ---- 1) GSC gap mining (last 7 din) ----
    const gscAgg = new Map();
    try {
        for (let i = 2; i <= 8; i++) { // GSC data ~2 din late aata hai
            const date = new Date(now - i * 86400000).toISOString().slice(0, 10);
            let rows;
            try {
                rows = await db.collection('gsc_search_analytics_daily').doc(date)
                    .collection('rows').orderBy('impressions', 'desc').limit(300).get();
            } catch {
                continue; // us din ka data nahi — skip, silent-fail nahi (summary me count)
            }
            rows.forEach((d) => {
                const r = d.data();
                if (!r.query || r.query === '') return;
                const key = normalizeTopic(r.query);
                const cur = gscAgg.get(key) || { query: key, impressions: 0, clicks: 0, bestPosition: 99 };
                cur.impressions += Number(r.impressions) || 0;
                cur.clicks += Number(r.clicks) || 0;
                cur.bestPosition = Math.min(cur.bestPosition, Number(r.position) || 99);
                gscAgg.set(key, cur);
                summary.gscRows++;
            });
        }
        logger(`🔎 GSC: ${summary.gscRows} rows aggregated → ${gscAgg.size} unique queries`);
    } catch (e) {
        summary.errors.push('gsc: ' + e.message);
        logger('⚠️ GSC mining fail: ' + e.message);
    }

    // ---- 2) Official feed radar ----
    const sourceTitles = [];
    try {
        const sources = await getEnabledSources(db);
        for (const src of sources.slice(0, 10)) {
            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 12000);
                const res = await fetchImpl(src.url, { signal: ctrl.signal });
                clearTimeout(timer);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const xml = await res.text();
                const titles = extractRssTitles(xml);
                titles.forEach((t) => sourceTitles.push(t));
                await recordSourceCheck(db, src.name, { ok: true, itemCount: titles.length });
            } catch (e) {
                summary.errors.push(`feed ${src.name}: ${e.message}`);
                await recordSourceCheck(db, src.name, { ok: false, error: e.message });
            }
        }
        summary.feedTitles = sourceTitles.length;
        logger(`📰 Feeds: ${summary.feedTitles} titles scanned`);
    } catch (e) {
        summary.errors.push('feeds: ' + e.message);
        logger('⚠️ Feed scan fail: ' + e.message);
    }

    // ---- 3) Shield: site pe already kya hai ----
    let shieldTitles = [];
    try {
        const [ft, jb] = await Promise.all([
            db.collection('fast_track').orderBy('createdAt', 'desc').limit(100).get(),
            db.collection('jobs').orderBy('createdAt', 'desc').limit(100).get(),
        ]);
        ft.forEach((d) => shieldTitles.push(d.data().title || ''));
        jb.forEach((d) => shieldTitles.push(d.data().title || ''));
    } catch (e) {
        summary.errors.push('shield: ' + e.message);
    }

    // ---- 4) Pichhle 7 din ke radar picks (roz same topic na aaye) ----
    let alreadyQueued = [];
    try {
        const prev = await db.collection('content_opportunities')
            .where('source', '==', 'trending_radar')
            .where('createdAt', '>', now - 7 * 86400000).limit(100).get();
        prev.forEach((d) => alreadyQueued.push(d.data().topic || ''));
    } catch { /* first run */ }

    // ---- 5) Merge + score + store ----
    const picks = buildRadarOpportunities({
        gscAgg: [...gscAgg.values()],
        sourceTitles,
        shieldTitles,
        alreadyQueued,
    });
    summary.picks = picks.length;
    logger(`🎯 Radar picks: ${picks.length}`);

    for (const p of picks) {
        try {
            await db.collection('content_opportunities').add({
                ...p,
                normalizedTopic: normalizeTopic(p.topic),
                source: 'trending_radar',
                createdAt: now,
            });
            logger(`   • [${p.kind}] ${p.topic} (score ${p.opportunityScore}, ${p.source})`);
        } catch (e) {
            summary.errors.push('store: ' + e.message);
        }
    }

    // ---- 6) Blog queue (auto_blog agla blog inhi me se likhega) ----
    let queuedBlogs = 0;
    try {
        const docRef = db.collection('system_configs').doc('trending_radar');
        const existing = await docRef.get();
        const oldQueue = (existing.exists && Array.isArray(existing.data().blogQueue)) ? existing.data().blogQueue : [];
        const blogPicks = picks.filter((p) => p.kind === 'blog' || p.kind === 'mock').map((p) => ({
            topic: p.topic, score: p.opportunityScore, from: p.source,
        }));
        const blogQueue = [...oldQueue, ...blogPicks].slice(0, 6);
        queuedBlogs = blogPicks.length;
        await docRef.set({
            lastRun: now,
            status: 'completed',
            lastPicks: picks.slice(0, 5).map((p) => `[${p.kind}] ${p.topic}`),
            lastCounts: { gsc: summary.gscRows, feeds: summary.feedTitles, picks: picks.length },
            blogQueue,
            errors: summary.errors.slice(0, 5),
        }, { merge: true });
    } catch (e) {
        summary.errors.push('status: ' + e.message);
    }
    summary.queuedBlogs = queuedBlogs;

    logger(`📡 Radar done — picks:${summary.picks} queuedBlogs:${summary.queuedBlogs} errors:${summary.errors.length}`);
    return summary;
}

module.exports = {
    classifyKind,
    normalizeTopic,
    scoreGap,
    extractRssTitles,
    buildRadarOpportunities,
    runTrendingRadar,
};

if (require.main === module) {
    runTrendingRadar()
        .then(() => process.exit(0))
        .catch((e) => { console.error('❌ Radar fatal:', e.message); process.exit(1); });
}
