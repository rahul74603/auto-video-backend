'use strict';

// =====================================================================
// payment_matcher.js — pure matching logic for the UPI payment checker
// No firebase/googleapis imports here so it is unit-testable.
//
// Accuracy fixes over the old inline logic:
//   1. CREDIT-ONLY check  — debit/withdrawal bank alerts must never unlock a course.
//   2. Exact amount parse — amounts are extracted from the email and compared with
//      strict equality (no substring matches like "1,199.01" hitting "199.01").
//   3. UTR match          — if the buyer supplied a 12-char UTR, a credit email
//      containing that UTR is a strong match even before amount comparison.
//   4. Tight time window  — 6h instead of 24h (internalDate is epoch ms, no TZ issue).
// =====================================================================

const DEFAULT_ALERT_SENDERS = ['alert@mail.uco.bank.in'];
const MATCH_WINDOW_MS = 6 * 60 * 60 * 1000;   // bank email must arrive within 6h of request
const EXPIRE_AFTER_MS = 6 * 60 * 60 * 1000;   // pending requests older than this become "expired" (not deleted)

const CREDIT_RE = /\b(credit|credited|crediting|received|deposited)\b/i;
const DEBIT_RE = /\b(debit|debited|withdrawn|withdrawal)\b/i;

// Matches "Rs.199.01", "₹199.01", "INR 1,199.01" and bare "199.01".
// The (?!\d) guard stops partial matches like "199.012" or "99.01" inside "199.012".
const AMOUNT_RE = /(?:rs\.?\s*|₹\s*|inr\s*)?(\d[\d,]*\.\d{2})(?!\d)/gi;

/** Extract every rupee amount from bank-email text as a Set of "N.NN" strings. */
function extractAmounts(text) {
    const out = new Set();
    if (!text) return out;
    const re = new RegExp(AMOUNT_RE.source, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
        const raw = (m[1] || '').replace(/,/g, '');
        if (raw) out.add(raw);
    }
    return out;
}

/** True only for money-IN alerts. Debit/withdrawal alerts always return false. */
function isCreditAlert(text) {
    if (!text) return false;
    return CREDIT_RE.test(text) && !DEBIT_RE.test(text);
}

/** Normalize a user-typed UTR to uppercase alphanumeric for comparison. */
function normalizeUtr(utr) {
    return String(utr || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** True when the email body contains the buyer's UTR (min 8 chars to avoid noise). */
function emailMatchesUtr(text, utr) {
    const n = normalizeUtr(utr);
    if (!text || n.length < 8) return false;
    return text.toUpperCase().includes(n);
}

/** Absolute time distance between bank email and purchase request within window. */
function isWithinMatchWindow(txTimeMs, purchaseTimeMs, windowMs = MATCH_WINDOW_MS) {
    const a = Number(txTimeMs);
    const b = Number(purchaseTimeMs);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) <= windowMs;
}

/**
 * Decide whether one bank email verifies one pending purchase.
 * @returns {{matched:boolean, via?:'utr'|'amount'}}
 */
function matchTransaction({ emailText, emailTimeMs, purchaseTimeMs, expectedAmount, utr }) {
    if (!isCreditAlert(emailText)) return { matched: false };
    if (!isWithinMatchWindow(emailTimeMs, purchaseTimeMs)) return { matched: false };

    if (emailMatchesUtr(emailText, utr)) return { matched: true, via: 'utr' };

    const expected = Number(expectedAmount).toFixed(2);
    if (Number.isNaN(Number(expectedAmount))) return { matched: false };
    if (extractAmounts(emailText).has(expected)) return { matched: true, via: 'amount' };

    return { matched: false };
}

/** Build the Gmail search query for one or more bank alert senders. */
function buildGmailQuery(senders = DEFAULT_ALERT_SENDERS) {
    const list = (Array.isArray(senders) ? senders : String(senders).split(','))
        .map((s) => String(s).trim())
        .filter(Boolean);
    const finalList = list.length ? list : DEFAULT_ALERT_SENDERS;
    return finalList.map((s) => `from:${s}`).join(' OR ');
}

module.exports = {
    DEFAULT_ALERT_SENDERS,
    MATCH_WINDOW_MS,
    EXPIRE_AFTER_MS,
    extractAmounts,
    isCreditAlert,
    normalizeUtr,
    emailMatchesUtr,
    isWithinMatchWindow,
    matchTransaction,
    buildGmailQuery,
};
