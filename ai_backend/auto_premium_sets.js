"use strict";

/**
 * auto_premium_sets.js — 📚 DAILY AUTO PREMIUM SETS (PHASE-3 v2)
 * =================================================================
 * Roz 2 premium sets (2:30 AM + 3:20 AM IST — GitHub Actions cron, FREE compute)
 * × 20-30 most-important questions — existing premium_notes pattern pe.
 *
 * EXAM-DRIVEN MODE (default jab config ho):
 *   exam_blueprints (syllabus research se) → hierarchy:
 *     "{Exam} Special {YEAR}" → "{Section}" → "{Subject}" → question-type sets
 *   - subjects/question-types blueprint se (sirf jo exam me aate hain)
 *   - section folder me syllabus/eligibility/physical doc (users ke liye)
 *   - ZERO-DUPLICATE: recent sets ke question texts avoid-list me inject
 *   - auto Set N per subject folder
 *
 * LEGACY MODE (fallback): generic important-topic pool rotation.
 *
 * Config: system_settings/auto_premium_sets
 *   { blueprints: [{exam, section, packId}], topics: [...], packs: [...], exam }
 * Kill-switch: automation_guard feature "auto_premium_sets".
 */

const crypto = require("crypto");
const { runPremiumSetGeneration } = require("./premium_notes");
const { isAutomationEnabled } = require("./agents/automation_guard");
const blueprint = require("./exam_blueprint");
const { generateJson } = require("./agents/article_agents/model_client");

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

function pickDailyTopics(topics, now = new Date(), count = 2) {
  const pool = Array.isArray(topics) && topics.length ? topics : DEFAULT_TOPIC_POOL;
  const di = dayIndex(now);
  const picked = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    picked.push(pool[(di * count + i) % pool.length]);
  }
  return picked;
}

/* ---------------- ZERO-DUPLICATE helpers ---------------- */

function normalizeQ(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9\u0900-\u097F]+/g, " ")
    .trim();
}

function qHash(text) {
  return crypto.createHash("md5").update(normalizeQ(text)).digest("hex").slice(0, 12);
}

/** Recent sets (subject folder) ke question-texts — avoid-list ke liye. */
async function collectAvoidQuestions(db, packId, folderId, limitSets = 10) {
  try {
    const snap = await db
      .collection("courses")
      .doc(packId)
      .collection("content")
      .where("parentId", "==", folderId)
      .limit(50)
      .get();
    const texts = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      if (data.type === "FOLDER") return;
      const qs = String(data.content || "").match(/Q\.\d+[\s\S]*?(?=Q\.\d+|$)/g) || [];
      qs.forEach((q) => {
        const t = q.replace(/<[^>]*>/g, "").substring(0, 100).trim();
        if (t.length > 20) texts.push(t);
      });
    });
    return texts.slice(0, limitSets * 25).join("\n");
  } catch {
    return "";
  }
}

/** Exam mode: din+slot se deterministic subject+questionType combo. */
function pickDailyCombo(bp, slot = 0, now = new Date()) {
  const subjects = bp.subjects || [];
  if (!subjects.length) return null;
  const di = dayIndex(now);
  const subject = subjects[(di + slot) % subjects.length];
  const types = subject.questionTypes || [];
  const type = types.length ? types[(di + slot) % types.length] : "Important Questions";
  return { subject, type };
}

async function nextSetNumber(db, packId, topic, folderId = null) {
  try {
    const col = db.collection("courses").doc(packId).collection("content");
    const snap = folderId
      ? await col.where("parentId", "==", folderId).limit(200).get()
      : await col.where("topic", "==", topic).limit(200).get();
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

/* ---------------- main runner ---------------- */

async function generateOneExamSet({ db, entry, slot, cfg }) {
  const { exam, section, packId } = entry;
  const bp = await blueprint.getOrBuildBlueprint({ db, exam, section, callJson: generateJson });
  if (!bp.subjects || !bp.subjects.length) {
    throw new Error(`Blueprint me subjects nahi mile (${exam} ${section})`);
  }
  const { l2, subjectFolders } = await blueprint.ensureHierarchy(db, packId, bp);
  await blueprint.ensureSyllabusDoc(db, packId, l2, bp);

  const combo = pickDailyCombo(bp, slot);
  if (!combo) throw new Error("combo nahi bana");
  const folderId = subjectFolders[combo.subject.name] || l2;
  const topic = `${combo.subject.name}: ${combo.type}`;
  const setNumber = await nextSetNumber(db, packId, topic, folderId);
  const avoid = await collectAvoidQuestions(db, packId, folderId);

  const result = await runPremiumSetGeneration({
    topic,
    packId,
    folderId,
    setNumber,
    exam: `${bp.exam} ${bp.section}`,
    subject: combo.subject.name,
    avoidQuestions: avoid,
  });
  return { packId, exam, section, subject: combo.subject.name, questionType: combo.type, setNumber, docId: result.id, model: result.model };
}

async function generateLegacySets({ db, cfg, opts }) {
  const topics = cfg.topics || opts.topics || DEFAULT_TOPIC_POOL;
  let packs = cfg.packs || opts.packs || null;
  if (!packs || !packs.length) packs = (await getDefaultPacks(db)).map((p) => p.id);
  if (!packs.length) return { skipped: true, reason: "koi course pack nahi mila" };

  const picked = pickDailyTopics(topics, new Date(), 2);
  const out = { sets: [], errors: [] };
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
      const result = await runPremiumSetGeneration({ topic, packId, setNumber, exam, subject: topic });
      out.sets.push({ packId, topic, setNumber, docId: result.id, model: result.model });
    } catch (e) {
      out.errors.push({ packId, topic, error: String(e.message || e).slice(0, 200) });
    }
  }
  return out;
}

/**
 * @param {object} db
 * @param {{slot?: number, packs?: string[], topics?: string[], exam?: string}} opts
 * slot: 0 = 2:30 AM run, 1 = 3:20 AM run (exam mode me 1 set per slot)
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

  const slot = Number(opts.slot ?? 0);
  const date = new Date().toISOString().slice(0, 10);

  // EXAM-DRIVEN MODE
  if (Array.isArray(cfg.blueprints) && cfg.blueprints.length) {
    const entry = cfg.blueprints[slot % cfg.blueprints.length];
    const report = { date, mode: "exam", slot, sets: [], errors: [] };
    try {
      report.sets.push(await generateOneExamSet({ db, entry, slot, cfg }));
    } catch (e) {
      report.errors.push({ entry, error: String(e.message || e).slice(0, 250) });
    }
    return report;
  }

  // LEGACY MODE (2 sets per run nahi — legacy cron ek baar; slot ignore)
  const legacy = await generateLegacySets({ db, cfg, opts });
  return { date, mode: "legacy", slot, sets: legacy.sets || [], errors: legacy.errors || [], skipped: legacy.skipped, reason: legacy.reason };
}

module.exports = {
  runDailyPremiumSets,
  pickDailyTopics,
  pickDailyCombo,
  dayIndex,
  nextSetNumber,
  normalizeQ,
  qHash,
  collectAvoidQuestions,
  DEFAULT_TOPIC_POOL,
};
