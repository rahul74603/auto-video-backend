'use strict';

/**
 * subtitle_engine.js — Dynamic Subtitle Engine (Phase 13)
 * 
 * Generates subtitle timing data with keyword highlighting.
 * Supports Hindi, English, Hinglish.
 */

function generateSubtitles(script, opts = {}) {
    if (!script || !script.sections) {
        return { subtitles: [], highlights: [] };
    }

    const fullText = script.script || '';
    const words = fullText.split(/\s+/);
    const wordsPerSecond = opts.wordsPerSecond || 3.5; // Hindi default
    const subtitles = [];
    const highlights = [];
    
    let currentTime = 0;
    let sentenceBuffer = [];

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        sentenceBuffer.push(word);

        // Create subtitle chunk at sentence boundaries or every ~5 words
        const isEnd = /[।.!?\n]/.test(word) || sentenceBuffer.length >= 5 || i === words.length - 1;
        
        if (isEnd && sentenceBuffer.length > 0) {
            const text = sentenceBuffer.join(' ').replace(/[।.!?\n]/g, '').trim();
            const duration = Math.max(0.8, sentenceBuffer.length / wordsPerSecond);
            
            if (text.length > 0) {
                const sub = {
                    startTime: Math.round(currentTime * 100) / 100,
                    endTime: Math.round((currentTime + duration) * 100) / 100,
                    text: text,
                    style: detectSubtitleStyle(text),
                    highlight: findHighlightedWords(text, opts.keywords || [])
                };
                subtitles.push(sub);

                // Track keyword highlights
                if (sub.highlight.length > 0) {
                    highlights.push({
                        time: sub.startTime,
                        words: sub.highlight,
                        style: 'emphasis'
                    });
                }
            }
            
            currentTime += duration;
            sentenceBuffer = [];
        }
    }

    return {
        subtitles,
        highlights,
        totalDuration: currentTime,
        format: 'srt',
        // SRT formatting
        toSRT: () => formatSRT(subtitles)
    };
}

function detectSubtitleStyle(text) {
    if (/\d+/.test(text)) return 'number_emphasis';
    if (/last date|deadline|urgent|जल्दी/i.test(text)) return 'urgency';
    if (/result|admit card|notification/i.test(text)) return 'important';
    return 'normal';
}

function findHighlightedWords(text, keywords) {
    const highlighted = [];
    const lower = text.toLowerCase();
    for (const kw of keywords) {
        if (lower.includes(String(kw).toLowerCase())) {
            highlighted.push(kw);
        }
    }
    // Auto-highlight numbers and important terms
    const numberMatches = text.match(/\d+\+?/g) || [];
    highlighted.push(...numberMatches);
    
    const importantTerms = ['PASS', 'POST', 'LAST DATE', 'RESULT', 'VACANCY', 'APPLY'];
    for (const term of importantTerms) {
        if (text.includes(term)) highlighted.push(term);
    }
    
    return [...new Set(highlighted)];
}

function formatSRT(subtitles) {
    return subtitles.map((sub, i) => {
        const start = formatSRTTime(sub.startTime);
        const end = formatSRTTime(sub.endTime);
        return `${i + 1}\n${start} --> ${end}\n${sub.text}\n`;
    }).join('\n');
}

function formatSRTTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(ms)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
function pad3(n) { return String(n).padStart(3, '0'); }

module.exports = {
    generateSubtitles,
    detectSubtitleStyle,
    findHighlightedWords,
    formatSRT,
    formatSRTTime
};
