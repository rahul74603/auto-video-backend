"use strict";

/**
 * Tiny shared wrapper around Gemini for the article agents.
 * Writers receive an injectable `generateJson(prompt)` so the whole pipeline
 * stays unit-testable without hitting the network.
 *
 * HARDENING (adv-fallback):
 *  - Transient Gemini errors (429 rate-limit / 503 overloaded / 5xx / network
 *    reset) automatic backoff ke saath retry hote hain — ek chhoti busy-window
 *    ki wajah se pura generate fail nahi hota.
 *  - Sab retries ke baad bhi rate-limit rahe to AI_RATE_LIMITED code milta hai
 *    (route 503 deta hai, frontend saaf Hinglish hint dikhata hai).
 *  - WRITER_BAD_JSON pe do strict retries.
 *  - maxOutputTokens default 32768 taaki lambe articles truncate na hon.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

let client;

const TRANSIENT_PATTERN =
  /(429|500|502|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|ECONNABORTED|overloaded|too many requests|rate.?limit|fetch failed|socket hang up)/i;
const RATE_LIMIT_PATTERN = /(429|RESOURCE_EXHAUSTED|rate.?limit|quota|too many requests)/i;

/** Kya ye Gemini error chhoti (retry-worthy) hai? */
function isTransientGeminiError(message) {
  return TRANSIENT_PATTERN.test(String(message || ""));
}

/** Kya ye rate-limit / quota wali chhoti hai? */
function isRateLimitError(message) {
  return RATE_LIMIT_PATTERN.test(String(message || ""));
}

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error("GEMINI_API_KEY is required to run AI article agents");
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }
  if (!client) client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client;
}

function parseJsonObject(text) {
  const clean = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Single Gemini call: asks for application/json and parses it.
 * Throws WRITER_BAD_JSON when the model output is not parseable.
 */
async function generateJsonOnce(prompt, options = {}) {
  const ai = getClient();
  const modelName = options.model || process.env.AI_AGENT_MODEL || "gemini-2.5-flash";
  const model = ai.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: Number(options.maxOutputTokens || process.env.AI_AGENT_MAX_OUTPUT_TOKENS || 32768),
      responseMimeType: "application/json"
    }
  });
  let response;
  try {
    response = await model.generateContent(prompt);
  } catch (err) {
    // Gemini quota / model / network errors ko saaf message do taaki admin ko
    // toast me samajh aaye kya toota.
    const msg = String(err?.message || err);
    const wrapped = new Error(`Gemini call failed — ${msg}`);
    wrapped.code = "GEMINI_CALL_FAILED";
    throw wrapped;
  }
  const text = response.response?.text?.();
  const parsed = parseJsonObject(text);
  if (!parsed) {
    const err = new Error("Writer returned an unparseable JSON response");
    err.code = "WRITER_BAD_JSON";
    throw err;
  }
  return parsed;
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Default JSON generator with smart retries:
 *  1. WRITER_BAD_JSON → do strict retries (sirf valid JSON maangta hua prompt).
 *  2. Transient errors (rate-limit/overloaded/5xx/network) → backoff
 *     (2.5s → 5s) ke saath max 3 koshishen.
 *  3. Sab koshish fail → AI_RATE_LIMITED / GEMINI_CALL_FAILED friendly error.
 *
 * deps (tests ke liye injectable): callOnce, sleep, maxAttempts.
 */
async function generateJson(prompt, options = {}, deps = {}) {
  const callOnce = deps.callOnce || generateJsonOnce;
  const sleep = deps.sleep || realSleep;
  const maxAttempts = Math.max(1, Number(deps.maxAttempts || 3));
  const strictPrompt =
    `${prompt}\n\nSTRICT RETRY: pichhla jawab valid JSON nahi tha. ` +
    `Is baar SIRF ek valid JSON object return karo — koi markdown fences, ` +
    `explanation ya extra text bilkul nahi.`;

  let currentPrompt = prompt;
  let strictRetries = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await callOnce(currentPrompt, options);
    } catch (err) {
      const msg = String(err?.message || err);

      // Non-JSON → do strict retries (immediate, bina sleep ke) — truncation ya
      // stray-text ki wajah se valid JSON ek- do baar me hi nahi banta tha.
      if (err.code === "WRITER_BAD_JSON" && strictRetries < 2) {
        strictRetries += 1;
        currentPrompt = strictPrompt;
        continue;
      }

      // Transient chhoti → backoff ke saath retry
      if (isTransientGeminiError(msg)) {
        if (attempt < maxAttempts - 1) {
          const waitMs = 2500 * (attempt + 1);
          console.warn(
            `Gemini transient error (koshish ${attempt + 1}/${maxAttempts}) — ${waitMs}ms baad retry:`,
            msg.slice(0, 140)
          );
          await sleep(waitMs);
          continue;
        }
        // Aakhri koshish bhi transient → friendly, actionable error
        const rateLimited = isRateLimitError(msg);
        const friendly = new Error(
          rateLimited
            ? "Gemini AI server abhi zyada busy hai (rate-limit). 1-2 minute ruk kar phir GENERATE dabao — kuch toota nahi hai."
            : "Gemini AI se abhi jawab nahi aa pa raha (server/network busy). Thodi der baad dobara GENERATE try karo."
        );
        friendly.code = rateLimited ? "AI_RATE_LIMITED" : "GEMINI_CALL_FAILED";
        friendly.originalMessage = msg.slice(0, 200);
        throw friendly;
      }

      throw err; // AI_NOT_CONFIGURED / final WRITER_BAD_JSON / any non-transient error
    }
  }

  // Loop se bina return ke bahar (sirf defensive; normally yahan nahi pahunchte)
  const err = new Error("Writer returned an unparseable JSON response");
  err.code = "WRITER_BAD_JSON";
  throw err;
}

module.exports = { generateJson, parseJsonObject, isTransientGeminiError, isRateLimitError };
