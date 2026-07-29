"use strict";

/**
 * ==========================================================
 *  FACTS DATE HARVESTER (deterministic jugaad — no LLM luck)
 * ==========================================================
 *  Writer kabhi-kabhi article body me dates likh deta hai par site ke
 *  info-box ke facts (startDate/lastDate/examDate) khaali chhod deta hai —
 *  jisse review "dates:box-missing" FAIL karta hai aur REGENERATE luck pe
 *  nirbhar hota hai.
 *
 *  Ye harvester review se PEHLE chalta hai: article ke plain text me
 *  keyword ke aas-paas (±90 chars window) parseable date dhoondh kar
 *  khaali facts fields bhar deta hai.
 *
 *  Safe rules:
 *   - Sirf KHAALI/unparseable field bharta hai — writer ki bhari date ko
 *     kabhi overwrite nahi karta.
 *   - Sirf tab bharta hai jab nikali date waqai parse ho (parseDateFlexible).
 *   - Job articles ke liye startDate/lastDate/examDate (Fast Track me site
 *     ka dates-box check nahi hai isliye wahan skip).
 */

const { parseDateFlexible } = require("./fact_quality_reviewer");
const { plainText } = require("./article_html_utils");
const { ARTICLE_TYPES } = require("./constants");

/** Date tokens: 28/07/2026 · 28-7-26 · 28.07.2026 · 28 July 2026 · 28 जुलाई 2026 */
const DATE_TOKEN_SEARCH =
  /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[A-Za-z\u0900-\u097F]{3,12}\s+\d{4}/;
const DATE_TOKEN_ALL =
  /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[A-Za-z\u0900-\u097F]{3,12}\s+\d{4}/g;

/** Keyword ke itne chars andar ki date hi usi se judi maani jayegi. */
const WINDOW = 90;

const FIELD_KEYWORDS = [
  {
    field: "lastDate",
    // English + Devanagari Hindi + romanized Hindi (writer kabhi-kabhi roman me bhi likhta hai)
    keyword: /(last\s*date|closing\s*date|अंतिम\s*(?:तिथि|दिनांक|तारीख|तारीख़)|आवेदन\s*की\s*अंतिम\s*(?:तिथि|दिनांक)|समापन\s*(?:तिथि|दिनांक)|antim\s*(?:tithi|tareekh|tarikh|dinank)|samapan\s*(?:tithi|tareekh)|last\s*to\s*apply|apply\s*(?:online\s*)?(?:by|before|upto|up\s*to|till|until))/gi
  },
  {
    field: "startDate",
    keyword: /(start(?:ing)?\s*date|opening\s*date|commencement\s*of|आवेदन\s*(?:शुरू|प्रारंभ|आरंभ)|शुरुआती\s*(?:तिथि|दिनांक)|प्रारंभ\s*(?:तिथि|दिनांक)|ऑनलाइन\s*आवेदन\s*(?:शुरू|प्रारंभ)|आवेदन\s*की\s*शुरुआत|aavedan\s*(?:shuru|prarambh|arambh)|shurua?ti\s*(?:tithi|tareekh))/gi
  },
  {
    field: "examDate",
    keyword: /(exam(?:ination)?\s*date|date\s*of\s*(?:exam|examination)|परीक्षा\s*की\s*(?:तिथि|दिनांक)|परीक्षा\s*(?:तिथि|दिनांक)|pariksha\s*(?:ki\s*)?(?:tithi|tareekh|dinank)|exam\s*(?:will\s*be|to\s*be)\s*(?:held|conducted)\s*on)/gi
  }
];

/** Window ke andar pehli parseable date (after) / aakhri parseable date (before). */
function pickDate(windowText, takeLast) {
  const tokens = String(windowText || "").match(DATE_TOKEN_ALL) || [];
  const list = takeLast ? [...tokens].reverse() : tokens;
  return list.find((t) => Boolean(parseDateFlexible(t))) || "";
}

/**
 * Ek keyword-set ke liye text me sab prakramo (matches) ko scan karo;
 * sabse pehla accha date candidate do (after-window pehle, phir before-window).
 */
function findDateNear(text, keywordRe) {
  for (const m of text.matchAll(keywordRe)) {
    const after = text.slice(m.index, m.index + WINDOW);
    const hit = pickDate(after, false);
    if (hit) return hit;
  }
  for (const m of text.matchAll(keywordRe)) {
    const before = text.slice(Math.max(0, m.index - WINDOW), m.index);
    const hit = pickDate(before, true);
    if (hit) return hit;
  }
  return "";
}

/**
 * Article (writer output / merged draft-article) ke facts me khaali date
 * fields ko article body se bharo. Mutates in place.
 * @returns {string[]} kin fields ko bhara gaya (debug/metrics ke liye)
 */
function harvestFactsDates(article) {
  const filled = [];
  if (!article) return filled;
  // Writer articles me type "JOB" (uppercase) aur ARTICLE_TYPES.JOB "job" (routing
  // ke liye lowercase) — dono maano, casing pe mat tik jao.
  const normalizedType = String(article.type || "").toLowerCase().replace(/_/g, "-");
  if (normalizedType !== ARTICLE_TYPES.JOB) return filled;
  if (!article.facts || typeof article.facts !== "object") article.facts = {};
  const text = plainText(article.contentHtml || "").replace(/\s+/g, " ").trim();
  if (text.length < 20) return filled;

  for (const { field, keyword } of FIELD_KEYWORDS) {
    const current = article.facts[field];
    if (parseDateFlexible(current)) continue; // writer ne sahi date di hai — chhuo mat
    // "soon"/"tentative" jaise junk strings ho to unhe acche date se badalna hi behtar hai
    const found = findDateNear(text, keyword);
    if (found) {
      article.facts[field] = found;
      filled.push(field);
    }
  }
  return filled;
}

module.exports = { harvestFactsDates, findDateNear, DATE_TOKEN_SEARCH };
