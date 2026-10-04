"use strict";

/**
 * source_registry.js — Firestore-backed source registry (PHASE-2 item 1)
 * ======================================================================
 * Pehle sources govt_jobs.js me HARDCODED the. Ab:
 *  - `sources` collection (doc id = source name): { url, tier, kind, category,
 *    priority, enabled, lastChecked, lastSuccess, lastError, lastItemCount, status }
 *  - collection khali/na-ho to DEFAULT_SOURCES fallback (legacy list — Tier-2
 *    discovery feeds; official Tier-1 sources admin tab se jodta hai)
 *  - har fetch ke baad recordSourceCheck() health likhta hai — kabhi silent-fail nahi
 * Reads capped (limit 50) — Spark free-tier safe.
 */

const DEFAULT_SOURCES = [
  // ✅ Sab feeds LIVE-VERIFIED (23 Aug 2026) — Tier-2 DISCOVERY feeds.
  // Tier-1 (official) verification article-level source_fetcher karta hai.
  { name: "IndGovtJobs", url: "https://www.indgovtjobs.in/feeds/posts/default?alt=rss", tier: 2, kind: "rss" },
  { name: "FreeJobAlert", url: "https://www.freejobalert.com/feed/", tier: 2, kind: "rss" },
  { name: "SarkariExam", url: "https://www.sarkariexam.com/feed", tier: 2, kind: "rss" },
  { name: "SarkariJobFind", url: "https://sarkarijobfind.com/feed/", tier: 2, kind: "rss" },
  { name: "RojgarResult", url: "https://rojgarresult.com/feed/", tier: 2, kind: "rss" },
  { name: "GovtJobsBlog", url: "https://www.govtjobsblog.in/feed/", tier: 2, kind: "rss" },
  { name: "SarkariNaukriD", url: "https://www.sarkarinaukridaily.in/feed/", tier: 2, kind: "rss" },
];

/** Enabled sources: registry first, warna legacy fallback. Kabhi throw nahi. */
async function getEnabledSources(db, fallback = DEFAULT_SOURCES) {
  if (!db) return fallback;
  try {
    const snap = await db.collection("sources").where("enabled", "==", true).limit(50).get();
    if (!snap || snap.empty) return fallback;
    const list = snap.docs
      .map((d) => ({ name: d.id, ...d.data() }))
      .filter((s) => s && typeof s.url === "string" && s.url.startsWith("http"));
    return list.length ? list : fallback;
  } catch {
    return fallback;
  }
}

/** Per-source health — admin dashboard + failure handling ke liye. Best-effort. */
async function recordSourceCheck(db, name, { ok, error = null, itemCount = 0 } = {}) {
  if (!db || !name) return;
  const nowIso = new Date().toISOString();
  const patch = ok
    ? { lastChecked: nowIso, lastSuccess: nowIso, lastError: null, lastItemCount: Number(itemCount) || 0, status: "ok" }
    : { lastChecked: nowIso, lastError: String(error || "unknown").slice(0, 300), status: "error" };
  try {
    await db.collection("sources").doc(String(name)).set(patch, { merge: true });
  } catch {
    /* health-write fail hone par scraping kabhi nahi rukta */
  }
}

module.exports = { DEFAULT_SOURCES, getEnabledSources, recordSourceCheck };
