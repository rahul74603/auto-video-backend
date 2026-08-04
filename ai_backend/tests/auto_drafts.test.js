"use strict";

/**
 * auto_drafts.js + title_utils.js + draft-cleanup ke unit tests.
 * Firebase-admin ke bina chalta hai (db mocks + injectable deps).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeTitleKey, titlesOverlap, buildTitleSet, overlapsAny } = require("../agents/article_agents/title_utils");
const { cleanupSourceDrafts } = require("../article_to_story");
const {
    isFormPortalUrl,
    pickJobDraftUrl,
    pickAutoDraftCandidates,
    processCandidate,
    pickRepairCandidates,
    processRepair,
    lastTryTooRecent,
    runAutoDrafts,
    MAX_TRIES,
    REPAIR_MAX_TRIES
} = require("../auto_drafts");

// ---------------------------------------------------------------------
// 🔧 Tiny Firestore mock (docs + forEach + add + delete)
// ---------------------------------------------------------------------
function makeMockDb(seed = {}) {
    const store = new Map();
    Object.entries(seed).forEach(([key, value]) => store.set(key, value));
    let addCounter = 0;

    const docRef = (collectionName, id) => ({
        id,
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
        },
        async delete() {
            store.delete(`${collectionName}/${id}`);
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
                        const slash = key.indexOf("/");
                        const col = key.slice(0, slash);
                        const id = key.slice(slash + 1);
                        if (col === name) docs.push({ id, data: () => data, ref: docRef(name, id) });
                    });
                    return {
                        docs,
                        empty: docs.length === 0,
                        forEach: (fn) => docs.forEach(fn)
                    };
                },
                doc: (id) => docRef(name, id),
                async add(data) {
                    addCounter += 1;
                    const id = `auto_${addCounter}`;
                    store.set(`${name}/${id}`, data);
                    return { id };
                }
            };
        },
        dump: () => Object.fromEntries(store.entries())
    };
}

const FieldValue = { serverTimestamp: () => "SERVER_TS" };

// ---------------------------------------------------------------------
// 🔤 title_utils
// ---------------------------------------------------------------------
test("normalizeTitleKey — case/punct/space sab hata deta hai", () => {
    assert.equal(normalizeTitleKey("SSC CGL 2026 Result!"), "ssccgl2026result");
    assert.equal(normalizeTitleKey("  Railway Group-D (52,000 posts) "), "railwaygroupd52000posts");
    assert.equal(normalizeTitleKey(""), "");
    assert.equal(normalizeTitleKey(null), "");
});

test("normalizeTitleKey — Devanagari titles stable rehte hain", () => {
    assert.equal(normalizeTitleKey("बिहार विद्यालय परीक्षा समिति!"), "बिहारविद्यालयपरीक्षासमिति");
    assert.equal(normalizeTitleKey("यूपी पुलिस भर्ती 2026"), "यूपीपुलिसभर्ती2026");
});

test("titlesOverlap — exact + long-containment dup, short-containment nahi", () => {
    assert.equal(titlesOverlap("RRB NTPC Result 2026", "rrb ntpc result 2026"), true);
    assert.equal(
        titlesOverlap("Osmania University BCA 6th Sem Result 2026 Declared",
            "Osmania University BCA 6th Sem Result 2026"),
        true // lamba title chhote ko contain karta hai (≥20 chars)
    );
    assert.equal(titlesOverlap("IBPS PO 2026", "IBPS PO 2026 Result Out Now"), false); // chhota (<20) → no dup
    assert.equal(titlesOverlap("SSC CGL 2026", "UPSC Civil Services 2026"), false);
    assert.equal(titlesOverlap("", "kuch bhi"), false);
});

test("buildTitleSet + overlapsAny — list ke against duplicate match", () => {
    const set = buildTitleSet(["Bihar Police Constable Result 2026", "IGNOU Date Sheet June 2026"]);
    assert.ok(set.has("biharpoliceconstableresult2026"));
    assert.ok(set.has("ignoudatesheetjune2026"));

    const hit = overlapsAny("Bihar Police Constable Result 2026!", ["Bihar Police Constable Result 2026"]);
    assert.equal(hit.dup, true);
    assert.equal(hit.with, "Bihar Police Constable Result 2026");

    const miss = overlapsAny("SSC CGL Tier 2 Result 2026 Check", ["Bihar Police Constable Result 2026"]);
    assert.equal(miss.dup, false);
});

// ---------------------------------------------------------------------
// 🧹 cleanupSourceDrafts — published twins ke drafts delete
// ---------------------------------------------------------------------
test("cleanupSourceDrafts — fast_track draft + job_drafts twin delete, baaki safe", async () => {
    const db = makeMockDb({
        // published items
        "jobs/job1": { title: "ONGC Graduate Trainee Recruitment 2026", status: "published" },
        "fast_track/live1": { title: "Osmania University BCA 6th Sem Result 2026", status: "published" },
        // stale drafts (published twins)
        "fast_track/draft1": { title: "Osmania University BCA 6th Sem Result 2026", status: "draft" },
        "job_drafts/jd1": { title: "ONGC Graduate Trainee Recruitment 2026", status: "pending" },
        // unrelated drafts — survive karne chahiye
        "fast_track/draft2": { title: "TNDALU UG Result 2026 Declared Check", status: "draft" },
        "job_drafts/jd2": { title: "SSC MTS Havaldar Recruitment 2026 Apply", status: "pending" }
    });
    const report = await cleanupSourceDrafts(db);
    assert.deepEqual(report.errors, []);
    assert.equal(report.removed.length, 2);
    assert.ok(report.removed.includes("fast_track/draft1"));
    assert.ok(report.removed.includes("job_drafts/jd1"));

    const dump = db.dump();
    assert.equal(dump["fast_track/draft1"], undefined);
    assert.equal(dump["job_drafts/jd1"], undefined);
    assert.ok(dump["fast_track/draft2"]); // untouched
    assert.ok(dump["job_drafts/jd2"]);    // untouched
    assert.ok(dump["jobs/job1"]);         // published items kabhi delete nahi hote
    assert.ok(dump["fast_track/live1"]);
});

test("cleanupSourceDrafts — published kuch nahi to kuch delete nahi hota", async () => {
    const db = makeMockDb({
        "fast_track/draftA": { title: "Jammu University UG Result 2026 Check", status: "draft" },
        "job_drafts/dA": { title: "AIIMS NORCET 10 Recruitment 2026 Notice", status: "pending" }
    });
    const report = await cleanupSourceDrafts(db);
    assert.equal(report.removed.length, 0);
    assert.ok(db.dump()["fast_track/draftA"]);
    assert.ok(db.dump()["job_drafts/dA"]);
});

// ---------------------------------------------------------------------
// 🔗 URL pickers
// ---------------------------------------------------------------------
test("isFormPortalUrl — apply-form portals detect", () => {
    assert.equal(isFormPortalUrl("https://cdn.digialm.com/EForms/configuredHtml/xyz.html"), true);
    assert.equal(isFormPortalUrl("https://www.onlineregistrationform.org/abc/"), true);
    assert.equal(isFormPortalUrl("https://ssc.gov.in/portal/latest-notice"), false);
    assert.equal(isFormPortalUrl(""), false);
});

test("pickJobDraftUrl — non-form URL pehle, priority order maintained", () => {
    const url = pickJobDraftUrl({
        sourceUrl: "https://cdn.digialm.com/EForms/x.html", // form portal → skip
        officialLink: "https://www.ongcindia.com/careers/notice",
        applyLink: "https://www.ongcindia.com/apply"
    });
    assert.equal(url, "https://www.ongcindia.com/careers/notice");

    // sirf form portals hon to pehla wala hi do (kuch na hone se better)
    const fallback = pickJobDraftUrl({ applyLink: "https://eforms.gov.in/x" });
    assert.equal(fallback, "https://eforms.gov.in/x");

    assert.equal(pickJobDraftUrl({}), "");
});

// ---------------------------------------------------------------------
// 🎯 pickAutoDraftCandidates
// ---------------------------------------------------------------------
test("pickAutoDraftCandidates — published twin cleanup + fresh candidates chune", async () => {
    const db = makeMockDb({
        // published
        "jobs/p1": { title: "SPMCIL Deputy Manager Recruitment 2026", status: "published" },
        "fast_track/ftlive": { title: "UP TGT Result 2026 Declared Official", status: "published" },
        // job_drafts: ek published-twin (delete hoga), ek fresh (candidate)
        "job_drafts/d1": { title: "SPMCIL Deputy Manager Recruitment 2026", status: "pending", sourceUrl: "https://spmcil.com/notice" },
        "job_drafts/d2": { title: "HPSC Assistant Professor Recruitment 2026", status: "pending", sourceUrl: "https://hpsc.gov.in/notice" },
        "job_drafts/d3": { title: "Already Drafted Job Recruitment 2026", status: "pending", aiDrafted: true }, // skip
        "job_drafts/d4": { title: "Chhota", status: "pending" }, // <10 chars → skip
        "job_drafts/d5": { title: "Failed Many Times Recruitment 2026", status: "pending", aiDraftTries: MAX_TRIES }, // skip
        // fast_track drafts: ek published-twin (delete), ek fresh (candidate)
        "fast_track/ftd1": { title: "UP TGT Result 2026 Declared Official", status: "draft" },
        "fast_track/ftd2": { title: "Kerala University PG Result 2026 Out", status: "draft", directLink: "https://university.edu/result" }
    });
    const report = await pickAutoDraftCandidates(db, { limit: 5 });
    assert.deepEqual(report.errors, []);

    // twins cleaned
    assert.ok(report.cleaned.includes("job_drafts/d1"));
    assert.ok(report.cleaned.includes("fast_track/ftd1"));

    // fresh candidates (d2 job + ftd2 fast-track)
    assert.equal(report.candidates.length, 2);
    const jobCand = report.candidates.find(c => c.collection === "job_drafts");
    const ftCand = report.candidates.find(c => c.collection === "fast_track");
    assert.equal(jobCand.type, "job");
    assert.equal(jobCand.sourceUrl, "https://hpsc.gov.in/notice");
    assert.equal(ftCand.type, "fast-track");
    assert.equal(ftCand.sourceUrl, "https://university.edu/result");

    const dump = db.dump();
    assert.equal(dump["job_drafts/d1"], undefined);   // twin deleted
    assert.equal(dump["fast_track/ftd1"], undefined); // twin deleted
    assert.ok(dump["job_drafts/d2"]);                 // candidate abhi queue me hai
});

test("pickAutoDraftCandidates — limit respect karta hai", async () => {
    const db = makeMockDb({
        "job_drafts/a": { title: "First Sarkari Recruitment 2026", status: "pending" },
        "job_drafts/b": { title: "Second Sarkari Recruitment 2026", status: "pending" },
        "fast_track/c": { title: "Third University Result 2026 Declared", status: "draft" }
    });
    const report = await pickAutoDraftCandidates(db, { limit: 1 });
    assert.equal(report.candidates.length, 1);
    assert.equal(report.candidates[0].id, "a");
});

// ---------------------------------------------------------------------
// 🧠 processCandidate / runAutoDrafts (mocked deps)
// ---------------------------------------------------------------------
function makeDeps(overrides = {}) {
    const calls = { notified: [], generated: [] };
    const deps = {
        fetchAndExtractSource: async () => ({ url: "https://official.gov/notice", text: "official text" }),
        searchAndFetchSource: async () => ({ url: "https://found.gov/page", text: "searched text" }),
        collectExistingContent: async () => ["existing content"],
        runGeneratePipeline: async (input) => {
            calls.generated.push(input);
            return { title: `${input.type.toUpperCase()} Article Draft`, type: input.type, articleHtml: "<p>x</p>", reviewReport: { verdict: "PASS" } };
        },
        cleanType: (t) => t,
        DRAFT_COLLECTION: "ai_article_drafts",
        notifyDraft: async (http, creds, draft, id, opts) => { calls.notified.push({ draft, id, opts }); },
        creds: { token: "T", chatId: "C" },
        withButtons: true,
        limit: 2,
        ...overrides
    };
    return { deps, calls };
}

const freshCandidate = {
    collection: "job_drafts",
    id: "cand1",
    type: "job",
    title: "HPSC Assistant Professor Recruitment 2026",
    organization: "HPSC",
    category: "Teaching",
    sourceUrl: "https://hpsc.gov.in/notice"
};

test("processCandidate — direct fetch se draft banta hai, origin mark + telegram", async () => {
    const db = makeMockDb({ "job_drafts/cand1": { title: freshCandidate.title, status: "pending" } });
    const { deps, calls } = makeDeps();

    const result = await processCandidate(db, FieldValue, freshCandidate, deps);
    assert.equal(result.resolvedVia, "direct");
    assert.ok(result.draftId);

    const dump = db.dump();
    const draft = dump[`ai_article_drafts/${result.draftId}`];
    assert.ok(draft);
    assert.equal(draft.autoDraft, true);
    assert.equal(draft.autoResolvedVia, "direct");
    assert.deepEqual(draft.originRef, { collection: "job_drafts", id: "cand1" });
    // origin pe aiDrafted mark
    assert.equal(dump["job_drafts/cand1"].aiDrafted, true);
    assert.equal(dump["job_drafts/cand1"].aiDraftId, result.draftId);
    // telegram card gaya
    assert.equal(calls.notified.length, 1);
    assert.equal(calls.notified[0].opts.label, "🌅 AUTO DRAFT READY");
    assert.equal(calls.notified[0].opts.withButtons, true);
    // pipeline auto mode me chala (publish KABHI nahi)
    assert.equal(calls.generated[0].mode, "auto");
});

test("processCandidate — direct fail ho to search fallback chalta hai", async () => {
    const db = makeMockDb({ "job_drafts/cand1": { title: freshCandidate.title, status: "pending" } });
    let searchUsed = false;
    const { deps } = makeDeps({
        fetchAndExtractSource: async () => { const e = new Error("blocked"); e.code = "FETCH_ERR"; throw e; },
        searchAndFetchSource: async () => { searchUsed = true; return { url: "https://found.gov/x", text: "t" }; }
    });
    const result = await processCandidate(db, FieldValue, freshCandidate, deps);
    assert.equal(searchUsed, true);
    assert.equal(result.resolvedVia, "search");
});

test("runAutoDrafts — dono source fail → aiDraftTries badhta hai, skipped report", async () => {
    const db = makeMockDb({
        "job_drafts/cand1": { title: freshCandidate.title, status: "pending", sourceUrl: "https://hpsc.gov.in/notice" }
    });
    const { deps } = makeDeps({
        fetchAndExtractSource: async () => { throw new Error("direct down"); },
        searchAndFetchSource: async () => { throw new Error("search bhi fail"); }
    });
    const report = await runAutoDrafts(db, FieldValue, deps);
    assert.equal(report.created.length, 0);
    assert.equal(report.skipped.length, 1);
    assert.ok(report.skipped[0].includes("search bhi fail"));
    // tries counter badha
    assert.equal(db.dump()["job_drafts/cand1"].aiDraftTries, 1);
});

test("runAutoDrafts — published twins ko pehle saaf karta hai, phir draft banata hai", async () => {
    const db = makeMockDb({
        "jobs/p1": { title: "Bihar Police Constable Result 2026 Declared", status: "published" },
        "job_drafts/twin": { title: "Bihar Police Constable Result 2026 Declared", status: "pending" },
        "job_drafts/fresh": { title: "Coal India MT Recruitment 2026 Apply", status: "pending" }
    });
    const { deps } = makeDeps();
    const report = await runAutoDrafts(db, FieldValue, deps);
    assert.ok(report.cleaned.includes("job_drafts/twin"));
    assert.equal(db.dump()["job_drafts/twin"], undefined);
    assert.equal(report.created.length, 1); // sirf fresh se
});

// ---------------------------------------------------------------------
// 🔁 RETRY MACHINE — jab tak ready for publish na ho
// ---------------------------------------------------------------------
test("lastTryTooRecent — 10 min ke andar true, purana false, missing false", () => {
    assert.equal(lastTryTooRecent({ aiDraftLastTryAt: new Date().toISOString() }), true);
    assert.equal(lastTryTooRecent({ aiDraftLastTryAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() }), true);
    assert.equal(lastTryTooRecent({ aiDraftLastTryAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() }), false);
    assert.equal(lastTryTooRecent({}), false);
    // Firestore timestamp shape bhi
    assert.equal(lastTryTooRecent({ aiDraftLastTryAt: { seconds: Math.floor(Date.now() / 1000) } }), true);
});

test("pickAutoDraftCandidates — abhi-abhi try hua item skip (10 min cooldown)", async () => {
    const db = makeMockDb({
        "job_drafts/hot": { title: "Just Tried Recruitment 2026 Apply Now", status: "pending", aiDraftLastTryAt: new Date().toISOString() },
        "job_drafts/cold": { title: "Tried Long Ago Recruitment 2026 Exam", status: "pending", aiDraftLastTryAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), aiDraftTries: 1 }
    });
    const report = await pickAutoDraftCandidates(db, { limit: 5 });
    assert.equal(report.candidates.length, 1);
    assert.equal(report.candidates[0].id, "cold");
});

// 🔧 Repair helpers
const failedDraft = () => ({
    type: "JOB",
    articleType: "job",
    status: "draft",
    reviewStatus: "failed",
    publishBlocked: true,
    title: "Failed Draft Article Title Here",
    sourceUrl: "https://official.gov/notice",
    sourceSnapshot: { text: "snapshot source text body", url: "https://official.gov/notice" },
    reviewReport: { verdict: "fail", issues: ["word-count-low:120"] },
    version: 1
});

test("pickRepairCandidates — ready/published/cooldown/maxy-tries skip, failed pick hota hai", async () => {
    const db = makeMockDb({
        "ai_article_drafts/ready": { ...failedDraft(), reviewStatus: "passed", publishBlocked: false },
        "ai_article_drafts/pub": { ...failedDraft(), status: "published" },
        "ai_article_drafts/hot": { ...failedDraft(), aiDraftLastTryAt: new Date().toISOString() },
        "ai_article_drafts/maxy": { ...failedDraft(), autoRepairTries: REPAIR_MAX_TRIES },
        "ai_article_drafts/nosrc": { ...failedDraft(), sourceUrl: "", sourceSnapshot: null },
        "ai_article_drafts/fixme": { ...failedDraft(), aiDraftLastTryAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() }
    });
    const { deps } = makeDeps();
    const report = await pickRepairCandidates(db, deps, { limit: 3 });
    assert.deepEqual(report.errors, []);
    assert.equal(report.repairs.length, 1);
    assert.equal(report.repairs[0].id, "fixme");
});

test("pickRepairCandidates — FATAL issues wale drafts retry queue me NAHI aate", async () => {
    const db = makeMockDb({
        "ai_article_drafts/dup": {
            ...failedDraft(),
            reviewReport: { verdict: "fail", issues: ["duplicate:title:\"Purani bharti\""] },
            aiDraftLastTryAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
        },
        "ai_article_drafts/expired": {
            ...failedDraft(),
            reviewReport: { verdict: "fail", issues: ["freshness:expired:\"01/01/2020\" — purani"] },
            aiDraftLastTryAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
        },
        "ai_article_drafts/fixable": {
            ...failedDraft(),
            reviewReport: { verdict: "fail", issues: ["word-count-low:1400 (<1600)"] },
            aiDraftLastTryAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
        }
    });
    const { deps } = makeDeps();
    const report = await pickRepairCandidates(db, deps, { limit: 5 });
    assert.deepEqual(report.repairs.map((d) => d.id), ["fixable"],
        "sirf writer-fixable issue wala draft retry hoga — duplicate/expired pe quota waste nahi");
});

test("processRepair — regenerate karke update; PASS ho to telegram card", async () => {
    const db = makeMockDb({ "ai_article_drafts/fixme": failedDraft() });
    const { deps, calls } = makeDeps({
        runGeneratePipeline: async (input) => {
            calls.generated.push(input);
            return {
                title: "Repaired Article Title",
                type: "JOB",
                articleType: "job",
                reviewStatus: "passed",
                reviewReport: { verdict: "pass", issues: [] },
                articleHtml: "<p>fixed</p>"
            };
        }
    });
    const snap = await db.collection("ai_article_drafts").doc("fixme").get();
    const docSnap = { id: "fixme", data: () => snap.data() };
    const result = await processRepair(db, FieldValue, docSnap, deps);

    assert.equal(result.ready, true);
    const updated = db.dump()["ai_article_drafts/fixme"];
    assert.equal(updated.reviewStatus, "passed");
    assert.equal(updated.autoRepaired, true);
    assert.equal(updated.autoRepairTries, 1);
    assert.equal(updated.version, 2);
    // feedback issues writer tak gaye (death-loop ka ilaaj)
    assert.deepEqual(calls.generated[0].feedbackIssues, ["word-count-low:120"]);
    // ready card gaya
    assert.equal(calls.notified.length, 1);
    assert.equal(calls.notified[0].opts.label, "🔧 AUTO-REPAIR READY");
});

test("processRepair — refetch fail ho to snapshot source se chale (koi telegram nahi jab tak PASS na ho)", async () => {
    const db = makeMockDb({ "ai_article_drafts/fixme": failedDraft() });
    const { deps, calls } = makeDeps({
        fetchAndExtractSource: async () => { throw new Error("blocked"); },
        runGeneratePipeline: async () => ({
            title: "Still Broken",
            type: "JOB",
            reviewStatus: "failed",
            reviewReport: { verdict: "fail", issues: ["seo:missing-title"] }
        })
    });
    const snap = await db.collection("ai_article_drafts").doc("fixme").get();
    const docSnap = { id: "fixme", data: () => snap.data() };
    const result = await processRepair(db, FieldValue, docSnap, deps);
    assert.equal(result.resolvedVia, "snapshot");
    assert.equal(result.ready, false);
    assert.equal(calls.notified.length, 0); // PASS nahi — koi card nahi
});

test("runAutoDrafts — REPAIR pehle chalti hai, phir fresh creations", async () => {
    const db = makeMockDb({
        "ai_article_drafts/fixme": { ...failedDraft(), aiDraftLastTryAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
        "job_drafts/fresh": { title: "Fresh Rail Apprentice Recruitment 2026", status: "pending" }
    });
    const { deps } = makeDeps({
        runGeneratePipeline: async () => ({
            title: "Repaired And Ready",
            type: "JOB",
            reviewStatus: "passed",
            reviewReport: { verdict: "pass", issues: [] }
        })
    });
    const report = await runAutoDrafts(db, FieldValue, deps);
    assert.equal(report.repaired.length, 1);
    assert.ok(report.repaired[0].includes("READY"));
    assert.deepEqual(report.ready, ["fixme"]);
});
