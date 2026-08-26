/**
 * jobExpiry.ts — India-calendar job dates.
 *
 * Mirrors ai_backend/agents/growth/date_normalizer.js:
 * date-only strings are calendar dates; comparisons use Asia/Kolkata.
 */

const INDIA_TZ = 'Asia/Kolkata';

const DEVANAGARI_DIGITS: Record<string, string> = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

const HINDI_MONTHS: Record<string, number> = {
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
    'दिसंबर': 11, 'दिस': 11,
};

const ENGLISH_MONTHS: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
};

const PLACEHOLDERS = new Set(['soon', 'not specified', 'active', 'ongoing', 'n/a', 'na', '-', '—', '']);

export type CalendarParts = { year: number; month: number; day: number };

function normalizeDigits(text: string): string {
    return text.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] || d);
}

function monthIndexOf(token: string): number | undefined {
    if (HINDI_MONTHS[token] !== undefined) return HINDI_MONTHS[token];
    return ENGLISH_MONTHS[token.toLowerCase()];
}

/** Named months only — no Devanagari range in a character class (eslint + safer). */
function monthNamePattern(): string {
    const names = [...Object.keys(HINDI_MONTHS), ...Object.keys(ENGLISH_MONTHS)]
        .sort((a, b) => b.length - a.length)
        .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return names.join('|');
}

const MONTH_NAME = monthNamePattern();
const DAY_MONTH_YEAR = new RegExp(
    `^(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(${MONTH_NAME})[\\s,-]+(\\d{4})$`,
    'i',
);
const MONTH_DAY_YEAR = new RegExp(
    `^(${MONTH_NAME})[\\s-]+(\\d{1,2})(?:st|nd|rd|th)?[\\s,]+(\\d{4})$`,
    'i',
);

function validYmd(year: number, monthIndex: number, day: number): CalendarParts | null {
    if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) return null;
    if (year < 1990 || year > 2100) return null;
    if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
    const probe = new Date(Date.UTC(year, monthIndex, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== monthIndex || probe.getUTCDate() !== day) {
        return null;
    }
    return { year, month: monthIndex, day };
}

function calendarFromInstant(date: Date, timeZone = INDIA_TZ): CalendarParts | null {
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const year = pick('year');
    const month = pick('month');
    const day = pick('day');
    if (!year || !month || !day) return null;
    return { year, month: month - 1, day };
}

function instantFromUnknown(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'object') {
        const ts = value as { toDate?: () => Date; seconds?: number };
        if (typeof ts.toDate === 'function') {
            try {
                const d = ts.toDate();
                return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
            } catch {
                return null;
            }
        }
        if (typeof ts.seconds === 'number') {
            const d = new Date(ts.seconds * 1000);
            return Number.isNaN(d.getTime()) ? null : d;
        }
    }
    return null;
}

export function parseDateParts(value: unknown): CalendarParts | null {
    const instant = instantFromUnknown(value);
    if (instant) return calendarFromInstant(instant);

    const raw = normalizeDigits(String(value || '')).trim();
    if (!raw || PLACEHOLDERS.has(raw.toLowerCase())) return null;

    let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (m) return validYmd(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) {
        let year = Number(m[3]);
        if (year < 100) year += 2000;
        return validYmd(year, Number(m[2]) - 1, Number(m[1]));
    }

    m = raw.match(DAY_MONTH_YEAR);
    if (m) {
        const month = monthIndexOf(m[2]);
        if (month !== undefined) return validYmd(Number(m[3]), month, Number(m[1]));
    }

    m = raw.match(MONTH_DAY_YEAR);
    if (m) {
        const month = monthIndexOf(m[1]);
        if (month !== undefined) return validYmd(Number(m[3]), month, Number(m[2]));
    }

    return null;
}

export function toIsoDateString(value: unknown): string | null {
    const parts = parseDateParts(value);
    if (!parts) return null;
    const mm = String(parts.month + 1).padStart(2, '0');
    const dd = String(parts.day).padStart(2, '0');
    return `${parts.year}-${mm}-${dd}`;
}

/** Local midnight of the calendar day — for display / ExamCalendar. */
export function parseJobDate(dateStr: string): Date | null {
    const parts = parseDateParts(dateStr);
    if (!parts) return null;
    return new Date(parts.year, parts.month, parts.day);
}

export function daysUntilInIndia(value: unknown, now: Date = new Date()): number | null {
    const target = parseDateParts(value);
    const today = calendarFromInstant(now);
    if (!target || !today) return null;
    const a = Date.UTC(target.year, target.month, target.day);
    const b = Date.UTC(today.year, today.month, today.day);
    return Math.round((a - b) / 86400000);
}

export function checkIsExpired(lastDateStr: string, now: Date = new Date()): boolean {
    const days = daysUntilInIndia(lastDateStr, now);
    if (days === null) return false;
    return days < 0;
}

export type JobLifecycleStatus =
    | 'UPCOMING'
    | 'OPEN'
    | 'CLOSING_SOON'
    | 'CLOSED'
    | 'EXPIRED'
    | 'UNKNOWN';

export function classifyJobLifecycle(
    lastDateStr: string,
    startDateStr?: string,
    now: Date = new Date()
): {
    status: JobLifecycleStatus;
    daysUntilLastDate: number | null;
    includeJobPostingSchema: boolean;
    sitemapPriority: number;
} {
    const daysUntilLastDate = daysUntilInIndia(lastDateStr, now);
    if (daysUntilLastDate === null) {
        return { status: 'UNKNOWN', daysUntilLastDate: null, includeJobPostingSchema: false, sitemapPriority: 0.5 };
    }

    const daysUntilStart = startDateStr ? daysUntilInIndia(startDateStr, now) : null;
    let status: JobLifecycleStatus = 'UNKNOWN';
    if (daysUntilLastDate > 7 && daysUntilStart !== null && daysUntilStart > 0) status = 'UPCOMING';
    else if (daysUntilLastDate > 7) status = 'OPEN';
    else if (daysUntilLastDate >= 0) status = 'CLOSING_SOON';
    else if (daysUntilLastDate >= -30) status = 'CLOSED';
    else status = 'EXPIRED';

    const includeJobPostingSchema = status === 'OPEN' || status === 'CLOSING_SOON' || status === 'UPCOMING';
    const sitemapPriority =
        status === 'CLOSING_SOON' ? 0.9
            : status === 'OPEN' || status === 'UPCOMING' ? 0.8
                : status === 'CLOSED' ? 0.4
                    : status === 'EXPIRED' ? 0.2
                        : 0.5;

    return { status, daysUntilLastDate, includeJobPostingSchema, sitemapPriority };
}
