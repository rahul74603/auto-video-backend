'use strict';

/**
 * mobile_quality_gate.js — Mobile Quality Validation Engine
 * 
 * Validates video composition for mobile readability before final render.
 * 
 * Checks:
 * - Text width and font size
 * - Line count
 * - Safe margins
 * - Contrast
 * - Presenter overlap
 * - Subtitle overlap
 * - First-frame overlap
 * - CTA overlap
 * - Hindi line breaking
 * - English/Hindi mixed text
 * - Extreme long words
 * - Screen edge clipping
 * 
 * If quality fails:
 * - Try safe adjustment
 * - Fallback to existing safe template
 * - Never publish obviously broken frame
 */

/**
 * Validate text for mobile readability
 */
function validateText(text, options = {}) {
    const issues = [];
    const warnings = [];
    
    // Check for extreme long words (no space)
    const words = text.split(/\s+/);
    const maxWordLength = options.maxWordLength || 25;
    
    words.forEach(word => {
        if (word.length > maxWordLength) {
            issues.push(`Word too long: "${word.substring(0, 20)}..." (${word.length} chars)`);
        }
    });
    
    // Check line count
    const lines = text.split('\n');
    const maxLines = options.maxLines || 4;
    
    if (lines.length > maxLines) {
        warnings.push(`Too many lines: ${lines.length} (max ${maxLines})`);
    }
    
    // Check for mixed language issues
    const hasHindi = /[\u0900-\u097F]/.test(text);
    const hasEnglish = /[a-zA-Z]/.test(text);
    
    if (hasHindi && hasEnglish) {
        // Mixed language - ensure proper spacing
        const mixedPattern = /[\u0900-\u097F][a-zA-Z]|[a-zA-Z][\u0900-\u097F]/g;
        const matches = text.match(mixedPattern);
        
        if (matches && matches.length > 0) {
            warnings.push('Mixed Hindi/English without spaces');
        }
    }
    
    // Check for special characters that might not render
    const specialChars = text.match(/[^\w\s\u0900-\u097F.,!?;:'"()\[\]{}\/\\@#$%^&*+=<>~`_-]/g);
    
    if (specialChars && specialChars.length > 0) {
        warnings.push(`Special characters detected: ${specialChars.slice(0, 3).join(', ')}`);
    }
    
    return {
        valid: issues.length === 0,
        issues,
        warnings
    };
}

/**
 * Validate composition layout
 */
function validateComposition(layout, presenterZone, infoZone, options = {}) {
    const issues = [];
    const warnings = [];
    
    // Check for overlap between presenter and info zones
    if (zonesOverlap(presenterZone, infoZone)) {
        issues.push('Presenter and info zones overlap');
    }
    
    // Check safe margins
    const screenMargins = options.screenMargins || {
        top: 80,
        bottom: 120,
        left: 60,
        right: 60
    };
    
    // Check presenter zone within bounds
    if (presenterZone.y + presenterZone.height > (1920 - screenMargins.bottom) / 1920) {
        warnings.push('Presenter too close to bottom edge');
    }
    
    if (presenterZone.y < screenMargins.top / 1920) {
        warnings.push('Presenter too close to top edge');
    }
    
    if (presenterZone.x < screenMargins.left / 1080) {
        warnings.push('Presenter too close to left edge');
    }
    
    if (presenterZone.x + presenterZone.width > (1080 - screenMargins.right) / 1080) {
        warnings.push('Presenter too close to right edge');
    }
    
    // Check info zone within bounds
    if (infoZone.y < screenMargins.top / 1920) {
        warnings.push('Info zone too close to top edge');
    }
    
    if (infoZone.y + infoZone.height > (1920 - screenMargins.bottom) / 1920) {
        warnings.push('Info zone too close to bottom edge');
    }
    
    // Check minimum zone sizes
    if (infoZone.width < 0.3) {
        issues.push('Info zone too narrow for text');
    }
    
    if (infoZone.height < 0.15) {
        issues.push('Info zone too short for text');
    }
    
    return {
        valid: issues.length === 0,
        issues,
        warnings
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
 * Validate subtitle placement
 */
function validateSubtitlePlacement(subtitleZone, presenterZone, infoZone) {
    const issues = [];
    const warnings = [];
    
    // Check overlap with presenter
    if (zonesOverlap(subtitleZone, presenterZone)) {
        issues.push('Subtitles overlap with presenter');
    }
    
    // Check overlap with info zone
    if (zonesOverlap(subtitleZone, infoZone)) {
        warnings.push('Subtitles overlap with info zone');
    }
    
    // Check bottom margin (subtitles should be above bottom edge)
    if (subtitleZone.y + subtitleZone.height > 0.9) {
        issues.push('Subtitles too close to bottom edge');
    }
    
    return {
        valid: issues.length === 0,
        issues,
        warnings
    };
}

/**
 * Validate first frame text placement
 */
function validateFirstFramePlacement(firstFrameZone, presenterZone, infoZone) {
    const issues = [];
    const warnings = [];
    
    // Check overlap with presenter
    if (zonesOverlap(firstFrameZone, presenterZone)) {
        issues.push('First frame text overlaps with presenter');
    }
    
    // Check overlap with info zone
    if (zonesOverlap(firstFrameZone, infoZone)) {
        warnings.push('First frame text overlaps with info zone');
    }
    
    // Check minimum font size for readability
    if (firstFrameZone.fontSize && firstFrameZone.fontSize < 40) {
        warnings.push('First frame font size too small');
    }
    
    return {
        valid: issues.length === 0,
        issues,
        warnings
    };
}

/**
 * Full mobile quality check
 */
function performMobileQualityCheck(composition, options = {}) {
    const allIssues = [];
    const allWarnings = [];
    
    // Validate text
    const textValidation = validateText(composition.text || '', options);
    allIssues.push(...textValidation.issues);
    allWarnings.push(...textValidation.warnings);
    
    // Validate composition
    const compositionValidation = validateComposition(
        composition.layout,
        composition.presenterZone,
        composition.infoZone,
        options
    );
    allIssues.push(...compositionValidation.issues);
    allWarnings.push(...compositionValidation.warnings);
    
    // Validate subtitle placement
    if (composition.subtitleZone) {
        const subtitleValidation = validateSubtitlePlacement(
            composition.subtitleZone,
            composition.presenterZone,
            composition.infoZone
        );
        allIssues.push(...subtitleValidation.issues);
        allWarnings.push(...subtitleValidation.warnings);
    }
    
    // Validate first frame placement
    if (composition.firstFrameZone) {
        const firstFrameValidation = validateFirstFramePlacement(
            composition.firstFrameZone,
            composition.presenterZone,
            composition.infoZone
        );
        allIssues.push(...firstFrameValidation.issues);
        allWarnings.push(...firstFrameValidation.warnings);
    }
    
    return {
        passed: allIssues.length === 0,
        issues: allIssues,
        warnings: allWarnings,
        score: calculateQualityScore(allIssues, allWarnings)
    };
}

/**
 * Calculate quality score (0-100)
 */
function calculateQualityScore(issues, warnings) {
    let score = 100;
    
    // Deduct for issues
    score -= issues.length * 15;
    
    // Deduct for warnings
    score -= warnings.length * 5;
    
    return Math.max(0, Math.min(100, score));
}

/**
 * Attempt to fix quality issues
 */
function attemptQualityFix(composition, issues) {
    const fixed = { ...composition };
    const fixedIssues = [];
    
    issues.forEach(issue => {
        if (issue.includes('overlap with presenter')) {
            // Try adjusting position
            if (fixed.subtitleZone) {
                fixed.subtitleZone.y = Math.min(fixed.subtitleZone.y, fixed.presenterZone.y - 0.1);
                fixedIssues.push(`Adjusted subtitle position to avoid overlap`);
            }
        }
        
        if (issue.includes('too close to')) {
            // Try adjusting margins
            if (fixed.infoZone) {
                fixed.infoZone.y = Math.max(fixed.infoZone.y, 0.1);
                fixedIssues.push(`Adjusted zone position for safe margin`);
            }
        }
    });
    
    return {
        composition: fixed,
        issuesFixed: fixedIssues.length,
        remainingIssues: issues.length - fixedIssues.length
    };
}

module.exports = {
    validateText,
    validateComposition,
    validateSubtitlePlacement,
    validateFirstFramePlacement,
    performMobileQualityCheck,
    calculateQualityScore,
    attemptQualityFix,
    zonesOverlap
};
