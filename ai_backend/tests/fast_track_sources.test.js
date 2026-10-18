'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildFastTrackSources,
    isOfficialSourceUrl,
    resolveOfficialSourceUrl,
    extractOfficialSourceCandidates,
    isOfficialSourceRelevant,
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

test('official source relevance requires notice identity, not just an official host', () => {
    assert.equal(isOfficialSourceRelevant({
        title: 'Dental Hygienist Recruitment 2026',
        organization: 'Maulana Azad Institute of Dental Sciences (MAIDS)',
        sourceText: 'MAIDS Dental Hygienist engagement under the Mobile Dental Clinic Project.',
    }), true);
    assert.equal(isOfficialSourceRelevant({
        title: 'Dental Hygienist Recruitment 2026',
        organization: 'Maulana Azad Institute of Dental Sciences (MAIDS)',
        sourceText: 'DSSSB recruitment notice for Sweeper and Chowkidar posts.',
    }), false);
});

test('resolves only allowlisted official destinations from publisher redirects', () => {
    const ibps = 'https://ibpsreg.ibps.in/uiicljul26/oecla_oct26/login.php?appid=test';
    const wrapper = `https://studygyaan.in/redirect?url=${encodeURIComponent(ibps)}`;
    assert.equal(resolveOfficialSourceUrl(wrapper), ibps);
    assert.equal(resolveOfficialSourceUrl('https://maids.delhi.gov.in/notice.pdf'), 'https://maids.delhi.gov.in/notice.pdf');
    assert.equal(resolveOfficialSourceUrl('https://study.example/redirect?url=https%3A%2F%2Fevil.example%2F'), '');
    assert.deepEqual(
        extractOfficialSourceCandidates(`(URL: ${wrapper}) (URL: https://maids.delhi.gov.in/notice.pdf)`),
        [ibps, 'https://maids.delhi.gov.in/notice.pdf']
    );
});

test('editorial angle is stable per item and varies across items', () => {
    const first = chooseEditorialAngle('State Board Result 2026', 'Result');
    assert.equal(chooseEditorialAngle('State Board Result 2026', 'Result'), first);
    const other = chooseEditorialAngle('SSC CGL Admit Card 2026', 'Admit Card');
    assert.notEqual(other, first);
});
