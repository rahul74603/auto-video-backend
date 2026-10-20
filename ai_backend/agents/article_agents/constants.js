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

// LONG-FORM SEO POLICY (Oct 2026): job articles DETAILED aur SEO-rich hone
// chahiye — sarkariresult/freejobalert style lambaa coverage. Ye floors thin/
// truncated output ko reject karte hain; prompts me 1500-2200 words ka target
// hai. Facts ab bhi sirf source se — lambaai structure + explanation se aayegi,
// invented data se kabhi nahi.
const WORD_TARGET_MIN_JOB = 600;
const WORD_TARGET_MIN_FAST_TRACK = 80;
const WORD_TARGET_MIN = WORD_TARGET_MIN_JOB; // legacy alias (JOB references)
const WORD_TARGET_MAX = 2500; // soft compression guidance only
const WORD_WARN_HIGH = 3000; // long drafts get a soft warning, not a quality bonus
const WORD_COMPRESS_TRIGGER = 4500; // runaway/truncation safety valve

const WORD_AIM_JOB = 1800;
const WORD_AIM_FAST_TRACK = 400;
const FAQ_AIM_JOB = 10;         // 8-12 FAQs ka guidance (source-backed, unique)
const FAQ_AIM_FAST_TRACK = 2;   // optional maximum guidance, not a quota
const H2_AIM = 10;              // rich section structure: dates/vacancy/eligibility/age/salary/fee/selection/apply/links/faq
const H2_AIM_FAST_TRACK = 2;

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
  // Root-relative paths are same-origin internal links — never a blocked
  // domain. (Previously these were treated as unparseable and got stripped
  // from article HTML by dropBlockedLinks, silently removing every internal
  // link anchor.) Protocol-relative URLs ("//host/...") stay blocked.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return false;
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
