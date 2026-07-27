"use strict";

/**
 * ==============================================
 *  FAST TRACK ARTICLE WRITER AGENT (separate)
 * ==============================================
 * Dedicated writer for "Fast Track" quick updates (Result / Admit Card /
 * Answer Key / Syllabus / Admission). Also strictly source-grounded: the
 * direct download/result links, dates and details come only from the fetched
 * source page — never invented.
 */

const {
  EDITORIAL_AUTHOR,
  WORD_TARGET_MIN,
  WORD_TARGET_MAX,
  FAST_TRACK_CATEGORIES,
  isBlockedDomain
} = require("./constants");
const { normalizeArticleHtml, plainText, countWords } = require("./article_html_utils");
const { generateJson } = require("./model_client");

function text(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function buildFastTrackWriterPrompt({ source, instructions }) {
  const today = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const tables = (source.tables || [])
    .slice(0, 10)
    .map((rows, i) => `TABLE ${i + 1}:\n${rows.slice(0, 25).map((r) => r.join(" | ")).join("\n")}`)
    .join("\n\n")
    .slice(0, 8000);

  const links = (source.links || [])
    .slice(0, 50)
    .map((l) => `- "${l.text}" => ${l.url}`)
    .join("\n")
    .slice(0, 4500);

  return [
    "You are the FAST TRACK ARTICLE WRITER AGENT for StudyGyaan.in.",
    `Today: ${today}.`,
    "",
    "TASK: Write one complete Hindi/Hinglish long-form article for a Fast Track update",
    "(Result / Admit Card / Answer Key / Syllabus / Admission), grounded ONLY in the source below.",
    "",
    "================ NON-NEGOTIABLE FACT RULES ================",
    "1. Use ONLY facts, dates, roll-number details and links present in the SOURCE EXTRACT.",
    "2. NEVER invent dates, cut-offs, fees, vacancy counts, links or steps not in the source.",
    "3. Missing fact => empty JSON field; in prose write 'official website पर देखें' with no numbers.",
    "4. The direct official link (result/admit-card/answer-key page or PDF) must come from the",
    "   source links list. If not found there, keep directLink EMPTY.",
    "5. Never attribute authorship to a person; author is always",
    `   "${EDITORIAL_AUTHOR}".`,
    "",
    "================ ARTICLE REQUIREMENTS ================",
    `- ${WORD_TARGET_MIN}-${WORD_TARGET_MAX} meaningful words, simple natural Hindi/Hinglish, no filler.`,
    "- Exactly ONE <h1>; proper <h2>/<h3> hierarchy.",
    "- Must include:",
    "  * अपडेट का सार (Overview table: organization, update type, date, status)",
    "  * महत्वपूर्ण तिथियाँ / प्रक्रिया की timeline (from source only)",
    "  * Result/Admit card/Answer key कैसे चेक या डाउनलोड करें (step-by-step)",
    "  * डाउनलोड में क्या-क्या details मिलेंगी",
    "  * आगे की प्रक्रिया क्या है (only if source says; otherwise general guidance, clearly marked)",
    "  * Important Links (official source links only)",
    "- Tables wrapped as: <div class=\"table-responsive\"><table class=\"ai-data-table\">...</table></div>",
    "- 4-6 FAQs (source-grounded answers) inside an 'अक्सर पूछे जाने वाले प्रश्न (FAQs)' H2.",
    "",
    "================ SEO REQUIREMENTS ================",
    "- seoTitle max 70 chars, metaDescription 140-160 chars, english kebab slug <= 70 chars.",
    "",
    "================ OUTPUT: STRICT JSON ONLY ================",
    "{",
    '  "seoTitle": "string",',
    '  "metaDescription": "string",',
    '  "slug": "string",',
    '  "h1": "string",',
    '  "shortDescription": "2-3 line Hinglish summary",',
    '  "contentHtml": "full HTML, single h1, responsive tables",',
    '  "faqs": [{"question": "string", "answer": "string"}],',
    '  "facts": {',
    '    "title": "", "category": "Result|Admit Card|Answer Key|Syllabus|Admission|Other",',
    '    "org": "", "updateDate": "", "directLink": "",',
    '    "totalCandidates": "", "details": ""',
    "  },",
    '  "officialLinks": [{"label": "string", "url": "https://..."}],',
    '  "keywords": ["natural search phrases"]',
    "}",
    "",
    "================ SOURCE EXTRACT (the only ground truth) ================",
    `SOURCE URL: ${source.url}`,
    `PAGE TITLE: ${source.pageTitle || ""}`,
    `PAGE META: ${source.metaDescription || ""}`,
    "",
    "--- SOURCE TEXT (truncated) ---",
    (source.text || "").slice(0, 12000),
    "",
    "--- SOURCE TABLES ---",
    tables || "NO TABLES FOUND",
    "",
    "--- SOURCE LINKS ---",
    links || "NO LINKS FOUND",
    "",
    "================ ADMIN INSTRUCTIONS (optional) ================",
    `<admin_instructions>${text(instructions, 1500) || "none"}</admin_instructions>`,
    "",
    "VALIDATION BEFORE ANSWER: single h1, no invented number/date/link, valid JSON only."
  ].join("\n");
}

function sanitizeUrlList(candidates, fallbackUrl) {
  const clean = [];
  const push = (label, url) => {
    const u = text(url, 600);
    if (!u || !/^https?:\/\//i.test(u) || isBlockedDomain(u)) return;
    if (clean.some((item) => item.url === u)) return;
    clean.push({ label: text(label, 120) || "Official Link", url: u });
  };
  (candidates || []).forEach((item) => push(item?.label, item?.url));
  if (!clean.length && fallbackUrl) push("Official Source", fallbackUrl);
  return clean.slice(0, 8);
}

function buildFastTrackStructuredData({ facts, faqs, article, publishedIso }) {
  const graph = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.h1,
      description: article.metaDescription || article.shortDescription || article.h1,
      inLanguage: "hi",
      datePublished: publishedIso,
      dateModified: publishedIso,
      author: {
        "@type": "Organization",
        name: EDITORIAL_AUTHOR
      },
      publisher: {
        "@type": "Organization",
        name: "StudyGyaan"
      },
      mainEntityOfPage: article.slug
    }
  ];
  if (faqs.length) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.slice(0, 10).map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer }
      }))
    });
  }
  return graph;
}

function normalizeFastTrackArticle(raw, { source }) {
  const data = raw && typeof raw === "object" ? raw : {};
  const rawFacts = data.facts && typeof data.facts === "object" ? data.facts : {};

  const facts = {
    title: text(rawFacts.title, 220),
    category: FAST_TRACK_CATEGORIES.includes(rawFacts.category) ? rawFacts.category : "Other",
    org: text(rawFacts.org, 200),
    updateDate: text(rawFacts.updateDate, 120),
    directLink: text(rawFacts.directLink, 600),
    totalCandidates: text(rawFacts.totalCandidates, 60),
    details: text(rawFacts.details, 800)
  };
  if (facts.directLink && (isBlockedDomain(facts.directLink) || !/^https?:\/\//i.test(facts.directLink))) {
    facts.directLink = "";
  }
  if (!facts.title) facts.title = text(data.h1 || data.seoTitle || source.pageTitle, 200);
  if (!facts.updateDate) facts.updateDate = "Latest Update";

  const h1 = text(data.h1 || facts.title, 220) || facts.title;
  const contentHtml = normalizeArticleHtml(String(data.contentHtml || ""), { h1 });

  const faqs = (Array.isArray(data.faqs) ? data.faqs : [])
    .map((faq) => ({ question: text(faq?.question, 300), answer: text(faq?.answer, 1200) }))
    .filter((faq) => faq.question && faq.answer)
    .slice(0, 10);

  const slugBase = text(data.slug, 70) || facts.title;
  const slug =
    slugBase
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 70) || "fast-track-update";

  const article = {
    type: "FAST_TRACK",
    h1,
    seoTitle: text(data.seoTitle, 70) || h1.slice(0, 70),
    metaDescription: text(data.metaDescription, 170),
    slug,
    shortDescription: text(data.shortDescription, 500),
    contentHtml,
    faqs,
    facts,
    officialLinks: sanitizeUrlList([...(data.officialLinks || []), { label: facts.category, url: facts.directLink }].filter((x) => x.url), source.url),
    keywords: (Array.isArray(data.keywords) ? data.keywords : []).map((k) => text(k, 80)).filter(Boolean).slice(0, 15),
    authorName: EDITORIAL_AUTHOR,
    wordCount: countWords(contentHtml) + countWords(faqs.map((f) => `${f.question} ${f.answer}`).join(" "))
  };

  article.structuredData = buildFastTrackStructuredData({
    facts,
    faqs,
    article,
    publishedIso: new Date().toISOString()
  });

  return article;
}

async function generateFastTrackArticle({ source, instructions }, deps = {}) {
  if (!source || !source.text) {
    const err = new Error("Fetched source is required for the Fast Track Article Writer");
    err.code = "SOURCE_REQUIRED";
    throw err;
  }
  const prompt = buildFastTrackWriterPrompt({ source, instructions });
  const raw = await (deps.generateJson || generateJson)(prompt, { temperature: 0.35 });
  return normalizeFastTrackArticle(raw, { source });
}

module.exports = {
  buildFastTrackWriterPrompt,
  normalizeFastTrackArticle,
  generateFastTrackArticle
};
