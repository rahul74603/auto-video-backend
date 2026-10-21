'use strict';

/**
 * Scraper article generator tests — LONG-FORM policy (Oct 2026).
 * Pehle 1200-2000 words bante the, strict grounding ke baad 400-500 reh gaye.
 * Ye tests lock karte hain: official+aggregator bundle, 1200-2000 prompt,
 * 900-word gate + expand retries, aur enriched fallback.
 * Gemini ko stub karke — koi network call nahi.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'studymaterial-406ad';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({
    projectId: 'studymaterial-406ad',
    storageBucket: 'studymaterial-406ad.firebasestorage.app',
});
delete process.env.GEMINI_API_KEY;
delete process.env.SERVICE_ACCOUNT_JSON;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;

const {
    buildArticleSourceContext,
    buildJobArticlePrompt,
    generateFullJobArticle,
    JOB_ARTICLE_WORD_MIN,
    JOB_ARTICLE_MAX_ATTEMPTS,
} = require('../govt_jobs');
const { htmlWordCount } = require('../description_fallback');

const words = (n) => `<p>${'shabd '.repeat(n).trim()}</p>`;

test('source context: official first with priority labels, aggregator budgeted', () => {
    const ctx = buildArticleSourceContext({ officialText: 'OFFICIAL-NOTICE', aggregatorText: 'AGG-HINTS' });
    assert.match(ctx, /HIGHEST priority/);
    assert.match(ctx, /secondary/);
    assert.ok(ctx.indexOf('OFFICIAL-NOTICE') < ctx.indexOf('AGG-HINTS'));
    const big = buildArticleSourceContext({ officialText: 'x'.repeat(30000), aggregatorText: 'y'.repeat(20000) });
    assert.ok(big.length < 30000 + 20000, 'char budgets must cap both sources');
    assert.equal(buildArticleSourceContext({}), '');
});

test('prompt demands 1200-2000 + guidance sections, forbids h1 + invention', () => {
    const p = buildJobArticlePrompt({ factsJson: '{}', sourceContext: 'CTX' });
    assert.match(p, /1200-2000/);
    assert.match(p, /MINIMUM 900/);
    assert.match(p, /GENERAL GUIDANCE/);
    assert.match(p, /KABHI invent mat karo/);
    assert.match(p, /or <h1>/);
    assert.match(p, /official source > aggregator/);
});

test('expand levels escalate the length demand', () => {
    const l0 = buildJobArticlePrompt({ factsJson: '{}', sourceContext: 'CTX', expandLevel: 0 });
    const l1 = buildJobArticlePrompt({ factsJson: '{}', sourceContext: 'CTX', expandLevel: 1 });
    const l2 = buildJobArticlePrompt({ factsJson: '{}', sourceContext: 'CTX', expandLevel: 2 });
    assert.doesNotMatch(l0, /EXPAND/);
    assert.match(l1, /EXPAND INSTRUCTION/);
    assert.match(l2, /1200\+ words LAZMI/);
});

test('long AI output passes the gate on first attempt', async () => {
    let calls = 0;
    const html = await generateFullJobArticle({ title: 'T', description: 'D' }, 'official', 'agg', {
        generateOnce: async () => { calls += 1; return `<h2>A</h2>${words(1000)}`; },
    });
    assert.equal(calls, 1);
    assert.ok(htmlWordCount(html) >= JOB_ARTICLE_WORD_MIN);
});

test('short output triggers expand retry and returns the long one', async () => {
    const seen = [];
    const html = await generateFullJobArticle({ title: 'T', description: 'D' }, 'official', 'agg', {
        generateOnce: async (prompt) => {
            seen.push(prompt);
            return seen.length === 1 ? `<h2>A</h2>${words(120)}` : `<h2>A</h2>${words(1000)}`;
        },
    });
    assert.equal(seen.length, 2);
    assert.match(seen[1], /EXPAND INSTRUCTION/);
    assert.ok(htmlWordCount(html) >= JOB_ARTICLE_WORD_MIN);
});

test('all attempts short: keeps best AI output above 250 words (no fallback)', async () => {
    const html = await generateFullJobArticle({ title: 'T', description: 'D' }, 'official', '', {
        generateOnce: async () => `<h2>A</h2>${words(400)}`,
    });
    const count = htmlWordCount(html);
    assert.ok(count >= 400 && count < JOB_ARTICLE_WORD_MIN, `words=${count}`);
    assert.doesNotMatch(html, /What to verify/);
});

test('AI failure: fact-only fallback is returned with the job title', async () => {
    const html = await generateFullJobArticle({ title: 'Board Assistant', organization: 'Board', description: 'D' }, 'official', '', {
        generateOnce: async () => { throw new Error('boom'); },
    });
    assert.match(html, /Board Assistant/);
    assert.match(html, /What to verify/);
});

test('h1 from model is demoted to h2 (single-H1 page safety)', async () => {
    const html = await generateFullJobArticle({ title: 'T', description: 'D' }, 'official', '', {
        generateOnce: async () => `<h1>X</h1>${words(1000)}`,
    });
    assert.doesNotMatch(html, /<h1/i);
    assert.match(html, /<h2>X<\/h2>/);
});

test('article length constants stay in the long-form band', () => {
    assert.equal(JOB_ARTICLE_WORD_MIN, 900);
    assert.equal(JOB_ARTICLE_MAX_ATTEMPTS, 3);
});
