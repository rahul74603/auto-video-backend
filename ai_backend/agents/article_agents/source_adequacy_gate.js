"use strict";

/**
 * Source adequacy gate: refuse challenge/shell pages before an LLM can turn
 * them into a speculative article. Genuine PDFs get a format-aware rule, but
 * still need concrete notification evidence; simply lowering the global text
 * threshold (as an older branch did) would let thin junk pages through.
 */

const BLOCK_PAGE_RE =
  /(just a moment|checking your browser|checking if the site connection is secure|attention required|cloudflare ray id|ddos protection|403 forbidden|access denied|you have been blocked|security check|verify you are human|captcha|bot detection|please enable javascript and cookies to continue|blocked by)/i;

const DECLARE_RE =
  /(\bresult\b|declared|घोषित|परिणाम|notification|advt\.?|advertisement|shortlist|merit\s*list|answer\s*key|cut[- ]?off|joining|appointment|recruitment|bharti|भर्ती|नियुक्ति|admit\s*card|call\s*letter|vacanc(?:y|ies)|आवेदन|teaching|assistant\s*professor|associate\s*professor|faculty|college|university)/i;

const DATE_TOKEN_RE =
  /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\s\/\-.][A-Za-z\u0900-\u097F]{3,12}[\s\/\-.]\d{4}/;

/** Concrete detail labels—not merely a generic word such as "posts". */
const DETAIL_RE =
  /(?:advt\.?|advertisement)\s*(?:no\.?|number)?\s*[:\-]?\s*[a-z0-9/.-]+|(?:total\s*)?(?:vacanc(?:y|ies)|posts?|पदों?)\s*[:\-]?\s*\d|(?:salary|pay\s*(?:scale|level)|वेतन|fee|शुल्क|age\s*limit|आयु\s*सीमा)\D{0,24}\d|(?:qualification|eligibility|योग्यता)\s*[:\-]/i;

const THIN_TEXT_LIMIT = 1500;
const PDF_MIN_TEXT = 400;

function tableRowCount(tables) {
  return (Array.isArray(tables) ? tables : []).reduce((sum, table) => {
    const rows = Array.isArray(table) ? table : table?.rows;
    return sum + (Array.isArray(rows) ? rows.length : 0);
  }, 0);
}

function isPdfSource(source) {
  if (String(source?.via || "").toLowerCase() === "pdf") return true;
  if (/application\/pdf/i.test(String(source?.contentType || ""))) return true;
  try {
    return new URL(String(source?.url || "")).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return /\.pdf(?:$|[?#])/i.test(String(source?.url || ""));
  }
}

function countNotificationSignals({ text, tables }) {
  let signals = 0;
  if (DATE_TOKEN_RE.test(text)) signals += 1;
  if (DECLARE_RE.test(text)) signals += 1;
  if (DETAIL_RE.test(text)) signals += 1;
  if (tableRowCount(tables) >= 2) signals += 1;
  return signals;
}

function assertSourceArticleWorthy(source) {
  const text = String(source?.text || "").replace(/\s+/g, " ").trim();
  const pdf = isPdfSource(source);
  const refuse = (reason) => {
    const hint = pdf
      ? "PDF ko browser me kholkar 📄 upload button se file do, ya uska asli text Source Text box me paste karo."
      : "Page/PDF ka asli text Source Text box me paste karo (ya 📄 upload button use karo), ya doosra DIRECT official link try karo.";
    const error = new Error(
      `${reason} — AI ne speculative article banana MANA kar diya ✅. Ab ye karo: ${hint}`
    );
    error.code = "SOURCE_NOT_ARTICLE_WORTHY";
    throw error;
  };

  if (BLOCK_PAGE_RE.test(text.slice(0, 4000))) {
    refuse("Source browser-security/Cloudflare block page nikla, real notification content nahi");
  }

  const signals = countNotificationSignals({ text, tables: source?.tables });

  if (pdf) {
    if (text.length < PDF_MIN_TEXT) {
      refuse(`PDF se sirf ${text.length} readable characters mile; file scanned ya blocked ho sakti hai`);
    }
    // A real short PDF must carry at least two independent signals such as a
    // date + recruitment term, or a concrete vacancy detail + table.
    if (signals < 2) {
      refuse("PDF me pakki notification details nahi mili (date/table/advt/vacancy evidence kam hai)");
    }
    return true;
  }

  if (text.length < THIN_TEXT_LIMIT && signals < 2) {
    refuse("Source me article banane layak real details nahi hain; ye sirf thin shell/placeholder text lagta hai");
  }
  return true;
}

module.exports = {
  assertSourceArticleWorthy,
  countNotificationSignals,
  isPdfSource,
  tableRowCount,
  BLOCK_PAGE_RE,
  DECLARE_RE,
  DETAIL_RE
};
