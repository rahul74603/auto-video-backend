"use strict";

/**
 * ============================================================================
 * 💰 CREDIT GOVERNOR  —  ₹91,785 Free Trial Credit ko FULL USE karne ka controller
 *
 * ⚠️ NOTE (importante): ₹91,785 aapka Vertex AI Agent Builder trial credit hai —
 *    wo SIRF Vertex AI (Discovery Engine / Search / RAG / Agents) SKUs pe
 *    chalta hai. STANDARD Gemini API (jo neeche wale generators use karte hain)
 *    us credit ko NAHI kaata.
 *
 *    Us credit ke liye use karo:  vertex/vertex_cli.js  (RAG + chat + ingest)
 *       cd ai_backend && npm run vertex:health | vertex:ingest | vertex:search | vertex:chat
 *
 *    Yeh governor (Gemini generators) kisi dusre/BYTOC Gemini credit ko use karne
 *    ke liye hai — harmless hai, existing program nahi todta.
 * ============================================================================
 *
 * Yeh ek naya, NON-INVASIVE automation controller hai. Ye kisi bhi existing
 * module ko MODIFY nahi karta (na govt_jobs, na auto_blog, na article pipeline)
 * — isliye existing program bilkul NAHI tootega. Ye sirf unko SCHEDULE pe chalata
 * hai aur AI-credit ka ledger rakh leta hai, taaki Google Cloud / Gemini ka free
 * trial credit (₹91,785) waste na ho.
 *
 * # Yeh kya karta hai
 *   1. EK BUDGET (default: ₹91,785) ko env se load karta hai.
 *   2. Har run ke baad estimated AI spend (tokens → ₹) ka hisaab lagata hai.
 *   3. Spend ko Firestore ledger (`credit_ledger`) me likhta hai; Firestore na
 *      mile to local JSON ledger (`credit_ledger_local.json`) fallback — koi
 *      crash nahi.
 *   4. Budget khatam hone pe auto-stop (over-spend nahi karega).
 *   5. Existing heavy-AI generators ko ek-saath chala kar credit consume karta hai:
 *        - govt_jobs   → runJobScraper()  (Gemini AI job extraction)
 *        - auto_blog   → generateDailyBlog() (Gemini blog content)
 *        - (baaki easily add kiye ja sakte hain)
 *
 * # Kaise chalao
 *   cd ai_backend && node credit_governor.js --run            # ek full run
 *   node credit_governor.js --budget 91785 --limit 5          # sirf 5 items
 *   node credit_governor.js --status                          # kitna credit bacha
 *
 * # Auto-schedule (cron) — Firebase Cloud Scheduler pe
 *   Manual run har din chahiye to neeche diya sample cron use karo:
 *   0 6 * * *   cd ai_backend && node credit_governor.js --run
 *
 * # ENV vars (ai_backend/.env me)
 *   AI_CREDIT_BUDGET_INR=91785      # total free credit (₹)
 *   AI_CREDIT_COST_PER_1K_TOKENS=0.00008  # ~Gemini flash input rate (₹/1k tokens)
 *   AI_CREDIT_GENERATORS=jobs,blog  # koun-koun se generators chalane hain
 *   AI_CREDIT_MAX_ITEMS=5           # ek run me max items
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
try { require("dotenv").config(); } catch { /* dotenv optional (sandbox/prod env vars) */ }

// ---------- Config (env-friendly, sensible defaults) ----------
function envOr(key, def) {
  const v = process.env[key];
  return v !== undefined && String(v).trim() !== "" ? v : def;
}
const CONFIG = {
  budgetInr: Number(envOr("AI_CREDIT_BUDGET_INR", 91785)),
  costPer1kTokens: Number(envOr("AI_CREDIT_COST_PER_1K_TOKENS", 0.00008)), // ₹/1k tokens (Gemini flash approx)
  generators: String(envOr("AI_CREDIT_GENERATORS", "jobs,blog"))
    .split(",").map((s) => s.trim()).filter(Boolean),
  maxItems: Number(envOr("AI_CREDIT_MAX_ITEMS", 5)),
  ledgerCollection: "credit_ledger",
  localLedgerFile: path.join(__dirname, "credit_ledger_local.json"),
};

// ---------- Firestore (soft-init; fail → local JSON) ----------
function getFirestore() {
  try {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      const saVar = process.env.SERVICE_ACCOUNT_JSON;
      if (saVar) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(saVar)),
          projectId: process.env.FIREBASE_PROJECT_ID || "studymaterial-406ad",
        });
      } else {
        admin.initializeApp();
      }
    }
    return admin.firestore();
  } catch {
    return null;
  }
}

// ---------- Local JSON ledger helpers ----------
function readLocalLedger() {
  try {
    if (fs.existsSync(CONFIG.localLedgerFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.localLedgerFile, "utf8"));
    }
  } catch { /* ignore */ }
  return { totalSpentInr: 0, runs: [] };
}

function writeLocalLedger(ledger) {
  try {
    fs.writeFileSync(CONFIG.localLedgerFile, JSON.stringify(ledger, null, 2));
  } catch { /* ignore */ }
}

// ---------- Load ledger (Firestore preferred, else local) ----------
async function loadLedger() {
  const db = getFirestore();
  if (db) {
    try {
      const snap = await db.collection(CONFIG.ledgerCollection).doc("governor").get();
      if (snap.exists) return { source: "firestore", data: snap.data() };
      const blank = { totalSpentInr: 0, runs: [] };
      await db.collection(CONFIG.ledgerCollection).doc("governor").set(blank);
      return { source: "firestore", data: blank };
    } catch { /* fall through */ }
  }
  return { source: "local", data: readLocalLedger() };
}

// ---------- Persist ledger ----------
async function saveLedger(source, data) {
  if (source === "firestore") {
    const db = getFirestore();
    try {
      await db.collection(CONFIG.ledgerCollection).doc("governor").set(data, { merge: true });
      return;
    } catch { /* fall through */ }
  }
  writeLocalLedger(data);
}

// ---------- Estimated AI cost (rough, from token count) ----------
function estimateCostInr(tokenEstimate) {
  return Math.round((tokenEstimate / 1000) * CONFIG.costPer1kTokens * 100) / 100;
}

/**
 * Kisi bhi generator function ko run karta hai aur
 * (a) tokens → ₹ estimated spend, (b) success/fail log rakhta hai.
 * Har generator se 0 ya `estimatedTokens` return hone pe 5000 default tokens
 * maan leta hai (conservative estimate — real billing Google console se pakka).
 */
async function runGeneratorWithLedger(name, fn, ledger, runDate) {
  const start = Date.now();
  try {
    const result = await fn();
    const itemCount =
      (result && Array.isArray(result)) ? result.length
      : (result && result.processed) ? result.processed
      : CONFIG.maxItems;
    const tokens = Number(result?.estimatedTokens) || itemCount * 5000 || 5000;
    const costInr = estimateCostInr(tokens);
    const entry = {
      generator: name,
      at: runDate,
      ok: true,
      items: itemCount,
      estimatedTokens: tokens,
      costInr,
      ms: Date.now() - start,
    };
    ledger.runs.push(entry);
    ledger.totalSpentInr = Math.round((ledger.totalSpentInr + costInr) * 100) / 100;
    return entry;
  } catch (err) {
    const entry = {
      generator: name,
      at: runDate,
      ok: false,
      error: String(err?.message || err).slice(0, 300),
      costInr: 0,
      ms: Date.now() - start,
    };
    ledger.runs.push(entry);
    return entry;
  }
}

// ---------- Individual generator runners (thin, safe wrappers) ----------
async function runJobsGenerator() {
  const govt = require("./govt_jobs.js");
  const out = await govt.runJobScraper(CONFIG.maxItems);
  return Array.isArray(out) ? out : { processed: out?.processed || CONFIG.maxItems };
}

async function runBlogGenerator() {
  const blog = require("./auto_blog.js");
  await blog.generateDailyBlog();
  return { processed: 1 };
}

const GENERATORS = {
  jobs: { label: "govt_jobs (Gemini job extraction)", run: runJobsGenerator },
  blog: { label: "auto_blog (Gemini blog writer)", run: runBlogGenerator },
};

// ---------- Main run ----------
async function runCycle() {
  const { source, data: ledger } = await loadLedger();
  const budgetLeft = Math.max(0, CONFIG.budgetInr - (ledger.totalSpentInr || 0));
  const runDate = new Date().toISOString();

  console.log(`💰 Credit Governor — Budget: ₹${CONFIG.budgetInr} | Spent: ₹${ledger.totalSpentInr} | Left: ₹${budgetLeft} (ledger: ${source})`);

  if (budgetLeft <= 0) {
    console.log("⛔ Budget exhausted. Credit FULL use ho chuka hai. Auto-stopping.");
    return { status: "budget_exhausted", spent: ledger.totalSpentInr };
  }

  if (CONFIG.generators.length === 0) {
    console.log("⚠️  No generators selected. Set AI_CREDIT_GENERATORS (e.g. jobs,blog).");
    return { status: "no_generators" };
  }

  const results = [];
  for (const name of CONFIG.generators) {
    const gen = GENERATORS[name];
    if (!gen) {
      console.log(`❓ Unknown generator: ${name} (skip)`);
      continue;
    }
    console.log(`▶️  Running ${gen.label} ...`);
    const entry = await runGeneratorWithLedger(name, gen.run, ledger, runDate);
    const mark = entry.ok ? "✅" : "❌";
    console.log(`   ${mark} ${name} → items:${entry.items ?? "-"} ~₹${entry.costInr} (${entry.ms}ms)`);
    results.push(entry);
  }

  await saveLedger(source, ledger);

  console.log(`📊 After run — total spent: ₹${ledger.totalSpentInr} | left: ₹${Math.max(0, CONFIG.budgetInr - ledger.totalSpentInr)}`);
  return { status: "done", results, spent: ledger.totalSpentInr };
}

// ---------- Status ----------
async function showStatus() {
  const { source, data: ledger } = await loadLedger();
  const left = Math.max(0, CONFIG.budgetInr - (ledger.totalSpentInr || 0));
  console.log(`💰 Credit Governor status`);
  console.log(`   Budget   : ₹${CONFIG.budgetInr}`);
  console.log(`   Spent    : ₹${ledger.totalSpentInr}`);
  console.log(`   Left     : ₹${left}`);
  console.log(`   Ledger   : ${source}`);
  console.log(`   Runs     : ${(ledger.runs || []).length}`);
  (ledger.runs || []).slice(-10).forEach((r) =>
    console.log(`     ${r.at} | ${r.generator} | ${r.ok ? "✅" : "❌"} | ~₹${r.costInr}${r.error ? " | " + r.error : ""}`));
}

// ---------- CLI ----------
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--status")) return showStatus();
  if (args.includes("--run")) {
    const biIdx = args.indexOf("--budget");
    if (biIdx >= 0 && args[biIdx + 1]) CONFIG.budgetInr = Number(args[biIdx + 1]);
    const liIdx = args.indexOf("--limit");
    if (liIdx >= 0 && args[liIdx + 1]) CONFIG.maxItems = Number(args[liIdx + 1]);
    return runCycle();
  }
  console.log("Usage:");
  console.log("  node credit_governor.js --run                # full cycle");
  console.log("  node credit_governor.js --run --budget 91785 # override budget");
  console.log("  node credit_governor.js --status             # kitna credit bacha");
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { runCycle, showStatus, CONFIG };
