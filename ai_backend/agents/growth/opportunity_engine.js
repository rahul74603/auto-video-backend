'use strict';

/**
 * opportunity_engine.js — Content Opportunity Detection (Phase 2)
 * 
 * Scans internal content signals (jobs, fast_track, mock_tests) to identify
 * content opportunities. Does NOT use fake trend data.
 * 
 * Firestore collection: content_opportunities
 */

const V = require('../../video_state');
const { createFingerprint, checkDuplicate, storeFingerprint } = require('./content_fingerprint');
const flags = require('./feature_flags');

const URGENCY_LEVELS = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const URGENCY_KEYWORDS = {
    CRITICAL: ['result out', 'result declared', 'admit card out', 'admit card released', 'exam today', 'last date today', 'walk in interview'],
    HIGH: ['last date tomorrow', 'last date extended', 'exam date changed', 'important notice', 'urgent update', 'answer key released', 'application started'],
    MEDIUM: ['new vacancy', 'recruitment released', 'notification out', 'apply online', 'vacancy announced'],
    LOW: ['upcoming exam', 'syllabus updated', 'selection process', 'exam pattern']
};

function detectUrgency(content) {
    const text = `${content.title || ''} ${content.description || ''} ${content.category || ''}`.toLowerCase();
    
    for (const [level, keywords] of Object.entries(URGENCY_KEYWORDS)) {
        for (const kw of keywords) {
            if (text.includes(kw)) {
                return { level, keyword: kw, score: URGENCY_LEVELS[level] };
            }
        }
    }
    return { level: 'LOW', keyword: '', score: 1 };
}

function detectCategory(content) {
    const cat = String(content.category || '').toLowerCase();
    const title = String(content.title || '').toLowerCase();
    const combined = `${cat} ${title}`;

    const categories = [
        // Result-style updates first so "Railway Result" / "SSC GD Result Out"
        // are not classified as a job family (which then gets Apply language).
        { name: 'RESULT', keywords: ['result', 'merit list', 'selection list', 'scorecard', 'cutoff'] },
        { name: 'ADMIT_CARD', keywords: ['admit card', 'hall ticket', 'call letter'] },
        { name: 'ANSWER_KEY', keywords: ['answer key', 'objection'] },
        { name: 'SYLLABUS', keywords: ['syllabus'] },
        { name: 'SSC', keywords: ['ssc', 'staff selection'] },
        { name: 'RAILWAY', keywords: ['railway', 'rrb', 'rrc'] },
        { name: 'BANKING', keywords: ['bank', 'ibps', 'sbi', 'rbi'] },
        { name: 'UPSC', keywords: ['upsc', 'civil services', 'ias'] },
        { name: 'DEFENCE', keywords: ['army', 'navy', 'airforce', 'air force', 'defence', 'nda', 'cds'] },
        { name: 'POLICE', keywords: ['police', 'constable', 'si '] },
        { name: 'TEACHING', keywords: ['teacher', 'tet', 'ctet', 'ktet', 'education'] },
        { name: 'ENGINEERING', keywords: ['engineer', 'je ', 'ae ', 'gate'] },
        { name: 'STATE', keywords: ['uttar pradesh', 'up ssc', 'up police', 'up gov', 'mp police', 'bihar', 'rajasthan', 'maharashtra', 'cg police', 'chhattisgarh'] }
    ];

    for (const cat of categories) {
        for (const kw of cat.keywords) {
            if (combined.includes(kw.trim())) return cat.name;
        }
    }
    return 'GENERAL';
}

function computeFreshnessScore(content) {
    const publishedAt = V.publishedAtMs(content);
    if (!publishedAt) return 0.3;
    const ageHours = (Date.now() - publishedAt) / (1000 * 60 * 60);
    if (ageHours < 1) return 1.0;
    if (ageHours < 6) return 0.9;
    if (ageHours < 12) return 0.7;
    if (ageHours < 24) return 0.5;
    if (ageHours < 48) return 0.3;
    return 0.1;
}

function computeAudienceFit(content) {
    const cat = detectCategory(content);
    const audienceMap = {
        'SSC': 0.9, 'RAILWAY': 0.85, 'BANKING': 0.8, 'UPSC': 0.7,
        'DEFENCE': 0.85, 'POLICE': 0.9, 'TEACHING': 0.75, 'ENGINEERING': 0.7,
        'STATE': 0.8, 'RESULT': 0.95, 'ADMIT_CARD': 0.9, 'GENERAL': 0.5
    };
    return audienceMap[cat] || 0.5;
}

function computeOpportunityScore(scores) {
    const weights = {
        freshness: 0.25,
        urgency: 0.20,
        audienceFit: 0.20,
        searchIntent: 0.15,
        historicalPerf: 0.10,
        competition: 0.10
    };

    let total = 0;
    for (const [key, weight] of Object.entries(weights)) {
        total += (scores[key] || 0) * weight;
    }
    return Math.round(total * 100);
}

function recommendFormat(urgency, category) {
    if (urgency.score >= 3) return { format: 'BREAKING_SHORT', duration: 15 };
    if (category === 'RESULT' || category === 'ADMIT_CARD' || category === 'ANSWER_KEY' || category === 'SYLLABUS') {
        return { format: 'UPDATE', duration: 20 };
    }
    if (urgency.score >= 2) return { format: 'JOB_ALERT', duration: 30 };
    return { format: 'DETAILED', duration: 45 };
}

async function detectOpportunity(content, opts = {}) {
    if (!flags.isEnabled('GROWTH_ENGINE_ENABLED')) {
        return { detected: false, reason: 'growth engine disabled' };
    }

    const urgency = detectUrgency(content);
    const category = detectCategory(content);
    const freshnessScore = computeFreshnessScore(content);
    const audienceFit = computeAudienceFit(content);
    const competitionScore = 0.5; // Default; will be refined by analytics
    const searchIntentScore = urgency.score >= 3 ? 0.9 : urgency.score >= 2 ? 0.7 : 0.5;
    const historicalPerfScore = opts.historicalPerf || 0.5;

    const scores = {
        freshness: freshnessScore,
        urgency: urgency.score / 4,
        audienceFit,
        searchIntent: searchIntentScore,
        historicalPerf: historicalPerfScore,
        competition: 1 - competitionScore
    };

    const opportunityScore = computeOpportunityScore(scores);
    const recommendation = recommendFormat(urgency, category);
    const fingerprint = createFingerprint(content);

    return {
        detected: true,
        topic: content.title || content.topic || 'Unknown',
        normalizedTopic: fingerprint.normalizedTopic,
        category,
        source: content.source || 'internal',
        sourceUrl: content.sourceUrl || content.officialUrl || '',
        detectedAt: Date.now(),
        freshnessScore: Math.round(freshnessScore * 100) / 100,
        urgencyScore: urgency.score,
        urgencyLevel: urgency.level,
        urgencyKeyword: urgency.keyword,
        searchIntentScore: Math.round(searchIntentScore * 100) / 100,
        audienceFitScore: Math.round(audienceFit * 100) / 100,
        historicalPerformanceScore: historicalPerfScore,
        competitionScore,
        opportunityScore,
        urgency: urgency.level,
        contentType: content.type || 'JOB',
        status: 'new',
        recommendedFormat: recommendation.format,
        recommendedDuration: recommendation.duration,
        recommendedHookTypes: recommendHookTypes(urgency, category),
        fingerprint: fingerprint.hash,
        keyFacts: extractKeyFacts(content)
    };
}

function recommendHookTypes(urgency, category) {
    if (category === 'RESULT') {
        const types = [];
        if (urgency.score >= 3) types.push('urgency');
        types.push('direct_answer', 'surprising_fact', 'curiosity');
        return [...new Set(types)].slice(0, 5);
    }
    if (category === 'ADMIT_CARD') {
        return [...new Set(['urgency', 'direct_answer', 'benefit'])].slice(0, 5);
    }
    if (category === 'ANSWER_KEY') {
        return ['direct_answer', 'urgency', 'curiosity', 'question'].slice(0, 5);
    }
    if (category === 'SYLLABUS') {
        return ['direct_answer', 'curiosity', 'benefit'].slice(0, 5);
    }
    const types = [];
    if (urgency.score >= 3) types.push('urgency', 'deadline');
    types.push('eligibility', 'question', 'audience_specific');
    if (types.length < 3) types.push('curiosity', 'benefit');
    return [...new Set(types)].slice(0, 5);
}

function extractKeyFacts(content) {
    const facts = [];
    if (content.organization) facts.push({ type: 'org', value: content.organization });
    if (content.vacancies) facts.push({ type: 'vacancy', value: String(content.vacancies) });
    if (content.lastDate) facts.push({ type: 'lastDate', value: String(content.lastDate) });
    if (content.startDate) facts.push({ type: 'startDate', value: String(content.startDate) });
    if (content.category) facts.push({ type: 'category', value: content.category });
    if (content.qualification) facts.push({ type: 'qualification', value: content.qualification });
    return facts;
}

async function storeOpportunity(db, opportunity) {
    if (!db || !opportunity.detected) return null;
    try {
        const ref = await db.collection('content_opportunities').add({
            ...opportunity,
            createdAt: Date.now()
        });
        return ref.id;
    } catch (err) {
        console.log(`⚠️ opportunity store failed: ${err.message || err}`);
        return null;
    }
}

module.exports = {
    detectUrgency,
    detectCategory,
    computeFreshnessScore,
    computeAudienceFit,
    computeOpportunityScore,
    recommendFormat,
    recommendHookTypes,
    extractKeyFacts,
    detectOpportunity,
    storeOpportunity,
    URGENCY_LEVELS,
    URGENCY_KEYWORDS
};
