"use strict";

/**
 * Page-level SEO auditor (Phase 2).
 *
 * READ-ONLY vs public content. Produces diagnostic findings with evidence.
 * Never rewrites titles/meta/HTML. Never publishes. Never invents GSC data.
 *
 * Live HTTP audit is opt-in (options.httpResult). Default = unavailable.
 */

const { detectExamFamily, detectContentKind, hubForFamily } = require("./taxonomy");
const { classifySearchIntent, assessIntentAlignment } = require("./search_intent");
const { classifyJobLifecycle } = require("./job_lifecycle");
const { scoreFaqUsefulness } = require("./article_faq");
const { findImagesMissingAlt, isAcceptableImageUrl } = require("./image_seo");
const { CLICKBAIT_RE, isAllCapsTitle } = require("./discover");
const { pathFromInternalUrl, SITE_HOST } = require("./linking_engine");
const { isStudyGyaanPage } = require("./intelligence");
const {
  MAX_PAGE_AUDITS,
  PUBLIC_CONTENT_COLLECTIONS,
  AUDIT_WRITE_ALLOWLIST,
  assertAllowedAuditWrite,
  buildAuditRecord,
  compactAudit,
  summarizeAudits,
  AUDIT_VERSION
} = require("./audit_model");

const SETTINGS = "system_settings";
const SETTINGS_DOC = "seo_intelligence";
const SAMPLE_PER_TYPE = 10;

/** Cheerio-free mirrors of article_html_utils helpers so the auditor stays dependency-light. */
function plainText(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function countWords(textOrHtml) {
  const source = String(textOrHtml || "");
  const text = source.includes("<") ? plainText(source) : source;
  return text.split(/\s+/).filter((token) => /[A-Za-z0-9ऀ-ॿ]/.test(token.replace(/[.,;:!?'"()\-–—|/\\[\]{}%₹]+/g, ""))).length;
}

function countTags(html, tag) {
  const re = new RegExp(`<${tag}\\b`, "gi");
  return (String(html || "").match(re) || []).length;
}

function listAnchorHrefs(html) {
  const hrefs = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(String(html || "")))) hrefs.push(match[1]);
  return hrefs;
}

const SHORT_OK_TYPES = new Set(["FAST_TRACK", "MOCK_TEST", "STUDY_MATERIAL", "COURSE", "EBOOK", "WEB_STORY"]);
const UPDATE_KINDS = new Set(["ADMIT_CARD", "RESULT", "ANSWER_KEY", "NEWS", "SYLLABUS"]);

function finding(id, dimension, severity, confidence, evidence, suggestedAction, autoFixLevel) {
  return { id, dimension, severity, confidence, evidence, suggestedAction, autoFixLevel };
}

function pageTypeFromDoc(data) {
  const t = String(data.pageType || "").toUpperCase();
  if (["BLOG", "JOB", "FAST_TRACK", "MOCK_TEST", "STUDY_MATERIAL", "COURSE", "EBOOK", "WEB_STORY"].includes(t)) return t;
  return null;
}

function detectPageType(collectionName, data = {}) {
  const fromDoc = pageTypeFromDoc(data);
  if (fromDoc) return fromDoc;
  const collection = String(collectionName || data.collection || "");
  const rawType = String(data.typeRaw || data.type || data.articleType || "").toUpperCase().replace(/-/g, "_");
  if (collection === "blogs" || rawType === "BLOG") return "BLOG";
  if (collection === "mock_tests" || rawType === "MOCK_TEST" || rawType === "QUIZ") return "MOCK_TEST";
  if (collection === "web_stories" || rawType === "WEB_STORY") return "WEB_STORY";
  if (collection === "courses") return "COURSE";
  if (collection === "study_materials" || collection === "studyMaterials") return "STUDY_MATERIAL";
  if (collection === "fast_track" || rawType === "FAST_TRACK" || rawType === "FASTTRACK") return "FAST_TRACK";
  if (rawType === "EBOOK") return "EBOOK";
  if (collection === "jobs" && rawType === "COURSE") return "COURSE";
  if (collection === "jobs") return "JOB";
  return "OTHER";
}

function htmlOf(doc) {
  return String(doc.articleHtml || doc.contentHtml || doc.content || doc.description || doc.shortInfo || "");
}

function titleOf(doc) {
  return String(doc.seoTitle || doc.title || doc.h1 || "").replace(/\s+/g, " ").trim();
}

function metaOf(doc) {
  return String(doc.metaDescription || doc.description || doc.excerpt || doc.shortInfo || "").replace(/\s+/g, " ").trim();
}

function isoDate(value) {
  if (!value) return "";
  try {
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  } catch {
    return "";
  }
}

function isPublishedStatus(status) {
  const value = String(status || "published").toLowerCase();
  return !["draft", "pending", "rejected", "private", "archived", "deleted", "trash"].includes(value);
}

function parseSchemaList(markup) {
  if (!markup) return [];
  if (typeof markup === "object") return Array.isArray(markup) ? markup : [markup];
  try {
    const parsed = JSON.parse(String(markup));
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function schemaTypes(list) {
  return list.map((item) => item && item["@type"]).filter(Boolean).map(String);
}

function internalHrefCount(html, relatedLinks) {
  const hrefs = listAnchorHrefs(html || "");
  let internal = 0;
  for (const href of hrefs) {
    if (href.startsWith("/") && !href.startsWith("//")) internal += 1;
    else if (pathFromInternalUrl(href)) internal += 1;
    else {
      try {
        const parsed = new URL(href);
        if (parsed.hostname === SITE_HOST || parsed.hostname.endsWith(`.${SITE_HOST}`)) internal += 1;
      } catch {
        /* ignore */
      }
    }
  }
  const stored = Array.isArray(relatedLinks) ? relatedLinks.filter((item) => item && (item.url || item.href)).length : 0;
  return { inBody: internal, stored, total: internal + stored, hrefs: hrefs.slice(0, 20) };
}

function pagePathname(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value.split("?")[0];
  try {
    return new URL(value).pathname || "";
  } catch {
    return "";
  }
}

function gscRowsForPage(rows, url) {
  const list = Array.isArray(rows) ? rows : [];
  const path = pagePathname(url);
  const matches = [];
  for (const row of list) {
    if (!row || !row.page) continue;
    if (!isStudyGyaanPage(row.page)) continue;
    const rowPath = pagePathname(row.page);
    if (path && rowPath === path) matches.push(row);
  }
  return matches;
}

function titleTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3);
}

function titleSimilarity(a, b) {
  const left = new Set(titleTokens(a));
  const right = titleTokens(b);
  if (!left.size || !right.length) return 0;
  let hits = 0;
  for (const token of right) if (left.has(token)) hits += 1;
  return hits / Math.max(left.size, right.length);
}

function auditMetadata(doc, pageType, findings) {
  const title = titleOf(doc);
  const meta = metaOf(doc);
  if (!title) {
    findings.push(finding(
      "metadata:missing-title",
      "metadata",
      "blocker",
      "observed",
      { field: "title", observed: "" },
      "Add a unique descriptive title for this page.",
      "B"
    ));
  } else {
    if (title.length > 70) {
      findings.push(finding(
        "metadata:title-too-long",
        "metadata",
        "low",
        "observed",
        { field: "title", observed: title.length, snippet: title.slice(0, 90) },
        "Shorten the title toward ~50–65 characters without dropping the exam/year.",
        "B"
      ));
    }
    if (CLICKBAIT_RE.test(title) || isAllCapsTitle(title)) {
      findings.push(finding(
        "metadata:clickbait-or-allcaps-title",
        "metadata",
        "high",
        "observed",
        { field: "title", snippet: title.slice(0, 90) },
        "Replace clickbait/all-caps wording with a factual exam-focused title.",
        "B"
      ));
    }
  }

  const metaRequired = pageType === "BLOG" || pageType === "JOB";
  if (!meta && metaRequired) {
    findings.push(finding(
      "metadata:missing-description",
      "metadata",
      "high",
      "observed",
      { field: "metaDescription", observed: "" },
      "Add a 110–160 character meta description using existing facts (exam, action, year).",
      "B"
    ));
  } else if (!meta && pageType === "MOCK_TEST") {
    findings.push(finding(
      "metadata:missing-description",
      "metadata",
      "low",
      "observed",
      { field: "metaDescription", observed: "" },
      "Optional: add a one-sentence test description (exam + subject). Do not write a long SEO article.",
      "B"
    ));
  } else if (meta && (meta.length < 70 || meta.length > 180) && metaRequired) {
    findings.push(finding(
      "metadata:description-length",
      "metadata",
      "low",
      "observed",
      { field: "metaDescription", observed: meta.length },
      "Tune meta description length to roughly 110–160 characters using existing facts.",
      "B"
    ));
  }
}

function auditIntent(doc, pageType, contentKind, findings) {
  const intent = classifySearchIntent({
    type: pageType === "FAST_TRACK" ? "FAST_TRACK" : pageType,
    title: titleOf(doc),
    contentKind,
    category: doc.category
  });
  const alignment = assessIntentAlignment({
    title: titleOf(doc),
    metaDescription: metaOf(doc),
    intent
  });
  if (!alignment.aligned) {
    findings.push(finding(
      "intent:title-mismatch",
      "intent",
      "medium",
      "heuristic",
      { intent, warnings: alignment.warnings, title: titleOf(doc).slice(0, 90) },
      `Align the title with ${intent} intent (exam + action such as Apply / Result / Mock Test).`,
      "B"
    ));
  }
  return { intent, alignment };
}

function auditContent(doc, pageType, contentKind, findings) {
  const html = htmlOf(doc);
  const text = plainText(html);
  const words = Number(doc.wordCount) || countWords(html || text);
  const h1 = countTags(html, "h1");
  const h2 = countTags(html, "h2");
  const tables = countTags(html, "table");
  const lists = countTags(html, "ul") + countTags(html, "ol");

  const empty = !text && !String(doc.title || "").trim() && !(Array.isArray(doc.questions) && doc.questions.length);
  if (empty) {
    findings.push(finding(
      "content:empty",
      "content",
      "blocker",
      "observed",
      { observed: "no title/body/questions" },
      "Page has no usable content in the source document.",
      "B"
    ));
    return { words, h1, h2, tables, lists };
  }

  if (pageType === "BLOG") {
    if (h1 === 0 && html.includes("<")) {
      findings.push(finding(
        "content:missing-h1",
        "content",
        "medium",
        "observed",
        { h1 },
        "Use exactly one H1 matching the page topic.",
        "B"
      ));
    } else if (h1 > 1) {
      findings.push(finding(
        "content:multiple-h1",
        "content",
        "medium",
        "observed",
        { h1 },
        "Keep a single H1; demote extra H1s to H2.",
        "A"
      ));
    }
    if (words < 200) {
      findings.push(finding(
        "content:thin-blog",
        "content",
        "medium",
        "observed",
        { words, note: "Blog expected to have article body; this is not a Google penalty claim." },
        "Decide whether this is an unfinished draft. If it is a guide, add useful sections — do not add filler.",
        "B"
      ));
    } else if (words >= 400 && h2 < 2) {
      findings.push(finding(
        "content:weak-headings",
        "content",
        "low",
        "observed",
        { words, h2 },
        "Add a few descriptive H2s so scanners and readers can scan the article.",
        "B"
      ));
    }
  }

  if (pageType === "JOB") {
    const hasFacts = Boolean(doc.lastDate || doc.organization || doc.applyLink || doc.directLink);
    if (!html.trim() && !String(doc.description || doc.shortInfo || "").trim() && !hasFacts) {
      findings.push(finding(
        "content:sparse-job",
        "content",
        "high",
        "observed",
        { observed: "no article, description, or key job fields" },
        "This job record is missing both prose and structured facts.",
        "B"
      ));
    }
    // Thin job body: has SOME material but far below a structured page.
    // This is the common weak-job case that must stay improvable deterministically.
    if (html.trim() && words < 250 && (h2 === 0 || words < 120)) {
      findings.push(finding(
        "content:thin-job",
        "content",
        "medium",
        "observed",
        { words, h2, note: "Job body is too thin to guide an applicant; sections can be built from existing facts." },
        "Restructure the thin job body into scannable sections (key facts table, how to apply, official source) using only existing record facts.",
        "B"
      ));
    }
    if (html && h2 === 0 && words >= 250) {
      findings.push(finding(
        "content:job-missing-sections",
        "content",
        "medium",
        "heuristic",
        { h2, words },
        "Add headings for dates, eligibility, and how to apply using existing official facts.",
        "B"
      ));
    }
    const blob = `${html} ${doc.description || ""}`;
    if (html && words >= 250 && !/(आवेदन कैसे|how to apply|apply online)/i.test(blob)) {
      findings.push(finding(
        "content:job-missing-apply-help",
        "content",
        "low",
        "heuristic",
        { observed: "no apply-help heading/copy" },
        "Add a short How to Apply section that uses the official apply URL already on the record.",
        "B"
      ));
    }
  }

  if (pageType === "FAST_TRACK" || UPDATE_KINDS.has(contentKind)) {
    const hasLink = Boolean(doc.directLink || doc.applyLink || (Array.isArray(doc.officialLinks) && doc.officialLinks.length));
    const hasBody = Boolean(text || doc.shortInfo || doc.description);
    if (!hasBody && !hasLink) {
      findings.push(finding(
        "content:update-missing-information",
        "content",
        "high",
        "observed",
        { observed: "no summary and no official link" },
        "Add the official link and a short factual summary. Short updates are acceptable — empty ones are not.",
        "B"
      ));
    }
    // Intentionally no word-count penalty: admit card / result pages can be short.
  }

  if (pageType === "MOCK_TEST") {
    const questions = Array.isArray(doc.questions) ? doc.questions : [];
    if (!questions.length && !Number(doc.totalQuestions)) {
      findings.push(finding(
        "content:mock-missing-questions",
        "content",
        "high",
        "observed",
        { questions: 0 },
        "Mock test has no questions in the source document.",
        "C"
      ));
    }
    // Never demand long SEO article copy on mock tests.
  }

  if (pageType === "WEB_STORY") {
    const pages = Array.isArray(doc.pages) ? doc.pages : (Array.isArray(doc.slides) ? doc.slides : []);
    if (!pages.length) {
      findings.push(finding(
        "content:story-missing-pages",
        "content",
        "high",
        "observed",
        { pages: 0 },
        "Web story has no pages/slides in the source document.",
        "B"
      ));
    }
  }

  // STUDY_MATERIAL / COURSE / EBOOK / FAST_TRACK / MOCK_TEST / WEB_STORY
  // are allowed to be short. Never use blog word-count heuristics on them.

  return { words, h1, h2, tables, lists, shortFormOk: SHORT_OK_TYPES.has(pageType) };
}

function auditTopic(doc, pageType, findings) {
  const examFamily = doc.examFamily || detectExamFamily(doc);
  const contentKind = doc.contentKind || detectContentKind({
    type: pageType === "FAST_TRACK" ? "FAST_TRACK" : pageType,
    title: titleOf(doc),
    category: doc.category,
    h1: doc.h1
  });
  if ((pageType === "JOB" || pageType === "FAST_TRACK" || pageType === "MOCK_TEST") && examFamily === "GENERAL") {
    findings.push(finding(
      "topic:weak-exam-entity",
      "topic",
      "low",
      "heuristic",
      { examFamily, title: titleOf(doc).slice(0, 80) },
      "Exam family could not be detected. Add a clear exam/organization name in the title if it is known.",
      "B"
    ));
  }
  return { examFamily, contentKind, hub: hubForFamily(examFamily) };
}

function auditInternalLinks(doc, pageType, html, findings) {
  const counts = internalHrefCount(html, doc.relatedLinks);
  const expectsLinks = pageType === "JOB" || pageType === "BLOG" || pageType === "FAST_TRACK";
  if (expectsLinks && counts.total === 0) {
    findings.push(finding(
      "internalLinks:none-in-source",
      "internalLinks",
      "medium",
      "heuristic",
      {
        inBody: counts.inBody,
        storedRelatedLinks: counts.stored,
        note: "Runtime RelatedContent widget is not visible in the stored document."
      },
      "Add contextual internal links (exam hub, related mock test/syllabus) in the page body. Do not dump random latest posts.",
      "B"
    ));
  } else if (pageType === "MOCK_TEST" && counts.total === 0) {
    findings.push(finding(
      "internalLinks:none-in-source",
      "internalLinks",
      "low",
      "heuristic",
      { inBody: 0, storedRelatedLinks: counts.stored },
      "Link the test to its exam hub or a related job/syllabus when those pages exist.",
      "B"
    ));
  }
  return counts;
}

function auditSchema(doc, pageType, now, findings) {
  const schemas = parseSchemaList(doc.schemaMarkup || doc.structuredData);
  const types = schemaTypes(schemas);
  if (pageType === "JOB") {
    const life = classifyJobLifecycle({
      type: "JOB",
      lastDate: doc.lastDate,
      startDate: doc.startDate
    }, now);
    const hasJobPosting = types.some((type) => String(type).toLowerCase() === "jobposting");
    if ((life.status === "CLOSED" || life.status === "EXPIRED") && hasJobPosting) {
      findings.push(finding(
        "schema:expired-jobposting",
        "schema",
        "high",
        "observed",
        { lifecycle: life.status, schemaTypes: types },
        "Omit JobPosting structured data for closed/expired jobs; keep an Article (SSR already does this when includeJobPostingSchema is false).",
        "A"
      ));
    }
    return { lifecycle: life, types };
  }
  if (pageType === "MOCK_TEST" && types.length && !types.some((type) => /quiz/i.test(type))) {
    findings.push(finding(
      "schema:unexpected-type",
      "schema",
      "low",
      "heuristic",
      { schemaTypes: types, expected: "Quiz" },
      "Mock test pages should use Quiz structured data when schema is stored.",
      "A"
    ));
  }
  return { lifecycle: null, types };
}

function auditIndexability(doc, findings) {
  if (doc.noIndex === true) {
    findings.push(finding(
      "indexability:noindex",
      "indexability",
      "high",
      "observed",
      { noIndex: true, status: doc.status || "" },
      "Document is marked noIndex. Confirm whether this page should stay out of the index.",
      "C"
    ));
  }
  if (!isPublishedStatus(doc.status)) {
    findings.push(finding(
      "indexability:not-published",
      "indexability",
      "blocker",
      "observed",
      { status: doc.status || "" },
      "This record is not published. It should not be in public sitemaps.",
      "C"
    ));
  }
}

function auditFreshness(doc, pageType, lifecycle, now, findings) {
  const updated = isoDate(doc.updatedAt || doc.publishedAt || doc.createdAt);
  if (pageType === "BLOG" && updated) {
    const ageDays = Math.floor((now.getTime() - new Date(updated).getTime()) / 86400000);
    if (Number.isFinite(ageDays) && ageDays > 400) {
      findings.push(finding(
        "freshness:old-blog",
        "freshness",
        "low",
        "heuristic",
        { updatedAt: updated, ageDays },
        "Blog has not been updated in a long time. Refresh only if facts/guidance changed — do not churn dates.",
        "B"
      ));
    }
  }
  if (lifecycle && lifecycle.status === "EXPIRED") {
    findings.push(finding(
      "freshness:expired-job-still-indexable",
      "freshness",
      "low",
      "observed",
      { lifecycle: lifecycle.status, lastDate: doc.lastDate || "" },
      "Expired jobs stay as reference by design. Keep JobPosting omitted; do not delete the page solely for age.",
      "A"
    ));
  }
}

function auditDuplicate(doc, catalog, findings) {
  const title = titleOf(doc);
  if (!title || !Array.isArray(catalog) || catalog.length < 2) return;
  for (const other of catalog) {
    if (!other || other.id === doc.id) continue;
    const otherTitle = titleOf(other);
    if (!otherTitle) continue;
    const sim = titleSimilarity(title, otherTitle);
    if (sim >= 0.9) {
      findings.push(finding(
        "duplicate:similar-title",
        "duplicate",
        "medium",
        "heuristic",
        { otherId: other.id, otherUrl: other.url || "", similarity: Number(sim.toFixed(2)) },
        "Possible duplication: another sampled page has a very similar title. Review before merging. This is not a Google penalty claim.",
        "B"
      ));
      break;
    }
  }
}

function auditImages(doc, html, findings) {
  const missing = findImagesMissingAlt(html);
  if (missing.length) {
    findings.push(finding(
      "images:missing-alt",
      "images",
      "low",
      "observed",
      { count: missing.length, src: missing[0] },
      "Add descriptive alt text derived from the page title/content kind. Do not generate fake photos of people.",
      "A"
    ));
  }
  const imageUrl = doc.imageUrl || doc.image || doc.coverImage || "";
  if (imageUrl && !isAcceptableImageUrl(imageUrl) && pageNeedsImage(doc)) {
    findings.push(finding(
      "images:invalid-url",
      "images",
      "low",
      "heuristic",
      { imageUrl: String(imageUrl).slice(0, 120) },
      "Image URL does not look like a usable https image.",
      "B"
    ));
  }
}

function pageNeedsImage(doc) {
  const pageType = detectPageType(doc.collection, doc);
  return pageType === "BLOG" || pageType === "WEB_STORY";
}

function auditFaq(doc, pageType, findings) {
  const faqs = Array.isArray(doc.faqs) ? doc.faqs : [];
  if (!faqs.length) {
    if (pageType === "BLOG") {
      findings.push(finding(
        "faq:none",
        "faq",
        "low",
        "heuristic",
        { count: 0 },
        "Optional: add a few useful, source-grounded FAQs if the article answers real questions. Do not invent FAQs.",
        "B"
      ));
    }
    return;
  }
  const review = scoreFaqUsefulness(faqs);
  if (review.issues.includes("faq:placeholder-answers")) {
    findings.push(finding(
      "faq:placeholder-answers",
      "faq",
      "medium",
      "observed",
      { usefulCount: review.usefulCount, issues: review.issues },
      "Replace placeholder FAQ answers with short facts from the official source, or remove the FAQs.",
      "B"
    ));
  } else if (review.issues.includes("faq:generic-questions")) {
    findings.push(finding(
      "faq:generic-questions",
      "faq",
      "low",
      "observed",
      { issues: review.issues },
      "Replace generic FAQs with questions a student would actually ask about this exam/update.",
      "B"
    ));
  }
}

function auditTrust(doc, pageType, findings) {
  const author = String(doc.authorName || doc.author || "").trim();
  if ((pageType === "BLOG" || pageType === "JOB" || pageType === "FAST_TRACK") && !author) {
    findings.push(finding(
      "trust:missing-author",
      "trust",
      "low",
      "observed",
      { author: "" },
      "Set author to StudyGyaan Editorial Team (do not invent a personal expert).",
      "A"
    ));
  }
  const sourceUrl = String(doc.sourceUrl || (doc.sourceCitation && doc.sourceCitation.url) || "").trim();
  if ((pageType === "JOB" || pageType === "FAST_TRACK") && !sourceUrl && !doc.applyLink && !doc.directLink) {
    findings.push(finding(
      "trust:missing-source",
      "trust",
      "medium",
      "observed",
      { sourceUrl: "", applyLink: doc.applyLink || "", directLink: doc.directLink || "" },
      "Disclose the official source/apply URL already used for this notification. Do not invent a URL.",
      "C"
    ));
  }
}

function auditGsc(doc, gscRows, findings) {
  const rows = gscRowsForPage(gscRows, doc.url);
  if (!rows.length) {
    return { status: "unavailable", reason: "no imported GSC row for this URL", metrics: null };
  }
  const best = rows.slice().sort((a, b) => b.impressions - a.impressions)[0];
  if (best.impressions >= 100 && best.ctr < 0.02 && best.position > 0 && best.position <= 12) {
    findings.push(finding(
      "gsc:low-ctr",
      "gsc",
      "high",
      "gsc",
      {
        query: best.query,
        impressions: best.impressions,
        ctr: best.ctr,
        position: best.position
      },
      "Imported Search Console data shows high impressions with low CTR. Rewrite title/meta (human approval) using existing facts.",
      "B"
    ));
  }
  return {
    status: "observed",
    reason: null,
    metrics: {
      rowCount: rows.length,
      impressions: best.impressions,
      clicks: best.clicks,
      ctr: best.ctr,
      position: best.position,
      query: best.query
    }
  };
}

function auditAnswerReadiness(doc, pageType, contentMetrics, findings) {
  const html = htmlOf(doc);
  const hasQuestions = /<h2[^>]*>[^<]*\?/i.test(html) || (Array.isArray(doc.faqs) && doc.faqs.length > 0);
  const hasLists = (contentMetrics.lists || 0) > 0 || (contentMetrics.tables || 0) > 0;
  const hasFacts = Boolean(doc.lastDate || doc.organization || doc.directLink);
  let score = 30;
  if (hasQuestions) score += 20;
  if (hasLists) score += 15;
  if (hasFacts && (pageType === "JOB" || pageType === "FAST_TRACK")) score += 20;
  if ((contentMetrics.words || 0) >= 200 && pageType === "BLOG") score += 10;
  if (pageType === "MOCK_TEST" && Array.isArray(doc.questions) && doc.questions.length) score += 25;
  score = Math.max(0, Math.min(100, score));
  if (pageType === "BLOG" && score < 50) {
    findings.push(finding(
      "answerReadiness:weak-structure",
      "answerReadiness",
      "low",
      "heuristic",
      {
        score,
        hasQuestions,
        hasLists,
        note: "Heuristic only — not an AI Overview / ChatGPT citation / GEO / LLMO rank."
      },
      "Make one or two sections answer a real question directly (heading + short answer + list/table).",
      "B"
    ));
  }
  return { status: "heuristic", metrics: { score, hasQuestions, hasLists }, reason: "AI/Search answer readiness signals only" };
}

function auditTechnical(httpResult, findings) {
  if (!httpResult) {
    return { status: "unavailable", reason: "live HTTP audit not enabled in Phase 2 default path", metrics: null };
  }
  const issues = Array.isArray(httpResult.issues) ? httpResult.issues : [];
  const status = Number(httpResult.status) || 0;
  if (issues.includes("not_found") || status === 404) {
    findings.push(finding("technical:not-found", "technical", "blocker", "observed", { status }, "URL returned 404/410.", "C"));
  }
  if (issues.includes("soft_404")) {
    findings.push(finding("technical:soft-404", "technical", "high", "observed", { title: httpResult.title || "" }, "Server HTML looks like a soft 404.", "B"));
  }
  if (issues.includes("missing_canonical")) {
    findings.push(finding("technical:missing-canonical", "technical", "medium", "observed", { canonical: httpResult.canonical || null }, "Add a self-referencing canonical.", "A"));
  }
  if (issues.includes("canonical_mismatch")) {
    findings.push(finding("technical:canonical-mismatch", "technical", "medium", "observed", { url: httpResult.url, canonical: httpResult.canonical }, "Canonical does not match the requested URL.", "B"));
  }
  if (issues.includes("page_with_redirect")) {
    findings.push(finding("technical:redirect", "technical", "medium", "observed", { status, redirectLocation: httpResult.redirectLocation || null }, "URL redirects. Prefer the canonical live URL in sitemaps.", "A"));
  }
  return { status: issues.length ? "issues" : "ok", reason: null, metrics: { httpStatus: status, issues } };
}

function auditPage(doc, options = {}) {
  const now = options.now || new Date();
  const pageType = detectPageType(doc.collection || doc.collectionName, doc);
  const findings = [];
  const html = htmlOf(doc);
  const httpResult = options.httpResult || options.httpAudit || null;

  const technical = auditTechnical(httpResult, findings);
  auditMetadata(doc, pageType, findings);
  const contentKind = doc.contentKind || detectContentKind({
    type: pageType === "FAST_TRACK" ? "FAST_TRACK" : pageType,
    title: titleOf(doc),
    category: doc.category
  });
  const intentInfo = auditIntent(doc, pageType, contentKind, findings);
  const contentMetrics = auditContent(doc, pageType, contentKind, findings);
  const topic = auditTopic(doc, pageType, findings);
  const links = auditInternalLinks(doc, pageType, html, findings);
  const schemaInfo = auditSchema(doc, pageType, now, findings);
  auditIndexability(doc, findings);
  auditFreshness(doc, pageType, schemaInfo.lifecycle, now, findings);
  auditDuplicate(doc, options.catalog, findings);
  auditImages(doc, html, findings);
  auditFaq(doc, pageType, findings);
  auditTrust(doc, pageType, findings);
  const gsc = auditGsc(doc, options.gscRows, findings);
  const answer = auditAnswerReadiness(doc, pageType, contentMetrics, findings);

  const sitemapUrls = options.sitemapUrls;
  let sitemapStatus = { status: "unavailable", reason: "sitemap list not provided", metrics: null };
  if (sitemapUrls && typeof sitemapUrls.has === "function") {
    const abs = String(doc.url || "").startsWith("http") ? doc.url : `https://studygyaan.in${doc.url || ""}`;
    const included = sitemapUrls.has(doc.url) || sitemapUrls.has(abs);
    sitemapStatus = { status: included ? "ok" : "missing", reason: included ? null : "URL not in provided sitemap set", metrics: { included } };
    if (!included && isPublishedStatus(doc.status) && doc.noIndex !== true) {
      findings.push(finding(
        "indexability:not-in-sitemap-sample",
        "indexability",
        "low",
        "heuristic",
        { url: doc.url },
        "URL was not present in the sitemap sample provided to this audit run.",
        "A"
      ));
    }
  }

  const dimensionOverrides = {
    technical,
    gsc,
    answerReadiness: answer,
    indexability: sitemapStatus.status === "unavailable" && !findings.some((item) => item.dimension === "indexability")
      ? { status: "ok", metrics: { published: isPublishedStatus(doc.status) }, reason: null }
      : undefined,
    metadata: { metrics: { titleLength: titleOf(doc).length, metaLength: metaOf(doc).length } },
    content: { metrics: contentMetrics },
    topic: { metrics: { examFamily: topic.examFamily, contentKind: topic.contentKind, hub: topic.hub && topic.hub.url } },
    internalLinks: { metrics: { inBody: links.inBody, stored: links.stored, total: links.total } },
    intent: { metrics: { intent: intentInfo.intent, aligned: intentInfo.alignment.aligned } },
    schema: { metrics: { types: schemaInfo.types, lifecycle: schemaInfo.lifecycle && schemaInfo.lifecycle.status } }
  };

  return buildAuditRecord({
    url: doc.url || "",
    contentType: pageType,
    contentId: doc.id || "",
    auditedAt: now.toISOString(),
    findings,
    dimensionOverrides,
    extra: { gscImpressions: gsc.metrics && gsc.metrics.impressions }
  });
}

function selectAuditSample(groups, { max = MAX_PAGE_AUDITS, perType = SAMPLE_PER_TYPE } = {}) {
  const order = ["jobs", "blogs", "fast_track", "mock_tests"];
  const picked = [];
  for (const key of order) {
    const list = Array.isArray(groups[key]) ? groups[key] : [];
    const published = list.filter((item) => isPublishedStatus(item.status) && item.noIndex !== true);
    for (const item of published.slice(0, perType)) {
      if (picked.length >= max) break;
      picked.push(item);
    }
  }
  return picked.slice(0, max);
}

function auditPages(pages, options = {}) {
  const list = Array.isArray(pages) ? pages.slice(0, MAX_PAGE_AUDITS) : [];
  return list.map((page) => auditPage(page, { ...options, catalog: options.catalog || list }));
}

async function persistPageAudits(db, FieldValue, audits, options = {}) {
  if (!db || options.dryRun) return { written: 0, dryRun: Boolean(options.dryRun), collection: null };
  assertAllowedAuditWrite(SETTINGS);
  const compact = (audits || []).map(compactAudit).slice(0, MAX_PAGE_AUDITS);
  const summary = summarizeAudits(compact);
  const stamp = FieldValue ? FieldValue.serverTimestamp() : new Date().toISOString();
  await db.collection(SETTINGS).doc(SETTINGS_DOC).set(
    {
      pageAudits: compact,
      pageAuditSummary: summary,
      pageAuditCount: compact.length,
      pageAuditsUpdatedAt: stamp
    },
    { merge: true }
  );
  if (options.runId) {
    assertAllowedAuditWrite("seo_intelligence_runs");
    await db.collection("seo_intelligence_runs").doc(String(options.runId)).set(
      {
        pageAudits: compact,
        pageAuditSummary: summary,
        pageAuditCount: compact.length
      },
      { merge: true }
    );
  }
  return { written: compact.length, dryRun: false, collection: SETTINGS, summary };
}

module.exports = {
  detectPageType,
  auditPage,
  auditPages,
  selectAuditSample,
  persistPageAudits,
  gscRowsForPage,
  internalHrefCount,
  SAMPLE_PER_TYPE,
  SETTINGS,
  SETTINGS_DOC,
  PUBLIC_CONTENT_COLLECTIONS,
  AUDIT_WRITE_ALLOWLIST,
  AUDIT_VERSION
};
