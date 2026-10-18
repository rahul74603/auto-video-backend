'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildFastTrackSources,
    isOfficialSourceUrl,
    chooseEditorialAngle,
} = require('../fast_track_sources');
const { DEFAULT_SOURCES } = require('../source_registry');

test('Fast Track source list merges configured discovery feeds without duplicates', () => {
    const sources = buildFastTrackSources([
        { name: 'GovtJobsBlog', url: 'https://www.govtjobsblog.in/feed/' },
        { name: 'FreeJobAlert alias', url: 'https://www.freejobalert.com/feed/' },
    ]);
    assert.equal(sources.length, 4);
    assert.ok(sources.some((source) => source.name === 'GovtJobsBlog'));
});

test('Fast Track combines the additional configured feeds with its originals', () => {
    const sources = buildFastTrackSources(DEFAULT_SOURCES);
    assert.equal(sources.length, 8);
    assert.ok(sources.some((source) => source.name === 'IndGovtJobs'));
    assert.ok(sources.some((source) => source.name === 'RojgarResult'));
});

test('only HTTPS official institution hosts qualify for official-source fetches', () => {
    assert.equal(isOfficialSourceUrl('https://ssc.gov.in/home'), true);
    assert.equal(isOfficialSourceUrl('https://upsc.gov.in/whats-new'), true);
    assert.equal(isOfficialSourceUrl('https://freejobalert.com/ssc-result'), false);
    assert.equal(isOfficialSourceUrl('https://fake.gov.in.attacker.example/'), false);
    assert.equal(isOfficialSourceUrl('http://nta.ac.in/notice'), false);
});

test('editorial angle is stable per item and varies across items', () => {
    const first = chooseEditorialAngle('State Board Result 2026', 'Result');
    assert.equal(chooseEditorialAngle('State Board Result 2026', 'Result'), first);
    const other = chooseEditorialAngle('SSC CGL Admit Card 2026', 'Admit Card');
    assert.notEqual(other, first);
});
