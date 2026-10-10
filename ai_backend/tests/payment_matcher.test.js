'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    extractAmounts,
    isCreditAlert,
    normalizeUtr,
    emailMatchesUtr,
    isWithinMatchWindow,
    matchTransaction,
    buildGmailQuery,
    MATCH_WINDOW_MS,
} = require('../payment_matcher');

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);

// ---------------------------------------------------------------- extractAmounts
test('payment_matcher: extracts plain amount with Rs. prefix', () => {
    const amounts = extractAmounts('Rs.199.01 has been credited to your A/c');
    assert.equal(amounts.has('199.01'), true);
});

test('payment_matcher: extracts ₹ and INR formats', () => {
    assert.equal(extractAmounts('₹199.02 credited').has('199.02'), true);
    assert.equal(extractAmounts('INR 1,199.01 credited').has('1199.01'), true);
});

test('payment_matcher: comma-grouped amount does NOT leak substring amount', () => {
    // Purana bug: regex substring se "1,199.01" me "199.01" match ho jata tha
    const amounts = extractAmounts('INR 1,199.01 credited');
    assert.equal(amounts.has('199.01'), false);
    assert.equal(amounts.has('1199.01'), true);
});

test('payment_matcher: longer decimals do not partially match', () => {
    assert.equal(extractAmounts('value 199.012 units').has('199.01'), false);
});

// ---------------------------------------------------------------- isCreditAlert
test('payment_matcher: credit alert detected', () => {
    assert.equal(isCreditAlert('Rs.199.01 has been credited to your account'), true);
});

test('payment_matcher: DEBIT alert rejected (owner ka apna kharcha unlock na kare)', () => {
    assert.equal(isCreditAlert('Rs.199.01 has been debited from your account'), false);
});

test('payment_matcher: mixed credit+debit text rejected', () => {
    assert.equal(isCreditAlert('credited Rs.199.01, earlier debited Rs.50'), false);
});

test('payment_matcher: empty text rejected', () => {
    assert.equal(isCreditAlert(''), false);
});

// ---------------------------------------------------------------- UTR helpers
test('payment_matcher: normalizeUtr strips separators', () => {
    assert.equal(normalizeUtr(' 4023-1984 5678/x '), '402319845678X');
});

test('payment_matcher: emailMatchesUtr finds UPI ref in email body', () => {
    assert.equal(emailMatchesUtr('UPI Ref No:402319845678 on 10-10-2026', '402319845678'), true);
    assert.equal(emailMatchesUtr('UPI Ref No:999999999999', '402319845678'), false);
    assert.equal(emailMatchesUtr('UPI Ref No:402319845678', '123'), false); // chhota UTR ignore
});

// ---------------------------------------------------------------- time window
test('payment_matcher: 6h window enforced both sides', () => {
    assert.equal(isWithinMatchWindow(NOW, NOW - 5 * 3600 * 1000), true);
    assert.equal(isWithinMatchWindow(NOW, NOW + 5 * 3600 * 1000), true);
    assert.equal(isWithinMatchWindow(NOW, NOW - 7 * 3600 * 1000), false);
    assert.equal(isWithinMatchWindow(NaN, NOW), false);
});

// ---------------------------------------------------------------- matchTransaction
const creditEmail = {
    emailText: 'Dear Customer, Rs.199.01 has been credited to your A/c XX1234 on 10-10-2026. UPI Ref No:402319845678.',
    emailTimeMs: NOW,
};

test('payment_matcher: credit + exact amount + window = match via amount', () => {
    const r = matchTransaction({ ...creditEmail, purchaseTimeMs: NOW - 10 * 60000, expectedAmount: 199.01 });
    assert.equal(r.matched, true);
    assert.equal(r.via, 'amount');
});

test('payment_matcher: UTR match wins (via utr)', () => {
    const r = matchTransaction({ ...creditEmail, purchaseTimeMs: NOW, expectedAmount: 499, utr: '402319845678' });
    assert.equal(r.matched, true);
    assert.equal(r.via, 'utr');
});

test('payment_matcher: debit email with same amount NEVER matches', () => {
    const r = matchTransaction({
        emailText: 'Rs.199.01 has been debited from your A/c XX1234 at AMAZON PAY',
        emailTimeMs: NOW,
        purchaseTimeMs: NOW,
        expectedAmount: 199.01,
    });
    assert.equal(r.matched, false);
});

test('payment_matcher: 1199.01 credit does not satisfy a 199.01 request', () => {
    const r = matchTransaction({
        emailText: 'Rs.1,199.01 has been credited to your A/c',
        emailTimeMs: NOW,
        purchaseTimeMs: NOW,
        expectedAmount: 199.01,
    });
    assert.equal(r.matched, false);
});

test('payment_matcher: outside 6h window rejected even with amount+credit', () => {
    const r = matchTransaction({
        ...creditEmail,
        purchaseTimeMs: NOW - (MATCH_WINDOW_MS + 60000),
        expectedAmount: 199.01,
    });
    assert.equal(r.matched, false);
});

// ---------------------------------------------------------------- buildGmailQuery
test('payment_matcher: gmail query supports multiple senders', () => {
    assert.equal(buildGmailQuery(), 'from:alert@mail.uco.bank.in');
    assert.equal(
        buildGmailQuery('alert@mail.uco.bank.in, no-reply@phonepe.com'),
        'from:alert@mail.uco.bank.in OR from:no-reply@phonepe.com'
    );
});
