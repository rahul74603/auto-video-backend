'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    cleanDiscoverTitle,
    isClickbaitTitle,
    stripWords,
    countTag,
    hasFaqSection,
    hasSourcesSection,
    buildKeywordSlug,
    scoreDiscoverReadiness,
} = require('../blog_discover');

test('cleanDiscoverTitle strips emoji + clickbait prefixes + date suffix', () => {
    assert.equal(
        cleanDiscoverTitle('🔥 Breaking: SSC CGL 2026 Notification Out (October 2026)'),
        'SSC CGL 2026 Notification Out'
    );
    assert.equal(
        cleanDiscoverTitle('🏆 Top Secrets - How to Crack UPSC | StudyGyaan'),
        'How to Crack UPSC'
    );
    assert.equal(
        cleanDiscoverTitle('SSC GD Constable Bharti 2026: Eligibility Aur Dates'),
        'SSC GD Constable Bharti 2026: Eligibility Aur Dates'
    );
});

test('cleanDiscoverTitle truncates at word boundary + falls back to topic', () => {
    const long = 'Railway RRB NTPC Undergraduate Recruitment 2026 Complete Guide With Syllabus Exam Pattern Aur Strategy';
    const out = cleanDiscoverTitle(long, '', 70);
    assert.ok(out.length <= 70);
    assert.ok(!out.endsWith('-') && out.split(' ').every((w) => long.includes(w)));
    assert.equal(cleanDiscoverTitle('', 'SSC CGL Syllabus'), 'SSC CGL Syllabus');
});

test('isClickbaitTitle flags emoji/clickbait, passes clean titles', () => {
    assert.equal(isClickbaitTitle('🔥 Breaking: SSC Result Out'), true);
    assert.equal(isClickbaitTitle('Exclusive - Secret Trick 100% Selection'), true);
    assert.equal(isClickbaitTitle('You Won\'t Believe This Cut Off'), true);
    assert.equal(isClickbaitTitle('SSC CGL 2026 Notification: Dates, Fees, Eligibility'), false);
    assert.equal(isClickbaitTitle('Railway Group D Syllabus 2026 Aur Taiyari Plan'), false);
});

test('stripWords counts real text, not tags/scripts', () => {
    const html = '<h2>Title here</h2><p>' + 'shabd '.repeat(100) + '</p><script>var x = 1; alert(1);</script>';
    const n = stripWords(html);
    assert.ok(n >= 100 && n <= 104, `words=${n}`);
    assert.equal(stripWords(''), 0);
});

test('hasFaqSection needs 4+ h3 questions', () => {
    const faq = '<h3>Q1?</h3><p>a</p>'.repeat(2);
    assert.equal(hasFaqSection(faq), false);
    assert.equal(hasFaqSection('<h3>Q1?</h3><p>a</p>'.repeat(5)), true);
    assert.equal(hasSourcesSection('<h2>आधिकारिक स्रोत</h2><ul></ul>'), true);
    assert.equal(hasSourcesSection('<h2>Conclusion</h2>'), false);
});

test('buildKeywordSlug makes clean slugs', () => {
    assert.equal(buildKeywordSlug('SSC CGL 2026 Notification Out!'), 'ssc-cgl-2026-notification-out');
    assert.equal(buildKeywordSlug(''), 'studygyaan-blog');
    assert.ok(buildKeywordSlug('a '.repeat(100)).length <= 70);
});

test('scoreDiscoverReadiness passes a good trend blog', () => {
    const html = '<h2>A</h2><h2>B</h2><h2>C</h2><h2>D</h2><h2>E</h2>'
        + '<table><tr><td>x</td></tr></table>'
        + '<p>' + 'vistaar '.repeat(1500) + '</p>'
        + '<h3>Q1?</h3><p>a</p>'.repeat(5)
        + '<h2>आधिकारिक स्रोत</h2><p>links</p>';
    const r = scoreDiscoverReadiness({
        title: 'SSC CGL 2026 Notification: Dates, Fees, Eligibility',
        html,
        imageUrl: 'https://studygyaan.in/uploads/x.webp',
        excerpt: 'SSC CGL 2026 ka notification out — dates, fees, eligibility aur apply process ki poori jaankari yahan padhein.',
        isTrend: true,
    });
    assert.equal(r.ready, true, JSON.stringify(r.issues));
    assert.ok(r.score >= 80, `score=${r.score}`);
});

test('scoreDiscoverReadiness fails clickbait title + thin content + missing sources', () => {
    const r = scoreDiscoverReadiness({
        title: '🔥 Breaking: Secret Trick 100% Selection',
        html: '<p>' + 'chhota '.repeat(300) + '</p>',
        imageUrl: '',
        excerpt: 'x',
        isTrend: true,
    });
    assert.equal(r.ready, false);
    const msgs = r.issues.map((i) => i.msg).join('|');
    assert.match(msgs, /clickbait/);
    assert.match(msgs, /Sources/);
    assert.match(msgs, /hero image/);
});

test('countTag counts headings', () => {
    assert.equal(countTag('<h2>a</h2><H2 class="x">b</H2><h3>c</h3>', 'h2'), 2);
});
