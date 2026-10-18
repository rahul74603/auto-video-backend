'use strict';

function decodeEntities(value) {
    return String(value || '')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function plainText(value) {
    return decodeEntities(String(value || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--([\s\S]*?)-->/g, ' ')
        .replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function trimSummary(value, maxLength = 360) {
    const text = plainText(value);
    if (text.length <= maxLength) return text;
    const cutoff = text.lastIndexOf(' ', maxLength - 1);
    return `${text.slice(0, cutoff > 80 ? cutoff : maxLength).trim()}…`;
}

function summaryFromHtml(html, maxLength = 360) {
    const paragraphs = [...String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((match) => plainText(match[1]))
        .filter((paragraph) => paragraph.length >= 25);
    const fromParagraphs = trimSummary(paragraphs.slice(0, 2).join(' '), maxLength);
    if (fromParagraphs) return fromParagraphs;
    return trimSummary(html, maxLength);
}

function summaryFromSource(sourceText, maxLength = 360) {
    const cleaned = String(sourceText || '')
        .replace(/^SOURCE_PUBLISHED_AT:[^\n]*\n?/im, '')
        .replace(/^(TABLES|CONTENT):\s*/gim, '')
        .replace(/^---[^\n]*---\s*/gm, ' ');
    const text = plainText(cleaned);
    if (!text) return '';
    const sentences = text.match(/[^.!?।]+[.!?।]?/g) || [text];
    const useful = sentences.map((part) => part.trim()).filter((part) => part.length >= 20).slice(0, 2).join(' ');
    return trimSummary(useful || text, maxLength);
}

function fallbackFromFacts({ title, organization, category, updateDate, vacancies, lastDate, qualification, kind }) {
    const safeTitle = plainText(title);
    if (!safeTitle) return '';
    if (kind === 'fast_track') {
        const org = plainText(organization);
        const update = plainText(category);
        const date = plainText(updateDate);
        const context = [org, update, date].filter(Boolean).join(' · ');
        return trimSummary(`${safeTitle} se judi ${context ? `${context} ki ` : ''}latest update. Official source par poori jankari aur agle steps verify karein.`);
    }
    const details = [
        organization ? `Organization: ${plainText(organization)}` : '',
        vacancies ? `Vacancies: ${plainText(vacancies)}` : '',
        lastDate ? `Last date: ${plainText(lastDate)}` : '',
        qualification ? `Qualification: ${plainText(qualification)}` : ''
    ].filter(Boolean).join(' · ');
    return trimSummary(`${safeTitle} se judi job notification. ${details ? `${details}. ` : ''}Apply karne se pehle official notification me eligibility aur dates verify karein.`);
}

function buildDescription(options = {}) {
    const maxLength = Number(options.maxLength) || 360;
    const preferred = trimSummary(options.preferred, maxLength);
    if (preferred.length >= 30) return preferred;

    const metaDescription = trimSummary(options.metaDescription, maxLength);
    if (metaDescription.length >= 30) return metaDescription;

    const articleSummary = summaryFromHtml(options.articleHtml, maxLength);
    if (articleSummary.length >= 30) return articleSummary;

    const sourceSummary = summaryFromSource(options.sourceText, maxLength);
    if (sourceSummary.length >= 30) return sourceSummary;

    return fallbackFromFacts({ ...options, kind: options.kind || 'job' });
}

function isBlankDescription(value) {
    return plainText(value).length === 0;
}

/** Gap-fill only pending records; published content is deliberately excluded. */
async function backfillDraftDescriptions({
    db,
    collectionName,
    allowedStatuses,
    kind,
    maxDocs = 100,
    logger = () => {},
}) {
    if (!db || !collectionName) return 0;
    const snapshot = await db.collection(collectionName)
        .orderBy('createdAt', 'desc')
        .limit(maxDocs)
        .get();
    let updated = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data() || {};
        if (!allowedStatuses.includes(String(data.status || '').toLowerCase())) continue;
        const missingDescription = isBlankDescription(data.description);
        const missingShortInfo = kind === 'fast_track' && isBlankDescription(data.shortInfo);
        if (!missingDescription && !missingShortInfo) continue;

        const description = buildDescription({
            preferred: data.shortInfo || data.description,
            metaDescription: data.metaDescription,
            articleHtml: data.articleHtml,
            title: data.title,
            organization: data.organization || data.org,
            category: data.category,
            updateDate: data.updateDate,
            vacancies: data.vacancies,
            lastDate: data.lastDate,
            qualification: data.qualification,
            kind,
        });
        if (!description) continue;

        const patch = {};
        if (missingDescription) patch.description = description;
        if (missingShortInfo) patch.shortInfo = description;
        await doc.ref.update(patch);
        updated += 1;
    }

    if (updated) logger(`📝 Filled missing descriptions in ${updated} pending ${collectionName} draft(s); published content untouched.`);
    return updated;
}

module.exports = {
    plainText,
    trimSummary,
    summaryFromHtml,
    summaryFromSource,
    buildDescription,
    isBlankDescription,
    backfillDraftDescriptions,
};
