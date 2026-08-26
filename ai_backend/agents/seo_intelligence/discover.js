"use strict";

/**
 * Google Discover / mobile-first quality signals.
 * Improves freshness, image, and title quality — never clickbait.
 */

const CLICKBAIT_RE =
  /\b(you won'?t believe|shocking|must (see|watch)|click here|viral|secret trick|100% guaranteed|जबरदस्त रहस्य)\b/i;

function isAllCapsTitle(title) {
  const letters = String(title || "").replace(/[^A-Za-z]/g, "");
  if (letters.length < 12) return false;
  const caps = letters.replace(/[^A-Z]/g, "").length;
  return caps / letters.length >= 0.85;
}

function scoreDiscoverReadiness({ title, hasImage, wordCount, original = true, updatedAt, publishedAt }) {
  const issues = [];
  const warnings = [];
  let score = 40;

  if (CLICKBAIT_RE.test(title || "")) {
    issues.push("discover:clickbait-title");
  } else {
    score += 15;
  }
  if (isAllCapsTitle(title)) {
    issues.push("discover:all-caps-title");
  } else {
    score += 10;
  }
  if (hasImage) score += 15;
  else warnings.push("discover:missing-image");
  if (Number(wordCount) >= 400) score += 10;
  if (original) score += 10;
  else issues.push("discover:not-original");

  const modified = updatedAt || publishedAt;
  if (modified) score += 5;

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    warnings,
    clickbait: issues.includes("discover:clickbait-title")
  };
}

module.exports = {
  CLICKBAIT_RE,
  isAllCapsTitle,
  scoreDiscoverReadiness
};
