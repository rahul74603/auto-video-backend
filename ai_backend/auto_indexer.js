"use strict";

/**
 * ==========================================================
 *  AUTO INDEXER — publish hote hi search engines ko ping
 * ==========================================================
 *  Naya public page (jobs / fast_track / blogs / web_stories / mock_tests)
 *  Firestore me bante HI:
 *    1. IndexNow (Bing/Yandex/others) ko URL submit
 *    2. Google Indexing API ko notify (agar GOOGLE_INDEXING_SA_JSON env set ho —
 *       wahi service-account JSON jo GitHub secret SERVICE_ACCOUNT_JSON me hai;
 *       missing ho to sirf skip, kuch tootta nahi)
 *  Har trigger fire-and-forget hai: indexing fail hone se publish kabhi nahi rukta.
 *  Doc pe `seoIndexNotifiedAt` marker — admin ko pata rahe kab ping gaya tha.
 */

const SITE_URL = "https://studygyaan.in";
const SITE_HOST = "studygyaan.in";

/** IndexNow ownership key (public by design — isi value ki txt file site root pe hai). */
const INDEXNOW_KEY = "9629c8c41fa94b898f83a53ecd320743";
const INDEXNOW_KEY_LOCATION = `${SITE_URL}/${INDEXNOW_KEY}.txt`;

/** Public collection ki doc se site ka canonical path banao (null = index ke layak nahi). */
const COLLECTION_URL_BUILDERS = {
  jobs: (docId, data) => (data.slug ? `/job/${data.slug}` : `/job/${docId}`),
  fast_track: (docId, data) => `/update/${(data && data.slug) || docId}`,
  blogs: (docId) => `/blog/${docId}`,
  web_stories: (docId, data) => `/web-stories/${data.slug || docId}`,
  mock_tests: (docId) => `/test/${docId}`
};

/** In collections pe auto-indexing lagegi. */
const AUTO_INDEX_COLLECTIONS = Object.keys(COLLECTION_URL_BUILDERS);

/** Draft/archive wali states public index me nahi jaani chahiye. */
const NO_INDEX_STATUSES = new Set(["draft", "archived", "deleted", "pending"]);

function shouldIndex(collection, data) {
  if (!AUTO_INDEX_COLLECTIONS.includes(collection)) return false;
  const status = String(data?.status || "").toLowerCase().trim();
  return !NO_INDEX_STATUSES.has(status);
}

/** IndexNow batch submit (Bing family). deps.fetch injectable (tests). */
async function notifyIndexNow(urls, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  if (!fetchImpl) return { engine: "indexnow", skipped: "no-fetch" };
  const list = Array.isArray(urls) ? urls.filter(Boolean).slice(0, 100) : [];
  if (!list.length) return { engine: "indexnow", skipped: "no-urls" };
  const res = await fetchImpl("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: SITE_HOST,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList: list
    })
  });
  if (!res.ok) {
    const err = new Error(`IndexNow HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return { engine: "indexnow", submitted: list.length };
}

/** Service-account JSON env se Google Indexing API JWT banao (injectable for tests). */
function buildGoogleJwt(saJson, deps = {}) {
  const jwtLib = deps.jwtLib || require("google-auth-library");
  const sa = typeof saJson === "string" ? JSON.parse(saJson) : saJson;
  return new jwtLib.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/indexing"]
  });
}

/** Google Indexing API ko URL notify (SA env na ho to clean skip). */
async function notifyGoogle(url, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  // GOOGLE_INDEXING_SA_JSON ya functions secret SERVICE_ACCOUNT_JSON — dono chalenge
  const saRaw =
    deps.saJson !== undefined
      ? deps.saJson
      : process.env.GOOGLE_INDEXING_SA_JSON || process.env.SERVICE_ACCOUNT_JSON;
  if (!saRaw) return { engine: "google-indexing", skipped: "no-sa-json" };
  if (!fetchImpl) return { engine: "google-indexing", skipped: "no-fetch" };
  const jwt = buildGoogleJwt(saRaw, deps);
  const { access_token: token } = await jwt.authorize();
  const res = await fetchImpl("https://indexing.googleapis.com/v3/urlNotifications:publish", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url, type: "URL_UPDATED" })
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) {
    const err = new Error(`Google Indexing HTTP ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return { engine: "google-indexing", notified: url };
}

/**
 * Ek public URL ko dono engines pe submit karo — kabhi throw nahi karta
 * (indexing best-effort hai; publish ka main flow isse kabhi nahi rukta).
 */
async function notifyIndexing(url, deps = {}) {
  const results = await Promise.allSettled([notifyGoogle(url, deps), notifyIndexNow([url], deps)]);
  const [google, indexnow] = results;
  if (google.status === "rejected") console.warn(`auto-index: google notify failed for ${url}:`, google.reason?.message);
  if (indexnow.status === "rejected") console.warn(`auto-index: indexnow failed for ${url}:`, indexnow.reason?.message);
  return {
    url,
    google: google.status === "fulfilled" ? google.value : { error: google.reason?.message },
    indexnow: indexnow.status === "fulfilled" ? indexnow.value : { error: indexnow.reason?.message }
  };
}

/**
 * onDocumentCreated handler factory — index.js isko admin + logger de kar wire karta hai.
 * Pure logic test ke liye `deps.notify` inject ho sakta hai.
 */
function buildCreatedHandler(collection, deps = {}) {
  const notify = deps.notify || notifyIndexing;
  const FieldValue = deps.fieldValue; // serverTimestamp marker ke liye (optional in tests)
  return async (event) => {
    const snap = event && event.data;
    if (!snap) return null;
    const data = typeof snap.data === "function" ? snap.data() : snap.data || {};
    if (!shouldIndex(collection, data)) return null;
    const build = COLLECTION_URL_BUILDERS[collection];
    const docId = snap.id || (event.params && event.params.docId) || "";
    const path = build ? build(docId, data) : null;
    if (!path) return null;
    const url = `${SITE_URL}${path}`;
    await notify(url, deps.notifyDeps || {}).catch((e) =>
      console.warn(`auto-index: notify crash ${collection}/${docId}:`, e.message)
    );
    if (FieldValue && snap.ref && typeof snap.ref.set === "function") {
      await snap.ref
        .set({ seoIndexNotifiedAt: FieldValue.serverTimestamp(), seoIndexedUrl: url }, { merge: true })
        .catch((e) => console.warn(`auto-index: marker set failed ${collection}/${docId}:`, e.message));
    }
    return undefined;
  };
}

module.exports = {
  SITE_URL,
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  AUTO_INDEX_COLLECTIONS,
  COLLECTION_URL_BUILDERS,
  shouldIndex,
  notifyIndexNow,
  notifyGoogle,
  notifyIndexing,
  buildCreatedHandler,
  buildGoogleJwt
};
