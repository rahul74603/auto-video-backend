"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { detectExamFamily, detectContentKind, clusterId, CONTENT_KINDS } = require("../agents/seo_intelligence/taxonomy");
const { classifyJobLifecycle, STATES, lifecycleFieldsEqual } = require("../agents/seo_intelligence/job_lifecycle");
const { buildJobPublishPayload, buildFastTrackPublishPayload } = require("../agents/article_agents/article_pipeline");
const { buildHistoryEntry, mergeUpdateHistory } = require("../agents/seo_intelligence/update_history");
const { classifySearchIntent, INTENTS, assessIntentAlignment } = require("../agents/seo_intelligence/search_intent");
const { scoreFaqUsefulness, buildFaqPageSchema } = require("../agents/seo_intelligence/article_faq");
const { buildImageAlt, findImagesMissingAlt } = require("../agents/seo_intelligence/image_seo");
const { scoreDiscoverReadiness } = require("../agents/seo_intelligence/discover");
const { reviewEditorialQuality } = require("../agents/seo_intelligence/editorial_quality_gate");
const { scoreRelated, selectRelatedLinks, canonicalPath, pathFromInternalUrl } = require("../agents/seo_intelligence/linking_engine");
const { CappedHitStore, createLimiter } = require("../agents/seo_intelligence/rate_limit");
const {
  normalizeGscRows,
  findCtrOpportunities,
  findContentGaps,
  rankRecommendations,
  redactSecrets,
  buildDashboard
} = require("../agents/seo_intelligence/intelligence");
const { youtubeIdFromUrl, findRelatedMockTests, findYoutubeMatches } = require("../agents/seo_intelligence/ecosystem");
const { enrichContentDocument } = require("../agents/seo_intelligence/enrich");
const { runSeoIntelligence } = require("../agents/seo_intelligence/orchestrator");
const { EDITORIAL_AUTHOR } = require("../agents/article_agents/constants");

test("taxonomy detects SSC / Railway families and job vs result kinds", () => {
  assert.equal(detectExamFamily({ title: "SSC CGL 2026 Recruitment" }), "SSC");
  assert.equal(detectExamFamily({ title: "RRB NTPC Admit Card" }), "RAILWAY");
  assert.equal(detectContentKind({ type: "JOB", title: "SSC CGL 2026" }), CONTENT_KINDS.JOB);
  assert.equal(detectContentKind({ type: "FAST_TRACK", category: "Admit Card", title: "CGL Hall Ticket" }), CONTENT_KINDS.ADMIT_CARD);
  assert.equal(clusterId("SSC", "JOB"), "SSC:JOB");
});

test("job lifecycle classifies closing / closed / expired without deleting", () => {
  const now = new Date("2026-08-26T00:00:00Z");
  assert.equal(classifyJobLifecycle({ type: "JOB", lastDate: "31/08/2026" }, now).status, STATES.CLOSING_SOON);
  assert.equal(classifyJobLifecycle({ type: "JOB", lastDate: "01/08/2026" }, now).status, STATES.CLOSED);
  assert.equal(classifyJobLifecycle({ type: "JOB", lastDate: "01/06/2026" }, now).status, STATES.EXPIRED);
  assert.equal(classifyJobLifecycle({ type: "JOB", lastDate: "01/06/2026" }, now).indexable, true);
  assert.equal(classifyJobLifecycle({ type: "JOB", lastDate: "01/06/2026" }, now).includeJobPostingSchema, false);
});

test("update history is append-only and skips no-op updates", () => {
  const first = mergeUpdateHistory([], buildHistoryEntry(null, { title: "A" }, { reason: "published" }));
  assert.equal(first.length, 1);
  const noChange = mergeUpdateHistory(first, buildHistoryEntry({ title: "A" }, { title: "A" }, { reason: "updated" }));
  assert.equal(noChange.length, 1);
  const changed = mergeUpdateHistory(first, buildHistoryEntry({ title: "A", lastDate: "1" }, { title: "A", lastDate: "2" }, { reason: "updated" }));
  assert.equal(changed.length, 2);
  assert.equal(changed[1].changes[0].field, "lastDate");
});

test("search intent matches apply vs latest-update pages", () => {
  assert.equal(classifySearchIntent({ type: "JOB", title: "SSC CGL Apply" }), INTENTS.APPLY);
  assert.equal(classifySearchIntent({ type: "FAST_TRACK", category: "Result", title: "CGL Result" }), INTENTS.LATEST_UPDATE);
  const aligned = assessIntentAlignment({ title: "SSC CGL 2026 Recruitment Apply Online", intent: INTENTS.APPLY });
  assert.equal(aligned.aligned, true);
});

test("FAQ engine rejects generic placeholder answers and builds FAQPage schema", () => {
  const bad = scoreFaqUsefulness([
    { question: "Q1", answer: "Official Notification देखें" },
    { question: "Q2", answer: "see official notification" },
    { question: "Q3", answer: "N/A" },
    { question: "Q4", answer: "Official Notification में देखें" }
  ]);
  assert.ok(bad.issues.includes("faq:placeholder-answers"));
  const schema = buildFaqPageSchema([{ question: "Last date?", answer: "31 July 2026 as per notification." }]);
  assert.equal(schema["@type"], "FAQPage");
});

test("image SEO builds alt text and flags missing alt attributes", () => {
  assert.match(buildImageAlt("SSC CGL 2026", "JOB"), /SSC CGL 2026/);
  const missing = findImagesMissingAlt('<img src="/a.jpg"><img src="/b.jpg" alt="ok">');
  assert.equal(missing.length, 1);
});

test("discover scoring blocks clickbait and all-caps titles", () => {
  const bad = scoreDiscoverReadiness({ title: "SHOCKING VIRAL TRICK YOU WONT BELIEVE", hasImage: false, wordCount: 100 });
  assert.ok(bad.issues.includes("discover:clickbait-title") || bad.issues.includes("discover:all-caps-title"));
  const ok = scoreDiscoverReadiness({ title: "SSC CGL 2026 Apply Online", hasImage: true, wordCount: 1800, original: true });
  assert.ok(ok.score >= 70);
});

test("editorial gate fails clickbait but passes a normal job title", () => {
  const fail = reviewEditorialQuality({
    type: "JOB",
    article: {
      seoTitle: "You won't believe this sarkari naukri secret trick",
      h1: "You won't believe this sarkari naukri secret trick",
      contentHtml: "<h1>x</h1><h2>a</h2><p>hello</p>",
      faqs: [{ question: "Q", answer: "A reasonably long grounded answer here." }],
      wordCount: 2000
    }
  });
  assert.ok(fail.issues.includes("editorial:clickbait-title"));

  const pass = reviewEditorialQuality({
    type: "JOB",
    article: {
      seoTitle: "SSC CGL 2026 Recruitment 5432 Posts Apply Online",
      h1: "SSC CGL 2026 Recruitment",
      contentHtml: "<h1>SSC CGL 2026 Recruitment</h1><h2>आवेदन कैसे करें</h2><p>Official website par apply karein.</p>",
      faqs: [
        { question: "Last date?", answer: "31 July 2026 according to the notification." },
        { question: "Fee?", answer: "Rs 100 for general as per notice." }
      ],
      wordCount: 1800
    }
  });
  assert.deepEqual(pass.issues, []);
});

test("canonicalPath uses URL parsing and rejects foreign/protocol-relative hosts", () => {
  assert.equal(pathFromInternalUrl("https://studygyaan.in/job/ssc-cgl-2026?x=1#y"), "/job/ssc-cgl-2026");
  assert.equal(pathFromInternalUrl("/update/ssc-result"), "/update/ssc-result");
  assert.equal(pathFromInternalUrl("https://studygyaan.in.evil.com/job/x"), "");
  assert.equal(pathFromInternalUrl("https://evil.com/job/x"), "");
  assert.equal(pathFromInternalUrl("//evil.com/job/x"), "");
  assert.equal(pathFromInternalUrl("javascript:alert(1)"), "");
  assert.equal(pathFromInternalUrl("https://studygyaan.in@evil.com/job/x"), "");
  const fromSlug = canonicalPath({ slug: "ssc-cgl-2026", contentKind: "JOB" });
  assert.equal(fromSlug, "/job/ssc-cgl-2026");
  const poisoned = canonicalPath({
    slug: "ssc-cgl-2026",
    contentKind: "JOB",
    url: "https://studygyaan.in.evil.com/job/pwned"
  });
  assert.equal(poisoned, "/job/ssc-cgl-2026");
});

test("seo intelligence rate-limit store caps keys and counts hits", async () => {
  const store = new CappedHitStore(2);
  store.init({ windowMs: 60_000 });
  store._now = () => 1_000;
  const a = await store.increment("ip-a");
  assert.equal(a.totalHits, 1);
  await store.increment("ip-b");
  await store.increment("ip-c");
  assert.ok(store.hits.size <= 2);
  const limiter = createLimiter({ windowMs: 60_000, limit: 99, store: new CappedHitStore(10) });
  assert.equal(typeof limiter, "function");
});

test("internal linking prefers same exam complementary types and never self-links", () => {
  const source = { id: "1", title: "SSC CGL 2026", type: "JOB", examFamily: "SSC", contentKind: "JOB", slug: "ssc-cgl-2026" };
  const catalog = [
    { id: "1", title: "SSC CGL 2026", type: "JOB", examFamily: "SSC", contentKind: "JOB", slug: "ssc-cgl-2026", status: "published" },
    { id: "2", title: "SSC CGL Admit Card", type: "FAST_TRACK", examFamily: "SSC", contentKind: "ADMIT_CARD", slug: "ssc-cgl-admit", status: "published" },
    { id: "3", title: "Random Bank PO", type: "JOB", examFamily: "BANKING", contentKind: "JOB", slug: "bank-po", status: "published" },
    { id: "4", title: "Draft only", type: "JOB", examFamily: "SSC", contentKind: "MOCK_TEST", slug: "draft", status: "draft" }
  ];
  assert.equal(scoreRelated(source, catalog[0]), 0);
  const links = selectRelatedLinks(source, catalog, 6);
  assert.ok(links.some((l) => l.url.includes("ssc-cgl-admit")));
  assert.ok(!links.some((l) => l.url.includes("ssc-cgl-2026")));
  assert.ok(!links.some((l) => l.url.includes("draft")));
});

test("GSC ingest keeps only studygyaan.in rows and never auto-creates pages", () => {
  const rows = normalizeGscRows([
    { query: "ssc cgl", page: "https://studygyaan.in/job/ssc-cgl-2026", clicks: 10, impressions: 400, ctr: 0.01, position: 8 },
    { query: "spam", page: "https://evil.example/x", clicks: 99, impressions: 9999, ctr: 0.5, position: 1 }
  ]);
  assert.equal(rows.length, 1);
  const ctr = findCtrOpportunities(rows, { minImpressions: 100 });
  assert.equal(ctr[0].autoCreate, false);
  assert.ok(/do not auto-publish/i.test(ctr[0].suggestedAction));
});

test("content gap engine recommends missing kinds without creating pages", () => {
  const gaps = findContentGaps([
    { title: "SSC CGL", examFamily: "SSC", contentKind: "JOB" },
    { title: "SSC CHSL", examFamily: "SSC", contentKind: "JOB" }
  ]);
  assert.ok(gaps.some((g) => g.missingKind === "MOCK_TEST"));
  assert.ok(gaps.every((g) => g.autoCreate === false));
});

test("recommendations are ranked and secrets are redacted", () => {
  const ranked = rankRecommendations([
    [{ kind: "CTR", title: "A", priority: 10, autoCreate: true }],
    [{ kind: "CONTENT_GAP", title: "B", priority: 90 }]
  ]);
  assert.equal(ranked[0].title, "B");
  assert.ok(ranked.every((r) => r.autoCreate === false));
  const redacted = redactSecrets({ SERVICE_ACCOUNT_JSON: "secret", ok: true, nested: { apiKey: "x" } });
  assert.equal(redacted.SERVICE_ACCOUNT_JSON, "[redacted]");
  assert.equal(redacted.nested.apiKey, "[redacted]");
  const dash = buildDashboard({ recommendations: ranked, gsc: { enabled: true, rows: [1, 2] } });
  assert.equal(dash.policy.autoPublish, false);
});

test("youtube and mock-test ecosystem only links existing records", () => {
  assert.equal(youtubeIdFromUrl("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
  const tests = findRelatedMockTests(
    { title: "SSC CGL 2026", examFamily: "SSC" },
    [{ title: "SSC CGL Mock Test", examFamily: "SSC", slug: "ssc-cgl-mock", status: "published", contentKind: "MOCK_TEST" }]
  );
  assert.equal(tests[0].url, "/test/ssc-cgl-mock");
  const videos = findYoutubeMatches(
    { title: "SSC CGL 2026 Recruitment", examFamily: "SSC" },
    [{ title: "SSC CGL 2026 video", examFamily: "SSC", youtubeUrl: "https://youtu.be/abcdefghijk" }]
  );
  assert.equal(videos[0].youtubeVideoId, "abcdefghijk");
});

test("enrich adds cluster/intent/lifecycle fields used at publish", () => {
  const seo = enrichContentDocument({
    type: "JOB",
    title: "SSC CGL 2026 Recruitment",
    seoTitle: "SSC CGL 2026 Recruitment Apply Online",
    facts: { organization: "SSC", lastDate: "31/12/2026", category: "ssc" },
    sourceUrl: "https://ssc.gov.in/notice"
  });
  assert.equal(seo.examFamily, "SSC");
  assert.equal(seo.searchIntent, "APPLY");
  assert.equal(seo.sourceCitation.disclosed, true);
});

test("lifecycle writes are skipped when status/schema/priority already match", () => {
  const life = classifyJobLifecycle({ type: "JOB", lastDate: "31/12/2026" }, new Date("2026-08-26T00:00:00Z"));
  assert.equal(lifecycleFieldsEqual({
    lifecycleStatus: life.status,
    lifecycleDays: life.daysUntilLastDate,
    includeJobPostingSchema: life.includeJobPostingSchema,
    sitemapPriority: life.sitemapPriority
  }, life), true);
  assert.equal(lifecycleFieldsEqual({ lifecycleStatus: "OPEN" }, life), false);
});

test("fast-track publish payload uses the same canonical enrichment as JOB", () => {
  const payload = buildFastTrackPublishPayload({
    title: "SSC CGL Result 2026",
    slug: "ssc-cgl-result-2026",
    metaDescription: "Check result.",
    articleHtml: "<h1>Result</h1>",
    facts: { category: "Result", org: "SSC", updateDate: "01/08/2026", directLink: "https://ssc.gov.in/result" },
    sourceUrl: "https://ssc.gov.in/result"
  }, "draft-ft");
  assert.equal(payload.examFamily, "SSC");
  assert.equal(payload.contentKind, "RESULT");
  assert.equal(payload.searchIntent, "LATEST_UPDATE");
  assert.equal(payload.sourceCitation.disclosed, true);
  assert.equal(payload.seoIntelligenceVersion, 1);
});

test("publish payload includes SEO intelligence fields without dropping core job fields", () => {
  const payload = buildJobPublishPayload({
    title: "SSC CGL 2026",
    slug: "ssc-cgl-2026",
    metaDescription: "Apply online.",
    articleHtml: "<h1>SSC CGL 2026</h1>",
    faqs: [{ question: "Last date?", answer: "31 Dec 2026 as per notice." }],
    facts: { organization: "Staff Selection Commission", vacancies: "10", lastDate: "2026-12-31", applyLink: "https://ssc.gov.in" },
    structuredData: "{}",
    sourceUrl: "https://ssc.gov.in/notice"
  }, "draft-1");
  assert.equal(payload.status, "published");
  assert.equal(payload.authorName, EDITORIAL_AUTHOR);
  assert.equal(payload.examFamily, "SSC");
  assert.equal(payload.contentKind, "JOB");
});

test("intelligence orchestrator never publishes and can run dry without db writes", async () => {
  const report = await runSeoIntelligence(null, null, { dryRun: true, force: true, now: new Date("2026-08-26") });
  assert.equal(report.ok, true);
  assert.equal(report.lifecycleUpdates, 0);
  assert.ok(!("jobs" in (report.scanned || {})) || report.scanned.jobs === 0);
});

test("intelligence orchestrator live scan writes no relatedLinks and does not throw", async () => {
  const writes = [];
  const jobDoc = {
    id: "job-ssc-cgl",
    data: () => ({
      title: "SSC CGL 2026 Recruitment",
      slug: "ssc-cgl-2026",
      lastDate: "31/12/2026",
      type: "JOB",
      createdAt: { toDate: () => new Date("2026-01-01") },
      lifecycleStatus: "OPEN",
      includeJobPostingSchema: true,
      sitemapPriority: 0.8
    })
  };
  const db = {
    collection(name) {
      return {
        orderBy() {
          return {
            limit() {
              return {
                async get() {
                  return { docs: name === "jobs" ? [jobDoc] : [] };
                }
              };
            }
          };
        },
        doc(id) {
          return {
            async get() {
              return { exists: false, data: () => ({}) };
            },
            async set(data, opts) {
              writes.push({ collection: name, id, data, opts });
            }
          };
        }
      };
    }
  };
  const report = await runSeoIntelligence(db, { serverTimestamp: () => "ts" }, {
    force: true,
    now: new Date("2026-08-26T00:00:00Z"),
    maxJobs: 10,
    maxUpdates: 10
  });
  assert.equal(report.ok, true);
  assert.equal(report.relatedUpdates, 0);
  assert.equal(report.lifecycleUpdates, 0);
  assert.ok(!writes.some((w) => w.data && Object.prototype.hasOwnProperty.call(w.data, "relatedLinks")));
  assert.ok(!writes.some((w) => w.collection === "jobs"));
});

test("editorial issues do not fire on a well-structured grounded article body", () => {
  const article = {
    type: "JOB",
    seoTitle: "SSC CGL 2026 Recruitment 5432 Posts Apply",
    h1: "SSC CGL 2026 Recruitment",
    authorName: EDITORIAL_AUTHOR,
    contentHtml: "<h1>SSC CGL 2026 Recruitment</h1><h2>आवेदन कैसे करें</h2><p>ssc.gov.in par apply karein.</p>",
    faqs: [
      { question: "Last date?", answer: "31 July 2026 according to notification." },
      { question: "Fee?", answer: "Rs 100 for general category." },
      { question: "Posts?", answer: "5432 posts as per notice." },
      { question: "Qualification?", answer: "Bachelor Degree from a recognised university." }
    ],
    facts: { title: "SSC CGL 2026", organization: "SSC" },
    officialLinks: [{ label: "Apply", url: "https://ssc.gov.in" }],
    wordCount: 1800
  };
  const editorial = reviewEditorialQuality({ type: "JOB", article });
  assert.deepEqual(editorial.issues, [], editorial.issues.join("|"));
});
