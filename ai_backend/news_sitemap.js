"use strict";

/**
 * news_sitemap.js — Google News sitemap builder (PURE — no firebase imports)
 * ===========================================================================
 * PHASE-2 item 3: news sitemap ab sirf blogs nahi — blogs + jobs + fast_track
 * (site ka sabse fresh content) include karta hai. Rules (Google News sitemap
 * spec + master-plan):
 *  - sirf last `maxAgeDays` (default 2) din ke indexable docs
 *  - draft/private/archived/noIndex skip (isIndexableDocument semantics same)
 *  - title >= 5 chars
 *  - newest-first, capped (news sitemap chhota + fresh hona chahiye)
 */

const BLOCKED_STATUS = ["draft", "pending", "rejected", "private", "archived", "deleted", "trash"];

function safeXml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function docDate(data) {
  const raw = data && (data.createdAt || data.publishedAt || data.publishAt);
  if (!raw) return null;
  const d = typeof raw.toDate === "function" ? raw.toDate() : new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * @param {{blogs?: object[], jobs?: object[], updates?: object[], now?: Date,
 *          maxAgeDays?: number, limit?: number}} cfg
 * docs me {id, slug, title, status, noIndex, deleted, isDeleted, createdAt, category, type}
 * @returns {{path: string, iso: string, title: string, category: string}[]}
 */
function buildNewsEntries(cfg = {}) {
  const { blogs = [], jobs = [], updates = [], now = new Date(), maxAgeDays = 2, limit = 200 } = cfg;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const pools = [
    [blogs, "blog", (d) => d.category || "Education"],
    [jobs, "job", (d) => d.category || d.organization || "Government Jobs"],
    [updates, "update", (d) => d.category || d.type || "Exam Updates"],
  ];

  const entries = [];
  for (const [docs, route, catFn] of pools) {
    for (const d of docs || []) {
      if (!d) continue;
      const slug = d.slug || d.id;
      if (!slug) continue;
      if (d.noIndex === true || d.deleted === true || d.isDeleted === true) continue;
      const status = String(d.status || "").trim().toLowerCase();
      if (BLOCKED_STATUS.includes(status)) continue;
      const title = String(d.title || "").trim();
      if (title.length < 5) continue;
      const pub = docDate(d);
      if (!pub || pub < cutoff) continue;
      entries.push({
        path: `/${route}/${slug}`,
        iso: pub.toISOString(),
        title,
        category: String(catFn(d) || "Education"),
      });
    }
  }

  entries.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));
  return entries.slice(0, limit);
}

/**
 * @param {ReturnType<typeof buildNewsEntries>} entries
 * @param {{baseUrl?: string, publication?: string, language?: string}} opts
 */
function renderNewsSitemapXml(entries, opts = {}) {
  const { baseUrl = "https://studygyaan.in", publication = "StudyGyaan", language = "hi" } = opts;
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
  xml += `        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n`;
  for (const e of entries) {
    xml += `  <url>\n`;
    xml += `    <loc>${baseUrl}${safeXml(e.path)}</loc>\n`;
    xml += `    <news:news>\n`;
    xml += `      <news:publication>\n`;
    xml += `        <news:name>${safeXml(publication)}</news:name>\n`;
    xml += `        <news:language>${safeXml(language)}</news:language>\n`;
    xml += `      </news:publication>\n`;
    xml += `      <news:publication_date>${e.iso}</news:publication_date>\n`;
    xml += `      <news:title>${safeXml(e.title)}</news:title>\n`;
    xml += `      <news:keywords>${safeXml(e.category)}, StudyGyaan, Sarkari Naukri, Exam Preparation</news:keywords>\n`;
    xml += `    </news:news>\n`;
    xml += `  </url>\n`;
  }
  xml += `</urlset>`;
  return xml;
}

module.exports = { buildNewsEntries, renderNewsSitemapXml, safeXml, docDate, BLOCKED_STATUS };
