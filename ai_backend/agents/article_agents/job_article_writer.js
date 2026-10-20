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

const {
  EDITORIAL_AUTHOR,
  WORD_COMPRESS_TRIGGER,
  isBlockedDomain
} = require("./constants");
const {
  normalizeArticleHtml,
  appendJoinUsSection,
  escapeHtml,
  countWords,
  plainText
} = require("./article_html_utils");
const { generateJson } = require("./model_client");
const { formatReviewFeedbackPrompt } = require("./fact_quality_reviewer");
const { buildGroundingFactSheet } = require("./article_repairer");

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

function buildJobWriterPrompt({ source, instructions, feedbackIssues, strategyGuidance }) {
  const today = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  // ⭐ STRICT ALLOWLIST — source me maujood numbers/dates hi likhne hain.
  const factSheet = buildGroundingFactSheet(source);

  return [
    "You are the JOB ARTICLE WRITER AGENT for StudyGyaan.in (Indian government-job website).",
    `Today: ${today}.`,
    "",
    "TASK: Write one helpful, source-grounded job article in clear natural Hindi/Hinglish; let the official notice determine its length.",
    "grounded ONLY in the official source extract given below.",
    "",
    "================ NON-NEGOTIABLE FACT RULES ================",
    "1. Use ONLY facts present in the SOURCE EXTRACT (text, tables, links).",
    "2. NEVER invent or guess dates, application fees, number of vacancies, age limits,",
    "   salary, qualification, advt number, selection steps or links.",
    "3. If a fact is missing in the source, keep that JSON field EMPTY (\"\") and, in prose,",
    "   write a line like 'Official Notification में देखें' — without adding any number of your own.",
    "4. ⭐ ORIGINAL WRITING (Google duplicate content se bachna hai): source page ke sentences/",
    "   paragraphs WORD-BY-WORD copy KARNA MANA HAI — chahe facts kitne bhi same kyun na hon.",
    "   Har line APNE alag shabdon me, alag sentence structure me likho (jaise StudyGyaan ka",
    "   apna editorial style hai). Sirf numbers/dates/names same rahenge, wording BILKUL alag.",
    "5. Do not name any individual person as author. Author is always:",
    `   "${EDITORIAL_AUTHOR}".`,
    "",
    "================ ARTICLE REQUIREMENTS (LONG-FORM, DETAILED, SEO-RICH) ================",
    "TARGET: 1500-2200 words (minimum ~1000). Sarkari-result style ka COMPLETE coverage chahiye —",
    "chhota summary bilkul nahi. Har section me facts ke saath unka matlab/implication bhi samjhao",
    "(jaise last date nazdeek ho to jaldi apply karne ki salah). Lambaai detail aur structure se aani",
    "chahiye — naya fact invent karke kabhi nahi.",
    "- Exactly one <h1> (post name + organization + year, keyword-rich).",
    "- MANDATORY section structure (H2 headings, keyword-rich, available facts ke saath):",
    "  1) Overview/intro paragraph — role, org, vacancies, mode, deadline (primary keywords first 100 words me).",
    "  2) Overview table — saare key facts ek nazar me (post, org, advt no, vacancies, dates, qualification, age, salary, location).",
    "  3) Important Dates table + 2-3 line explanation (kab se kab tak, kya miss na karein).",
    "  4) Vacancy Details — post-wise/category-wise break-up jo source me ho; table preferred.",
    "  5) Eligibility / Qualification — har post ke liye kaun apply kar sakta hai, detail me.",
    "  6) Age Limit — min/max, cut-off date, relaxation sirf tab jab notice me likhi ho.",
    "  7) Salary / Pay Scale — pay matrix/grade pay sahit jo source me ho.",
    "  8) Application Fee table (Gen/OBC/EWS/SC/ST/Female) + payment mode.",
    "  9) Selection Process — stages detail me, har stage ka matlab samjhate hue.",
    "  10) How to Apply — numbered steps, ACTUAL mode ke hisaab se (online/offline); address/documents/delivery sirf tab jab notice me ho.",
    "  11) Important Links section — Apply Online / Notification PDF / Official Website (direct official HTTPS only).",
    "  12) FAQs — 8-12 unique source-backed questions (last date? fees? qualification? age? salary? selection? kaise apply karein?).",
    "  13) Conclusion — 3-4 lines: key highlights + official notification verify karne ki salah.",
    "- Missing fact = section chhota karo ya 'नोटिफिकेशन में स्पष्ट नहीं' likho; guess/adha-satya kabhi nahi.",
    "- Tables: dates, fees, vacancy, eligibility ke liye tables PREFERRED; har table <div class=\"table-responsive\"> me wrap. Use direct official HTTPS links from source links, never aggregator redirects.",
    "- No editorial self-praise; never claim human fact-checking unless metadata confirms it.",
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
    '  "shortDescription": "detailed 5-8 line Hinglish SEO summary (post + org + vacancies + qualification + fees + last date + apply guidance)",',
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
    '  FACTS FORMAT RULES (site ke upar wale info-box ke liye — ye SABSE ZAROORI hai):',
    '  - startDate/lastDate/examDate: SIRF asli date likho — "31 July 2026" ya "2026-07-31" jaisi.',
    "    Koi extra shabd NAHI (jaise tentative / as per rules / notification dekho mat likho).",
    '    Source me date na mile to field "" KHAALI chhodo (junk mat bharna).',
    '    ⭐ ZAROORI: article body me apply-start/last/exam ki JO date likh rahe ho, Wahi EXACT date',
    '    facts.startDate/lastDate/examDate me BHI copy karo — warna Fact & Quality review FAIL karega.',
    '  - feeGen/feeOBC/feeSCST/feeFemale: SIRF number likho (jaise 1000 ya 0).',
    "    ₹ / Rs / INR / /- sab HATA do (site ka box khud ₹ lagata hai). Free/Exempted ho to 0 likho.",
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
    factSheet.promptBlock,
    "",
    "================ INTERNAL QUALITY STRATEGY (never overrides fact rules) ================",
    text(strategyGuidance, 700) || "Balanced grounded writing.",
    "",
    "================ ADMIN INSTRUCTIONS (optional; never override fact rules) ================",
    `<admin_instructions>${text(instructions, 1500) || "none"}</admin_instructions>`,
    formatReviewFeedbackPrompt(feedbackIssues), // regenerate/self-heal loop: pichli failings writer ko batana ("" ho to harmless)
    "================ FINAL SELF-CHECK (answer se pehle khud verify karo — warna FAIL) ================",
    "1) Exactly one <h1>; poora 13-section structure maujood hai (overview, dates, vacancy, eligibility, age, salary, fee, selection, apply steps, links, 8-12 FAQs, conclusion); article 1000+ words hai.",
    "2) Har number/date/amount/percentage jo likha hai wo upar VERIFIED FACT SHEET me maujood hai.",
    "3) facts.startDate/lastDate/examDate me wahi EXACT dates hain jo article body me likhi hain (ya \"\").",
    "4) 8-12 unique FAQs, har ek ka jawab source-backed aur alag sawal ka.",
    "5) Output SIRF ek valid JSON object — koi markdown fence/explanation nahi."
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
        streetAddress: (facts.location || "India").slice(0, 200),
        ...(facts.location ? { addressLocality: facts.location.split(',')[0].trim().slice(0, 100) } : {}),
        addressCountry: "IN"
      }
    },
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
  // Join-us section (hamare apne social links) har article ke end me deterministic lagta hai.
  const contentHtml = appendJoinUsSection(normalizeArticleHtml(String(data.contentHtml || ""), { h1 }));

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

/**
 * Ek baar me model bahut lamba likh de (4500+ words) to deterministic compress
 * pass — SAME facts, tables, sections rakhte hue prose 1500-2500 words par
 * lata hai. (Max 2 attempts; phir se normalize hota hai.)
 */
function buildCompressPrompt(article) {
  return [
    "Neeche diya gaya job article unnecessarily long (4500+ words) ho gaya hai. Ise tight aur useful banao —",
    "lekin DETAILED hi rakho: 1500-2500 words ke beech lao, isse chhota mat karo.",
    "",
    "STRICT RULES:",
    "- Dates, amounts, eligibility, vacancies, age cut-off, links and official instructions ko exactly preserve karo.",
    "- Poora section structure (overview, dates, vacancy, eligibility, age, salary, fee, selection, apply steps, links, FAQs, conclusion) banae rakho; sirf repetition/duplicate lines hatao.",
    "- 8-12 unique FAQs rakho; sirf repetitive ya ungrounded questions hatao. Koi naya fact/link add mat karo.",
    '',
    'Return STRICT JSON: {"contentHtml": "shortened full HTML", "faqs": [{"question":"","answer":""}]}',
    "",
    "=== CURRENT ARTICLE !==",
    JSON.stringify({ contentHtml: article.contentHtml, faqs: article.faqs }).slice(0, 60000)
  ].join("\n");
}

async function generateJobArticle({ source, instructions, feedbackIssues, strategyGuidance }, deps = {}) {
  if (!source || !source.text) {
    const err = new Error("Fetched source is required for the Job Article Writer");
    err.code = "SOURCE_REQUIRED";
    throw err;
  }
  const gen = deps.generateJson || generateJson;
  const prompt = buildJobWriterPrompt({ source, instructions, feedbackIssues, strategyGuidance });
  const raw = await gen(prompt, { temperature: deps.temperature ?? 0.35 });
  let article = normalizeJobArticle(raw, { source });

  // Word limit overshoot → max 2 compress retries, har baar BEST chhota version rakhte hue.
  for (
    let attempt = 0;
    attempt < 2 && article.wordCount > WORD_COMPRESS_TRIGGER; // runaway-safety — upper hard limit admin rule se N/A
    attempt += 1
  ) {
    try {
      const compressed = await gen(buildCompressPrompt(article), { temperature: 0.2 });
      const merged = normalizeJobArticle(
        {
          ...article,
          contentHtml: compressed.contentHtml || article.contentHtml,
          faqs: compressed.faqs || article.faqs
        },
        { source }
      );
      if (merged.wordCount >= article.wordCount) break; // aur chhota nahi hua → stop
      article = merged;
    } catch (err) {
      console.warn("job writer: compress pass failed, keeping original:", err.message);
      break;
    }
  }
  return article;
}

module.exports = {
  buildJobWriterPrompt,
  normalizeJobArticle,
  generateJobArticle,
  JOB_FACT_KEYS
};
