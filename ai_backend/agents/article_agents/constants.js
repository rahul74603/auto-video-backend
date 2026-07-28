"use strict";

/**
 * Shared constants for the source-grounded AI Article Agents.
 *
 * There are three separate agents by design:
 *  - Job Article Writer      (job_article_writer.js)
 *  - Fast Track Writer       (fast_track_article_writer.js)
 *  - Fact & Quality Reviewer (fact_quality_reviewer.js)
 *
 * None of them is allowed to invent dates, fees, vacancies or any other fact:
 * every number/date/amount must come from the fetched official source.
 */

const EDITORIAL_AUTHOR = "StudyGyaan Editorial Team";

const ARTICLE_TYPES = Object.freeze({
  JOB: "job",
  FAST_TRACK: "fast-track"
});

// Requirement: 1600-2500 meaningful words per article.
const WORD_TARGET_MIN = 1600;
const WORD_TARGET_MAX = 2500;

// Third-party aggregator domains that must never leak into saved links.
// (Inke pages hum SOURCE ki tarah padh sakte hain, par apne article me
// unke links kabhI nahi lagayenge — sirf official sarkari links + hamare apne.)
const BLOCKED_DOMAINS = Object.freeze([
  "freejobalert.com",
  "sarkariresult.com",
  "rojgarresult.com",
  "sarkariexam.com",
  "naukri.com",
  "shine.com",
  "monster.com",
  "indgovtjobs.in",
  "jagranjosh.com",
  "adda247.com",
  "testbook.com",
  "fresherslive.com",
  "freshersworld.com",
  "sarkarinaukri.com"
]);

// Hamari APNE official channels — article ke end me hamesha yehi lagte hain,
// kisi third-party ke kabhi nahi. (FloatingSocials.tsx ke saath sync rakho.)
const OUR_SOCIAL_LINKS = Object.freeze([
  { label: "YouTube Channel", url: "https://youtube.com/@studygyaan_official" },
  { label: "Telegram Channel", url: "https://t.me/studygyaan_official" },
  { label: "WhatsApp Channel", url: "https://whatsapp.com/channel/0029VbC4vo12ZjCuRpjPrt3b" },
  { label: "Facebook Page", url: "https://www.facebook.com/StudyGyaan.in/" }
]);

// Fast-track update categories used across the site.
const FAST_TRACK_CATEGORIES = Object.freeze([
  "Result",
  "Admit Card",
  "Answer Key",
  "Syllabus",
  "Admission",
  "Other"
]);

function isBlockedDomain(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "#") return false;
  try {
    const hostname = new URL(trimmed).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return true; // unparseable URLs are treated as unsafe
  }
}

module.exports = {
  EDITORIAL_AUTHOR,
  ARTICLE_TYPES,
  WORD_TARGET_MIN,
  WORD_TARGET_MAX,
  BLOCKED_DOMAINS,
  OUR_SOCIAL_LINKS,
  FAST_TRACK_CATEGORIES,
  isBlockedDomain
};
