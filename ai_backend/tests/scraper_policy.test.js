"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DAY_MS,
  MAX_SCRAPER_AGE_DAYS,
  isWithinScraperWindow,
  compareNewestFirst,
  isInterviewNotice,
  isGovernmentJob,
  classifyJobSource,
  isHighQualityPrivateJob,
} = require("../scraper_policy");

const now = Date.parse("2026-10-18T12:00:00Z");

test("scrapers accept only publications from now through the prior 10 days", () => {
  assert.equal(MAX_SCRAPER_AGE_DAYS, 10);
  assert.equal(isWithinScraperWindow(now, { now }), true);
  assert.equal(isWithinScraperWindow(now - 10 * DAY_MS, { now }), true);
  assert.equal(isWithinScraperWindow(now - 10 * DAY_MS - 1, { now }), false);
  assert.equal(isWithinScraperWindow(now + 1, { now }), false);
  assert.equal(isWithinScraperWindow("unknown", { now }), false);
});

test("candidate ordering is newest first and undated entries come last", () => {
  const items = [
    { title: "old", publishedAt: now - 3 * DAY_MS },
    { title: "unknown", publishedAt: "" },
    { title: "today", publishedAt: now },
  ];
  assert.deepEqual(items.sort(compareNewestFirst).map((item) => item.title), ["today", "old", "unknown"]);
});

test("interview-ONLY notices blocked, genuine exam+interview jobs allowed", () => {
  // BLOCK — no-application walk-ins + interview event notices
  assert.equal(isInterviewNotice("Railway Interview Schedule 2026"), true);
  assert.equal(isInterviewNotice("NIT Raipur Project Assistant Walkin 2026"), true);
  assert.equal(isInterviewNotice("Private Walk-in Recruitment"), true);
  assert.equal(isInterviewNotice("IBPS walk_in drive"), true);
  assert.equal(isInterviewNotice("Direct Interviews for 50 Posts"), true);
  assert.equal(isInterviewNotice("UPSC Interview Call Letter 2026"), true);
  assert.equal(isInterviewNotice("BMC साक्षात्कार सूची 2026"), true);
  assert.equal(isInterviewNotice("Project Assistant", "https://example.in/walk-in-drive"), true);
  // ALLOW — genuine vacancies (selection me interview ho to bhi safe)
  assert.equal(isInterviewNotice("SSC CGL Result 2026"), false);
  assert.equal(isInterviewNotice("SSC CGL Online Form 2026"), false);
  assert.equal(isInterviewNotice("SSC MTS Recruitment 2026 through Exam and Interview"), false);
  assert.equal(isInterviewNotice("BMC साक्षात्कार भर्ती 2026"), false);
  assert.equal(isInterviewNotice("IBPS PO Recruitment", "https://example.in/ibps-po-interview"), false);
});

test("government jobs are prioritized and non-government jobs become fallback", () => {
  assert.equal(isGovernmentJob({ title: "SSC CGL Recruitment 2026" }), true);
  assert.equal(classifyJobSource({ title: "SSC CGL Recruitment 2026" }), "government");
  assert.equal(classifyJobSource({ organization: "Department of Railways" }), "government");
  assert.equal(classifyJobSource({ title: "Software Engineer Recruitment", organization: "Example Pvt Ltd" }), "private");
});

test("private fallback requires a strong score, complete facts, and an official link", () => {
  const job = {
    organization: "Example Pvt Ltd",
    qualification: "B.E. Computer Science",
    vacancies: "12",
    salary: "₹8 LPA",
    startDate: "18 October 2026",
    lastDate: "30 October 2026",
    officialSiteLink: "https://example.com/careers",
  };
  assert.equal(isHighQualityPrivateJob(job, 9), true);
  assert.equal(isHighQualityPrivateJob(job, 8), false);
  assert.equal(isHighQualityPrivateJob({ ...job, salary: "" }, 12), false);
  assert.equal(isHighQualityPrivateJob({ ...job, officialSiteLink: "" }, 12), false);
});
