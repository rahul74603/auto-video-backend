'use strict';

/**
 * breaking_mode.js — Breaking News Priority Mode (Phase 17)
 * 
 * Identifies breaking content and gives it priority in the dispatcher queue.
 * Breaking content bypasses normal queue position.
 */

const { detectUrgency, detectCategory } = require('./opportunity_engine');
const flags = require('./feature_flags');

const BREAKING_CATEGORIES = ['RESULT', 'ADMIT_CARD'];
const BREAKING_URGENCY = ['CRITICAL', 'HIGH'];

function isBreaking(content, opportunity) {
    if (!flags.isEnabled('BREAKING_MODE_ENABLED')) return false;
    
    const urgency = opportunity?.urgency || detectUrgency(content).level;
    const category = opportunity?.category || detectCategory(content);

    return BREAKING_URGENCY.includes(urgency) || BREAKING_CATEGORIES.includes(category);
}

function getBreakingPriority(content, opportunity) {
    if (!isBreaking(content, opportunity)) return 0;

    const urgency = opportunity?.urgencyLevel || detectUrgency(content).score;
    const category = opportunity?.category || detectCategory(content);

    let priority = 50; // base for breaking
    if (urgency >= 4) priority += 30; // CRITICAL
    else if (urgency >= 3) priority += 20; // HIGH
    
    if (BREAKING_CATEGORIES.includes(category)) priority += 10;

    return Math.min(100, priority);
}

function getDispatchPriority(candidate) {
    // Priority order (Phase 18):
    // 1. breaking content (priority >= 50)
    // 2. high opportunity score
    // 3. fresh content
    // 4. retries (but not permanently failed)
    // 5. normal queue

    const { data, kind } = candidate;
    const breakingPriority = getBreakingPriority(data, null);
    
    if (breakingPriority > 0) {
        return {
            priority: breakingPriority,
            reason: `breaking: ${data.title || 'content'}`,
            bypassQueue: true
        };
    }

    // Opportunity score (if computed)
    const oppScore = data.opportunityScore || 0;
    if (oppScore > 70) {
        return { priority: 40 + (oppScore - 70) / 10, reason: `high opportunity (${oppScore})` };
    }

    // Retry (previously failed but not permanently)
    if (data.videoStatus === 'failed' || data.videoStatus === 'upload_failed') {
        return { priority: 30, reason: 'retry' };
    }

    // Fresh content
    const age = Date.now() - (data.publishedAt || data.createdAt || 0);
    const ageHours = age / (1000 * 60 * 60);
    if (ageHours < 2) return { priority: 25, reason: 'very fresh (<2h)' };
    if (ageHours < 6) return { priority: 20, reason: 'fresh (<6h)' };

    return { priority: 10, reason: 'normal queue' };
}

module.exports = {
    isBreaking,
    getBreakingPriority,
    getDispatchPriority,
    BREAKING_CATEGORIES,
    BREAKING_URGENCY
};
