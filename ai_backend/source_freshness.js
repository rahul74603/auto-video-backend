"use strict";

const cheerio = require("cheerio");

const DEFAULT_MAX_AGE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function parsePublishedAt(...values) {
  for (const value of values.flat()) {
    if (!value) continue;
    const d = value instanceof Date ? value : new Date(String(value));
    const ms = d.getTime();
    if (Number.isFinite(ms) && ms > Date.UTC(2000, 0, 1)) return ms;
  }
  return 0;
}

function isRecentPublication(value, { now = Date.now(), maxAgeDays = DEFAULT_MAX_AGE_DAYS } = {}) {
  const publishedAt = typeof value === "number" ? value : parsePublishedAt(value);
  if (!publishedAt) return false; // unknown date is not considered verified/fresh
  const age = now - publishedAt;
  return age >= -DAY_MS && age <= maxAgeDays * DAY_MS;
}

function extractPublishedAtFromHtml(html) {
  if (!html) return 0;
  const $ = cheerio.load(String(html));
  const candidates = [];
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[property="og:published_time"]',
    'meta[name="datePublished"]',
    'meta[name="pubdate"]',
    'meta[name="publishdate"]',
    'meta[itemprop="datePublished"]',
    'time[itemprop="datePublished"]',
    'time[datetime]'
  ];
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const value = $(el).attr("content") || $(el).attr("datetime") || $(el).text();
      if (value) candidates.push(value.trim());
    });
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        for (const key of ["datePublished", "dateCreated", "uploadDate"]) {
          if (typeof node[key] === "string") candidates.push(node[key]);
        }
        if (Array.isArray(node)) node.forEach(visit);
        else Object.values(node).forEach(visit);
      };
      visit(parsed);
    } catch {
      // Invalid/non-JSON-LD script is ignored.
    }
  });
  return parsePublishedAt(candidates);
}

function parseDeadline(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  let year; let month; let day;
  const numeric = text.match(/\b(\d{1,2})[\/. -](\d{1,2})[\/. -](20\d{2})\b/);
  if (numeric) {
    day = Number(numeric[1]); month = Number(numeric[2]); year = Number(numeric[3]);
  } else {
    const named = text.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b/);
    if (named) {
      const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      const key = named[2].slice(0, 3).toLowerCase();
      day = Number(named[1]); month = months[key]; year = Number(named[3]);
    } else {
      const parsed = parsePublishedAt(text);
      if (!parsed) return 0;
      const d = new Date(parsed);
      day = d.getUTCDate(); month = d.getUTCMonth() + 1; year = d.getUTCFullYear();
    }
  }
  if (!month || month < 1 || month > 12 || day < 1 || day > 31) return 0;
  const nextDayUtc = Date.UTC(year, month - 1, day + 1);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (normalized.getUTCMonth() + 1 !== month || normalized.getUTCDate() !== day) return 0;
  // Last date is interpreted as end-of-day India time.
  return nextDayUtc - 1 - 5.5 * 60 * 60 * 1000;
}

function isDeadlineExpired(value, now = Date.now()) {
  const deadline = parseDeadline(value);
  return deadline > 0 && deadline < now;
}

function isRecentFeedItem(item, options = {}) {
  const date = parsePublishedAt(item && item.isoDate, item && item.pubDate, item && item.publishedAt);
  return date > 0 && isRecentPublication(date, options);
}

module.exports = {
  DEFAULT_MAX_AGE_DAYS,
  DAY_MS,
  parsePublishedAt,
  isRecentPublication,
  extractPublishedAtFromHtml,
  isDeadlineExpired,
  parseDeadline,
  isRecentFeedItem,
};
