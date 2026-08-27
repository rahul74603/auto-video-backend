"use strict";

/**
 * Cheerio-free HTML safety for SEO articleHtml proposals.
 * Strips script/iframe/js URLs. Optional cheerio sanitizer is used at apply
 * time when article_html_utils is available.
 */

const FORBIDDEN_TAG_RE = /<\/?(script|iframe|object|embed|form|link|meta|base|svg|math)\b/i;
const JS_URL_RE = /^\s*(javascript|vbscript|data):/i;
const EVENT_ATTR_RE = /\son[a-z]+\s*=/i;

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripTags(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stripUnsafeHtml(html) {
  let out = String(html || "");
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  out = out.replace(/<object[\s\S]*?<\/object>/gi, "");
  out = out.replace(/<embed[\s\S]*?>/gi, "");
  out = out.replace(/<form[\s\S]*?<\/form>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/\s(href|src)\s*=\s*(['"])\s*(javascript|vbscript|data):[^'"]*\2/gi, " $1=\"#\"");
  return out;
}

function htmlSafetyIssues(html) {
  const source = String(html || "");
  const issues = [];
  if (FORBIDDEN_TAG_RE.test(source)) issues.push("html:forbidden-tag");
  if (EVENT_ATTR_RE.test(source)) issues.push("html:event-handler");
  if (/javascript:/i.test(source) || /vbscript:/i.test(source)) issues.push("html:javascript-url");
  const hrefs = source.match(/\b(?:href|src)\s*=\s*["']([^"']+)/gi) || [];
  for (const raw of hrefs) {
    const url = raw.replace(/^[^=]+=\s*["']/, "");
    if (JS_URL_RE.test(url)) issues.push("html:javascript-url");
  }
  return [...new Set(issues)];
}

function isSafeInternalHref(href) {
  const url = String(href || "").trim();
  if (!url) return false;
  if (url.startsWith("#")) return true;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    return parsed.hostname === "studygyaan.in" || parsed.hostname.endsWith(".studygyaan.in");
  } catch {
    return false;
  }
}

function sanitizeProposalHtml(html) {
  const stripped = stripUnsafeHtml(html);
  const issues = htmlSafetyIssues(stripped);
  return { html: stripped, issues, ok: issues.length === 0 };
}

function tryNormalizeWithCheerio(html, h1) {
  try {
    const utils = require("../article_agents/article_html_utils");
    return utils.normalizeArticleHtml(html, { h1 });
  } catch {
    return stripUnsafeHtml(html);
  }
}

module.exports = {
  escapeHtml,
  stripTags,
  stripUnsafeHtml,
  htmlSafetyIssues,
  isSafeInternalHref,
  sanitizeProposalHtml,
  tryNormalizeWithCheerio
};
