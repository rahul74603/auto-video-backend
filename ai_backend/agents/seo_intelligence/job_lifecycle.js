"use strict";

/**
 * Job lifecycle — classify OPEN / CLOSING_SOON / CLOSED / EXPIRED.
 *
 * Never deletes documents. Expired pages stay up as reference (users still
 * search old notifications) but JobPosting schema should be omitted.
 */

const DEVANAGARI_DIGITS = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9" };
const HINDI_MONTHS = {
  "जनवरी": "january", "फ़रवरी": "february", "फरवरी": "february", "मार्च": "march",
  "अप्रैल": "april", "मई": "may", "जून": "june", "जुलाई": "july", "अगस्त": "august",
  "सितंबर": "september", "सितम्बर": "september", "अक्टूबर": "october", "अक्तूबर": "october",
  "नवंबर": "november", "दिसंबर": "december"
};
const EN_MONTH_INDEX = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

function parseDateFlexible(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const text = raw.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] || d).toLowerCase();
  let m = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 0 && mo <= 11) return new Date(Date.UTC(y, mo, d));
    return null;
  }
  m = text.match(/\b(\d{1,2})\s+([^\s,]+)\s*,?\s*(\d{4})\b/);
  if (m) {
    let monthName = HINDI_MONTHS[m[2]] || m[2];
    const mo = EN_MONTH_INDEX[monthName];
    if (mo !== undefined) return new Date(Date.UTC(Number(m[3]), mo, Number(m[1])));
  }
  m = text.match(/\b([^\s,]+)\s+(\d{1,2}),?\s*(\d{4})\b/);
  if (m) {
    let monthName = HINDI_MONTHS[m[1]] || m[1];
    const mo = EN_MONTH_INDEX[monthName];
    if (mo !== undefined) return new Date(Date.UTC(Number(m[3]), mo, Number(m[2])));
  }
  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

const STATES = Object.freeze({
  UPCOMING: "UPCOMING",
  OPEN: "OPEN",
  CLOSING_SOON: "CLOSING_SOON",
  CLOSED: "CLOSED",
  EXPIRED: "EXPIRED",
  UNKNOWN: "UNKNOWN"
});

function startOfUtcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function daysUntil(dateValue, now) {
  const parsed = dateValue instanceof Date ? dateValue : parseDateFlexible(dateValue);
  if (!parsed) return null;
  const nowDate = now instanceof Date ? now : new Date(now || Date.now());
  return Math.round((startOfUtcDay(parsed) - startOfUtcDay(nowDate)) / 86400000);
}

function classifyJobLifecycle(input = {}, now = new Date()) {
  const type = String(input.type || input.articleType || "").toUpperCase();
  const lastDate = input.lastDate || input.facts?.lastDate || "";
  const startDate = input.startDate || input.facts?.startDate || "";

  if (type && type !== "JOB" && type !== "JOBS") {
    return {
      status: STATES.UNKNOWN,
      daysUntilLastDate: null,
      daysUntilStart: null,
      includeJobPostingSchema: false,
      sitemapPriority: 0.6,
      indexable: true,
      reason: "not-a-job"
    };
  }

  const daysUntilLastDate = daysUntil(lastDate, now);
  const daysUntilStart = daysUntil(startDate, now);

  let status = STATES.UNKNOWN;
  if (daysUntilLastDate === null) {
    status = STATES.UNKNOWN;
  } else if (daysUntilLastDate > 7 && daysUntilStart !== null && daysUntilStart > 0) {
    status = STATES.UPCOMING;
  } else if (daysUntilLastDate > 7) {
    status = STATES.OPEN;
  } else if (daysUntilLastDate >= 0) {
    status = STATES.CLOSING_SOON;
  } else if (daysUntilLastDate >= -30) {
    status = STATES.CLOSED;
  } else {
    status = STATES.EXPIRED;
  }

  const includeJobPostingSchema = status === STATES.OPEN || status === STATES.CLOSING_SOON || status === STATES.UPCOMING;
  const sitemapPriority =
    status === STATES.CLOSING_SOON ? 0.9
      : status === STATES.OPEN || status === STATES.UPCOMING ? 0.8
        : status === STATES.CLOSED ? 0.4
          : status === STATES.EXPIRED ? 0.2
            : 0.5;

  return {
    status,
    daysUntilLastDate,
    daysUntilStart,
    includeJobPostingSchema,
    sitemapPriority,
    indexable: true,
    reason: lastDate ? `lastDate:${lastDate}` : "no-last-date"
  };
}

function shouldOmitJobPostingSchema(input, now) {
  return classifyJobLifecycle(input, now).includeJobPostingSchema === false;
}

module.exports = {
  STATES,
  classifyJobLifecycle,
  shouldOmitJobPostingSchema,
  daysUntil
};
