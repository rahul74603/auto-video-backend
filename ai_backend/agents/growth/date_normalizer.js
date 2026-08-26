'use strict';

/**
 * Canonical date parser for StudyGyaan.
 *
 * Job / Fast Track dates are CALENDAR dates in India, not instants.
 * Parse to {year, month, day} and format YYYY-MM-DD from those parts —
 * never via Date#toISOString(), which shifts a day around IST midnight.
 *
 * Used by: Growth Engine (normalizeDate), Fact & Quality reviewer,
 * job lifecycle, publish sanitizers. Frontend jobExpiry.ts mirrors the
 * same calendar rules in Asia/Kolkata.
 */

const INDIA_TZ = 'Asia/Kolkata';

const DEVANAGARI_DIGITS = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
};

const HINDI_MONTHS = {
    'जनवरी': 0, 'जन': 0,
    'फरवरी': 1, 'फ़रवरी': 1, 'फर': 1,
    'मार्च': 2, 'मार्': 2,
    'अप्रैल': 3, 'अप्र': 3,
    'मई': 4,
    'जून': 5,
    'जुलाई': 6, 'जुल': 6,
    'अगस्त': 7, 'अग': 7,
    'सितंबर': 8, 'सितम्बर': 8, 'सित': 8,
    'अक्टूबर': 9, 'अक्तूबर': 9, 'अक्ट': 9,
    'नवंबर': 10, 'नव': 10,
    'दिसंबर': 11, 'दिस': 11
};

const ENGLISH_MONTHS = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'sept': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
};

const PLACEHOLDERS = new Set([
    'soon', 'not specified', 'active', 'ongoing', 'n/a', 'na', '-', '—'
]);

function pad2(n) {
    return String(n).padStart(2, '0');
}

function formatYmd(year, monthIndex, day) {
    return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function normalizeDigits(text) {
    return String(text || '').replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] || d);
}

function calendarFromInstant(date, timeZone = INDIA_TZ) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const pick = (type) => Number(parts.find((p) => p.type === type)?.value);
    const year = pick('year');
    const month = pick('month');
    const day = pick('day');
    if (!year || !month || !day) return null;
    return { year, month: month - 1, day };
}

function validYmd(year, monthIndex, day) {
    if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) return null;
    if (year < 1990 || year > 2100) return null;
    if (monthIndex < 0 || monthIndex > 11) return null;
    if (day < 1 || day > 31) return null;
    const probe = new Date(Date.UTC(year, monthIndex, day));
    if (
        probe.getUTCFullYear() !== year
        || probe.getUTCMonth() !== monthIndex
        || probe.getUTCDate() !== day
    ) {
        return null;
    }
    return { year, month: monthIndex, day };
}

function monthIndexOf(token) {
    if (!token) return undefined;
    const raw = String(token).trim();
    if (HINDI_MONTHS[raw] !== undefined) return HINDI_MONTHS[raw];
    return ENGLISH_MONTHS[raw.toLowerCase()];
}

function instantFromUnknown(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value.toDate === 'function') {
        try {
            const d = value.toDate();
            return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
        } catch {
            return null;
        }
    }
    if (typeof value.seconds === 'number') {
        const d = new Date(value.seconds * 1000);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

/**
 * Parse any supported date-like value to calendar parts {year, month, day}
 * (month is 0-indexed). Date-only strings are treated as written calendar
 * dates (India). Date/Timestamp instants are converted in Asia/Kolkata.
 */
function parseDateParts(value) {
    const instant = instantFromUnknown(value);
    if (instant) return calendarFromInstant(instant);

    const raw = normalizeDigits(String(value || '')).trim();
    if (!raw) return null;
    if (PLACEHOLDERS.has(raw.toLowerCase())) return null;

    let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (m) return validYmd(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (m) {
        let year = Number(m[3]);
        if (year < 100) year += 2000;
        return validYmd(year, Number(m[2]) - 1, Number(m[1]));
    }

    m = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([A-Za-z\u0900-\u097F]+)[\s,\-]+(\d{4})$/i);
    if (m) {
        const month = monthIndexOf(m[2]);
        if (month !== undefined) return validYmd(Number(m[3]), month, Number(m[1]));
    }

    m = raw.match(/^([A-Za-z\u0900-\u097F]+)[\s\-]+(\d{1,2})(?:st|nd|rd|th)?[\s,]+(\d{4})$/i);
    if (m) {
        const month = monthIndexOf(m[1]);
        if (month !== undefined) return validYmd(Number(m[3]), month, Number(m[2]));
    }

    return null;
}

function toIsoDateString(value) {
    const parts = parseDateParts(value);
    return parts ? formatYmd(parts.year, parts.month, parts.day) : null;
}

/**
 * Date at UTC midnight of the calendar day. Safe for getUTC* assertions
 * and for toISOString().slice(0, 10) === calendar ISO.
 */
function parseDateFlexible(value) {
    const parts = parseDateParts(value);
    if (!parts) return null;
    return new Date(Date.UTC(parts.year, parts.month, parts.day));
}

function indiaTodayParts(now) {
    const date = now instanceof Date ? now : new Date(now || Date.now());
    return calendarFromInstant(date, INDIA_TZ);
}

function calendarDayDiff(targetParts, nowParts) {
    if (!targetParts || !nowParts) return null;
    const a = Date.UTC(targetParts.year, targetParts.month, targetParts.day);
    const b = Date.UTC(nowParts.year, nowParts.month, nowParts.day);
    return Math.round((a - b) / 86400000);
}

function daysUntilInIndia(value, now = new Date()) {
    const target = parseDateParts(value);
    const today = indiaTodayParts(now);
    if (!target || !today) return null;
    return calendarDayDiff(target, today);
}

/**
 * Growth Engine + existing callers: ISO YYYY-MM-DD or null.
 * Never invents dates.
 */
function normalizeDate(dateStr) {
    return toIsoDateString(dateStr);
}

module.exports = {
    INDIA_TZ,
    HINDI_MONTHS,
    ENGLISH_MONTHS,
    parseDateParts,
    parseDateFlexible,
    toIsoDateString,
    daysUntilInIndia,
    indiaTodayParts,
    calendarDayDiff,
    normalizeDate
};
