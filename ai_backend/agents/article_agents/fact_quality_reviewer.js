"use strict";

/**
 * =====================================================
 *  FACT & QUALITY REVIEWER AGENT (verification layer)
 * =====================================================
 * Fully deterministic reviewer. It receives the finished article AND the
 * original source extract, then independently verifies:
 *
 *   FACT CHECK    — every date / money amount / vacancy number / percentage
 *                   found in the article must exist in the source text or in
 *                   the structured source facts. Otherwise the article is
 *                   flagged for HALLUCINATION and publish is blocked.
 *   DUPLICATES    — compares slug/title/content snippet with already-known
 *                   records (jobs, fast_track, other drafts).
 *   QUALITY       — word count (1600-2500), exactly one H1, H2/H3 structure,
 *                   responsive tables, FAQs, SEO title/meta, author label,
 *                   keyword stuffing and blocked-domain links.
 *
 * Output: { verdict: 'pass'|'fail', score, issues[], warnings[], metrics }
 * Anything in `issues[]` blocks publishing.
 */

const {
  ARTICLE_TYPES,
  EDITORIAL_AUTHOR,
  WORD_TARGET_MIN,
  WORD_TARGET_MIN_FAST_TRACK,
  WORD_WARN_HIGH,
  OUR_SOCIAL_LINKS,
  isBlockedDomain
} = require("./constants");
const {
  plainText,
  countWords,
  countTags,
  listAnchorHrefs
} = require("./article_html_utils");

// ---------- text helpers ----------

const DEVANAGARI_DIGITS = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9" };

function normalizeDigits(text) {
  return String(text || "").replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] || d);
}

const HINDI_MONTHS = {
  "जनवरी": "january",
  "फ़रवरी": "february",
  "फरवरी": "february",
  "मार्च": "march",
  "अप्रैल": "april",
  "मई": "may",
  "जून": "june",
  "जुलाई": "july",
  "अगस्त": "august",
  "सितंबर": "september",
  "सितम्बर": "september",
  "अक्टूबर": "october",
  "अक्तूबर": "october",
  "नवंबर": "november",
  "दिसंबर": "december"
};

const STOPWORDS = new Set(
  (
    "the a an and or of to in on for with is are was were be been this that these those it its as at by from will can may " +
    "के की को में से पर है हैं हो होगा होगी और या को इस इसे भी तक द्वारा करें करे करना करती अगर होने हुए हुआ एक आप अपने सभी जो तो नहीं कि " +
    "लिए लिये अपना अपनी किया किए हुई गया गई तथा एवं साथ जाना दिया जैसे वाले वाला वाली पूरी पूरा बारे अन्य हर सब अब फिर वह यह उस उन"
  ).split(/\s+/)
);

function normalizeForCompare(text) {
  let out = normalizeDigits(text).toLowerCase();
  for (const [hi, en] of Object.entries(HINDI_MONTHS)) out = out.split(hi).join(en);
  return out
    .replace(/[₹]/g, " rs ")
    .replace(/[.,;/:'"()\-–—_\[\]{}|*%#&@!$~`^+=؟?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberSetOf(text) {
  const normalized = normalizeDigits(String(text || "")).replace(/(\d),(?=\d{3}\b)/g, "$1");
  const matches = normalized.match(/\d+/g) || [];
  const nums = new Set();
  for (const m of matches) {
    nums.add(m);
    const dezeroed = m.replace(/^0+(?=\d)/, "");
    if (dezeroed !== m) nums.add(dezeroed);
  }
  return nums;
}

function tokenize(text) {
  return normalizeForCompare(text)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && /[a-zऀ-ॿ0-9]/.test(t));
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// ---------- factual claim extraction ----------

const DATE_PATTERNS = [
  /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g,
  /\b\d{1,2}\s+(जनवरी|फ़रवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|सितम्बर|अक्टूबर|अक्तूबर|नवंबर|दिसंबर)\s*,?\s*\d{4}\b/gi,
  /\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s*,?\s*\d{4}\b/gi,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4}\b/gi
];

const MONEY_PATTERN = /(?:₹|rs\.?|रुपये|रु\.?|inr)\s*\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*(?:₹|रुपये|rs\.?)/gi;
const VACANCY_PATTERN = /\b\d[\d,]*\s*(?:पद|पदों|posts?|vacanc(?:y|ies)|वैकेंसी|वैकेन्सी|भर्तियों|भर्ती|seats?)/gi;
const PERCENT_PATTERN = /\b\d{1,3}(?:\.\d+)?\s*%/g;
const AGE_PATTERN = /\b(?:यह भी:|आयु(?:\s*सीमा)?|age(?:\s*limit)?)\D{0,20}?(\d{2})\s*(?:से|to|और|वर्ष|years?|yrs?)/gi;

/**
 * Extract hard factual claims (dates, amounts, vacancy counts, percentages).
 * Each claim is { kind, value, componentNumbers[] }.
 */
function extractClaims(text) {
  const source = normalizeDigits(String(text || ""));
  const claims = [];
  const seen = new Set();
  const push = (kind, rawValue) => {
    const value = rawValue.replace(/\s+/g, " ").trim();
    const normValue = normalizeForCompare(value);
    if (!normValue) return;
    const key = `${kind}:${normValue}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Component numbers come from the RAW value so thousands separators
    // ("5,432" → 5432) and date parts ("31/07/2026" → 31, 07, 2026) normalize
    // the same way on both the claim and the source side.
    const componentNumbers = [...numberSetOf(value)];
    claims.push({ kind, value, normValue, componentNumbers });
  };

  for (const pattern of DATE_PATTERNS) {
    for (const m of source.matchAll(new RegExp(pattern.source, pattern.flags))) push("date", m[0]);
  }
  for (const m of source.matchAll(MONEY_PATTERN)) push("money", m[0]);
  for (const m of source.matchAll(VACANCY_PATTERN)) {
    // "भर्ती/भर्तियों" alone after a number is still a vacancy-style claim
    push("vacancy", m[0]);
  }
  for (const m of source.matchAll(PERCENT_PATTERN)) push("percent", m[0]);
  return claims;
}

/**
 * A claim is grounded when either:
 *  - its normalized full text appears in the normalized source haystack, or
 *  - every component number of the claim appears in the source number set
 *    (covers formatting differences like 31/07/2026 vs 31 July 2026 when the
 *    article wrote the date with words).
 */
function isClaimGrounded(claim, haystackNorm, sourceNumbers) {
  if (!claim.componentNumbers.length) return true; // pure word claim, nothing to verify
  if (haystackNorm.includes(claim.normValue)) return true;
  return claim.componentNumbers.every((num) => sourceNumbers.has(num));
}

// ---------- individual checks ----------

function checkStructure({ type, article, source, issues, warnings, metrics }) {
  const html = article.contentHtml || "";
  metrics.wordCount = article.wordCount ?? countWords(html);
  metrics.h1Count = countTags(html, "h1");
  metrics.h2Count = countTags(html, "h2");
  metrics.h3Count = countTags(html, "h3");
  metrics.faqCount = Array.isArray(article.faqs) ? article.faqs.length : 0;

  const tables = countTags(html, "table");
  metrics.tableCount = tables;
  const responsiveWrapped =
    tables === 0 || /table-responsive/.test(html);

  // Word policy: sirf MINIMUM enforce hota hai (type ke hisaab se — JOB 1600,
  // FAST_TRACK 1200). Upar ki taraf hard limit nahi (admin rule): bahut lambi
  // ho to sirf warning, publish kabhi block nahi.
  // NOTE: yahan type ARTICLE ka type hai ("JOB"/"FAST_TRACK"), routing ka
  // lowercase nahi — casing pe mat tikna.
  const isFastTrack = String(type || "").toLowerCase().replace(/_/g, "-") === ARTICLE_TYPES.FAST_TRACK;
  const minWords = isFastTrack ? WORD_TARGET_MIN_FAST_TRACK : WORD_TARGET_MIN;
  if (metrics.wordCount < minWords) {
    issues.push(`word-count-low:${metrics.wordCount} (<${minWords})`);
  } else if (metrics.wordCount > WORD_WARN_HIGH) {
    warnings.push(`word-count-very-high:${metrics.wordCount} (sirf soft warning — publish block nahi)`);
  }

  if (metrics.h1Count === 0) issues.push("structure:missing-h1");
  if (metrics.h1Count > 1) issues.push(`structure:multiple-h1:${metrics.h1Count}`);
  if (metrics.h2Count < 4) issues.push(`structure:too-few-h2:${metrics.h2Count}`);
  if (!responsiveWrapped) issues.push("structure:table-not-responsive");
  if (metrics.faqCount < 4) issues.push(`structure:too-few-faqs:${metrics.faqCount}`);

  const seoTitle = String(article.seoTitle || "").trim();
  if (!seoTitle) issues.push("seo:missing-title");
  if (seoTitle.length > 75) issues.push(`seo:title-too-long:${seoTitle.length}`);

  const meta = String(article.metaDescription || "").trim();
  if (!meta) issues.push("seo:missing-meta-description");
  else if (meta.length < 110 || meta.length > 170) warnings.push(`seo:meta-length:${meta.length}`);

  if (article.authorName !== EDITORIAL_AUTHOR) {
    issues.push(`author:invalid:${article.authorName || "none"}`);
  }

  const anchors = listAnchorHrefs(html);
  const sourceNorm = String(source?.url || "").replace(/\/+$/, "").toLowerCase();
  const anchorsToCheck = anchors.filter(
    (href) => href.replace(/\/+$/, "").toLowerCase() !== sourceNorm // declared source page itself allowed
  );
  const blockedHit = anchorsToCheck.find((href) => isBlockedDomain(href));
  if (blockedHit) issues.push(`links:blocked-domain:${blockedHit}`);
  const badHref = anchors.find((href) => !/^https?:\/\//i.test(href) && !href.startsWith("#") && !href.startsWith("/"));
  if (badHref) warnings.push(`links:non-absolute:${badHref}`);
}

const REQUIRED_JOB_SECTIONS = [
  { re: /(तिथि|तारीख|dates?)/i, label: "important-dates" },
  { re: /(शुल्क|फीस|fee)/i, label: "application-fee" },
  { re: /(पात्रता|योग्यता|eligib|qualification)/i, label: "eligibility" },
  { re: /(वेतन|सैलरी|salary|pay)/i, label: "salary" },
  { re: /(चयन\s*प्रक्रिया|selection)/i, label: "selection-process" },
  { re: /(आवेदन\s*कैसे|आवेदन\s*करें|apply\s*(online|now)?|how\s*to\s*apply)/i, label: "apply-steps" },
  { re: /(दस्तावेज़|दस्तावेज|documents?)/i, label: "documents" }
];

const REQUIRED_FT_SECTIONS = [
  { re: /(कैसे\s*(चेक|देखें|डाउनलोड)|download|step)/i, label: "how-to-check" },
  { re: /(important\s*links?|महत्वपूर्ण\s*लिंक|official)/i, label: "important-links" }
];

function checkRequiredSections({ type, article, issues }) {
  const html = (article.contentHtml || "").toLowerCase();
  const required = type === "JOB" ? REQUIRED_JOB_SECTIONS : REQUIRED_FT_SECTIONS;
  for (const section of required) {
    if (!section.re.test(html)) issues.push(`section:missing:${section.label}`);
  }
}

/**
 * Grounding index of a source extract — normalized haystack + number set.
 * Reviewer (hallucination check) aur Article Self-Repair agent (facts/FAQ
 * cleaning + fact-sheet) dono isi se verify karte hain — ek hi ground truth.
 */
function buildGroundingIndex(source) {
  const haystack = [
    source?.text || "",
    (source?.tables || []).map((rows) => rows.map((r) => r.join(" ")).join(" ")).join(" "),
    (source?.links || []).map((l) => `${l.text} ${l.url}`).join(" ")
  ].join(" ");
  const haystackNorm = normalizeForCompare(haystack);
  return { haystack, haystackNorm, sourceNumbers: numberSetOf(haystackNorm) };
}

function checkFactsAgainstSource({ article, source, issues, warnings, metrics }) {
  const { haystackNorm, sourceNumbers } = buildGroundingIndex(source);

  const bodyText = plainText(article.contentHtml || "");
  const faqText = (article.faqs || []).map((f) => `${f.question} ${f.answer}`).join(" ");
  const factText = Object.values(article.facts || {}).join(" ");
  const articleText = `${bodyText} ${faqText} ${factText}`;

  const claims = extractClaims(articleText);
  metrics.claimCount = claims.length;
  const ungrounded = [];
  for (const claim of claims) {
    if (!isClaimGrounded(claim, haystackNorm, sourceNumbers)) ungrounded.push(claim);
  }
  for (const claim of ungrounded.slice(0, 10)) {
    issues.push(`hallucination:${claim.kind}:"${claim.value.slice(0, 60)}"`);
  }
  if (ungrounded.length > 10) warnings.push(`hallucination:more:${ungrounded.length - 10}`);

  // Links inside the article body must exist in the collected source links (or
  // be the source URL itself, or hamare apne official social channels) — this
  // blocks fabricated ya third-party promo URLs.
  const allowed = new Set(
    [
      source.url,
      ...(source.links || []).map((l) => l.url),
      ...(article.officialLinks || []).map((l) => l.url),
      ...OUR_SOCIAL_LINKS.map((l) => l.url)
    ]
      .filter(Boolean)
      .map((u) => u.replace(/\/+$/, "").toLowerCase())
  );
  for (const href of listAnchorHrefs(article.contentHtml || "")) {
    if (!/^https?:\/\//i.test(href)) continue;
    const norm = href.replace(/\/+$/, "").toLowerCase();
    if (!allowed.has(norm)) warnings.push(`links:unverified-url:${href.slice(0, 80)}`);
  }
}

function toComparableText(value) {
  const str = String(value || "");
  return str.includes("<") ? plainText(str) : str;
}

/**
 * SOURCE-ORIGINALITY CHECK (Google duplicate content se bachna).
 * Article ka prose source page ki exact copy nahi hona chahiye — facts/numbers
 * same rahenge (wohi grounding hai), par wording apni honi chahiye.
 * Tables (dates/fees/vacancy data) facts hote hain — unhe check se bahar rakhte hain.
 * 8-word shingles se overlap naapta hai; zyada overlap = source ka copy.
 */
function shingleSet(text, size = 8) {
  const tokens = normalizeForCompare(text).split(/\s+/).filter(Boolean);
  const shingles = new Set();
  for (let i = 0; i + size <= tokens.length; i += 1) {
    shingles.add(tokens.slice(i, i + size).join(" "));
  }
  return shingles;
}

/**
 * DATE PARSER (freshness check ke liye) — Hindi + English + numeric formats:
 *   "25 अगस्त 2026", "25 August 2026", "25/08/2026", "August 25, 2026"
 * Samajh na aaye to null (aise case me check skip — false alarm nahi).
 */
const EN_MONTH_INDEX = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

function parseDateFlexible(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const text = normalizeDigits(raw).toLowerCase();

  // dd/mm/yyyy | dd-mm-yyyy | dd.mm.yyyy
  let m = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 0 && mo <= 11) return new Date(Date.UTC(y, mo, d));
    return null;
  }

  // "25 अगस्त 2026" ya "25 august 2026"
  m = text.match(/\b(\d{1,2})\s+([^\s,]+)\s*,?\s*(\d{4})\b/);
  if (m) {
    let monthName = m[2];
    if (HINDI_MONTHS[monthName]) monthName = HINDI_MONTHS[monthName];
    const mo = EN_MONTH_INDEX[monthName];
    if (mo !== undefined) return new Date(Date.UTC(Number(m[3]), mo, Number(m[1])));
  }

  // "august 25, 2026"
  m = text.match(/\b([^\s,]+)\s+(\d{1,2}),?\s*(\d{4})\b/);
  if (m) {
    let monthName = m[1];
    if (HINDI_MONTHS[monthName]) monthName = HINDI_MONTHS[monthName];
    const mo = EN_MONTH_INDEX[monthName];
    if (mo !== undefined) return new Date(Date.UTC(Number(m[3]), mo, Number(m[2])));
  }
  return null;
}

/**
 * FRESHNESS CHECK (user requirement: "koi old data to nahi hai").
 * Article ki last date clearly beet chuki ho (30+ din purani) → issue (purani
 * notification publish nahi karni). 1-30 din purani → warning.
 */
function checkFreshness({ article, issues, warnings, metrics }) {
  const facts = article.facts || {};
  const lastDateStr = facts.lastDate || facts.updateDate || "";
  const parsed = parseDateFlexible(lastDateStr);
  metrics.freshnessChecked = Boolean(lastDateStr);
  if (!parsed) return; // parse nahi hua → chhodo, writer ka rule hi enough hai

  const today = new Date();
  const diffDays = Math.floor((parsed.getTime() - today.getTime()) / 86400000);
  metrics.lastDateInDays = diffDays;

  if (diffDays < -30) {
    issues.push(
      `freshness:expired:"${lastDateStr}" — last date ${Math.abs(diffDays)} din pehle nikal chuki hai; purani/expired notification publish mat karo`
    );
  } else if (diffDays < 0) {
    warnings.push(`freshness:recently-expired:"${lastDateStr}" — last date abhi-abhi nikli hai, confirm kar lo`);
  }
}

/**
 * NAME RECHECK (user requirement: "koi date ya NAME galat to nahi").
 * Organization ka naam source text me zaroor milna chahiye — warna writer ne
 * naam ghad diya (jaise galat vibhag likhna). Token overlap se naapta hai.
 */
function checkOrgName({ type, article, source, issues, warnings, metrics }) {
  const facts = article.facts || {};
  const org = String((type === "JOB" ? facts.organization : facts.org) || "").trim();
  if (!org) return;

  const orgTokens = tokenize(org);
  if (!orgTokens.length) return;
  const hayTokens = new Set(tokenize(source.text || ""));
  if (!hayTokens.size) return;
  const matched = orgTokens.filter((t) => hayTokens.has(t)).length;
  const overlap = matched / orgTokens.length;
  metrics.orgOverlap = Number(overlap.toFixed(3));

  if (overlap < 0.6) {
    issues.push(`hallucination:organization:"${org.slice(0, 60)}" — ye naam source me nahi mila; galat naam mat likho`);
  } else if (overlap < 0.85) {
    warnings.push(`organization:partial-match:"${org.slice(0, 50)}" — naam source se thoda alag hai, check karo`);
  }
}

/**
 * DATE COVERAGE CHECK (user complaint: "publish hua par dates nahi aayi").
 * Teen layers naapte hain:
 *  1. Article body me parseable date tokens hain?
 *  2. Facts (site ke upar wale info-box: startDate/lastDate) me date hai?
 *  3. Source (text + tables — official "box") me dates maujood thi?
 * Logic:
 *  - source me dates THI par article me nahi        → ISSUE  (pipeline ne miss ki → REGENERATE)
 *  - article me hain par JOB facts box khaali hai   → ISSUE  (published page ka box khaali dikhega)
 *  - source me bhi bilkul nahi                      → warning (notification me hi na bhi ho sakti hai)
 */
const DATE_CANDIDATE_RE = /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\s\/\-.][A-Za-z\u0900-\u097F]{3,12}[\s\/\-.]\d{4}/g;

function containsParseableDate(text) {
  const candidates = String(text || "").match(DATE_CANDIDATE_RE) || [];
  return candidates.some((c) => Boolean(parseDateFlexible(c)));
}

function checkDatesCoverage({ type, article, source, issues, warnings, metrics }) {
  const facts = article.facts || {};
  const articleHasDates = containsParseableDate(article.contentHtml || "");
  const sourceScan = [
    source.text || "",
    ...(source.tables || []).flat(3).map(String)
  ].join(" ");
  const sourceHasDates = containsParseableDate(sourceScan);
  const factsHaveDate = Boolean(
    parseDateFlexible(facts.lastDate) || parseDateFlexible(facts.startDate) || parseDateFlexible(facts.updateDate)
  );
  metrics.datesArticle = articleHasDates;
  metrics.datesSource = sourceHasDates;
  metrics.datesFacts = factsHaveDate;

  // ⭐ Backstop: source me koi GHOSHIT date hi nahi aur article 'संभावित/expected' type
  // speculation ho — aisi content banani hi nahi chahiye thi (adequacy gate ka net).
  const speculativeTitle = /(संभावित|संभावना|expected|anticipated|likely|tentative|aane\s*waala|aane\s*wala|kab\s*aa?yega)/i;
  const titleBlob = `${article.h1 || ""} ${article.seoTitle || ""} ${article.facts?.title || ""}`;
  if (!sourceHasDates && speculativeTitle.test(titleBlob)) {
    issues.push(
      "speculative:no-declared-date — source me koi ghoshit date hi nahi, phir bhi 'संभावित/expected' likh raha hai; aisi article publish mat karo — asli notification ka text/link do."
    );
    return;
  }

  if (sourceHasDates && !articleHasDates) {
    issues.push(
      "dates:missed — source notification me dates maujood hain par article me nahi aayi. 🔄 REGENERATE dabao; phir bhi na aaye to dates wala DIRECT notification page/PDF ka link do."
    );
    return;
  }
  if (type === "JOB" && articleHasDates && !factsHaveDate) {
    issues.push(
      "dates:box-missing — article me dates hain par site ke info-box (facts startDate/lastDate) me nahi aayi; published page ka box khaali dikhega. 🔄 REGENERATE dabao."
    );
    return;
  }
  if (!sourceHasDates && !articleHasDates) {
    warnings.push("dates:none — na source me na article me koi date mili; publish se pehle notification me khud confirm kar lena.");
  }
}

function checkSourceOriginality({ article, source, issues, warnings, metrics }) {

  const htmlNoTables = String(article.contentHtml || "").replace(/<table[\s\S]*?<\/table>/gi, " <table-removed> ");
  const faqText = (article.faqs || []).map((f) => `${f.question} ${f.answer}`).join(" ");
  const articleProse = `${plainText(htmlNoTables)} ${faqText}`;
  const articleShingles = shingleSet(articleProse);
  const sourceShingles = shingleSet(source.text || "");
  if (!articleShingles.size || !sourceShingles.size) return;

  let hits = 0;
  for (const shingle of articleShingles) if (sourceShingles.has(shingle)) hits += 1;
  const ratio = hits / articleShingles.size;
  metrics.sourceOverlap = Number(ratio.toFixed(3));

  if (ratio >= 0.3) {
    issues.push(
      `duplicate:source-copy:${ratio.toFixed(2)} — article source page se bahut match karta hai; Google duplicate content samjhega. Apne alag shabdon me likho (Regenerate karo).`
    );
  } else if (ratio >= 0.12) {
    warnings.push(`duplicate:source-similar:${ratio.toFixed(2)} — kuch lines source se milti hain, wording aur alag karo`);
  }
}

function checkDuplicates({ article, existing = {}, issues, warnings, metrics }) {
  const normTitle = normalizeForCompare(article.h1 || article.seoTitle || "");
  const slug = String(article.slug || "").toLowerCase();

  const dupSlug = (existing.slugs || []).find((s) => String(s).toLowerCase() === slug);
  if (dupSlug) issues.push(`duplicate:slug:${dupSlug}`);

  for (const title of existing.titles || []) {
    const sim = jaccard(tokenize(normTitle), tokenize(title));
    if (sim >= 0.9) {
      issues.push(`duplicate:title:"${String(title).slice(0, 70)}"`);
      break;
    } else if (sim >= 0.7) {
      warnings.push(`duplicate:title-similar:${sim.toFixed(2)}`);
    }
  }

  let maxSnippetSim = 0;
  const articleTokens = tokenize(toComparableText(article.contentHtml || "").slice(0, 2500));
  for (const snippet of existing.snippets || []) {
    const sim = jaccard(articleTokens, tokenize(toComparableText(snippet).slice(0, 2500)));
    maxSnippetSim = Math.max(maxSnippetSim, sim);
    if (sim >= 0.85) {
      issues.push(`duplicate:content-similarity:${sim.toFixed(2)}`);
      break;
    }
  }
  metrics.duplicateSimilarity = Number(maxSnippetSim.toFixed(3));
  if (maxSnippetSim >= 0.6 && maxSnippetSim < 0.85) {
    warnings.push(`duplicate:content-similar:${maxSnippetSim.toFixed(2)}`);
  }
}

function checkKeywordStuffing({ article, issues, warnings, metrics }) {
  const text = `${normalizeForCompare(article.seoTitle || "")} ${normalizeForCompare(article.metaDescription || "")}`;
  void text;
  const bodyTokens = normalizeForCompare(plainText(article.contentHtml || ""))
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));

  const freq = new Map();
  for (const t of bodyTokens) freq.set(t, (freq.get(t) || 0) + 1);

  let topWord = "";
  let topCount = 0;
  for (const [word, count] of freq) {
    if (count > topCount) {
      topWord = word;
      topCount = count;
    }
  }
  const density = bodyTokens.length ? topCount / bodyTokens.length : 0;
  metrics.keywordDensity = Number(density.toFixed(4));
  metrics.topKeyword = topWord;

  if (density >= 0.05 && topCount >= 30) {
    issues.push(`keyword-stuffing:"${topWord}" ${(density * 100).toFixed(1)}%`);
  } else if (density >= 0.035 && topCount >= 20) {
    warnings.push(`keyword-density-high:"${topWord}" ${(density * 100).toFixed(1)}%`);
  }

  // SEO title should not repeat the same token mechanically.
  const titleTokens = normalizeForCompare(article.seoTitle || "").split(/\s+/).filter(Boolean);
  const titleFreq = new Map();
  for (const t of titleTokens) titleFreq.set(t, (titleFreq.get(t) || 0) + 1);
  for (const [word, count] of titleFreq) {
    if (count >= 3) warnings.push(`keyword-title-repeat:"${word}"x${count}`);
  }
}

function checkOfficialLinks({ type, article, source, issues, warnings }) {
  const links = Array.isArray(article.officialLinks) ? article.officialLinks : [];
  if (!links.length) {
    issues.push("official-links:missing");
    return;
  }
  // Declared source page (fallback "Official Source") ko blocked-flag se bahar
  // rakho — wo hamara disclosed source hai, third-party promo nahi.
  const sourceNorm = String(source?.url || "").replace(/\/+$/, "").toLowerCase();
  for (const link of links) {
    if (!/^https?:\/\//i.test(link.url || "")) issues.push(`official-links:invalid:${link.url || "empty"}`);
    else if (link.url.replace(/\/+$/, "").toLowerCase() === sourceNorm) continue;
    else if (isBlockedDomain(link.url)) issues.push(`official-links:blocked:${link.url}`);
  }
  if (type === "JOB") {
    const hasApply = links.some((l) => /apply|आवेदन|source|notification/i.test(l.label || ""));
    if (!hasApply) warnings.push("official-links:no-apply-label");
  }
}

/**
 * Main entry. Pure function — safe for unit tests.
 */
function reviewArticle({ type, article, source, existing }) {
  const issues = [];
  const warnings = [];
  const metrics = {};

  if (!article || typeof article !== "object") {
    return { verdict: "fail", score: 0, issues: ["article:missing"], warnings, metrics };
  }
  if (!source || !source.text) {
    return { verdict: "fail", score: 0, issues: ["source:missing"], warnings, metrics };
  }

  const ctx = { type, article, source, existing, issues, warnings, metrics };
  checkStructure(ctx);
  checkRequiredSections(ctx);
  checkFactsAgainstSource(ctx);
  checkDuplicates(ctx);
  checkSourceOriginality(ctx);
  checkFreshness(ctx);
  checkOrgName(ctx);
  checkDatesCoverage(ctx);
  checkKeywordStuffing(ctx);
  checkOfficialLinks(ctx);

  const score = Math.max(0, 100 - issues.length * 12 - warnings.length * 3);
  return {
    verdict: issues.length ? "fail" : "pass",
    score,
    issues,
    warnings,
    metrics,
    reviewedAt: new Date().toISOString(),
    reviewer: "fact-quality-reviewer"
  };
}

module.exports = {
  reviewArticle,
  extractClaims,
  isClaimGrounded,
  normalizeForCompare,
  numberSetOf,
  tokenize,
  jaccard,
  shingleSet,
  parseDateFlexible,
  containsParseableDate,
  buildGroundingIndex,
  formatReviewFeedbackPrompt
};

/**
 * Issue-code → concrete fix guidance. Writer ko sirf "ye faila hai" nahi,
 * "aise theek karo" bhi batao — self-healing loop ki asli quality yahin se
 * aati hai (har retry me article pehle se behtar banti hai).
 */
const ISSUE_GUIDANCE = [
  {
    re: /^word-count-low:(\d+)/,
    fix: (m) =>
      `Article sirf ${m[1]} words ki bani — minimum se kam hai. Har <h2> section me 2-4 EXTRA ` +
      "grounded sentences jodo (source ki dates/fee/eligibility/selection/details apne shabdon me), " +
      "har table ke upar-neeche 1-2 context lines likho, FAQ answers thode vistrit karo. " +
      "KOI naya fact/number invent kiye bina length badhao — target ~2000 words."
  },
  {
    re: /^structure:too-few-h2/,
    fix: () => "Kam se kam 8 <h2> sections likho — di gayi fixed section-order list ke saare sections."
  },
  {
    re: /^structure:too-few-faqs/,
    fix: () => "EXACTLY 6 FAQs likho (h3 question + grounded answer) — 4 se kam FAIL hai."
  },
  {
    re: /^structure:missing-h1/,
    fix: () => "Article me exactly ONE <h1> hona chahiye (sabse pehle)."
  },
  {
    re: /^structure:table-not-responsive/,
    fix: () => 'Har <table> ko <div class="table-responsive"><table class="ai-data-table">...</table></div> me wrap karo.'
  },
  {
    re: /^section:missing:(.+)/,
    fix: (m) => `Ye section missing hai: "${m[1]}" — ise source ki jaankari se apne shabdon me likho.`
  },
  {
    re: /^hallucination:/,
    fix: () =>
      "Jo values 'hallucination' me dikhi hain wo SOURCE me nahi mili — unhe HATAO ya 'Official Notification में देखें' " +
      "likho. Number/date/amount/percentage TABHI likho jab wo VERIFIED FACT SHEET me maujood ho."
  },
  {
    re: /^dates:missed/,
    fix: () =>
      "Source me jo dates hain (apply start/last/exam) unhe article body + Important Dates table me EXACT waise hi likho."
  },
  {
    re: /^dates:box-missing/,
    fix: () =>
      "Body me likhi dates Wahi EXACT facts.startDate/lastDate/examDate me daalo — dono jagah same date honi chahiye."
  },
  {
    re: /^keyword-stuffing/,
    fix: () => "Ek hi shabd baar-baar repeat mat karo — har paragraph me variety rakho, natural Hindi likho."
  },
  {
    re: /^duplicate:source-copy/,
    fix: () =>
      "Source ki lines copy lag rahi hain — facts/dates same rakho par har line APNE alag shabdon + alag sentence structure me likho."
  },
  {
    re: /^duplicate:title/,
    fix: () => "Title is tarah likho ki pehle wali article se alag lage (same bharti, fresh wording — jaise last-date ya total posts pe focus)."
  },
  {
    re: /^seo:title-too-long/,
    fix: () => "seoTitle 70 characters ke andar rakho."
  },
  {
    re: /^official-links:missing/,
    fix: () => "officialLinks array me source ke official sarkari links (Apply/Notification/Website) zaroor do."
  },
  {
    re: /^organization:partial-match/,
    fix: () => "Organization ka naam EXACT wahi likho jo source me likha hai (apna mat banao)."
  }
];

/**
 * REGENERATE/self-heal feedback loop: pichli failed draft ke review issues ko
 * writer ke liye prompt text me badlo — ab har issue ke saath USKA concrete
 * fix-guidance bhi jata hai. (Pehle writer ko pichli failings pata hi nahi
 * chalti thi — isliye wahi ungrounded claims dobara likh deta tha.)
 * @param {string[]} issues review.issues (pichli draft se)
 * @returns {string} prompt block (blank string agar issues nahi)
 */
function formatReviewFeedbackPrompt(issues) {
  const list = (Array.isArray(issues) ? issues : [])
    .map((i) => String(i || "").trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!list.length) return "";

  const guidance = [];
  for (const issue of list) {
    const match = ISSUE_GUIDANCE.find((g) => g.re.test(issue));
    if (match) guidance.push(`- FIX: ${match.fix(issue.match(match.re))}`);
  }

  return [
    "",
    "================ ⭐ PICHLE REVIEW KI FEEDBACK — IS BAAR YE GALTIYAAN MAT KARO ================",
    "Pichli draft Fact & Quality review me FAIL hui thi. Usme ye issues mile the:",
    ...list.map((i) => `- ISSUE: ${i}`),
    ...(guidance.length ? ["", "IN ISSUES KO AISE THEEK KARO:", ...guidance] : []),
    "",
    "HARD RULE (ye baaki saari writing-instructions se upar hai): jis bhi claim/",
    "number/amount/date ko upar review ne source me 'nahi mila' bataya hai, use NAI",
    "article me bilkul MAT likho jab tak SOURCE EXTRACT me wo saaf na dikhe.",
    "Ungrounded figures (salary/vacancy/dates/fee) likhne ke bajaye SKIP karo —",
    "uda ke mat likho. Baaki saare output rules waise ke waise."
  ].join("\n");
}
