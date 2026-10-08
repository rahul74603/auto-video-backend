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
const { generateJson, setGeminiApiKey } = require("./agents/article_agents/model_client");

// PHASE-3 v3.2 (2026-10-07): MULTI-EXAM — har famous exam ka apna course
// ("{Exam} Special {YEAR}"), andar sections → subjects → sets + syllabus doc.
// Din me 2 sets (user rule) → entries day-wise rotate hoti hain (4 din me full
// cycle). Firestore system_settings/auto_premium_sets.blueprints se override.
const DEFAULT_BLUEPRINTS = [
  // 🚂 Railway (5)
  { exam: "Railway", section: "Group D", packId: "__auto__" },
  { exam: "Railway", section: "RRB ALP", packId: "__auto__" },
  { exam: "Railway", section: "RRB NTPC", packId: "__auto__" },
  { exam: "Railway", section: "RPF Constable", packId: "__auto__" },
  { exam: "Railway", section: "RRB JE", packId: "__auto__" },
  // 🏛️ SSC (4)
  { exam: "SSC", section: "SSC CGL", packId: "__auto__" },
  { exam: "SSC", section: "SSC GD", packId: "__auto__" },
  { exam: "SSC", section: "SSC CHSL", packId: "__auto__" },
  { exam: "SSC", section: "SSC MTS", packId: "__auto__" },
  // 📖 Teaching (3)
  { exam: "Teaching", section: "CTET", packId: "__auto__" },
  { exam: "Teaching", section: "UPTET", packId: "__auto__" },
  { exam: "Teaching", section: "REET", packId: "__auto__" },
  // 🏦 Banking (4)
  { exam: "Banking", section: "IBPS PO & Clerk", packId: "__auto__" },
  { exam: "Banking", section: "SBI PO", packId: "__auto__" },
  { exam: "Banking", section: "IBPS RRB", packId: "__auto__" },
  { exam: "Banking", section: "RBI Assistant", packId: "__auto__" },
];

/** Din-wise rotation: 2 slots/din → saari entries 4 din me cover. */
function pickBlueprintEntry(blueprints, slot = 0, now = new Date()) {
  if (!Array.isArray(blueprints) || !blueprints.length) return null;
  return blueprints[(dayIndex(now) * 2 + slot) % blueprints.length];
}

// Purane "Dhamaka"-era packs — public Shop se hide (admin me dikhte rahenge).
// Ek baar hi update hota hai (system_settings.legacyHidden flag).
const LEGACY_PACK_IDS = [
  "KiHo60rN1f2gqpKCDsJn", // State Police & PET Dhamaka
  "KuCwULFEum71NBF8r5VJ", // Railway Exam Dhamaka 2026
  "T9uKeuIvAa6ZQdfswftA", // Teaching Master Dhamaka
  "j27uPy1IckNnFX00ZYN2", // SSC Exam Dhamaka 2026
  "tOIzBFXn7LQtZ18ueA8G", // Banking Selection Dhamaka
  "tQ42dLy5BLevJJh6qpoT", // Defense Warriors Dhamaka
];

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

/**
 * Ek run me `count` alag subjects cover hote hain (rotation) —
 * 2-3 din me har subject me sets aa jaate hain, Gemini quota bhi safe.
 */
function combosForRun(bp, slot = 0, now = new Date(), count = 2) {
  const subjects = bp.subjects || [];
  if (!subjects.length) return [];
  const di = dayIndex(now);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < count && out.length < subjects.length; i++) {
    const subject = subjects[(di * count + slot * count + i) % subjects.length];
    if (seen.has(subject.name)) continue;
    seen.add(subject.name);
    const types = subject.questionTypes || [];
    const type = types.length ? types[(di + slot + i) % types.length] : "Important Questions";
    out.push({ subject, type });
  }
  return out;
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

/**
 * 🔄 Retry helper — user rule (2026-10-07): "ek fail ho to retry 3 bar,
 * usse zyada nahi — phir next timer pe agla". Injectable sleep (tests).
 */
async function withRetries(fn, { attempts = 3, sleepMs = 30000, label = "task", _sleep = null } = {}) {
  const sleep = _sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastErr = e;
      console.warn(`⚠️ ${label} — attempt ${i}/${attempts} failed: ${String(e.message || e).slice(0, 160)}`);
      if (i < attempts) await sleep(sleepMs);
    }
  }
  throw lastErr;
}
exports.withRetries = withRetries;

async function generateOneExamSet({ db, entry, slot, combo }) {
  const { exam, section } = entry;
  let packId = entry.packId;
  if (!packId || packId === "__auto__") packId = await blueprint.ensureExamPack(db, exam);
  const bp = await blueprint.getOrBuildBlueprint({ db, exam, section, callJson: generateJson });
  if (!bp.subjects || !bp.subjects.length) {
    throw new Error(`Blueprint me subjects nahi mile (${exam} ${section})`);
  }
  const { sectionFolderId, subjectFolders } = await blueprint.ensureHierarchy(db, packId, bp);
  await blueprint.ensureSyllabusDoc(db, packId, sectionFolderId, bp);

  if (!combo) throw new Error("combo nahi bana");
  const folderId = subjectFolders[combo.subject.name] || sectionFolderId;
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

/** Ek baar: purane Dhamaka packs public se hide (admin safe). */
async function hideLegacyPacksOnce(db, cfg) {
  if (cfg.legacyHidden === true) return 0;
  let n = 0;
  for (const id of LEGACY_PACK_IDS) {
    try {
      await db.collection("courses").doc(id).update({
        hidden: true,
        hiddenAt: new Date().toISOString(),
        hiddenBy: "auto-premium-sets-v3",
      });
      n++;
    } catch {
      /* pack missing/permissions — skip */
    }
  }
  try {
    await db.collection("system_settings").doc("auto_premium_sets").set({ legacyHidden: true }, { merge: true });
  } catch {
    /* non-fatal */
  }
  return n;
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
// 🟢 STATUS (admin "System Status" tab): kab chala, kitne sets, kitni errors
async function writeSetsStatus(db, report) {
  try {
    await db.collection("system_settings").doc("auto_premium_sets").set({
      lastRunAt: new Date().toISOString(),
      lastSlot: report && report.slot !== undefined ? report.slot : null,
      lastSets: (report && report.sets || []).length,
      lastErrors: (report && report.errors || []).length,
      lastMode: (report && report.mode) || "exam",
      lastPaid: !!(report && report.paidFallback),
    }, { merge: true });
  } catch { /* non-fatal */ }
}

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

  // EXAM-DRIVEN MODE (DEFAULT) — cfg.mode==="legacy" explicit ho tabhi legacy
  const blueprints =
    cfg.mode === "legacy"
      ? null
      : Array.isArray(cfg.blueprints) && cfg.blueprints.length
        ? cfg.blueprints
        : DEFAULT_BLUEPRINTS;

  if (blueprints) {
    const report = { date, mode: "exam", slot, sets: [], errors: [], hiddenLegacyPacks: 0 };
    try {
      report.hiddenLegacyPacks = await hideLegacyPacksOnce(db, cfg);
    } catch {
      /* non-fatal */
    }
    const entry = pickBlueprintEntry(blueprints, slot, new Date());
    let combos = [];
    // USER RULE (2026-10-08): pehle 3 retry FREE flash pe; teeno fail to
    // PAID flash-lite fallback (sasta — ₹300-400/month cap). Sirf premium sets.
    const FREE_MODEL = process.env.AI_AGENT_MODEL || "gemini-2.5-flash";
    const PAID_LITE_MODEL = process.env.SETS_PAID_FALLBACK_MODEL || "gemini-2.5-flash-lite";
    const callJsonFor = (model) => (prompt, options = {}) => generateJson(prompt, { ...options, model });
    const buildCombos = (callJson, label) =>
      withRetries(async () => {
        const bp = await blueprint.getOrBuildBlueprint({ db, exam: entry.exam, section: entry.section, callJson });
        const c = combosForRun(bp, slot, new Date(), 1);
        if (!c.length) throw new Error("blueprint me subjects nahi");
        return c;
      }, { attempts: 3, sleepMs: 30000, label: `blueprint ${entry.exam}/${entry.section} [${label}]` });

    try {
      combos = await buildCombos(callJsonFor(FREE_MODEL), "free-flash");
    } catch (freeErr) {
      console.warn(`⚠️ FREE flash 3/3 fail — PAID flash-lite fallback: ${String(freeErr.message || freeErr).slice(0, 140)}`);
      // Do-key rule: paid (billing-enabled) SETS_GEMINI_API_KEY ho tabhi paid chale —
      // warna blogs/articles wala free key hi sab kuch hai (charge sirf sets pe).
      const paidKey = process.env.SETS_GEMINI_API_KEY;
      if (!paidKey) {
        console.warn("ℹ️ SETS_GEMINI_API_KEY (paid) set nahi hai — free key pe hi continue.");
      } else {
        setGeminiApiKey(paidKey); // model_client cache + env (premium_notes bhi env padhta hai)
      }
      try {
        combos = await buildCombos(callJsonFor(PAID_LITE_MODEL), paidKey ? "paid-flash-lite" : "free-flash-lite");
        report.paidFallback = !!paidKey;
      } catch (paidErr) {
        report.errors.push({
          entry,
          stage: "blueprint",
          error: `free: ${String(freeErr.message || freeErr).slice(0, 110)} | paid-lite: ${String(paidErr.message || paidErr).slice(0, 110)}`,
        });
      }
    }
    for (const combo of combos) {
      try {
        // USER RULE: fail ho to max 3 attempts (30s backoff), phir next timer
        const set = await withRetries(
          () => generateOneExamSet({ db, entry, slot, combo }),
          { attempts: 3, sleepMs: 30000, label: `set ${entry.section}/${combo.subject?.name}` }
        );
        report.sets.push(set);
      } catch (e) {
        report.errors.push({ entry, subject: combo.subject?.name, attempts: 3, error: String(e.message || e).slice(0, 250) });
      }
    }
    await writeSetsStatus(db, report);
    return report;
  }

  // LEGACY MODE (sirf cfg.mode==="legacy" pe)
  const legacy = await generateLegacySets({ db, cfg, opts });
  const out = { date, mode: "legacy", slot, sets: legacy.sets || [], errors: legacy.errors || [], skipped: legacy.skipped, reason: legacy.reason };
  await writeSetsStatus(db, out);
  return out;
}

module.exports = {
  runDailyPremiumSets,
  pickDailyTopics,
  pickDailyCombo,
  combosForRun,
  dayIndex,
  nextSetNumber,
  normalizeQ,
  qHash,
  collectAvoidQuestions,
  withRetries,
  pickBlueprintEntry,
  DEFAULT_TOPIC_POOL,
  DEFAULT_BLUEPRINTS,
  LEGACY_PACK_IDS,
};
