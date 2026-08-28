"use strict";

/**
 * Extra Search Console intelligence when real imported rows exist.
 * Never fabricates metrics. No live Search Analytics API in this module
 * (credentials stay in GitHub Actions / existing GSC JSON import).
 */

const { normalizeGscRows, isStudyGyaanPage } = require("./intelligence");

function pathOf(page) {
  const value = String(page || "");
  if (value.startsWith("/")) return value.split("?")[0];
  try {
    return new URL(value).pathname;
  } catch {
    return "";
  }
}

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3);
}

function queryPageMismatch(row) {
  const queryTokens = tokens(row.query);
  const pageTokens = tokens(`${row.page} ${pathOf(row.page)}`);
  if (!queryTokens.length || !pageTokens.length) return false;
  const hits = queryTokens.filter((token) => pageTokens.some((part) => part.includes(token) || token.includes(part)));
  return hits.length === 0;
}

function analyzeGscRows(rows, previousRows = null) {
  const current = normalizeGscRows(rows);
  if (!current.length) {
    return {
      status: "unavailable",
      reason: "no imported GSC rows",
      insights: [],
      fabricated: false
    };
  }

  const insights = [];
  const lowCtr = current.filter((row) => row.impressions >= 100 && row.ctr < 0.02 && row.position > 0 && row.position <= 15);
  for (const row of lowCtr.slice(0, 15)) {
    insights.push({
      kind: "GSC_LOW_CTR",
      page: row.page,
      query: row.query,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      reason: "High impressions with low CTR on an imported Search Console row.",
      autoCreate: false
    });
  }

  const midPack = current.filter((row) => row.position >= 4 && row.position <= 15 && row.impressions >= 50);
  for (const row of midPack.slice(0, 10)) {
    insights.push({
      kind: "GSC_POSITION_4_15",
      page: row.page,
      query: row.query,
      position: row.position,
      impressions: row.impressions,
      reason: "Imported row is in positions 4–15. Title/intent alignment may help. Not a ranking guarantee.",
      autoCreate: false
    });
  }

  for (const row of current.slice(0, 80)) {
    if (queryPageMismatch(row) && row.impressions >= 40) {
      insights.push({
        kind: "GSC_QUERY_PAGE_MISMATCH",
        page: row.page,
        query: row.query,
        reason: "Query tokens do not appear in the page path. Confirm the page actually answers this query.",
        autoCreate: false
      });
    }
  }

  const byQuery = new Map();
  for (const row of current) {
    if (!row.query) continue;
    if (!byQuery.has(row.query)) byQuery.set(row.query, []);
    byQuery.get(row.query).push(row);
  }
  for (const [query, list] of byQuery) {
    const pages = [...new Set(list.map((row) => pathOf(row.page)).filter(Boolean))];
    if (pages.length >= 2 && list.some((row) => row.impressions >= 30)) {
      insights.push({
        kind: "GSC_CANNIBALIZATION",
        query,
        pages: pages.slice(0, 6),
        reason: "Same imported query appears on multiple StudyGyaan URLs. Review, do not auto-merge.",
        autoCreate: false
      });
    }
  }

  const prev = previousRows ? normalizeGscRows(previousRows) : [];
  if (prev.length) {
    const prevByPage = new Map(prev.map((row) => [`${pathOf(row.page)}|${row.query}`, row]));
    for (const row of current) {
      const before = prevByPage.get(`${pathOf(row.page)}|${row.query}`);
      if (!before) continue;
      if (before.impressions >= 80 && row.impressions <= before.impressions * 0.6) {
        insights.push({
          kind: "GSC_DECLINING",
          page: row.page,
          query: row.query,
          before: before.impressions,
          after: row.impressions,
          reason: "Imported impressions dropped vs previous snapshot. Not a Google penalty claim.",
          autoCreate: false
        });
      }
    }
  }

  return {
    status: "observed",
    reason: null,
    rowCount: current.length,
    insights: insights.slice(0, 40),
    fabricated: false,
    note: "GSC insights use imported rows only. Missing data stays unavailable."
  };
}

function gscStatusForPage(rows, url) {
  const list = normalizeGscRows(rows);
  const path = pathOf(url);
  const matches = list.filter((row) => isStudyGyaanPage(row.page) && pathOf(row.page) === path);
  if (!matches.length) return { status: "unavailable", reason: "no imported GSC row for this URL", fabricated: false };
  return { status: "observed", rowCount: matches.length, fabricated: false };
}

module.exports = {
  analyzeGscRows,
  gscStatusForPage,
  queryPageMismatch
};
