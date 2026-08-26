"use strict";

/**
 * Backend internal-linking engine (complements the frontend repository).
 * Scores related URLs by exam family + complementary content kind.
 * Never self-links, never invents URLs, only published canonical paths.
 */

const {
  detectExamFamily,
  detectContentKind,
  complementaryKinds,
  hubForFamily
} = require("./taxonomy");

const SITE = "https://studygyaan.in";
const SITE_HOST = "studygyaan.in";

function ownHostname(hostname) {
  return String(hostname || "").replace(/\.$/, "").toLowerCase() === SITE_HOST;
}

/**
 * Return a same-origin path (no query/hash) or "" if the value is not a
 * StudyGyaan URL. Uses WHATWG URL parsing — never hostname substring checks.
 */
function pathFromInternalUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.startsWith("//") || value.includes("\\")) return "";

  let parsed;
  try {
    if (value.startsWith("/")) {
      parsed = new URL(value, SITE);
    } else {
      parsed = new URL(value);
    }
  } catch {
    return "";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
  if (!ownHostname(parsed.hostname)) return "";
  if (parsed.username || parsed.password) return "";

  const path = parsed.pathname || "";
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  if (path.includes("\\") || path.length > 180) return "";
  return path;
}

function pathFromSlug(item) {
  const slug = item.slug || item.id;
  if (!slug) return "";
  const encoded = encodeURIComponent(String(slug).slice(0, 120));
  const kind = item.contentKind || detectContentKind(item);
  if (kind === "JOB") return `/job/${encoded}`;
  if (kind === "MOCK_TEST") return `/test/${encoded}`;
  if (kind === "BLOG") return `/blog/${encoded}`;
  if (kind === "MATERIAL") return `/material/${encoded}`;
  return `/update/${encoded}`;
}

function canonicalPath(item) {
  const fromUrl = pathFromInternalUrl(item && item.url);
  if (fromUrl) return fromUrl;
  return pathFromSlug(item || {});
}

function isPublished(item) {
  const status = String(item.status || "published").toLowerCase();
  return !["draft", "pending", "rejected", "private", "archived", "deleted", "trash"].includes(status);
}

function scoreRelated(source, candidate) {
  if (!candidate || candidate.id === source.id) return 0;
  if (canonicalPath(candidate) === canonicalPath(source)) return 0;
  if (!isPublished(candidate)) return 0;

  const sourceFamily = source.examFamily || detectExamFamily(source);
  const candFamily = candidate.examFamily || detectExamFamily(candidate);
  const sourceKind = source.contentKind || detectContentKind(source);
  const candKind = candidate.contentKind || detectContentKind(candidate);

  let score = 0;
  if (sourceFamily !== "GENERAL" && candFamily === sourceFamily) score += 40;
  const complements = complementaryKinds(sourceKind);
  if (complements.includes(candKind)) score += 30;
  else if (candKind !== sourceKind) score += 8;
  if (source.category && candidate.category && String(source.category).toLowerCase() === String(candidate.category).toLowerCase()) {
    score += 12;
  }
  return score;
}

function selectRelatedLinks(source, catalog, limit = 8) {
  const max = Math.max(1, Math.min(12, Number(limit) || 8));
  const scored = (Array.isArray(catalog) ? catalog : [])
    .map((candidate) => ({ candidate, score: scoreRelated(source, candidate) }))
    .filter((row) => row.score >= 20)
    .sort((a, b) => b.score - a.score);

  const usedKinds = new Set();
  const usedUrls = new Set();
  const picked = [];
  for (const row of scored) {
    const url = canonicalPath(row.candidate);
    if (!url || usedUrls.has(url)) continue;
    const kind = row.candidate.contentKind || detectContentKind(row.candidate);
    if (usedKinds.has(kind) && picked.length >= 3 && usedKinds.size < 4) continue;
    usedUrls.add(url);
    usedKinds.add(kind);
    picked.push({
      title: String(row.candidate.title || "").slice(0, 140),
      url,
      kind,
      examFamily: row.candidate.examFamily || detectExamFamily(row.candidate),
      score: row.score
    });
    if (picked.length >= max) break;
  }

  const hub = hubForFamily(source.examFamily || detectExamFamily(source));
  if (hub && !picked.some((p) => p.url === hub.url || p.url === String(hub.url).split("?")[0])) {
    picked.push({ title: hub.name, url: hub.url, kind: "HUB", examFamily: source.examFamily || "GENERAL", score: 10 });
  }
  return picked.slice(0, max);
}

module.exports = {
  SITE,
  SITE_HOST,
  pathFromInternalUrl,
  canonicalPath,
  isPublished,
  scoreRelated,
  selectRelatedLinks
};
