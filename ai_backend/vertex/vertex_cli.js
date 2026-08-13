"use strict";

/**
 * ============================================================================
 * ▶️ Vertex AI Agent Builder CLI — is credit (₹91,785) ko FULL use karo
 * ============================================================================
 * Usage:
 *   node vertex/vertex_cli.js --health            # config + budget status
 *   node vertex/vertex_cli.js --ingest            # Firestore → data store (billing)
 *   node vertex/vertex_cli.js --ingest --coll jobs --limit 50 --dry
 *   node vertex/vertex_cli.js --search "SSC CGL syllabus"   # RAG search
 *   node vertex/vertex_cli.js --chat "Jobs kya available hain?"
 *   node vertex/vertex_cli.js --status            # credit ledger
 * ============================================================================
 */

const vc = require("./vertex_client");
const vrag = require("./vertex_rag");
const vasst = require("./vertex_assistant");
const ledger = require("./vertex_credit_ledger");
const ingest = require("./vertex_ingest");
const vq = require("./vertex_questions");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
function has(name) { return process.argv.includes(name); }

function getFirestore() {
  return vc.firestore();
}

async function main() {
  if (has("--health")) {
    const s = vc.describeStatus();
    console.log("🧩 Vertex AI Agent Builder status:");
    console.log(JSON.stringify(s, null, 2));
    console.log("Credit left: ₹" + (await ledger.budgetLeft()));
    return;
  }
  if (has("--from-source")) {
    const title = arg("--from-source") || arg("--title") || "Practice Set";
    const text = arg("--text") || (process.env.SOURCE_TEXT || "");
    if (!text.trim()) { console.error("usage: node vertex/vertex_cli.js --from-source \"Title\" --text \"<content>\" [--exam X] [--n 25]"); process.exit(2); }
    const out = await vq.generateFromSource({
      title, exam: arg("--exam") || "", sourceText: text,
      totalQuestions: Number(arg("--n") || 25), save: !has("--dry"),
    });
    if (has("--dry")) console.log("📝 Generated (dry, not saved):", JSON.stringify({ title: out.title, count: out.count, usedVertex: out.usedVertex }, null, 2));
    else console.log(`📝 Question set saved: ${out.id} | ${out.title} | ${out.count} Q | ingested:${out.ingested} | usedVertex:${out.usedVertex}`);
    return;
  }
  if (has("--status")) {
    const { source, data } = await ledger.load();
    console.log(`💰 Vertex credit ledger (${source})`);
    console.log(`   Spent ₹${data.totalSpentInr} / budget ₹${vc.config().creditBudgetInr}`);
    (data.runs || []).slice(-15).forEach((r) =>
      console.log(`   ${r.at} | ${r.type} | ₹${r.costInr}${r.note ? " | " + r.note : ""}`));
    return;
  }
  if (has("--ingest")) {
    if (!vc.isConfigured()) { console.error("❌ Vertex not configured. Set VERTEX_PROJECT_ID & VERTEX_DATA_STORE_ID."); process.exit(2); }
    const db = getFirestore();
    const coll = arg("--coll");
    const limit = Number(arg("--limit") || 200);
    const dryRun = has("--dry");
    const result = coll
      ? await ingest.ingestCollection(db, coll, { limit, dryRun })
      : await ingest.ingestAll(db, { limit, dryRun });
    const imported = Array.isArray(result) ? result.reduce((a, r) => a + (r.imported || 0), 0) : result.imported;
    if (!dryRun) await ledger.recordSpend("ingest", { ok: true, docs: imported });
    console.log(`📥 Ingest ${dryRun ? "(DRY RUN)" : "done"}: ${Array.isArray(result) ? JSON.stringify(result) : JSON.stringify(result)}`);
    console.log("Credit left: ₹" + (await ledger.budgetLeft()));
    return;
  }
  if (has("--search")) {
    const q = arg("--search");
    if (!q) { console.error("usage: node vertex/vertex_cli.js --search \"query\""); process.exit(2); }
    const out = await vrag.search({ query: q, pageSize: Number(arg("--n") || 5) });
    await ledger.recordSpend("search", { ok: true });
    console.log(`🔎 Results (total=${out.total}):`, JSON.stringify(out.answers, null, 2));
    return;
  }
  if (has("--chat")) {
    const m = arg("--chat");
    if (!m) { console.error("usage: node vertex/vertex_cli.js --chat \"message\""); process.exit(2); }
    const out = await vasst.chat({ message: m, conversationId: arg("--conv") || undefined });
    await ledger.recordSpend("chat", { ok: true });
    console.log("💬 Reply:", out.reply);
    console.log("Sources:", JSON.stringify(out.sources, null, 2));
    return;
  }
  if (has("--questions")) {
    const topic = arg("--questions");
    if (!topic) { console.error("usage: node vertex/vertex_cli.js --questions \"topic\" [--exam X] [--n 25] [--dry]"); process.exit(2); }
    const out = await vq.generateQuestions({
      topic,
      exam: arg("--exam") || "",
      totalQuestions: Number(arg("--n") || 25),
      pageSize: Number(arg("--page") || 8),
      save: !has("--dry"),
    });
    if (has("--dry")) console.log("📝 Generated (dry, not saved):", JSON.stringify({ title: out.title, count: out.count }, null, 2));
    else console.log(`📝 Question set saved: ${out.id} | ${out.title} | ${out.count} Q | sources:${out.sources}`);
    return;
  }
  if (has("--list")) {
    const docs = await vrag.listDocuments(Number(arg("--n") || 20));
    console.log(`📚 Data store me ${docs.length} document(s) mili.`);
    docs.slice(0, 20).forEach((d) => console.log("   -", d.id, d.name));
    return;
  }
  if (has("--purge")) {
    // Saare (ya specific) documents data store se hatao (red-ingest se pehle).
    const out = await vrag.purgeDocuments({ deleteAll: true });
    console.log(`🗑️ Purge: ${out.purged} document(s) remove kiye.`);
    return;
  }
  console.log("Usage:");
  console.log("  node vertex/vertex_cli.js --health");
  console.log("  node vertex/vertex_cli.js --ingest [--coll jobs|blogs|fast_track] [--limit 200] [--dry]");
  console.log("  node vertex/vertex_cli.js --search \"query\" [--n 5]");
  console.log("  node vertex/vertex_cli.js --chat \"message\" [--conv conversationId]");
  console.log("  node vertex/vertex_cli.js --questions \"topic\" [--exam X] [--n 25] [--dry]");
  console.log("  node vertex/vertex_cli.js --from-source \"Title\" --text \"<content>\" [--exam X] [--n 25] [--dry]");
  console.log("  node vertex/vertex_cli.js --status");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
