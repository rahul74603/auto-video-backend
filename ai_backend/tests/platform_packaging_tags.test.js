'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateRelevantTags, sanitizeYouTubeTags } = require('../agents/growth/platform_packaging');

// BSSA Head Coach incident (2026-10-10) wala asli eligibility paragraph
const BSSA_QUALIFICATION = 'Candidate should have diploma in Coaching from SAI/NS NIS or from any other recognized Indian/Foreign University and should have represented India in Olympics/World Cup/World Championship. Certificate Course from concerned National/International Federation is a must. Working knowledge of computer is essential. Minimum 10 years of experience of coaching is required.';

test('tags: lambi qualification se giant tag NAHI banta (YouTube reject fix)', () => {
    const tags = generateRelevantTags('STATE', { organization: 'BSSA', qualification: BSSA_QUALIFICATION });
    for (const t of tags) {
        assert.equal(t.length <= 60, true, `tag too long: ${t}`);
    }
    const combined = tags.join(',').length;
    assert.equal(combined <= 480, true, `combined ${combined} > 480`);
    assert.equal(tags.some((t) => t.includes('Olympics')), false, 'paragraph leak');
});

test('tags: lambi qualification se diploma token + generic tag milta hai', () => {
    const tags = generateRelevantTags('STATE', { qualification: BSSA_QUALIFICATION });
    assert.equal(tags.includes('diploma pass jobs'), true);
    assert.equal(tags.includes('eligibility criteria'), true);
});

test('tags: chhoti qualification as-is use hoti hai', () => {
    const tags = generateRelevantTags('SSC', { qualification: '12th' });
    assert.equal(tags.includes('12th pass jobs'), true);
});

test('sanitize: control chars + extra whitespace strip', () => {
    const tags = sanitizeYouTubeTags(['  sarkari\n\nnaukri ', 'govt\x00jobs']);
    assert.deepEqual(tags, ['sarkari naukri', 'govt jobs']);
});

test('sanitize: duplicates drop + combined cap', () => {
    const long = 'x'.repeat(55);
    const tags = sanitizeYouTubeTags([long, long, 'a'.repeat(55), 'b'.repeat(55), 'c'.repeat(55), 'd'.repeat(55), 'e'.repeat(55), 'f'.repeat(55), 'g'.repeat(55), 'h'.repeat(55)]);
    const combined = tags.join(',').length;
    assert.equal(combined <= 480, true, `combined ${combined}`);
    assert.equal(new Set(tags).size, tags.length, 'no dupes');
});

test('sanitize: 60+ char tag word boundary pe cut hota hai', () => {
    const tags = sanitizeYouTubeTags(['this is a very long tag that definitely exceeds the sixty character per tag limit yes']);
    assert.equal(tags[0].length <= 60, true);
    assert.equal(/\s$/.test(tags[0]), false, 'no trailing partial word space');
});

test('sanitize: non-array input safe', () => {
    assert.deepEqual(sanitizeYouTubeTags(null), []);
    assert.deepEqual(sanitizeYouTubeTags('single'), []);
});
