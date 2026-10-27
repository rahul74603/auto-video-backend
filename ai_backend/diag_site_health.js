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

// 🔍 GSC "Test live URL" wala UA — Google jo dekhta hai wahi dekho.
// (Googlebot-UA-green + InspectionTool-red = UA-specific cache-bucket ka proof!)
const INSPECTION_UA =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)";

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

function logForensics(r, tag) {
  try {
    const hdrs = (r && r.headers) || { get: () => null };
    const pick = (h) => (hdrs.get ? hdrs.get(h) : null) || "-";
    console.log(`   ↳ cache-forensics[${tag}]: cache-control=${pick("cache-control")} | age=${pick("age")} | cf=${pick("cf-cache-status")} | litespeed=${pick("litespeed-cache")} | litespeed=${pick("x-litespeed-cache")} | x-cache=${pick("x-cache")} | lastmod=${pick("last-modified")}`);
  } catch (_) { /* headers na mile to skip */ }
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
 *  Pipeline (seo-daily/quick-add) hamesha --slim; manual diag full.
 *  --urls a,b = PROBE mode: sirf ye URLs (Googlebot+InspectionTool dono UA),
 *  sec-1/2/3/5 skip. Forms: `--urls /a,/b`, `--urls=/a,/b`, space/comma mix. */
function parseArgs(argv = []) {
  const args = argv || [];
  const out = { slim: args.includes("--slim"), urls: null };
  const vals = [];
  for (let i = 0; i < args.length; i++) {
    const t = String(args[i]);
    if (t === "--urls" || t.startsWith("--urls=")) {
      if (t.startsWith("--urls=")) vals.push(t.slice("--urls=".length));
      for (let j = i + 1; j < args.length && !String(args[j]).startsWith("--"); j++) vals.push(String(args[j]));
      break;
    }
  }
  const joined = vals.join(",").trim();
  if (joined) out.urls = joined.split(",").map((x) => x.trim()).filter(Boolean);
  return out;
}

/** probe URL resolve: relative path → SITE-prefixed; full http(s) → as-is. */
function resolveProbeUrl(u) {
  const t = String(u || "").trim();
  if (/^https?:\/\//i.test(t)) return t;
  return SITE + (t.startsWith("/") ? t : "/" + t);
}

async function main() {
  console.log("🩺 STUDYGYAAN SITE-HEALTH DIAG — " + new Date().toISOString());
  const { slim, urls: urlsArg } = parseArgs(process.argv);
  if (slim) console.log("⚡ SLIM MODE — HTTP-only verify (0 Firestore reads, Spark-safe)");
  const probeOnly = Array.isArray(urlsArg) && urlsArg.length > 0;
  if (probeOnly) console.log(`🎯 PROBE MODE — ${urlsArg.length} custom URLs (sec-1/2/3/5 skip, sirf bot+insp check)`);
  const db = slim ? null : initDb();

  // ---- 1. Firestore counts ----
  if (!probeOnly) console.log("\n========== 1. FIRESTORE ==========");
  const cols = ["blogs", "jobs", "fast_track", "mock_tests", "web_stories", "courses", "study_materials"];
  const stats = {};
  for (const c of (slim || probeOnly ? [] : cols)) { // slim/probe: Firestore skip
    try {
      stats[c] = await collectionStats(db, c);
      console.log(`📌 ${c}: total=${stats[c].total} published-ish=${stats[c].publishedSlugs.length} status=${JSON.stringify(stats[c].byStatus)}`);
    } catch (e) {
      console.log(`📌 ${c}: READ FAIL — ${e.message}`);
      stats[c] = { total: -1, byStatus: {}, publishedSlugs: [] };
    }
  }

  // ---- 2. Live sitemaps ----
  if (!probeOnly) console.log("\n========== 2. LIVE SITEMAPS ==========");
  if (!probeOnly) {
    const index = await fetchText(`${SITE}/sitemap.xml`, { ua: "diag-site-health" });
    const indexRoot = detectSitemapRoot(index.text);
    console.log(`sitemap.xml → HTTP ${index.status}, ${index.text.length} bytes, ROOT=${indexRoot}${indexRoot !== "INDEX" ? " ⚠️ INDEX hona chahiye tha!" : ""}`);
    const mapsInIndex = extractLocs(index.text).filter((u) => u.includes("sitemap-"));
    console.log(`maps in index: ${mapsInIndex.length}`);
  }
  // Maps ko DIRECT fetch karo (toote index ke bawjood diff sahi aaye)
  const KNOWN_MAPS = ["main", "blogs", "jobs", "tests", "stories", "updates", "courses", "materials"]
    .map((n) => `${SITE}/sitemap-${n}.xml`);
  const mapData = {};
  for (const m of (probeOnly ? [] : KNOWN_MAPS)) { // probe: sitemap fetch skip
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
  if (!probeOnly) console.log("\n========== 3. FIRESTORE↔SITEMAP DIFF ==========");
  const checks = [
    ["blogs", `${SITE}/sitemap-blogs.xml`, `${SITE}/blog`],
    ["jobs", `${SITE}/sitemap-jobs.xml`, `${SITE}/job`],
    ["fast_track", `${SITE}/sitemap-updates.xml`, `${SITE}/update`],
  ];
  for (const [col, mapUrl, base] of (slim || probeOnly ? [] : checks)) { // slim/probe: Firestore skip
    const missing = findMissingSlugs(stats[col].publishedSlugs, mapData[mapUrl] || [], base);
    console.log(`${col}: published=${stats[col].publishedSlugs.length}, in-sitemap=${(mapData[mapUrl] || []).length}, MISSING=${missing.length}${missing.length ? " → " + missing.slice(0, 10).join(", ") : ""}`);
  }

  // ---- 4. Bot-view (Googlebot UA) ----
  console.log("\n========== 4. BOT-VIEW (Googlebot UA) ==========");
  const botUrls = probeOnly
    ? urlsArg.map(resolveProbeUrl)
    : [
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
  let inspOk = 0;
  let inspFail = 0;
  const mismatch = [];
  const botGap = [];
  for (const u of botUrls) {
    try {
      const r = await fetchText(u);
      const title = extractTitle(r.text);
      const ok = r.status === 200 && title.length > 0;
      if (ok) botOk++;
      else { botFail++; botGap.push(`${r.status} ${u.replace(SITE, "")}`); }
      console.log(`${ok ? "✅" : "❌"} ${r.status} ${u.replace(SITE, "")} — "${title.slice(0, 90)}"${r.text.length < 2000 ? ` [THIN:${r.text.length}b]` : ""}`);
      // 🔬 Cache-layer forensics: 404 LIVE hai ya LiteSpeed/Cloudflare se cached?
      if (!ok) logForensics(r, "gb");
      // 🔍 InspectionTool UA se bhi fetch — mismatch = UA-specific cache/proxy ka proof
      try {
        const ri = await fetchText(u, { ua: INSPECTION_UA });
        const ititle = extractTitle(ri.text);
        const iok = ri.status === 200 && ititle.length > 0;
        if (iok) { inspOk++; }
        else {
          inspFail++;
          botGap.push(`INSP-${ri.status} ${u.replace(SITE, "")}`);
          console.log(`   ❌ INSP-${ri.status} ${u.replace(SITE, "")} (Googlebot=${r.status}) — "${ititle.slice(0, 60)}"`);
          logForensics(ri, "insp");
          if (ok) mismatch.push(`${u.replace(SITE, "")} (Googlebot-200, INSP-${ri.status})`);
        }
      } catch (e) {
        inspFail++;
        botGap.push(`INSP-FETCH-FAIL ${u.replace(SITE, "")}`);
        console.log(`   ❌ INSP-FETCH-FAIL ${u.replace(SITE, "")} — ${e.message}`);
        if (ok) mismatch.push(`${u.replace(SITE, "")} (Googlebot-200, INSP-FETCH-FAIL)`);
      }
    } catch (e) {
      botFail++;
      botGap.push(`FETCH-FAIL ${u.replace(SITE, "")}`);
      console.log(`❌ FETCH-FAIL ${u.replace(SITE, "")} — ${e.message}`);
    }
  }
  console.log(`bot-view: OK=${botOk} FAIL=${botFail} | insp-view: OK=${inspOk} FAIL=${inspFail}`);
  if (mismatch.length) {
    console.log(`⚠️ UA-MISMATCH (Googlebot-200 par InspectionTool-fail — cache-bucket suspect):\n   - ${mismatch.join("\n   - ")}`);
  }
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
  if (!probeOnly) console.log("\n========== 5. ROBOTS + MISC ==========");
  for (const u of (probeOnly ? [] : [`${SITE}/robots.txt`, `${SITE}/9629c8c41fa94b898f83a53ecd320743.txt`])) {
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
  const failed = botFail > 0 || inspFail > 0;
  console.log(failed
    ? "\n🔴 " + (probeOnly ? "PROBE" : "DIAG") + " RESULT: FAIL — bot-view me " + botFail + " + insp-view me " + inspFail + " URL toot rahe hain (upar BOT-JSON GAP + cache-forensics dekho)."
    : (probeOnly ? `\n🟢 PROBE RESULT: PASS — ${botUrls.length} URLs, Googlebot+InspectionTool dono green.`
      : "\n🟢 DIAG RESULT: PASS — sitemap ↔ bot-view sab green."));
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

module.exports = { extractTitle, extractLocs, countBackslashUrls, newestLastmod, findMissingSlugs, detectSitemapRoot, parseArgs, resolveProbeUrl };
