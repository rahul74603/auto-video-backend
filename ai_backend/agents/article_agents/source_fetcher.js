"use strict";

/**
 * Source Fetcher — safely fetch a given official URL/notification page and
 * extract grounded material (text, tables, links) for the article agents.
 *
 * Safety rules:
 *  - only http/https URLs are allowed (no file:, data:, javascript: ...)
 *  - no embedded credentials (user:pass@host)
 *  - localhost / private / link-local / loopback hosts are refused (SSRF guard)
 *  - bounded size, explicit timeout and redirect cap
 */

const axios = require("axios");
const cheerio = require("cheerio");

const MAX_TEXT_CHARS = 24000;
const MAX_TABLES = 25;
const MAX_TABLE_ROWS = 80;
const MAX_TABLE_CELLS = 14;
const MAX_LINKS = 120;

function isPrivateHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]"
  ) {
    return true;
  }
  // Raw IPv4 literal checks
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;                    // 10.0.0.0/8
    if (a === 127) return true;                   // loopback
    if (a === 169 && b === 254) return true;      // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;      // 192.168.0.0/16
    if (a === 0) return true;
  }
  if (host.startsWith("fe80:") || host.startsWith("[fe80:")) return true;
  if (host.startsWith("fc") || host.startsWith("fd")) {
    // Unique-local IPv6 (fc00::/7) — only relevant when a literal v6 host is used.
    if (host.includes(":")) return true;
  }
  return false;
}

/**
 * Validate and normalize a source URL. Throws with .code = "INVALID_SOURCE_URL".
 * @returns {URL} parsed URL object
 */
function assertSafeSourceUrl(rawUrl) {
  const fail = (message) => {
    const err = new Error(message);
    err.code = "INVALID_SOURCE_URL";
    throw err;
  };

  if (!rawUrl || typeof rawUrl !== "string") fail("Source URL is required");
  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) fail("Source URL is too long");

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    fail(`Source URL is not a valid URL: ${trimmed.slice(0, 80)}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail("Only http/https source URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    fail("Source URL must not contain credentials");
  }
  if (isPrivateHostname(parsed.hostname)) {
    fail("Source URL points to a private/local host");
  }
  return parsed;
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/**
 * Extract grounded material from raw HTML: page title, readable text,
 * tables as row arrays and official-looking links (absolute).
 */
function extractFromHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, form, nav, footer, header, aside, .sidebar, #sidebar, .advertisement, .ads").remove();

  const pageTitle =
    normalizeWhitespace($('meta[property="og:title"]').attr("content")) ||
    normalizeWhitespace($("title").first().text()) ||
    normalizeWhitespace($("h1").first().text());

  const metaDescription = normalizeWhitespace(
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content")
  );

  // Tables → structured rows (dates/fees/vacancy data usually lives here).
  const tables = [];
  $("table").each((_, table) => {
    if (tables.length >= MAX_TABLES) return false;
    const rows = [];
    $(table).find("tr").each((__, row) => {
      if (rows.length >= MAX_TABLE_ROWS) return false;
      const cells = [];
      $(row).find("th, td").each((___, cell) => {
        if (cells.length >= MAX_TABLE_CELLS) return false;
        const text = normalizeWhitespace($(cell).text()).slice(0, 300);
        if (text) cells.push(text);
      });
      if (cells.length) rows.push(cells);
    });
    if (rows.length) tables.push(rows);
  });

  // Links → absolute URLs only; keep anchor text as context.
  const links = [];
  const seen = new Set();
  $("a[href]").each((_, el) => {
    if (links.length >= MAX_LINKS) return false;
    const href = ($(el).attr("href") || "").trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;
    let absolute;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    if (seen.has(absolute)) return;
    seen.add(absolute);
    const text = normalizeWhitespace($(el).text()).slice(0, 200);
    links.push({ text, url: absolute });
  });

  const mainText =
    normalizeWhitespace($("article, main, .post-body, .entry-content, .post, #content").first().text()) ||
    normalizeWhitespace($("body").text());

  return {
    pageTitle: pageTitle.slice(0, 250),
    metaDescription: metaDescription.slice(0, 400),
    text: mainText.slice(0, MAX_TEXT_CHARS),
    tables,
    links
  };
}

/**
 * Fetch a URL and extract source material.
 * deps.httpGet is injectable for tests; must resolve to { data, headers }.
 */
async function fetchAndExtractSource(rawUrl, deps = {}) {
  const parsed = assertSafeSourceUrl(rawUrl);

  const httpGet =
    deps.httpGet ||
    ((url) =>
      axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; StudyGyaanBot/1.0)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9"
        },
        timeout: deps.timeoutMs || 25000,
        maxRedirects: 5,
        maxContentLength: 6 * 1024 * 1024,
        responseType: "text",
        validateStatus: (status) => status >= 200 && status < 300
      }));

  let response;
  try {
    response = await httpGet(parsed.toString());
  } catch (err) {
    const wrapped = new Error(`Source fetch failed: ${err.message}`);
    wrapped.code = "SOURCE_FETCH_FAILED";
    throw wrapped;
  }

  const rawHtml = typeof response.data === "string" ? response.data : String(response.data || "");
  if (rawHtml.length < 80) {
    const err = new Error("Source page is empty or unreadable");
    err.code = "SOURCE_TOO_THIN";
    throw err;
  }

  const extracted = extractFromHtml(rawHtml, parsed.toString());
  if (!extracted.text || extracted.text.length < 120) {
    const err = new Error("Source page has too little readable text to ground an article");
    err.code = "SOURCE_TOO_THIN";
    throw err;
  }

  return {
    ok: true,
    url: parsed.toString(),
    fetchedAt: new Date().toISOString(),
    ...extracted
  };
}

module.exports = {
  assertSafeSourceUrl,
  fetchAndExtractSource,
  extractFromHtml,
  isPrivateHostname,
  MAX_TEXT_CHARS
};
