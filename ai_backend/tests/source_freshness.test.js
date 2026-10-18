"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parsePublishedAt,
  isRecentPublication,
  extractPublishedAtFromHtml,
  isRecentFeedItem,
  isDeadlineExpired,
  parseDeadline,
  DEFAULT_MAX_AGE_DAYS,
} = require("../source_freshness");

const now = Date.parse("2026-10-18T00:00:00Z");

test("freshness verifier accepts recent dates and rejects old, future, or unknown dates", () => {
  assert.equal(isRecentPublication("2026-10-01T00:00:00Z", { now }), true);
  assert.equal(isRecentPublication("2025-10-01T00:00:00Z", { now }), false);
  assert.equal(isRecentPublication("2026-10-20T00:00:00Z", { now }), false);
  assert.equal(isRecentPublication("not-a-date", { now }), false);
  assert.equal(isRecentPublication("", { now }), false);
  assert.equal(DEFAULT_MAX_AGE_DAYS, 90);
});

test("RSS freshness recognizes pubDate and isoDate, while missing dates fail verification", () => {
  assert.equal(isRecentFeedItem({ isoDate: "2026-10-10T12:00:00Z" }, { now }), true);
  assert.equal(isRecentFeedItem({ pubDate: "Wed, 01 Jan 2025 10:00:00 GMT" }, { now }), false);
  assert.equal(isRecentFeedItem({ title: "undated" }, { now }), false);
});

test("HTML publication date supports metadata, time elements, and JSON-LD", () => {
  const meta = '<meta property="article:published_time" content="2026-10-12T09:30:00Z">';
  assert.equal(extractPublishedAtFromHtml(meta), Date.parse("2026-10-12T09:30:00Z"));
  const time = '<time datetime="2026-10-11T08:00:00Z">11 Oct</time>';
  assert.equal(extractPublishedAtFromHtml(time), Date.parse("2026-10-11T08:00:00Z"));
  const jsonLd = '<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-09T07:00:00Z"}</script>';
  assert.equal(extractPublishedAtFromHtml(jsonLd), Date.parse("2026-10-09T07:00:00Z"));
});


test("deadline verification rejects expired Indian dates but leaves future deadlines eligible", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  assert.equal(isDeadlineExpired("25/10/2025", now), true);
  assert.equal(isDeadlineExpired("25 Oct 2026", now), false);
  assert.equal(isDeadlineExpired("2026-10-17", now), true);
  assert.equal(isDeadlineExpired("not a date", now), false);
  assert.ok(parseDeadline("25.10.2026") > now);
});
