'use strict';

/**
 * content_similarity_detector.js — Extended Content Similarity Detection
 * 
 * Extends existing content_fingerprint.js to detect similarity across:
 * - Script text
 * - Hook text
 * - Title
 * - Visual style
 * - Layout
 * - Content angle
 * - Image fingerprint
 * 
 * Prevents:
 * - Near-identical videos flooding the platform
 * - Excessive repetition
 * - Spam-like content
 * 
 * Uses:
 * - Jaccard similarity for text
 * - Exact match for categorical data
 * - Weighted combination for overall similarity
 */

const { createFingerprint, normalizeText, extractKeyPhrases, jaccardSimilarity } = require('./content_fingerprint');

/**
 * Calculate overall similarity between two content pieces
 */
function calculateSimilarity(content1, content2, options = {}) {
    const {
        weights = {
            script: 0.25,
            hook: 0.20,
            title: 0.15,
            visualStyle: 0.10,
            layout: 0.10,
            contentAngle: 0.10,
            imageFingerprint: 0.10
        }
    } = options;
    
    let totalSimilarity = 0;
    let totalWeight = 0;
    
    // Script similarity
    if (content1.script && content2.script) {
        const scriptSim = calculateTextSimilarity(content1.script, content2.script);
        totalSimilarity += weights.script * scriptSim;
        totalWeight += weights.script;
    }
    
    // Hook similarity
    if (content1.hook && content2.hook) {
        const hookSim = calculateTextSimilarity(content1.hook, content2.hook);
        totalSimilarity += weights.hook * hookSim;
        totalWeight += weights.hook;
    }
    
    // Title similarity
    if (content1.title && content2.title) {
        const titleSim = calculateTextSimilarity(content1.title, content2.title);
        totalSimilarity += weights.title * titleSim;
        totalWeight += weights.title;
    }
    
    // Visual style similarity (exact match)
    if (content1.visualStyle && content2.visualStyle) {
        const visualSim = content1.visualStyle === content2.visualStyle ? 1 : 0;
        totalSimilarity += weights.visualStyle * visualSim;
        totalWeight += weights.visualStyle;
    }
    
    // Layout similarity (exact match)
    if (content1.layout && content2.layout) {
        const layoutSim = content1.layout === content2.layout ? 1 : 0;
        totalSimilarity += weights.layout * layoutSim;
        totalWeight += weights.layout;
    }
    
    // Content angle similarity (exact match)
    if (content1.contentAngle && content2.contentAngle) {
        const angleSim = content1.contentAngle === content2.contentAngle ? 1 : 0;
        totalSimilarity += weights.contentAngle * angleSim;
        totalWeight += weights.contentAngle;
    }
    
    // Image fingerprint similarity
    if (content1.imageFingerprint && content2.imageFingerprint) {
        const imageSim = content1.imageFingerprint === content2.imageFingerprint ? 1 : 0;
        totalSimilarity += weights.imageFingerprint * imageSim;
        totalWeight += weights.imageFingerprint;
    }
    
    // Normalize to 0-1
    const normalizedSimilarity = totalWeight > 0 ? totalSimilarity / totalWeight : 0;
    
    return {
        similarity: normalizedSimilarity,
        breakdown: {
            script: content1.script && content2.script ? calculateTextSimilarity(content1.script, content2.script) : null,
            hook: content1.hook && content2.hook ? calculateTextSimilarity(content1.hook, content2.hook) : null,
            title: content1.title && content2.title ? calculateTextSimilarity(content1.title, content2.title) : null,
            visualStyle: content1.visualStyle === content2.visualStyle,
            layout: content1.layout === content2.layout,
            contentAngle: content1.contentAngle === content2.contentAngle,
            imageFingerprint: content1.imageFingerprint === content2.imageFingerprint
        }
    };
}

/**
 * Calculate text similarity using Jaccard similarity
 */
function calculateTextSimilarity(text1, text2) {
    const phrases1 = extractKeyPhrases(text1);
    const phrases2 = extractKeyPhrases(text2);
    
    return jaccardSimilarity(new Set(phrases1), new Set(phrases2));
}

/**
 * Check if content is too similar to existing content
 */
function isTooSimilar(newContent, existingContentList, options = {}) {
    const {
        similarityThreshold = 0.7
    } = options;
    
    const similarContent = [];
    
    for (const existing of existingContentList) {
        const similarity = calculateSimilarity(newContent, existing);
        
        if (similarity.similarity >= similarityThreshold) {
            similarContent.push({
                content: existing,
                similarity: similarity.similarity,
                breakdown: similarity.breakdown
            });
        }
    }
    
    // Sort by similarity (descending)
    similarContent.sort((a, b) => b.similarity - a.similarity);
    
    return {
        isTooSimilar: similarContent.length > 0,
        similarContent,
        highestSimilarity: similarContent.length > 0 ? similarContent[0].similarity : 0
    };
}

/**
 * Suggest changes to reduce similarity
 */
function suggestChanges(newContent, similarContent, options = {}) {
    const suggestions = [];
    
    if (similarContent.length === 0) {
        return suggestions;
    }
    
    const mostSimilar = similarContent[0];
    const breakdown = mostSimilar.breakdown;
    
    // Suggest changing high-similarity dimensions
    if (breakdown.script > 0.7) {
        suggestions.push({
            dimension: 'script',
            currentSimilarity: breakdown.script,
            suggestion: 'Use different script angle or structure',
            priority: 'high'
        });
    }
    
    if (breakdown.hook > 0.7) {
        suggestions.push({
            dimension: 'hook',
            currentSimilarity: breakdown.hook,
            suggestion: 'Try a different hook type',
            priority: 'high'
        });
    }
    
    if (breakdown.visualStyle) {
        suggestions.push({
            dimension: 'visualStyle',
            currentSimilarity: 1,
            suggestion: 'Use different visual style',
            priority: 'medium'
        });
    }
    
    if (breakdown.layout) {
        suggestions.push({
            dimension: 'layout',
            currentSimilarity: 1,
            suggestion: 'Try a different layout',
            priority: 'medium'
        });
    }
    
    if (breakdown.contentAngle) {
        suggestions.push({
            dimension: 'contentAngle',
            currentSimilarity: 1,
            suggestion: 'Use different content angle',
            priority: 'medium'
        });
    }
    
    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    
    return suggestions;
}

/**
 * Create comprehensive content fingerprint
 */
function createExtendedFingerprint(content) {
    const basicFingerprint = createFingerprint(content);
    
    return {
        ...basicFingerprint,
        // Add extended fields
        scriptFingerprint: content.script ? normalizeText(content.script).substring(0, 100) : null,
        hookFingerprint: content.hook ? normalizeText(content.hook).substring(0, 50) : null,
        visualStyle: content.visualStyle || null,
        layout: content.layout || null,
        contentAngle: content.contentAngle || null,
        imageFingerprint: content.imageFingerprint || null,
        // Timestamp for tracking
        createdAt: Date.now()
    };
}

module.exports = {
    calculateSimilarity,
    calculateTextSimilarity,
    isTooSimilar,
    suggestChanges,
    createExtendedFingerprint
};
