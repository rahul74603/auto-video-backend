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
  WORD_TARGET_MIN_FAST_TRACK,
  WORD_AIM_FAST_TRACK,
  FAQ_AIM_FAST_TRACK,
  H2_AIM_FAST_TRACK,
  WORD_COMPRESS_TRIGGER,
  FAST_TRACK_CATEGORIES,
  isBlockedDomain
} = require("./constants");
const { normalizeArticleHtml, appendJoinUsSection, plainText, countWords } = require("./article_html_utils");
const { generateJson } = require("./model_client");
const { formatReviewFeedbackPrompt } = require("./fact_quality_reviewer");
const { buildGroundingFactSheet } = require("./article_repairer");

function text(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function buildFastTrackWriterPrompt({ source, instructions, feedbackIssues, strategyGuidance }) {
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

  // ⭐ STRICT ALLOWLIST — source me maujood numbers/dates hi likhne hain.
  const factSheet = buildGroundingFactSheet(source);

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
    "5. ⭐ ORIGINAL WRITING (Google duplicate content se bachna hai): source page ki lines",
    "   word-by-word copy KARNA MANA HAI — har baat APNE alag shabdon me likho.",
    "   Sirf facts/dates/names same rahenge, wording BILKUL alag.",
    "6. Never attribute authorship to a person; author is always",
    `   "${EDITORIAL_AUTHOR}".`,
    "",
    "================ ARTICLE REQUIREMENTS (STRICT — review inhi par FAIL karta hai) ================",
    `- Length: AIM ${WORD_AIM_FAST_TRACK} meaningful words; ABSOLUTE MINIMUM ${WORD_TARGET_MIN_FAST_TRACK} — isse kam hui to review TURANT FAIL kar dega.`,
    "  Patle result-source me bhi detail likho (imp points, process, next steps, dhyan rakhne wali baatein).",
    "  Upar ki koi hard limit NAHI. No filler/repetition.",
    `- Exactly ONE <h1>; KAM SE KAM ${H2_AIM_FAST_TRACK} <h2> sections likho (review 4 se kam par FAIL karta hai).`,
    "- ⭐ SECTION ORDER FIXED — isi order me, taaki reader ko turant samajh aaye:",
    "  1. Chhota intro paragraph (2-3 lines — kya update aayi hai, kis organization ki, kab)",
    "  2. <h2> अपडेट एक नज़र में (Overview table: Organization | Update Type | Date | Status | Direct Link)",
    "  3. <h2> महत्वपूर्ण तिथियाँ (table: Event | Date — sirf source wali)",
    "  4. <h2> Result/Admit Card/Answer Key कैसे चेक/डाउनलोड करें (numbered <ol> steps — step by step systematic)",
    "  5. <h2> क्या-क्या details मिलेंगी (roll number, marks, cut-off — jo source me ho)",
    "  6. <h2> आगे की प्रक्रिया (sirf agar source me ho, warna general guidance clearly marked)",
    "  7. <h2> Important Links (table — sirf OFFICIAL sarkari links)",
    "  8. <h2> अक्सर पूछे जाने वाले प्रश्न (FAQs)",
    "- Tables wrapped as: <div class=\"table-responsive\"><table class=\"ai-data-table\">...</table></div>",
    `- EXACTLY ${FAQ_AIM_FAST_TRACK} FAQs (review 4 se kam par FAIL karta hai). ⚠️ FAQ answers me koi BHI`,
    "  number/date/amount TABHI likho jab wo neeche VERIFIED FACT SHEET me ho; warna bina number ke",
    "  general grounded answer do (sabse common FAIL reason yahi hai).",
    "- ⭐ LINK RULES: body me SIRF official sarkari links. Kisi third-party blog/aggregator",
    "  (freejobalert, sarkariresult, indgovtjobs, jagranjosh, adda247, testbook...) ka link KABHI nahi.",
    "  Social media / Telegram / WhatsApp links MAT lagao — wo system end me apne aap jodta hai.",
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
    '  FACTS FORMAT RULE: updateDate me SIRF asli date likho — "31 July 2026" ya "2026-07-31" jaisi.',
    '  Koi extra shabd NAHI. Source me na mile to "" khaali chhodo (junk mat bharna).',
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
    factSheet.promptBlock,
    "",
    "================ INTERNAL QUALITY STRATEGY (never overrides fact rules) ================",
    text(strategyGuidance, 700) || "Balanced grounded writing.",
    "",
    "================ ADMIN INSTRUCTIONS (optional) ================",
    `<admin_instructions>${text(instructions, 1500) || "none"}</admin_instructions>`,
    formatReviewFeedbackPrompt(feedbackIssues), // regenerate/self-heal loop: pichli failings writer ko batana ("" ho to harmless)
    "================ FINAL SELF-CHECK (answer se pehle khud verify karo — warna FAIL) ================",
    `1) Exactly ONE <h1>, kam se kam ${H2_AIM_FAST_TRACK} <h2>, kam se kam ${WORD_TARGET_MIN_FAST_TRACK} words (aim ${WORD_AIM_FAST_TRACK}).`,
    "2) Har number/date/amount jo likha hai wo upar VERIFIED FACT SHEET me maujood hai.",
    `3) Exactly ${FAQ_AIM_FAST_TRACK} FAQs, sab source-grounded, koi invented number nahi.`,
    "4) Output SIRF ek valid JSON object — koi markdown fence/explanation nahi."
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

/** Word-limit overshoot par deterministic compress retry (job writer jaisa hi). */
function buildCompressPrompt(article) {
  return [
    "Neeche diya gaya fast-track article bahut zyada lamba ho gaya hai (runaway output). Ise SHORT karo —",
    `target ~1800 words (minimum ${WORD_TARGET_MIN_FAST_TRACK} words rehna chahiye).`,
    "",
    "STRICT RULES:",
    "- SABHI facts, dates, tables, direct/official links BILKUL same rakho.",
    "- Section order aur headings (ek hi h1, sab h2) same rakho — sirf paragraphs concise karo.",
    "- FAQs 4-6 rakho. Koi naya fact/link add mat karo, koi fact delete mat karo.",
    '',
    'Return STRICT JSON: {"contentHtml": "shortened full HTML", "faqs": [{"question":"","answer":""}]}',
    "",
    "=== CURRENT ARTICLE !==",
    JSON.stringify({ contentHtml: article.contentHtml, faqs: article.faqs }).slice(0, 60000)
  ].join("\n");
}

async function generateFastTrackArticle({ source, instructions, feedbackIssues, strategyGuidance }, deps = {}) {
  if (!source || !source.text) {
    const err = new Error("Fetched source is required for the Fast Track Article Writer");
    err.code = "SOURCE_REQUIRED";
    throw err;
  }
  const gen = deps.generateJson || generateJson;
  const prompt = buildFastTrackWriterPrompt({ source, instructions, feedbackIssues, strategyGuidance });
  const raw = await gen(prompt, { temperature: deps.temperature ?? 0.35 });
  let article = normalizeFastTrackArticle(raw, { source });

  for (
    let attempt = 0;
    attempt < 2 && article.wordCount > WORD_COMPRESS_TRIGGER; // runaway-safety — upper hard limit admin rule se N/A
    attempt += 1
  ) {
    try {
      const compressed = await gen(buildCompressPrompt(article), { temperature: 0.2 });
      const merged = normalizeFastTrackArticle(
        {
          ...article,
          contentHtml: compressed.contentHtml || article.contentHtml,
          faqs: compressed.faqs || article.faqs
        },
        { source }
      );
      if (merged.wordCount >= article.wordCount) break;
      article = merged;
    } catch (err) {
      console.warn("fast-track writer: compress pass failed, keeping original:", err.message);
      break;
    }
  }
  return article;
}

module.exports = {
  buildFastTrackWriterPrompt,
  normalizeFastTrackArticle,
  generateFastTrackArticle
};
