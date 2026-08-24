'use strict';

/**
 * quality_gate.js — Content Quality Gate (Phase 4 & 30)
 * 
 * Before a video is rendered, checks that critical facts are present.
 * Prevents misinformation from being published.
 * 
 * Statuses: quality_pending, quality_passed, quality_failed, needs_review
 */

const flags = require('./feature_flags');

function checkQualityGate(content, opts = {}) {
    if (!flags.isEnabled('QUALITY_GATE_ENABLED')) {
        return { status: 'quality_passed', score: 50, checks: [], reason: 'quality gate disabled' };
    }

    const checks = [];
    let totalScore = 0;
    let maxScore = 0;

    // 1. Title check (critical)
    maxScore += 15;
    const title = String(content.title || '').trim();
    if (title.length >= 10) {
        checks.push({ name: 'title', status: 'pass', score: 15 });
        totalScore += 15;
    } else if (title.length > 0) {
        checks.push({ name: 'title', status: 'warn', score: 8, message: 'title too short' });
        totalScore += 8;
    } else {
        checks.push({ name: 'title', status: 'fail', score: 0, message: 'missing title' });
    }

    // 2. Organization check
    maxScore += 10;
    if (content.organization || content.org) {
        checks.push({ name: 'organization', status: 'pass', score: 10 });
        totalScore += 10;
    } else {
        checks.push({ name: 'organization', status: 'warn', score: 3, message: 'no organization' });
        totalScore += 3;
    }

    // 3. Vacancy count (important for job content)
    maxScore += 10;
    if (content.vacancies || content.totalVacancies) {
        checks.push({ name: 'vacancies', status: 'pass', score: 10 });
        totalScore += 10;
    } else {
        checks.push({ name: 'vacancies', status: 'warn', score: 2, message: 'no vacancy count' });
        totalScore += 2;
    }

    // 4. Dates check (at least one date present)
    maxScore += 15;
    const hasDates = content.lastDate || content.startDate || content.updateDate;
    if (hasDates) {
        checks.push({ name: 'dates', status: 'pass', score: 15 });
        totalScore += 15;
    } else {
        checks.push({ name: 'dates', status: 'warn', score: 5, message: 'no dates found' });
        totalScore += 5;
    }

    // 5. Source / official URL
    maxScore += 10;
    if (content.officialUrl || content.sourceUrl) {
        checks.push({ name: 'source', status: 'pass', score: 10 });
        totalScore += 10;
    } else {
        checks.push({ name: 'source', status: 'warn', score: 3, message: 'no official URL' });
        totalScore += 3;
    }

    // 6. Category present
    maxScore += 5;
    if (content.category) {
        checks.push({ name: 'category', status: 'pass', score: 5 });
        totalScore += 5;
    } else {
        checks.push({ name: 'category', status: 'warn', score: 1 });
        totalScore += 1;
    }

    // 7. Eligibility/Qualification
    maxScore += 10;
    if (content.qualification) {
        checks.push({ name: 'eligibility', status: 'pass', score: 10 });
        totalScore += 10;
    } else {
        checks.push({ name: 'eligibility', status: 'warn', score: 3, message: 'no eligibility info' });
        totalScore += 3;
    }

    // 8. Content freshness — check if dates are not in the past (for lastDate)
    maxScore += 10;
    if (content.lastDate) {
        const lastDateMs = Date.parse(content.lastDate);
        if (lastDateMs && lastDateMs > Date.now() - 7 * 24 * 60 * 60 * 1000) {
            checks.push({ name: 'freshness', status: 'pass', score: 10 });
            totalScore += 10;
        } else if (lastDateMs && lastDateMs > Date.now() - 30 * 24 * 60 * 60 * 1000) {
            checks.push({ name: 'freshness', status: 'warn', score: 5, message: 'last date approaching or past' });
            totalScore += 5;
        } else {
            checks.push({ name: 'freshness', status: 'fail', score: 0, message: 'expired content' });
        }
    } else {
        checks.push({ name: 'freshness', status: 'warn', score: 5 });
        totalScore += 5;
    }

    // 9. No misinformation indicators
    maxScore += 15;
    const titleLower = title.toLowerCase();
    const suspiciousPatterns = ['fake', 'hoax', 'scam', 'rumor'];
    const hasSuspicious = suspiciousPatterns.some(p => titleLower.includes(p));
    if (!hasSuspicious) {
        checks.push({ name: 'misinfo', status: 'pass', score: 15 });
        totalScore += 15;
    } else {
        checks.push({ name: 'misinfo', status: 'fail', score: 0, message: 'suspicious content detected' });
    }

    // Normalize to 0-100
    const normalizedScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    let status = 'quality_passed';
    const hasFailure = checks.some(c => c.status === 'fail');
    if (hasFailure) {
        status = normalizedScore >= 40 ? 'needs_review' : 'quality_failed';
    }

    return {
        status,
        score: normalizedScore,
        checks,
        passed: status === 'quality_passed',
        failedChecks: checks.filter(c => c.status === 'fail'),
        warnings: checks.filter(c => c.status === 'warn')
    };
}

module.exports = {
    checkQualityGate
};
