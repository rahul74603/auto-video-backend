"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { classifyUpdate } = require("../news_classifier");

test("result → HIGH", () => {
  assert.deepEqual(classifyUpdate("SSC GD Constable Final Result 2026 Declared"), { type: "Result", priority: "HIGH" });
});

test("admit card → HIGH", () => {
  assert.deepEqual(classifyUpdate("RRB NTPC Admit Card 2026 Released, Download Now"), { type: "Admit Card", priority: "HIGH" });
});

test("recruitment/vacancy → HIGH", () => {
  assert.deepEqual(classifyUpdate("UP Police Constable Bharti 2026 — 52000 Vacancy Notification"), { type: "Recruitment", priority: "HIGH" });
});

test("application deadline → HIGH", () => {
  assert.deepEqual(classifyUpdate("IBPS Clerk Online Application Last Date Extended"), { type: "Recruitment", priority: "HIGH" });
});

test("exam date → HIGH", () => {
  assert.deepEqual(classifyUpdate("CTET Exam Date 2026 Out, Check Schedule"), { type: "Exam Date", priority: "HIGH" });
});

test("answer key → MEDIUM", () => {
  assert.deepEqual(classifyUpdate("RRB ALP Answer Key 2026 Released"), { type: "Answer Key", priority: "MEDIUM" });
});

test("cut off → MEDIUM", () => {
  assert.deepEqual(classifyUpdate("SSC MTS Cut Off 2026 Zone-wise"), { type: "Cut Off", priority: "MEDIUM" });
});

test("syllabus → MEDIUM", () => {
  assert.deepEqual(classifyUpdate("Bihar Board Class 10 Syllabus 2027"), { type: "Syllabus", priority: "MEDIUM" });
});

test("counselling → Admission MEDIUM", () => {
  assert.deepEqual(classifyUpdate("NEET UG Counselling 2026 Round 2"), { type: "Admission", priority: "MEDIUM" });
});

test("scheme → LOW", () => {
  assert.deepEqual(classifyUpdate("PM Kisan Scheme 21st Installment"), { type: "Government Scheme", priority: "LOW" });
});

test("unknown → Other LOW", () => {
  assert.deepEqual(classifyUpdate("StudyGyaan helpline update"), { type: "Other", priority: "LOW" });
});

test("first-match wins (result beats answer key)", () => {
  assert.equal(classifyUpdate("SSC CGL Result & Answer Key").type, "Result");
});
