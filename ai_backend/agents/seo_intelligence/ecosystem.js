"use strict";

/**
 * P3 helpers: website ↔ YouTube loop, mock-test matching, page analytics stubs.
 * Never creates videos or mock tests. Only links existing published records.
 */

const { detectExamFamily, detectContentKind, CONTENT_KINDS } = require("./taxonomy");

function youtubeIdFromUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.replace(/^\//, "").slice(0, 20);
    if (parsed.searchParams.get("v")) return parsed.searchParams.get("v").slice(0, 20);
    const embed = parsed.pathname.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
    if (embed) return embed[1];
  } catch {
    /* ignore */
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  return "";
}

function extractYoutubeRef(doc) {
  const url = doc?.youtubeUrl || doc?.youtube || "";
  const id = doc?.youtubeVideoId || youtubeIdFromUrl(url);
  if (!id && !url) return null;
  return {
    youtubeVideoId: id || "",
    youtubeUrl: url || (id ? `https://www.youtube.com/watch?v=${id}` : "")
  };
}

function titleTokens(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function titleOverlap(a, b) {
  const left = new Set(titleTokens(a));
  const right = titleTokens(b);
  if (!left.size || !right.length) return 0;
  let hits = 0;
  for (const token of right) if (left.has(token)) hits += 1;
  return hits / Math.max(left.size, right.length);
}

function findYoutubeMatches(page, videos, { minOverlap = 0.35 } = {}) {
  const pageFamily = page.examFamily || detectExamFamily(page);
  const matches = [];
  for (const video of videos || []) {
    const ref = extractYoutubeRef(video);
    if (!ref) continue;
    const family = video.examFamily || detectExamFamily(video);
    const overlap = titleOverlap(page.title, video.title);
    if (family !== pageFamily && overlap < minOverlap) continue;
    if (overlap < minOverlap && family === "GENERAL") continue;
    if (overlap < minOverlap && family !== pageFamily) continue;
    matches.push({
      ...ref,
      title: String(video.title || "").slice(0, 140),
      overlap: Number(overlap.toFixed(3)),
      examFamily: family
    });
  }
  matches.sort((a, b) => b.overlap - a.overlap);
  return matches.slice(0, 3);
}

function findRelatedMockTests(page, tests, limit = 4) {
  const family = page.examFamily || detectExamFamily(page);
  const scored = [];
  for (const test of tests || []) {
    if (String(test.status || "published").toLowerCase() === "draft") continue;
    const testFamily = test.examFamily || detectExamFamily(test);
    const kind = test.contentKind || detectContentKind(test);
    if (kind !== CONTENT_KINDS.MOCK_TEST && kind !== CONTENT_KINDS.OTHER) continue;
    let score = 0;
    if (family !== "GENERAL" && testFamily === family) score += 50;
    score += Math.round(titleOverlap(page.title, test.title) * 40);
    if (score < 30) continue;
    const slug = test.slug || test.id;
    if (!slug) continue;
    scored.push({
      title: String(test.title || "").slice(0, 140),
      url: `/test/${encodeURIComponent(slug)}`,
      kind: "MOCK_TEST",
      examFamily: testFamily,
      score
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function pageAnalyticsSnapshot(doc) {
  return {
    views: Number(doc?.views) || 0,
    wordCount: Number(doc?.wordCount) || 0,
    hasArticle: Boolean(doc?.articleHtml),
    hasFaqs: Array.isArray(doc?.faqs) && doc.faqs.length > 0,
    hasYoutube: Boolean(extractYoutubeRef(doc))
  };
}

module.exports = {
  youtubeIdFromUrl,
  extractYoutubeRef,
  titleOverlap,
  findYoutubeMatches,
  findRelatedMockTests,
  pageAnalyticsSnapshot
};
