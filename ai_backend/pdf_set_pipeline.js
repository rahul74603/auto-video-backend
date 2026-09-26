"use strict";

/**
 * ==============================================
 *  PDF → SET PIPELINE (orchestration)
 * ==============================================
 * pdf_set_builder.js (pure) + Gemini (model_client) + pdf-parse ko
 * jodta hai. AI calls injectable hain (callJson) — tests mock karte hain.
 */

const {
  splitIntoChunks,
  buildExtractPrompt,
  buildRewritePrompt,
  normalizeExtracted,
  applyRewrite,
  EXTRACT_MAX_CHARS,
  REWRITE_BATCH_SIZE,
} = require("./pdf_set_builder");

// pdf-parse lazy-loaded (sirf PDF aane par chahiye) — source_fetcher pattern
let pdfParse;
function getPdfParse() {
  if (pdfParse === undefined) {
    try {
      pdfParse = require("pdf-parse");
    } catch (e) {
      pdfParse = null;
    }
  }
  return pdfParse;
}

/** PDF base64 → text. Scanned/image PDFs me text nahi hota — clear error. */
async function parsePdfBase64(pdfBase64) {
  const PdfParse = getPdfParse();
  if (!PdfParse) throw new Error("pdf-parse not installed on server");
  const buffer = Buffer.from(String(pdfBase64 || ""), "base64");
  if (!buffer.length) throw new Error("PDF file empty");
  const parsed = await PdfParse(buffer);
  const text = String(parsed && parsed.text ? parsed.text : "").trim();
  if (text.length < 50) {
    throw new Error(
      "Is PDF me extractable text nahi mila (scanned/image PDF lagti hai). Text wali PDF do, ya pehle OCR karke bhejo."
    );
  }
  return text;
}

// model_client lazy (module-scope heavy dep nahi — tests light rehte hain)
let cachedGenerateJson;
async function defaultCallJson(prompt) {
  if (!cachedGenerateJson) {
    const mod = require("./agents/article_agents/model_client");
    cachedGenerateJson = mod.generateJson;
  }
  const res = await cachedGenerateJson(prompt, {});
  if (!res || !res.ok) {
    throw new Error((res && res.error) || "Gemini call failed");
  }
  return res.data;
}

/** Stage 1+2: PDF text → chunks → Gemini extract → normalized questions. */
async function extractQuestionsFromPdf({ pdfBase64, exam, callJson } = {}) {
  const call = callJson || defaultCallJson;
  const text = await parsePdfBase64(pdfBase64);
  const chunks = splitIntoChunks(text, EXTRACT_MAX_CHARS).slice(0, 12); // hard cap (free-tier safety)
  const all = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const data = await call(buildExtractPrompt(chunks[i], exam, i + 1, chunks.length));
    const raw =
      data && Array.isArray(data.questions)
        ? data.questions
        : Array.isArray(data)
          ? data
          : [];
    all.push(...normalizeExtracted(raw));
  }
  if (!all.length) {
    throw new Error("PDF me koi valid MCQ nahi mila — kya ye questions ki PDF hai?");
  }
  return all;
}

/** Stage 3: rewrite with answer-drift guard. */
async function rewriteExtractedQuestions({ questions, exam, callJson } = {}) {
  const call = callJson || defaultCallJson;
  const rewritten = [];
  for (let start = 0; start < questions.length; start += REWRITE_BATCH_SIZE) {
    const batch = questions.slice(start, start + REWRITE_BATCH_SIZE);
    const data = await call(buildRewritePrompt(batch, exam));
    const list =
      data && Array.isArray(data.rewritten)
        ? data.rewritten
        : Array.isArray(data)
          ? data
          : [];
    rewritten.push(...list);
  }
  return applyRewrite(questions, rewritten);
}

module.exports = {
  parsePdfBase64,
  extractQuestionsFromPdf,
  rewriteExtractedQuestions,
  defaultCallJson,
};
