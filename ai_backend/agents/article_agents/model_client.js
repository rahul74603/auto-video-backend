"use strict";

/**
 * Tiny shared wrapper around Gemini for the article agents.
 * Writers receive an injectable `generateJson(prompt)` so the whole pipeline
 * stays unit-testable without hitting the network.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

let client;

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
      maxOutputTokens: Number(options.maxOutputTokens || process.env.AI_AGENT_MAX_OUTPUT_TOKENS || 16384),
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

/**
 * Default JSON generator with one strict retry: agar Gemini pehli baar me
 * non-JSON de (kabhi-kabhi hota hai), ek baar aur strict instruction ke saath
 * poochte hain. Doosri baar bhi fail ho to WRITER_BAD_JSON throw hota hai.
 */
async function generateJson(prompt, options = {}) {
  try {
    return await generateJsonOnce(prompt, options);
  } catch (firstError) {
    if (firstError.code !== "WRITER_BAD_JSON") throw firstError;
    const strictPrompt =
      `${prompt}\n\nSTRICT RETRY: pichhla jawab valid JSON nahi tha. ` +
      `Is baar SIRF ek valid JSON object return karo — koi markdown fences, ` +
      `explanation ya extra text bilkul nahi.`;
    return generateJsonOnce(strictPrompt, options);
  }
}

module.exports = { generateJson, parseJsonObject };
