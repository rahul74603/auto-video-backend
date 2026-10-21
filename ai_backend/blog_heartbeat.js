"use strict";

/**
 * blog_heartbeat.js — 💓 Auto-Blogger outcome reporter (P0-4)
 * ============================================================
 * Problem: sitemap-blogs me May-30 ke baad ZERO naye blogs, jabki
 * auto_blog.yml har run green (exit 0). Code-read se root cause nahi
 * mila — isliye har run ka outcome Firestore me likho taaki agli baar
 * data se pata chale: published? cap-skip? error? silent-exit?
 *
 * Doc: system_status/blog_pipeline (merge-write, har run overwrite)
 * Fields: outcome, runId, finishedAt, savedCount, title, url, reason
 */

const HEARTBEAT_DOC_PATH = "system_status/blog_pipeline";

const OUTCOMES = Object.freeze({
  PUBLISHED: "published",
  CAP_SKIP: "cap_skip",
  ERROR: "error",
});

function currentRunId() {
  return (
    process.env.GITHUB_RUN_ID ||
    `local-${Date.now()}`
  );
}

/**
 * Pure payload builder (unit-testable, koi I/O nahi).
 */
function buildHeartbeatPayload({
  outcome,
  savedCount = 0,
  title = "",
  url = "",
  reason = "",
  runId = currentRunId(),
  finishedAt = new Date().toISOString(),
} = {}) {
  const valid = Object.values(OUTCOMES);
  const safeOutcome = valid.includes(outcome) ? outcome : OUTCOMES.ERROR;
  return {
    outcome: safeOutcome,
    runId: String(runId),
    finishedAt: String(finishedAt),
    savedCount: Number(savedCount) || 0,
    title: String(title || "").slice(0, 200),
    url: String(url || "").slice(0, 300),
    reason: String(reason || "").slice(0, 500),
    source: "auto_blog_v4",
  };
}

/**
 * Heartbeat Firestore me likho. Kabhi throw nahi karta —
 * heartbeat fail ho to blog run fail nahi hona chahiye.
 */
async function writeHeartbeat(db, payload) {
  try {
    if (!db || typeof db.doc !== "function") {
      console.error("💓 heartbeat skip: db unavailable");
      return false;
    }
    await db.doc(HEARTBEAT_DOC_PATH).set(payload, { merge: true });
    console.log(`💓 heartbeat: ${payload.outcome} (run ${payload.runId})`);
    return true;
  } catch (err) {
    console.error("💓 heartbeat write fail:", err && err.message);
    return false;
  }
}

module.exports = {
  HEARTBEAT_DOC_PATH,
  OUTCOMES,
  buildHeartbeatPayload,
  writeHeartbeat,
};
