"use strict";

/**
 * ============================================
 *  JOB ARTICLE WRITER AGENT (source-grounded)
 * ============================================
 * Dedicated writer for Government Job articles. It receives ONLY the
 * extracted official source material (text + tables + links) and produces a
 * long-form Hindi/Hinglish article. It is hard-instructed never to invent
 * dates, fees, vacancies or any other fact — anything missing in the source
 * stays empty or points the reader to the official notification.
 */

const { EDITORIAL_AUTHOR, WORD_TARGET_MIN, WORD_TARGET_MAX, isBlockedDomain } = require("./constants");
const {
  normalizeArticleHtml,
  escapeHtml,
  countWords,
  plainText
} = require("./article_html_utils");
const { generateJson } = require("./model_client");

const JOB_FACT_KEYS = [
  "title",
  "organization",
  "advtNo",
  "category",
  "startDate",
  "lastDate",
  "examDate",
  "vacancies",
  "salary",
  "qualification",
  "minAge",
  "ageLimit",
  "location",
  "selectionProcess",
  "eligibility",
  "feeGen",
  "feeSCST",
  "feeFemale",
  "feeOBC",
  "applicationFee",
  "applyLink",
  "notificationLink",
  "officialSiteLink"
];

function text(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function tableDigest(tables = []) {
  if (!tables.length) return "NO TABLES FOUND IN SOURCE";
  return tables
    .slice(0, 12)
    .map((rows, index) => {
      const body = rows.slice(0, 30).map((row) => row.join(" | ")).join("\n");
      return `TABLE ${index + 1}:\n${body}`;
    })
    .join("\n\n")
    .slice(0, 9000);
}

function linkDigest(links = []) {
  if (!links.length) return "NO LINKS FOUND IN SOURCE";
  return links
    .slice(0, 60)
    .map((link) => `- "${link.text}" => ${link.url}`)
    .join("\n")
    .slice(0, 5000);
}

function buildJobWriterPrompt({ source, instructions }) {
  const today = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return [
    "You are the JOB ARTICLE WRITER AGENT for StudyGyaan.in (Indian government-job website).",
    `Today: ${today}.`,
    "",
    "TASK: Write one complete, helpful, LONG-FORM job article in simple natural Hindi/Hinglish,",
    "grounded ONLY in the official source extract given below.",
    "",
    "================ NON-NEGOTIABLE FACT RULES ================",
    "1. Use ONLY facts present in the SOURCE EXTRACT (text, tables, links).",
    "2. NEVER invent or guess dates, application fees, number of vacancies, age limits,",
    "   salary, qualification, advt number, selection steps or links.",
    "3. If a fact is missing in the source, keep that JSON field EMPTY (\"\") and, in prose,",
    "   write a line like 'Official Notification में देखें' — without adding any number of your own.",
    "4. Do not copy long source paragraphs verbatim; explain in your own simple words.",
    "5. Do not name any individual person as author. Author is always:",
    `   "${EDITORIAL_AUTHOR}".`,
    "",
    "================ ARTICLE REQUIREMENTS ================",
    `- Length: ${WORD_TARGET_MIN}-${WORD_TARGET_MAX} meaningful words (no filler repetition, no keyword stuffing).`,
    "- Exactly ONE <h1>. Use multiple <h2> and <h3> sections.",
    "- Must include these sections (Hindi H2s), in a sensible order:",
    "  * संक्षिप्त जानकारी (short overview + responsive overview table)",
    "  * महत्वपूर्ण तिथियाँ (Important Dates — table)",
    "  * आवेदन शुल्क (Application Fee — table)",
    "  * पात्रता / Eligibility (qualification + age, only what source says)",
    "  * वेतन / Salary",
    "  * चयन प्रक्रिया (Selection Process — source steps only)",
    "  * आवेदन कैसे करें (step-by-step Apply Process, generic safe steps)",
    "  * जरूरी दस्तावेज़ (Documents — list typical documents as a checklist)",
    "  * Important Links (official links from source only)",
    "- Tables must be wrapped exactly like:",
    '  <div class="table-responsive"><table class="ai-data-table"><thead>...</thead><tbody>...</tbody></table></div>',
    "- Add 5-8 FAQs (<h3> question + <p> answer) inside an 'अक्सर पूछे जाने वाले प्रश्न (FAQs)' H2.",
    "  Every FAQ answer must be grounded in the source too.",
    "- Links: use only official URLs found in the source links.",
    "",
    "================ SEO REQUIREMENTS ================",
    "- seoTitle: max 70 chars, primary keyword first, natural.",
    "- metaDescription: 140-160 chars.",
    "- slug: english-kebab-case, <= 70 chars, no dates with year unless in title.",
    "",
    "================ OUTPUT: STRICT JSON ONLY ================",
    "{",
    '  "seoTitle": "string",',
    '  "metaDescription": "string",',
    '  "slug": "string",',
    '  "h1": "string (same meaning as article H1)",',
    '  "shortDescription": "2-3 line Hinglish summary",',
    '  "contentHtml": "full article HTML (tables wrapped, single h1, no h1 count >1)",',
    '  "faqs": [{"question": "string", "answer": "string"}],',
    '  "facts": {',
    '    "title": "", "organization": "", "advtNo": "", "category": "ssc|banking|railway|upsc|defense|teaching|state|police|engineering|other",',
    '    "startDate": "", "lastDate": "", "examDate": "", "vacancies": "", "salary": "",',
    '    "qualification": "", "minAge": "", "ageLimit": "", "location": "",',
    '    "selectionProcess": "", "eligibility": "",',
    '    "feeGen": "", "feeSCST": "", "feeFemale": "", "feeOBC": "", "applicationFee": "",',
    '    "applyLink": "", "notificationLink": "", "officialSiteLink": ""',
    "  },",
    '  "officialLinks": [{"label": "Apply Online|Notification PDF|Official Website|...", "url": "https://..."}],',
    '  "keywords": ["8-12 natural search phrases"]',
    "}",
    "",
    "================ SOURCE EXTRACT (the only ground truth) ================",
    `SOURCE URL: ${source.url}`,
    `PAGE TITLE: ${source.pageTitle || ""}`,
    `PAGE META: ${source.metaDescription || ""}`,
    "",
    "--- SOURCE TEXT (truncated) ---",
    (source.text || "").slice(0, 13000),
    "",
    "--- SOURCE TABLES ---",
    tableDigest(source.tables),
    "",
    "--- SOURCE LINKS ---",
    linkDigest(source.links),
    "",
    "================ ADMIN INSTRUCTIONS (optional; never override fact rules) ================",
    `<admin_instructions>${text(instructions, 1500) || "none"}</admin_instructions>`,
    "",
    "VALIDATION BEFORE YOU ANSWER: 1) single h1 2) every number/date/amount also appears in the source",
    "3) word count in range 4) valid JSON. Return ONLY the JSON object."
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

function buildJobStructuredData({ facts, faqs, article, publishedIso }) {
  const jobPosting = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: facts.title || article.h1,
    description: plainText(article.contentHtml).slice(0, 4000) || facts.title || "",
    datePosted: publishedIso,
    hiringOrganization: {
      "@type": "Organization",
      name: facts.organization || "Government Organization"
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressRegion: facts.location || "India",
        addressCountry: "IN"
      }
    },
    employmentType: "FULL_TIME",
    identifier: {
      "@type": "PropertyValue",
      name: facts.organization || EDITORIAL_AUTHOR,
      value: facts.advtNo || article.slug
    }
  };
  // Only attach facts that genuinely exist — no placeholders.
  if (facts.lastDate) jobPosting.validThrough = facts.lastDate;
  if (facts.vacancies) jobPosting.totalJobOpenings = Number.parseInt(String(facts.vacancies).replace(/[^\d]/g, ""), 10) || undefined;
  if (facts.salary) {
    jobPosting.baseSalary = {
      "@type": "MonetaryAmount",
      currency: "INR",
      value: { "@type": "QuantitativeValue", description: facts.salary }
    };
  }
  if (facts.qualification) jobPosting.qualifications = facts.qualification;

  const graph = [jobPosting];
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

/**
 * Normalize raw writer JSON into a safe, complete job article record.
 * Anything the model invented outside the allowed shape is dropped here.
 */
function normalizeJobArticle(raw, { source }) {
  const data = raw && typeof raw === "object" ? raw : {};
  const rawFacts = data.facts && typeof data.facts === "object" ? data.facts : {};

  const facts = {};
  for (const key of JOB_FACT_KEYS) {
    let value = text(rawFacts[key], 400);
    if (["applyLink", "notificationLink", "officialSiteLink"].includes(key)) {
      if (value && (isBlockedDomain(value) || !/^https?:\/\//i.test(value))) value = "";
    }
    facts[key] = value;
  }
  if (!facts.applyLink) facts.applyLink = source.url;
  if (!facts.title) facts.title = text(data.h1 || data.seoTitle || source.pageTitle, 200);
  if (!facts.category) facts.category = "other";

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
      .substring(0, 70) || "job-update";

  const article = {
    type: "JOB",
    h1,
    seoTitle: text(data.seoTitle, 70) || h1.slice(0, 70),
    metaDescription: text(data.metaDescription, 170),
    slug,
    shortDescription: text(data.shortDescription, 500),
    contentHtml,
    faqs,
    facts,
    officialLinks: sanitizeUrlList(data.officialLinks, source.url),
    keywords: (Array.isArray(data.keywords) ? data.keywords : []).map((k) => text(k, 80)).filter(Boolean).slice(0, 15),
    authorName: EDITORIAL_AUTHOR,
    wordCount: countWords(contentHtml) + countWords(faqs.map((f) => `${f.question} ${f.answer}`).join(" "))
  };

  article.structuredData = buildJobStructuredData({
    facts,
    faqs,
    article,
    publishedIso: new Date().toISOString()
  });

  return article;
}

async function generateJobArticle({ source, instructions }, deps = {}) {
  if (!source || !source.text) {
    const err = new Error("Fetched source is required for the Job Article Writer");
    err.code = "SOURCE_REQUIRED";
    throw err;
  }
  const prompt = buildJobWriterPrompt({ source, instructions });
  const raw = await (deps.generateJson || generateJson)(prompt, { temperature: 0.35 });
  return normalizeJobArticle(raw, { source });
}

module.exports = {
  buildJobWriterPrompt,
  normalizeJobArticle,
  generateJobArticle,
  JOB_FACT_KEYS
};
