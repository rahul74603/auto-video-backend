"use strict";

/**
 * Human editorial quality gate — extra checks on top of Fact & Quality review.
 *
 * Goal: useful, original, source-grounded writing for real students.
 * Explicitly NOT an "AI detector" and NOT a disguise layer.
 */

const { plainText } = require("../article_agents/article_html_utils");
const { scoreFaqUsefulness } = require("./article_faq");
const { scoreDiscoverReadiness, CLICKBAIT_RE } = require("./discover");
const { findImagesMissingAlt } = require("./image_seo");

const PLACEHOLDER_RE = /\b(lorem ipsum|TODO|TBD|coming soon|insert (text|content) here)\b/i;
const HEDGING_TITLE_RE = /\b(संभावित|expected|likely|anticipated|rumou?r|aane\s*wala|kab\s*aayega)\b/i;

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[।.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 40);
}

function consecutiveRepeatCount(sentences) {
  let best = 1;
  let run = 1;
  for (let i = 1; i < sentences.length; i += 1) {
    if (sentences[i] === sentences[i - 1]) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

function emptyHeadingCount(html) {
  const source = String(html || "");
  const matches = source.match(/<h2\b[^>]*>[\s\S]*?<\/h2>\s*(?:<h2\b|<\/div>\s*$)/gi) || [];
  return matches.length;
}

function reviewEditorialQuality({ type, article } = {}) {
  const issues = [];
  const warnings = [];
  const metrics = { editorialGate: true };

  if (!article || typeof article !== "object") {
    return { issues: ["editorial:article-missing"], warnings, metrics };
  }

  const title = String(article.seoTitle || article.h1 || article.facts?.title || "");
  const html = article.contentHtml || "";
  const body = plainText(html);

  if (CLICKBAIT_RE.test(title)) issues.push("editorial:clickbait-title");
  if (HEDGING_TITLE_RE.test(title)) issues.push("editorial:hedging-title");
  if (PLACEHOLDER_RE.test(body) || PLACEHOLDER_RE.test(title)) issues.push("editorial:placeholder-content");

  const sentences = splitSentences(body);
  const repeats = consecutiveRepeatCount(sentences);
  metrics.consecutiveRepeat = repeats;
  if (repeats >= 5) issues.push("editorial:repeated-boilerplate");

  if (emptyHeadingCount(html) >= 3) warnings.push("editorial:empty-sections");

  const faqReview = scoreFaqUsefulness(article.faqs);
  issues.push(...faqReview.issues);
  warnings.push(...faqReview.warnings);
  metrics.usefulFaqs = faqReview.usefulCount;

  const discover = scoreDiscoverReadiness({
    title,
    hasImage: Boolean(article.imageUrl || article.ogImage),
    wordCount: article.wordCount || 0,
    original: true
  });
  // Clickbait already issued above; all-caps is a hard fail (spam).
  if (discover.issues.includes("discover:all-caps-title")) issues.push("editorial:all-caps-title");
  warnings.push(...discover.warnings.filter((w) => w !== "discover:missing-image"));
  metrics.discoverScore = discover.score;

  const missingAlt = findImagesMissingAlt(html);
  if (missingAlt.length) warnings.push(`image-seo:missing-alt:${missingAlt.length}`);

  if (String(type || "").toUpperCase() === "JOB") {
    const applyCue = /आवेदन कैसे|how to apply|apply online/i.test(html);
    if (!applyCue) warnings.push("editorial:weak-apply-help");
  }

  return { issues, warnings, metrics };
}

module.exports = {
  reviewEditorialQuality,
  consecutiveRepeatCount,
  splitSentences
};
