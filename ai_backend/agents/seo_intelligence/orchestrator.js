"use strict";

/**
 * SEO Intelligence orchestrator — scheduled via SEO Master (no extra CF).
 *
 * DOES:
 *   - classify job lifecycle (writes lifecycleStatus only)
 *   - compute content gaps / CTR recs / mock-test / youtube suggestions
 *   - persist seo_recommendations (never executed automatically)
 *
 * DOES NOT:
 *   - publish or rewrite article HTML
 *   - create new public pages
 *   - invent Search Console numbers
 *   - log secrets
 */

const { isAutomationEnabled } = require("../automation_guard");
const { detectExamFamily, detectContentKind } = require("./taxonomy");
const { classifyJobLifecycle, lifecycleFieldsEqual } = require("./job_lifecycle");
const {
  findCtrOpportunities,
  findContentGaps,
  lifecycleRecommendations,
  rankRecommendations,
  normalizeGscRows,
  redactSecrets
} = require("./intelligence");
const { findRelatedMockTests, extractYoutubeRef } = require("./ecosystem");

const RUNS = "seo_intelligence_runs";
const RECS = "seo_recommendations";
const SETTINGS = "system_settings";
const SETTINGS_DOC = "seo_intelligence";
const GSC_DOC = "seo_search_console";

function mapDoc(doc, collectionName) {
  const data = typeof doc.data === "function" ? doc.data() : doc;
  const id = doc.id;
  const title = data.title || data.h1 || "";
  const mapped = {
    id,
    title,
    slug: data.slug || id,
    status: data.status || "published",
    category: data.category || "",
    organization: data.organization || data.org || "",
    lastDate: data.lastDate || "",
    startDate: data.startDate || "",
    type: collectionName === "jobs" ? "JOB" : collectionName === "mock_tests" ? "MOCK_TEST" : collectionName === "blogs" ? "BLOG" : "FAST_TRACK",
    youtubeUrl: data.youtubeUrl || "",
    youtubeVideoId: data.youtubeVideoId || "",
    views: data.views || 0,
    wordCount: data.wordCount || 0,
    articleHtml: data.articleHtml || "",
    faqs: data.faqs || [],
    lifecycleStatus: data.lifecycleStatus || "",
    lifecycleDays: data.lifecycleDays,
    includeJobPostingSchema: data.includeJobPostingSchema,
    sitemapPriority: data.sitemapPriority,
    examFamily: data.examFamily || detectExamFamily({ title, category: data.category, organization: data.organization || data.org }),
    contentKind: data.contentKind || detectContentKind({
      type: collectionName === "jobs" ? "JOB" : collectionName === "mock_tests" ? "MOCK_TEST" : collectionName === "fast_track" ? "FAST_TRACK" : "BLOG",
      title,
      category: data.category
    })
  };
  mapped.url = collectionName === "jobs"
    ? `/job/${encodeURIComponent(mapped.slug)}`
    : collectionName === "mock_tests"
      ? `/test/${encodeURIComponent(mapped.slug)}`
      : collectionName === "blogs"
        ? `/blog/${encodeURIComponent(mapped.slug)}`
        : `/update/${encodeURIComponent(mapped.slug)}`;
  return mapped;
}

async function readCollection(db, name, limitCount) {
  try {
    const snap = await db.collection(name).orderBy("createdAt", "desc").limit(limitCount).get();
    return (snap.docs || []).map((doc) => mapDoc(doc, name));
  } catch (error) {
    console.warn(`[seo-intelligence] read ${name} failed:`, error.message);
    return [];
  }
}

async function loadGscSnapshot(db) {
  try {
    const snap = await db.collection(SETTINGS).doc(GSC_DOC).get();
    if (!snap.exists) return { enabled: false, rows: [] };
    const data = snap.data() || {};
    return { enabled: true, rows: normalizeGscRows(data.rows || []), ingestedAt: data.ingestedAt || null };
  } catch {
    return { enabled: false, rows: [] };
  }
}

function lifecycleCounts(jobs, now) {
  const counts = { OPEN: 0, CLOSING_SOON: 0, CLOSED: 0, EXPIRED: 0, UPCOMING: 0, UNKNOWN: 0 };
  for (const job of jobs) {
    const status = classifyJobLifecycle(job, now).status;
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

async function persistRecommendations(db, FieldValue, recs) {
  if (!db || !recs.length) return 0;
  let written = 0;
  for (const rec of recs.slice(0, 40)) {
    const id = String(`${rec.kind}-${rec.examFamily || "x"}-${rec.title}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `rec-${written}`;
    try {
      await db.collection(RECS).doc(id).set(
        {
          ...rec,
          autoCreate: false,
          updatedAt: FieldValue ? FieldValue.serverTimestamp() : new Date().toISOString()
        },
        { merge: true }
      );
      written += 1;
    } catch (error) {
      console.warn("[seo-intelligence] rec write failed:", error.message);
    }
  }
  return written;
}

async function refreshLifecycleFields(db, jobs, now, maxWrites = 50) {
  let updated = 0;
  for (const job of jobs) {
    if (updated >= maxWrites) break;
    const life = classifyJobLifecycle(job, now);
    if (lifecycleFieldsEqual(job, life)) continue;
    try {
      await db.collection("jobs").doc(job.id).set(
        {
          lifecycleStatus: life.status,
          lifecycleDays: life.daysUntilLastDate,
          includeJobPostingSchema: life.includeJobPostingSchema,
          sitemapPriority: life.sitemapPriority
        },
        { merge: true }
      );
      updated += 1;
    } catch (error) {
      console.warn("[seo-intelligence] lifecycle write failed:", error.message);
    }
  }
  return updated;
}

/**
 * Stored relatedLinks writes were removed in the fix phase.
 * Internal linking is scored at render time by the existing RelatedContent widget.
 */
async function refreshRelatedLinks() {
  return 0;
}

function youtubeLoopRecs(pages) {
  const recs = [];
  for (const page of pages) {
    if (extractYoutubeRef(page)) continue;
    if ((page.contentKind === "JOB" || page.contentKind === "RESULT") && (page.examFamily || "") !== "GENERAL") {
      recs.push({
        kind: "YOUTUBE_LOOP",
        title: `No video linked: ${String(page.title || "").slice(0, 80)}`,
        reason: "Page has no youtubeUrl. Existing Video Dispatcher can attach a video later — do not auto-create.",
        examFamily: page.examFamily,
        page: page.url,
        autoCreate: false,
        priority: 30
      });
    }
  }
  return recs.slice(0, 3);
}

function mockTestRecs(pages, tests) {
  const recs = [];
  for (const page of pages.slice(0, 40)) {
    if (page.contentKind !== "JOB") continue;
    const related = findRelatedMockTests(page, tests, 2);
    if (related.length) continue;
    recs.push({
      kind: "MOCK_TEST",
      title: `No mock test cluster for ${page.examFamily}`,
      reason: `${String(page.title || "").slice(0, 80)} has no related published mock test.`,
      suggestedAction: "Create a mock test only if syllabus/official pattern exists. Never auto-generate from an empty source.",
      examFamily: page.examFamily,
      autoCreate: false,
      priority: 35
    });
  }
  return recs.slice(0, 8);
}

async function runSeoIntelligence(db, FieldValue, options = {}) {
  const started = Date.now();
  if (!options.force && db) {
    const guard = await isAutomationEnabled(db, "seo_intelligence");
    if (!guard.enabled) {
      return { skipped: true, reason: guard.reason, ok: true };
    }
  }

  const now = options.now || new Date();
  const maxJobs = Math.min(Number(options.maxJobs) || 120, 200);
  const jobs = db ? await readCollection(db, "jobs", maxJobs) : [];
  const updates = db ? await readCollection(db, "fast_track", Math.min(Number(options.maxUpdates) || 80, 150)) : [];
  const tests = db ? await readCollection(db, "mock_tests", 40) : [];
  const blogs = db ? await readCollection(db, "blogs", 20) : [];
  const catalog = [...jobs, ...updates, ...tests, ...blogs];
  const gsc = db ? await loadGscSnapshot(db) : { enabled: false, rows: options.gscRows || [] };

  const ctr = gsc.rows?.length ? findCtrOpportunities(gsc.rows) : [];
  const gaps = findContentGaps(catalog);
  const lifeRecs = lifecycleRecommendations(jobs, now);
  const recs = rankRecommendations([
    ctr,
    gaps,
    lifeRecs,
    youtubeLoopRecs(jobs),
    mockTestRecs(jobs, tests)
  ]);

  let lifecycleUpdates = 0;
  let relatedUpdates = 0;
  let recWrites = 0;
  if (db && !options.dryRun) {
    lifecycleUpdates = await refreshLifecycleFields(db, jobs, now);
    relatedUpdates = await refreshRelatedLinks(db, [...jobs.slice(0, 20), ...updates.slice(0, 10)], catalog);
    recWrites = await persistRecommendations(db, FieldValue, recs);
  }

  const summary = redactSecrets({
    ok: true,
    skipped: false,
    generatedAt: now.toISOString(),
    durationMs: Date.now() - started,
    scanned: { jobs: jobs.length, updates: updates.length, tests: tests.length, blogs: blogs.length },
    lifecycle: lifecycleCounts(jobs, now),
    lifecycleUpdates,
    relatedUpdates,
    recommendationCount: recs.length,
    recWrites,
    searchConsole: { enabled: Boolean(gsc.enabled), rowCount: (gsc.rows || []).length },
    topRecommendations: recs.slice(0, 8)
  });

  if (db && FieldValue && !options.dryRun) {
    try {
      const runId = now.toISOString().replace(/[:.]/g, "-");
      await db.collection(RUNS).doc(runId).set({ ...summary, createdAt: FieldValue.serverTimestamp() });
      await db.collection(SETTINGS).doc(SETTINGS_DOC).set(
        { lastRun: summary, lastRunAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (error) {
      console.warn("[seo-intelligence] persist run failed:", error.message);
    }
  }

  return summary;
}

module.exports = {
  runSeoIntelligence,
  mapDoc,
  lifecycleCounts,
  RUNS,
  RECS,
  SETTINGS_DOC,
  GSC_DOC
};
