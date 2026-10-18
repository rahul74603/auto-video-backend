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
        .replace(/\nLINKS:[\s\S]*$/i, '')
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

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function htmlWordCount(html) {
    return plainText(html).split(/\s+/).filter(Boolean).length;
}

/**
 * Last-resort draft article: use only extracted facts and official URLs already
 * present on the draft. It deliberately avoids inventing dates, eligibility,
 * result status, vacancies, or steps when Gemini returns empty/blocked output.
 */
function buildFallbackArticleHtml(options = {}) {
    const title = plainText(options.title);
    if (!title) return '';

    const kind = options.kind === 'fast_track' ? 'fast_track' : 'job';
    const organization = plainText(options.organization || options.org);
    const category = plainText(options.category);
    const summary = trimSummary(options.summary || options.description || options.shortInfo, 700);
    const linkEntries = kind === 'job'
        ? [
            ['Organization', organization],
            ['Post / update', title],
            ['Advertisement number', options.advtNo],
            ['Vacancies', options.vacancies],
            ['Application start date', options.startDate],
            ['Last date', options.lastDate],
            ['Qualification', options.qualification],
            ['Age limit', options.ageLimit || options.minAge],
            ['Salary', options.salary],
            ['Location', options.location],
            ['Selection process', options.selectionProcess],
        ]
        : [
            ['Organization', organization],
            ['Update type', category],
            ['Update date', options.updateDate],
        ];
    const rows = linkEntries
        .filter(([, value]) => plainText(value))
        .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(plainText(value))}</td></tr>`)
        .join('');

    const officialLinks = [
        ['Apply / Official link', options.applyLink || options.directLink],
        ['Notification', options.notificationLink],
        ['Official website', options.officialSiteLink],
    ].filter(([, value]) => /^https:\/\//i.test(String(value || '').trim()));
    const linksHtml = officialLinks.length
        ? `<ul>${officialLinks.map(([label, url]) => `<li><a href="${escapeHtml(String(url).trim())}">${escapeHtml(label)}</a></li>`).join('')}</ul>`
        : '<p>Official link is not available in the extracted draft. Open the original source and verify the official notice before acting.</p>';

    const intro = kind === 'job'
        ? `${escapeHtml(title)} ke liye available extracted details neeche diye gaye hain. Application status, eligibility aur final dates ko apply karne se pehle official notification se verify karein.`
        : `${escapeHtml(title)} se sambandhit ${escapeHtml(category || 'Fast Track')} update ka draft neeche available extracted information dikhata hai. Exact status aur agle steps official source par verify karein.`;
    const summaryHtml = summary ? `<p>${escapeHtml(summary)}</p>` : '';
    const detailsHtml = rows
        ? `<h2>Available details</h2><table><tbody>${rows}</tbody></table>`
        : '<p>Is draft me abhi title ke alawa verified details extract nahi hui hain.</p>';

    return [
        `<p>${intro}</p>`,
        summaryHtml,
        detailsHtml,
        '<h2>What to verify</h2>',
        '<p>Source notice ko kholkar naam, dates, eligibility aur instructions ko carefully match karein. Missing information ko assume na karein; official notice hi final maana jana chahiye.</p>',
        '<h2>Official links</h2>',
        linksHtml,
    ].filter(Boolean).join('\n');
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
        const missingArticle = isBlankDescription(data.articleHtml);
        if (!missingDescription && !missingShortInfo && !missingArticle) continue;

        const articleHtml = missingArticle ? buildFallbackArticleHtml({
            ...data,
            kind,
            summary: data.description || data.shortInfo,
            organization: data.organization || data.org,
        }) : data.articleHtml;
        const description = buildDescription({
            preferred: data.shortInfo || data.description,
            metaDescription: data.metaDescription,
            articleHtml,
            title: data.title,
            organization: data.organization || data.org,
            category: data.category,
            updateDate: data.updateDate,
            vacancies: data.vacancies,
            lastDate: data.lastDate,
            qualification: data.qualification,
            kind,
        });
        if (!description && !articleHtml) continue;

        const patch = {};
        if (missingDescription && description) patch.description = description;
        if (missingShortInfo && description) patch.shortInfo = description;
        if (missingArticle && articleHtml) patch.articleHtml = articleHtml;
        if (Object.keys(patch).length === 0) continue;
        await doc.ref.update(patch);
        updated += 1;
    }

    if (updated) logger(`Filled missing description/article content in ${updated} pending ${collectionName} draft(s); published content untouched.`);
    return updated;
}

module.exports = {
    escapeHtml,
    htmlWordCount,
    buildFallbackArticleHtml,
    plainText,
    trimSummary,
    summaryFromHtml,
    summaryFromSource,
    buildDescription,
    isBlankDescription,
    backfillDraftDescriptions,
};
