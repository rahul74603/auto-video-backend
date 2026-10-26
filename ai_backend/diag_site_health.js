"use strict";

/**
 * diag_site_health.js — 🩺 READ-ONLY site health report (manual diag workflow)
 * ============================================================================
 * GitHub Actions se chalao (diag_site_health.yml → Run workflow). Ye script
 * SIRF padhta hai, kuch likhta/badalta NAHI:
 *
 *  1. Firestore: har collection me total + status-wise counts (+ published slugs)
 *  2. Live sitemaps: HTTP status, URL count, backslash-URL check, newest lastmod
 *  3. Diff: Firestore published slugs vs sitemap URLs (missing = sitemap gap)
 *  4. Bot-view: Googlebot UA se key URLs fetch → status + <title>
 *     (meta.php/cPanel bot-stack end-to-end verify, bina cPanel login ke)
 *  5. Freshness: sitemap files ki Last-Modified (FTP upload fresh hai ya stale?)
 *  6. robots.txt + IndexNow key reachability
 *
 * Poori report workflow LOG me print hoti hai.
 */

const SITE = "https://studygyaan.in";
const BOT_UA =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

// ---------------- pure helpers (unit-tested) ----------------

function extractTitle(html = "") {
  const m = String(html).match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim().slice(0, 160) : "";
}

function extractLocs(xml = "") {
  const out = [];
  const re = /<loc>([^<]*)<\/loc>/g;
  let m;
  while ((m = re.exec(String(xml))) !== null) out.push(m[1].trim());
  return out;
}

function countBackslashUrls(urls = []) {
  return urls.filter((u) => u.includes("\\")).length;
}

function newestLastmod(xml = "") {
  const re = /<lastmod>([^<]*)<\/lastmod>/g;
  let m;
  let best = "";
  while ((m = re.exec(String(xml))) !== null) {
    if (m[1] > best) best = m[1];
  }
  return best;
}

/** firestore slugs me se wo jo sitemap URLs me NAHI hain */
function findMissingSlugs(slugs = [], sitemapUrls = [], base = "") {
  const set = new Set(sitemapUrls);
  return slugs.filter((s) => !set.has(`${base}/${s}`) && !set.has(`${base}/${s}/`));
}

// ---------------- IO ----------------

function initDb() {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    const raw = process.env.SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("SERVICE_ACCOUNT_JSON missing — workflow secrets check karo");
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.firestore();
}

async function fetchText(url, { ua = BOT_UA, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua }, signal: ctrl.signal });
    const text = await res.text();
    return { status: res.status, text, headers: res.headers };
  } finally {
    clearTimeout(t);
  }
}

function isPublished(data = {}) {
  if (data.noIndex === true || data.deleted === true || data.isDeleted === true) return false;
  const status = String(data.status || "published").trim().toLowerCase();
  return !["draft", "pending", "rejected", "private", "archived", "deleted", "trash"].includes(status);
}

async function collectionStats(db, name) {
  const snap = await db.collection(name).select("status", "title", "post_name", "slug").get();
  const byStatus = {};
  const publishedSlugs = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    const st = String(d.status || "(blank)").toLowerCase();
    byStatus[st] = (byStatus[st] || 0) + 1;
    const title = String(d.title || d.post_name || "").trim();
    if (isPublished(d) && title.length >= 5) publishedSlugs.push(d.slug || doc.id);
  });
  return { total: snap.size, byStatus, publishedSlugs };
}

/** CLI flags: --slim = HTTP-only verify (0 Firestore reads, Spark-safe).
 *  Pipeline (seo-daily/quick-add) hamesha --slim; manual diag full. */
function parseArgs(argv = []) {
  return { slim: (argv || []).includes("--slim") };
}

async function main() {
  console.log("🩺 STUDYGYAAN SITE-HEALTH DIAG — " + new Date().toISOString());
  const { slim } = parseArgs(process.argv);
  if (slim) console.log("⚡ SLIM MODE — HTTP-only verify (0 Firestore reads, Spark-safe)");
  const db = slim ? null : initDb();

  // ---- 1. Firestore counts ----
  console.log("\n========== 1. FIRESTORE ==========");
  const cols = ["blogs", "jobs", "fast_track", "mock_tests", "web_stories", "courses", "study_materials"];
  const stats = {};
  for (const c of (slim ? [] : cols)) { // slim: Firestore skip
    try {
      stats[c] = await collectionStats(db, c);
      console.log(`📌 ${c}: total=${stats[c].total} published-ish=${stats[c].publishedSlugs.length} status=${JSON.stringify(stats[c].byStatus)}`);
    } catch (e) {
      console.log(`📌 ${c}: READ FAIL — ${e.message}`);
      stats[c] = { total: -1, byStatus: {}, publishedSlugs: [] };
    }
  }

  // ---- 2. Live sitemaps ----
  console.log("\n========== 2. LIVE SITEMAPS ==========");
  const index = await fetchText(`${SITE}/sitemap.xml`, { ua: "diag-site-health" });
  const indexRoot = detectSitemapRoot(index.text);
  console.log(`sitemap.xml → HTTP ${index.status}, ${index.text.length} bytes, ROOT=${indexRoot}${indexRoot !== "INDEX" ? " ⚠️ INDEX hona chahiye tha!" : ""}`);
  const mapsInIndex = extractLocs(index.text).filter((u) => u.includes("sitemap-"));
  console.log(`maps in index: ${mapsInIndex.length}`);
  // Maps ko DIRECT fetch karo (toote index ke bawjood diff sahi aaye)
  const KNOWN_MAPS = ["main", "blogs", "jobs", "tests", "stories", "updates", "courses", "materials"]
    .map((n) => `${SITE}/sitemap-${n}.xml`);
  const mapData = {};
  for (const m of KNOWN_MAPS) {
    try {
      const r = await fetchText(m, { ua: "diag-site-health" });
      const locs = extractLocs(r.text);
      const bs = countBackslashUrls(locs);
      mapData[m] = locs;
      console.log(`  ${m.replace(SITE + "/", "")} → HTTP ${r.status}, urls=${locs.length}, backslash=${bs}, newest=${newestLastmod(r.text) || "n/a"}, lastmod-hdr=${r.headers.get("last-modified") || "n/a"}`);
    } catch (e) {
      console.log(`  ${m} → FETCH FAIL — ${e.message}`);
      mapData[m] = [];
    }
  }

  // ---- 3. Diff: Firestore vs sitemap ----
  console.log("\n========== 3. FIRESTORE↔SITEMAP DIFF ==========");
  const checks = [
    ["blogs", `${SITE}/sitemap-blogs.xml`, `${SITE}/blog`],
    ["jobs", `${SITE}/sitemap-jobs.xml`, `${SITE}/job`],
    ["fast_track", `${SITE}/sitemap-updates.xml`, `${SITE}/update`],
  ];
  for (const [col, mapUrl, base] of (slim ? [] : checks)) { // slim: Firestore skip
    const missing = findMissingSlugs(stats[col].publishedSlugs, mapData[mapUrl] || [], base);
    console.log(`${col}: published=${stats[col].publishedSlugs.length}, in-sitemap=${(mapData[mapUrl] || []).length}, MISSING=${missing.length}${missing.length ? " → " + missing.slice(0, 10).join(", ") : ""}`);
  }

  // ---- 4. Bot-view (Googlebot UA) ----
  console.log("\n========== 4. BOT-VIEW (Googlebot UA) ==========");
  const botUrls = [
    `${SITE}/`,
    `${SITE}/blog`,
    `${SITE}/govt-jobs`,
    `${SITE}/exam-calendar`,
    `${SITE}/jobs/railway`,
    `${SITE}/jobs/mp`,
    `${SITE}/test`,
    ...(mapData[`${SITE}/sitemap-blogs.xml`] || []).slice(0, 30),
    ...(mapData[`${SITE}/sitemap-jobs.xml`] || []).slice(0, 5),
    ...(mapData[`${SITE}/sitemap-updates.xml`] || []).slice(0, 10),
    ...(mapData[`${SITE}/sitemap-stories.xml`] || []).slice(0, 5),
    ...(mapData[`${SITE}/sitemap-tests.xml`] || []).slice(0, 5),
  ];
  let botOk = 0;
  let botFail = 0;
  const botGap = [];
  for (const u of botUrls) {
    try {
      const r = await fetchText(u);
      const title = extractTitle(r.text);
      const ok = r.status === 200 && title.length > 0;
      if (ok) botOk++;
      else { botFail++; botGap.push(`${r.status} ${u.replace(SITE, "")}`); }
      console.log(`${ok ? "✅" : "❌"} ${r.status} ${u.replace(SITE, "")} — "${title.slice(0, 90)}"${r.text.length < 2000 ? ` [THIN:${r.text.length}b]` : ""}`);
      if (!ok) {
        // 🔬 Cache-layer forensics: 404 LIVE hai ya LiteSpeed/Cloudflare se cached?
        try {
          const hdrs = r.headers || { get: () => null };
          const pick = (h) => hdrs.get(h) || "-";
          console.log(`   ↳ cache-forensics: cache-control=${pick("cache-control")} | age=${pick("age")} | cf=${pick("cf-cache-status")} | litespeed=${pick("x-litespeed-cache")} | x-cache=${pick("x-cache")} | lastmod=${pick("last-modified")}`);
        } catch (_) { /* headers na mile to skip */ }
      }
    } catch (e) {
      botFail++;
      botGap.push(`FETCH-FAIL ${u.replace(SITE, "")}`);
      console.log(`❌ FETCH-FAIL ${u.replace(SITE, "")} — ${e.message}`);
    }
  }
  console.log(`bot-view: OK=${botOk} FAIL=${botFail}`);
  if (botGap.length) {
    console.log(`⚠️ BOT-JSON GAP (sitemap-me-hai-par-bot-404):\n   - ${botGap.join("\n   - ")}`);
    // 🔬 GAP-URL ka Firestore doc dump — dirty slug (space/slash) vs stale-cache ka faisla
    const GAP_COL = { blog: "blogs", job: "jobs", update: "fast_track", test: "mock_tests", "web-stories": "web_stories", course: "courses", material: "study_materials" };
    for (const g of (slim ? [] : botGap.slice(0, 10))) { // slim: Firestore dump skip
      const m = g.match(/^\S+\s+(\/[a-z-]+\/[^/\s]+)/);
      if (!m) continue;
      const segs = m[1].split("/").filter(Boolean);
      const col = GAP_COL[segs[0]];
      if (!col || !segs[1]) { console.log(`   🔬 ${m[1]} → (non-detail URL, dump skip)`); continue; }
      try {
        const doc = await db.collection(col).doc(segs[1]).get();
        if (!doc.exists) { console.log(`   🔬 ${m[1]} → Firestore ${col}/${segs[1]} NOT-FOUND (slug≠doc-id?)`); continue; }
        const d = doc.data() || {};
        console.log(`   🔬 ${m[1]} → ${JSON.stringify({ id: doc.id, slug: d.slug ?? null, title: String(d.title || "").slice(0, 70), status: d.status ?? null, noIndex: d.noIndex ?? null })}`);
      } catch (e) { console.log(`   🔬 ${m[1]} → dump fail: ${e.message}`); }
    }
  }

  // ---- 5. robots + key ----
  console.log("\n========== 5. ROBOTS + MISC ==========");
  for (const u of [`${SITE}/robots.txt`, `${SITE}/9629c8c41fa94b898f83a53ecd320743.txt`]) {
    try {
      const r = await fetchText(u, { ua: "diag-site-health" });
      console.log(`${r.status === 200 ? "✅" : "❌"} ${r.status} ${u.replace(SITE, "")} (${r.text.length}b)`);
    } catch (e) {
      console.log(`❌ FETCH-FAIL ${u.replace(SITE, "")} — ${e.message}`);
    }
  }

  // 🔴 FAIL-LOUD: sitemap me listed URL bot-404 = contract violation (stale
  // edge-cache ya JSON gap). Green-success ke peeche chhupana BAND — run RED
  // hoga taaki turant dikhe. (Sec-3 MISSING fail nahi — wo lag-window me normal.)
  const failed = botFail > 0;
  console.log(failed
    ? "\n🔴 DIAG RESULT: FAIL — bot-view me " + botFail + " URL toot rahe hain (upar BOT-JSON GAP + cache-forensics dekho)."
    : "\n🟢 DIAG RESULT: PASS — sitemap ↔ bot-view sab green.");
  console.log("🩺 DIAG DONE — ye poora log share karo, dikkat exact line me dikhegi.");
  return !failed;
}

if (require.main === module) {
  main()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error("🩺 DIAG FATAL:", err && err.message);
      process.exit(1);
    });
}

/** sitemap file ka root: INDEX (sahi) ya URLSET (galat jagah) ya UNKNOWN */
function detectSitemapRoot(xml = "") {
  const t = String(xml);
  if (t.includes("<sitemapindex")) return "INDEX";
  if (t.includes("<urlset")) return "URLSET";
  return "UNKNOWN";
}

module.exports = { extractTitle, extractLocs, countBackslashUrls, newestLastmod, findMissingSlugs, detectSitemapRoot, parseArgs };
