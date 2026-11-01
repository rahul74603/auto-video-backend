"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  missingResearchFields,
  isTrustedOfficialSource,
  groundingSources,
  parseFullYearDate,
  defaultGoogleSearch,
  researchMissingJobFields
} = require("../job_research_agent");

const NOW = Date.parse("2026-11-01T12:00:00+05:30");
const POSTED_RECENTLY = NOW - 2 * 86400000;
const JOB = {
  title: "SSC CGL Recruitment 2026",
  organization: "Staff Selection Commission",
  advtNo: "CGL/2026",
  startDate: "",
  lastDate: "",
  salary: "₹ 44,900",
  vacancies: "",
  qualification: ""
};
const SOURCE_URL = "https://ssc.gov.in/notice/ssc-cgl-2026";
const OFFICIAL_TEXT = [
  "Staff Selection Commission (SSC)",
  "SSC CGL Combined Graduate Level Recruitment 2026",
  "Advertisement No: CGL/2026",
  "Application Start Date: 01 November 2026",
  "Last Date to Apply: 15 November 2026",
  "Total Vacancies: 1,000",
  "Pay Scale: ₹ 25,500 - ₹ 81,100",
  "Essential Qualification: Bachelor's Degree from a recognized university."
].join("\n");

function groundedSearchResponse(url = SOURCE_URL) {
  return {
    candidates: [{
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: url, title: "Official SSC CGL Notification" } },
          { web: { uri: "https://www.freejobalert.com/ssc-cgl", title: "Aggregator copy" } }
        ]
      }
    }]
  };
}

function extractedFacts(overrides = {}) {
  const base = {
    sameRecruitment: true,
    recruitmentYear: 2026,
    advtNoMatch: true,
    titleEvidence: "SSC CGL Combined Graduate Level Recruitment 2026",
    organizationEvidence: "Staff Selection Commission (SSC)",
    fields: {
      startDate: { value: "01 November 2026", evidence: "Application Start Date: 01 November 2026" },
      lastDate: { value: "15 November 2026", evidence: "Last Date to Apply: 15 November 2026" },
      vacancies: { value: "1,000", evidence: "Total Vacancies: 1,000" },
      salary: { value: "₹ 25,500 - ₹ 81,100", evidence: "Pay Scale: ₹ 25,500 - ₹ 81,100" },
      qualification: {
        value: "Bachelor's Degree",
        evidence: "Essential Qualification: Bachelor's Degree from a recognized university."
      }
    }
  };
  return {
    ...base,
    ...overrides,
    fields: { ...base.fields, ...(overrides.fields || {}) }
  };
}

function depsFor(result = extractedFacts(), searchResponse = groundedSearchResponse()) {
  return {
    now: NOW,
    searchGoogle: async () => searchResponse,
    fetchSource: async () => ({ pageTitle: "SSC CGL 2026", text: OFFICIAL_TEXT, tables: [] }),
    extractFacts: async () => result
  };
}

test("missing fields are only the five requested, with prior-year dates considered invalid", () => {
  assert.deepEqual(missingResearchFields(JOB, NOW), ["startDate", "lastDate", "vacancies", "qualification"]);
  assert.deepEqual(
    missingResearchFields({ ...JOB, startDate: "01 November 2025", lastDate: "15 November 2026" }, NOW),
    ["startDate", "vacancies", "qualification"]
  );
});

test("research discovery explicitly uses Gemini Google Search grounding", async () => {
  let request;
  const ai = {
    models: {
      generateContent: async (params) => {
        request = params;
        return groundedSearchResponse();
      }
    }
  };
  await defaultGoogleSearch('"SSC CGL" official 2026', JOB, ["salary"], NOW, {
    ai,
    apiKey: "unit-test-key"
  });
  assert.deepEqual(request.config.tools, [{ googleSearch: {} }]);
  assert.match(request.contents, /Staff Selection Commission/);
  assert.match(request.contents, /2026/);
});

test("only HTTPS official sources can be used; aggregator citations are filtered", () => {
  assert.equal(isTrustedOfficialSource("https://ssc.gov.in/notice"), true);
  assert.equal(isTrustedOfficialSource("https://www.ibps.in/careers"), true);
  assert.equal(isTrustedOfficialSource("http://ssc.gov.in/notice"), false);
  assert.equal(isTrustedOfficialSource("https://freejobalert.com/ssc"), false);
  assert.equal(isTrustedOfficialSource("https://example.com/ssc"), false);
  assert.deepEqual(groundingSources(groundedSearchResponse()).map((source) => source.url), [SOURCE_URL]);
});

test("strict date parser accepts explicit current-year dates and rejects old/impossible dates", () => {
  assert.deepEqual(parseFullYearDate("15 November 2026"), { year: 2026, dayStart: Date.UTC(2026, 10, 15) });
  assert.deepEqual(parseFullYearDate("01/11/2026"), { year: 2026, dayStart: Date.UTC(2026, 10, 1) });
  assert.deepEqual(parseFullYearDate("2026-11-15"), { year: 2026, dayStart: Date.UTC(2026, 10, 15) });
  assert.equal(parseFullYearDate("15 November"), null);
  assert.equal(parseFullYearDate("31 February 2026"), null);
});

test("research fills only evidence-backed blanks and never replaces an existing value", async () => {
  const result = await researchMissingJobFields(JOB, { publishedAt: POSTED_RECENTLY }, depsFor());
  assert.deepEqual(result.filledFields, ["startDate", "lastDate", "vacancies", "qualification"]);
  assert.equal(result.jobData.salary, JOB.salary);
  assert.equal(result.jobData.startDate, "01 November 2026");
  assert.equal(result.jobData.lastDate, "15 November 2026");
  assert.equal(result.jobData.vacancies, "1,000");
  assert.equal(result.jobData.qualification, "Bachelor's Degree");
  assert.deepEqual(result.sourceUrls, [SOURCE_URL]);
});

test("stale source items are not researched and produce no fabricated values", async () => {
  let searches = 0;
  const result = await researchMissingJobFields(JOB, {
    publishedAt: POSTED_RECENTLY - 11 * 86400000
  }, {
    ...depsFor(),
    searchGoogle: async () => { searches++; return groundedSearchResponse(); }
  });
  assert.equal(searches, 0);
  assert.deepEqual(result.filledFields, []);
  assert.deepEqual(result.jobData, JOB);
});

test("older-cycle values and unsupported evidence remain blank", async () => {
  const oldCycle = extractedFacts({
    fields: {
      lastDate: { value: "15 November 2025", evidence: "Last Date to Apply: 15 November 2025" },
      qualification: { value: "Master's Degree", evidence: "Essential Qualification: Bachelor's Degree from a recognized university." }
    }
  });
  const result = await researchMissingJobFields(JOB, { publishedAt: POSTED_RECENTLY }, depsFor(oldCycle));
  assert.equal(result.jobData.lastDate, "");
  assert.equal(result.jobData.qualification, "");
  assert.deepEqual(result.filledFields, ["startDate", "vacancies"]);
});

test("a different recruitment cycle or an ungrounded source never fills fields", async () => {
  const wrongCycle = extractedFacts({ recruitmentYear: 2025 });
  const mismatched = await researchMissingJobFields(JOB, { publishedAt: POSTED_RECENTLY }, depsFor(wrongCycle));
  assert.deepEqual(mismatched.filledFields, []);

  const aggregatorOnly = await researchMissingJobFields(
    JOB,
    { publishedAt: POSTED_RECENTLY },
    depsFor(extractedFacts(), groundedSearchResponse("https://freejobalert.com/ssc-cgl"))
  );
  assert.deepEqual(aggregatorOnly.filledFields, []);
  assert.equal(aggregatorOnly.jobData.vacancies, "");
});
