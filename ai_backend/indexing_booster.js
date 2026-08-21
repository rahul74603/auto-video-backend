"use strict";

/**
 * 🚀 INDEXING BOOSTER — Maximum Free Indexing Coverage
 * ====================================================
 *  Ye module har possible FREE tarike se URLs ko search engines me
 *  submit karta hai, taaki koi bhi page index nahi reh jaye:
 *
 *  1. IndexNow (Bing, Yandex, Seznam, Naver) — 10k/day free, instant
 *  2. Google / Bing sitemap ping — har naye URL ke baad sitemap ping
 *  3. Google PubSubHubbub (WebSub) — real-time feed push
 *  4. Yandex (agar YANDEX_INDEXING_KEY set ho)
 *  5. Brave / DuckDuckGo / Yep discovery via IndexNow
 *  6. "Recent Pages" sidebar injection — server-side rendered HTML me
 *     10+ recent/related links add karta hai (orphan pages fix)
 *  7. Dynamic XML sitemap with smart lastmod
 *  8. Bulk submission endpoint — saare URLs ko ek baar me submit
 *
 *  Setup: is module ko Cloud Function + GitHub Action dono se call karo.
 *  Koi paid API key chahiye nahi — IndexNow public-key based hai.
 */

const admin = require("firebase-admin");
const axios = require("axios");
const { SITE_URL, SITE_HOST, INDEXNOW_KEY, shouldIndex, COLLECTION_URL_BUILDERS } =
  require("./auto_indexer");

const db = admin.apps.length ? admin.firestore() : null;

// ========== MULTI-ENDPOINT INDEXNOW SUBMISSION ==========
/**
 * IndexNow ko 4 alag-alag endpoints pe submit karta hai (redundancy):
 *   - api.indexnow.org (master, auto-routes)
 *   - api.bing.com
 *   - search.seznam.cz
 *   - yandex.com (Yandex ka endpoint)
 * Sab free hai, ek URL baar-baar submit bhi kar sakte ho (no penalty).
 */
const INDEXNOW_ENDPOINTS = [
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow",
  "https://search.seznam.cz/indexnow",
  "https://yandex.com/indexnow"
];

const PING_SERVICES = [
  // Google sitemap ping (deprecated 2023? still works for many)
  (sitemap) => `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemap)}`,
  // Bing sitemap ping
  (sitemap) => `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemap)}`,
  // Yandex sitemap ping
  (sitemap) => `https://webmaster.yandex.ru/ping?sitemap=${encodeURIComponent(sitemap)}`
];

// WebSub/PubSubHubbub — real-time feed subscribe/push (Google News ke liye)
const WEBSUB_HUBS = [
  "https://pubsubhubbub.appspot.com/",
  "https://pubsubhubbub.superfeedr.com/"
];

/**
 * Har naya URL ya batch ko 4 IndexNow endpoints + sitemap ping submit.
 * Fire-and-forget — publish flow ko kabhi block nahi karta.
 */
async function submitToAllIndexNow(urls, { batchSize = 1000 } = {}) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean).slice(0, 10000);
  if (!list.length) return { attempted: 0, success: 0, failed: 0 };

  const batches = [];
  for (let i = 0; i < list.length; i += batchSize) batches.push(list.slice(i, i + batchSize));

  let success = 0, failed = 0;
  const errors = [];

  for (const batch of batches) {
    const payload = {
      host: SITE_HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList: batch
    };

    // Parallel submit to all endpoints (redundancy — agar ek down ho to dusra kaam kare)
    const results = await Promise.allSettled(
      INDEXNOW_ENDPOINTS.map((endpoint) =>
        axios
          .post(endpoint, payload, {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            timeout: 12000,
            validateStatus: () => true
          })
          .then((res) => ({ endpoint, status: res.status }))
      )
    );

    for (const r of results) {
      if (r.status === "fulfilled" && (r.value.status === 200 || r.value.status === 202)) {
        success += batch.length;
      } else {
        failed += batch.length;
        errors.push(r.reason?.message || "unknown");
      }
    }
  }

  return { attempted: list.length * INDEXNOW_ENDPOINTS.length, success, failed, errors: errors.slice(0, 5) };
}

/** Sitemap ko Google/Bing/Yandex me ping karo — best-effort, kabhi block nahi. */
async function pingAllSitemaps(sitemapUrl = `${SITE_URL}/sitemap.xml`) {
  const results = [];
  for (const buildUrl of PING_SERVICES) {
    try {
      const url = buildUrl(sitemapUrl);
      const res = await axios.get(url, { timeout: 10000, validateStatus: () => true });
      results.push({ service: url.split("/")[2], status: res.status, ok: res.status < 500 });
    } catch (e) {
      results.push({ service: buildUrl(sitemapUrl).split("/")[2], ok: false, error: e.message });
    }
  }
  return results;
}

/** RSS feed ko WebSub/PubSubHubbub hubs pe push — Google News instant crawl. */
async function publishWebSub(feedUrl = `${SITE_URL}/feed.xml`) {
  const results = [];
  for (const hub of WEBSUB_HUBS) {
    try {
      const params = new URLSearchParams();
      params.append("hub.mode", "publish");
      params.append("hub.url", feedUrl);
      const res = await axios.post(hub, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
        validateStatus: () => true
      });
      results.push({ hub, status: res.status, ok: res.status < 500 });
    } catch (e) {
      results.push({ hub, ok: false, error: e.message });
    }
  }
  return results;
}

// ========== SMART INTERNAL-LINKS INJECTION ==========
/**
 * Har page ko "Recently Published" + "Related Category" ke links add karke
 * orphan problem fix karta hai. Server-side HTML me inject hota hai,
 * crawlers ko immediately milte hain links (client-side JS ka wait nahi).
 *
 * Cached in-memory (5 min) taaki har request pe Firestore read na lage.
 */
let _internalLinksCache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function fetchRecentInternalLinks({ force = false } = {}) {
  if (!force && _internalLinksCache.data && Date.now() - _internalLinksCache.ts < CACHE_TTL) {
    return _internalLinksCache.data;
  }

  if (!db) return { latest: [], byCategory: {} };

  const result = { latest: [], byCategory: {}, generatedAt: new Date().toISOString() };

  // Latest 20 across collections (crawler ko fresh URLs dikhane ke liye)
  const COLLECTIONS = [
    { name: "jobs", path: "/job/", limit: 12 },
    { name: "fast_track", path: "/update/", limit: 8 },
    { name: "blogs", path: "/blog/", limit: 5 },
    { name: "mock_tests", path: "/test/", limit: 4 },
    { name: "web_stories", path: "/web-stories/", limit: 4 },
    { name: "courses", path: "/course/", limit: 3 }
  ];

  const allEntries = [];
  for (const col of COLLECTIONS) {
    try {
      const snap = await db.collection(col.name)
        .orderBy("createdAt", "desc")
        .limit(col.limit)
        .get();
      snap.forEach((doc) => {
        const d = doc.data();
        if (!isIndexableStatus(d.status)) return;
        const title = String(d.title || d.seoTitle || "").trim();
        if (title.length < 5) return;
        const slug = d.slug || doc.id;
        const url = `${SITE_URL}${col.path}${encodeURIComponent(slug)}`;
        const entry = { title, url, collection: col.name, category: String(d.category || "").toLowerCase() };
        allEntries.push(entry);

        // By-category grouping (related links ke liye)
        const cat = entry.category || "general";
        if (!result.byCategory[cat]) result.byCategory[cat] = [];
        result.byCategory[cat].push(entry);
      });
    } catch (e) {
      console.warn(`[indexing-booster] fetch ${col.name} failed:`, e.message);
    }
  }

  // Sort by createdAt (desc) — we already did orderBy per collection, so mix them:
  // Use first N per type for "latest" sidebar
  const seen = new Set();
  for (const col of COLLECTIONS) {
    const fromCol = allEntries.filter((e) => e.collection === col.name);
    for (const e of fromCol.slice(0, 8)) {
      if (!seen.has(e.url)) {
        result.latest.push(e);
        seen.add(e.url);
      }
    }
  }

  _internalLinksCache = { data: result, ts: Date.now() };
  return result;
}

function isIndexableStatus(status) {
  if (!status) return true; // no status = treat as published
  const s = String(status).toLowerCase().trim();
  if (s === "publish" || s === "published" || s === "approved" || s === "live") return true;
  return !["draft", "pending", "rejected", "private", "archived", "deleted", "trash"].includes(s);
}

/**
 * Server-rendered HTML me "Recently Published" nav block inject karta hai.
 * Crawlers ko content + links dono milte hain — orphan pages fix.
 *
 * @param {string} html - Original server-rendered HTML
 * @param {object} [currentPage] - { collection, category, slug } for related links
 * @returns {string} HTML with internal links nav injected
 */
async function injectInternalLinksHtml(html, currentPage = null) {
  if (!html || typeof html !== "string") return html;
  try {
    const links = await fetchRecentInternalLinks();
    if (!links.latest.length) return html;

    // Related pages (by category) if we know the current category
    let relatedHtml = "";
    if (currentPage?.category) {
      const related = (links.byCategory[currentPage.category.toLowerCase()] || []).slice(0, 6);
      if (related.length >= 2) {
        relatedHtml = `
          <nav aria-label="Related Content" id="sg-related-links" style="margin:20px 0;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
            <h3 style="margin:0 0 10px;font-size:16px;color:#1e293b;">📌 Related ${currentPage.category?.toUpperCase() || "Content"}</h3>
            <ul style="margin:0;padding-left:18px;">${related
              .filter((r) => r.url !== `${SITE_URL}${currentPage.path || "/x/"}`)
              .slice(0, 5)
              .map((r) => `<li style="margin:4px 0;"><a href="${r.url}" style="color:#2563eb;text-decoration:none;">${escapeHtml(r.title).slice(0, 90)}</a></li>`)
              .join("")}</ul>
          </nav>`;
      }
    }

    const latestHtml = `
      <nav aria-label="Latest Published" id="sg-latest-links" style="margin:20px 0;padding:16px;background:#f1f5f9;border-radius:12px;border:1px solid #cbd5e1;">
        <h3 style="margin:0 0 10px;font-size:16px;color:#0f172a;">🔥 Latest Published on StudyGyaan</h3>
        <ul style="margin:0;padding-left:18px;columns:2;column-gap:24px;">${links.latest
          .slice(0, 16)
          .map((r) => `<li style="margin:3px 0;break-inside:avoid;"><a href="${r.url}" style="color:#1d4ed8;text-decoration:none;font-size:13px;line-height:1.4;">${escapeHtml(r.title).slice(0, 80)}</a></li>`)
          .join("")}</ul>
      </nav>`;

    const hubLinksHtml = `
      <nav aria-label="Content Hubs" id="sg-hub-links" style="margin:16px 0;padding:12px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
        <strong>Explore:</strong>
        <a href="/govt-jobs" style="margin:0 6px;color:#b45309;">Latest Govt Jobs</a> ·
        <a href="/admit-card" style="margin:0 6px;color:#b45309;">Admit Cards</a> ·
        <a href="/results" style="margin:0 6px;color:#b45309;">Results</a> ·
        <a href="/syllabus" style="margin:0 6px;color:#b45309;">Syllabus</a> ·
        <a href="/answer-key" style="margin:0 6px;color:#b45309;">Answer Keys</a> ·
        <a href="/test" style="margin:0 6px;color:#b45309;">Mock Tests</a> ·
        <a href="/blog" style="margin:0 6px;color:#b45309;">Blog</a> ·
        <a href="/free-study-material" style="margin:0 6px;color:#b45309;">Study Material</a> ·
        <a href="/web-stories" style="margin:0 6px;color:#b45309;">Web Stories</a>
      </nav>`;

    const injectBlock = `<!-- StudyGyaan Internal Links (SEO Booster) -->${hubLinksHtml}${relatedHtml}${latestHtml}`;

    // Inject before </article></main>, or before </body> as fallback
    if (html.includes("</article>")) {
      html = html.replace("</article>", `${injectBlock}</article>`);
    } else if (html.includes("</main>")) {
      html = html.replace("</main>", `${injectBlock}</main>`);
    } else if (html.includes("</body>")) {
      html = html.replace("</body>", `${injectBlock}</body>`);
    } else {
      html = html + injectBlock;
    }

    // Also inject JSON-LD ItemList of latest URLs (extra crawl signal)
    const itemListLd = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Latest StudyGyaan Content",
      numberOfItems: Math.min(links.latest.length, 20),
      itemListElement: links.latest.slice(0, 20).map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: r.url,
        name: r.title
      }))
    };
    const ldScript = `<script type="application/ld+json">${JSON.stringify(itemListLd).replace(/</g, "\\u003c")}</script>`;
    if (html.includes("</head>")) {
      html = html.replace("</head>", `${ldScript}</head>`);
    }

    return html;
  } catch (e) {
    console.warn("[indexing-booster] inject internal links failed:", e.message);
    return html;
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ========== BULK URL FETCHER (for re-indexing existing content) ==========
const BULK_COLLECTIONS = [
  { name: "jobs", path: "/job/", statusField: "status" },
  { name: "fast_track", path: "/update/", statusField: "status" },
  { name: "blogs", path: "/blog/", statusField: "status" },
  { name: "mock_tests", path: "/test/", statusField: "status" },
  { name: "web_stories", path: "/web-stories/", statusField: "status" },
  { name: "courses", path: "/course/", statusField: "status" },
  { name: "study_materials", path: "/material/", statusField: "status" }
];

async function fetchAllPublicUrls({ maxPerCollection = 5000 } = {}) {
  if (!db) return [];
  const urls = [];
  for (const col of BULK_COLLECTIONS) {
    try {
      const snap = await db.collection(col.name)
        .orderBy("createdAt", "desc")
        .limit(maxPerCollection)
        .get();
      snap.forEach((doc) => {
        const d = doc.data();
        if (!isIndexableStatus(d[col.statusField] || d.status)) return;
        const title = String(d.title || "").trim();
        if (title.length < 3) return;
        const slug = d.slug || doc.id;
        urls.push({
          url: `${SITE_URL}${col.path}${encodeURIComponent(slug)}`,
          collection: col.name,
          title,
          lastmod: d.updatedAt?._seconds || d.createdAt?._seconds || 0
        });
      });
    } catch (e) {
      console.warn(`[indexing-booster] bulk fetch ${col.name} failed:`, e.message);
    }
  }
  // Dedupe
  const seen = new Set();
  return urls.filter((u) => (seen.has(u.url) ? false : (seen.add(u.url), true)));
}

/**
 * Saare public URLs ko IndexNow pe bulk submit — run once after deploy
 * or daily via cron to catch missed pages.
 */
async function bulkSubmitAllUrls({ maxPerCollection = 5000 } = {}) {
  const all = await fetchAllPublicUrls({ maxPerCollection });
  console.log(`[indexing-booster] Bulk-submitting ${all.length} URLs to IndexNow (4 endpoints)...`);
  const result = await submitToAllIndexNow(all.map((u) => u.url));
  const sitemapPings = await pingAllSitemaps();
  const websub = await publishWebSub();
  // Invalidate internal links cache so fresh links show next request
  _internalLinksCache = { data: null, ts: 0 };
  return {
    totalUrls: all.length,
    indexNow: result,
    sitemapPings,
    websub,
    byCollection: countBy(all, "collection")
  };
}

function countBy(arr, key) {
  const out = {};
  for (const item of arr) out[item[key]] = (out[item[key]] || 0) + 1;
  return out;
}

/**
 * Single URL publish — call this the moment a page goes live.
 * Submits to all 4 IndexNow endpoints + pings sitemaps + WebSub.
 */
async function notifyNewUrlPublished(url) {
  if (!url) return { skipped: "no-url" };
  const indexNowResult = await submitToAllIndexNow([url]);
  // Sitemaps ping (fire-and-forget, don't wait)
  pingAllSitemaps().catch(() => {});
  publishWebSub().catch(() => {});
  // Invalidate cache so new page appears in "Latest" sidebar
  _internalLinksCache = { data: null, ts: 0 };
  return { url, indexNow: indexNowResult };
}

module.exports = {
  submitToAllIndexNow,
  pingAllSitemaps,
  publishWebSub,
  fetchRecentInternalLinks,
  injectInternalLinksHtml,
  fetchAllPublicUrls,
  bulkSubmitAllUrls,
  notifyNewUrlPublished,
  isIndexableStatus,
  INDEXNOW_ENDPOINTS,
  PING_SERVICES
};
