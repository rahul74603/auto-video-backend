"use strict";

/**
 * Deterministic blog/job HTML proposals from facts already on the page.
 * Never invents salary/vacancies/dates/URLs. No 1500-word quota.
 */

const { detectExamFamily, detectContentKind } = require("./taxonomy");
const { classifySearchIntent } = require("./search_intent");
const { selectRelatedLinks } = require("./linking_engine");
const { escapeHtml, stripTags, sanitizeProposalHtml } = require("./html_safety");

const UPDATE_KINDS = new Set(["ADMIT_CARD", "RESULT", "ANSWER_KEY", "NEWS"]);

function titleOf(page) {
  return String(page.seoTitle || page.title || page.h1 || "").replace(/\s+/g, " ").trim();
}

function existingHtml(page) {
  return String(page.articleHtml || page.contentHtml || page.content || "");
}

function existingBody(page) {
  const fromHtml = stripTags(existingHtml(page));
  if (fromHtml) return fromHtml;
  return String(page.description || page.excerpt || page.shortInfo || "").replace(/\s+/g, " ").trim();
}

function classifyShortBlog(page, words) {
  const kind = page.contentKind || detectContentKind({
    title: titleOf(page),
    category: page.category
  });
  if (UPDATE_KINDS.has(kind)) return "news/update stub";
  if (Number(words) < 50) return "incomplete guide";
  if (Number(words) < 200) return "poor structure";
  return "genuinely short intent";
}

function sourceHref(page) {
  const url = String(page.sourceUrl || page.sourceCitation && page.sourceCitation.url || "").trim();
  if (/^https?:\/\//i.test(url)) return url;
  return "";
}

function officialHref(page) {
  return String(page.applyLink || page.directLink || sourceHref(page) || "").trim();
}

function relatedAnchors(page, catalog) {
  return selectRelatedLinks(page, catalog || [], 5)
    .filter((item) => item && item.url && String(item.url).startsWith("/") && !String(item.url).startsWith("//"))
    .slice(0, 4);
}

function factTableHtml(page) {
  const rows = [];
  if (page.organization) rows.push(["Organization", page.organization]);
  if (page.lastDate) rows.push(["Last date", page.lastDate]);
  if (page.startDate) rows.push(["Start date", page.startDate]);
  const link = officialHref(page);
  if (link) rows.push(["Official link", link]);
  if (rows.length < 2) return "";
  const body = rows.map((row) => {
    const value = /^https?:\/\//i.test(String(row[1])) || String(row[1]).startsWith("/")
      ? `<a href="${escapeHtml(row[1])}">${escapeHtml(row[1])}</a>`
      : escapeHtml(row[1]);
    return `<tr><th>${escapeHtml(row[0])}</th><td>${value}</td></tr>`;
  }).join("");
  return `<h2>Key facts on this page</h2><div class="table-responsive"><table class="ai-data-table">${body}</table></div>`;
}

function relatedHtml(links) {
  if (!links.length) return "";
  const items = links.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.title || item.url)}</a></li>`).join("");
  return `<h2>Related StudyGyaan pages</h2><ul>${items}</ul>`;
}

function sourceHtml(page) {
  const href = sourceHref(page) || officialHref(page);
  if (!href) return "";
  return `<h2>Official source</h2><p>Confirm details on the official page: <a href="${escapeHtml(href)}">${escapeHtml(href)}</a>. Do not use third-party copy as the source of truth.</p>`;
}

function wrapParagraphs(text) {
  const chunks = String(text || "").split(/\n+/).map((part) => part.trim()).filter(Boolean);
  if (!chunks.length) return "";
  return chunks.map((part) => `<p>${escapeHtml(part)}</p>`).join("");
}

function previewFromHtml(html) {
  const headings = [...String(html || "").matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => stripTags(m[1]));
  const faqs = [...String(html || "").matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)].map((m) => stripTags(m[1]));
  return {
    headings,
    faqHeadings: faqs,
    tables: (String(html || "").match(/<table\b/gi) || []).length,
    internalLinks: (String(html || "").match(/href\s*=\s*["']\//gi) || []).length,
    wordCount: stripTags(html).split(/\s+/).filter(Boolean).length
  };
}

function hasEnoughMaterial(page, body) {
  const title = titleOf(page);
  return Boolean(
    (body && body.length >= 12)
    || sourceHref(page)
    || officialHref(page)
    || page.lastDate
    || page.organization
    || page.shortInfo
    || title.length >= 20
  );
}

function buildShortUpdateHtml(page, body) {
  const title = titleOf(page) || "Update";
  const parts = [
    `<h1>${escapeHtml(title)}</h1>`,
    wrapParagraphs(body || String(page.shortInfo || title)),
    sourceHtml(page)
  ];
  return parts.filter(Boolean).join("");
}

function buildGuideHtml(page, body, links) {
  const title = titleOf(page) || "Guide";
  const exam = detectExamFamily(page);
  const intent = classifySearchIntent({
    type: "BLOG",
    title,
    contentKind: page.contentKind,
    category: page.category
  });
  const who = exam !== "GENERAL"
    ? `<h2>Who this is for</h2><p>This page is for readers looking up ${escapeHtml(exam)} information already named in the title. It does not add unofficial numbers.</p>`
    : "";
  const steps = body
    ? `<h2>What this page already says</h2>${wrapParagraphs(body)}`
    : "";
  const next = intent === "APPLY"
    ? `<h2>What to do next</h2><p>Use the official link on this page if one is listed. Do not apply through a third-party form.</p>`
    : `<h2>What to do next</h2><p>Read the official source linked here before acting on any date or vacancy claim.</p>`;
  return [
    `<h1>${escapeHtml(title)}</h1>`,
    who,
    steps,
    factTableHtml(page),
    next,
    sourceHtml(page),
    relatedHtml(links)
  ].filter(Boolean).join("");
}

function buildBlogArticleProposal(page, finding = {}, options = {}) {
  const words = Number(finding.evidence && finding.evidence.words) || stripTags(existingHtml(page) || existingBody(page)).split(/\s+/).filter(Boolean).length;
  const reason = classifyShortBlog(page, words);
  const body = existingBody(page);
  const links = relatedAnchors(page, options.catalog);
  const plan = {
    currentProblem: `Blog body is ${words} words.`,
    likelyReason: reason,
    missingUsefulInformation: reason === "news/update stub"
      ? "Not a long-form gap. Keep it short and factual."
      : "Missing scannable sections grounded in existing facts — not a 1500-word quota.",
    suggestedSections: reason === "news/update stub"
      ? ["What changed", "Official source already on the page", "What to do next"]
      : ["Who this is for", "What this page already says", "Official source", "Related pages"]
  };

  if (!hasEnoughMaterial(page, body)) {
    return {
      insufficientSource: true,
      articleHtml: null,
      contentPlan: plan,
      reason: "Not enough on-page/source text to generate article HTML without inventing facts. Human review required.",
      confidence: "heuristic",
      htmlSource: "insufficient-source"
    };
  }

  const raw = reason === "news/update stub"
    ? buildShortUpdateHtml(page, body)
    : buildGuideHtml(page, body, links);
  const safe = sanitizeProposalHtml(raw);
  if (!safe.ok || !safe.html) {
    return {
      insufficientSource: true,
      articleHtml: null,
      contentPlan: plan,
      reason: "Generated HTML failed safety checks.",
      confidence: "heuristic",
      htmlSource: "unsafe"
    };
  }
  const preview = previewFromHtml(safe.html);
  return {
    insufficientSource: false,
    articleHtml: safe.html,
    contentPlan: plan,
    preview,
    reason: reason === "news/update stub"
      ? "Keep this update short. HTML only restructures existing text and the official link."
      : "Restructure existing on-page text into headings/table/links. No filler and no invented facts.",
    confidence: "heuristic",
    htmlSource: "deterministic-html"
  };
}

/**
 * Deterministic articleHtml proposal for THIN job pages (body too short for
 * the standard sections/apply-help findings, or no structure at all).
 *
 * Builds a complete structured body from facts ALREADY on the record:
 *   H1 → intro sentence built from title → existing body text →
 *   key-facts table (org/dates/official link only) → आवेदन कैसे करें →
 *   official source → related internal links.
 * Never invents vacancies, salary, eligibility, fees, dates, or URLs.
 */
function buildJobArticleProposal(page, options = {}) {
  const title = titleOf(page) || "Job";
  const body = existingBody(page);
  const href = officialHref(page);

  if (!body && !href && !page.organization && !page.lastDate) {
    return {
      insufficientSource: true,
      articleHtml: null,
      htmlSource: "job-no-body",
      reason: "Not enough on-record material to build job HTML without inventing facts."
    };
  }

  const parts = [];
  parts.push(`<h1>${escapeHtml(title)}</h1>`);

  const intro = page.organization
    ? `<p>${escapeHtml(page.organization)} recruitment details are listed on this page. Every value below is copied from the existing record — always confirm on the official notice linked here.</p>`
    : `<p>Recruitment details are listed on this page. Every value below is copied from the existing record — always confirm on the official notice linked here.</p>`;
  parts.push(intro);

  if (body) parts.push(`<h2>What this page already says</h2>${wrapParagraphs(body)}`);
  parts.push(factTableHtml(page));

  if (href) {
    parts.push(`<h2>आवेदन कैसे करें</h2><p>Use the official apply link already on this record: <a href="${escapeHtml(href)}">${escapeHtml(href)}</a>. Do not apply through third-party forms.</p>`);
  }

  parts.push(sourceHtml(page));

  const links = relatedAnchors(page, options.catalog);
  if (links.length) parts.push(relatedHtml(links));

  const raw = parts.filter(Boolean).join("");
  const safe = sanitizeProposalHtml(raw);
  if (!safe.ok || !safe.html) {
    return {
      insufficientSource: true,
      articleHtml: null,
      htmlSource: "unsafe",
      reason: "Generated job HTML failed safety checks."
    };
  }
  return {
    insufficientSource: false,
    articleHtml: safe.html,
    preview: previewFromHtml(safe.html),
    reason: "Restructure the thin job body into sections/table/apply-help using existing record facts only. Fact fields stay locked.",
    confidence: "heuristic",
    htmlSource: "deterministic-html"
  };
}

function buildJobArticleEnhancement(page, options = {}) {
  const current = existingHtml(page);
  if (!current || current.length < 40) {
    return { insufficientSource: true, articleHtml: null, htmlSource: "job-no-body" };
  }
  const extras = [];
  if (!/आवेदन कैसे|how to apply/i.test(current) && officialHref(page)) {
    extras.push(`<h2>आवेदन कैसे करें</h2><p>Official apply link already on this record: <a href="${escapeHtml(officialHref(page))}">${escapeHtml(officialHref(page))}</a></p>`);
  }
  if (!/<table\b/i.test(current)) {
    extras.push(factTableHtml(page));
  }
  const links = relatedAnchors(page, options.catalog);
  if (!/<a\s[^>]*href\s*=\s*["']\//i.test(current) && links.length) {
    extras.push(relatedHtml(links));
  }
  const combined = extras.filter(Boolean).join("");
  if (!combined) return { insufficientSource: true, articleHtml: null, htmlSource: "job-nothing-to-add" };
  const safe = sanitizeProposalHtml(`${current}${combined}`);
  if (!safe.ok) return { insufficientSource: true, articleHtml: null, htmlSource: "unsafe" };
  return {
    insufficientSource: false,
    articleHtml: safe.html,
    preview: previewFromHtml(safe.html),
    reason: "Append headings/table/links using existing job facts only. Fact fields stay locked.",
    confidence: "heuristic",
    htmlSource: "deterministic-html"
  };
}

function buildFastTrackHtml(page) {
  const body = existingBody(page);
  const href = officialHref(page);
  if (!body && !href) {
    return { insufficientSource: true, articleHtml: null, htmlSource: "update-empty" };
  }
  const title = titleOf(page) || "Update";
  const html = [
    `<h1>${escapeHtml(title)}</h1>`,
    wrapParagraphs(body || "Official update. Use the source link on this page."),
    sourceHtml(page)
  ].join("");
  const safe = sanitizeProposalHtml(html);
  if (!safe.ok) return { insufficientSource: true, articleHtml: null, htmlSource: "unsafe" };
  return {
    insufficientSource: false,
    articleHtml: safe.html,
    preview: previewFromHtml(safe.html),
    reason: "Concise update HTML from existing summary/link. Keep it short.",
    confidence: "heuristic",
    htmlSource: "deterministic-html"
  };
}

module.exports = {
  classifyShortBlog,
  buildBlogArticleProposal,
  buildJobArticleProposal,
  buildJobArticleEnhancement,
  buildFastTrackHtml,
  previewFromHtml,
  existingBody,
  factTableHtml
};
