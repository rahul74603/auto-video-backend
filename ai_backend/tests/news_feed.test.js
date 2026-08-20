"use strict";

// ---------------------------------------------------------------------
// RSS feed (newsFeed.js) — URL canonicalness + resilience tests
//
// The feed is served at /feed (/feed.xml rewrite → rssFeed function) and
// every <link>/<guid> must point at a route that actually exists in the
// frontend router (src/App.tsx). These tests lock that contract.
// ---------------------------------------------------------------------

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

/* ------------------------------ stubs ------------------------------ */

// Fake Firestore: collection(name).orderBy(...).limit(...).get()
const docsByName = {};

function makeQuery(name) {
    return {
        orderBy: () => makeQuery(name),
        limit:   () => makeQuery(name),
        get: async () => ({
            forEach(cb) {
                (docsByName[name] || []).forEach(doc => cb({
                    id: doc.id,
                    data: () => doc
                }));
            }
        })
    };
}

const fakeDb = {
    collection: (name) => makeQuery(name)
};

const fakeAdmin = {
    apps: { length: 0 },
    initializeApp: () => ({}),
    credential: { cert: () => ({}) },
    firestore: () => fakeDb
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "firebase-admin") return fakeAdmin;
    if (request === "dotenv") return { config: () => ({}) };
    if (request === "@google/generative-ai") return { GoogleGenerativeAI: class {} };
    return origLoad.apply(this, arguments);
};

const newsFeed = require("../newsFeed");
const { COLLECTION_CONFIG, buildRssItem } = newsFeed._internals;

/* ------------------------------ helpers ---------------------------- */

function makeRes() {
    const res = {
        headers: {},
        statusCode: 0,
        body: "",
        set(k, v) { this.headers[k] = v; return this; },
        status(c) { this.statusCode = c; return this; },
        send(b) { this.body = b; return this; }
    };
    return res;
}

function linksIn(xml) {
    return [...xml.matchAll(/<link>(.*?)<\/link>/g)].map(m => m[1]);
}

/* ------------------------- route contract -------------------------- */

test("COLLECTION_CONFIG uses only frontend-valid detail routes", () => {
    const valid = new Set(["job", "update", "blog", "test", "material"]);
    for (const config of COLLECTION_CONFIG) {
        assert.ok(valid.has(config.route),
            `${config.name}: route "${config.route}" does not exist in src/App.tsx`);
    }
});

test("COLLECTION_CONFIG has no dead legacy routes", () => {
    const routes = COLLECTION_CONFIG.map(c => c.route).join(",");
    for (const dead of ["result", "admit-card", "answer-key", "free-study-material", "jobs", "mock-tests", "fast-track"]) {
        assert.ok(!routes.includes(dead), `dead route still configured: ${dead}`);
    }
});

test("legacy result/admit-card/answer-key collections are gone (site serves them via fast_track)", () => {
    const names = COLLECTION_CONFIG.map(c => c.name);
    for (const gone of ["results", "admit_cards", "answer_keys"]) {
        assert.ok(!names.includes(gone), `${gone} should not feed the RSS — it is a fast_track category`);
    }
    assert.ok(names.includes("fast_track"), "fast_track must stay (categories render at /update/:id)");
});

test("study_materials requires id-only URLs (MaterialDetails has no slug lookup)", () => {
    const cfg = COLLECTION_CONFIG.find(c => c.name === "study_materials");
    assert.equal(cfg.route, "material");
    assert.equal(cfg.useIdOnly, true);
});

/* ------------------------- item URL building ----------------------- */

test("buildRssItem: jobs use /job/<slug>", () => {
    const xml = buildRssItem({
        id: "doc-1", slug: "ssc-cgl-2026",
        title: "SSC CGL 2026", _route: "job", _useIdOnly: false,
        _label: "Sarkari Naukri", _timeField: new Date().toISOString()
    });
    assert.match(xml, /<link>https:\/\/studygyaan\.in\/job\/ssc-cgl-2026<\/link>/);
});

test("buildRssItem: fast_track updates use /update/<id> when no slug", () => {
    const xml = buildRssItem({
        id: "upd-9", title: "UPSC Result", _route: "update", _useIdOnly: false,
        _label: "Fast Track", _timeField: new Date().toISOString()
    });
    assert.match(xml, /<link>https:\/\/studygyaan\.in\/update\/upd-9<\/link>/);
});

test("buildRssItem: study materials ignore slug and use doc id (/material/<id>)", () => {
    const xml = buildRssItem({
        id: "mat-42", slug: "physics-notes-pdf",
        title: "Physics Notes", _route: "material", _useIdOnly: true,
        _label: "Study Material", _timeField: new Date().toISOString()
    });
    assert.match(xml, /<link>https:\/\/studygyaan\.in\/material\/mat-42<\/link>/);
    assert.ok(!xml.includes("/material/physics-notes-pdf"), "slug must never be used for study materials");
});

test("buildRssItem: no dead /jobs/, /mock-tests/, /fast-track/ or /free-study-material/ URLs", () => {
    const xml = buildRssItem({
        id: "x-1", slug: "any",
        title: "X", _route: "job", _useIdOnly: false,
        _label: "X", _timeField: new Date().toISOString()
    });
    for (const dead of ["/jobs/", "/mock-tests/", "/fast-track/", "/free-study-material/", "/result/", "/admit-card/", "/answer-key/"]) {
        assert.ok(!xml.includes(dead), `dead pattern leaked into item: ${dead}`);
    }
});

/* -------------------------- full feed run --------------------------- */

test("rssFeed serves 200 with canonical URLs and /feed self-link", async () => {
    docsByName.jobs = [
        { id: "job-1", slug: "job-1-slug", title: "Railway Vacancy", status: "published", createdAt: new Date("2026-08-18") }
    ];
    docsByName.fast_track = [
        { id: "upd-1", title: "SSC Result Out", status: "published", createdAt: new Date("2026-08-19") }
    ];
    docsByName.study_materials = [
        { id: "mat-1", slug: "notes-1", title: "GK Notes", status: "published", createdAt: new Date("2026-08-17") }
    ];
    docsByName.blogs = [];
    docsByName.mock_tests = [
        { id: "mt-1", slug: "mt-1-slug", title: "GK Test", status: "draft", createdAt: new Date("2026-08-16") }
    ];

    const res = makeRes();
    await newsFeed.rssFeed({ headers: { "user-agent": "googlebot" }, query: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.match(res.headers["Content-Type"], /application\/rss\+xml/);

    const links = linksIn(res.body);
    assert.ok(links.includes("https://studygyaan.in/job/job-1-slug"), "job link missing: " + links.join(" "));
    assert.ok(links.includes("https://studygyaan.in/update/upd-1"), "update link missing");
    assert.ok(links.includes("https://studygyaan.in/material/mat-1"), "material id link missing");
    assert.ok(!links.includes("https://studygyaan.in/material/notes-1"), "material slug link must not exist");
    assert.ok(!links.some(l => l.includes("/test/mt-1")), "draft mock test must be excluded");

    assert.ok(res.body.includes('href="https://studygyaan.in/feed"'), "atom:link self-reference must be /feed");
    assert.ok(!res.body.includes('href="https://studygyaan.in/rss"'), "atom:link must not point at dead /rss");
});

test("rssFeed survives a malformed document without 500", async () => {
    docsByName.jobs = [
        {
            id: "evil-1",
            title: "Evil Doc",
            status: "published",
            createdAt: new Date("2026-08-18"),
            author: {
                toString() { throw new Error("boom — hostile author field"); }
            }
        },
        { id: "good-1", slug: "good-1-slug", title: "Good Doc", status: "published", createdAt: new Date("2026-08-18") }
    ];
    docsByName.fast_track = [];
    docsByName.study_materials = [];
    docsByName.blogs = [];
    docsByName.mock_tests = [];

    const res = makeRes();
    await newsFeed.rssFeed({ headers: { "user-agent": "curl" }, query: {} }, res);

    assert.equal(res.statusCode, 200, "feed must not 500 because of one bad document");
    assert.ok(res.body.includes("/job/good-1-slug"), "healthy item must still be present");
});

test("rssFeed serves 200 even when every collection is empty", async () => {
    for (const key of Object.keys(docsByName)) docsByName[key] = [];
    const res = makeRes();
    await newsFeed.rssFeed({ headers: { "user-agent": "curl" }, query: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes("<channel>"));
});
