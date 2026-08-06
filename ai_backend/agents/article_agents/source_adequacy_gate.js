"use strict";

/**
 * ============================================================
 *  SOURCE ADEQUACY GATE — "kaam na ho to MANA kar do" guard
 * ============================================================
 *  Kabhi-kabhi source me article banane layak REAL content hota hi nahi
 *  (Cloudflare/security block-page, sirf shell text, ya "coming soon"
 *  placeholder). Pahle writer aise source se "संभावित परिणाम update..." jaisi
 *  SPECULATIVE nonsense article likh deta tha.
 *
 *  Ab writer se pehle ye gate chalta hai:
 *    1. Block-page/challenge-page signature mila            → REFUSE
 *    2. Patla text + notification-signals (declared info) na mile → REFUSE
 *  Refuse = article kabhi banegi hi nahi; admin ko actionable raasta milta
 *  hai (text paste / PDF upload / dusra DIRECT official link).
 */

/** Browser-security / anti-bot challenge pages (site content nahi, nabbe pinjare). */
const BLOCK_PAGE_RE =
  /(just a moment|checking your browser|checking if the site connection is secure|attention required|cloudflare ray id|ddos protection|403 forbidden|access denied|you have been blocked|security check|verify you are human|captcha|bot detection|please enable javascript and cookies to continue|blocked by)/i;

/** Real notification/result/bharti hone ke shabd (English + Hindi). */
const DECLARE_RE =
  /(\bresult\b|declared|घोषित|परिणाम|notification|advt\.?|advertisement|shortlist|merit\s*list|answer\s*key|cut[- ]?off|joining|appointment|recruitment|bharti|भर्ती|नियुक्ति|admit\s*card|call\s*letter|vacanc(?:y|ies)|पदों\s*की\s*संगख्या|आवेदन|teaching|professor|assistant\s*professor|srcc|college|university|faculty|posts)/i;

/** Date hone ka signal (dd/mm/yyyy + "28 July 2026" + "28-Jul-2026" dono likhawat). */
const DATE_TOKEN_RE =
  /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\s\/\-.][A-Za-z\u0900-\u097F]{3,12}[\s\/\-.]\d{4}/;

/** Grey-zone se neeche ka text + kamzor signals → article-worthy nahi. */
const THIN_TEXT_LIMIT = 800; // reduced from 1500 for PDFs like SRCC teaching posts

/** Notification hone ke signals (min 2 chahiye jab text patla ho). */
function countNotificationSignals({ text, tables }) {
  let signals = 0;
  const tableRows = (Array.isArray(tables) ? tables : []).reduce(
    (sum, t) => sum + (Array.isArray(t) ? t.length : 0),
    0
  );
  if (DATE_TOKEN_RE.test(text)) signals += 1;
  if (DECLARE_RE.test(text)) signals += 1;
  if (tableRows >= 2) signals += 1;
  return signals;
}

/**
 * Source ko article-worthy verify karo. Fail hone par code
 * SOURCE_NOT_ARTICLE_WORTHY ke saath throw karta hai (route 502 + raasta batata hai).
 * @param {{text?: string, tables?: Array, url?: string}} source
 */
function assertSourceArticleWorthy(source) {
  const text = String(source?.text || "").replace(/\s+/g, " ").trim();
  const url = String(source?.url || "").toLowerCase();
  const isPdf = url.endsWith('.pdf') || source?.via === 'pdf';

  const refuse = (reason) => {
    const uploadHint = isPdf
      ? `PDF Cloudflare se block ho sakta hai — direct link fail hua hai. 📄 UPLOAD BUTTON se PDF file khud upload karo, text browser me hi nikal jayega, ya Source Text box me paste karo.`
      : `Page/PDF khud kholkar uska ASLI text copy karke Source Text box me daalo (ya 📄 upload button se file do), ya koi AUR DIRECT official notification link try karo.`;
    const err = new Error(
      `${reason} — is liye AI ne uda ke 'संभावित/speculative' article banana MANA kar diya ✅. ` +
        `Ab ye karo: ${uploadHint}`
    );
    err.code = "SOURCE_NOT_ARTICLE_WORTHY";
    throw err;
  };

  // 1. Security/block page hi mila ho — content maana hi nahi ja sakta
  if (BLOCK_PAGE_RE.test(text.slice(0, 3000))) {
    refuse("Source to browser-SECURITY BLOCK page nikla (Cloudflare/anti-bot challenge, real content nahi)");
  }

  // 2. Patla text + notification-signals na ho — speculation ka darr
  const signals = countNotificationSignals({ text, tables: source?.tables });

  // PDF ke liye soft rule — 400+ chars + 1 signal bhi kaafi (SRCC jaise teaching posts)
  if (isPdf) {
    if (text.length < 400) {
      refuse(
        `PDF se sirf ${text.length} chars readable text mila — scanned ya block ho sakta hai (na dates/table)`
      );
    }
    if (signals < 1 && text.length < 1000) {
      refuse(
        `PDF me article layak signals nahi mile (na date, na vacancy keywords) — ${text.length} chars only`
      );
    }
    // PDF with decent length + 1 signal = allow
    return;
  }

  // Normal pages — stricter
  if (text.length < THIN_TEXT_LIMIT && signals < 2) {
    refuse(
      "Source me article banne layak REAL details hi nahi hain (na pakki notification/language, na dates/table — sirf shell text)"
    );
  }
}

module.exports = { assertSourceArticleWorthy, countNotificationSignals, BLOCK_PAGE_RE, DECLARE_RE };
