#!/usr/bin/env node
/**
 * quick_add.cjs — ⚡ EVENT-DRIVEN INCREMENTAL SEO (Spark-plan safe)
 * ------------------------------------------------------------------
 * Publisher (blog/job/update/story/test) ke baad turant naye URLs ko live
 * SEO files me jodta hai — bina FULL regen (bina 3,300 Firestore reads!).
 * Full seo-daily (subah 6 baje) reconciler bana rehta hai.
 *
 * Kaise kaam karta hai:
 *   1. COLLECT: type ki collection se newest-25 docs (sirf ~25 reads!)
 *   2. BUILD: singleton colls pe wahi builders (buildAll + buildMetaFiles) —
 *      filters/schema 100% full-run jaisi, koi duplication nahi
 *   3. DIFF: live files (FTP-download, origin-truth) se compare — jo loc/key
 *      live me NAHI, wahi "missing". Missing=0 → no-op exit (self-gating!)
 *   4. PATCH + VALIDATE: XML insert (</urlset>/</channel> se pehle), JSON merge,
 *      nav unshift, recent-urls append → validate → FTP upload
 *   5. RACE-RETRY: re-download karke verify (parallel publishers ki lost-update
 *      se bachao) → missing mile to fresh base pe dobara patch + upload
 *   6. VERIFY: naye URLs Googlebot UA se 200 + title check → fail to IndexNow skip
 *   7. INDEXNOW: _urls.json (sirf naye URLs) → existing indexnow.cjs daily
 *
 * Usage:
 *   node quick_add.cjs --type update
 *   node quick_add.cjs --type blog --limit 25
 *   node quick_add.cjs --type job --dry-run --fixtures ./t/f --out ./t/o --docs ./t/docs.json
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (ya SERVICE_ACCOUNT_JSON),
 *      FTP_SERVER, FTP_USERNAME, FTP_PASSWORD, FTP_SERVER_DIR
 * Exit: 0 = ok/no-op, 1 = failure (loud), 2 = usage error
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");

const TYPES = {
  blog:   { coll: "blogs",       collsKey: "blogs",       sitemap: "sitemap-blogs.xml",   meta: "seo-meta-pages.json",   urlBase: "/blog",        navKey: null,      navCap: 0,  rss: true },
  job:    { coll: "jobs",        collsKey: "jobs",        sitemap: "sitemap-jobs.xml",    meta: "seo-meta-jobs.json",    urlBase: "/job",         navKey: "jobs",    navCap: 20, rss: false },
  update: { coll: "fast_track",  collsKey: "fast_track",  sitemap: "sitemap-updates.xml", meta: "seo-meta-updates.json", urlBase: "/update",      navKey: "updates", navCap: 12, rss: false },
  story:  { coll: "web_stories", collsKey: "web_stories", sitemap: "sitemap-stories.xml", meta: "seo-meta-stories.json", urlBase: "/web-stories", navKey: "stories", navCap: 12, rss: true },
  test:   { coll: "mock_tests",  collsKey: "mock_tests",  sitemap: "sitemap-tests.xml",   meta: "seo-meta-pages.json",   urlBase: "/test",        navKey: "tests",   navCap: 20, rss: false },
};

const NEWS_FILE = "sitemap-news.xml";
const NAV_FILE = "seo-nav.json";
const RECENT_FILE = "recent-urls.txt";
const RSS_FILES = ["rss.xml", "feed.xml"];

const BOT_UA =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

// ---------- pure helpers (unit-tested) ----------

function parseArgs(argv) {
  const a = { type: null, limit: 25, dryRun: false, fixtures: null, out: null, docs: null };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--type") a.type = argv[++i] || null;
    else if (t === "--limit") a.limit = Math.max(1, Math.min(100, Number(argv[++i]) || 25));
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "--fixtures") a.fixtures = argv[++i] || null;
    else if (t === "--out") a.out = argv[++i] || null;
    else if (t === "--docs") a.docs = argv[++i] || null;
    else throw new Error(`Unknown arg: ${t}`);
  }
  if (!a.type || !TYPES[a.type]) {
    throw new Error(`--type ek ye hona chahiye: ${Object.keys(TYPES).join("|")}`);
  }
  if (a.dryRun && (!a.fixtures || !a.out)) {
    throw new Error("--dry-run ke saath --fixtures DIR aur --out DIR zaroori");
  }
  return a;
}

/** sitemap XML se saare <loc> nikalo */
function extractLocs(xml) {
  const out = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(String(xml || "")))) out.push(m[1].trim());
  return out;
}

/** XML se <url>...</url> blocks (loc-filtered) */
function extractUrlBlocks(xml, locs) {
  const want = new Set(locs);
  const out = [];
  const re = /<url>([\s\S]*?)<\/url>/g;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const block = m[0];
    const lm = block.match(/<loc>([^<]+)<\/loc>/);
    if (lm && want.has(lm[1].trim())) out.push(block);
  }
  return out;
}

/** RSS se <item>...</item> blocks (link-filtered) */
function extractRssItems(rss, urls) {
  const want = new Set(urls);
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(String(rss || "")))) {
    const block = m[0];
    const lm = block.match(/<(?:link|guid)[^>]*>([^<]+)</);
    if (lm && want.has(lm[1].trim())) out.push(block);
  }
  return out;
}

/** live sitemap me missing blocks jodo (insert before </urlset>) */
function computeSitemapPatch(liveXml, builtXml) {
  const live = String(liveXml || "");
  const closeIdx = live.lastIndexOf("</urlset>");
  if (closeIdx < 0) throw new Error("live sitemap me </urlset> nahi — blind patch nahi hoga");
  const liveLocs = new Set(extractLocs(live));
  const builtLocs = extractLocs(builtXml);
  const missing = builtLocs.filter((l) => !liveLocs.has(l));
  if (!missing.length) return { patched: live, added: [] };
  const blocks = extractUrlBlocks(builtXml, missing);
  const patched = live.slice(0, closeIdx) + blocks.map((b) => `  ${b}\n`).join("") + live.slice(closeIdx);
  validateUrlset(patched, missing);
  return { patched, added: missing };
}

/** balanced <url> tags + markers + naye locs maujood */
function validateUrlset(xml, mustHaveLocs = []) {
  const t = String(xml);
  if (!t.includes("<urlset") || !t.includes("</urlset>")) throw new Error("urlset markers missing");
  const open = (t.match(/<url>/g) || []).length;
  const close = (t.match(/<\/url>/g) || []).length;
  if (open !== close) throw new Error(`unbalanced <url> tags: ${open} vs ${close}`);
  for (const l of mustHaveLocs) {
    if (!t.includes(`<loc>${l}</loc>`)) throw new Error(`patched XML me loc gayab: ${l}`);
  }
  return true;
}

/** live RSS me missing items jodo (insert before </channel>) */
function computeRssPatch(liveRss, builtRss) {
  const live = String(liveRss || "");
  const closeIdx = live.lastIndexOf("</channel>");
  if (closeIdx < 0) throw new Error("live RSS me </channel> nahi — blind patch nahi hoga");
  const liveLinks = new Set();
  const re = /<(?:link|guid)[^>]*>([^<]+)</g;
  let m;
  while ((m = re.exec(live))) liveLinks.add(m[1].trim());
  const builtLinks = [];
  const re2 = /<item>([\s\S]*?)<\/item>/g;
  let m2;
  while ((m2 = re2.exec(String(builtRss || "")))) {
    const lm = m2[0].match(/<(?:link|guid)[^>]*>([^<]+)</);
    if (lm) builtLinks.push(lm[1].trim());
  }
  const missing = builtLinks.filter((u) => !liveLinks.has(u));
  if (!missing.length) return { patched: live, added: [] };
  const items = extractRssItems(builtRss, missing);
  const patched = live.slice(0, closeIdx) + items.map((b) => `  ${b}\n`).join("") + live.slice(closeIdx);
  const o = (patched.match(/<item>/g) || []).length;
  const c = (patched.match(/<\/item>/g) || []).length;
  if (o !== c) throw new Error(`unbalanced <item> tags: ${o} vs ${c}`);
  return { patched, added: missing };
}

/** live meta-JSON me missing keys merge (existing untouched) */
function computeJsonPatch(liveJson, builtObj) {
  let live;
  try {
    live = JSON.parse(String(liveJson || "{}"));
  } catch (e) {
    throw new Error(`live JSON parse fail — blind patch nahi hoga: ${e.message}`);
  }
  if (!live || typeof live !== "object" || Array.isArray(live)) {
    throw new Error("live JSON object nahi hai");
  }
  const added = [];
  for (const [k, v] of Object.entries(builtObj || {})) {
    if (!(k in live)) {
      live[k] = v;
      added.push(k);
    }
  }
  if (!added.length) return { patched: String(liveJson), added };
  return { patched: JSON.stringify(live), added };
}

/** nav me naye {u,t} unshift (dedupe + cap) — newest-first order */
function computeNavPatch(liveNavJson, navKey, entries, cap) {
  let nav;
  try {
    nav = JSON.parse(String(liveNavJson || "{}"));
  } catch (e) {
    throw new Error(`live nav JSON parse fail: ${e.message}`);
  }
  if (!nav || typeof nav !== "object") throw new Error("live nav object nahi hai");
  const arr = Array.isArray(nav[navKey]) ? nav[navKey] : [];
  const have = new Set(arr.map((x) => x && x.u));
  const added = [];
  // entries newest-first aate hain → reverse karke unshift taaki order newest-first rahe
  for (const e of [...entries].reverse()) {
    if (!e || !e.u || have.has(e.u)) continue;
    arr.unshift({ u: e.u, t: e.t || e.u });
    have.add(e.u);
    added.unshift(e.u); // newest-first
  }
  nav[navKey] = arr.slice(0, cap);
  if (!added.length) return { patched: String(liveNavJson), added };
  return { patched: JSON.stringify(nav), added };
}

/** recent-urls.txt me missing lines append */
function computeRecentPatch(liveTxt, locs) {
  const lines = String(liveTxt || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const have = new Set(lines);
  const added = [];
  for (const l of locs) {
    if (!have.has(l)) {
      lines.push(l);
      have.add(l);
      added.push(l);
    }
  }
  if (!added.length) return { patched: String(liveTxt), added };
  return { patched: lines.join("\n"), added };
}

/** PHP htmlspecialchars(ENT_QUOTES) mirror (bot-verify title match ke liye) */
function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** lone surrogates hatao (truncation-split emoji se false-mismatch nahi) */
function stripLone(s) {
  return String(s || "").replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    ""
  );
}

// ---------- IO ----------

function initDb() {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT/SERVICE_ACCOUNT_JSON missing");
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.firestore();
}

async function collectNew(db, coll, limit) {
  const snap = await db.collection(coll).orderBy("createdAt", "desc").limit(limit).get();
  const out = [];
  snap.forEach((doc) => out.push({ id: doc.id, data: doc.data() || {} }));
  return out;
}

function ftpEnv() {
  const { FTP_SERVER, FTP_USERNAME, FTP_PASSWORD, FTP_SERVER_DIR } = process.env;
  if (!FTP_SERVER || !FTP_USERNAME || !FTP_PASSWORD || !FTP_SERVER_DIR) {
    throw new Error("FTP_SERVER/FTP_USERNAME/FTP_PASSWORD/FTP_SERVER_DIR env missing");
  }
  const dir = String(FTP_SERVER_DIR).replace(/^\/+|\/+$/g, "");
  return { server: FTP_SERVER, user: FTP_USERNAME, pass: FTP_PASSWORD, dir };
}

function ftpDownload(file, dest) {
  const { server, user, pass, dir } = ftpEnv();
  execFileSync(
    "curl",
    ["-sS", "--fail", "--connect-timeout", "20", "--max-time", "180",
      "--retry", "3", "--retry-delay", "15", "--retry-connrefused",
      "--user", `${user}:${pass}`, `ftp://${server}/${dir}/${file}`, "-o", dest],
    { stdio: "pipe" }
  );
  return fs.readFileSync(dest, "utf8");
}

function ftpUpload(local, file) {
  const { server, user, pass, dir } = ftpEnv();
  execFileSync(
    "curl",
    ["-sS", "--fail", "--connect-timeout", "20", "--max-time", "180",
      "--retry", "3", "--retry-delay", "15", "--retry-connrefused",
      "--user", `${user}:${pass}`, "-T", local, `ftp://${server}/${dir}/${file}`],
    { stdio: "pipe" }
  );
}

async function botVerify(loc, title) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(loc, { headers: { "User-Agent": BOT_UA }, signal: ctrl.signal });
    const body = await res.text();
    if (res.status !== 200) return { ok: false, why: `HTTP ${res.status}` };
    if (body.includes("404 - Page Not Found")) return { ok: false, why: "404-marker in body" };
    const needle = escHtml(stripLone(title).slice(0, 40));
    if (needle.trim().length >= 5 && !body.includes(needle)) {
      return { ok: false, why: "title-match fail" };
    }
    return { ok: true };
  } finally {
    clearTimeout(t);
  }
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv);
  const cfg = TYPES[args.type];
  console.log(`⚡ QUICK-ADD [${args.type}] — incremental SEO (Spark-safe)`);

  // 1. COLLECT (Firestore ~25 reads, ya --docs file)
  let docs;
  if (args.docs) {
    docs = JSON.parse(fs.readFileSync(args.docs, "utf8"));
    console.log(`   📥 docs file: ${docs.length} docs (--docs, Firestore skip)`);
  } else {
    const db = initDb();
    docs = await collectNew(db, cfg.coll, args.limit);
    console.log(`   📥 Firestore ${cfg.coll}: newest-${docs.length} collected (~${docs.length} reads)`);
    if (docs.length >= args.limit) {
      console.log("   ⚠️ collect-limit hit — backlog ho to subah-6 full-run cover karega");
    }
  }
  if (!docs.length) {
    console.log("ℹ️ Koi doc nahi — no-op exit 0.");
    return;
  }

  // 2. BUILD (singleton colls — wahi builders, wahi filters)
  const { buildAll } = require("./generate.cjs");
  const { buildMetaFiles } = require("./seo_meta.cjs");
  const colls = { blogs: [], jobs: [], fast_track: [], mock_tests: [], web_stories: [], courses: [], study_materials: [], studyMaterials: [] };
  colls[cfg.collsKey] = docs;
  const files = buildAll(colls, {});
  Object.assign(files, buildMetaFiles(colls, { ogMap: {} }));

  // 3. BASE FILES (FTP origin-truth, ya fixtures)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quickadd-"));
  const base = {};
  const need = [cfg.sitemap, NEWS_FILE, cfg.meta, RECENT_FILE];
  if (cfg.navKey) need.push(NAV_FILE);
  if (cfg.rss) need.push(...RSS_FILES);
  for (const f of need) {
    try {
      base[f] = args.dryRun
        ? fs.readFileSync(path.join(args.fixtures, f), "utf8")
        : ftpDownload(f, path.join(tmp, f.replace(/\//g, "_")));
    } catch (e) {
      if (args.dryRun) {
        console.log(`   ⏭️ fixture missing, skip: ${f}`);
        base[f] = null;
      } else {
        throw new Error(`base file download fail (${f}): ${e.message}`);
      }
    }
  }

  // 4. PATCH (diff = self-gating)
  const patched = {};
  let totalAdded = 0;
  const patchOne = (name, fn) => {
    if (base[name] == null) return [];
    const r = fn();
    if (r.added.length) {
      patched[name] = r.patched;
      totalAdded += r.added.length;
      console.log(`   ➕ ${name}: +${r.added.length} (${r.added.slice(0, 3).join(", ")}${r.added.length > 3 ? "…" : ""})`);
    }
    return r.added;
  };

  const sitemapLocs = patchOne(cfg.sitemap, () => computeSitemapPatch(base[cfg.sitemap], files[cfg.sitemap]));
  const newsLocs = patchOne(NEWS_FILE, () => computeSitemapPatch(base[NEWS_FILE], files[NEWS_FILE]));
  const metaKeys = patchOne(cfg.meta, () => computeJsonPatch(base[cfg.meta], JSON.parse(files[cfg.meta])));
  let navAdded = [];
  if (cfg.navKey) {
    // meta keys me se sirf is type ke detail-paths (redirect-alias nahi)
    const detailKeys = Object.keys(JSON.parse(files[cfg.meta])).filter(
      (k) => k.startsWith(cfg.urlBase + "/") && !JSON.parse(files[cfg.meta])[k].redirect
    );
    const builtMeta = JSON.parse(files[cfg.meta]);
    const entries = detailKeys.map((k) => ({ u: k, t: (builtMeta[k] && builtMeta[k].t) || k }));
    navAdded = patchOne(NAV_FILE, () => computeNavPatch(base[NAV_FILE], cfg.navKey, entries, cfg.navCap));
  }
  const allLocs = [...new Set([...sitemapLocs, ...newsLocs])];
  patchOne(RECENT_FILE, () => computeRecentPatch(base[RECENT_FILE], allLocs));
  if (cfg.rss) {
    for (const rf of RSS_FILES) {
      patchOne(rf, () => computeRssPatch(base[rf], files[rf]));
    }
  }

  if (!totalAdded) {
    console.log("ℹ️ Sab kuch pehle se live hai — no-op exit 0 (koi FTP/IndexNow nahi).");
    return;
  }

  if (args.dryRun) {
    fs.mkdirSync(args.out, { recursive: true });
    for (const [name, content] of Object.entries(patched)) {
      fs.writeFileSync(path.join(args.out, name), content, "utf8");
    }
    console.log(`🧪 DRY-RUN: ${Object.keys(patched).length} patched files → ${args.out} (upload/verify/indexnow skip)`);
    return;
  }

  // 5. UPLOAD + RACE-RETRY (parallel publishers ki lost-update se bachao)
  const changedFiles = Object.keys(patched);
  const uploadAll = () => {
    for (const name of changedFiles) {
      const local = path.join(tmp, "up_" + name.replace(/\//g, "_"));
      fs.writeFileSync(local, patched[name], "utf8");
      ftpUpload(local, name);
    }
  };
  const verifyLive = () => {
    // re-download + naye locs/keys maujood?
    const missing = [];
    for (const name of changedFiles) {
      const fresh = ftpDownload(name, path.join(tmp, "vf_" + name.replace(/\//g, "_")));
      base[name] = fresh; // retry ke liye fresh base
      const probes = name === cfg.meta ? metaKeys
        : name === NAV_FILE ? navAdded
        : name === RECENT_FILE ? allLocs
        : name === cfg.sitemap ? sitemapLocs
        : name === NEWS_FILE ? newsLocs
        : allLocs; // rss
      for (const p of probes) {
        if (!fresh.includes(p)) missing.push(`${name} :: ${p}`);
      }
    }
    return missing;
  };
  uploadAll();
  console.log(`   📤 uploaded: ${changedFiles.join(", ")}`);
  let missing = verifyLive();
  if (missing.length) {
    console.log(`   ⚠️ race-detect (${missing.length}) — fresh base pe re-patch + re-upload…`);
    // dobara patch (fresh base pe) + upload + final verify
    patched[cfg.sitemap] !== undefined && Object.assign(patched, { [cfg.sitemap]: computeSitemapPatch(base[cfg.sitemap], files[cfg.sitemap]).patched });
    // (sirf wahi files jinka probe missing tha — simplify: sab re-patch, idempotent)
    const repatch = {};
    repatch[cfg.sitemap] = computeSitemapPatch(base[cfg.sitemap], files[cfg.sitemap]);
    repatch[NEWS_FILE] = computeSitemapPatch(base[NEWS_FILE], files[NEWS_FILE]);
    repatch[cfg.meta] = computeJsonPatch(base[cfg.meta], JSON.parse(files[cfg.meta]));
    for (const [name, r] of Object.entries(repatch)) {
      if (r.added.length) patched[name] = r.patched;
    }
    uploadAll();
    missing = verifyLive();
  }
  if (missing.length) {
    throw new Error(`upload-verify FAIL (subah-6 full-run heal karega): ${missing.slice(0, 5).join(" | ")}`);
  }
  console.log("   ✅ upload-verify: sab live confirmed");

  // 6. TIGHT-VERIFY (bot-200 + title) — fail → IndexNow skip
  const locTitle = new Map();
  for (const { id, data } of docs) {
    const slug = (data.slug || id || "").toString().trim();
    locTitle.set(`https://studygyaan.in${cfg.urlBase}/${slug}`, data.seoTitle || data.title || "");
  }
  let verifyFail = 0;
  for (const loc of allLocs) {
    const r = await botVerify(loc, locTitle.get(loc) || "");
    console.log(`   ${r.ok ? "✅" : "❌"} bot ${loc.replace("https://studygyaan.in", "")}${r.ok ? "" : " — " + r.why}`);
    if (!r.ok) verifyFail++;
  }
  if (verifyFail) {
    throw new Error(`${verifyFail} URLs bot-verify fail — IndexNow SKIP (subah-6 full-run heal karega)`);
  }

  // 7. INDEXNOW (sirf naye URLs — existing submitter reuse)
  const { normalizeSitemapUrl } = require("./generate.cjs");
  const urlsFile = path.resolve(__dirname, "../seo_out/_urls.json");
  fs.mkdirSync(path.dirname(urlsFile), { recursive: true });
  const nowIso = new Date().toISOString();
  fs.writeFileSync(urlsFile, JSON.stringify(allLocs.map((u) => ({ url: normalizeSitemapUrl(u), lastmod: nowIso }))));
  console.log(`   📮 IndexNow: ${allLocs.length} naye URLs submit…`);
  const r = spawnSync("node", [path.join(__dirname, "indexnow.cjs"), "daily"], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`indexnow.cjs exit ${r.status}`);

  console.log(`\n🎉 QUICK-ADD DONE [${args.type}] — ${allLocs.length} URLs live (sitemap+meta+news+indexnow).`);
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (e) => {
      if (/--type ek|--dry-run ke|Unknown arg/.test(e.message || "")) {
        console.error("❌ Usage: node quick_add.cjs --type <blog|job|update|story|test> [--limit N] [--dry-run --fixtures DIR --out DIR [--docs FILE]]");
        console.error(`   ${e.message}`);
        process.exit(2);
      }
      console.error("❌ QUICK-ADD FATAL:", e.message);
      process.exit(1);
    }
  );
}

module.exports = {
  TYPES,
  parseArgs,
  extractLocs,
  extractUrlBlocks,
  extractRssItems,
  computeSitemapPatch,
  computeRssPatch,
  computeJsonPatch,
  computeNavPatch,
  computeRecentPatch,
  validateUrlset,
  escHtml,
  stripLone,
};
