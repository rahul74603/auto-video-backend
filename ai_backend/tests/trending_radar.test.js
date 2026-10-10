'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    classifyKind,
    normalizeTopic,
    scoreGap,
    extractRssTitles,
    buildRadarOpportunities,
} = require('../trending_radar');

// ---------------------------------------------------------------- classifyKind
test('radar: result/admit card queries → fasttrack', () => {
    assert.equal(classifyKind('SSC CGL Result 2026 kab aayega'), 'fasttrack');
    assert.equal(classifyKind('rrb ntpc admit card download'), 'fasttrack');
    assert.equal(classifyKind('up police answer key released'), 'fasttrack');
});

test('radar: paper/syllabus queries → mock', () => {
    assert.equal(classifyKind('ssc mts previous year question paper'), 'mock');
    assert.equal(classifyKind('ibps clerk syllabus 2026'), 'mock');
});

test('radar: generic study queries → blog', () => {
    assert.equal(classifyKind('how to study daily for exams'), 'blog');
});

// ---------------------------------------------------------------- scoreGap
test('radar: impressions+bad position+low clicks = positive score', () => {
    const s = scoreGap({ impressions: 100, bestPosition: 14, clicks: 1 });
    assert.equal(s > 30, true);
});

test('radar: already ranking top (pos<8) = no gap', () => {
    assert.equal(scoreGap({ impressions: 500, bestPosition: 3, clicks: 200 }), 0);
});

test('radar: negligible impressions = no gap', () => {
    assert.equal(scoreGap({ impressions: 2, bestPosition: 20, clicks: 0 }), 0);
});

// ---------------------------------------------------------------- extractRssTitles
test('radar: RSS titles with CDATA + entities extract hote hain', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
        <title>Feed Name</title>
        <item><title><![CDATA[UP Police Constable Result 2026 &amp; Out]]></title></item>
        <item><title>short</title></item>
        <item><title>SSC MTS Admit Card Released For Tier-1</title></item>
    </channel></rss>`;
    const titles = extractRssTitles(xml);
    assert.equal(titles.includes('UP Police Constable Result 2026 & Out'), true);
    assert.equal(titles.includes('SSC MTS Admit Card Released For Tier-1'), true);
    assert.equal(titles.includes('short'), false); // chhote titles skip
});

// ---------------------------------------------------------------- buildRadarOpportunities
test('radar: shield wale topics (site pe already) exclude hote hain', () => {
    const picks = buildRadarOpportunities({
        gscAgg: [{ query: 'ssc cgl result 2026 date', impressions: 80, clicks: 0, bestPosition: 15 }],
        sourceTitles: [],
        shieldTitles: ['SSC CGL Result 2026 Date Announced'],
        alreadyQueued: [],
    });
    assert.equal(picks.length, 0);
});

test('radar: feed urgency + gsc same topic → ek hi pick (higher score)', () => {
    const picks = buildRadarOpportunities({
        gscAgg: [{ query: 'up police constable result 2026', impressions: 60, clicks: 0, bestPosition: 18 }],
        sourceTitles: ['UP Police Constable Result 2026 Declared'],
        shieldTitles: [],
        alreadyQueued: [],
    });
    assert.equal(picks.length, 1);
    assert.equal(picks[0].kind, 'fasttrack');
});

test('radar: pichhle 7 din ke queued topics repeat nahi hote', () => {
    const picks = buildRadarOpportunities({
        gscAgg: [{ query: 'ibps po mock test', impressions: 90, clicks: 1, bestPosition: 20 }],
        sourceTitles: [],
        shieldTitles: [],
        alreadyQueued: ['ibps po mock test free'],
    });
    assert.equal(picks.length, 0);
});

test('radar: maxPicks cap + descending sort', () => {
    const gscAgg = [];
    for (let i = 0; i < 15; i++) {
        gscAgg.push({ query: `topic number ${i} preparation`, impressions: 20 + i * 10, clicks: 0, bestPosition: 10 + i });
    }
    const picks = buildRadarOpportunities({ gscAgg, sourceTitles: [], shieldTitles: [], alreadyQueued: [], maxPicks: 5 });
    assert.equal(picks.length, 5);
    for (let i = 1; i < picks.length; i++) {
        assert.equal(picks[i - 1].opportunityScore >= picks[i].opportunityScore, true);
    }
});

test('radar: normalizeTopic whitespace collapse', () => {
    assert.equal(normalizeTopic('  SSC   CGL  Result '), 'ssc cgl result');
});
