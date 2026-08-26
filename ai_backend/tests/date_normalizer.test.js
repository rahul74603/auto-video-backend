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

const { parseDateFlexible, daysUntilInIndia, toIsoDateString } = require('../agents/growth/date_normalizer');

test('date_normalizer: India calendar today/tomorrow/yesterday around IST midnight', () => {
    const last = '26/08/2026';
    assert.equal(daysUntilInIndia(last, new Date('2026-08-26T18:29:00Z')), 0);
    assert.equal(daysUntilInIndia(last, new Date('2026-08-26T18:30:00Z')), -1);
    assert.equal(daysUntilInIndia('27/08/2026', new Date('2026-08-26T00:00:00Z')), 1);
});

test('date_normalizer: month and year boundaries', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    assert.equal(daysUntilInIndia('31/12/2025', now), -1);
    assert.equal(daysUntilInIndia('01/02/2026', now), 31);
    assert.equal(toIsoDateString('1st January 2026'), '2026-01-01');
});

test('date_normalizer: invalid and missing dates never invent a value', () => {
    assert.equal(normalizeDate(''), null);
    assert.equal(normalizeDate('not a date'), null);
    assert.equal(parseDateFlexible(undefined), null);
    assert.equal(daysUntilInIndia(null, new Date()), null);
});

test('date_normalizer: Firestore Timestamp-like and Devanagari digits', () => {
    const ts = { seconds: Date.UTC(2026, 7, 31) / 1000, toDate() { return new Date(this.seconds * 1000); } };
    assert.equal(normalizeDate(ts), '2026-08-31');
    assert.equal(toIsoDateString('२५/०८/२०२६'), '2026-08-25');
    const d = parseDateFlexible('August 25, 2026');
    assert.equal(d.getUTCFullYear(), 2026);
    assert.equal(d.getUTCMonth(), 7);
    assert.equal(d.getUTCDate(), 25);
});
