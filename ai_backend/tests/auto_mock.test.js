"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeMockQuestions,
  parseMockJson,
  buildMockPrompt,
  createSlug,
  MOCK_MODEL_CHAIN,
} = require("../auto_mock");

test("auto-mock: parseMockJson handles code fences and extracts embedded JSON", () => {
  const fenced = '```json\n{"seoTitle":"T","questions":[]}\n```';
  const parsed = parseMockJson(fenced);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.json.seoTitle, "T");

  const noisy = 'Here is your test:\n{"seoTitle":"X","questions":[{"qText":"Q"}]}\nDone.';
  const parsed2 = parseMockJson(noisy);
  assert.equal(parsed2.ok, true);
  assert.equal(parsed2.json.questions.length, 1);

  const broken = "not json at all {{{";
  const parsed3 = parseMockJson(broken);
  assert.equal(parsed3.ok, false);
  assert.ok(parsed3.preview.length > 0);
});

test("auto-mock: normalizeMockQuestions validates and normalizes correctOption", () => {
  const out = normalizeMockQuestions([
    { qText: "Q1", options: ["a", "b", "c", "d"], correctOption: 2, qLogic: "L" },
    // letter answer
    { qText: "Q2", options: ["a", "b", "c", "d"], correctOption: "B" },
    // "Option C" text answer
    { qText: "Q3", options: ["a", "b", "c", "d"], correctOption: "Option C" },
    // invalid: no text
    { qText: "", options: ["a", "b", "c", "d"], correctOption: 0 },
    // invalid: single option
    { qText: "Q5", options: ["only"], correctOption: 0 },
    // short options get padded, out-of-range index clamped
    { qText: "Q6", options: ["a", "b"], correctOption: 9 },
  ]);
  assert.equal(out.length, 4);
  assert.equal(out[0].correctOption, 2);
  assert.equal(out[0].qLogic, "L");
  assert.equal(out[1].correctOption, 1);
  assert.equal(out[2].correctOption, 2);
  assert.equal(out[3].options.length, 4);
  assert.equal(out[3].correctOption, 3);
});

test("auto-mock: buildMockPrompt embeds topic and question count", () => {
  const prompt = buildMockPrompt("SSC CGL", 10);
  assert.ok(prompt.includes("SSC CGL"));
  assert.ok(prompt.includes("exactly 10 high-quality"));
});

test("auto-mock: createSlug is URL-safe and model chain has a fallback", () => {
  assert.equal(createSlug("SSC CGL 2026: Top Questions!!"), "ssc-cgl-2026-top-questions");
  assert.ok(Array.isArray(MOCK_MODEL_CHAIN) && MOCK_MODEL_CHAIN.length >= 2);
});
