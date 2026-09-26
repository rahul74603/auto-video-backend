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
let pdfParseMod;
function getPdfParseModule() {
  if (pdfParseMod === undefined) {
    try {
      pdfParseMod = require("pdf-parse");
    } catch (e) {
      pdfParseMod = null;
    }
  }
  return pdfParseMod;
}

/** PDF base64 → text. Scanned/image PDFs me text nahi hota — clear error. */
async function parsePdfBase64(pdfBase64) {
  const mod = getPdfParseModule();
  if (!mod) throw new Error("pdf-parse not installed on server");
  const buffer = Buffer.from(String(pdfBase64 || ""), "base64");
  if (!buffer.length) throw new Error("PDF file empty");
  let text = "";
  if (typeof mod === "function") {
    // pdf-parse v1 API: module khud function hai — await mod(buffer)
    const parsed = await mod(buffer);
    text = String((parsed && parsed.text) || "").trim();
  } else if (mod.PDFParse) {
    // pdf-parse v2 API (installed 2.4.5): class hai — new PDFParse({data}) → getText()
    const parser = new mod.PDFParse({ data: buffer });
    try {
      const res = await parser.getText();
      text = String(
        (res && res.text) ||
          ((res && Array.isArray(res.pages) && res.pages.map((p) => p.text).join("\n")) || "")
      ).trim();
    } finally {
      if (typeof parser.destroy === "function") {
        await parser.destroy().catch(() => {});
      }
    }
  } else {
    throw new Error("pdf-parse unsupported version on server");
  }
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
  // ⚠️ generateJson model ka parsed JSON object DIRECT return karta hai
  // (jaise {questions:[...]}) — {ok,data} envelope NAHI hai. Failures pe ye
  // khud friendly errors throw karta hai (AI_RATE_LIMITED / GEMINI_CALL_FAILED).
  // Envelope check lagaya to successful call bhi "Gemini call failed" ban jati hai.
  return cachedGenerateJson(prompt, {});
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
