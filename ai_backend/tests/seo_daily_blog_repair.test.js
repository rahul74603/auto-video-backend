"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  filterBlogOnlyProposals,
  selectDailyBlogRepairCandidates
} = require("../agents/seo_intelligence/orchestrator");
const { triggerOptimizerAfterPublish } = require("../agents/seo_intelligence/publish_hook");

const blog = (id, overrides = {}) => ({ id, collection: "blogs", type: "BLOG", ...overrides });

test("optimizer proposals are restricted to BLOG content", () => {
  const proposals = [
    { id: "blog-proposal", contentType: "BLOG" },
    { id: "job-proposal", contentType: "JOB" },
    { id: "ft-proposal", contentType: "FAST_TRACK" },
    null
  ];
  assert.deepEqual(filterBlogOnlyProposals(proposals), [proposals[0]]);
});

test("daily blog repair selects at most five eligible old BLOG records", () => {
  const pages = Array.from({ length: 8 }, (_, index) => blog(`blog-${index}`));
  const selected = selectDailyBlogRepairCandidates(pages, null, 5);

  assert.deepEqual(selected.map((page) => page.id), [
    "blog-0", "blog-1", "blog-2", "blog-3", "blog-4"
  ]);
  assert.equal(selected.length, 5);
});

test("daily blog repair rotates after its cursor and wraps to the oldest", () => {
  const pages = Array.from({ length: 7 }, (_, index) => blog(`blog-${index}`));

  assert.deepEqual(
    selectDailyBlogRepairCandidates(pages, "blog-3", 5).map((page) => page.id),
    ["blog-4", "blog-5", "blog-6", "blog-0", "blog-1"]
  );
  assert.deepEqual(
    selectDailyBlogRepairCandidates(pages, "blog-6", 5).map((page) => page.id),
    ["blog-0", "blog-1", "blog-2", "blog-3", "blog-4"]
  );
});

test("publish hooks skip all types without reading or writing public content", async () => {
  const db = { collection: () => { throw new Error("must not access Firestore"); } };
  for (const [collection, type] of [["blogs", "BLOG"], ["jobs", "JOB"], ["fast_track", "FAST_TRACK"]]) {
    const result = await triggerOptimizerAfterPublish(db, null, { id: "sample", type }, collection);
    assert.equal(result.skipped, true);
    assert.match(result.reason, /daily-blog-proposals-only/);
  }
});

test("daily blog repair excludes non-BLOG, unpublished, and noindex documents", () => {
  const pages = [
    blog("good"),
    { id: "job", collection: "jobs", type: "JOB" },
    blog("draft", { status: "draft" }),
    blog("archived", { status: "archived" }),
    blog("noindex", { noIndex: true }),
    blog("second-good")
  ];

  assert.deepEqual(
    selectDailyBlogRepairCandidates(pages, null, 5).map((page) => page.id),
    ["good", "second-good"]
  );
});
