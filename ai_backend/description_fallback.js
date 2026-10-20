'use strict';

const HTML_ENTITY_MAP = Object.freeze({
    '&nbsp;': ' ',
    '&#160;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
});

function decodeEntities(value) {
    return String(value || '').replace(/&(?:nbsp|amp|quot|apos|lt|gt|#(?:\d{1,7}|x[\da-f]{1,6}));/gi, (entity) => {
        const named = HTML_ENTITY_MAP[entity.toLowerCase()];
        if (named !== undefined) return named;

        const numeric = /^&#(x[\da-f]+|\d+);$/i.exec(entity);
        if (!numeric) return entity;
        const codePoint = numeric[1][0].toLowerCase() === 'x'
            ? parseInt(numeric[1].slice(1), 16)
            : parseInt(numeric[1], 10);
        if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
            return entity;
        }
        return String.fromCodePoint(codePoint);
    });
}

function plainText(value) {
    return decodeEntities(String(value || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ')
        .replace(/<!--([\s\S]*?)-->/g, ' ')
        .replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function trimSummary(value, maxLength = 360) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
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
    return trimSummary(plainText(html), maxLength);
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
    // LONG-FORM policy: descriptions detailed aur SEO-rich (post+org+vacancies+
    // qualification+fees+dates). Meta tag frontend par 160 chars par trim hota
    // hai, isliye yahan lamba description SEO-safe hai.
    const maxLength = Number(options.maxLength) || 600;
    const preferred = trimSummary(plainText(options.preferred), maxLength);
    if (preferred.length >= 30) return preferred;

    const metaDescription = trimSummary(plainText(options.metaDescription), maxLength);
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
    const summary = trimSummary(plainText(options.summary || options.description || options.shortInfo), 700);
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

    const primaryLink = kind === 'fast_track'
        ? (options.officialSourceUrl || options.originalLink || options.directLink)
        : (options.applyLink || options.directLink);
    const primaryLinkLabel = kind === 'fast_track'
        ? (options.officialSourceUrl ? 'Verified official source' : 'Original source page — verify official notice')
        : 'Apply / Official link';
    const officialLinks = [
        [primaryLinkLabel, primaryLink],
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

    // Fact-driven detail sections — sirf maujood facts se (koi invention nahi).
    // Isse fallback drafts bhi khaali-khaali nahi lagte aur reviewer ko context milta hai.
    const fact = (key) => plainText(options[key]);
    const detailSections = [];
    if (kind === 'job') {
        const startDate = fact('startDate');
        const lastDate = fact('lastDate');
        if (startDate || lastDate) {
            detailSections.push(
                '<h2>Important dates</h2>',
                `<p>${[
                    startDate ? `Application start: <strong>${escapeHtml(startDate)}</strong>` : '',
                    lastDate ? `Last date: <strong>${escapeHtml(lastDate)}</strong>` : '',
                ].filter(Boolean).join(' · ')}. Last date se pehle form bhar lein; aakhri din server slow ho sakta hai.</p>`
            );
        }
        const feeParts = [
            ['General / OBC / EWS', fact('feeGen') || fact('feeOBC')],
            ['SC / ST / Female', fact('feeSCST') || fact('feeFemale')],
        ].filter(([, value]) => value);
        if (feeParts.length || fact('applicationFee')) {
            detailSections.push(
                '<h2>Application fee</h2>',
                `<p>${feeParts.map(([label, value]) => `${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong>`).join(' · ')}${fact('applicationFee') ? `. ${escapeHtml(fact('applicationFee'))}` : ''}</p>`
            );
        }
        const qualification = fact('qualification');
        const ageLimit = fact('ageLimit') || fact('minAge');
        if (qualification || ageLimit) {
            detailSections.push(
                '<h2>Eligibility and age limit</h2>',
                `<p>${[
                    qualification ? `Qualification: <strong>${escapeHtml(qualification)}</strong>` : '',
                    ageLimit ? `Age limit: <strong>${escapeHtml(ageLimit)}</strong>` : '',
                ].filter(Boolean).join(' · ')}. Category-wise relaxation aur exact cut-off date official notification me dekhein.</p>`
            );
        }
        const vacancies = fact('vacancies');
        const salary = fact('salary');
        const selectionProcess = fact('selectionProcess');
        if (vacancies || salary || selectionProcess) {
            detailSections.push(
                '<h2>Vacancy, salary and selection</h2>',
                `<p>${[
                    vacancies ? `Total vacancies: <strong>${escapeHtml(vacancies)}</strong>` : '',
                    salary ? `Salary: <strong>${escapeHtml(salary)}</strong>` : '',
                    selectionProcess ? `Selection: <strong>${escapeHtml(selectionProcess)}</strong>` : '',
                ].filter(Boolean).join(' · ')}</p>`
            );
        }
        // Fact-only mini FAQ — har sawal ka jawab upar wale extracted facts me hai.
        const faqPairs = [
            lastDate ? [`${title} ki last date kya hai?`, `Official details ke anusaar aavedan ki antim tithi ${lastDate} hai.`] : null,
            feeParts.length ? ['Application fee kitni hai?', feeParts.map(([label, value]) => `${label} ke liye ${value}`).join(', ') + '.'] : null,
            qualification ? ['Kaun apply kar sakta hai?', `Eligibility: ${qualification}. Poori shartein notification me dekhein.`] : null,
            ageLimit ? ['Age limit kya hai?', `Age limit ${ageLimit} hai; cut-off date notification me verify karein.`] : null,
            vacancies ? ['Kitne pad hain?', `Kul ${vacancies} pad bhare jane hain.`] : null,
            salary ? ['Salary kitni milegi?', `Salary ${salary} hai.`] : null,
        ].filter(Boolean).slice(0, 6);
        if (faqPairs.length) {
            detailSections.push(
                '<h2>FAQs</h2>',
                faqPairs.map(([q, a]) => `<p><strong>${escapeHtml(q)}</strong><br>${escapeHtml(a)}</p>`).join('\n')
            );
        }
    }

    return [
        `<p>${intro}</p>`,
        summaryHtml,
        detailsHtml,
        ...detailSections,
        '<h2>What to verify</h2>',
        '<ul><li>Post ka naam, advt number aur organization official notice se match karein.</li><li>Start date, last date aur fees notice me confirm karein.</li><li>Eligibility, age cut-off aur selection stages notice me padhein.</li><li>Missing information ko assume na karein; official notice hi final maana jana chahiye.</li></ul>',
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
