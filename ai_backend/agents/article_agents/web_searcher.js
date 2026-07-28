"use strict";

/**
 * ======================================================
 *  WEB SEARCHER AGENT (no-key internet search fallback)
 * ======================================================
 * Jab admin ka diya hua link:
 *   - galat / form-portal ho, ya
 *   - patla ho (important jaankari nahi mili), ya
 *   - diya hi na gaya ho,
 * tab ye agent khud internet par search karke notification dhoondhta hai.
 *
 * No paid APIs / no keys:
 *   1. DuckDuckGo HTML endpoint (public results)
 *   2. Google News RSS (rss-parser — already a dependency)
 *
 * Candidate scoring official sources ko upar rakhta hai
 * (.gov.in/.nic.in/.ac.in/.cdac.in...), aggregator/blog/form-portal/own site
 * ko reject karta hai. Har candidate SOURCE_FETCHER ke SSRF-guard se hi
 * fetch hota hai. Grounding wahi rule: article sirf fetched content se banta hai.
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { isBlockedDomain } = require("./constants");
const { fetchAndExtractSource, BROWSER_HEADERS } = require("./source_fetcher");

const MAX_CANDIDATES = 8;
const MAX_FETCH_TRIES = 3;
const MIN_USEFUL_TEXT = 600;

// Kabhi bhi source ke roop me use na karne wale domains
const SEARCH_EXCLUDED_DOMAINS = [
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "t.me",
  "telegram.",
  "whatsapp.com",
  "wa.me",
  "twitter.com",
  "x.com",
  "studygyaan.in" // apni hi site se grounding loop nahi chahiye
];

const OFFICIAL_DOMAIN_HINTS = [".gov.in", ".nic.in", ".ac.in", ".gov", ".cdac.in", ".org.in", ".isro.gov.in", ".govt."];
const NOTIFICATION_WORDS = /(notification|notif|advt|advertisement|recruit|vacanc|corrigendum|apply|src|notice)/i;

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isExcluded(url) {
  const host = hostOf(url);
  if (!host) return true;
  return SEARCH_EXCLUDED_DOMAINS.some((d) => host.includes(d));
}

/** DDG redirect links (//duckduckgo.com/l/?uddg=...) → asli URL. */
function unwrapDuckDuckGo(href) {
  if (!href) return "";
  let out = href.trim();
  if (out.startsWith("//")) out = `https:${out}`;
  try {
    const u = new URL(out);
    const inner = u.searchParams.get("uddg");
    if (inner) return decodeURIComponent(inner);
    return out;
  } catch {
    return "";
  }
}

/** DuckDuckGo HTML se result links nikaale. */
async function searchDuckDuckGo(query, httpGet) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const resp = await httpGet(url);
  const html = typeof resp.data === "string" ? resp.data : Buffer.from(resp.data).toString("utf-8");
  const $ = cheerio.load(html);
  const links = [];
  $("a.result__a").each((_, el) => {
    if (links.length >= MAX_CANDIDATES * 2) return false;
    const text = $(el).text().trim().slice(0, 200);
    const url2 = unwrapDuckDuckGo($(el).attr("href") || "");
    if (url2 && /^https?:/i.test(url2)) links.push({ title: text, url: url2, via: "duckduckgo" });
  });
  return links;
}

/** Google News RSS se recent items. */
async function searchGoogleNews(query, deps = {}) {
  const Parser = deps.RssParser || require("rss-parser");
  const parser = new Parser({ timeout: 15000 });
  const feed = await parser.parseURL(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=hi&gl=IN&ceid=IN:hi`
  );
  return (feed.items || []).slice(0, MAX_CANDIDATES).map((item) => ({
    title: String(item.title || "").trim().slice(0, 200),
    url: String(item.link || ""),
    via: "google-news"
  }));
}

/** Combined search: dono sources se candidates, dedupe by URL. */
async function searchWeb(query, deps = {}) {
  const httpGet =
    deps.httpGet ||
    ((url) =>
      axios.get(url, {
        headers: BROWSER_HEADERS,
        timeout: deps.timeoutMs || 15000,
        maxRedirects: 3,
        responseType: "text",
        validateStatus: (s) => s >= 200 && s < 300
      }));

  const results = [];
  const seen = new Set();
  const pushAll = (items) => {
    for (const item of items || []) {
      if (!item.url || !/^https?:/i.test(item.url)) continue;
      if (isExcluded(item.url) || isBlockedDomain(item.url)) continue;
      const key = item.url.replace(/\/+$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
      if (results.length >= MAX_CANDIDATES) return;
    }
  };

  const [ddg, news] = await Promise.allSettled([searchDuckDuckGo(query, httpGet), searchGoogleNews(query, deps)]);
  if (ddg.status === "fulfilled") pushAll(ddg.value);
  if (news.status === "fulfilled") pushAll(news.value);
  return results;
}

/** Official + notification-ish candidates ko upar score do. */
function scoreCandidate(item) {
  const host = hostOf(item.url);
  const text = `${item.title || ""} ${item.url}`;
  let score = 0;
  if (OFFICIAL_DOMAIN_HINTS.some((d) => host.endsWith(d) || host.includes(d))) score += 4;
  if (NOTIFICATION_WORDS.test(text)) score += 2;
  if (/\.pdf(\?|#|$)/i.test(item.url)) score += 3;
  if (item.via === "duckduckgo") score += 1; // general web > news-only for official pages
  return score;
}

/**
 * Query se best source dhoondh kar FETCH karke laata hai.
 * Top candidates sequentially try hota hai; kaafi text (>=600 chars) milte hi
 * wahi source return hota hai. Sab fail → SOURCE_FETCH_FAILED.
 */
async function searchAndFetchSource(query, deps = {}) {
  const candidates = await searchWeb(query, deps);
  const ranked = [...candidates].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  const tried = [];
  for (const cand of ranked.slice(0, MAX_FETCH_TRIES)) {
    tried.push(hostOf(cand.url));
    try {
      // deps.sourceHttpGet = sirf tests ke liye injectable fetcher; production me undefined
      const source = await fetchAndExtractSource(cand.url, {
        timeoutMs: deps.timeoutMs || 20000,
        httpGet: deps.sourceHttpGet
      });
      if (source.text && source.text.length >= MIN_USEFUL_TEXT) {
        return {
          ...source,
          via: "search",
          searchedQuery: query,
          foundTitle: cand.title || ""
        };
      }
    } catch (e) {
      console.warn(`web-search: candidate fail (${hostOf(cand.url)}):`, e.message);
    }
  }

  const err = new Error(
    `Internet par "${query}" ke liye koi kaam ki notification nahi mil payi` +
      (tried.length ? ` (try kiye: ${tried.join(", ")})` : "") +
      ". Behtar ho to official NOTIFICATION page ya PDF ka DIRECT link khud daalo."
  );
  err.code = "SOURCE_FETCH_FAILED";
  err.searchedQuery = query;
  throw err;
}

/**
 * Search query banao: admin instructions (wand se "Job: title | org | category")
 * se clean text + saal + notification shabd.
 */
function buildSearchQuery(instructions, sourceUrlHint) {
  let base = String(instructions || "").replace(/\s+/g, " ").trim();
  base = base.replace(/^(job|fast\s*track)\s*:\s*/i, "");
  if (!base && sourceUrlHint) {
    base = hostOf(sourceUrlHint).replace(/^www\./, "").split(".")[0] || "";
  }
  base = base.replace(/[|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!base) return "";
  const year = new Date().getFullYear();
  return `${base} notification ${year}`;
}

module.exports = {
  searchWeb,
  searchAndFetchSource,
  buildSearchQuery,
  scoreCandidate,
  unwrapDuckDuckGo,
  isExcluded,
  MIN_USEFUL_TEXT
};
