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
// ===== Word policy (ADMIN ne final ki hai) =====
// Minimum type ke hisaab se; upar ki taraf koi HARD limit NAHI — grounded
// content jitna detailed ho, publish ho sakta hai.
const WORD_TARGET_MIN_JOB = 1600;
const WORD_TARGET_MIN_FAST_TRACK = 1200;
const WORD_TARGET_MIN = WORD_TARGET_MIN_JOB; // legacy alias (JOB references)
const WORD_TARGET_MAX = 2500; // sirf prompt me guidance-target ke liye (review ISSUE nahi banta)
const WORD_WARN_HIGH = 4500; // iske upar sirf soft WARNING (publish block nahi)
const WORD_COMPRESS_TRIGGER = 5500; // runaway/truncation safety valve — practice me kabhi nahi chalta

// ⭐ WRITER SAFETY-MARGIN targets — reviewer ke hard-minimum se UPAR rakhe hain
// taaki LLM thoda kam bhi likhe to bhi review pass ho jaye (bare-minimum likhne
// par word-count/FAQ/H2 fail hota tha → "50-60 baar me ek baar sahi" wali problem).
const WORD_AIM_JOB = 2000;      // reviewer minimum 1600 → aim 2000 (400-word buffer)
const WORD_AIM_FAST_TRACK = 1500; // reviewer minimum 1200 → aim 1500 (300-word buffer)
const FAQ_AIM_JOB = 6;          // reviewer minimum 4 → aim 6
const FAQ_AIM_FAST_TRACK = 5;   // reviewer minimum 4 → aim 5
const H2_AIM = 8;               // JOB: reviewer minimum 4 → aim 8 (fixed list me 12 sections)
const H2_AIM_FAST_TRACK = 6;    // FT: reviewer minimum 4 → aim 6 (fixed list me 7 sections)

// ⭐ SELF-HEALING AGENT LOOP — review fail hone par writer ko issues feedback
// dekar automatically dobara likhwata hai (manual REGENERATE ki zaroorat nahi).
// 1 = purana one-shot behaviour; 2-3 recommended. Latency cap: Cloud Function
// timeout 300s hai, isliye 3 se zyada practical nahi.
const MAX_REPAIR_ATTEMPTS = Math.max(
  1,
  Math.min(3, Number(process.env.AI_MAX_REPAIR_ATTEMPTS) || 3)
);

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
  WORD_TARGET_MIN_JOB,
  WORD_TARGET_MIN_FAST_TRACK,
  WORD_AIM_JOB,
  WORD_AIM_FAST_TRACK,
  FAQ_AIM_JOB,
  FAQ_AIM_FAST_TRACK,
  H2_AIM,
  H2_AIM_FAST_TRACK,
  WORD_WARN_HIGH,
  WORD_COMPRESS_TRIGGER,
  MAX_REPAIR_ATTEMPTS,
  BLOCKED_DOMAINS,
  OUR_SOCIAL_LINKS,
  FAST_TRACK_CATEGORIES,
  isBlockedDomain
};
