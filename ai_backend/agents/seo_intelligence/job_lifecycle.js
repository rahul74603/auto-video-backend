"use strict";

/**
 * Job lifecycle — classify OPEN / CLOSING_SOON / CLOSED / EXPIRED.
 *
 * Never deletes documents. Expired pages stay up as reference (users still
 * search old notifications) but JobPosting schema should be omitted.
 *
 * Calendar math uses Asia/Kolkata via the canonical date_normalizer.
 */

const { daysUntilInIndia } = require("../growth/date_normalizer");

const STATES = Object.freeze({
  UPCOMING: "UPCOMING",
  OPEN: "OPEN",
  CLOSING_SOON: "CLOSING_SOON",
  CLOSED: "CLOSED",
  EXPIRED: "EXPIRED",
  UNKNOWN: "UNKNOWN"
});

function daysUntil(dateValue, now) {
  return daysUntilInIndia(dateValue, now);
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

function lifecycleFieldsEqual(existing, next) {
  if (!existing || !next) return false;
  return existing.lifecycleStatus === next.status
    && existing.includeJobPostingSchema === next.includeJobPostingSchema
    && Number(existing.sitemapPriority) === Number(next.sitemapPriority);
}

module.exports = {
  STATES,
  classifyJobLifecycle,
  shouldOmitJobPostingSchema,
  daysUntil,
  lifecycleFieldsEqual
};
