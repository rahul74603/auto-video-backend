'use strict';

/**
 * first_frame_engine.js — Dynamic First Frame Generation (Phase 12)
 * 
 * First frame communicates the topic immediately.
 * Only uses facts present in source content. Never invents numbers.
 */

function generateFirstFrame(content, opportunity, opts = {}) {
    const frames = [];

    // Extract verifiable facts only
    if (content.vacancies) {
        frames.push({
            text: `${content.vacancies} POSTS`,
            style: 'big_number',
            source: 'vacancies',
            score: 85
        });
    }

    if (content.lastDate) {
        const lastDateShort = formatDate(content.lastDate);
        if (lastDateShort) {
            frames.push({
                text: `LAST DATE ${lastDateShort}`,
                style: 'deadline',
                source: 'lastDate',
                score: 80
            });
        }
    }

    if (content.qualification) {
        const eduShort = shortenEducation(content.qualification);
        if (eduShort) {
            frames.push({
                text: `${eduShort} PASS`,
                style: 'eligibility',
                source: 'qualification',
                score: 75
            });
        }
    }

    if (content.organization) {
        frames.push({
            text: content.organization.toUpperCase().substring(0, 25),
            style: 'org_name',
            source: 'organization',
            score: 70
        });
    }

    if (opportunity?.category === 'RESULT') {
        frames.push({
            text: 'RESULT OUT',
            style: 'breaking',
            source: 'category',
            score: 90
        });
    }

    if (opportunity?.category === 'ADMIT_CARD') {
        frames.push({
            text: 'ADMIT CARD OUT',
            style: 'breaking',
            source: 'category',
            score: 88
        });
    }

    // Topic-based frame
    const topic = content.title || content.topic || '';
    if (topic) {
        const shortTopic = shortenTopic(topic);
        if (shortTopic) {
            frames.push({
                text: shortTopic,
                style: 'topic',
                source: 'topic',
                score: 65
            });
        }
    }

    // Sort by score
    frames.sort((a, b) => b.score - a.score);

    return {
        bestFrame: frames[0] || { text: 'STUDYGYAAN', style: 'default', score: 50 },
        allFrames: frames,
        firstFrameStyle: frames[0]?.style || 'default',
        firstFrameText: frames[0]?.text || 'STUDYGYAAN',
        firstFrameScore: frames[0]?.score || 50
    };
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr).substring(0, 12).toUpperCase();
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        return `${d.getDate()} ${months[d.getMonth()]}`;
    } catch {
        return String(dateStr).substring(0, 12).toUpperCase();
    }
}

function shortenEducation(qual) {
    const q = String(qual).toLowerCase();
    if (q.includes('10th') || q.includes('matric') || q.includes('10')) return '10वीं';
    if (q.includes('12th') || q.includes('inter') || q.includes('12')) return '12वीं';
    if (q.includes('graduate') || q.includes('graduation') || q.includes('ba') || q.includes('bsc') || q.includes('btech')) return 'GRADUATE';
    if (q.includes('iti')) return 'ITI';
    if (q.includes('diploma')) return 'DIPLOMA';
    if (q.includes('post') && q.includes('grad')) return 'POST GRAD';
    return '';
}

function shortenTopic(topic) {
    const words = String(topic).split(/\s+/).slice(0, 4).join(' ');
    if (words.length > 20) return words.substring(0, 20);
    return words || '';
}

module.exports = {
    generateFirstFrame,
    formatDate,
    shortenEducation,
    shortenTopic
};
