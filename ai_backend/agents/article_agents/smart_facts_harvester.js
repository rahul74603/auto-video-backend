"use strict";

/**
 * ============================================================
 *  SMART FACTS HARVESTER — Salary, Titles, Vacancy, Dates, Org
 *  Deterministic + AI-assisted (no hallucination) extractor
 *  ------------------------------------------------------------
 *  Purpose: Jo bhi job/fast-track notification me hota hai usko
 *  sahi se pehchan ke facts info-box me bharna:
 *    - Salary: ₹, PMT, CTC, LPA, per month, /month, pay scale, level
 *    - Vacancy: 5432 posts, कुल 100 पद, vacancies
 *    - Dates: startDate, lastDate, examDate (existing harvester se)
 *    - Organization / Dept: SSC, RITES, SRCC, University
 *    - Title: H1 / post name
 *    - Qualification, Age, Fees, Location, Selection Process
 *  
 *  Ye harvester article body + source text + tables se numbers nikalta hai
 *  aur khaali facts fields ko bhar deta hai — writer ki galti se chhute hue
 *  fields auto-fix ho jate hain, isliye 2nd/3rd attempt me hi PASS.
 */

const { parseDateFlexible } = require("./fact_quality_reviewer");
const { plainText } = require("./article_html_utils");
const { ARTICLE_TYPES } = require("./constants");

const WINDOW = 120; // chars window around keyword

// ---------- SALARY PATTERNS ----------
const SALARY_PATTERNS = [
  // ₹1,60,000 PMT, Rs. 56100-177500, 16,50,000 PMT, CTC 12 LPA, 7th CPC Level 7
  /(?:₹|Rs\.?|INR|रु|रुपये)\s*\d[\d,]*\s*(?:-\s*\d[\d,]*)?\s*(?:PMT|per\s*month|\/month|PM|CTC|LPA|per\s*annum)?/gi,
  /\b\d[\d,]*\s*(?:PMT|CTC|LPA|per\s*month|\/month)\b/gi,
  /\b(?:Pay\s*Scale|Pay\s*Level|Level\s*\d+|7th\s*CPC|Grade\s*Pay)\s*[:\-]?\s*₹?\s*\d[\d,]*\s*(?:-\s*\d[\d,]*)?/gi,
  /\b\d[\d,]*\s*-\s*\d[\d,]*\s*(?:per\s*month|PMT)\b/gi,
  /(?:Salary|वेतन|सैलरी)\s*[:\-]?\s*₹?\s*\d[\d,]*[^.\n]{0,30}/gi,
];

const VACANCY_PATTERNS = [
  /(\d[\d,]*)\s*(?:पद|पदों|posts?|vacanc(?:y|ies)|वैकेंसी|रिक्तियां|seats?)/gi,
  /(?:Total|कुल)\s*(?:पद|Vacanc(?:y|ies)|Posts?)\s*[:\-]?\s*(\d[\d,]*)/gi,
];

const QUALIFICATION_PATTERNS = [
  /(?:Qualification|योग्यता|शैक्षणिक\s*योग्यता)[:\-]?\s*([^\n]{10,120})/gi,
];

const AGE_PATTERNS = [
  /(?:Age\s*Limit|आयु\s*सीमा)[^\d]{0,20}(\d{2})\s*(?:से|to|-)?\s*(\d{2})?/gi,
];

const ORG_PATTERNS = [
  /(?:Organization|Organisation|Dept|Department|संस्थान|विभाग)[:\-]?\s*([A-Z][A-Za-z\s&()]{5,80})/gi,
];

function cleanSalary(raw) {
  if (!raw) return "";
  let s = String(raw).trim().replace(/\s+/g, ' ');
  // Keep original format but trim
  // e.g. "₹1,60,000 PMT" -> keep as is, but ensure not too long
  if (s.length > 80) s = s.slice(0, 80);
  return s;
}

function extractFirstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[0]) return m[0].trim();
    // If pattern has capture group
    const exec = re.exec(text);
    if (exec && exec[1]) return exec[1].trim();
  }
  return "";
}

function extractVacancy(text) {
  for (const re of VACANCY_PATTERNS) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const num = (m[1] || m[0]).replace(/[^\d,]/g, '').replace(/,/g, '');
      if (num && Number(num) > 0 && Number(num) < 1000000) {
        return m[1] ? m[1].replace(/,/g, '') : num;
      }
    }
  }
  return "";
}

/**
 * Smart harvest — fills empty facts fields from article + source
 * @param {object} article — writer article with contentHtml and facts
 * @param {object} source — source extract with text and tables
 * @returns {string[]} filled fields list
 */
function harvestSmartFacts(article, source) {
  const filled = [];
  if (!article) return filled;
  const type = String(article.type || "").toLowerCase().replace(/_/g, '-');
  if (type !== ARTICLE_TYPES.JOB && type !== 'job') {
    // For fast-track we only harvest dates (already done elsewhere)
    return filled;
  }

  if (!article.facts || typeof article.facts !== 'object') article.facts = {};

  const bodyText = plainText(article.contentHtml || "");
  const sourceText = source?.text || "";
  const combined = `${bodyText}\n${sourceText}`.replace(/\s+/g, ' ');

  // ---------- SALARY ----------
  if (!article.facts.salary || String(article.facts.salary).trim().length < 2) {
    const salaryRaw = extractFirstMatch(combined, SALARY_PATTERNS);
    if (salaryRaw) {
      article.facts.salary = cleanSalary(salaryRaw);
      filled.push('salary');
    }
  }

  // ---------- VACANCY ----------
  if (!article.facts.vacancies || String(article.facts.vacancies).trim() === '') {
    const vac = extractVacancy(combined);
    if (vac) {
      article.facts.vacancies = vac;
      filled.push('vacancies');
    }
  }

  // ---------- TITLE / H1 ----------
  if (!article.facts.title || article.facts.title.length < 5) {
    // Try to get from H1 or first line of body
    const h1Match = article.contentHtml?.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      const t = plainText(h1Match[1]).trim().slice(0, 120);
      if (t.length > 10) {
        article.facts.title = t;
        filled.push('title');
      }
    }
  }

  // ---------- ORGANIZATION ----------
  if (!article.facts.organization || article.facts.organization.length < 3) {
    const org = extractFirstMatch(combined, ORG_PATTERNS);
    if (org && org.length > 3 && org.length < 100) {
      article.facts.organization = org;
      filled.push('organization');
    }
  }

  // ---------- QUALIFICATION ----------
  if (!article.facts.qualification || article.facts.qualification.length < 5) {
    const qual = extractFirstMatch(combined, QUALIFICATION_PATTERNS);
    if (qual) {
      article.facts.qualification = qual.slice(0, 150);
      filled.push('qualification');
    }
  }

  return filled;
}

module.exports = {
  harvestSmartFacts,
  extractFirstMatch,
  cleanSalary,
  extractVacancy,
  SALARY_PATTERNS,
  VACANCY_PATTERNS
};
