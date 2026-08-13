"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { chunkText, generateFromSource, generateQuestions } = require("../vertex/vertex_questions");

test("chunkText: text ko clean chunks me todta hai", () => {
  const chunks = chunkText("a".repeat(4000), 1500);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 1500);
});

test("chunkText: khali / blank text → empty array", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("   \n "), []);
});

test("generateFromSource: sourceText missing → BAD_REQUEST", async () => {
  await assert.rejects(
    () => generateFromSource({ title: "X", sourceText: "" }),
    (err) => err.code === "BAD_REQUEST"
  );
});

test("generateFromSource: bahut chhota text → BAD_REQUEST", async () => {
  await assert.rejects(
    () => generateFromSource({ title: "X", sourceText: "hello" }),
    (err) => err.code === "BAD_REQUEST"
  );
});

test("generateQuestions: topic missing → BAD_REQUEST", async () => {
  await assert.rejects(
    () => generateQuestions({ topic: "" }),
    (err) => err.code === "BAD_REQUEST"
  );
});
