'use strict';

/**
 * music_engine.js — Music Profile Engine (Phase 14)
 * 
 * Optional background music profiles. Voice always remains understandable.
 * If no music exists, video renders successfully without it.
 */

const path = require('path');
const fs = require('fs');

const MUSIC_PROFILES = {
    breaking: { volume: 0.15, fade: 'quick', bpm: 120, mood: 'urgent' },
    news: { volume: 0.12, fade: 'smooth', bpm: 100, mood: 'informative' },
    education: { volume: 0.10, fade: 'gentle', bpm: 80, mood: 'calm' },
    motivation: { volume: 0.15, fade: 'build', bpm: 110, mood: 'inspiring' },
    result: { volume: 0.18, fade: 'quick', bpm: 130, mood: 'celebration' },
    exam: { volume: 0.10, fade: 'gentle', bpm: 90, mood: 'focus' }
};

// Existing bg_music files in the project
const AVAILABLE_MUSIC = {
    'news_theme': {
        file: 'bg_music/News Theme - Kevin MacLeod.mp3',
        profiles: ['news', 'breaking'],
        license: 'CC-BY'
    },
    'odd_news': {
        file: 'bg_music/Odd News - Twin Musicom.mp3',
        profiles: ['news', 'education'],
        license: 'CC-BY'
    }
};

function selectMusic(styleProfile, opts = {}) {
    const profileName = styleProfile?.musicProfile || 'news';
    const profile = MUSIC_PROFILES[profileName] || MUSIC_PROFILES.news;

    // Find available music file that matches the profile
    const basePath = opts.basePath || path.join(__dirname, '..', '..');
    let selectedFile = null;

    for (const [id, info] of Object.entries(AVAILABLE_MUSIC)) {
        if (info.profiles.includes(profileName)) {
            const fullPath = path.join(basePath, info.file);
            if (fs.existsSync(fullPath)) {
                selectedFile = { id, path: fullPath, info };
                break;
            }
        }
    }

    // Override from historical performance (legacy single-value path)
    if (opts.bestMusic) {
        return { profile, musicFile: opts.bestMusic, selected: true, reason: 'best performer' };
    }

    // 🧠 LEARNED POLICY: learned music winner (Phase 9). The winner must be
    // a real, on-disk music file — otherwise fall through to the safe
    // profile-based selection.
    const decision = opts.policyDecision;
    if (decision && decision.mode && decision.mode !== 'none' && decision.value) {
        const learnedId = String(decision.value);
        const info = AVAILABLE_MUSIC[learnedId];
        const fullPath = info ? path.join(basePath, info.file) : null;
        if (info && fullPath && fs.existsSync(fullPath)) {
            return {
                profile,
                profileName: info.profiles[0] || profileName,
                musicFile: fullPath,
                musicId: learnedId,
                selected: true,
                learningUsed: true,
                learningMode: decision.mode,
                exploration: decision.mode === 'explore',
                reason: decision.mode === 'exploit'
                    ? `learned best performer (policy ${decision.policyVersion}, confidence ${decision.confidence}, n=${decision.sampleSize})`
                    : `controlled exploration of music (policy ${decision.policyVersion})`
            };
        }
    }

    return {
        profile,
        profileName,
        musicFile: selectedFile?.path || null,
        musicId: selectedFile?.id || null,
        selected: !!selectedFile,
        reason: selectedFile ? `matched ${profileName} profile` : 'no music file available (video renders without music)'
    };
}

/**
 * FFmpeg audio ducking filter string.
 * Voice stays clear; music dips when voice is speaking.
 */
function getDuckingFilter(musicProfile) {
    const vol = musicProfile.volume || 0.12;
    return `volume=${vol},afade=t=in:st=0:d=1,afade=t=out:st=0:d=1`;
}

module.exports = {
    MUSIC_PROFILES,
    AVAILABLE_MUSIC,
    selectMusic,
    getDuckingFilter
};
