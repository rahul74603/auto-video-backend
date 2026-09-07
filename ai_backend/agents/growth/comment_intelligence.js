'use strict';

/**
 * comment_intelligence.js — Audience Comment Intelligence (Phase 27)
 * 
 * Classifies comments to discover audience-driven content opportunities.
 * Where platform APIs permit, collects comments and identifies gaps.
 */

const flags = require('./feature_flags');

const COMMENT_CLASSES = {
    question: { keywords: ['?', 'kya', 'how', 'kaise', 'kab', 'when', 'what', 'why', 'कब', 'क्या', 'कैसे', 'कितने'], weight: 0.8 },
    request: { keywords: ['please', 'banao', 'banaiye', 'cover', 'बनाओ', 'करो'], weight: 0.7 },
    confusion: { keywords: ['confused', 'samajh nahi', 'confusing', 'unclear', 'नहीं समझ'], weight: 0.6 },
    complaint: { keywords: ['wrong', 'galat', 'incorrect', 'false', 'गलत', 'झूठ'], weight: 0.5 },
    positive: { keywords: ['good', 'nice', 'great', 'accha', 'badhiya', 'thanks', 'अच्छा', 'बढ़िया'], weight: 0.3 },
    topic_request: { keywords: ['next', 'also', 'bhi', 'aur', 'another', 'और', 'भी'], weight: 0.9 },
    information_gap: { keywords: ['missing', 'not mentioned', 'kahan hai', 'नहीं बताया', 'missing info'], weight: 0.85 }
};

function classifyComment(text) {
    if (!text || typeof text !== 'string') return { class: 'unknown', confidence: 0 };
    
    const lower = text.toLowerCase();
    let bestClass = 'unknown';
    let bestScore = 0;

    for (const [cls, info] of Object.entries(COMMENT_CLASSES)) {
        let matchCount = 0;
        for (const kw of info.keywords) {
            if (lower.includes(kw)) matchCount++;
        }
        const score = matchCount > 0 ? (matchCount / info.keywords.length) * info.weight : 0;
        if (score > bestScore) {
            bestScore = score;
            bestClass = cls;
        }
    }

    return {
        class: bestClass,
        confidence: Math.min(1, Math.round(bestScore * 100) / 100),
        matchedClass: bestClass !== 'unknown'
    };
}

function extractOpportunitiesFromComments(comments, opts = {}) {
    if (!flags.isEnabled('COMMENT_INTELLIGENCE_ENABLED')) {
        return { opportunities: [], reason: 'comment intelligence disabled' };
    }

    if (!Array.isArray(comments) || comments.length === 0) {
        return { opportunities: [] };
    }

    const classified = comments.map(c => ({
        text: typeof c === 'string' ? c : (c.text || c.body || ''),
        ...classifyComment(typeof c === 'string' ? c : (c.text || c.body || ''))
    }));

    // Focus on questions, topic requests, and information gaps
    const actionable = classified.filter(c =>
        ['question', 'topic_request', 'information_gap', 'request'].includes(c.class)
    );

    if (actionable.length === 0) return { opportunities: [] };

    // Group similar requests
    const topicCounts = {};
    for (const comment of actionable) {
        const keywords = extractTopicKeywords(comment.text);
        for (const kw of keywords) {
            topicCounts[kw] = (topicCounts[kw] || 0) + 1;
        }
    }

    const opportunities = Object.entries(topicCounts)
        .filter(([, count]) => count >= 2) // At least 2 people asking
        .map(([topic, count]) => ({
            topic,
            requestCount: count,
            source: 'comment_intelligence',
            suggestedTitle: `${topic} — Detailed Explanation`,
            priority: count >= 5 ? 'high' : 'medium'
        }))
        .sort((a, b) => b.requestCount - a.requestCount);

    return {
        opportunities,
        totalComments: comments.length,
        actionableComments: actionable.length
    };
}

function extractTopicKeywords(text) {
    const lower = String(text).toLowerCase();
    const topics = [];
    
    const topicPatterns = [
        'age limit', 'eligibility', 'salary', 'syllabus', 'exam date',
        'admit card', 'result', 'vacancy', 'application fee', 'cut off',
        'physical', 'medical', 'document', 'preparation', 'previous year'
    ];

    for (const pattern of topicPatterns) {
        if (lower.includes(pattern)) topics.push(pattern);
    }

    return topics;
}

module.exports = {
    classifyComment,
    extractOpportunitiesFromComments,
    extractTopicKeywords,
    COMMENT_CLASSES
};
