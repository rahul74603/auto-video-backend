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
  WORD_TARGET_MIN_JOB,
  WORD_AIM_JOB,
  FAQ_AIM_JOB,
  H2_AIM,
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
    "TASK: Write one complete, helpful, LONG-FORM job article in simple natural Hindi/Hinglish,",
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
    "================ ARTICLE REQUIREMENTS (STRICT — review inhi par FAIL karta hai) ================",
    `- Length: AIM ${WORD_AIM_JOB} meaningful words; ABSOLUTE MINIMUM ${WORD_TARGET_MIN_JOB} — ${WORD_TARGET_MIN_JOB} se kam hui to review TURANT FAIL kar dega.`,
    `  Safe rehne ke liye har <h2> section me 3-5 sentence ka solid grounded paragraph likho +`,
    `  tables ke around 1-2 context lines do. Upar ki koi hard limit NAHI. Filler repetition ya keyword stuffing bilkul nahi.`,
    `- Exactly ONE <h1>. KAM SE KAM ${H2_AIM} <h2> sections likho (review 4 se kam par FAIL karta hai).`,
    "- ⭐ SECTION ORDER FIXED hai — isi order me likho taaki reader ko dekhte hi sab samajh aaye:",
    "  1. Chhota intro paragraph (2-3 lines, apne shabdon me — post ka naam, organization, total posts, last date)",
    "  2. <h2> संक्षिप्त विवरण — एक नज़र में पूरी जानकारी (table: Post Name | Organization | Advt No |",
    "     Total Vacancies | Last Date | Application Mode | Official Website)",
    "  3. <h2> महत्वपूर्ण तिथियाँ (Important Dates — table: Event | Date)",
    "  4. <h2> आवेदन शुल्क (Application Fee — table: Category | Fee)",
    "  5. <h2> पद का विवरण / Vacancy Details (table: Post Name | No. of Posts | Pay Scale — jo source me ho)",
    "  6. <h2> आयु सीमा (Age Limit — sirf source wali)",
    "  7. <h2> शैक्षणिक योग्यता / पात्रता (Eligibility — sirf source wali)",
    "  8. <h2> वेतन / Salary",
    "  9. <h2> चयन प्रक्रिया (Selection Process — source ke steps)",
    "  10. <h2> आवेदन कैसे करें (numbered <ol> steps — step 1, 2, 3... systematic)",
    "  11. <h2> जरूरी दस्तावेज़ (Documents checklist)",
    "  12. <h2> Important Links (table: Link | URL — sirf OFFICIAL sarkari links)",
    "  13. <h2> अक्सर पूछे जाने वाले प्रश्न (FAQs)",
    "- Tables must be wrapped exactly like:",
    '  <div class="table-responsive"><table class="ai-data-table"><thead>...</thead><tbody>...</tbody></table></div>',
    `- EXACTLY ${FAQ_AIM_JOB} FAQs (<h3> question + <p> answer) — review 4 se kam par FAIL karta hai.`,
    "  ⚠️ FAQ answers me koi BHI number/date/amount TABHI likho jab wo neeche VERIFIED FACT SHEET me ho;",
    "  warna bina number ke general grounded answer do (sabse common FAIL reason yahi hai).",
    "- ⭐ LINK RULES: article body me SIRF official sarkari website ke links lagao (source links list me se).",
    "  Kisi bhi third-party job blog/aggregator (freejobalert, sarkariresult, indgovtjobs, jagranjosh,",
    "  adda247, testbook...) ya kisi aur website ka link KABHI mat lagao.",
    "  Social media / YouTube / Telegram / WhatsApp links MAT lagao — wo system apne aap end me jodta hai.",
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
    `1) Exactly ONE <h1>, kam se kam ${H2_AIM} <h2>, kam se kam ${WORD_TARGET_MIN_JOB} words (aim ${WORD_AIM_JOB}).`,
    "2) Har number/date/amount/percentage jo likha hai wo upar VERIFIED FACT SHEET me maujood hai.",
    "3) facts.startDate/lastDate/examDate me wahi EXACT dates hain jo article body me likhi hain (ya \"\").",
    `4) Exactly ${FAQ_AIM_JOB} FAQs, sab source-grounded, koi invented number nahi.`,
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
        addressLocality: (facts.location || "India").split(',')[0].trim().slice(0, 100) || "India",
        addressRegion: (facts.location || "India").split(',')[0].trim().slice(0, 100) || "India",
        postalCode: "110001",
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
    const salaryNumbers = String(facts.salary).match(/\d+/g);
    const salaryMin = salaryNumbers ? parseInt(salaryNumbers[0]) : undefined;
    const salaryMax = salaryNumbers && salaryNumbers.length > 1 ? parseInt(salaryNumbers[1]) : salaryMin;
    
    jobPosting.baseSalary = {
      "@type": "MonetaryAmount",
      currency: "INR",
      value: {
        "@type": "QuantitativeValue",
        ...(salaryMin ? { minValue: salaryMin } : {}),
        ...(salaryMax ? { maxValue: salaryMax } : {}),
        unitText: "MONTH",
        description: String(facts.salary).slice(0, 100)
      }
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
 * Ek baar me model lamba likh de to deterministic compress pass — SAME facts,
 * tables, sections rakhte hue prose ~2000 words tak chhota karwata hai.
 * (Max ek extra call; phir se normalize hota hai.)
 */
function buildCompressPrompt(article) {
  return [
    "Neeche diya gaya job article bahut zyada lamba ho gaya hai (runaway output). Ise SHORT karo —",
    `target ~2000 words (minimum ${WORD_TARGET_MIN_JOB} words rehna chahiye).`,
    "",
    "STRICT RULES:",
    "- SABHI facts, dates, numbers, tables, official links BILKUL same rakho (kuch remove/ghatao mat).",
    "- Section order aur headings (ek hi h1, sab h2) same rakho — sirf paragraphs concise karo.",
    "- FAQs 5-6 rakho, answers chhote kar sakte ho.",
    "- Koi naya fact/link add mat karo; koi bhi existing fact delete mat karo.",
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
