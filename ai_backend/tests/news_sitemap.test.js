"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildNewsEntries, renderNewsSitemapXml } = require("../news_sitemap");

const NOW = new Date("2026-10-04T10:00:00Z");
const fresh = "2026-10-04T06:00:00Z";
const yesterday = "2026-10-03T06:00:00Z";
const old = "2026-09-20T06:00:00Z";

test("fresh published job included with /job/ path", () => {
  const entries = buildNewsEntries({
    jobs: [{ id: "j1", slug: "ssc-gd-2026", title: "SSC GD Constable Result Declared", status: "published", createdAt: new Date(fresh) }],
    now: NOW,
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, "/job/ssc-gd-2026");
  assert.equal(entries[0].category, "Government Jobs");
});

test("fast_track update included with /update/ path", () => {
  const entries = buildNewsEntries({
    updates: [{ id: "u1", title: "RRB NTPC Exam Date Out", createdAt: new Date(yesterday) }],
    now: NOW,
  });
  assert.equal(entries[0].path, "/update/u1");
});

test("draft / noIndex / deleted excluded", () => {
  const entries = buildNewsEntries({
    blogs: [
      { id: "a", title: "Draft post example here", status: "draft", createdAt: new Date(fresh) },
      { id: "b", title: "Hidden post example here", noIndex: true, createdAt: new Date(fresh) },
      { id: "c", title: "Deleted post example here", deleted: true, createdAt: new Date(fresh) },
      { id: "d", title: "Live post example here", status: "published", createdAt: new Date(fresh) },
    ],
    now: NOW,
  });
  assert.deepEqual(entries.map((e) => e.path), ["/blog/d"]);
});

test("older than maxAgeDays excluded", () => {
  const entries = buildNewsEntries({
    jobs: [{ id: "old", title: "Old notification example", createdAt: new Date(old) }],
    now: NOW,
    maxAgeDays: 2,
  });
  assert.equal(entries.length, 0);
});

test("newest-first sorting + limit", () => {
  const entries = buildNewsEntries({
    blogs: [
      { id: "b1", title: "First blog title here", createdAt: new Date(yesterday) },
      { id: "b2", title: "Second blog title here", createdAt: new Date(fresh) },
    ],
    now: NOW,
    limit: 1,
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, "/blog/b2");
});

test("XML render: namespaces, escaping, loc", () => {
  const entries = buildNewsEntries({
    jobs: [{ id: "x", title: "UP Police <Bharti> & Result", createdAt: new Date(fresh) }],
    now: NOW,
  });
  const xml = renderNewsSitemapXml(entries, { baseUrl: "https://studygyaan.in" });
  assert.match(xml, /xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/);
  assert.match(xml, /<loc>https:\/\/studygyaan\.in\/job\/x<\/loc>/);
  assert.match(xml, /&lt;Bharti&gt; &amp; Result/);
  assert.match(xml, /<news:publication_date>2026-10-04T06:00:00\.000Z<\/news:publication_date>/);
});
