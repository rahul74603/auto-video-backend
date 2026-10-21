"use strict";

/**
 * post_latest.js — 📣 Daily social auto-post (P1-6)
 * =================================================
 * Problem: saare social workflows manual-only / event-driven the, aur
 * publish path se koi event fire nahi hota tha → distribution ~zero.
 *
 * Ye script roz 1 baar (social_daily.yml) chalke LATEST published item
 * (jobs / fast_track / blogs me se newest) ko FB + Twitter + LinkedIn
 * pe post karta hai — via social_orchestrator (guards + creds wahi).
 *
 * Safety:
 *  - Latest item 36h se purana ho → skip (stale reshare nahi)
 *  - system_status/social_daily.lastPostedId same ho → skip (duplicate nahi)
 *  - Koi published item na mile → skip, exit 0
 */

const COLLECTIONS = Object.freeze([
  { name: "jobs", type: "JOB" },
  { name: "fast_track", type: "FAST_TRACK" },
  { name: "blogs", type: "BLOG" },
]);

const MAX_POST_AGE_HOURS = 36;
const STATUS_DOC = "system_status/social_daily";

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (ts.toMillis) return ts.toMillis();
  if (ts.toDate) return ts.toDate().getTime();
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** createdAt/updatedAt/publishedAt me se newest timestamp (ms) */
function itemTime(data = {}) {
  return Math.max(
    toMillis(data.createdAt),
    toMillis(data.updatedAt),
    toMillis(data.publishedAt),
    toMillis(data.publishedDate),
    0
  );
}

function isFresh(data, nowMs = Date.now(), maxHours = MAX_POST_AGE_HOURS) {
  const t = itemTime(data);
  if (!t) return false;
  return nowMs - t <= maxHours * 3600 * 1000;
}

function isIndexableStatus(data = {}) {
  if (data.noIndex === true || data.deleted === true || data.isDeleted === true) return false;
  const status = String(data.status || "").trim().toLowerCase();
  if (["draft", "pending", "rejected", "private", "archived", "deleted", "trash"].includes(status)) return false;
  return String(data.title || data.post_name || "").trim().length >= 5;
}

/** candidates [{type, id, data}] me se newest indexable item (ya null) */
function pickNewest(candidates = []) {
  let best = null;
  let bestTime = 0;
  for (const c of candidates) {
    if (!c || !c.data || !isIndexableStatus(c.data)) continue;
    const t = itemTime(c.data);
    if (t > bestTime) {
      bestTime = t;
      best = c;
    }
  }
  return best;
}

function initDb() {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    const raw = process.env.SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) {
      try {
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
      } catch (e) {
        console.error("post_latest: service-account parse fail:", e.message);
        admin.initializeApp();
      }
    } else {
      admin.initializeApp();
    }
  }
  return admin.firestore();
}

async function fetchLatestCandidates(db) {
  const out = [];
  for (const col of COLLECTIONS) {
    try {
      const snap = await db.collection(col.name).orderBy("createdAt", "desc").limit(5).get();
      snap.forEach((doc) => out.push({ type: col.type, id: doc.id, data: doc.data() }));
    } catch (e) {
      console.error(`post_latest: ${col.name} read fail:`, e.message);
    }
  }
  return out;
}

async function main() {
  const db = initDb();
  const candidates = await fetchLatestCandidates(db);
  const newest = pickNewest(candidates);
  if (!newest) {
    console.log("📣 post_latest: koi fresh published item nahi — skip.");
    return true;
  }
  if (!isFresh(newest.data)) {
    console.log(`📣 post_latest: newest item 36h+ purana ("${newest.data.title}") — skip.`);
    return true;
  }
  const dedupeKey = `${newest.type}:${newest.data.slug || newest.id}`;
  try {
    const statusDoc = await db.doc(STATUS_DOC).get();
    if (statusDoc.exists && statusDoc.data().lastPostedId === dedupeKey) {
      console.log(`📣 post_latest: "${dedupeKey}" pehle hi post ho chuka — skip.`);
      return true;
    }
  } catch (e) {
    console.warn("post_latest: dedupe-check fail (continue):", e.message);
  }

  const { postToAllPlatforms } = require("./social_orchestrator");
  console.log(`📣 post_latest: posting ${newest.type} — ${newest.data.title}`);
  const result = await postToAllPlatforms({
    type: newest.type,
    data: { ...newest.data, id: newest.id },
    db,
  });
  console.log("📊 post_latest result:", JSON.stringify(result, null, 2));

  try {
    await db.doc(STATUS_DOC).set(
      { lastPostedId: dedupeKey, postedAt: new Date().toISOString(), title: String(newest.data.title || "").slice(0, 200) },
      { merge: true }
    );
  } catch (e) {
    console.warn("post_latest: status-write fail:", e.message);
  }
  return true;
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("📣 post_latest FATAL:", err && err.message);
      process.exit(1);
    });
}

module.exports = {
  COLLECTIONS,
  MAX_POST_AGE_HOURS,
  STATUS_DOC,
  itemTime,
  isFresh,
  isIndexableStatus,
  pickNewest,
};
