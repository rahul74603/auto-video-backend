// quick_add.cjs — incremental SEO ke pure-fn unit tests + offline E2E (dry-run).
// Live network/Firestore bilkul nahi — fixtures + --docs file se poora patch path.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const QA = require("../../seo_static/quick_add.cjs");
const QUICK_ADD = path.resolve(__dirname, "../../seo_static/quick_add.cjs");

test("parseArgs: 5 types valid, galat type/args pe throw", () => {
  for (const t of ["blog", "job", "update", "story", "test"]) {
    assert.equal(QA.parseArgs(["node", "x", "--type", t]).type, t);
  }
  assert.throws(() => QA.parseArgs(["node", "x", "--type", "nope"]), /--type ek/);
  assert.throws(() => QA.parseArgs(["node", "x"]), /--type ek/);
  assert.throws(() => QA.parseArgs(["node", "x", "--type", "blog", "--dry-run"]), /--fixtures/);
  assert.throws(() => QA.parseArgs(["node", "x", "--type", "blog", "--wat"]), /Unknown arg/);
  assert.equal(QA.parseArgs(["node", "x", "--type", "blog", "--limit", "999"]).limit, 100);
});

test("extractLocs + extractUrlBlocks: loc-filtered blocks", () => {
  const xml = `<urlset><url><loc>https://studygyaan.in/update/a</loc><lastmod>x</lastmod></url><url><loc>https://studygyaan.in/update/b</loc></url></urlset>`;
  assert.deepEqual(QA.extractLocs(xml), ["https://studygyaan.in/update/a", "https://studygyaan.in/update/b"]);
  const blocks = QA.extractUrlBlocks(xml, ["https://studygyaan.in/update/b"]);
  assert.equal(blocks.length, 1);
  assert.match(blocks[0], /update\/b/);
});

test("computeSitemapPatch: missing judta hai, maujood untouched, no-op stable", () => {
  const live = `<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://studygyaan.in/update/old</loc>\n  </url>\n</urlset>`;
  const built = `<urlset>\n  <url>\n    <loc>https://studygyaan.in/update/old</loc>\n  </url>\n  <url>\n    <loc>https://studygyaan.in/update/new</loc>\n    <lastmod>2026-10-26</lastmod>\n  </url>\n</urlset>`;
  const r = QA.computeSitemapPatch(live, built);
  assert.deepEqual(r.added, ["https://studygyaan.in/update/new"]);
  assert.match(r.patched, /update\/new/);
  assert.match(r.patched, /update\/old/);
  // idempotent: dobara patch = no-op
  const r2 = QA.computeSitemapPatch(r.patched, built);
  assert.deepEqual(r2.added, []);
  assert.equal(r2.patched, r.patched);
});

test("computeSitemapPatch: tooti live file pe blind patch NAHI (throw)", () => {
  assert.throws(() => QA.computeSitemapPatch("<garbage", "<urlset></urlset>"), /<\/urlset>/);
});

test("validateUrlset: balanced ok, unbalanced/missing-loc pe throw", () => {
  assert.equal(QA.validateUrlset("<urlset><url><loc>a</loc></url></urlset>", ["a"]), true);
  assert.throws(() => QA.validateUrlset("<urlset><url><loc>a</loc></urlset>", []), /unbalanced/);
  assert.throws(() => QA.validateUrlset("<urlset></urlset>", ["zzz"]), /gayab/);
});

test("computeJsonPatch: missing keys merge, existing untouched, corrupt pe throw", () => {
  const live = JSON.stringify({ "/update/old": { t: "Old" } });
  const r = QA.computeJsonPatch(live, { "/update/old": { t: "CHANGED" }, "/update/new": { t: "New" } });
  assert.deepEqual(r.added, ["/update/new"]);
  const back = JSON.parse(r.patched);
  assert.equal(back["/update/old"].t, "Old"); // overwrite nahi
  assert.equal(back["/update/new"].t, "New");
  const r2 = QA.computeJsonPatch(r.patched, { "/update/new": { t: "New" } });
  assert.deepEqual(r2.added, []);
  assert.throws(() => QA.computeJsonPatch("{oops", {}), /parse fail/);
});

test("computeNavPatch: newest-first unshift + dedupe + cap", () => {
  const live = JSON.stringify({ updates: [{ u: "/update/old", t: "Old" }] });
  const r = QA.computeNavPatch(live, "updates", [{ u: "/update/n1", t: "N1" }, { u: "/update/n2", t: "N2" }], 12);
  assert.deepEqual(r.added, ["/update/n1", "/update/n2"]);
  const arr = JSON.parse(r.patched).updates;
  assert.deepEqual(arr.map((x) => x.u), ["/update/n1", "/update/n2", "/update/old"]);
  // dedupe + cap
  const r2 = QA.computeNavPatch(r.patched, "updates", [{ u: "/update/n1", t: "N1" }], 2);
  assert.deepEqual(r2.added, []);
  assert.equal(JSON.parse(r2.patched).updates.length, 3); // cap sirf insert pe
});

test("computeRecentPatch: append + dedupe", () => {
  const r = QA.computeRecentPatch("https://studygyaan.in/update/old", ["https://studygyaan.in/update/old", "https://studygyaan.in/update/new"]);
  assert.deepEqual(r.added, ["https://studygyaan.in/update/new"]);
  assert.match(r.patched, /update\/new/);
});

test("computeRssPatch: missing items + no-op + tooti-file throw", () => {
  const live = `<rss><channel><item><link>https://studygyaan.in/blog/old</link></item></channel></rss>`;
  const built = `<rss><channel><item><link>https://studygyaan.in/blog/old</link></item><item><link>https://studygyaan.in/blog/new</link></item></channel></rss>`;
  const r = QA.computeRssPatch(live, built);
  assert.deepEqual(r.added, ["https://studygyaan.in/blog/new"]);
  assert.deepEqual(QA.computeRssPatch(r.patched, built).added, []);
  assert.throws(() => QA.computeRssPatch("<nope", built), /<\/channel>/);
});

test("escHtml + stripLone: PHP-mirror + surrogate-safe", () => {
  assert.equal(QA.escHtml(`a&b<c>"d'e`), "a&amp;b&lt;c&gt;&quot;d&#039;e");
  assert.equal(QA.stripLone("ok\ud83d"), "ok"); // lone high surrogate hata
  assert.equal(QA.stripLone("🎉x").length, 3); // paired emoji safe
});

// ---------- E2E (dry-run, poora CLI incl. asli builders) ----------

function writeFixtures(dir, kind) {
  // kind: "update" (news/rss-nahi) — minimal live files
  fs.writeFileSync(path.join(dir, "sitemap-updates.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://studygyaan.in/update/old-one</loc>\n    <lastmod>2026-10-20T00:00:00.000Z</lastmod>\n  </url>\n</urlset>`);
  fs.writeFileSync(path.join(dir, "sitemap-news.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>`);
  fs.writeFileSync(path.join(dir, "seo-meta-updates.json"), JSON.stringify({ "/update/old-one": { t: "Old", d: "d", img: "i", type: "article", content: "c", ld: [] } }));
  fs.writeFileSync(path.join(dir, "seo-nav.json"), JSON.stringify({ updates: [{ u: "/update/old-one", t: "Old" }] }));
  fs.writeFileSync(path.join(dir, "recent-urls.txt"), "https://studygyaan.in/update/old-one");
}

function freshDoc(hoursAgo, extra = {}) {
  return {
    id: "andhra-test-" + hoursAgo + "h",
    data: {
      slug: "andhra-test-" + hoursAgo + "h",
      title: "Andhra Test Result 2026 & Merit <List>",
      status: "published",
      category: "Result",
      description: "<p>Result declared. Check online.</p>",
      createdAt: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString(),
      ...extra,
    },
  };
}

function runQuickAdd(fxDir, outDir, docsPath, type = "update") {
  return spawnSync("node", [QUICK_ADD, "--type", type, "--dry-run", "--fixtures", fxDir, "--out", outDir, "--docs", docsPath],
    { encoding: "utf8", timeout: 120000 });
}

test("E2E dry-run: fresh update → sitemap+news+meta+nav+recent sab me judta hai", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "qa-e2e-"));
  const fx = path.join(base, "fx"); const out = path.join(base, "out");
  fs.mkdirSync(fx, { recursive: true });
  writeFixtures(fx);
  const docsPath = path.join(base, "docs.json");
  fs.writeFileSync(docsPath, JSON.stringify([freshDoc(2)])); // 2 ghante purana = news-eligible

  const r = runQuickAdd(fx, out, docsPath);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /DRY-RUN: 5 patched files/);

  const sm = fs.readFileSync(path.join(out, "sitemap-updates.xml"), "utf8");
  assert.match(sm, /andhra-test-2h/);
  assert.match(sm, /update\/old-one/); // purana barkarar
  const news = fs.readFileSync(path.join(out, "sitemap-news.xml"), "utf8");
  assert.match(news, /andhra-test-2h/); // 2-day window → news me bhi
  assert.match(news, /news:publication_date/);
  const meta = JSON.parse(fs.readFileSync(path.join(out, "seo-meta-updates.json"), "utf8"));
  assert.ok(meta["/update/andhra-test-2h"], "meta key maujood");
  assert.match(meta["/update/andhra-test-2h"].t, /Andhra Test/);
  assert.ok(meta["/update/old-one"], "purani meta key barkarar");
  const nav = JSON.parse(fs.readFileSync(path.join(out, "seo-nav.json"), "utf8"));
  assert.equal(nav.updates[0].u, "/update/andhra-test-2h"); // newest sabse upar
  const recent = fs.readFileSync(path.join(out, "recent-urls.txt"), "utf8");
  assert.match(recent, /andhra-test-2h/);
});

test("E2E dry-run: purana doc (5 din) → sitemap YES, news NO + draft → kahin nahi", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "qa-e2e2-"));
  const fx = path.join(base, "fx"); const out = path.join(base, "out");
  fs.mkdirSync(fx, { recursive: true });
  writeFixtures(fx);
  const docsPath = path.join(base, "docs.json");
  fs.writeFileSync(docsPath, JSON.stringify([freshDoc(120), freshDoc(1, { status: "draft", slug: "draft-doc", id: "draft-doc" })]));

  const r = runQuickAdd(fx, out, docsPath);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const sm = fs.readFileSync(path.join(out, "sitemap-updates.xml"), "utf8");
  assert.match(sm, /andhra-test-120h/);
  assert.doesNotMatch(sm, /draft-doc/);
  // news file tabhi banta hai jab kuch add ho — purana+DRAFT = news me kuch nahi
  if (fs.existsSync(path.join(out, "sitemap-news.xml"))) {
    const news = fs.readFileSync(path.join(out, "sitemap-news.xml"), "utf8");
    assert.doesNotMatch(news, /andhra-test-120h/);
    assert.doesNotMatch(news, /draft-doc/);
  }
  const meta = JSON.parse(fs.readFileSync(path.join(out, "seo-meta-updates.json"), "utf8"));
  assert.ok(meta["/update/andhra-test-120h"]);
  assert.ok(!meta["/update/draft-doc"], "draft meta me nahi");
});

test("E2E dry-run: idempotent — dusri run no-op", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "qa-e2e3-"));
  const fx = path.join(base, "fx"); const out = path.join(base, "out"); const out2 = path.join(base, "out2");
  fs.mkdirSync(fx, { recursive: true });
  writeFixtures(fx);
  const docsPath = path.join(base, "docs.json");
  fs.writeFileSync(docsPath, JSON.stringify([freshDoc(3)]));
  const r1 = runQuickAdd(fx, out, docsPath);
  assert.equal(r1.status, 0, `stderr: ${r1.stderr}`);
  // out ko hi fixtures banao → sab live hai → no-op
  const r2 = runQuickAdd(out, out2, docsPath);
  assert.equal(r2.status, 0, `stderr: ${r2.stderr}`);
  assert.match(r2.stdout, /no-op/);
});
