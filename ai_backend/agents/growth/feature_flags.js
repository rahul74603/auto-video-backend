'use strict';

/**
 * feature_flags.js — Growth Engine feature flags (Phase 46)
 * All flags have safe defaults. New features can be enabled via environment
 * variables without code changes. Flags can also be overridden by Firestore
 * system_settings/growth_flags document.
 */

const DEFAULTS = {
    GROWTH_ENGINE_ENABLED: true,
    ANALYTICS_ENABLED: true,
    AB_TESTING_ENABLED: false,
    TREND_ENGINE_ENABLED: false,
    BREAKING_MODE_ENABLED: true,
    COMMENT_INTELLIGENCE_ENABLED: false,
    HOOK_ENGINE_ENABLED: true,
    SCRIPT_ENGINE_ENABLED: true,
    QUALITY_GATE_ENABLED: true,
    VISUAL_ENGINE_ENABLED: true,
    MUSIC_ENGINE_ENABLED: true,
    PRESENTER_ROTATION_ENABLED: true,
    FIRST_FRAME_ENABLED: true,
    SUBTITLE_ENGINE_ENABLED: true,
    SUBTITLE_BURN_ENABLED: false,
    CONTENT_MUTATION_ENABLED: false,
    REACH_PREDICTION_ENABLED: true,
    LEARNER_ENABLED: true,
    RECOMMENDATION_ENGINE_ENABLED: true,
    DUPLICATE_DETECTION_ENABLED: true,
    CONTENT_CLUSTERING_ENABLED: true,
    
    // New enhancement flags
    AI_VISUAL_ENABLED: false,
    DYNAMIC_LAYOUT_ENABLED: true,
    VISUAL_FATIGUE_PREVENTION_ENABLED: true,
    DEADLINE_ENGINE_ENABLED: true,
    FAQ_ENGINE_ENABLED: true,
    CONTENT_ANGLE_ENGINE_ENABLED: true,
    MOBILE_QUALITY_GATE_ENABLED: true,
    CTA_ENGINE_ENABLED: true,
    MOTION_ENGINE_ENABLED: true,
    COST_CONTROL_ENABLED: true,
    CONTENT_SIMILARITY_ENABLED: true,
};

function envBool(key, fallback) {
    const raw = process.env[key];
    if (raw === undefined || raw === null || raw === '') return fallback;
    return raw === 'true' || raw === '1' || raw === 'yes';
}

let cachedFlags = null;
let cachedAt = 0;
const CACHE_TTL = 60 * 1000;

function getAllFlags() {
    const now = Date.now();
    if (cachedFlags && (now - cachedAt) < CACHE_TTL) return cachedFlags;

    const flags = {};
    for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
        flags[key] = envBool(key, defaultValue);
    }
    cachedFlags = flags;
    cachedAt = now;
    return flags;
}

function isEnabled(flagName) {
    const flags = getAllFlags();
    return flags[flagName] !== undefined ? flags[flagName] : false;
}

function invalidateCache() {
    cachedFlags = null;
    cachedAt = 0;
}

module.exports = {
    DEFAULTS,
    getAllFlags,
    isEnabled,
    envBool,
    invalidateCache
};
