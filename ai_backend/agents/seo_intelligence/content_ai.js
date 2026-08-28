"use strict";

/**
 * Optional AI articleHtml proposals for thin BLOG pages.
 *
 * Reuses article_agents/model_client.generateJson. Never writes production.
 * Never invents facts: output is gated against the on-page source blob.
 * Default path is deterministic blog_html.js; this runs only when
 * options.generateJson is injected or options.useAi is true.
 */

const { sanitizeProposalHtml, stripTags } = require("./html_safety");
const { previewFromHtml, existingBody, buildBlogArticleProposal } = require("./blog_html");

function sourceBlob(page) {
  return [
    page.seoTitle || page.title || page.h1 || "",
    existingBody(page),
    page.organization || "",
    page.lastDate || "",
    page.startDate || "",
    page.shortInfo || "",
    page.description || "",
    page.sourceUrl || "",
    page.applyLink || page.directLink || ""
  ].filter(Boolean).join("\n");
}

function numbersIn(text) {
  return [...String(text || "").matchAll(/\d[\d,]*/g)].map((m) => m[0].replace(/,/g, ""));
}

function inventedNumbers(html, blob) {
  const sourceNums = new Set(numbersIn(blob));
  const extras = [];
  for (const n of numbersIn(stripTags(html))) {
    if (n.length < 2) continue;
    if (!sourceNums.has(n)) extras.push(n);
  }
  return extras;
}

function wordCount(text) {
  return stripTags(text).split(/\s+/).filter(Boolean).length;
}

function buildPrompt(page, finding, blob) {
  const words = Number(finding && finding.evidence && finding.evidence.words) || wordCount(blob);
  return [
    "You propose HTML for an existing StudyGyaan blog. You do not publish.",
    "Use ONLY the SOURCE blob. Do not invent salary, vacancies, dates, fees, eligibility, age, official URLs, organization names, or exam facts.",
    "Do not pad to a word-count target. No filler. No 1500-word quota.",
    "If SOURCE is too thin, set insufficientSource=true and articleHtml to empty string.",
    "Return JSON: { articleHtml, confidence, usedFacts, invented, insufficientSource }.",
    "articleHtml may use h1, h2, p, ul, ol, li, table, thead, tbody, tr, th, td, a, strong, em. No script, iframe, or javascript URLs.",
    "Preserve existing facts and any source/citation URL already in SOURCE.",
    `Current body words: ${words}.`,
    "SOURCE:",
    blob.slice(0, 8000)
  ].join("\n");
}

function resolveGenerateJson(options = {}) {
  if (typeof options.generateJson === "function") return options.generateJson;
  if (options.useAi !== true) return null;
  try {
    const client = require("../article_agents/model_client");
    return client.generateJson;
  } catch {
    return null;
  }
}

/**
 * Try AI HTML. On any failure, invented facts, padding, or unsafe HTML,
 * return { used: false } so the caller keeps the deterministic proposal.
 */
async function proposeBlogArticleHtmlWithAi(page, finding = {}, options = {}) {
  const generateJson = resolveGenerateJson(options);
  if (!generateJson) {
    return { used: false, reason: "ai-disabled" };
  }
  const blob = sourceBlob(page);
  if (blob.trim().length < 24) {
    return { used: false, reason: "insufficient-source", insufficientSource: true };
  }
  let parsed;
  try {
    parsed = await generateJson(buildPrompt(page, finding, blob), {
      temperature: 0.15,
      maxOutputTokens: 4096
    });
  } catch (error) {
    return { used: false, reason: `ai-error:${String(error && error.code || error.message || "fail").slice(0, 80)}` };
  }
  if (!parsed || typeof parsed !== "object") {
    return { used: false, reason: "ai-bad-json" };
  }
  if (parsed.invented === true || parsed.insufficientSource === true) {
    return { used: false, reason: parsed.invented ? "ai-marked-invented" : "ai-insufficient-source", insufficientSource: Boolean(parsed.insufficientSource) };
  }
  const raw = String(parsed.articleHtml || "");
  if (!raw.trim()) {
    return { used: false, reason: "ai-empty-html" };
  }
  const extras = inventedNumbers(raw, blob);
  if (extras.length) {
    return { used: false, reason: `ai-ungrounded-number:${extras[0]}` };
  }
  const sourceWords = wordCount(blob);
  const htmlWords = wordCount(raw);
  if (sourceWords < 80 && htmlWords > Math.max(220, sourceWords * 4)) {
    return { used: false, reason: "ai-padding" };
  }
  const safe = sanitizeProposalHtml(raw);
  if (!safe.ok || !safe.html) {
    return { used: false, reason: "ai-unsafe-html" };
  }
  return {
    used: true,
    insufficientSource: false,
    articleHtml: safe.html,
    preview: previewFromHtml(safe.html),
    reason: "AI proposal from on-page source only. Not production. Human review required.",
    confidence: parsed.confidence === "ai" ? "ai" : "heuristic",
    htmlSource: "ai-proposal",
    usedFacts: Array.isArray(parsed.usedFacts) ? parsed.usedFacts.slice(0, 20) : []
  };
}

async function enrichBlogHtmlProposal(page, finding, deterministic, options = {}) {
  const fallback = deterministic || buildBlogArticleProposal(page, finding, options);
  const ai = await proposeBlogArticleHtmlWithAi(page, finding, options);
  if (!ai.used || !ai.articleHtml) return fallback;
  return {
    ...fallback,
    ...ai,
    contentPlan: fallback.contentPlan,
    confidence: "ai",
    htmlSource: "ai-proposal"
  };
}

module.exports = {
  sourceBlob,
  inventedNumbers,
  proposeBlogArticleHtmlWithAi,
  enrichBlogHtmlProposal
};
