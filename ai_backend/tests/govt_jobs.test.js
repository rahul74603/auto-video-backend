const test = require("node:test");
const assert = require("node:assert");

// govt_jobs.js ka per-feed transform — offline fixtures, koi network/Firestore nahi.
// REGRESSION: parsePublishedAt/isRecentPublication/MAX_AGE missing the → har feed
// "X is not defined" se marta tha, 0 jobs saved. Ye test crash-site ko cover karta hai.

test("normalizeFeedItems: fresh rakhta, purana/no-link/localhost chhant-ta hai", () => {
  const { normalizeFeedItems } = require("../govt_jobs");
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
  const lastYear = new Date(now);
  lastYear.setFullYear(now.getFullYear() - 1);

  const raw = [
    { title: "Fresh Job", link: "https://x.in/fresh", isoDate: now.toISOString() },
    { title: "Old Job", link: "https://x.in/old", pubDate: daysAgo(15) },
    { title: "Last Year Same Date", link: "https://x.in/oldyear", pubDate: lastYear.toISOString() },
    { title: "No Link", isoDate: now.toISOString() },
    { title: "Localhost", link: "http://127.0.0.1/x", isoDate: now.toISOString() },
    { title: "Guid Link", guid: "https://x.in/guid", publishedAt: now.toISOString() },
    { title: "Dateless", link: "https://x.in/nodate" },
  ];
  const out = normalizeFeedItems(raw, "TestSrc", 12);
  const titles = out.map((it) => it.title);
  assert.deepEqual(titles, ["Fresh Job", "Guid Link", "Dateless"]);
  assert.equal(out[0].source, "TestSrc");
  assert.ok(out[0].publishedAt > 0);
  assert.equal(out[1].link, "https://x.in/guid");
  assert.equal(out[2].publishedAt, 0); // dateless aaj bhi pass (existing leniency)
});

test("normalizeFeedItems: perSource slice + khali input safe", () => {
  const { normalizeFeedItems } = require("../govt_jobs");
  const now = new Date().toISOString();
  const raw = [1, 2, 3].map((i) => ({ title: `J${i}`, link: `https://x.in/${i}`, isoDate: now }));
  assert.equal(normalizeFeedItems(raw, "S", 2).length, 2);
  assert.deepEqual(normalizeFeedItems(null, "S"), []);
  assert.deepEqual(normalizeFeedItems([], "S"), []);
});
