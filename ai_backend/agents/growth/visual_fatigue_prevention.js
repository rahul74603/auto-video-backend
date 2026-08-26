'use strict';

/**
 * visual_fatigue_prevention.js — Visual Fatigue Prevention Engine
 * 
 * Tracks recent visual usage to prevent excessive repetition.
 * 
 * Monitors:
 * - Visual style
 * - Layout
 * - Presenter
 * - Background fingerprint
 * - Color profile
 * - Opening pattern
 * - Hook type
 * - Content angle
 * 
 * Prevents:
 * - Same presenter + layout + style for many consecutive videos
 * - Excessive repetition of any single element
 * - Brand identity loss (maintain some consistency)
 * 
 * Creates diversity score to measure variation.
 */

/**
 * Calculate diversity score for a proposed combination
 */
function calculateDiversityScore(proposed, recentHistory, options = {}) {
    const weights = options.weights || {
        visualStyle: 0.25,
        layout: 0.20,
        presenter: 0.20,
        hookType: 0.15,
        contentAngle: 0.10,
        openingPattern: 0.10
    };
    
    let diversityScore = 0;
    let totalWeight = 0;
    
    // Check each dimension
    for (const [dimension, weight] of Object.entries(weights)) {
        if (!proposed[dimension]) {
            continue;
        }
        
        const recentValues = recentHistory
            .slice(-(options.historySize || 10))
            .map(h => h[dimension])
            .filter(v => v !== undefined && v !== null);
        
        if (recentValues.length === 0) {
            diversityScore += weight;
            totalWeight += weight;
            continue;
        }
        
        // Check if this value was used recently
        const recentUsage = recentValues.filter(v => v === proposed[dimension]).length;
        const recentUsageRatio = recentUsage / recentValues.length;
        
        // Diversity contribution (higher = more diverse)
        const diversity = 1 - recentUsageRatio;
        
        diversityScore += weight * diversity;
        totalWeight += weight;
    }
    
    // Normalize to 0-100 scale
    const normalizedScore = totalWeight > 0 ? (diversityScore / totalWeight) * 100 : 50;
    
    return {
        score: normalizedScore,
        breakdown: {
            visualStyle: calculateDimensionDiversity(proposed.visualStyle, recentHistory, 'visualStyle'),
            layout: calculateDimensionDiversity(proposed.layout, recentHistory, 'layout'),
            presenter: calculateDimensionDiversity(proposed.presenter, recentHistory, 'presenter'),
            hookType: calculateDimensionDiversity(proposed.hookType, recentHistory, 'hookType'),
            contentAngle: calculateDimensionDiversity(proposed.contentAngle, recentHistory, 'contentAngle'),
            openingPattern: calculateDimensionDiversity(proposed.openingPattern, recentHistory, 'openingPattern')
        }
    };
}

/**
 * Calculate diversity for a single dimension
 */
function calculateDimensionDiversity(value, recentHistory, dimension) {
    if (!value) {
        return 50; // Neutral
    }
    
    const recentValues = recentHistory
        .slice(-10)
        .map(h => h[dimension])
        .filter(v => v !== undefined && v !== null);
    
    if (recentValues.length === 0) {
        return 100; // No history = fully diverse
    }
    
    const recentUsage = recentValues.filter(v => v === value).length;
    const recentUsageRatio = recentUsage / recentValues.length;
    
    return (1 - recentUsageRatio) * 100;
}

/**
 * Check if proposed combination would cause excessive repetition
 */
function wouldCauseRepetition(proposed, recentHistory, options = {}) {
    const maxConsecutiveSame = options.maxConsecutiveSame || 3;
    const recentSlice = recentHistory.slice(-(maxConsecutiveSame - 1));
    
    // Check if all recent items match the proposed combination
    const allMatch = recentSlice.every(h => 
        h.visualStyle === proposed.visualStyle &&
        h.layout === proposed.layout &&
        h.presenter === proposed.presenter &&
        h.hookType === proposed.hookType
    );
    
    return allMatch;
}

/**
 * Suggest alternatives to reduce repetition
 */
function suggestAlternatives(proposed, recentHistory, availableOptions) {
    const suggestions = [];
    
    const dimensions = ['visualStyle', 'layout', 'presenter', 'hookType', 'contentAngle'];
    
    for (const dimension of dimensions) {
        if (!proposed[dimension]) {
            continue;
        }
        
        const recentValues = recentHistory
            .slice(-5)
            .map(h => h[dimension])
            .filter(v => v !== undefined && v !== null);
        
        const recentUsage = recentValues.filter(v => v === proposed[dimension]).length;
        
        // If this value was used 2+ times in last 5, suggest alternatives
        if (recentUsage >= 2) {
            const alternatives = availableOptions[dimension] || [];
            const freshAlternatives = alternatives.filter(a => !recentValues.includes(a));
            
            if (freshAlternatives.length > 0) {
                suggestions.push({
                    dimension,
                    currentValue: proposed[dimension],
                    alternatives: freshAlternatives.slice(0, 3)
                });
            }
        }
    }
    
    return suggestions;
}

/**
 * Select diverse combination from candidates
 */
function selectDiverseCombination(candidates, recentHistory, options = {}) {
    if (candidates.length === 0) {
        return null;
    }
    
    // Score each candidate by diversity
    const scoredCandidates = candidates.map(candidate => {
        const diversity = calculateDiversityScore(candidate, recentHistory, options);
        const wouldRepeat = wouldCauseRepetition(candidate, recentHistory, options);
        
        return {
            ...candidate,
            diversityScore: diversity.score,
            diversityBreakdown: diversity.breakdown,
            wouldCauseRepetition: wouldRepeat
        };
    });
    
    // Filter out candidates that would cause repetition (if possible)
    const nonRepeatingCandidates = scoredCandidates.filter(c => !c.wouldCauseRepetition);
    const candidatePool = nonRepeatingCandidates.length > 0 ? nonRepeatingCandidates : scoredCandidates;
    
    // Sort by diversity score (descending)
    candidatePool.sort((a, b) => b.diversityScore - a.diversityScore);
    
    // Pick from top 3 (exploration)
    const topCandidates = candidatePool.slice(0, 3);
    const randomIndex = Math.floor(Math.random() * topCandidates.length);
    
    return topCandidates[randomIndex];
}

/**
 * Get recent visual history from Firestore (if available)
 */
async function getRecentVisualHistory(db, options = {}) {
    if (!db) {
        return [];
    }
    
    try {
        const limit = options.limit || 20;
        const collection = options.collection || 'content_performance';
        
        const snapshot = await db.collection(collection)
            .orderBy('publishedAt', 'desc')
            .limit(limit)
            .get();
        
        return snapshot.docs.map(doc => ({
            id: doc.id,
            visualStyle: doc.data().visualStyle,
            layout: doc.data().layout,
            presenter: doc.data().presenter,
            hookType: doc.data().hookType,
            contentAngle: doc.data().contentAngle,
            openingPattern: doc.data().openingPattern,
            publishedAt: doc.data().publishedAt
        }));
    } catch (err) {
        console.log(`⚠️ Failed to fetch visual history: ${err.message || err}`);
        return [];
    }
}

/**
 * Log visual usage for tracking
 */
async function logVisualUsage(db, usage, options = {}) {
    if (!db) {
        return;
    }
    
    try {
        const collection = options.collection || 'visual_usage_log';
        
        await db.collection(collection).add({
            ...usage,
            loggedAt: Date.now()
        });
    } catch (err) {
        console.log(`⚠️ Failed to log visual usage: ${err.message || err}`);
    }
}

/**
 * Get recent AI visual combinations (scene + seed + fingerprint) that were
 * generated for recent videos. Used by the AI visual diversity guard.
 *
 * Keeps the query cheap: ordered by loggedAt desc in the same lightweight
 * visual_usage_log collection, and filters AI entries in memory so no extra
 * composite index is required.
 */
async function getRecentAiVisualHistory(db, options = {}) {
    if (!db) {
        return [];
    }
    
    try {
        const limit = options.limit || 20;
        const collection = options.collection || 'visual_usage_log';
        const snapshot = await db.collection(collection)
            .orderBy('loggedAt', 'desc')
            .limit(limit)
            .get();
        
        return snapshot.docs
            .map(doc => ({
                id: doc.id,
                kind: doc.data().kind,
                contentId: doc.data().contentId,
                category: doc.data().category,
                fingerprint: doc.data().fingerprint,
                combination: doc.data().combination || doc.data().combinationKey,
                scene: doc.data().scene,
                subject: doc.data().subject,
                camera: doc.data().camera,
                lighting: doc.data().lighting,
                style: doc.data().style,
                seed: doc.data().seed,
                variant: doc.data().variant,
                loggedAt: doc.data().loggedAt
            }))
            .filter(item => item.kind === 'ai-visual');
    } catch (err) {
        console.log(`⚠️ Failed to fetch AI visual history: ${err.message || err}`);
        return [];
    }
}

/**
 * Log an AI visual combination so the next N videos can avoid repeating it.
 */
async function logAiVisualUsage(db, usage, options = {}) {
    if (!db) {
        return;
    }
    
    try {
        const collection = options.collection || 'visual_usage_log';
        await db.collection(collection).add({
            ...usage,
            kind: 'ai-visual',
            loggedAt: Date.now()
        });
    } catch (err) {
        console.log(`⚠️ Failed to log AI visual usage: ${err.message || err}`);
    }
}

module.exports = {
    calculateDiversityScore,
    calculateDimensionDiversity,
    wouldCauseRepetition,
    suggestAlternatives,
    selectDiverseCombination,
    getRecentVisualHistory,
    logVisualUsage,
    getRecentAiVisualHistory,
    logAiVisualUsage
};
