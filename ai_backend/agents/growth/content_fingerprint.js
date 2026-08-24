'use strict';

/**
 * content_fingerprint.js — Duplicate detection (Phase 3)
 * 
 * Creates normalized fingerprints for content to detect:
 * - EXACT_DUPLICATE
 * - NEAR_DUPLICATE
 * - RELATED_CONTENT
 * - NEW_CONTENT
 */

const crypto = require('crypto');

function normalizeText(text) {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractKeyPhrases(text) {
    if (!text) return [];
    const normalized = normalizeText(text);
    const words = normalized.split(/\s+/).filter(w => w.length > 2);
    // Remove common Hindi/English stopwords
    const stopwords = new Set([
        'hai', 'hai.', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'ne', 'ye', 'woh',
        'aur', 'par', 'tak', 'bin', 'bhi', 'nahi', 'ye', 'kya', 'how', 'the',
        'for', 'and', 'you', 'your', 'that', 'this', 'with', 'not', 'are',
        'was', 'were', 'been', 'has', 'had', 'but', 'can', 'all', 'will',
        'job', 'jobs', 'new', 'latest', 'notification', 'vacancy', 'notice',
        'last', 'date', 'apply', 'online', 'official', 'website'
    ]);
    return words.filter(w => !stopwords.has(w) && w.length > 2).slice(0, 30);
}

function createFingerprint(content) {
    const {
        title = '',
        topic = '',
        organization = '',
        category = '',
        vacancies = '',
        lastDate = '',
        startDate = ''
    } = content || {};

    const normalizedTitle = normalizeText(title);
    const normalizedTopic = normalizeText(topic);
    const keyPhrases = extractKeyPhrases(`${title} ${topic} ${organization}`);
    
    const canonical = [
        normalizedTitle,
        normalizedTopic,
        normalizeText(organization),
        String(category).toLowerCase(),
        String(vacancies),
        String(lastDate),
        String(startDate),
        keyPhrases.sort().join('|')
    ].join('||');

    const hash = crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 16);

    return {
        hash,
        normalizedTitle,
        normalizedTopic,
        organization: normalizeText(organization),
        category: String(category).toLowerCase(),
        keyPhrases,
        canonical
    };
}

function compareFingerprints(fp1, fp2) {
    if (!fp1 || !fp2) return { type: 'UNKNOWN', score: 0 };

    if (fp1.hash === fp2.hash) {
        return { type: 'EXACT_DUPLICATE', score: 1.0 };
    }

    // Check title similarity
    const titleSim = jaccardSimilarity(
        new Set(fp1.normalizedTitle.split(/\s+/)),
        new Set(fp2.normalizedTitle.split(/\s+/))
    );

    // Check key phrase overlap
    const phraseSim = jaccardSimilarity(
        new Set(fp1.keyPhrases),
        new Set(fp2.keyPhrases)
    );

    // Same organization + similar topic = related
    const orgMatch = fp1.organization && fp2.organization && fp1.organization === fp2.organization;
    const catMatch = fp1.category && fp2.category && fp1.category === fp2.category;

    const combinedScore = (titleSim * 0.4) + (phraseSim * 0.4) + (orgMatch ? 0.1 : 0) + (catMatch ? 0.1 : 0);

    if (combinedScore >= 0.8) {
        return { type: 'NEAR_DUPLICATE', score: combinedScore };
    }
    if (combinedScore >= 0.4) {
        return { type: 'RELATED_CONTENT', score: combinedScore };
    }
    return { type: 'NEW_CONTENT', score: combinedScore };
}

function jaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 0;
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
}

async function checkDuplicate(db, content, collection = 'content_fingerprints') {
    const fp = createFingerprint(content);
    
    if (!db) {
        return { fingerprint: fp, duplicate: false, type: 'NEW_CONTENT', score: 0 };
    }

    try {
        const snap = await db.collection(collection)
            .where('hash', '==', fp.hash)
            .limit(1)
            .get();
        
        if (!snap.empty) {
            const existing = snap.docs[0].data();
            return {
                fingerprint: fp,
                duplicate: true,
                type: 'EXACT_DUPLICATE',
                score: 1.0,
                existingId: snap.docs[0].id,
                existingData: existing
            };
        }

        // Check near duplicates via key phrases
        const recent = await db.collection(collection)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        for (const doc of recent.docs) {
            const existing = doc.data();
            if (!existing.keyPhrases || !existing.keyPhrases.length) continue;
            
            const existingFp = {
                hash: existing.hash,
                normalizedTitle: existing.normalizedTitle || '',
                keyPhrases: existing.keyPhrases || [],
                organization: existing.organization || '',
                category: existing.category || ''
            };

            const comparison = compareFingerprints(fp, existingFp);
            if (comparison.type === 'NEAR_DUPLICATE') {
                return {
                    fingerprint: fp,
                    duplicate: true,
                    type: comparison.type,
                    score: comparison.score,
                    existingId: doc.id,
                    existingData: existing
                };
            }
        }

        return { fingerprint: fp, duplicate: false, type: 'NEW_CONTENT', score: 0 };
    } catch (err) {
        // Firestore unavailable — allow content through, log warning
        console.log(`⚠️ fingerprint check failed: ${err.message || err}`);
        return { fingerprint: fp, duplicate: false, type: 'NEW_CONTENT', score: 0, error: true };
    }
}

async function storeFingerprint(db, content, contentId, collection = 'content_fingerprints') {
    const fp = createFingerprint(content);
    if (!db) return fp;

    try {
        await db.collection(collection).doc(contentId || fp.hash).set({
            hash: fp.hash,
            normalizedTitle: fp.normalizedTitle,
            normalizedTopic: fp.normalizedTopic,
            organization: fp.organization,
            category: fp.category,
            keyPhrases: fp.keyPhrases,
            contentId: contentId || '',
            createdAt: Date.now()
        }, { merge: true });
    } catch (err) {
        console.log(`⚠️ fingerprint store failed: ${err.message || err}`);
    }
    return fp;
}

module.exports = {
    normalizeText,
    extractKeyPhrases,
    createFingerprint,
    compareFingerprints,
    jaccardSimilarity,
    checkDuplicate,
    storeFingerprint
};
