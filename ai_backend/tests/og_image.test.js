"use strict";

/**
 * og_image.js — OG image builder ke PURE unit tests.
 * (sharp native render test nahi hota — sirf SVG/text/url logic check.)
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildOgImageUrl,
    buildOgSvg,
    wrapTitle,
    devanagariToLatin,
    themeFor,
    OG_WIDTH,
    OG_HEIGHT
} = require("../og_image");

// ---------------------------------------------------------------------
// 🔤 Devanagari transliteration (OG fonts me Hindi glyphs nahi hote)
// ---------------------------------------------------------------------
test("devanagariToLatin — plain Latin text untouched (fast path)", () => {
    assert.equal(devanagariToLatin("SSC CGL 2026 Result"), "SSC CGL 2026 Result");
    assert.equal(devanagariToLatin(""), "");
});

test("devanagariToLatin — Devanagari words transliterate ho jaate hain", () => {
    assert.equal(devanagariToLatin("घोषित"), "ghoshit");
    assert.equal(devanagariToLatin("रिजल्ट"), "rijalt");
    assert.equal(devanagariToLatin("परीक्षा"), "pareekshaa");
    assert.equal(devanagariToLatin("भर्ती २०२६"), "bhartee 2026");
});

test("devanagariToLatin — mixed Hinglish sentence stable", () => {
    const out = devanagariToLatin("Result घोषित — 28 जुलाई 2026");
    assert.ok(!/[\u0900-\u097F]/.test(out), "koi Devanagari char nahi bachna chahiye");
    assert.ok(out.includes("2026"));
});

// ---------------------------------------------------------------------
// 📝 wrapTitle
// ---------------------------------------------------------------------
test("wrapTitle — word boundary pe wrap, max 3 lines", () => {
    const lines = wrapTitle("ONGC Graduate Trainee Recruitment 2026 Apply Online Now Official Notification", 30, 3);
    assert.ok(lines.length <= 3);
    assert.ok(lines.every(line => line.length <= 31)); // 30 + ellipsis margin
    assert.ok(lines.join(" ").includes("ONGC"));
});

test("wrapTitle — lamba title ellipsis ke saath kat-ta hai", () => {
    const long = "A ".repeat(80).trim();
    const lines = wrapTitle(long, 30, 3);
    assert.ok(lines[lines.length - 1].endsWith("…"));
    assert.ok(lines.length <= 3);
});

test("wrapTitle — Hindi title bhi transliterate hokar wrap hota hai", () => {
    const lines = wrapTitle("ओस्मानिया विश्वविद्यालय बीसीए छठी सेमेस्टर परिणाम घोषित", 30, 3);
    assert.ok(lines.length >= 1);
    assert.ok(!/[\u0900-\u097F]/.test(lines.join(" ")));
});

// ---------------------------------------------------------------------
// 🔗 buildOgImageUrl
// ---------------------------------------------------------------------
test("buildOgImageUrl — function URL + safe params", () => {
    const url = buildOgImageUrl("job", "ongc-graduate-trainee-2026");
    assert.equal(url, "https://us-central1-studymaterial-406ad.cloudfunctions.net/jobOgImage?c=job&s=ongc-graduate-trainee-2026");
});

test("buildOgImageUrl — spaces/special chars encoded, unknown type → job", () => {
    const url = buildOgImageUrl("weird<>type", "hello world");
    assert.ok(url.startsWith("https://us-central1-studymaterial-406ad.cloudfunctions.net/jobOgImage?c=job&s="));
    assert.ok(url.includes("hello%20world"));
});

// ---------------------------------------------------------------------
// 🎨 buildOgSvg
// ---------------------------------------------------------------------
test("buildOgSvg — valid svg dimensions + escaped content + brand strip", () => {
    const svg = buildOgSvg({
        canonicalType: "job",
        title: "SSC <CGL> & \"CHSL\" Recruitment 2026",
        subtitle: "Staff Selection Commission"
    });
    assert.ok(svg.includes(`width="${OG_WIDTH}"`));
    assert.ok(svg.includes(`height="${OG_HEIGHT}"`));
    assert.ok(!svg.includes("<CGL>"), "raw HTML inject nahi hona chahiye");
    assert.ok(svg.includes("&lt;CGL&gt;"));
    assert.ok(svg.includes("&amp;"));
    assert.ok(svg.includes("StudyGyaan.in"));
    assert.ok(svg.includes("SARKARI NAUKRI"));
});

test("buildOgSvg — har type ka alag theme + title lines render hote hain", () => {
    const job = buildOgSvg({ canonicalType: "job", title: "Railway NTPC 2026 Apply", subtitle: "RRB" });
    const update = buildOgSvg({ canonicalType: "update", title: "Bihar Board Result Out 2026", subtitle: "BSEB" });
    const blog = buildOgSvg({ canonicalType: "blog", title: "MPPEB Group 2 Guide", subtitle: "Study" });
    assert.notEqual(job, update);
    assert.ok(update.includes("FAST UPDATE"));
    assert.ok(blog.includes("STUDY BLOG"));
    assert.ok(themeFor("job").badge !== themeFor("blog").badge);
    // unknown type → default theme (crash nahi)
    const generic = buildOgSvg({ canonicalType: "unknown", title: "X 2026", subtitle: "Y" });
    assert.ok(generic.includes("STUDYGYAAN.IN"));
});

test("buildOgSvg — khaali title pe fallback text aata hai", () => {
    const svg = buildOgSvg({ canonicalType: "update", title: "", subtitle: "" });
    assert.ok(svg.includes("Result"));
});
