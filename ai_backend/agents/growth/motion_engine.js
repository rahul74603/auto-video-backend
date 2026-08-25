'use strict';

/**
 * motion_engine.js — Controlled Motion Engine
 * 
 * Adds subtle, controlled motion to AI-generated images to prevent
 * static, lifeless visuals.
 * 
 * Motion types:
 * 1. Slow zoom in/out
 * 2. Gentle pan (horizontal/vertical)
 * 3. Subtle scale animation
 * 4. Scene transition
 * 
 * Rules:
 * - Motion must support readability
 * - Never distract from text
 * - Avoid excessive effects
 * - Match motion to content urgency
 * - Maintain professional feel
 */

const MOTION_PROFILES = {
    'slow_zoom_in': {
        name: 'Slow Zoom In',
        description: 'Gentle zoom toward center',
        ffmpegFilter: 'zoompan=z=\'min(zoom+0.001,1.5)\':d=1:s=1080x1920:fps=30',
        intensity: 'low',
        bestFor: ['JOB', 'EDUCATIONAL', 'FAQ'],
        duration: 'full',
        readability: 'high'
    },
    
    'slow_zoom_out': {
        name: 'Slow Zoom Out',
        description: 'Gentle zoom away from center',
        ffmpegFilter: 'zoompan=z=\'max(zoom-0.001,1.0)\':d=1:s=1080x1920:fps=30',
        intensity: 'low',
        bestFor: ['JOB', 'ADMIT_CARD', 'RESULT'],
        duration: 'full',
        readability: 'high'
    },
    
    'gentle_pan_right': {
        name: 'Gentle Pan Right',
        description: 'Slow horizontal movement',
        ffmpegFilter: 'crop=iw*0.9:ih*0.9,pan=1080:1920:0:0',
        intensity: 'low',
        bestFor: ['JOB', 'UPSC', 'ENGINEERING'],
        duration: 'full',
        readability: 'high'
    },
    
    'gentle_pan_up': {
        name: 'Gentle Pan Up',
        description: 'Slow vertical movement',
        ffmpegFilter: 'crop=iw*0.9:ih*0.9,pan=1080:1920:0:ih*0.1',
        intensity: 'low',
        bestFor: ['JOB', 'DEFENCE', 'POLICE'],
        duration: 'full',
        readability: 'high'
    },
    
    'subtle_scale': {
        name: 'Subtle Scale',
        description: 'Minimal size variation',
        ffmpegFilter: 'scale=iw*1.02:ih*1.02,setsar=1',
        intensity: 'very_low',
        bestFor: ['ALL'],
        duration: 'full',
        readability: 'very_high'
    },
    
    'kinetic_opening': {
        name: 'Kinetic Opening',
        description: 'Dynamic start, then stable',
        ffmpegFilter: 'zoompan=z=\'if(lt(on,90),1+0.01*on,1.9)\':d=1:s=1080x1920:fps=30',
        intensity: 'medium',
        bestFor: ['BREAKING', 'RESULT', 'ADMIT_CARD'],
        duration: 'opening_only',
        readability: 'medium'
    },
    
    'static_safe': {
        name: 'Static Safe',
        description: 'No motion, maximum readability',
        ffmpegFilter: null,
        intensity: 'none',
        bestFor: ['FAQ', 'EDUCATIONAL', 'DOCUMENT_HEAVY'],
        duration: 'full',
        readability: 'maximum'
    }
};

/**
 * Select appropriate motion profile
 */
function selectMotionProfile(contentType, urgencyLevel, hasText = true) {
    // For breaking/urgent content, use more dynamic motion
    if (urgencyLevel === 'high' || contentType === 'BREAKING') {
        const profiles = ['kinetic_opening', 'slow_zoom_in'];
        const randomIndex = Math.floor(Math.random() * profiles.length);
        return MOTION_PROFILES[profiles[randomIndex]];
    }
    
    // For content with lots of text, use minimal motion
    if (hasText && (contentType === 'FAQ' || contentType === 'EDUCATIONAL')) {
        return MOTION_PROFILES['static_safe'];
    }
    
    // For normal content, use subtle motion
    const normalProfiles = [
        'slow_zoom_in',
        'slow_zoom_out',
        'gentle_pan_right',
        'gentle_pan_up',
        'subtle_scale'
    ];
    
    const randomIndex = Math.floor(Math.random() * normalProfiles.length);
    return MOTION_PROFILES[normalProfiles[randomIndex]];
}

/**
 * Generate FFmpeg filter chain with motion
 */
function generateMotionFilter(motionProfile, options = {}) {
    const {
        imageDuration = 5, // seconds
        fadeTransition = true
    } = options;
    
    let filters = [];
    
    // Add motion filter if exists
    if (motionProfile.ffmpegFilter) {
        filters.push(motionProfile.ffmpegFilter);
    }
    
    // Add fade transition if requested
    if (fadeTransition) {
        const fadeIn = 'fade=t=in:st=0:d=0.5';
        const fadeOut = `fade=t=out:st=${imageDuration - 0.5}:d=0.5`;
        filters.push(`${fadeIn},${fadeOut}`);
    }
    
    return filters.join(',');
}

/**
 * Calculate motion intensity score (0-10)
 */
function getMotionIntensityScore(motionProfile) {
    const intensityMap = {
        'none': 0,
        'very_low': 2,
        'low': 4,
        'medium': 6,
        'high': 8,
        'very_high': 10
    };
    
    return intensityMap[motionProfile.intensity] || 0;
}

/**
 * Check if motion is safe for text readability
 */
function isMotionSafeForText(motionProfile, textDensity = 'medium') {
    // High text density needs minimal motion
    if (textDensity === 'high' && motionProfile.intensity !== 'none' && motionProfile.intensity !== 'very_low') {
        return false;
    }
    
    // All motions are safe for low text density
    return true;
}

/**
 * Get motion recommendation based on content
 */
function getMotionRecommendation(contentData) {
    const {
        contentType,
        hasAIImage,
        textDensity,
        urgencyLevel
    } = contentData;
    
    // If no AI image, no motion needed
    if (!hasAIImage) {
        return {
            profile: MOTION_PROFILES['static_safe'],
            reason: 'No AI image - using static'
        };
    }
    
    // Select profile
    const profile = selectMotionProfile(contentType, urgencyLevel, textDensity !== 'low');
    
    // Check safety
    const isSafe = isMotionSafeForText(profile, textDensity);
    
    if (!isSafe) {
        return {
            profile: MOTION_PROFILES['static_safe'],
            reason: 'Motion unsafe for text density - using static'
        };
    }
    
    return {
        profile,
        reason: `Selected ${profile.name} for ${contentType}`,
        intensity: getMotionIntensityScore(profile)
    };
}

module.exports = {
    MOTION_PROFILES,
    selectMotionProfile,
    generateMotionFilter,
    getMotionIntensityScore,
    isMotionSafeForText,
    getMotionRecommendation
};
