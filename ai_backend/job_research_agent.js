"use strict";

/**
 * Missing-field research agent for the government-job scraper.
 *
 * Google Search grounding discovers primary notices; the agent then fetches
 * the cited official page/PDF and extracts only facts evidenced in that
 * fetched source. Any mismatch, stale cycle, weak evidence, or unavailable
 * source means the field stays blank. Existing non-empty job facts are never
 * overwritten.
 */

const { GoogleGenAI } = require("@google/genai");
const { fetchAndExtractSource } = require("./agents/article_agents/source_fetcher");
const { isBlockedDomain } = require("./agents/article_agents/constants");
const { isWithinScraperWindow } = require("./scraper_policy");

const RESEARCH_FIELDS = Object.freeze([
  "startDate",
  "lastDate",
  "salary",
  "vacancies",
  "qualification"
]);
const MAX_OFFICIAL_SOURCES = 3;
const MIN_SOURCE_TEXT = 160;
const UNKNOWN_VALUES = new Set([
  "-", "—", "n/a", "na", "not available", "not specified", "unknown",
  "not mentioned", "null", "undefined", "tbd", "to be announced"
]);
const TRUSTED_HOSTS = Object.freeze([
  "ibps.in",
  "sbi.co.in",
  "bank.sbi",
  "rbi.org.in",
  "licindia.in",
  "nta.ac.in",
  "aiimsexams.ac.in",
  "upsc.gov.in",
  "ssc.gov.in",
  "rrbapply.gov.in",
  "joinindianarmy.nic.in",
  "joinindiannavy.gov.in",
  "indianairforce.nic.in"
]);
const IDENTITY_STOP_WORDS = new Set([
  "the", "a", "an", "of", "for", "and", "in", "to", "on", "by",
  "government", "govt", "department", "recruitment", "vacancy", "vacancies",
  "notification", "notice", "job", "jobs", "post", "posts", "2024", "2025",
  "2026", "2027", "2028", "2029"
]);

function indiaDateParts(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    dayStart: Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day))
  };
}

function isMissingValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return false;
  const text = String(value).trim();
  return !text || UNKNOWN_VALUES.has(text.toLowerCase());
}

function explicitYear(value) {
  const match = String(value || "").match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : 0;
}

function parseFullYearDate(value) {
  const text = String(value || "").trim();
  const year = explicitYear(text);
  if (!year) return null;

  let day;
  let month;
  let match = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (match) {
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2})\b/);
    if (match) {
      day = Number(match[1]);
      month = Number(match[2]);
    } else {
      match = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(20\d{2})\b/i);
      if (match) {
        day = Number(match[1]);
        month = monthNumber(match[2]);
      } else {
        match = text.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i);
        if (!match) return null;
        month = monthNumber(match[1]);
        day = Number(match[2]);
      }
    }
  }
  if (!month || day < 1 || day > 31) return null;
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return { year, dayStart: timestamp };
}

function monthNumber(name) {
  const months = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  return months[String(name || "").slice(0, 3).toLowerCase()] || 0;
}

function fieldIsMissing(field, value, now = Date.now()) {
  if (isMissingValue(value)) return true;
  if (field !== "startDate" && field !== "lastDate") return false;
  const parsed = parseFullYearDate(value);
  return !parsed || parsed.year < indiaDateParts(now).year;
}

function missingResearchFields(job = {}, now = Date.now()) {
  return RESEARCH_FIELDS.filter((field) => fieldIsMissing(field, job[field], now));
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isTrustedOfficialSource(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  if (isBlockedDomain(parsed.toString())) return false;
  const host = hostOf(parsed.toString());
  if (!host) return false;
  if ([".gov.in", ".nic.in", ".ac.in", ".edu.in", ".gov"].some((suffix) => host.endsWith(suffix))) return true;
  return TRUSTED_HOSTS.some((trusted) => host === trusted || host.endsWith(`.${trusted}`));
}

function groundingSources(response) {
  const chunks = (response?.candidates || []).flatMap((candidate) =>
    candidate?.groundingMetadata?.groundingChunks || []
  );
  const seen = new Set();
  return chunks
    .map((chunk) => chunk?.web)
    .filter((web) => web?.uri && isTrustedOfficialSource(web.uri))
    .filter((web) => {
      const key = String(web.uri).split("#")[0].replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_OFFICIAL_SOURCES)
    .map((web) => ({ url: web.uri, title: String(web.title || "").trim() }));
}

function sourceText(source) {
  const rows = (source?.tables || [])
    .flatMap((table) => table || [])
    .map((row) => (Array.isArray(row) ? row.join(" | ") : String(row || "")))
    .filter(Boolean)
    .join("\n");
  return [source?.pageTitle, source?.metaDescription, source?.text, rows]
    .filter(Boolean)
    .join("\n")
    .slice(0, 24000);
}

function comparable(value) {
  return String(value || "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
}

function containsEvidence(source, evidence) {
  const normalizedSource = comparable(source);
  const normalizedEvidence = comparable(evidence);
  return normalizedEvidence.length >= 8 && normalizedSource.includes(normalizedEvidence);
}

function identityTokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !IDENTITY_STOP_WORDS.has(token));
}

function evidenceCoversIdentity(expected, evidence, sourceUrl = "") {
  const tokens = [...new Set(identityTokens(expected))];
  if (!tokens.length) return false;
  const haystack = comparable(`${evidence} ${sourceUrl}`);
  const matched = tokens.filter((token) => haystack.includes(comparable(token))).length;
  return matched / tokens.length >= 0.5;
}

function parseJsonResponse(response) {
  const text = typeof response?.text === "function" ? response.text() : response?.text;
  const clean = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

function buildGoogleQuery(job, missingFields, now) {
  const date = indiaDateParts(now);
  const identity = [job.title, job.organization, job.advtNo].filter(Boolean).join(" ").trim();
  return `"${identity}" official recruitment notification ${date.year} ${missingFields.join(" ")}`.trim();
}

function buildSearchPrompt(job, missingFields, query, now) {
  const { year, month, day } = indiaDateParts(now);
  return `Use Google Search to find the PRIMARY official recruitment notice or official organization page for this exact job.\n` +
    `Search query: ${query}\n` +
    `Job identity: title=${job.title || ""}; organization=${job.organization || ""}; advertisement number=${job.advtNo || ""}.\n` +
    `Today in India is ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}.\n` +
    `Find official sources that can verify only these missing fields: ${missingFields.join(", ")}.\n` +
    `Do not use FreeJobAlert, SarkariResult, job portals, blogs, snippets without an official source, old recruitment cycles, or a different organization/job. Prefer an official notification PDF. Return a short response grounded in the official page. Google grounding metadata citations are required; do not invent source URLs.`;
}

function buildExtractionPrompt(job, missingFields, url, text, now) {
  const { year, month, day } = indiaDateParts(now);
  return `You are a strict government-recruitment fact checker. Extract facts ONLY from the official source text below.\n` +
    `TODAY (India): ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}.\n` +
    `TARGET RECRUITMENT: title=${job.title || ""}; organization=${job.organization || ""}; advertisement number=${job.advtNo || ""}.\n` +
    `Only these target fields may be returned: ${missingFields.join(", ")}.\n` +
    `First verify this is the SAME recruitment, not an older cycle or a similarly named post. ` +
    `If an advertisement number is supplied, it must match exactly. Its recruitment year must be ${year} or later. ` +
    `If identity/year cannot be proved from the source, set sameRecruitment=false and leave all fields empty.\n` +
    `Never infer a date year. startDate/lastDate must contain a full 4-digit year; lastDate must not be before today. ` +
    `Every field must include a short verbatim evidence quote from this source that contains the returned value. ` +
    `For qualification, copy a precise source phrase; do not paraphrase. Unknown/ambiguous values are empty.\n` +
    `Return JSON only in this shape:\n` +
    `{"sameRecruitment":false,"recruitmentYear":0,"advtNoMatch":false,` +
    `"titleEvidence":"","organizationEvidence":"","fields":{` +
    missingFields.map((field) => `"${field}":{"value":"","evidence":""}`).join(",") +
    `}}\nOFFICIAL SOURCE URL: ${url}\nOFFICIAL SOURCE TEXT:\n${text}`;
}

function validateIdentity(result, job, source, text, now) {
  if (!result || result.sameRecruitment !== true) return false;
  const recruitmentYear = Number(result.recruitmentYear);
  if (!Number.isInteger(recruitmentYear) || recruitmentYear < indiaDateParts(now).year) return false;

  if (job.advtNo && result.advtNoMatch !== true) return false;
  if (job.advtNo && !comparable(text).includes(comparable(job.advtNo))) return false;

  const titleEvidence = String(result.titleEvidence || "").trim();
  const organizationEvidence = String(result.organizationEvidence || "").trim();
  if (!containsEvidence(text, titleEvidence) || !containsEvidence(text, organizationEvidence)) return false;
  if (!evidenceCoversIdentity(job.title, titleEvidence, source.url)) return false;
  if (job.organization && !evidenceCoversIdentity(job.organization, organizationEvidence, source.url)) return false;
  return true;
}

function validateDateField(field, value, now) {
  const parsed = parseFullYearDate(value);
  if (!parsed || parsed.year < indiaDateParts(now).year) return false;
  if (field === "lastDate" && parsed.dayStart < indiaDateParts(now).dayStart) return false;
  return true;
}

function validateField(field, candidate, source, text, now) {
  const value = String(candidate?.value || "").trim();
  const evidence = String(candidate?.evidence || "").trim();
  if (!value || !evidence || !containsEvidence(text, evidence)) return "";
  if (!comparable(evidence).includes(comparable(value))) return "";
  if ((field === "startDate" || field === "lastDate") && !validateDateField(field, value, now)) return "";
  return value;
}

async function defaultGoogleSearch(query, job, missingFields, now, deps = {}) {
  const apiKey = deps.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const ai = deps.ai || new GoogleGenAI({ apiKey });
  return ai.models.generateContent({
    model: deps.model || "gemini-2.5-flash",
    contents: buildSearchPrompt(job, missingFields, query, now),
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.1,
      maxOutputTokens: 1200
    }
  });
}

async function defaultExtractFacts(job, missingFields, source, text, now, deps = {}) {
  const apiKey = deps.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const ai = deps.ai || new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: deps.model || "gemini-2.5-flash",
    contents: buildExtractionPrompt(job, missingFields, source.url, text, now),
    config: {
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: 1800
    }
  });
  return parseJsonResponse(response);
}

/**
 * Research and fill only missing/invalid fields. Never throws into scraper
 * orchestration: a failure means the original blank remains blank.
 */
async function researchMissingJobFields(jobData = {}, context = {}, deps = {}) {
  const now = deps.now ?? Date.now();
  const original = { ...jobData };
  const missingFields = missingResearchFields(original, now);
  if (!missingFields.length) return { jobData: original, filledFields: [], sourceUrls: [] };

  if (!isWithinScraperWindow(context.publishedAt, { now, maxAgeDays: 10 })) {
    return { jobData: original, filledFields: [], sourceUrls: [], reason: "job-not-within-10-day-window" };
  }

  const query = buildGoogleQuery(original, missingFields, now);
  const search = deps.searchGoogle || defaultGoogleSearch;
  const fetchSource = deps.fetchSource || ((url) => fetchAndExtractSource(url, { timeoutMs: 15000 }));
  const extractFacts = deps.extractFacts || defaultExtractFacts;

  try {
    const searchResponse = await search(query, original, missingFields, now, deps);
    const sources = groundingSources(searchResponse);
    if (!sources.length) {
      return { jobData: original, filledFields: [], sourceUrls: [], reason: "no-grounded-official-source" };
    }

    for (const source of sources) {
      let fetched;
      try {
        fetched = await fetchSource(source.url);
      } catch (error) {
        console.warn(`job-research: official source fetch failed (${hostOf(source.url)}): ${error.message}`);
        continue;
      }
      const text = sourceText(fetched);
      if (text.length < MIN_SOURCE_TEXT) continue;

      const result = await extractFacts(original, missingFields, source, text, now, deps);
      if (!validateIdentity(result, original, source, text, now)) continue;

      const updated = { ...original };
      const filledFields = [];
      const sourceUrls = [];
      for (const field of missingFields) {
        // A parallel change or prior source extraction must win; never replace a value.
        if (!fieldIsMissing(field, updated[field], now)) continue;
        const value = validateField(field, result.fields?.[field], source, text, now);
        if (!value) continue;
        updated[field] = value;
        filledFields.push(field);
        sourceUrls.push(source.url);
      }
      if (filledFields.length) {
        return { jobData: updated, filledFields, sourceUrls: [...new Set(sourceUrls)] };
      }
    }

    return { jobData: original, filledFields: [], sourceUrls: [], reason: "no-verified-field-evidence" };
  } catch (error) {
    console.warn(`job-research: research unavailable; keeping blanks: ${error.message}`);
    return { jobData: original, filledFields: [], sourceUrls: [], reason: "research-error" };
  }
}

module.exports = {
  RESEARCH_FIELDS,
  missingResearchFields,
  isTrustedOfficialSource,
  groundingSources,
  sourceText,
  parseFullYearDate,
  buildGoogleQuery,
  defaultGoogleSearch,
  validateIdentity,
  validateField,
  researchMissingJobFields
};
