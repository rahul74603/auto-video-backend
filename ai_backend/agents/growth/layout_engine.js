'use strict';

/**
 * layout_engine.js — Dynamic Layout Engine
 * 
 * Determines the composition of each video:
 * - Where presenter appears (bottom, left, right, center)
 * - Where information text appears
 * - Safe areas for text readability
 * - Mobile-safe margins
 * - No overlap zones
 * 
 * Layouts are selected based on:
 * - Category (some layouts work better for certain content types)
 * - Previous layout usage (prevent fatigue)
 * - Performance data (learn what works)
 * - Content type (breaking vs normal)
 * 
 * All layouts ensure:
 * - Text is readable on mobile
 * - No overlap with presenter
 * - Safe margins (no edge clipping)
 * - Minimum contrast areas
 */

// Layout definitions
const LAYOUTS = {
    // Presenter bottom, information top
    'LAYOUT_A': {
        name: 'Presenter Bottom',
        presenterZone: { x: 0.2, y: 0.7, width: 0.6, height: 0.3 },
        infoZone: { x: 0.1, y: 0.1, width: 0.8, height: 0.5 },
        safeMargins: { top: 80, bottom: 120, left: 60, right: 60 },
        textAlignment: 'center',
        bestFor: ['JOB', 'ADMIT_CARD', 'RESULT'],
        description: 'Classic layout: presenter at bottom, info at top'
    },
    
    // Presenter left, information right
    'LAYOUT_B': {
        name: 'Presenter Left',
        presenterZone: { x: 0.05, y: 0.3, width: 0.4, height: 0.5 },
        infoZone: { x: 0.5, y: 0.1, width: 0.45, height: 0.7 },
        safeMargins: { top: 80, bottom: 100, left: 60, right: 60 },
        textAlignment: 'left',
        bestFor: ['JOB', 'UPSC', 'ENGINEERING'],
        description: 'Split layout: presenter left, info right'
    },
    
    // Presenter right, information left
    'LAYOUT_C': {
        name: 'Presenter Right',
        presenterZone: { x: 0.55, y: 0.3, width: 0.4, height: 0.5 },
        infoZone: { x: 0.05, y: 0.1, width: 0.45, height: 0.7 },
        safeMargins: { top: 80, bottom: 100, left: 60, right: 60 },
        textAlignment: 'right',
        bestFor: ['JOB', 'BANKING', 'RAILWAY'],
        description: 'Split layout: presenter right, info left'
    },
    
    // Full visual, small presenter
    'LAYOUT_D': {
        name: 'Full Visual',
        presenterZone: { x: 0.3, y: 0.75, width: 0.4, height: 0.2 },
        infoZone: { x: 0.1, y: 0.1, width: 0.8, height: 0.4 },
        safeMargins: { top: 80, bottom: 80, left: 60, right: 60 },
        textAlignment: 'center',
        bestFor: ['RESULT', 'ADMIT_CARD', 'BREAKING'],
        description: 'Full background visual, small presenter at bottom'
    },
    
    // Large vacancy number focus
    'LAYOUT_E': {
        name: 'Vacancy Focus',
        presenterZone: { x: 0.25, y: 0.65, width: 0.5, height: 0.3 },
        infoZone: { x: 0.1, y: 0.05, width: 0.8, height: 0.5 },
        safeMargins: { top: 60, bottom: 100, left: 60, right: 60 },
        textAlignment: 'center',
        bestFor: ['JOB'],
        description: 'Large vacancy number, presenter below'
    },
    
    // Deadline-focused
    'LAYOUT_F': {
        name: 'Deadline Focus',
        presenterZone: { x: 0.2, y: 0.7, width: 0.6, height: 0.25 },
        infoZone: { x: 0.1, y: 0.1, width: 0.8, height: 0.5 },
        safeMargins: { top: 80, bottom: 100, left: 60, right: 60 },
        textAlignment: 'center',
        bestFor: ['JOB', 'ADMIT_CARD'],
        description: 'Deadline prominent at top, presenter bottom'
    },
    
    // Document-focused
    'LAYOUT_G': {
        name: 'Document Focus',
        presenterZone: { x: 0.3, y: 0.7, width: 0.4, height: 0.25 },
        infoZone: { x: 0.1, y: 0.05, width: 0.8, height: 0.55 },
        safeMargins: { top: 60, bottom: 80, left: 60, right: 60 },
        textAlignment: 'center',
        bestFor: ['ADMIT_CARD', 'RESULT', 'ANSWER_KEY'],
        description: 'Document-style layout, official look'
    },
    
    // Question/answer layout
    'LAYOUT_H': {
        name: 'Q&A Layout',
        presenterZone: { x: 0.25, y: 0.55, width: 0.5, height: 0.4 },
        infoZone: { x: 0.1, y: 0.05, width: 0.8, height: 0.4 },
        safeMargins: { top: 60, bottom: 80, left: 60, right: 60 },
        textAlignment: 'center',
        bestFor: ['FAQ', 'EDUCATIONAL'],
        description: 'Question at top, presenter answering below'
    },
    
    // Minimal editorial
    'LAYOUT_I': {
        name: 'Minimal Editorial',
        presenterZone: { x: 0.3, y: 0.65, width: 0.4, height: 0.3 },
        infoZone: { x: 0.15, y: 0.1, width: 0.7, height: 0.45 },
        safeMargins: { top: 80, bottom: 100, left: 80, right: 80 },
        textAlignment: 'center',
        bestFor: ['JOB', 'UPSC', 'SCHOLARSHIP'],
        description: 'Clean minimal layout, editorial style'
    },
    
    // Breaking update
    'LAYOUT_J': {
        name: 'Breaking Update',
        presenterZone: { x: 0.25, y: 0.7, width: 0.5, height: 0.25 },
        infoZone: { x: 0.1, y: 0.05, width: 0.8, height: 0.55 },
        safeMargins: { top: 60, bottom: 80, left: 60, right: 60 },
        textAlignment: 'center',
        bestFor: ['BREAKING', 'RESULT', 'ADMIT_CARD'],
        description: 'Urgent breaking news style'
    }
};

/**
 * Select layout based on category, recent usage, and performance
 */
function selectLayout(jobData, recentLayouts = [], performanceData = null) {
    const category = jobData.category || 'JOB';
    const contentType = jobData.type || 'JOB';
    
    // Get layouts suitable for this category
    const suitableLayouts = Object.entries(LAYOUTS)
        .filter(([key, layout]) => {
            return layout.bestFor.includes(contentType) || 
                   layout.bestFor.includes(category) ||
                   layout.bestFor.includes('JOB');
        })
        .map(([key, layout]) => ({ key, ...layout }));
    
    if (suitableLayouts.length === 0) {
        return LAYOUTS['LAYOUT_A']; // Fallback
    }
    
    // Prevent fatigue: avoid recently used layouts
    const recentKeys = recentLayouts.slice(-5); // Last 5 layouts
    const freshLayouts = suitableLayouts.filter(l => !recentKeys.includes(l.key));
    
    // If we have fresh layouts, pick from them
    const candidatePool = freshLayouts.length > 0 ? freshLayouts : suitableLayouts;
    
    // If we have performance data, weight by performance
    if (performanceData && performanceData.length > 0) {
        const layoutPerformance = {};
        
        performanceData.forEach(p => {
            const layout = p.layout || 'LAYOUT_A';
            if (!layoutPerformance[layout]) {
                layoutPerformance[layout] = { total: 0, count: 0 };
            }
            layoutPerformance[layout].total += p.performanceScore || 0;
            layoutPerformance[layout].count += 1;
        });
        
        // Score each candidate
        candidatePool.forEach(layout => {
            const perf = layoutPerformance[layout.key];
            if (perf && perf.count >= 3) { // Minimum sample size
                layout.score = (perf.total / perf.count) * 0.3; // 30% weight to performance
            } else {
                layout.score = 0.5; // Default score
            }
        });
        
        // Sort by score (descending) and pick from top 3
        candidatePool.sort((a, b) => b.score - a.score);
        const topCandidates = candidatePool.slice(0, 3);
        
        // Random selection from top candidates (exploration)
        const selectedIndex = Math.floor(Math.random() * topCandidates.length);
        return topCandidates[selectedIndex];
    }
    
    // Random selection from suitable layouts
    const randomIndex = Math.floor(Math.random() * candidatePool.length);
    return candidatePool[randomIndex];
}

/**
 * Calculate safe text area within a layout
 */
function getSafeTextArea(layout, textWidth, textHeight) {
    const infoZone = layout.infoZone;
    const margins = layout.safeMargins;
    
    // Calculate available space
    const availableWidth = infoZone.width - (margins.left + margins.right) / 1080;
    const availableHeight = infoZone.height - (margins.top + margins.bottom) / 1920;
    
    return {
        x: infoZone.x + margins.left / 1080,
        y: infoZone.y + margins.top / 1920,
        width: availableWidth,
        height: availableHeight,
        maxFontSize: Math.min(availableHeight * 0.3, availableWidth * 0.15)
    };
}

/**
 * Check if two zones overlap
 */
function zonesOverlap(zone1, zone2) {
    const x1 = zone1.x;
    const y1 = zone1.y;
    const x2 = zone1.x + zone1.width;
    const y2 = zone1.y + zone1.height;
    
    const x3 = zone2.x;
    const y3 = zone2.y;
    const x4 = zone2.x + zone2.width;
    const y4 = zone2.y + zone2.height;
    
    // No overlap if one is completely to the left/right/above/below the other
    if (x2 < x3 || x1 > x4 || y2 < y3 || y1 > y4) {
        return false;
    }
    
    return true;
}

/**
 * Validate layout for mobile safety
 */
function validateMobileSafety(layout) {
    const issues = [];
    
    // Check minimum safe margins
    if (layout.safeMargins.top < 60) {
        issues.push('Top margin too small for mobile');
    }
    if (layout.safeMargins.bottom < 80) {
        issues.push('Bottom margin too small for mobile');
    }
    if (layout.safeMargins.left < 50) {
        issues.push('Left margin too small for mobile');
    }
    if (layout.safeMargins.right < 50) {
        issues.push('Right margin too small for mobile');
    }
    
    // Check presenter zone is reasonable
    if (layout.presenterZone.width < 0.2) {
        issues.push('Presenter zone too narrow');
    }
    if (layout.presenterZone.height < 0.15) {
        issues.push('Presenter zone too short');
    }
    
    // Check info zone is reasonable
    if (layout.infoZone.width < 0.4) {
        issues.push('Info zone too narrow');
    }
    if (layout.infoZone.height < 0.2) {
        issues.push('Info zone too short');
    }
    
    return {
        valid: issues.length === 0,
        issues
    };
}

module.exports = {
    LAYOUTS,
    selectLayout,
    getSafeTextArea,
    zonesOverlap,
    validateMobileSafety
};
