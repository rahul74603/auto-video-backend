/**
 * StudyGyaan Spark Plan Fix — ONE-CLICK SCRIPT
 * Run with: node scripts/apply-spark-fix.cjs
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function write(relPath, content) {
  const abs = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  console.log("✅ wrote:", relPath);
}

function patchFile(relPath, transform) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    console.log("⚠️ skip (not found):", relPath);
    return;
  }
  const src = fs.readFileSync(abs, "utf8");
  const out = transform(src);
  if (out !== src) {
    fs.writeFileSync(abs, out, "utf8");
    console.log("✅ patched:", relPath);
  } else {
    console.log("(no change):", relPath);
  }
}

function convertOnRequestCalls(src) {
  return src.replace(
    /onRequest\(\s*\{([^{}]*)\}\s*,\s*/g,
    (_m, optsBlock) => {
      const opts = {};
      optsBlock
        .split(/,|\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((l) => {
          const m = l.match(/^(\w+)\s*:\s*(.+)$/);
          if (!m) return;
          let v = m[2].trim().replace(/,?\s*$/, "");
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (m[1] === "memory") v = v.replace(/MiB$/, "MB").replace(/GiB$/, "GB");
          if (m[1] === "timeoutSeconds") v = Number(v);
          if (m[1] === "maxInstances") v = Number(v);
          opts[m[1]] = v;
        });
      if (!opts.memory) opts.memory = "256MB";
      if (!opts.timeoutSeconds) opts.timeoutSeconds = 60;
      return `functions.runWith(${JSON.stringify({
        timeoutSeconds: opts.timeoutSeconds,
        memory: opts.memory,
      })}).https.onRequest(`;
    }
  );
}

function replaceV2HttpsImport(src) {
  return src.replace(
    /const\s*\{\s*onRequest\s*\}\s*=\s*require\(\s*["']firebase-functions\/v2\/https["']\s*\);?\s*/g,
    'const functions = require("firebase-functions");\n'
  );
}

function replaceV2FirestoreImports(src) {
  return src
    .replace(
      /const\s*\{\s*onDocumentCreated\s*(?::\s*\w+)?\s*\}\s*=\s*require\(\s*["']firebase-functions\/v2\/firestore["']\s*\);?/g,
      '// onDocumentCreated (Blaze/v2 only) replaced with noop for Spark\nconst onDocumentCreated = () => () => {};'
    )
    .replace(
      /const\s*\{\s*onDocumentWritten\s*(?::\s*\w+)?\s*\}\s*=\s*require\(\s*["']firebase-functions\/v2\/firestore["']\s*\);?/g,
      '// onDocumentWritten (Blaze/v2 only) replaced with noop for Spark\nconst onDocumentWritten = () => () => {};'
    );
}

function ensureV1Import(src) {
  if (!/const functions = require\(["']firebase-functions["']\)/.test(src)) {
    src = 'const functions = require("firebase-functions");\n' + src;
  }
  return src;
}

// 1. Create clean-firebase-json.cjs
write(
  "scripts/clean-firebase-json.cjs",
  `const fs = require("fs");
const path = require("path");
const TARGET = path.join(__dirname, "..", "firebase.json");
const MINIMAL = {
  functions: [
    {
      source: "ai_backend",
      codebase: "default",
      ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
    },
  ],
};
fs.writeFileSync(TARGET, JSON.stringify(MINIMAL, null, 2) + "\\n", "utf8");
console.log("✅ firebase.json cleaned (functions-only for Spark)");
console.log(fs.readFileSync(TARGET, "utf8"));
`
);

// 2. Replace deploy.yml
write(
  ".github/workflows/deploy.yml",
  `name: Deploy Firebase Functions Only

on:
  workflow_dispatch:

jobs:
  deploy-functions:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - name: Install frontend dependencies
        run: npm ci --legacy-peer-deps

      - name: Build frontend app shell
        run: npm run build

      - name: Install Functions dependencies
        working-directory: ai_backend
        run: npm ci --legacy-peer-deps

      - name: Package app shell for social-bot SEO
        run: cp dist/index.html ai_backend/index.html

      - name: Clean firebase.json (functions-only for Spark)
        run: node scripts/clean-firebase-json.cjs

      - name: Install Firebase CLI v12.9.1
        run: npm install -g firebase-tools@12.9.1

      - name: Show versions
        run: |
          echo "firebase-tools: $(firebase --version)"

      - name: Deploy Firebase Functions (v1 — Spark plan free)
        run: firebase deploy --only functions:serverSideMetaTags,functions:rssFeed,functions:generateSitemapIndex,functions:generateSitemapMain,functions:generateSitemapBlogs,functions:generateSitemapJobs,functions:generateSitemapTests,functions:generateSitemapStories,functions:generateSitemapUpdates,functions:generateSitemapNews,functions:generateSitemapCourses,functions:generateSitemapMaterials,functions:generateSitemap,functions:generateRss,functions:pingIndexNow,functions:bulkIndexNow,functions:recentUrls,functions:recentUrlsTxt --project studymaterial-406ad --non-interactive --force
        env:
          FIREBASE_TOKEN: \${{ secrets.FIREBASE_TOKEN }}
          CLOUDSDK_CORE_DISABLE_PROMPTS: "1"
`
);

// Sync staging copy
const stagingDeploy = path.join(ROOT, "ai_backend", "github_workflows", "deploy.yml");
if (fs.existsSync(stagingDeploy)) {
  fs.copyFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), stagingDeploy);
  console.log("✅ synced ai_backend/github_workflows/deploy.yml");
}

// 3. Replace seo_export.js with full v1 version
write(
  "ai_backend/seo_export.js",
  `"use strict";

/**
 * Spark-safe Cloud Functions entrypoint — ALL v1 functions (GCF 1st gen).
 * V1 functions Spark (free) plan pe 100% free chalte hain — koi Blaze nahi chahiye.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const runWith = { memory: "1GB", timeoutSeconds: 300, maxInstances: 10 };
const runWithSmall = { memory: "256MB", timeoutSeconds: 30, maxInstances: 10 };
const runWithMed = { memory: "512MB", timeoutSeconds: 60, maxInstances: 10 };

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const handleMetaTags = require("./server_seo_renderer").createServerSeoHandler({
  db,
  renderWebStory: (req, res) => require("./web_stories").renderWebStory(req, res),
});

const httpsFunc = (opts, handler) =>
  functions.runWith(opts).https.onRequest((req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).send("");
    return handler(req, res);
  });

const proxySeoFunction = (name, opts) =>
  httpsFunc(opts || runWithMed, (req, res) => require("./seo_functions")[name](req, res));

exports.serverSideMetaTags = httpsFunc(runWith, (req, res) => handleMetaTags(req, res));
exports.rssFeed = httpsFunc(runWith, (req, res) => require("./newsFeed").rssFeed(req, res));

exports.generateSitemapIndex = proxySeoFunction("generateSitemapIndex");
exports.generateSitemapMain = proxySeoFunction("generateSitemapMain");
exports.generateSitemapBlogs = proxySeoFunction("generateSitemapBlogs");
exports.generateSitemapJobs = proxySeoFunction("generateSitemapJobs");
exports.generateSitemapTests = proxySeoFunction("generateSitemapTests");
exports.generateSitemapStories = proxySeoFunction("generateSitemapStories");
exports.generateSitemapUpdates = proxySeoFunction("generateSitemapUpdates");
exports.generateSitemapNews = proxySeoFunction("generateSitemapNews");
exports.generateSitemapCourses = proxySeoFunction("generateSitemapCourses");
exports.generateSitemapMaterials = proxySeoFunction("generateSitemapMaterials");
exports.generateSitemap = proxySeoFunction("generateSitemap", runWith);
exports.generateRss = proxySeoFunction("generateRss");

exports.pingIndexNow = httpsFunc(runWithSmall, async (req, res) => {
  try {
    const urlParam = String(req.query.url || req.body?.url || "").trim();
    const urlsParam = req.query.urls || req.body?.urls;
    const urls = [];
    if (urlParam) urls.push(urlParam);
    if (Array.isArray(urlsParam)) urls.push(...urlsParam.filter(Boolean));
    if (!urls.length) return res.status(400).json({ success: false, error: "Pass ?url=... or ?urls[]=..." });
    const valid = urls.filter((u) => {
      try { const p = new URL(u); return p.hostname === "studygyaan.in" || p.hostname.endsWith(".studygyaan.in"); } catch { return false; }
    });
    if (!valid.length) return res.status(400).json({ success: false, error: "Only studygyaan.in URLs allowed" });
    const booster = require("./indexing_booster");
    const indexNowResult = await booster.submitToAllIndexNow(valid);
    const sitemapPings = await booster.pingAllSitemaps().catch(() => []);
    const websub = await booster.publishWebSub().catch(() => []);
    let googleResult = { skipped: "no-service-account" };
    if (process.env.SERVICE_ACCOUNT_JSON) {
      try {
        const { notifyGoogle } = require("./auto_indexer");
        const jobUrls = valid.filter((u) => new URL(u).pathname.startsWith("/job/"));
        let ok = 0, fail = 0;
        for (const u of jobUrls.slice(0, 100)) { try { await notifyGoogle(u); ok++; } catch { fail++; } }
        googleResult = { attempted: jobUrls.length, accepted: ok, failed: fail };
      } catch (e) { googleResult = { skipped: "error", error: e.message }; }
    }
    return res.json({ success: true, indexNow: indexNowResult, google: googleResult, sitemapPings, websub });
  } catch (e) {
    console.error("pingIndexNow error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

exports.bulkIndexNow = httpsFunc(runWith, async (req, res) => {
  try {
    const max = Math.min(Number(req.query.max) || 2000, 5000);
    const booster = require("./indexing_booster");
    const report = await booster.bulkSubmitAllUrls({ maxPerCollection: max });
    return res.json({ success: true, ...report });
  } catch (e) {
    console.error("bulkIndexNow error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

exports.recentUrls = httpsFunc(runWithSmall, async (req, res) => {
  try {
    const booster = require("./indexing_booster");
    const links = await booster.fetchRecentInternalLinks({ force: req.query.refresh === "1" });
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.set("Content-Type", "application/json; charset=utf-8");
    return res.json(links);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

exports.recentUrlsTxt = httpsFunc(runWithMed, async (req, res) => {
  try {
    const booster = require("./indexing_booster");
    const all = await booster.fetchAllPublicUrls({ maxPerCollection: 1000 });
    res.set("Cache-Control", "public, max-age=600, s-maxage=1800");
    res.set("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(all.map((u) => u.url).join("\\n"));
  } catch (e) { return res.status(500).send(e.message); }
});
`
);

// 4. Patch remaining JS files v2→v1
const filesToPatch = [
  "ai_backend/seo_functions.js",
  "ai_backend/web_stories.js",
  "ai_backend/govt_jobs.js",
  "ai_backend/fast_track_updates.js",
];

for (const f of filesToPatch) {
  patchFile(f, (src) => {
    let s = src;
    s = replaceV2HttpsImport(s);
    s = replaceV2FirestoreImports(s);
    s = convertOnRequestCalls(s);
    s = ensureV1Import(s);
    return s;
  });
}

console.log("\n🎉 SAARA FIX HO GAYA! Ab ye commands chalao:");
console.log("   1. git add .");
console.log("   2. git commit -m \"fix: convert functions to v1 for Spark free plan\"");
console.log("   3. git push origin main");
console.log("   4. GitHub Actions me jaake 'Deploy Firebase Functions Only' run karo");
console.log("   5. Deploy ke baad browser me https://studygyaan.in/bulkIndexNow?max=2000 kholo\n");