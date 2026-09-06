'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDate } = require('../agents/growth/date_normalizer');

test('date_normalizer: handles ISO format (YYYY-MM-DD)', () => {
    assert.equal(normalizeDate('2026-08-31'), '2026-08-31');
});

test('date_normalizer: handles DD/MM/YYYY', () => {
    assert.equal(normalizeDate('31/08/2026'), '2026-08-31');
});

test('date_normalizer: handles DD-MM-YYYY', () => {
    assert.equal(normalizeDate('31-08-2026'), '2026-08-31');
});

test('date_normalizer: handles DD.MM.YYYY', () => {
    assert.equal(normalizeDate('31.08.2026'), '2026-08-31');
});

test('date_normalizer: handles "31 August 2026"', () => {
    assert.equal(normalizeDate('31 August 2026'), '2026-08-31');
});

test('date_normalizer: handles "14 September 2026"', () => {
    assert.equal(normalizeDate('14 September 2026'), '2026-09-14');
});

test('date_normalizer: handles "31 Aug 2026"', () => {
    assert.equal(normalizeDate('31 Aug 2026'), '2026-08-31');
});

test('date_normalizer: handles "31-Aug-2026"', () => {
    assert.equal(normalizeDate('31-Aug-2026'), '2026-08-31');
});

test('date_normalizer: handles ordinal "31st August 2026"', () => {
    assert.equal(normalizeDate('31st August 2026'), '2026-08-31');
});

test('date_normalizer: handles Hindi "14 सितंबर 2026"', () => {
    assert.equal(normalizeDate('14 सितंबर 2026'), '2026-09-14');
});

test('date_normalizer: handles Hindi "31 अगस्त 2026"', () => {
    assert.equal(normalizeDate('31 अगस्त 2026'), '2026-08-31');
});

test('date_normalizer: returns null for empty string', () => {
    assert.equal(normalizeDate(''), null);
});

test('date_normalizer: returns null for null', () => {
    assert.equal(normalizeDate(null), null);
});

test('date_normalizer: returns null for invalid date', () => {
    assert.equal(normalizeDate('not a date'), null);
});

test('date_normalizer: handles Date object', () => {
    const d = new Date('2026-08-31');
    assert.equal(normalizeDate(d), '2026-08-31');
});
