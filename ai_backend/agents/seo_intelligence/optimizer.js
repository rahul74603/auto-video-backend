"use strict";

/**
 * Phase 3 SEO optimizer — proposal engine only.
 *
 * Consumes page auditor findings. Never applies. Never publishes.
 * Never invents GSC/HTTP/facts. Never writes public content.
 * Default: deterministic proposals from source + findings.
 * Optional AI articleHtml via injected generateJson / options.useAi.
 * AI never writes production content.
 */

const { detectExamFamily, detectContentKind, hubForFamily } = require("./taxonomy");
const { classifySearchIntent } = require("./search_intent");
const { classifyJobLifecycle } = require("./job_lifecycle");
const { selectRelatedLinks } = require("./linking_engine");
const { buildImageAlt } = require("./image_seo");
const { CLICKBAIT_RE } = require("./discover");
const { scoreFaqUsefulness } = require("./article_faq");
const { EDITORIAL_AUTHOR } = require("../article_agents/constants");
const {
  buildProposal,
  compactProposal,
  summarizeProposals,
  mergeProposalStatuses,
  setProposalStatus,
  sortFindings,
  isFactField,
  assertAllowedProposalWrite,
  assertAllowedApplyWrite,
  extractArticleHtml,
  MAX_PROPOSALS_PER_PAGE,
  MAX_PROPOSALS,
  MAX_HTML_PROPOSALS,
  HTML_INLINE_CHARS,
  BODY_COLLECTION,
  FACT_FIELDS
} = require("./proposal_model");
const {
  buildBlogArticleProposal,
  buildJobArticleProposal,
  buildJobArticleEnhancement,
  buildFastTrackHtml
} = require("./blog_html");

const SETTINGS = "system_settings";
const SETTINGS_DOC = "seo_intelligence";
const SHORT_OK_TYPES = new Set(["FAST_TRACK", "MOCK_TEST", "STUDY_MATERIAL", "COURSE", "EBOOK", "WEB_STORY"]);
const UPDATE_KINDS = new Set(["ADMIT_CARD", "RESULT", "ANSWER_KEY", "NEWS"]);

function titleOf(page) {
  return String(page.seoTitle || page.title || page.h1 || "").replace(/\s+/g, " ").trim();
}

function metaOf(page) {
  return String(page.metaDescription || page.description || page.excerpt || page.shortInfo || "").replace(/\s+/g, " ").trim();
}

function clip(text, max) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

function hasEvidence(finding) {
  return Boolean(finding && finding.id && finding.evidence);
}

function skipIfNoSource(value) {
  const text = String(value || "").trim();
  return text.length ? text : null;
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

function proposeTitle(page, pageType, finding) {
  const current = titleOf(page);
  if (finding.id === "metadata:missing-title") {
    return skipIfNoSource(page.h1 || page.title);
  }
  if (!current) return null;
  let next = current;
  if (finding.id === "metadata:clickbait-or-allcaps-title") {
    next = current.replace(CLICKBAIT_RE, " ").replace(/\s+/g, " ").trim();
    if (!next || next.length < 8) return null;
  }
  if (finding.id === "metadata:title-too-long" || next.length > 70) {
    next = clip(next, 65);
  }
  if (finding.id === "intent:title-mismatch") {
    const intent = classifySearchIntent({
      type: pageType === "FAST_TRACK" ? "FAST_TRACK" : pageType,
      title: current,
      contentKind: page.contentKind,
      category: page.category
    });
    if (intent === "APPLY" && !/apply|recruitment|आवेदन|भर्ती/i.test(next)) {
      next = `${next} Apply Online`.replace(/\s+/g, " ").trim();
    }
    if (intent === "LATEST_UPDATE" && !/result|admit|answer key|declared|released|परिणाम|एडमिट/i.test(next)) {
      return null;
    }
    if (intent === "PRACTICE" && !/mock|test|practice|quiz/i.test(next)) {
      next = `${next} Mock Test`.replace(/\s+/g, " ").trim();
    }
  }
  if (!next || next === current) return null;
  return clip(next, 70);
}

function proposeMeta(page, pageType) {
  const title = titleOf(page);
  if (!title) return null;
  const bits = [clip(title, 90)];
  if (page.lastDate) bits.push(`Last date ${page.lastDate}`);
  if (page.organization) bits.push(page.organization);
  if ((pageType === "JOB" || pageType === "FAST_TRACK") && (page.applyLink || page.directLink)) {
    bits.push("Use the official link on this page");
  }
  if (pageType === "MOCK_TEST") bits.push("Practice questions on StudyGyaan");
  let meta = bits.join(". ");
  if (meta.length < 70 && page.shortInfo) meta = `${meta}. ${page.shortInfo}`;
  meta = clip(meta.replace(/\s+/g, " ").trim(), 160);
  if (meta.length < 40) return null;
  return meta;
}

function blogPlan(page, finding) {
  const words = finding.evidence && finding.evidence.words;
  const reason = classifyShortBlog(page, words);
  const exam = detectExamFamily(page);
  const hub = hubForFamily(exam);
  if (reason === "news/update stub") {
    return {
      currentProblem: `Body is ${words} words on a news/update-style blog.`,
      likelyReason: reason,
      missingUsefulInformation: "Not a long-form gap. Keep it short and factual.",
      suggestedSections: [
        "What changed, using only the existing title/update",
        "Official source already on the page (do not invent a URL)",
        "What the reader should do next (check result / download / apply) without new facts"
      ],
      expectedImprovement: "Keep the page short. Do not pad to a word-count target."
    };
  }
  const sections = [
    exam !== "GENERAL" ? `Who this is for (${exam} — already named or detectable from the title)` : "Who this is for (only if the exam is already named in the title)",
    "Step-by-step using only the process already described or linked",
    hub ? `Related ${hub.name} pages that already exist` : "Related published pages that already exist"
  ];
  if (page.lastDate) sections.push("Important date already on the record, in a small table");
  return {
    currentProblem: `Blog body is ${words} words.`,
    likelyReason: reason,
    missingUsefulInformation: "Missing scannable sections grounded in existing facts — not a 1500-word quota.",
    suggestedSections: sections.slice(0, 4),
    expectedImprovement: "Readers can complete the task without filler paragraphs."
  };
}

function tableFromExistingFacts(page) {
  const rows = [];
  if (page.organization) rows.push(["Organization", String(page.organization)]);
  if (page.lastDate) rows.push(["Last date", String(page.lastDate)]);
  if (page.startDate) rows.push(["Start date", String(page.startDate)]);
  const link = page.applyLink || page.directLink;
  if (link) rows.push(["Official link", String(link)]);
  if (rows.length < 2) return null;
  return { columns: ["Item", "Value"], rows, note: "Values copied from the existing record. Do not invent cells." };
}

function faqFromExistingFacts(page) {
  const faqs = [];
  if (page.lastDate) {
    faqs.push({
      question: "What is the last date mentioned on this page?",
      answer: `Last date on this page: ${page.lastDate}. Confirm on the official notice.`
    });
  }
  if (page.applyLink || page.directLink) {
    faqs.push({
      question: "Where is the official link?",
      answer: "Use the official apply/source link already listed on this page. Do not use a third-party URL."
    });
  }
  if (page.organization) {
    faqs.push({
      question: "Which organization issued this?",
      answer: `${String(page.organization)} is listed on this page. Confirm on the official notice.`
    });
  }
  const list = faqs.slice(0, 4);
  if (!list.length) return null;
  const review = scoreFaqUsefulness(list);
  if (review.issues.length) return null;
  return list;
}

function relatedLinkProposal(page, catalog) {
  const links = selectRelatedLinks(page, catalog || [], 6)
    .filter((item) => item && item.url && String(item.url).startsWith("/") && !String(item.url).startsWith("//"))
    .slice(0, 5);
  if (!links.length) return null;
  return links.map((item) => ({ title: item.title, url: item.url, kind: item.kind }));
}

function headingPlan(page, pageType) {
  if (pageType === "JOB") {
    const sections = ["Overview"];
    if (page.lastDate || page.startDate) sections.push("Important dates");
    sections.push("आवेदन कैसे करें");
    if (page.applyLink || page.directLink) sections.push("Official link");
    return { suggestedH2: sections, note: "Headings only. Do not invent eligibility/salary/vacancy text." };
  }
  if (pageType === "BLOG") {
    return { suggestedH2: ["What this covers", "Steps", "Official source"], note: "Use only facts already on the page." };
  }
  if (pageType === "FAST_TRACK") {
    return { suggestedH2: ["Update", "Official link"], note: "Keep the update short." };
  }
  return null;
}

function proposalFromFinding(finding, audit, page, options) {
  if (!hasEvidence(finding)) return null;
  const pageType = audit.contentType || page.pageType || "OTHER";
  const base = {
    url: audit.url || page.url,
    contentType: pageType,
    contentId: audit.contentId || page.id,
    evidenceIds: [finding.id],
    severity: finding.severity,
    confidence: finding.confidence,
    status: "pending",
    createdAt: options.now instanceof Date ? options.now.toISOString() : (options.now || new Date().toISOString()),
    auditVersion: audit.auditVersion
  };

  if (finding.id === "metadata:missing-title" || finding.id === "metadata:title-too-long"
    || finding.id === "metadata:clickbait-or-allcaps-title" || finding.id === "intent:title-mismatch") {
    if (pageType === "WEB_STORY" && finding.id === "intent:title-mismatch") return null;
    const proposed = proposeTitle(page, pageType, finding);
    if (!proposed) return null;
    return buildProposal({
      ...base,
      field: "seoTitle",
      oldValue: titleOf(page),
      proposedValue: proposed,
      reason: finding.suggestedAction || "Improve the SEO title using existing exam/action words. Do not invent facts.",
      level: "B"
    });
  }

  if (finding.id === "metadata:missing-description" || finding.id === "metadata:description-length"
    || finding.id === "gsc:low-ctr") {
    const proposed = proposeMeta(page, pageType);
    if (!proposed) return null;
    return buildProposal({
      ...base,
      field: "metaDescription",
      oldValue: metaOf(page),
      proposedValue: proposed,
      reason: finding.id === "gsc:low-ctr"
        ? "Imported Search Console row shows low CTR. Rewrite meta from existing facts only; human approval required."
        : (finding.suggestedAction || "Add a meta description from existing facts."),
      level: "B"
    });
  }

  if (finding.id === "content:missing-h1" || finding.id === "content:multiple-h1") {
    const h1 = skipIfNoSource(page.h1 || page.title || page.seoTitle);
    if (!h1) return null;
    return buildProposal({
      ...base,
      field: "h1",
      oldValue: page.h1 || null,
      proposedValue: h1,
      reason: finding.suggestedAction || "Keep a single H1 matching the existing title.",
      level: finding.id === "content:multiple-h1" ? "A" : "B"
    });
  }

  if (finding.id === "content:thin-blog") {
    if (pageType !== "BLOG") return null;
    const htmlProposal = buildBlogArticleProposal(page, finding, options);
    const oldHtml = String(page.articleHtml || page.contentHtml || page.content || "");
    return buildProposal({
      ...base,
      field: "articleHtml",
      oldValue: oldHtml || { words: finding.evidence.words },
      proposedValue: {
        articleHtml: htmlProposal.articleHtml,
        insufficientSource: Boolean(htmlProposal.insufficientSource),
        contentPlan: htmlProposal.contentPlan || blogPlan(page, finding),
        preview: htmlProposal.preview || null,
        htmlSource: htmlProposal.htmlSource
      },
      reason: htmlProposal.reason || "Restructure existing on-page text. Do not expand to a word-count target.",
      level: "B",
      source: htmlProposal.htmlSource || "deterministic-html"
    });
  }

  if (finding.id === "content:weak-headings" || finding.id === "content:job-missing-sections"
    || finding.id === "answerReadiness:weak-structure") {
    if (SHORT_OK_TYPES.has(pageType) && finding.id !== "content:job-missing-sections") return null;
    const plan = headingPlan(page, pageType);
    if (!plan) return null;
    return buildProposal({
      ...base,
      field: "headingPlan",
      oldValue: { h2: finding.evidence && finding.evidence.h2 },
      proposedValue: plan,
      reason: finding.suggestedAction || "Add scannable headings using existing facts.",
      level: "B"
    });
  }

  if (finding.id === "content:thin-job") {
    // Deterministic restructure of a thin job body from existing record facts.
    const proposal = buildJobArticleProposal(page, options);
    if (proposal && proposal.articleHtml) {
      return buildProposal({
        ...base,
        field: "articleHtml",
        oldValue: page.articleHtml || page.contentHtml || null,
        proposedValue: {
          articleHtml: proposal.articleHtml,
          preview: proposal.preview || null,
          htmlSource: proposal.htmlSource,
          insufficientSource: false
        },
        reason: proposal.reason,
        level: "B",
        source: "deterministic-html"
      });
    }
    return null;
  }

  if (finding.id === "content:job-missing-apply-help") {
    const enhanced = buildJobArticleEnhancement(page, options);
    if (enhanced && enhanced.articleHtml) {
      return buildProposal({
        ...base,
        field: "articleHtml",
        oldValue: page.articleHtml || page.contentHtml || null,
        proposedValue: {
          articleHtml: enhanced.articleHtml,
          preview: enhanced.preview || null,
          htmlSource: enhanced.htmlSource,
          insufficientSource: false
        },
        reason: enhanced.reason,
        level: "B",
        source: "deterministic-html"
      });
    }
    const url = page.applyLink || page.directLink;
    if (!url) return null;
    return buildProposal({
      ...base,
      field: "howToApplySection",
      oldValue: null,
      proposedValue: {
        heading: "आवेदन कैसे करें",
        officialUrl: url,
        note: "Use the official apply URL already on the record. Do not invent extra steps or fees."
      },
      reason: "Add a How to Apply heading that points at the existing official URL.",
      level: "B"
    });
  }

  if (finding.id === "content:job-missing-sections") {
    const table = tableFromExistingFacts(page);
    if (table) {
      return buildProposal({
        ...base,
        id: `${page.id || audit.contentId}-contentTable-job-sections`,
        field: "contentTable",
        oldValue: null,
        proposedValue: table,
        reason: "Show existing dates/org/link as a table. Do not invent cells.",
        level: "B"
      });
    }
  }

  if (finding.id === "internalLinks:none-in-source") {
    const links = relatedLinkProposal(page, options.catalog);
    if (!links) return null;
    return buildProposal({
      ...base,
      field: "relatedLinks",
      oldValue: Array.isArray(page.relatedLinks) ? page.relatedLinks : [],
      proposedValue: links,
      reason: "Suggest contextual internal links that already exist in the catalog. Do not write them into HTML yet.",
      level: "B"
    });
  }

  if (finding.id === "images:missing-alt") {
    const alt = buildImageAlt(titleOf(page), page.contentKind || detectContentKind(page));
    return buildProposal({
      ...base,
      field: "imageAlt",
      oldValue: finding.evidence.src || null,
      proposedValue: alt,
      reason: "Alt text derived from the existing page title/content kind. Do not generate photos of people.",
      level: "A"
    });
  }

  if (finding.id === "faq:none" || finding.id === "faq:placeholder-answers" || finding.id === "faq:generic-questions") {
    if (pageType === "MOCK_TEST" || pageType === "WEB_STORY") return null;
    const faqs = faqFromExistingFacts(page);
    if (!faqs) return null;
    return buildProposal({
      ...base,
      field: "faqs",
      oldValue: Array.isArray(page.faqs) ? page.faqs : [],
      proposedValue: faqs,
      reason: "FAQs grounded only in facts already on the record. Do not invent answers.",
      level: "B"
    });
  }

  if (finding.id === "trust:missing-author") {
    return buildProposal({
      ...base,
      field: "authorName",
      oldValue: page.authorName || page.author || "",
      proposedValue: EDITORIAL_AUTHOR,
      reason: "Set author to StudyGyaan Editorial Team. Do not invent a personal expert.",
      level: "A"
    });
  }

  if (finding.id === "schema:expired-jobposting") {
    return buildProposal({
      ...base,
      field: "schemaMarkup",
      oldValue: "JobPosting",
      proposedValue: "omit JobPosting (keep Article)",
      reason: "Expired/closed jobs must not re-add JobPosting. SSR already omits it when includeJobPostingSchema is false.",
      level: "A"
    });
  }

  if (finding.id === "content:mock-missing-questions") {
    return buildProposal({
      ...base,
      field: "questions",
      oldValue: [],
      proposedValue: null,
      reason: "Mock questions cannot be invented. No replacement value.",
      level: "C"
    });
  }

  if (finding.id === "content:update-missing-information") {
    if (!(page.directLink || page.applyLink || page.shortInfo || page.description)) {
      return null;
    }
    if (pageType === "FAST_TRACK") {
      const html = buildFastTrackHtml(page);
      if (html && html.articleHtml) {
        return buildProposal({
          ...base,
          field: "articleHtml",
          oldValue: page.articleHtml || page.shortInfo || null,
          proposedValue: {
            articleHtml: html.articleHtml,
            preview: html.preview || null,
            htmlSource: html.htmlSource,
            insufficientSource: false
          },
          reason: html.reason,
          level: "B",
          source: "deterministic-html"
        });
      }
    }
  }

  return null;
}

function generateProposals(audit, page, options = {}) {
  if (!audit || !page) return [];
  const pageType = audit.contentType || "OTHER";
  const out = [];
  const usedFields = new Set();
  for (const finding of sortFindings(audit.findings)) {
    if (out.length >= MAX_PROPOSALS_PER_PAGE) break;
    const proposal = proposalFromFinding(finding, audit, page, options);
    if (!proposal) continue;
    if (!proposal.evidenceIds.length) continue;
    if (proposal.proposedValue == null && proposal.level !== "C") continue;
    if (usedFields.has(proposal.field) && proposal.field !== "contentTable") continue;
    if (SHORT_OK_TYPES.has(pageType) && proposal.field === "contentPlan") continue;
    if (pageType !== "BLOG" && pageType !== "JOB" && pageType !== "FAST_TRACK" && proposal.field === "articleHtml") continue;
    if (pageType === "MOCK_TEST" && proposal.field === "articleHtml") continue;
    if (pageType === "MOCK_TEST" && (proposal.field === "questions" || proposal.field === "answers")) {
      if (proposal.proposedValue != null) continue;
    }
    const life = pageType === "JOB" ? classifyJobLifecycle({ type: "JOB", lastDate: page.lastDate, startDate: page.startDate }, options.now || new Date()) : null;
    if (life && (life.status === "EXPIRED" || life.status === "CLOSED") && proposal.field === "schemaMarkup") {
      const proposed = String(proposal.proposedValue || "");
      if (/jobposting/i.test(proposed) && !/omit|remove|exclude|keep article/i.test(proposed)) {
        continue;
      }
    }
    usedFields.add(proposal.field);
    out.push(compactProposal(proposal));
  }
  return out;
}

function generateProposalsForAudits(audits, pages, options = {}) {
  const pageList = Array.isArray(pages) ? pages : [];
  const byId = new Map(pageList.map((page) => [String(page.id || page.contentId || ""), page]));
  const all = [];
  let htmlCount = 0;
  for (const audit of Array.isArray(audits) ? audits : []) {
    if (all.length >= MAX_PROPOSALS) break;
    const page = byId.get(String(audit.contentId || "")) || pageList.find((item) => item.url === audit.url);
    if (!page) continue;
    const batch = generateProposals(audit, page, options);
    for (const proposal of batch) {
      if (all.length >= MAX_PROPOSALS) break;
      if (proposal.field === "articleHtml") {
        if (htmlCount >= MAX_HTML_PROPOSALS) continue;
        htmlCount += 1;
      }
      all.push(proposal);
    }
  }
  return all;
}

async function enrichProposalsWithAi(proposals, pages, options = {}) {
  if (options.useAi !== true && typeof options.generateJson !== "function") {
    return Array.isArray(proposals) ? proposals : [];
  }
  const { enrichBlogHtmlProposal } = require("./content_ai");
  const pageList = Array.isArray(pages) ? pages : [];
  const byId = new Map(pageList.map((page) => [String(page.id || page.contentId || ""), page]));
  const out = [];
  for (const proposal of Array.isArray(proposals) ? proposals : []) {
    if (!proposal || proposal.field !== "articleHtml" || proposal.contentType !== "BLOG") {
      out.push(proposal);
      continue;
    }
    const page = byId.get(String(proposal.contentId || "")) || {};
    const finding = { id: "content:thin-blog", evidence: { words: 0 } };
    const enriched = await enrichBlogHtmlProposal(page, finding, {
      articleHtml: extractArticleHtml(proposal.proposedValue),
      contentPlan: proposal.proposedValue && proposal.proposedValue.contentPlan,
      insufficientSource: proposal.insufficientSource,
      htmlSource: proposal.htmlSource,
      reason: proposal.reason,
      preview: proposal.proposedValue && proposal.proposedValue.preview
    }, options);
    out.push(compactProposal({
      ...proposal,
      proposedValue: {
        articleHtml: enriched.articleHtml,
        insufficientSource: Boolean(enriched.insufficientSource),
        contentPlan: enriched.contentPlan || (proposal.proposedValue && proposal.proposedValue.contentPlan),
        preview: enriched.preview || null,
        htmlSource: enriched.htmlSource
      },
      reason: enriched.reason || proposal.reason,
      source: enriched.htmlSource || proposal.source,
      confidence: enriched.confidence || proposal.confidence
    }));
  }
  return out;
}

function refuseFactMutation(field, value) {
  if (!isFactField(field)) return { field, value, blocked: false };
  return {
    field,
    value: null,
    blocked: true,
    level: "C",
    requiresReview: true,
    reason: `Fact field ${field} is locked. Optimizer will not invent a replacement.`
  };
}

async function persistOptimizationProposals(db, FieldValue, proposals, options = {}) {
  if (!db || options.dryRun) return { written: 0, dryRun: Boolean(options.dryRun), collection: null };
  assertAllowedProposalWrite(SETTINGS);
  let previous = Array.isArray(options.previous) ? options.previous : [];
  if (!previous.length) {
    try {
      const snap = await db.collection(SETTINGS).doc(SETTINGS_DOC).get();
      const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      if (exists) {
        const data = typeof snap.data === "function" ? snap.data() : {};
        previous = Array.isArray(data.optimizationProposals) ? data.optimizationProposals : [];
      }
    } catch {
      previous = [];
    }
  }
  const compact = mergeProposalStatuses(previous, (proposals || []).map(compactProposal)).slice(0, MAX_PROPOSALS);
  for (const item of compact) {
    if (!item || item.field !== "articleHtml") continue;
    const html = extractArticleHtml(item.proposedValue);
    if (!html || html.length <= HTML_INLINE_CHARS) continue;
    assertAllowedApplyWrite(BODY_COLLECTION);
    const bodyId = String(item.id || "proposal").slice(0, 120);
    await db.collection(BODY_COLLECTION).doc(bodyId).set({
      proposalId: bodyId,
      url: item.url || "",
      articleHtml: html.slice(0, 200000),
      oldArticleHtml: typeof item.oldValue === "string" ? item.oldValue.slice(0, 200000) : null,
      createdAt: FieldValue && FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : new Date().toISOString()
    }, { merge: true });
    item.proposedValue = {
      ...(item.proposedValue && typeof item.proposedValue === "object" ? item.proposedValue : {}),
      htmlRef: bodyId,
      articleHtml: html.slice(0, 1500),
      previewText: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280)
    };
  }
  const summary = summarizeProposals(compact);
  const stamp = FieldValue ? FieldValue.serverTimestamp() : new Date().toISOString();
  await db.collection(SETTINGS).doc(SETTINGS_DOC).set(
    {
      optimizationProposals: compact,
      optimizationProposalSummary: summary,
      optimizationProposalCount: compact.length,
      optimizationProposalsUpdatedAt: stamp,
      optimizationApply: false
    },
    { merge: true }
  );
  if (options.runId) {
    assertAllowedProposalWrite("seo_intelligence_runs");
    await db.collection("seo_intelligence_runs").doc(String(options.runId)).set(
      {
        optimizationProposals: compact,
        optimizationProposalSummary: summary,
        optimizationProposalCount: compact.length,
        optimizationApply: false
      },
      { merge: true }
    );
  }
  return { written: compact.length, dryRun: false, collection: SETTINGS, summary };
}

module.exports = {
  generateProposals,
  generateProposalsForAudits,
  enrichProposalsWithAi,
  persistOptimizationProposals,
  setProposalStatus,
  mergeProposalStatuses,
  refuseFactMutation,
  proposeMeta,
  proposeTitle,
  blogPlan,
  tableFromExistingFacts,
  relatedLinkProposal,
  FACT_FIELDS,
  SETTINGS,
  SETTINGS_DOC
};
