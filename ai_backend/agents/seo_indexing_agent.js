"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const cheerio = require("cheerio");
const xml2js = require("xml2js");
const admin = require("firebase-admin");
const { google } = require("googleapis");

const DEFAULT_SITE = "https://studygyaan.in";
const DEFAULT_SITEMAP = `${DEFAULT_SITE}/sitemap.xml`;
const USER_AGENT = "StudyGyaan-SEO-Agent/2.0 (+https://studygyaan.in/robots.txt)";
const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const WEBMASTERS_SCOPE = "https://www.googleapis.com/auth/webmasters";
const MAX_SITEMAP_DEPTH = 4;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function intEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value).trim());
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return "";
  }
}

function sameCanonical(left, right) {
  return normalizeUrl(left) === normalizeUrl(right);
}

function parseCredentials() {
  const raw = process.env.SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (firstError) {
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      throw new Error(`SERVICE_ACCOUNT_JSON is invalid JSON: ${firstError.message}`);
    }
  }
}

function ensureFirebase(credentials) {
  if (!admin.apps.length) {
    admin.initializeApp(credentials ? { credential: admin.credential.cert(credentials) } : undefined);
  }
  return admin.firestore();
}

function createGoogleAuth(credentials) {
  if (!credentials) return null;
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [INDEXING_SCOPE, WEBMASTERS_SCOPE]
  });
}

function extractMetaDirectives($) {
  const values = [];
  $("meta").each((_index, element) => {
    const name = String($(element).attr("name") || "").toLowerCase();
    if (name === "robots" || name === "googlebot") {
      values.push(String($(element).attr("content") || "").toLowerCase());
    }
  });
  return values.join(",");
}

function detectSoft404(status, title, visibleText) {
  if (status !== 200) return false;
  const sample = `${title} ${visibleText.slice(0, 1000)}`.toLowerCase();
  return [
    /\b404\b/,
    /page not found/,
    /not found \| studygyaan/,
    /job नहीं मिली/,
    /story नहीं मिली/,
    /test not found/
  ].some((pattern) => pattern.test(sample));
}

function classifyAudit(audit) {
  const issues = [];
  if (audit.networkError) issues.push("network_error");
  else if (audit.status >= 300 && audit.status < 400) issues.push("page_with_redirect");
  else if (audit.status === 404 || audit.status === 410) issues.push("not_found");
  else if (audit.status >= 500) issues.push("server_error");
  else if (audit.status !== 200) issues.push("non_200");

  if (audit.noindex) issues.push("excluded_by_noindex");
  if (audit.soft404) issues.push("soft_404");
  if (audit.status === 200 && !audit.canonical) issues.push("missing_canonical");
  if (audit.canonical && !sameCanonical(audit.url, audit.canonical)) issues.push("canonical_mismatch");
  if (audit.status === 200 && !audit.title) issues.push("missing_title");
  if (audit.status === 200 && audit.wordCount < 80 && !audit.soft404) issues.push("thin_server_response");
  return issues;
}

function isEligibleIndexingApiUrl(url) {
  try {
    // Google Indexing API is not a general web-indexing API. StudyGyaan only
    // submits live JobPosting detail pages; blogs/tests/stories use sitemaps.
    return new URL(url).pathname.startsWith("/job/");
  } catch {
    return false;
  }
}

function isAuditIndexable(audit) {
  return audit.status === 200
    && !audit.noindex
    && !audit.soft404
    && !audit.networkError
    && audit.canonical
    && sameCanonical(audit.url, audit.canonical);
}

async function fetchSitemap(sitemapUrl, seen = new Set(), depth = 0) {
  const normalized = normalizeUrl(sitemapUrl);
  if (!normalized || seen.has(normalized) || depth > MAX_SITEMAP_DEPTH) return [];
  seen.add(normalized);

  const response = await axios.get(normalized, {
    timeout: 30000,
    maxContentLength: 20 * 1024 * 1024,
    headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml,*/*" }
  });

  const parsed = await new xml2js.Parser({ explicitArray: true }).parseStringPromise(response.data);
  if (parsed.sitemapindex?.sitemap) {
    const nested = [];
    for (const item of parsed.sitemapindex.sitemap) {
      const child = item.loc?.[0];
      if (!child) continue;
      nested.push(...await fetchSitemap(child, seen, depth + 1));
    }
    return nested;
  }

  if (!parsed.urlset?.url) return [];
  return parsed.urlset.url
    .map((entry) => ({
      url: normalizeUrl(entry.loc?.[0]),
      lastmod: entry.lastmod?.[0] || null,
      sourceSitemap: normalized
    }))
    .filter((entry) => Boolean(entry.url));
}

async function auditUrl(entry) {
  const url = typeof entry === "string" ? entry : entry.url;
  const startedAt = Date.now();
  const audit = {
    url: normalizeUrl(url),
    lastmod: typeof entry === "object" ? entry.lastmod || null : null,
    sourceSitemap: typeof entry === "object" ? entry.sourceSitemap || null : null,
    status: 0,
    redirectLocation: null,
    canonical: null,
    title: "",
    description: "",
    noindex: false,
    wordCount: 0,
    soft404: false,
    networkError: null,
    durationMs: 0,
    issues: []
  };

  try {
    const response = await axios.get(audit.url, {
      timeout: intEnv("SEO_AUDIT_TIMEOUT_MS", 15000, 2000, 60000),
      maxRedirects: 0,
      validateStatus: () => true,
      maxContentLength: 5 * 1024 * 1024,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" }
    });
    audit.status = response.status;
    audit.redirectLocation = response.headers.location
      ? normalizeUrl(new URL(response.headers.location, audit.url).toString())
      : null;

    if (typeof response.data === "string") {
      const $ = cheerio.load(response.data);
      audit.title = $("title").first().text().replace(/\s+/g, " ").trim();
      audit.description = String($("meta[name='description']").first().attr("content") || "").trim();
      audit.canonical = normalizeUrl($("link[rel='canonical']").first().attr("href") || "") || null;
      const directives = extractMetaDirectives($);
      audit.noindex = /(^|,|\s)noindex($|,|\s)/.test(directives);
      const visibleText = $("body").text().replace(/\s+/g, " ").trim();
      audit.wordCount = visibleText ? visibleText.split(/\s+/).length : 0;
      audit.soft404 = detectSoft404(audit.status, audit.title, visibleText);
    }
  } catch (error) {
    audit.networkError = error.message;
  }

  audit.durationMs = Date.now() - startedAt;
  audit.issues = classifyAudit(audit);
  return audit;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return output;
}

function summarizeAudits(audits) {
  const issues = {};
  for (const audit of audits) {
    for (const issue of audit.issues) issues[issue] = (issues[issue] || 0) + 1;
  }
  return {
    audited: audits.length,
    cleanIndexable: audits.filter(isAuditIndexable).length,
    issueCounts: issues
  };
}

async function inspectWithSearchConsole(auth, urls, siteUrl) {
  if (!auth || !boolEnv("SEARCH_CONSOLE_INSPECTION_ENABLED", true)) {
    return { enabled: false, results: [] };
  }
  const limit = intEnv("SEO_INSPECTION_LIMIT", 25, 0, 200);
  const service = google.searchconsole({ version: "v1", auth });
  const results = [];

  for (const url of urls.slice(0, limit)) {
    try {
      const response = await service.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl: url,
          siteUrl,
          languageCode: "en-US"
        }
      });
      const result = response.data.inspectionResult?.indexStatusResult || {};
      results.push({
        url,
        verdict: result.verdict || "VERDICT_UNSPECIFIED",
        coverageState: result.coverageState || null,
        indexingState: result.indexingState || null,
        robotsTxtState: result.robotsTxtState || null,
        pageFetchState: result.pageFetchState || null,
        googleCanonical: result.googleCanonical || null,
        userCanonical: result.userCanonical || null,
        lastCrawlTime: result.lastCrawlTime || null
      });
    } catch (error) {
      results.push({ url, error: error.message });
      if ([401, 403].includes(error.code)) break;
    }
    await sleep(120);
  }
  return { enabled: true, results };
}

async function submitSitemap(auth, siteUrl, sitemapUrl) {
  if (!auth || !boolEnv("SEARCH_CONSOLE_SITEMAP_SUBMIT_ENABLED", true)) {
    return { attempted: false };
  }
  try {
    const webmasters = google.webmasters({ version: "v3", auth });
    await webmasters.sitemaps.submit({ siteUrl, feedpath: sitemapUrl });
    return { attempted: true, accepted: true };
  } catch (error) {
    return { attempted: true, accepted: false, error: error.message };
  }
}

function signatureFor(entry) {
  return crypto.createHash("sha256").update(`${entry.url}|${entry.lastmod || "unknown"}`).digest("hex");
}

async function loadNotificationState(db) {
  if (!db) return {};
  const snapshot = await db.collection("system_configs").doc("indexing_notification_state_v2").get();
  return snapshot.exists ? (snapshot.data().signatures || {}) : {};
}

async function saveNotificationState(db, signatures) {
  if (!db) return;
  const entries = Object.entries(signatures).slice(-2500);
  await db.collection("system_configs").doc("indexing_notification_state_v2").set({
    signatures: Object.fromEntries(entries),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    note: "API accepted notifications; this is not an indexed-URL list."
  });
}

async function notifyEligibleJobs(auth, candidates, state) {
  if (!auth || !boolEnv("INDEXING_API_ENABLED", true)) {
    return { enabled: false, attempted: 0, accepted: 0, failed: 0, quotaHit: false, results: [] };
  }

  const indexing = google.indexing({ version: "v3", auth });
  const limit = intEnv("INDEXING_DAILY_LIMIT", 180, 1, 200);
  const changed = candidates
    .filter((entry) => isEligibleIndexingApiUrl(entry.url))
    .filter((entry) => state[entry.url] !== signatureFor(entry))
    .slice(0, limit);

  const results = [];
  let quotaHit = false;
  for (const entry of changed) {
    try {
      await indexing.urlNotifications.publish({
        requestBody: { url: entry.url, type: "URL_UPDATED" }
      });
      state[entry.url] = signatureFor(entry);
      results.push({ url: entry.url, accepted: true });
    } catch (error) {
      const status = error.code || error.response?.status;
      results.push({ url: entry.url, accepted: false, error: error.message, status });
      if (status === 429) {
        quotaHit = true;
        break;
      }
    }
    await sleep(250);
  }

  return {
    enabled: true,
    attempted: results.length,
    accepted: results.filter((item) => item.accepted).length,
    failed: results.filter((item) => !item.accepted).length,
    quotaHit,
    results
  };
}

async function saveReport(db, report) {
  if (!db) return;
  const compactAudits = report.audits.slice(0, 300).map((audit) => ({
    url: audit.url,
    status: audit.status,
    canonical: audit.canonical,
    noindex: audit.noindex,
    wordCount: audit.wordCount,
    issues: audit.issues
  }));
  await db.collection("seo_audit_runs").doc(report.runId).set({
    runId: report.runId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    mode: report.mode,
    summary: report.summary,
    sitemap: report.sitemap,
    searchConsole: report.searchConsole,
    indexingApi: {
      ...report.indexingApi,
      results: report.indexingApi.results.slice(0, 200)
    },
    audits: compactAudits
  });
  await db.collection("system_configs").doc("latest_seo_audit").set({
    runId: report.runId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    summary: report.summary
  });
}

class SEOIndexingAgent {
  constructor(options = {}) {
    this.websiteUrl = normalizeUrl(options.websiteUrl || process.env.WEBSITE_URL || DEFAULT_SITE).replace(/\/$/, "");
    this.sitemapUrl = normalizeUrl(options.sitemapUrl || process.env.SITEMAP_URL || DEFAULT_SITEMAP);
    this.searchConsoleSiteUrl = options.searchConsoleSiteUrl
      || process.env.SEARCH_CONSOLE_SITE_URL
      || "sc-domain:studygyaan.in";
    this.credentials = parseCredentials();
    this.auth = createGoogleAuth(this.credentials);
    this.db = options.persist === false ? null : ensureFirebase(this.credentials);
  }

  async run(options = {}) {
    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    const mode = options.mode === "audit" ? "audit" : "auto";
    const maxUrls = Math.min(
      Number(options.maxUrls) || intEnv("SEO_AGENT_MAX_URLS", 200, 1, 2000),
      2000
    );

    let sitemapEntries;
    if (options.url) {
      sitemapEntries = [{ url: normalizeUrl(options.url), lastmod: null, sourceSitemap: "manual" }];
    } else {
      sitemapEntries = await fetchSitemap(this.sitemapUrl);
    }

    const deduplicated = [];
    const seen = new Set();
    for (const entry of sitemapEntries) {
      if (!entry.url || seen.has(entry.url)) continue;
      if (!entry.url.startsWith(`${this.websiteUrl}/`) && entry.url !== `${this.websiteUrl}/`) continue;
      seen.add(entry.url);
      deduplicated.push(entry);
    }

    // Recent job pages are checked first. The remainder is rotated so a capped
    // daily audit eventually covers the complete sitemap rather than the same
    // first 200 URLs forever.
    deduplicated.sort((a, b) => {
      const jobDelta = Number(isEligibleIndexingApiUrl(b.url)) - Number(isEligibleIndexingApiUrl(a.url));
      if (jobDelta) return jobDelta;
      return String(b.lastmod || "").localeCompare(String(a.lastmod || ""));
    });
    const selected = deduplicated.slice(0, maxUrls);
    const audits = await mapWithConcurrency(
      selected,
      intEnv("SEO_AUDIT_CONCURRENCY", 5, 1, 15),
      auditUrl
    );
    const auditByUrl = new Map(audits.map((audit) => [audit.url, audit]));
    const cleanEntries = selected.filter((entry) => {
      const audit = auditByUrl.get(entry.url);
      return audit && isAuditIndexable(audit);
    });

    const sitemapSubmission = mode === "auto"
      ? await submitSitemap(this.auth, this.searchConsoleSiteUrl, this.sitemapUrl)
      : { attempted: false };
    const searchConsole = await inspectWithSearchConsole(
      this.auth,
      cleanEntries.map((entry) => entry.url),
      this.searchConsoleSiteUrl
    );

    const state = await loadNotificationState(this.db);
    const indexingApi = mode === "auto"
      ? await notifyEligibleJobs(this.auth, cleanEntries, state)
      : { enabled: boolEnv("INDEXING_API_ENABLED", true), attempted: 0, accepted: 0, failed: 0, quotaHit: false, results: [] };
    if (mode === "auto") await saveNotificationState(this.db, state);

    const summary = summarizeAudits(audits);
    const verdictCounts = {};
    for (const item of searchConsole.results) {
      const key = item.error ? "API_ERROR" : item.verdict;
      verdictCounts[key] = (verdictCounts[key] || 0) + 1;
    }
    summary.searchConsoleVerdicts = verdictCounts;
    summary.indexingApiAcceptedNotifications = indexingApi.accepted;
    summary.warning = "An accepted Indexing API notification is not proof that Google indexed the URL.";

    const report = {
      runId,
      generatedAt: new Date().toISOString(),
      mode,
      websiteUrl: this.websiteUrl,
      sitemap: {
        url: this.sitemapUrl,
        discovered: sitemapEntries.length,
        unique: deduplicated.length,
        audited: selected.length,
        submission: sitemapSubmission
      },
      summary,
      audits,
      searchConsole,
      indexingApi
    };

    await saveReport(this.db, report);
    const outputPath = options.outputPath
      || process.env.SEO_REPORT_PATH
      || path.resolve(process.cwd(), "seo-audit-report.json");
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    report.outputPath = outputPath;
    return report;
  }
}

module.exports = {
  SEOIndexingAgent,
  auditUrl,
  classifyAudit,
  detectSoft404,
  fetchSitemap,
  isAuditIndexable,
  isEligibleIndexingApiUrl,
  normalizeUrl,
  sameCanonical,
  summarizeAudits
};
