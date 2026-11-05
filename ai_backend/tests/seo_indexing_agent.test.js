"use strict";

/** SEO Indexing Agent tests — roz ka audit window: fresh jobs pehle,
 *  baaki sitemap ka rotation, aur fresh-flood par cap (2026-11-05 fix).
 *  2026-11-04 ki run top-200 jobs par atak gayi thi; ye tests usi
 *  regression ko pakadne ke liye hain. */

const test = require("node:test");
const assert = require("node:assert/strict");

const { selectDailyWindow, isEligibleIndexingApiUrl } = require("../agents/seo_indexing_agent");

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 4, 21, 26, 41); // ek asal run ka samay

function entry(pathname, lastmod) {
  return { url: `https://studygyaan.in${pathname}`, lastmod, sourceSitemap: "test" };
}

// run() jaisa sort: jobs pehle, phir lastmod descending.
function sortedLikeRun(entries) {
  return entries.slice().sort((a, b) => {
    const jobDelta = Number(isEligibleIndexingApiUrl(b.url)) - Number(isEligibleIndexingApiUrl(a.url));
    if (jobDelta) return jobDelta;
    return String(b.lastmod || "").localeCompare(String(a.lastmod || ""));
  });
}

function mixedEntries({ jobs = 100, others = 900, freshJobs = 0, now = T0 } = {}) {
  const list = [];
  for (let i = 0; i < jobs; i++) {
    const fresh = i < freshJobs;
    const t = fresh ? now - i * 60 * 1000 : now - (30 + i) * DAY;
    list.push(entry(`/job/job-${i}`, new Date(t).toISOString()));
  }
  const kinds = ["blog", "update", "test", "material", "web-stories"];
  for (let i = 0; i < others; i++) {
    list.push(entry(`/${kinds[i % kinds.length]}/page-${i}`, new Date(now - (40 + i) * DAY).toISOString()));
  }
  return sortedLikeRun(list);
}

test("fresh jobs window me sabse pehle aate hain", () => {
  const entries = mixedEntries({ jobs: 100, others: 900, freshJobs: 3 });
  const { selected, diagnostics } = selectDailyWindow(entries, 200, T0);
  assert.equal(selected.length, 200);
  assert.equal(diagnostics.freshJobs, 3);
  assert.equal(diagnostics.freshIncluded, 3);
  assert.equal(diagnostics.freshCapped, false);
  for (const e of selected.slice(0, 3)) {
    assert.ok(isEligibleIndexingApiUrl(e.url), `${e.url} fresh job hona chahiye`);
  }
});

test("rotation: lagatar do din ki windows takreeban disjoint hoti hain", () => {
  const entries = mixedEntries({ jobs: 100, others: 900, freshJobs: 0 });
  const day1 = selectDailyWindow(entries, 100, T0).selected.map((e) => e.url);
  const day2 = selectDailyWindow(entries, 100, T0 + DAY).selected.map((e) => e.url);
  const overlap = day1.filter((u) => new Set(day2).has(u)).length;
  assert.ok(overlap <= 5, `do din ki windows me overlap sirf ${overlap} hona chahiye, mila ${overlap}`);
});

test("coverage: ghumti window kuch dino me poora sitemap cover karti hai", () => {
  const entries = mixedEntries({ jobs: 100, others: 900, freshJobs: 0 });
  const seen = new Set();
  for (let d = 0; d < 12; d++) {
    for (const e of selectDailyWindow(entries, 100, T0 + d * DAY).selected) seen.add(e.url);
  }
  assert.ok(seen.size >= 990, `12 din me >=990/1000 cover hona chahiye, mila ${seen.size}`);
});

test("fresh flood: 300 fresh jobs bhi poora window nahi kha sakte (cap 25%)", () => {
  const entries = mixedEntries({ jobs: 400, others: 600, freshJobs: 300 });
  const { selected, diagnostics } = selectDailyWindow(entries, 200, T0);
  assert.equal(selected.length, 200);
  assert.equal(diagnostics.freshJobs, 300);
  assert.equal(diagnostics.freshIncluded, 50, "fresh cap = 200 ka 25% = 50");
  assert.equal(diagnostics.freshCapped, true);
  assert.equal(diagnostics.rotatedFromRest, 150);
  // aur agle din window wahi nahi rehta — rotation flood me bhi chalta hai
  const next = selectDailyWindow(entries, 200, T0 + DAY).selected.map((e) => e.url);
  const overlap = selected.map((e) => e.url).filter((u) => new Set(next).has(u)).length;
  assert.ok(overlap < 200, `flood ke bawjud agle din window badalna chahiye, overlap=${overlap}`);
});

test("diagnostics: composition ka hisaab window se milta hai", () => {
  const entries = mixedEntries({ jobs: 100, others: 900, freshJobs: 4 });
  const { selected, diagnostics } = selectDailyWindow(entries, 200, T0);
  assert.equal(diagnostics.jobsInWindow + diagnostics.nonJobsInWindow, selected.length);
  assert.ok(diagnostics.rotationOffset >= 0 && diagnostics.rotationOffset < diagnostics.restSize);
  assert.equal(diagnostics.totalEntries, entries.length);
});
