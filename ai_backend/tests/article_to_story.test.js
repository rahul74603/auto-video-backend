"use strict";

/**
 * article_to_story.js — Article → Web Story converter ke unit tests.
 * Firebase-admin ke bina chalta hai (db mocks).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildStoryDoc,
    buildStoryId,
    shortenTitle,
    pickTheme,
    badgeFor,
    extractHighlights,
    isStoryEligible,
    shouldCreateOnWrite,
    createStoryForArticle,
    handleDocumentWritten,
    backfillStories,
    STORY_ASSETS
} = require("../article_to_story");

// ---------------------------------------------------------------------
// 🔧 Tiny Firestore mock
// ---------------------------------------------------------------------
function makeMockDb(seed = {}) {
    const store = new Map(); // "collection/id" → data
    Object.entries(seed).forEach(([key, value]) => store.set(key, value));

    const docRef = (collectionName, id) => ({
        async get() {
            const data = store.get(`${collectionName}/${id}`);
            return { exists: data !== undefined, data: () => data, id };
        },
        async set(data, options) {
            const key = `${collectionName}/${id}`;
            if (options && options.merge && store.has(key)) {
                store.set(key, { ...store.get(key), ...data });
            } else {
                store.set(key, data);
            }
        }
    });

    return {
        collection(name) {
            return {
                orderBy() { return this; },
                limit() { return this; },
                async get() {
                    const docs = [];
                    store.forEach((data, key) => {
                        const [col, id] = key.split("/");
                        if (col === name) docs.push({ id, data: () => data, ref: docRef(name, id) });
                    });
                    return { docs, empty: docs.length === 0 };
                },
                doc: (id) => docRef(name, id)
            };
        },
        dump: () => Object.fromEntries(store.entries())
    };
}

const FieldValue = { serverTimestamp: () => "SERVER_TS" };

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
test("buildStoryId deterministic + sanitized", () => {
    assert.equal(buildStoryId("SPMCIL Deputy Manager 2026!", "x"), "story-spmcil-deputy-manager-2026");
    assert.equal(buildStoryId("", "DocID_99"), "story-docid-99");
    assert.equal(buildStoryId(undefined, undefined), "story-update");
});

test("shortenTitle long title ≤ 70 chars and never empty", () => {
    const long = "HPSC Assistant Professor Commerce Result 2026 Declared Roll Wise Interview Marks For 279 Candidates";
    assert.ok(shortenTitle(long).length <= 70, "short title expected");
    assert.equal(shortenTitle(""), "StudyGyaan Update");
});

test("pickTheme — result/admit/notice/job/study detection", () => {
    assert.equal(pickTheme("fast_track", { title: "HPSC Assistant Professor Result 2026" }), "result");
    assert.equal(pickTheme("fast_track", { title: "UP Police Admit Card जारी" }), "admit");
    assert.equal(pickTheme("fast_track", { title: "SSC CGL Answer Key 2026" }), "notice");
    assert.equal(pickTheme("jobs", { title: "RITES Engineer Recruitment" }), "job");
    assert.equal(pickTheme("jobs", { title: "RITES Result Declared" }), "result");
    assert.equal(pickTheme("blogs", { title: "रामायण notes" }), "study");
});

test("badgeFor — हर type का सही badge", () => {
    assert.ok(badgeFor("job", "job", {}, "2026").includes("SARKARI NAUKRI 2026"));
    assert.equal(badgeFor("fasttrack", "result", {}, "2026"), "📢 RESULT OUT");
    assert.equal(badgeFor("fasttrack", "admit", {}, "2026"), "🎫 ADMIT CARD");
    assert.ok(badgeFor("blog", "study", {}, "2026").includes("BLOG"));
});

test("extractHighlights — HTML हटाए, dedupe, factual lines पहले", () => {
    const html = "<p>भर्ती की अंतिम तिथि 24 अगस्त 2026 है।</p><p>यह एक अच्छा अवसर है सभी विद्यार्थियों के लिए।</p><p>आवेदन शुल्क ₹1000 रखा गया है।</p>";
    const lines = extractHighlights(html, 3);
    assert.ok(lines.length > 0);
    assert.ok(lines.every(l => l.startsWith("• ")));
    assert.ok(/\d|₹/.test(lines[0]), "digit वाली line पहले आनी चाहिए");
    assert.ok(!lines.join(" ").includes("<p>"));
});

// ---------------------------------------------------------------------
// buildStoryDoc
// ---------------------------------------------------------------------
const JOB_DATA = {
    title: "SPMCIL Deputy Manager & Assistant Manager Recruitment 2026 Apply Online",
    slug: "spmcil-deputy-manager-recruitment-2026",
    organization: "Security Printing & Minting Corporation of India",
    vacancies: "24",
    salary: "₹50,000 - ₹1,60,000",
    qualification: "B.E./B.Tech",
    startDate: "25 July 2026",
    lastDate: "24 August 2026",
    feeGen: "₹1000",
    status: "published",
    articleHtml: "<p>आवेदन की अंतिम तिथि 24 अगست 2026 निर्धारित है। युवा अभ्यर्थी जल्दी करें।</p>"
};

test("JOB → facts वाली full story (5+ slides, सही refs)", () => {
    const { storyId, doc } = buildStoryDoc("jobs", "job123", JOB_DATA);
    assert.equal(storyId, "story-spmcil-deputy-manager-recruitment-2026");
    assert.equal(doc.storyType, "job");
    assert.equal(doc.theme, "job");
    assert.equal(doc.coverImage, STORY_ASSETS.job);
    assert.equal(doc.coverImageWidth, 1080);
    assert.equal(doc.coverImageHeight, 1440);
    assert.ok(doc.slides.length >= 5);
    assert.equal(doc.slides[0].type, "cover");
    assert.ok(doc.slides[0].badge.includes("SARKARI NAUKRI"));
    const blob = JSON.stringify(doc.slides);
    assert.ok(blob.includes("24 August 2026"));
    assert.ok(blob.includes("₹50,000"));
    assert.ok(!blob.includes("undefined"));
    assert.ok(!blob.includes("null"));
    const types = doc.slides.map(s => s.type);
    assert.ok(types.includes("stats"));
    assert.equal(types[types.length - 1], "cta");
    assert.equal(doc.applyLink, "https://studygyaan.in/job/spmcil-deputy-manager-recruitment-2026");
    assert.deepEqual(doc.sourceRef, { collection: "jobs", docId: "job123" });
    assert.equal(doc.status, "published");
    assert.equal(doc.autoGenerated, true);
});

test("thin JOB (सिर्फ title) — फिर भी min 4 slides, कोई fake fact/stats नहीं", () => {
    const { doc } = buildStoryDoc("jobs", "thin1", { title: "Navy SSR Agniveer Recruitment 2026" });
    assert.ok(doc.slides.length >= 4);
    const blob = JSON.stringify(doc.slides);
    assert.ok(!blob.includes("undefined"));
    assert.ok(!doc.slides.map(s => s.type).includes("stats"));
});

test("FAST_TRACK result → RESULT badge + how-to-check steps", () => {
    const { doc } = buildStoryDoc("fast_track", "ft1", {
        title: "Osmania University BCA 6th Sem Results June 2026 Declared",
        category: "Result", org: "Osmania University", updateDate: "28-Jul-2026"
    });
    assert.equal(doc.storyType, "fasttrack");
    assert.equal(doc.theme, "result");
    assert.equal(doc.slides[0].badge, "📢 RESULT OUT");
    assert.ok(JSON.stringify(doc.slides).includes("Result ऐसे देखें"));
    assert.equal(doc.applyLink, "https://studygyaan.in/fasttrack/ft1");
});

test("BLOG → study theme + real highlights", () => {
    const { doc } = buildStoryDoc("blogs", "b1", {
        title: "SSC CGL GK Strategy 2026 कैसे बनाएं",
        category: "Exam Strategy",
        articleHtml: "<p>Daily 2 घंटे GK पढ़ने से score 40+ जा सकता है। Previous year papers जरूर हल करें।</p>"
    });
    assert.equal(doc.storyType, "blog");
    assert.equal(doc.theme, "study");
    assert.ok(JSON.stringify(doc.slides).includes("2 घंटे"));
});

// ---------------------------------------------------------------------
// Eligibility & transitions
// ---------------------------------------------------------------------
test("eligibility — draft/pending/noIndex/short-title/noAutoStory blocked", () => {
    assert.equal(isStoryEligible({ title: "Long Enough Title Here", status: "draft" }), false);
    assert.equal(isStoryEligible({ title: "Long Enough Title Here", noIndex: true }), false);
    assert.equal(isStoryEligible({ title: "Tiny" }), false);
    assert.equal(isStoryEligible({ title: "Long Enough Title Here", noAutoStory: true, status: "published" }), false);
});

test("eligibility — published/missing status allowed", () => {
    assert.equal(isStoryEligible({ title: "RITES Recruitment 2026 for 16 Posts", status: "published" }), true);
    assert.equal(isStoryEligible({ title: "RITES Recruitment 2026 for 16 Posts" }), true);
});

test("shouldCreateOnWrite — सिर्फ publish transition / fresh publish पे", () => {
    const pub = { title: "RITES Recruitment 2026 for 16 Posts", status: "published" };
    assert.equal(shouldCreateOnWrite(null, pub), true);                 // fresh publish
    assert.equal(shouldCreateOnWrite({ status: "draft" }, pub), true);  // draft → published
    assert.equal(shouldCreateOnWrite(pub, pub), false);                 // view/edit bump
    assert.equal(shouldCreateOnWrite(null, { ...pub, storyCreated: true }), false);
    assert.equal(shouldCreateOnWrite(pub, null), false);                // delete
});

// ---------------------------------------------------------------------
// Firestore flows (mock db)
// ---------------------------------------------------------------------
test("createStoryForArticle idempotent — दोबारा create नहीं करता, source marked", async () => {
    const db = makeMockDb();
    const data = { title: "SPMCIL Recruitment 2026 for 24 Manager Posts", slug: "spmcil-24", status: "published" };
    const first = await createStoryForArticle(db, FieldValue, "jobs", "j1", data);
    assert.equal(first.created, true);
    assert.equal(first.storyId, "story-spmcil-24");

    const second = await createStoryForArticle(db, FieldValue, "jobs", "j1", data);
    assert.equal(second.created, false);
    assert.equal(second.reason, "exists");

    const dump = db.dump();
    assert.ok(dump["web_stories/story-spmcil-24"]);
    assert.equal(dump["web_stories/story-spmcil-24"].createdAt, "SERVER_TS");
    assert.equal(dump["jobs/j1"].storyCreated, true);
});

test("handleDocumentWritten — publish पे story, view-bump पे कुछ नहीं", async () => {
    const db = makeMockDb();
    const handler = handleDocumentWritten(db, FieldValue, "jobs", "jobId");
    const mkEvent = (before, after) => ({
        params: { jobId: "j9" },
        data: {
            before: before ? { data: () => before } : null,
            after: after ? { exists: true, data: () => after, id: "j9" } : { exists: false }
        }
    });
    const data = { title: "BOI Credit Officer Recruitment 2026 for 779 Posts", status: "published" };

    const created = await handler(mkEvent(null, data));
    assert.ok(created && created.created === true);

    const again = await handler(mkEvent(data, { ...data, views: 50 }));
    assert.equal(again, null);
});

test("backfillStories — नई stories बनाता है, junk stories noIndex करता है", async () => {
    const db = makeMockDb({
        "jobs/old1": { title: "ONGC Graduate Trainee Recruitment 2026 Posts 52", status: "published" },
        "jobs/old2": { title: "X", status: "published" }, // too short → ineligible
        "web_stories/junk1": { title: "Old Junk", coverImage: "https://via.placeholder.com/1200x600", slides: [] },
        "web_stories/good1": { title: "Good One", coverImage: "https://storage.googleapis.com/x.webp", slides: [{}, {}, {}] }
    });
    const report = await backfillStories(db, FieldValue, { limit: 10 });
    assert.equal(report.created.length, 1);
    assert.ok(report.created[0].includes("jobs/old1"));
    assert.ok(report.ineligible >= 1);
    assert.equal(report.junkArchived, 1);
    assert.deepEqual(report.errors, []);

    const dump = db.dump();
    assert.equal(dump["web_stories/junk1"].noIndex, true);
    assert.equal(dump["web_stories/good1"].noIndex, undefined);
});
