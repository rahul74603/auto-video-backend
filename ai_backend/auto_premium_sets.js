"use strict";

/**
 * auto_premium_sets.js — 📚 DAILY AUTO PREMIUM SETS (PHASE-3)
 * ============================================================
 * Roz AUTOMATIC 2 premium sets × 25 most-important questions —
 * existing premium_notes ke EXACT pattern/branding/SEO pe
 * (runPremiumSetGeneration = wahi handler logic, koi duplication nahi).
 *
 * Flow (GitHub Actions cron → api route → ye runner):
 *   1. automation_guard check (feature: auto_premium_sets; default ON,
 *      admin tab se OFF ho sakta hai; global kill-switch respected)
 *   2. Config: system_settings/auto_premium_sets { packs, topics, exam }
 *      — na ho to defaults (pehle 2 course packs + IMPORTANT-topic pool)
 *   3. Din ke 2 topics deterministic rotate (roz naya combination)
 *   4. Har topic ka auto next Set N (existing max+1 — user rule)
 *   5. runPremiumSetGeneration (25-Q gate + dedupe + branding + SEO built-in)
 *   6. Ek set fail ho to doosra ruke NAHI — errors report me aate hain
 *
 * COST-SAFE: exactly 2 Gemini calls/din default; packs/topics admin-configurable.
 */

const { runPremiumSetGeneration } = require("./premium_notes");
const { isAutomationEnabled } = require("./agents/automation_guard");

// 🔑 "Most important" topic pool — exam-pattern ke evergreen high-weightage
// topics. Admin system_settings/auto_premium_sets.topics se override kar sakta hai.
const DEFAULT_TOPIC_POOL = [
  "Maths: Percentage, Ratio & Average",
  "Maths: Time-Speed-Distance & Trains",
  "Reasoning: Number & Alphabet Series",
  "Reasoning: Coding-Decoding & Blood Relations",
  "Polity: Important Articles & Amendments",
  "History: Modern India & Freedom Struggle",
  "Geography: Rivers, Lakes & Mountains of India",
  "General Science: Human Body & Diseases",
  "General Knowledge: Important Days & Firsts in India",
  "Hindi Grammar: Sandhi, Samas & Alankar",
  "English: Error Spotting & Vocabulary",
  "Computer: Basics, Shortcuts & Internet",
  "Current Affairs: Last 6 Months Highlights",
  "Economy: Banking & Budget Basics",
];

function dayIndex(now = new Date()) {
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

/** Deterministic daily pick — same din same topics, roz naya pair, no repeat within pair. */
function pickDailyTopics(topics, now = new Date(), count = 2) {
  const pool = Array.isArray(topics) && topics.length ? topics : DEFAULT_TOPIC_POOL;
  const di = dayIndex(now);
  const picked = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    picked.push(pool[(di * count + i) % pool.length]);
  }
  return picked;
}

/** Existing max setNumber(topic) + 1 — user rule: auto next Set N. */
async function nextSetNumber(db, packId, topic) {
  try {
    const snap = await db
      .collection("courses")
      .doc(packId)
      .collection("content")
      .where("topic", "==", topic)
      .limit(100)
      .get();
    let max = 0;
    snap.forEach((d) => {
      max = Math.max(max, Number(d.data().setNumber) || 0);
    });
    return max + 1;
  } catch {
    return 1;
  }
}

async function getDefaultPacks(db) {
  const snap = await db.collection("courses").limit(2).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

/**
 * @param {object} db firestore
 * @param {{packs?: string[], topics?: string[], exam?: string}} opts route-override
 * @returns {Promise<{skipped?: boolean, reason?: string, date: string, sets: object[], errors: object[]}>}
 */
async function runDailyPremiumSets(db, opts = {}) {
  const guard = await isAutomationEnabled(db, "auto_premium_sets");
  if (!guard.enabled) {
    return { skipped: true, reason: guard.reason, date: new Date().toISOString().slice(0, 10), sets: [], errors: [] };
  }

  let cfg = {};
  try {
    cfg = (await db.collection("system_settings").doc("auto_premium_sets").get()).data() || {};
  } catch {
    cfg = {};
  }

  const topics = cfg.topics || opts.topics || DEFAULT_TOPIC_POOL;
  let packs = cfg.packs || opts.packs || null;
  if (!packs || !packs.length) {
    packs = (await getDefaultPacks(db)).map((p) => p.id);
  }
  if (!packs.length) {
    return { skipped: true, reason: "koi course pack nahi mila — pehle pack banao", date: new Date().toISOString().slice(0, 10), sets: [], errors: [] };
  }

  const picked = pickDailyTopics(topics, new Date(), 2);
  const report = { date: new Date().toISOString().slice(0, 10), sets: [], errors: [] };

  for (let i = 0; i < picked.length; i++) {
    const packId = packs[i % packs.length];
    const topic = picked[i];
    try {
      let exam = opts.exam || cfg.exam || "";
      if (!exam) {
        try {
          const p = (await db.collection("courses").doc(packId).get()).data();
          exam = (p && (p.exam || p.title)) || "SSC CGL";
        } catch {
          exam = "SSC CGL";
        }
      }
      const setNumber = await nextSetNumber(db, packId, topic);
      const result = await runPremiumSetGeneration({
        topic,
        packId,
        setNumber,
        exam,
        subject: topic,
      });
      report.sets.push({ packId, topic, setNumber, docId: result.id, model: result.model });
    } catch (e) {
      // ek set ka fail doosre ko nahi rokta
      report.errors.push({ packId, topic, error: String(e.message || e).slice(0, 200) });
    }
  }
  return report;
}

module.exports = {
  runDailyPremiumSets,
  pickDailyTopics,
  dayIndex,
  nextSetNumber,
  DEFAULT_TOPIC_POOL,
};
