"use strict";

/**
 * ==============================================
 *  PDF → PREMIUM SET BUILDER
 * ==============================================
 * Source PDFs (Telegram/WA groups se mile PYQ/practice PDFs) se:
 *   1. pdf-parse se text nikaalo
 *   2. Gemini se structured questions extract karo
 *   3. Gemini se REWRITE karo (wording badlo, answer same rakho)
 *   4. Answer-drift guard: rewritten answer text original se match
 *      na ho → ORIGINAL question rakho + REVIEW flag
 *
 * Design rules:
 * - Ye file PURE logic hai — koi firebase/db import NAHI (testable).
 * - AI calls DI se aate hain (callJson), taaki tests mock kar sakein.
 * - Koi fact invent nahi: rewrite sirf wording badalta hai, answer
 *   concept wahi rehta hai jo source PDF me tha.
 */

const BRAND = {
  name: "StudyGyaan",
  website: "studygyaan.in",
  email: "studygyaan.in@gmail.com",
  watermark: "StudyGyaan",
};

const EXTRACT_MAX_CHARS = 12000; // per Gemini call (PDF text chunk)
const REWRITE_BATCH_SIZE = 10;   // questions per rewrite call
const REVIEW_CONFIDENCE = 0.7;   // iske neeche => REVIEW flag

/** Normalized question shape (pipeline ke har stage ka contract). */
// {
//   qText: "English line\nHindi line",
//   options: ["A text", "B text", "C text", "D text"],
//   correctOption: 0..3,
//   explanation: "2-3 line",
//   confidence: 0..1,
//   flag: "OK" | "REVIEW",
// }

function splitIntoChunks(text, maxChars = EXTRACT_MAX_CHARS) {
  const clean = String(text || "").replace(/\r/g, "").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const chunks = [];
  let rest = clean;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf("\n\n", maxChars);
    if (cut < maxChars * 0.5) cut = rest.lastIndexOf("\n", maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

function buildExtractPrompt(chunk, exam, part, total) {
  return [
    "You are the QUESTION EXTRACTION engine for StudyGyaan premium practice sets.",
    `Target exam: ${exam || "Government Job Exam"}.`,
    `Below is PART ${part}/${total} of a practice-PDF's raw text (layout may be noisy).`,
    "",
    "TASK: Extract EVERY real MCQ present in this text. For each question output:",
    '  "qText": question text (keep source language; if both English+Hindi exist, "English\\nHindi"),',
    '  "options": exactly 4 option strings (A,B,C,D order as in source),',
    '  "answerText": the CORRECT option\'s exact text as per the source (answer key/markings in source),',
    '  "explanation": source explanation if present, else "".',
    "",
    "STRICT RULES:",
    "- Only questions REALLY present in the text — nothing invented, no filler.",
    "- If the answer is NOT marked/findable in the text, use answerText: \"\" (empty).",
    "- Skip instructions/headers/ads — sirf questions.",
    "- Output STRICT JSON only:",
    '{"questions": [{"qText": "...", "options": ["...","...","...","..."], "answerText": "...", "explanation": "..."}]}',
    "",
    "=== PDF TEXT PART START ===",
    chunk,
    "=== PDF TEXT PART END ===",
  ].join("\n");
}

function buildRewritePrompt(batch, exam) {
  const items = batch.map((q, i) => ({
    i,
    qText: q.qText,
    correctAnswerText: String(q.options[q.correctOption] ?? ""),
    sourceExplanation: q.explanation || "",
  }));
  return [
    "You are the QUESTION REWRITE engine for StudyGyaan premium practice sets.",
    `Target exam: ${exam || "Government Job Exam"}.`,
    "Input: original exam questions (fact + correct answer). Output: FRESHLY WORDED versions.",
    "",
    "REWRITE RULES (STRICT):",
    "1. ⭐ ANSWER CONCEPT KABHI CHANGE NAHI — correctAnswerText jo fact/option hai,",
    "   rewritten options me wahi CONCEPT sahi rahna chahiye (wording badal sakti hai).",
    "2. Wording BILKUL naye shabdon me: stem reword, context swap (naam/jagah/saal jo fact nahi hai),",
    "   statement-based ya direct — variety rakho. Copy-paste wording MANA.",
    "3. Options: 4 fresh distractors + correct option (shuffled position).",
    "4. qText bilingual: pehli line English, phir \\n, phir Hindi translation.",
    "5. explanation: 2-3 line ka APNA explanation (yahi original value hai) — source ka copy nahi.",
    "6. Koi naya fact INVENT nahi. Agar rewrite sure nahi, confidence kam likho.",
    '7. confidence: 0 se 1 (answer correctness par aapka bharosa).',
    "",
    "Input questions:",
    JSON.stringify(items, null, 1),
    "",
    "Output STRICT JSON only (same order, same i):",
    '{"rewritten": [{"i": 0, "qText": "...", "options": ["...","...","...","..."], "correctAnswerText": "...", "explanation": "...", "confidence": 0.9}]}',
  ].join("\n");
}

function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract-stage output ko validate/coerce karta hai; invalid entries DROP. */
function normalizeExtracted(rawQuestions) {
  const list = Array.isArray(rawQuestions) ? rawQuestions : [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const qText = String(raw.qText || raw.question || "").trim();
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => String(o ?? "").trim()).filter(Boolean)
      : [];
    if (qText.length < 5 || options.length !== 4) continue;

    const key = normText(qText).slice(0, 80);
    if (!key || seen.has(key)) continue; // duplicate question drop
    seen.add(key);

    let correctOption = -1;
    const answerText = String(raw.answerText || "").trim();
    if (answerText) {
      const normAnswer = normText(answerText);
      correctOption = options.findIndex((o) => normText(o) === normAnswer);
      if (correctOption < 0) {
        correctOption = options.findIndex(
          (o) => normText(o).includes(normAnswer) || normAnswer.includes(normText(o))
        );
      }
      if (correctOption < 0) {
        // "A"/"B"/"1" jaisa index-style answer key
        const m = answerText.match(/^(?:opt(?:ion)?\s*)?([abcd1-4])\b/i);
        if (m) {
          const idx = "abcd1234".indexOf(m[1].toLowerCase()) % 4;
          correctOption = idx;
        }
      }
    }

    out.push({
      qText,
      options,
      correctOption,
      explanation: String(raw.explanation || "").trim(),
      confidence: 1, // source-grounded extraction
      flag: correctOption >= 0 ? "OK" : "REVIEW", // answer key missing => review
    });
  }
  return out;
}

/** Rewrite-stage results ko originals se merge + answer-drift guard. */
function applyRewrite(originals, rewritten) {
  const list = Array.isArray(rewritten) ? rewritten : [];
  return originals.map((orig, idx) => {
    const rw = list.find((r) => Number(r && r.i) === idx);
    if (!rw) return { ...orig, flag: "REVIEW" }; // rewrite missing => review

    const qText = String(rw.qText || "").trim();
    const options = Array.isArray(rw.options)
      ? rw.options.map((o) => String(o ?? "").trim()).filter(Boolean)
      : [];
    const confidence = Math.max(0, Math.min(1, Number(rw.confidence) || 0));

    // Hard validation — rewritten structure hi galat => original + REVIEW
    if (qText.length < 5 || options.length !== 4) {
      return { ...orig, flag: "REVIEW" };
    }

    // ⭐ ANSWER-DRIFT GUARD: rewritten correctAnswerText ko rewritten options
    // me dhoondo. Na mile => rewrite TRUST nahi karte — original question.
    const answerText = String(rw.correctAnswerText || "").trim();
    const normAnswer = normText(answerText);
    let correctOption = options.findIndex((o) => normText(o) === normAnswer);
    if (correctOption < 0 && normAnswer) {
      correctOption = options.findIndex(
        (o) => normText(o).includes(normAnswer) || normAnswer.includes(normText(o))
      );
    }
    if (correctOption < 0) {
      // Fallback: original answer-text se match (concept preserve check)
      const origAnswer = normText(String(orig.options[orig.correctOption] ?? ""));
      if (origAnswer) {
        correctOption = options.findIndex(
          (o) => normText(o) === origAnswer ||
            normText(o).includes(origAnswer) || origAnswer.includes(normText(o))
        );
      }
    }
    if (correctOption < 0) {
      return { ...orig, flag: "REVIEW" }; // drift detected => original safe hai
    }

    const lowConfidence = confidence < REVIEW_CONFIDENCE;
    return {
      qText,
      options,
      correctOption,
      explanation: String(rw.explanation || "").trim(),
      confidence,
      flag: lowConfidence ? "REVIEW" : "OK",
    };
  });
}

/** Firestore/publish ke liye final validation pass. */
function validateForPublish(questions) {
  const clean = (Array.isArray(questions) ? questions : []).filter(
    (q) =>
      q &&
      String(q.qText || "").trim().length >= 5 &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      Number.isInteger(q.correctOption) &&
      q.correctOption >= 0 &&
      q.correctOption < 4
  );
  return clean;
}

/** Branded practice-set HTML (premium content doc ke `content` field me jata hai). */
function renderSetHtml({ exam, subject, setNumber, questions, sourceNote }) {
  const title = `${subject || exam || "Practice"} — Practice Set ${setNumber}`;
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const body = questions
    .map((q, i) => {
      const opts = q.options
        .map((o, j) => `<li><b>${"ABCD"[j]}.</b> ${esc(o)}</li>`)
        .join("");
      const exp = q.explanation
        ? `<div class="exp"><b>Explanation:</b> ${esc(q.explanation)}</div>`
        : "";
      return `<div class="q"><p class="qt"><b>Q${i + 1}.</b> ${esc(q.qText).replace(/\n/g, "<br/>")}</p><ol class="opts" type="A">${opts}</ol>${exp}</div>`;
    })
    .join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(title)} | ${BRAND.name}</title><style>
body{font-family:Segoe UI,Arial,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#1e293b;line-height:1.55}
.brand{border-bottom:3px solid #1d4ed8;padding-bottom:10px;margin-bottom:18px}
.brand h1{font-size:22px;margin:0 0 4px}
.brand p{margin:0;color:#64748b;font-size:13px}
.q{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:14px 0;position:relative}
.qt{margin:0 0 8px;font-size:15px}
.opts{margin:6px 0 0;padding-left:22px}
.exp{margin-top:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;font-size:13px;color:#14532d}
.footer{margin-top:26px;border-top:2px solid #1d4ed8;padding-top:10px;text-align:center;color:#475569;font-size:12px}
.wm{position:fixed;bottom:8px;right:12px;color:#cbd5e1;font-weight:800;font-size:14px;pointer-events:none}
@media print{.wm{position:fixed}}
</style></head><body>
<div class="brand"><h1>📥 ${esc(title)}</h1><p>${esc(exam || "")} • ${BRAND.name} Premium Content${sourceNote ? ` • Source: ${esc(sourceNote)}` : ""}</p></div>
${body}
<div class="footer">© ${BRAND.name} — ${BRAND.website} • Premium practice set. Report errors: ${BRAND.email}</div>
<div class="wm">${BRAND.watermark}</div>
</body></html>`;
}

module.exports = {
  BRAND,
  EXTRACT_MAX_CHARS,
  REWRITE_BATCH_SIZE,
  REVIEW_CONFIDENCE,
  splitIntoChunks,
  buildExtractPrompt,
  buildRewritePrompt,
  normalizeExtracted,
  applyRewrite,
  validateForPublish,
  renderSetHtml,
};
