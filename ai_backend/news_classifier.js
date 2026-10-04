"use strict";

/**
 * news_classifier.js — shared update taxonomy + priority (PURE)
 * =============================================================
 * PHASE-2 item 4: pehle har pipeline (auto_drafts, social, alerts) apni-apni
 * ad-hoc heuristics rakhta tha. Ab ek shared classifier:
 *   classifyUpdate(title) → { type, priority }
 * Priority semantics (master-plan):
 *   HIGH   — result / admit card / nayi recruitment / application deadline / exam date
 *   MEDIUM — answer key / cut-off / syllabus / correction / admission / scholarship
 *   LOW    — scheme / general education / other
 * Order matters — pehla match jeetta hai (titles me ek se zyada signal ho sakte hain).
 */

const RULES = [
  { type: "Result", priority: "HIGH", re: /\bresults?\b|parinaam|declared/i },
  { type: "Admit Card", priority: "HIGH", re: /admit\s*cards?|hall\s*tickets?|call\s*letters?/i },
  { type: "Recruitment", priority: "HIGH", re: /recruitments?|notifications?|vacanc(y|ies)|bharti|advertisement|apply\s+online|application\s+(form|start|begin|last|deadline)|online\s+applications?|post(s)?\s+released/i },
  { type: "Exam Date", priority: "HIGH", re: /exam\s*(date|schedule|calendar|city)|test\s*date|cbt\s*(date|schedule)/i },
  { type: "Answer Key", priority: "MEDIUM", re: /answer\s*keys?|answre\s*keys?/i },
  { type: "Cut Off", priority: "MEDIUM", re: /cut[\s-]?offs?/i },
  { type: "Correction Window", priority: "MEDIUM", re: /correction\s*(window|link)?|edit\s+window|window\s+to\s+edit/i },
  { type: "Syllabus", priority: "MEDIUM", re: /syllabus|paathyakram|exam\s*pattern/i },
  { type: "Admission", priority: "MEDIUM", re: /admissions?|counselling|counseling|merit\s*lists?|seat\s*(matrix|allotment)/i },
  { type: "Scholarship", priority: "MEDIUM", re: /scholarships?|vritti|stipend/i },
  { type: "Government Scheme", priority: "LOW", re: /scheme|yojana|pension|labh/i },
  { type: "Education", priority: "LOW", re: /board\s*exams?|school|university|college|semester|education/i },
];

/**
 * @param {string} title
 * @param {string} [url]  (future: domain-based tier signal; abhi sirf record ke liye)
 * @returns {{type: string, priority: "HIGH"|"MEDIUM"|"LOW"}}
 */
function classifyUpdate(title, url = "") {
  const t = String(title || "");
  for (const rule of RULES) {
    if (rule.re.test(t)) return { type: rule.type, priority: rule.priority };
  }
  void url;
  return { type: "Other", priority: "LOW" };
}

module.exports = { classifyUpdate, RULES };
