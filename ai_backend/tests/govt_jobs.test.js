const test = require("node:test");
const assert = require("node:assert");

// govt_jobs.js ka per-feed transform — offline fixtures, koi network/Firestore nahi.
// REGRESSION: parsePublishedAt/isRecentPublication/MAX_AGE missing the → har feed
// "X is not defined" se marta tha, 0 jobs saved. Ye test crash-site ko cover karta hai.

test("normalizeFeedItems: only explicit-year feed dates within 10 days survive", () => {
  const { normalizeFeedItems } = require("../govt_jobs");
  const now = Date.parse("2026-11-01T12:00:00Z");
  const date = (days) => new Date(now - days * 86400000).toISOString();
  const raw = [
    { title: "Fresh Job", link: "https://x.in/fresh", isoDate: date(0) },
    { title: "Exactly Ten Days", link: "https://x.in/ten", pubDate: date(10) },
    { title: "Eleven Days Old", link: "https://x.in/old", pubDate: date(11) },
    { title: "Last Year Same Date", link: "https://x.in/oldyear", pubDate: "2025-11-01T12:00:00Z" },
    { title: "No Explicit Year", link: "https://x.in/noyear", pubDate: "Nov 1" },
    { title: "No Date", link: "https://x.in/nodate" },
    { title: "Future", link: "https://x.in/future", isoDate: new Date(now + 86400000).toISOString() },
    { title: "No Link", isoDate: date(0) },
    { title: "Localhost", link: "http://127.0.0.1/x", isoDate: date(0) },
  ];
  const out = normalizeFeedItems(raw, "TestSrc", 12, now);
  assert.deepEqual(out.map((it) => it.title), ["Fresh Job", "Exactly Ten Days"]);
  assert.equal(out[0].source, "TestSrc");
  assert.ok(out[0].publishedAt > 0);
  assert.equal(out[1].link, "https://x.in/ten");
});

test("normalizeFeedItems: perSource slice + khali input safe", () => {
  const { normalizeFeedItems } = require("../govt_jobs");
  const now = new Date().toISOString();
  const raw = [1, 2, 3].map((i) => ({ title: `J${i}`, link: `https://x.in/${i}`, isoDate: now }));
  assert.equal(normalizeFeedItems(raw, "S", 2).length, 2);
  assert.deepEqual(normalizeFeedItems(null, "S"), []);
  assert.deepEqual(normalizeFeedItems([], "S"), []);
});


test("public job links reject FreeJobAlert and descriptions have a factual fallback", () => {
  const { sanitizeOfficialLink, verifiedDate, extractLabeledDate, buildJobDescription } = require("../govt_jobs");
  assert.equal(sanitizeOfficialLink("https://www.freejobalert.com/ssc-cgl"), "");
  assert.equal(sanitizeOfficialLink("https://example.org/apply"), "https://example.org/apply");
  assert.equal(sanitizeOfficialLink("not-a-url"), "");
  assert.equal(verifiedDate("18 October"), "");
  assert.equal(verifiedDate("18 October 2026"), "18 October 2026");
  assert.equal(
    extractLabeledDate("Application Start Date: 01/11/2026; Last Date: 30/11/2026", "last\\s*date"),
    "30/11/2026",
  );
  assert.equal(extractLabeledDate("Last Date: 30 November", "last\\s*date"), "");
  const description = buildJobDescription("SSC CGL Recruitment", {
    vacancies: "12",
    qualification: "Graduation",
    lastDate: "18 October 2026",
  });
  assert.match(description, /SSC CGL Recruitment/);
  assert.match(description, /12/);
  assert.match(description, /18 October 2026/);
});
