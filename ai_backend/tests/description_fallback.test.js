'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildDescription,
    summaryFromHtml,
    buildFallbackArticleHtml,
    htmlWordCount,
    backfillDraftDescriptions,
} = require('../description_fallback');

test('keeps a valid generated description unchanged', () => {
    const summary = 'SSC has released the admit card. Candidates can download it from the official website.';
    assert.equal(buildDescription({ preferred: summary, title: 'SSC Admit Card', kind: 'fast_track' }), summary);
});

test('falls back to the first useful article paragraphs when the model summary is empty', () => {
    const html = '<h2>Update</h2><p>The board has released the admit card for registered candidates. Visit the official website to download it.</p><p>Check the exam instructions before the test.</p>';
    const summary = buildDescription({ preferred: '', articleHtml: html, title: 'Board Admit Card' });
    assert.match(summary, /board has released the admit card/i);
    assert.ok(summary.length >= 30);
    assert.ok(summary.length <= 360);
});

test('uses source text or a fact-only title fallback if article HTML is unavailable', () => {
    const fromSource = buildDescription({ sourceText: 'SOURCE_PUBLISHED_AT: 2026-10-18\nCONTENT:\nOfficial notice: applications close on 30 October 2026. Candidates should read the notification.' });
    assert.match(fromSource, /Official notice/i);
    const fromFacts = buildDescription({ title: 'State Board Result 2026', kind: 'fast_track', category: 'Result' });
    assert.match(fromFacts, /State Board Result 2026/);
    assert.ok(fromFacts.length >= 30);
});

test('HTML summary strips tags and decodes common entities', () => {
    const summary = summaryFromHtml('<p>Result &amp; merit list are available on the official website for candidates.</p>');
    assert.equal(summary, 'Result & merit list are available on the official website for candidates.');
});

test('fallback articles render only saved facts and safe links with honest labels', () => {
    const article = buildFallbackArticleHtml({
        kind: 'job',
        title: 'Board Assistant Recruitment',
        organization: 'State Board',
        vacancies: '120',
        lastDate: '30 October 2026',
        applyLink: 'https://board.gov.in/apply',
    });
    assert.match(article, /Board Assistant Recruitment/);
    assert.match(article, /120/);
    assert.match(article, /https:\/\/board\.gov\.in\/apply/);
    assert.ok(htmlWordCount(article) > 40);
    assert.doesNotMatch(article, /undefined|null/);

    const fastTrack = buildFallbackArticleHtml({
        kind: 'fast_track',
        title: 'University Result 2026',
        category: 'Result',
        originalLink: 'https://results-publisher.example/update',
    });
    assert.match(fastTrack, /Original source page — verify official notice/);
    assert.doesNotMatch(fastTrack, /Verified official source/);
});

test('backfill gap-fills only permitted draft statuses and never changes published documents', async () => {
    const records = [
        { id: 'ft-draft', data: { status: 'draft', title: 'University Result', articleHtml: '<p>The university has published the semester result. Check the official link for marks.</p>' } },
        { id: 'ft-live', data: { status: 'published', title: 'Live Result', articleHtml: '<p>Keep this public content unchanged.</p>' } },
        { id: 'ft-existing', data: { status: 'draft', description: 'Existing summary is already filled.', shortInfo: 'Existing summary is already filled.', articleHtml: '<p>Existing article content stays intact.</p>' } },
        { id: 'ft-empty', data: { status: 'draft', title: 'Board Admit Card', category: 'Admit Card' } },
    ];
    const docs = records.map((record) => ({
        id: record.id,
        data: () => record.data,
        ref: { update: async (patch) => { record.data = { ...record.data, ...patch }; } },
    }));
    const db = {
        collection: () => ({
            orderBy: () => ({
                limit: () => ({ get: async () => ({ docs }) }),
            }),
        }),
    };

    const updated = await backfillDraftDescriptions({
        db,
        collectionName: 'fast_track',
        allowedStatuses: ['draft'],
        kind: 'fast_track',
        logger: () => {},
    });

    assert.equal(updated, 2);
    assert.equal(records[0].data.description, records[0].data.shortInfo);
    assert.match(records[0].data.description, /university has published/i);
    assert.equal(records[1].data.description, undefined);
    assert.equal(records[2].data.description, 'Existing summary is already filled.');
    assert.match(records[3].data.articleHtml, /Board Admit Card/);
    assert.ok(records[3].data.description);
    assert.equal(records[3].data.status, 'draft');
});
