#!/usr/bin/env node
/**
 * StudyGyaan STATIC SEO GENERATOR (100% FREE — no Firebase billing needed)
 * ------------------------------------------------------------------------
 * Firestore se saara data padh ke static files banata hai:
 *   sitemap.xml            (sitemap index)
 *   sitemap-main.xml       (static pages)
 *   sitemap-blogs.xml      (with images)
 *   sitemap-jobs.xml       (with images)
 *   sitemap-tests.xml
 *   sitemap-stories.xml    (with images)
 *   sitemap-updates.xml
 *   sitemap-courses.xml
 *   sitemap-materials.xml
 *   sitemap-news.xml       (Google News - last 2 days)
 *   sitemap-all.xml        (sab kuch ek file me)
 *   rss.xml + feed.xml     (RSS feed)
 *   recent-urls.txt        (saare public URLs, plain text)
 *   _urls.json             (internal - indexnow.cjs ke liye; FTP pe upload NAHI hota)
 *
 * Auth: env FIREBASE_SERVICE_ACCOUNT me service-account JSON (GitHub secret).
 * Test: node generate.cjs --mock --out ../seo_out   (bina Firestore ke fake data)
 *
 * Logic ai_backend/seo_functions.js se EXACT copy kiya gaya hai.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const WEBSITE_URL = "https://studygyaan.in";

// ---------- CLI args ----------
const args = process.argv.slice(2);
const MOCK = args.includes("--mock");
const outIdx = args.indexOf("--out");
const OUT_DIR = path.resolve(__dirname, outIdx >= 0 ? args[outIdx + 1] : "../seo_out");

// ---------- Helpers (same as seo_functions.js) ----------
function safeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getIsoDate(t, fallback) {
  if (!t) return fallback || new Date().toISOString();
  if (t.toDate) return t.toDate().toISOString();
  return new Date(t).toISOString();
}

function getUtcDate(t, fallback) {
  if (!t) return fallback || new Date().toUTCString();
  if (t.toDate) return t.toDate().toUTCString();
  return new Date(t).toUTCString();
}

function toDateObj(t) {
  if (!t) return null;
  if (t.toDate) return t.toDate();
  const d = new Date(t);
  return isNaN(d) ? null : d;
}

const STATIC_PAGES = [
  { path: "", priority: "1.0", freq: "daily" },
  { path: "/govt-jobs", priority: "0.9", freq: "daily" },
  { path: "/blog", priority: "0.9", freq: "daily" },
  { path: "/test", priority: "0.9", freq: "daily" },
  { path: "/web-stories", priority: "0.9", freq: "daily" },
  { path: "/free-study-material", priority: "0.8", freq: "weekly" },
  { path: "/e-books", priority: "0.8", freq: "weekly" },
  { path: "/premium-notes", priority: "0.8", freq: "weekly" },
  { path: "/about-us", priority: "0.6", freq: "monthly" },
  { path: "/contact-us", priority: "0.6", freq: "monthly" },
  { path: "/privacy-policy", priority: "0.5", freq: "monthly" },
  { path: "/terms-conditions", priority: "0.5", freq: "monthly" },
];

function isIndexableDocument(data = {}) {
  if (data.noIndex === true || data.deleted === true || data.isDeleted === true) return false;
  const status = String(data.status || "").trim().toLowerCase();
  return !["draft", "pending", "rejected", "private", "archived", "deleted", "trash"].includes(status);
}

function hasUsefulTitle(data = {}) {
  return String(data.title || data.post_name || "").trim().length >= 5;
}

// ---------- Firestore fetch ----------
async function fetchCollections() {
  if (MOCK) {
    console.log("🧪 MOCK MODE — fake data use ho raha hai (Firestore nahi)");
    const now = new Date();
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    const mk = (n, extra = {}) =>
      Array.from({ length: n }, (_, i) => ({
        id: `doc${i}`,
        data: {
          title: `Mock Title Number ${i} — <test> & "quotes"`,
          slug: `mock-slug-${i}`,
          status: i % 7 === 0 ? "draft" : "published",
          createdAt: i < 2 ? now : old,
          updatedAt: i < 2 ? now : old,
          imageUrl: `https://cdn.example.com/img${i}.jpg`,
          category: "Education",
          description: `<h2>Overview</h2><p>Mock description ${i} for testing the RSS <b>feed</b> &amp; schema</p>`,
          author: "Rahul Sir",
          seoTitle: `Mock SEO Title ${i} 2026 - Apply Online`,
          metaDescription: `Mock meta description number ${i} for SEO testing with enough length here.`,
          organization: "Staff Selection Commission",
          lastDate: i % 2 === 0 ? "15 July 2026" : "15-09-2026",
          totalPosts: `${100 + i} Posts`,
          faqs: [
            { question: `Question ${i}?`, answer: `Answer ${i} with <b>html</b>.` },
            { question: `Dusra sawal ${i}?`, answer: `Dusra jawab ${i}.` },
          ],
          ...extra,
        },
      }));
    return {
      blogs: mk(10),
      jobs: mk(8, {}).concat(mk(2, { type: "COURSE" })),
      mock_tests: mk(5),
      web_stories: mk(5, { coverImage: "https://cdn.example.com/cover.jpg" }),
      fast_track: mk(6),
      courses: mk(4),
      study_materials: mk(4),
      studyMaterials: [],
    };
  }

  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!saJson) {
      console.error("❌ FIREBASE_SERVICE_ACCOUNT env/secret missing! GitHub secret set karo.");
      process.exit(1);
    }
    const sa = JSON.parse(saJson);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || "studymaterial-406ad",
    });
  }
  const db = admin.firestore();

  async function grab(coll, limit) {
    try {
      const snap = await db.collection(coll).orderBy("createdAt", "desc").limit(limit).get();
      const rows = [];
      snap.forEach((doc) => rows.push({ id: doc.id, data: doc.data() }));
      console.log(`   📥 ${coll}: ${rows.length} docs`);
      return rows;
    } catch (e) {
      console.error(`   ⚠️ ${coll} fetch error (skip):`, e.message);
      return [];
    }
  }

  console.log("📡 Firestore se data fetch ho raha hai...");
  return {
    blogs: await grab("blogs", 5000),
    jobs: await grab("jobs", 5000),
    mock_tests: await grab("mock_tests", 2000),
    web_stories: await grab("web_stories", 2000),
    fast_track: await grab("fast_track", 5000),
    courses: await grab("courses", 5000),
    study_materials: await grab("study_materials", 5000),
    studyMaterials: await grab("studyMaterials", 5000),
  };
}

// ---------- XML builders (logic = seo_functions.js) ----------
const XML_HEAD = `<?xml version="1.0" encoding="UTF-8"?>\n`;
const URLSET_OPEN = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
const URLSET_OPEN_IMG =
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
  `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

function sitemapIndex() {
  const sitemaps = [
    `${WEBSITE_URL}/sitemap-main.xml`,
    `${WEBSITE_URL}/sitemap-blogs.xml`,
    `${WEBSITE_URL}/sitemap-jobs.xml`,
    `${WEBSITE_URL}/sitemap-tests.xml`,
    `${WEBSITE_URL}/sitemap-stories.xml`,
    `${WEBSITE_URL}/sitemap-updates.xml`,
    `${WEBSITE_URL}/sitemap-courses.xml`,
    `${WEBSITE_URL}/sitemap-materials.xml`,
    `${WEBSITE_URL}/sitemap-news.xml`,
  ];
  let xml = XML_HEAD + `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  const lastmod = new Date().toISOString();
  sitemaps.forEach((url) => {
    xml += `  <sitemap>\n    <loc>${url}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>\n`;
  });
  xml += `</sitemapindex>`;
  return xml;
}

function sitemapMain() {
  let xml = XML_HEAD + URLSET_OPEN;
  STATIC_PAGES.forEach((p) => {
    xml += `  <url>\n    <loc>${WEBSITE_URL}${p.path}</loc>\n    <changefreq>${p.freq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
  });
  return xml + `</urlset>`;
}

function urlEntry({ loc, lastmod, freq, priority, image, imageTitle, imageCaption }) {
  let x = `  <url>\n    <loc>${loc}</loc>\n`;
  if (lastmod) x += `    <lastmod>${lastmod}</lastmod>\n`;
  x += `    <changefreq>${freq}</changefreq>\n    <priority>${priority}</priority>\n`;
  if (image) {
    x += `    <image:image>\n      <image:loc>${image}</image:loc>\n`;
    if (imageTitle) x += `      <image:title>${imageTitle}</image:title>\n`;
    if (imageCaption) x += `      <image:caption>${imageCaption}</image:caption>\n`;
    x += `    </image:image>\n`;
  }
  return x + `  </url>\n`;
}

function buildAll(colls) {
  const now = new Date().toISOString();
  const nowUtc = new Date().toUTCString();
  const allUrls = []; // {url, lastmod}

  const push = (url, lastmod) => allUrls.push({ url, lastmod });

  // --- blogs ---
  let blogsXml = XML_HEAD + URLSET_OPEN_IMG;
  let allXml = XML_HEAD + URLSET_OPEN_IMG;
  STATIC_PAGES.forEach((p) => {
    allXml += `  <url>\n    <loc>${WEBSITE_URL}${p.path}</loc>\n    <changefreq>${p.freq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
    push(`${WEBSITE_URL}${p.path}`, now);
  });

  colls.blogs.forEach(({ id, data }) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
    const slug = safeXml(data.slug || id);
    const lastmod = getIsoDate(data.updatedAt || data.createdAt, now);
    const img = safeXml(data.imageUrl || `${WEBSITE_URL}/og-image.jpg`);
    const entry = urlEntry({
      loc: `${WEBSITE_URL}/blog/${slug}`,
      lastmod,
      freq: "weekly",
      priority: "0.9",
      image: img,
      imageTitle: safeXml(data.title || "StudyGyaan Blog"),
      imageCaption: safeXml(data.category || "Education"),
    });
    blogsXml += entry;
    allXml += urlEntry({
      loc: `${WEBSITE_URL}/blog/${slug}`,
      lastmod,
      freq: "weekly",
      priority: "0.9",
      image: img,
      imageTitle: safeXml(data.title || "StudyGyaan Blog"),
    });
    push(`${WEBSITE_URL}/blog/${data.slug || id}`, lastmod);
  });
  blogsXml += `</urlset>`;

  // --- jobs ---
  let jobsXml = XML_HEAD + URLSET_OPEN_IMG;
  let expiredJobsCount = 0;
  // 🗓️ Expired jobs: sitemap me priority 0.4 + monthly (fresh jobs pe crawl budget)
  let parseLastDateFn = null;
  try { parseLastDateFn = require("./seo_meta.cjs").parseLastDate; } catch { /* optional */ }
  colls.jobs.forEach(({ id, data }) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
    if ((data.type || "").toUpperCase() === "COURSE") return;
    const slug = safeXml(data.slug || id);
    const lastmod = getIsoDate(data.updatedAt || data.createdAt, now);
    const img = safeXml(data.imageUrl || `${WEBSITE_URL}/og-image.jpg`);
    let expired = false;
    if (parseLastDateFn) {
      const vt = parseLastDateFn(data.lastDate);
      expired = Boolean(vt && Date.parse(`${vt}T23:59:59+05:30`) < Date.now());
      if (expired) expiredJobsCount++;
    }
    const e = urlEntry({
      loc: `${WEBSITE_URL}/job/${slug}`,
      lastmod,
      freq: expired ? "monthly" : "daily",
      priority: expired ? "0.4" : "1.0",
      image: img,
      imageTitle: safeXml(data.title || "StudyGyaan Job Update"),
    });
    jobsXml += e;
    allXml += e;
    push(`${WEBSITE_URL}/job/${data.slug || id}`, lastmod);
  });
  jobsXml += `</urlset>`;
  if (expiredJobsCount) console.log(`   🗓️ Expired jobs (low priority in sitemap): ${expiredJobsCount}`);

  // --- tests ---
  let testsXml = XML_HEAD + URLSET_OPEN;
  colls.mock_tests.forEach(({ id, data }) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
    const slug = safeXml(data.slug || id);
    const lastmod = getIsoDate(data.updatedAt || data.createdAt, now);
    const e = urlEntry({ loc: `${WEBSITE_URL}/test/${slug}`, lastmod, freq: "weekly", priority: "0.7" });
    testsXml += e;
    allXml += e;
    push(`${WEBSITE_URL}/test/${data.slug || id}`, lastmod);
  });
  testsXml += `</urlset>`;

  // --- stories ---
  let storiesXml = XML_HEAD + URLSET_OPEN_IMG;
  colls.web_stories.forEach(({ id, data }) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
    const slug = safeXml(data.slug || id);
    const lastmod = getIsoDate(data.createdAt, now);
    const e = urlEntry({
      loc: `${WEBSITE_URL}/web-stories/${slug}`,
      lastmod,
      freq: "weekly",
      priority: "0.9",
      image: safeXml(data.coverImage || `${WEBSITE_URL}/og-image.jpg`),
      imageTitle: safeXml(data.title || "StudyGyaan Web Story"),
    });
    storiesXml += e;
    allXml += e;
    push(`${WEBSITE_URL}/web-stories/${data.slug || id}`, lastmod);
  });
  storiesXml += `</urlset>`;

  // --- fast_track updates ---
  let updatesXml = XML_HEAD + URLSET_OPEN;
  colls.fast_track.forEach(({ id, data }) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
    const slug = safeXml(data.slug || id);
    const lastmod = getIsoDate(data.updatedAt || data.publishedAt || data.createdAt, now);
    const e = urlEntry({ loc: `${WEBSITE_URL}/update/${slug}`, lastmod, freq: "daily", priority: "0.8" });
    updatesXml += e;
    allXml += urlEntry({ loc: `${WEBSITE_URL}/update/${slug}`, lastmod, freq: "weekly", priority: "0.7" });
    push(`${WEBSITE_URL}/update/${data.slug || id}`, lastmod);
  });
  updatesXml += `</urlset>`;

  // --- courses ---
  let coursesXml = XML_HEAD + URLSET_OPEN;
  colls.courses.forEach(({ id, data }) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
    const slug = safeXml(data.slug || id);
    const lastmod = getIsoDate(data.updatedAt || data.createdAt, now);
    const e = urlEntry({ loc: `${WEBSITE_URL}/course/${slug}`, lastmod, freq: "weekly", priority: "0.8" });
    coursesXml += e;
    allXml += e;
    push(`${WEBSITE_URL}/course/${data.slug || id}`, lastmod);
  });
  coursesXml += `</urlset>`;

  // --- materials (dono collections) ---
  let matsXml = XML_HEAD + URLSET_OPEN;
  [...colls.study_materials, ...colls.studyMaterials].forEach(({ id, data }) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
    const slug = safeXml(data.slug || id);
    const lastmod = getIsoDate(data.updatedAt || data.createdAt, now);
    const e = urlEntry({ loc: `${WEBSITE_URL}/material/${slug}`, lastmod, freq: "weekly", priority: "0.7" });
    matsXml += e;
    allXml += e;
    push(`${WEBSITE_URL}/material/${data.slug || id}`, lastmod);
  });
  matsXml += `</urlset>`;

  allXml += `</urlset>`;

  // --- news sitemap (last 2 days: blogs + JOBS + FAST TRACK — sab news hai!) ---
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  let newsXml =
    XML_HEAD +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n`;

  const newsEntry = (urlPath, data, id) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data) || !data.createdAt) return "";
    const pubDate = toDateObj(data.createdAt);
    if (!pubDate || pubDate < twoDaysAgo) return "";
    const slug = safeXml(data.slug || id);
    let x = `  <url>\n`;
    x += `    <loc>${WEBSITE_URL}/${urlPath}/${slug}</loc>\n`;
    x += `    <news:news>\n`;
    x += `      <news:publication>\n`;
    x += `        <news:name>StudyGyaan</news:name>\n`;
    x += `        <news:language>hi</news:language>\n`;
    x += `      </news:publication>\n`;
    x += `      <news:publication_date>${pubDate.toISOString()}</news:publication_date>\n`;
    x += `      <news:title>${safeXml(data.title || "StudyGyaan Update")}</news:title>\n`;
    x += `      <news:keywords>${safeXml(data.category || "Education")}, StudyGyaan, Sarkari Naukri, Exam Preparation</news:keywords>\n`;
    x += `    </news:news>\n`;
    x += `  </url>\n`;
    return x;
  };

  // Jobs = bharti news (sabse important!)
  colls.jobs.slice(0, 50).forEach(({ id, data }) => {
    if ((data.type || "").toUpperCase() === "COURSE") return;
    newsXml += newsEntry("job", data, id);
  });
  // Fast track = result/admit card news
  colls.fast_track.slice(0, 50).forEach(({ id, data }) => {
    newsXml += newsEntry("update", data, id);
  });
  // Blogs
  colls.blogs.slice(0, 100).forEach(({ id, data }) => {
    newsXml += newsEntry("blog", data, id);
  });
  newsXml += `</urlset>`;

  // --- RSS ---
  let rss = XML_HEAD;
  rss += `<rss version="2.0"\n`;
  rss += `  xmlns:dc="http://purl.org/dc/elements/1.1/"\n`;
  rss += `  xmlns:atom="http://www.w3.org/2005/Atom"\n`;
  rss += `  xmlns:media="http://search.yahoo.com/mrss/">\n`;
  rss += `<channel>\n`;
  rss += `  <title>StudyGyaan - Sarkari Naukri &amp; Exam Preparation</title>\n`;
  rss += `  <link>${WEBSITE_URL}</link>\n`;
  rss += `  <description>Latest Govt Jobs, Mock Tests, Free Study Material &amp; Exam Updates</description>\n`;
  rss += `  <language>hi</language>\n`;
  rss += `  <lastBuildDate>${nowUtc}</lastBuildDate>\n`;
  rss += `  <managingEditor>admin@studygyaan.in (StudyGyaan)</managingEditor>\n`;
  rss += `  <webMaster>admin@studygyaan.in (StudyGyaan)</webMaster>\n`;
  rss += `  <copyright>2025 StudyGyaan.in All Rights Reserved</copyright>\n`;
  rss += `  <ttl>60</ttl>\n`;
  rss += `  <atom:link href="${WEBSITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>\n`;
  rss += `  <image>\n    <url>${WEBSITE_URL}/logo.png</url>\n    <title>StudyGyaan</title>\n    <link>${WEBSITE_URL}</link>\n    <width>144</width>\n    <height>144</height>\n  </image>\n`;
  colls.blogs.slice(0, 50).forEach(({ id, data }) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
    const slugOrId = data.slug || id;
    const itemUrl = `${WEBSITE_URL}/blog/${slugOrId}`;
    const imageUrl = data.imageUrl || `${WEBSITE_URL}/og-image.jpg`;
    rss += `  <item>\n`;
    rss += `    <title><![CDATA[${data.title || "StudyGyaan Update"}]]></title>\n`;
    rss += `    <link>${itemUrl}</link>\n`;
    rss += `    <guid isPermaLink="true">${itemUrl}</guid>\n`;
    rss += `    <pubDate>${getUtcDate(data.createdAt, nowUtc)}</pubDate>\n`;
    rss += `    <description><![CDATA[${data.description ? String(data.description).substring(0, 500) : "Read more on StudyGyaan.in"}]]></description>\n`;
    rss += `    <category><![CDATA[${data.category || "Education"}]]></category>\n`;
    rss += `    <dc:creator><![CDATA[${data.author || "Rahul Sir"}]]></dc:creator>\n`;
    rss += `    <dc:date>${getIsoDate(data.createdAt, now)}</dc:date>\n`;
    rss += `    <media:content\n      url="${safeXml(imageUrl)}"\n      medium="image"\n      type="image/jpeg"\n      width="1200"\n      height="630"/>\n`;
    rss += `    <media:thumbnail url="${safeXml(imageUrl)}" width="300" height="200"/>\n`;
    rss += `  </item>\n`;
  });
  rss += `</channel>\n</rss>`;

  return {
    "sitemap.xml": sitemapIndex(),
    "sitemap-main.xml": sitemapMain(),
    "sitemap-blogs.xml": blogsXml,
    "sitemap-jobs.xml": jobsXml,
    "sitemap-tests.xml": testsXml,
    "sitemap-stories.xml": storiesXml,
    "sitemap-updates.xml": updatesXml,
    "sitemap-courses.xml": coursesXml,
    "sitemap-materials.xml": matsXml,
    "sitemap-news.xml": newsXml,
    "sitemap-all.xml": allXml,
    "rss.xml": rss,
    "feed.xml": rss,
    "recent-urls.txt": allUrls.map((u) => u.url).join("\n"),
    "_urls.json": JSON.stringify(allUrls, null, 0),
  };
}

// ---------- Main ----------
(async () => {
  const colls = await fetchCollections();
  const files = buildAll(colls);

  // 🤖 Bot-SEO meta files (meta.php ke liye) — jobs/updates full schema, baaki preview
  try {
    const { buildMetaFiles } = require("./seo_meta.cjs");
    Object.assign(files, buildMetaFiles(colls));
  } catch (e) {
    console.error("⚠️ seo_meta build error (skip):", e.message);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let totalUrls = 0;
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT_DIR, name), content, "utf8");
    const kb = (Buffer.byteLength(content) / 1024).toFixed(1);
    console.log(`   ✅ ${name} (${kb} KB)`);
  }

  // meta.php ko bhi upload folder me copy karo
  try {
    fs.copyFileSync(path.join(__dirname, "meta.php"), path.join(OUT_DIR, "meta.php"));
    console.log("   ✅ meta.php (copied)");
  } catch (e) {
    console.error("⚠️ meta.php copy error:", e.message);
  }

  try {
    totalUrls = JSON.parse(files["_urls.json"]).length;
  } catch {}
  console.log(`\n🎉 DONE! ${Object.keys(files).length + 1} files → ${OUT_DIR}`);
  console.log(`   Total URLs in sitemaps: ${totalUrls}`);
  process.exit(0);
})().catch((e) => {
  console.error("❌ FATAL:", e);
  process.exit(1);
});
