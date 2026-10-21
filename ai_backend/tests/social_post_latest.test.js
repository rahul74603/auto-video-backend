"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COLLECTIONS,
  MAX_POST_AGE_HOURS,
  itemTime,
  isFresh,
  isIndexableStatus,
  pickNewest,
} = require("../social_media/post_latest");

const NOW = Date.parse("2026-10-21T04:30:00Z");
const H = 3600 * 1000;

test("collections + max age stable hain", () => {
  assert.deepEqual(COLLECTIONS.map((c) => c.type), ["JOB", "FAST_TRACK", "BLOG"]);
  assert.equal(MAX_POST_AGE_HOURS, 36);
});

test("itemTime newest timestamp nikalta hai (Timestamp-like bhi)", () => {
  assert.equal(itemTime({ createdAt: NOW - H }), NOW - H);
  assert.equal(itemTime({ createdAt: NOW - 5 * H, updatedAt: NOW - H }), NOW - H);
  assert.equal(itemTime({ createdAt: { toMillis: () => NOW - 2 * H } }), NOW - 2 * H);
  assert.equal(itemTime({}), 0);
});

test("isFresh: 36h ke andar fresh, uske baad stale", () => {
  assert.equal(isFresh({ createdAt: NOW - H }, NOW), true);
  assert.equal(isFresh({ createdAt: NOW - 36 * H }, NOW), true);
  assert.equal(isFresh({ createdAt: NOW - 36 * H - 1 }, NOW), false);
  assert.equal(isFresh({}, NOW), false);
});

test("draft/deleted/chhota-title indexable nahi", () => {
  assert.equal(isIndexableStatus({ status: "published", title: "Railway NTPC Bharti 2026" }), true);
  assert.equal(isIndexableStatus({ status: "draft", title: "Railway NTPC Bharti 2026" }), false);
  assert.equal(isIndexableStatus({ status: "published", title: "Railway NTPC Bharti 2026", deleted: true }), false);
  assert.equal(isIndexableStatus({ status: "published", title: "abc" }), false);
});

test("pickNewest: newest indexable item chunta hai, baaki ignore", () => {
  const cands = [
    { type: "JOB", id: "old", data: { status: "published", title: "Old Job Vacancy 2026", createdAt: NOW - 10 * H } },
    { type: "BLOG", id: "draft-new", data: { status: "draft", title: "Draft Blog Post Here", createdAt: NOW - H } },
    { type: "FAST_TRACK", id: "new", data: { status: "published", title: "Result Declared Today News", createdAt: NOW - 2 * H } },
  ];
  const best = pickNewest(cands);
  assert.equal(best.id, "new");
  assert.equal(best.type, "FAST_TRACK");
});

test("pickNewest: sab kharab ho to null", () => {
  assert.equal(pickNewest([]), null);
  assert.equal(pickNewest([{ type: "JOB", id: "x", data: { status: "draft", title: "Draft Job Post" } }]), null);
});
