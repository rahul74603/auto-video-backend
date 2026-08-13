import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/firebase/config";
import { ARTICLE_API_BASE } from "@/features/ai-articles/data/aiArticleRepository";
import { extractTextFromFile } from "@/features/ai-articles/data/pdfTextExtractor";
import {
  Bot, Search, Database, RefreshCw, IndianRupee, ShieldCheck, AlertTriangle, CheckCircle2, ClipboardList, Upload, FileText, Loader2
} from "lucide-react";

/**
 * 🤖 ADMIN — Vertex AI Agent Builder control tab
 *
 * StudyGyaan AI Sathi (RAG assistant) + ₹91,785 Vertex credit ka dashboard.
 * Ye tab backend ke /vertex/* endpoints ko call karta hai:
 *   GET  /vertex/health   → config + credit status (public)
 *   GET  /vertex/status   → credit ledger (admin — Firebase ID token)
 *   POST /vertex/search   → grounded test search
 *   POST /vertex/chat     → grounded chat test
 *   POST /vertex/ingest   → Firestore → data store ingestion (admin)
 */

const API = ARTICLE_API_BASE;

type Health = {
  success?: boolean;
  vertex?: {
    configured?: boolean; projectId?: string; location?: string;
    dataStoreId?: string; servingConfig?: string; generativeModel?: string;
    creditBudgetInr?: number; serviceAccountProvided?: boolean;
  };
  credit?: { budgetInr?: number; leftInr?: number };
  note?: string;
};

type RunRow = { type?: string; at?: string; costInr?: number; ok?: boolean; note?: string; docs?: number };
type Ledger = {
  source?: string;
  credit?: Health["vertex"];
  spentInr?: number;
  runs?: RunRow[];
  runsCount?: number;
};

function apiHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

/** Admin-only calls: append Firebase ID token (matches article API auth). */
async function authedFetch(path: string, init?: RequestInit) {
  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...apiHeaders(),
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
  });
}

const fmtInr = (n: number | undefined) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AdminVertexTab() {
  const [health, setHealth] = useState<Health | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Ingest
  const [collection, setCollection] = useState("jobs");
  const [limit, setLimit] = useState("200");
  const [dryRun, setDryRun] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState("");

  // Test search
  const [query, setQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchMsg, setSearchMsg] = useState("");

  const loadHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const r = await fetch(`${API}/vertex/health`);
      const d = await r.json().catch(() => ({}));
      setHealth(d);
    } catch { setHealth({ success: false }); }
    finally { setLoadingHealth(false); }
  }, []);

  const loadLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const r = await authedFetch("/vertex/status");
      const d = await r.json().catch(() => ({}));
      setLedger(d);
      if (!d?.success) setIngestMsg(`Ledger error: ${d?.error || "unauthorized"}`);
    } catch (e: any) { setIngestMsg(`Ledger error: ${e?.message || e}`); }
    finally { setLoadingLedger(false); }
  }, []);

  useEffect(() => { loadHealth(); loadLedger(); }, [loadHealth, loadLedger]);

  const runIngest = async () => {
    setIngesting(true);
    setIngestMsg("");
    try {
      const r = await authedFetch("/vertex/ingest", {
        method: "POST",
        body: JSON.stringify({ collection, limit: Number(limit) || 200, dryRun }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.success) throw new Error(d?.error || `HTTP ${r.status}`);
      const n = Array.isArray(d?.summary)
        ? d.summary.map((s: any) => `${s.collection}:${s.imported ?? 0}`).join(", ")
        : `imported ${d.imported ?? 0}`;
      setIngestMsg(`✅ ${dryRun ? "(DRY)" : ""} ${n}`);
      await loadLedger();
    } catch (e: any) { setIngestMsg(`❌ ${e?.message || e}`); }
    finally { setIngesting(false); }
  };

  // Question set generator
  const [qTopic, setQTopic] = useState("");
  const [qExam, setQExam] = useState("");
  const [qCount, setQCount] = useState("25");
  const [qBusy, setQBusy] = useState(false);
  const [qMsg, setQMsg] = useState("");

  const runQuestions = async () => {
    if (!qTopic.trim() || qBusy) return;
    setQBusy(true); setQMsg("");
    try {
      const r = await authedFetch("/vertex/generate-questions", {
        method: "POST",
        body: JSON.stringify({ topic: qTopic.trim(), exam: qExam.trim(), totalQuestions: Number(qCount) || 25 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.success) throw new Error(d?.error || d?.code || `HTTP ${r.status}`);
      setQMsg(`✅ Question set saved (${d.id}) — ${d.title} · ${d.count} Q · ${d.sources} source(s)`);
      await loadLedger();
    } catch (e: any) { setQMsg(`❌ ${e?.message || e}`); }
    finally { setQBusy(false); }
  };

  // PDF/Text → Question Set
  const [srcTitle, setSrcTitle] = useState("");
  const [srcExam, setSrcExam] = useState("");
  const [srcText, setSrcText] = useState("");
  const [srcFile, setSrcFile] = useState("");
  const [srcBusy, setSrcBusy] = useState(false);
  const [srcMsg, setSrcMsg] = useState("");
  const srcInputRef = useRef<HTMLInputElement | null>(null);

  const handleSrcFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSrcBusy(true); setSrcMsg("PDF/image se text nikal raha hai…");
    try {
      const text = await extractTextFromFile(file, (p) =>
        setSrcMsg(`PDF/image se text nikal raha hai… page ${p.page}/${p.totalPages}`)
      );
      setSrcText(text);
      setSrcFile(file.name);
      setSrcMsg(`✅ Text mil gaya (${text.length} chars). Neeche edit karke Generate dabao.`);
    } catch (err: any) { setSrcMsg(`❌ ${err?.message || err}`); }
    finally { setSrcBusy(false); }
  };

  const runFromSource = async () => {
    if (!srcTitle.trim() || srcText.trim().length < 200 || srcBusy) return;
    setSrcBusy(true); setSrcMsg("Question set generate kar raha hai…");
    try {
      const r = await authedFetch("/vertex/generate-from-source", {
        method: "POST",
        body: JSON.stringify({ title: srcTitle.trim(), exam: srcExam.trim(), sourceText: srcText.trim(), totalQuestions: Number(qCount) || 25 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.success) throw new Error(d?.error || d?.code || `HTTP ${r.status}`);
      setSrcMsg(`✅ Question set saved (${d.id}) — ${d.title} · ${d.count} Q · ingested:${d.ingested}`);
      await loadLedger();
    } catch (e: any) { setSrcMsg(`❌ ${e?.message || e}`); }
    finally { setSrcBusy(false); }
  };

  const runSearch = async () => {
    if (!query.trim() || searchBusy) return;
    setSearchBusy(true); setSearchMsg("");
    try {
      const r = await fetch(`${API}/vertex/search`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ query: query.trim(), pageSize: 5 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.success) { setSearchMsg(`❌ ${d?.error || d?.code || r.status}`); setSearchResults(null); }
      else { setSearchResults(d.answers || []); setSearchMsg(`✅ ${d.total ?? 0} result(s)`); }
    } catch (e: any) { setSearchMsg(`❌ ${e?.message || e}`); }
    finally { setSearchBusy(false); }
  };

  const configured = Boolean(health?.vertex?.configured);
  const creditLeft = health?.credit?.leftInr;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-black flex items-center gap-2">
          <Bot className="text-indigo-600" /> Vertex AI Agent Builder
        </h2>
        <div className="flex gap-2">
          <button onClick={loadHealth} className="px-3 py-1.5 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50 flex items-center gap-1">
            <RefreshCw size={12} /> Health
          </button>
          <button onClick={loadLedger} className="px-3 py-1.5 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50 flex items-center gap-1">
            <IndianRupee size={12} /> Ledger
          </button>
        </div>
      </div>

      {/* Credit + status card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="col-span-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-600 mb-2">
            {configured ? <CheckCircle2 className="text-green-500" size={16} /> : <AlertTriangle className="text-amber-500" size={16} />}
            Configuration
          </div>
          {loadingHealth ? <p className="text-sm text-gray-400">Loading…</p> : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <Info label="Project" value={health?.vertex?.projectId || "—"} />
              <Info label="Data Store" value={health?.vertex?.dataStoreId || "—"} />
              <Info label="Location" value={health?.vertex?.location || "—"} />
              <Info label="Serving Config" value={health?.vertex?.servingConfig || "—"} />
              <Info label="Model" value={health?.vertex?.generativeModel || "—"} />
              <Info label="Service Account" value={health?.vertex?.serviceAccountProvided ? "✅ yes" : "❌ no"} />
            </div>
          )}
          {!configured && (
            <p className="mt-2 text-xs text-amber-600">
              Vertex configured nahi hai. Setup ke liye <code className="bg-gray-100 px-1 rounded">ai_backend/vertex/SETUP_VERTEX_AI.md</code> dekho.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
          <div className="text-sm font-bold text-gray-600 mb-1 flex items-center gap-1"><IndianRupee size={14} /> Credit Status</div>
          {creditLeft == null ? (
            <p className="text-sm text-gray-400">—</p>
          ) : (
            <>
              <p className="text-2xl font-black text-indigo-700">{fmtInr(creditLeft)}</p>
              <p className="text-xs text-gray-500">left of {fmtInr(health?.credit?.budgetInr)}</p>
              <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600"
                  style={{
                    width: `${health?.credit?.budgetInr ? Math.min(100, (creditLeft / health.credit.budgetInr) * 100) : 100}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] text-gray-500">AI Sathi (RAG/chat) isi credit pe chalta hai.</p>
            </>
          )}
        </div>
      </div>

      {/* Test search */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-1"><Search size={14} /> Test: Grounded Search</div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="e.g. SSC CGL syllabus"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <button onClick={runSearch} disabled={searchBusy || !query.trim()} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-40">
            {searchBusy ? "…" : "Search"}
          </button>
        </div>
        {searchMsg && <p className="mt-2 text-xs text-gray-500">{searchMsg}</p>}
        {searchResults && (
          <div className="mt-3 space-y-2 max-h-60 overflow-auto">
            {searchResults.map((r, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-2 text-xs">
                <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline">{r.title}</a>
                <p className="text-gray-600 mt-0.5">{r.snippet}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ingestion */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-1"><Database size={14} /> Ingest Firestore → Data Store</div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Collection</label>
            <select value={collection} onChange={(e) => setCollection(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-2 text-sm">
              <option value="jobs">jobs</option>
              <option value="blogs">blogs</option>
              <option value="fast_track">fast_track</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Limit</label>
            <input value={limit} onChange={(e) => setLimit(e.target.value)} className="w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 mb-1.5">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry run (no billing)
          </label>
          <button onClick={runIngest} disabled={ingesting || !configured} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-40 flex items-center gap-1">
            <Database size={14} /> {ingesting ? "…" : "Ingest"}
          </button>
        </div>
        {ingestMsg && <p className="mt-2 text-xs text-gray-500">{ingestMsg}</p>}
        <p className="mt-2 text-[11px] text-gray-400">Document ingestion is credit ka eligible SKU hai — isi se ₹91,785 consume hota hai.</p>
      </div>

      {/* RAG-grounded question set generator */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-bold text-gray-600 mb-1 flex items-center gap-1"><ClipboardList size={14} /> Question Set Generator (grounded)</div>
        <p className="text-[11px] text-gray-400 mb-2">Vertex Search se source material retrieve karke grounded questions banta hai (mock_tests me save). Har retrieval credit kaatta hai.</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-400 mb-1">Topic</label>
            <input value={qTopic} onChange={(e) => setQTopic(e.target.value)} placeholder="e.g. Algebra" className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" />
          </div>
          <div className="w-36">
            <label className="block text-xs text-gray-400 mb-1">Exam (optional)</label>
            <input value={qExam} onChange={(e) => setQExam(e.target.value)} placeholder="SSC CGL" className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" />
          </div>
          <div className="w-20">
            <label className="block text-xs text-gray-400 mb-1">Questions</label>
            <input value={qCount} onChange={(e) => setQCount(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" />
          </div>
          <button onClick={runQuestions} disabled={qBusy || !qTopic.trim() || !configured} className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm disabled:opacity-40 flex items-center gap-1">
            <ClipboardList size={14} /> {qBusy ? "…" : "Generate"}
          </button>
        </div>
        {qMsg && <p className="mt-2 text-xs text-gray-500">{qMsg}</p>}
      </div>

      {/* PDF/Text → Question Set */}
      <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white p-4 shadow-sm">
        <div className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1"><Upload size={14} className="text-indigo-600" /> PDF/Text → Question Set (apna source)</div>
        <p className="text-[11px] text-gray-400 mb-3">Apna PDF/image/text daalo → usi se grounded question set banega (mock_tests me save). Vertex configured ho to source ingest karke credit bhi khaata hai.</p>

        <div className="flex flex-wrap items-end gap-2 mb-2">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-400 mb-1">Set ka Title</label>
            <input value={srcTitle} onChange={(e) => setSrcTitle(e.target.value)} placeholder="e.g. SSC CGL Maths Practice Set" className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" />
          </div>
          <div className="w-36">
            <label className="block text-xs text-gray-400 mb-1">Exam (optional)</label>
            <input value={srcExam} onChange={(e) => setSrcExam(e.target.value)} placeholder="SSC CGL" className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button
            onClick={() => srcInputRef.current?.click()}
            disabled={srcBusy}
            className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-40 flex items-center gap-1"
          >
            {srcBusy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Upload PDF / Image
          </button>
          <input ref={srcInputRef} type="file" accept=".pdf,.png,.jpeg,.jpg,.webp,.bmp" onChange={handleSrcFile} className="hidden" />
          <span className="text-[11px] text-gray-400">{srcFile ? `📄 ${srcFile}` : "ya neeche text paste karo"}</span>
        </div>

        <textarea
          value={srcText}
          onChange={(e) => setSrcText(e.target.value)}
          placeholder="PDF se nikal kar yahan aata hai, ya seedha syllabus/notes/questions ka text paste karo (min 200 chars)…"
          rows={6}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-mono"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-gray-400">{srcText.length} chars</span>
          <button
            onClick={runFromSource}
            disabled={srcBusy || !srcTitle.trim() || srcText.trim().length < 200}
            className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm disabled:opacity-40 flex items-center gap-1"
          >
            <ClipboardList size={14} /> {srcBusy ? "…" : "Generate Set"}
          </button>
        </div>
        {srcMsg && <p className="mt-2 text-xs text-gray-500">{srcMsg}</p>}
      </div>

      {/* Ledger */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-1"><ShieldCheck size={14} /> Credit Ledger</div>
        {loadingLedger ? <p className="text-sm text-gray-400">Loading…</p> : !ledger ? (
          <p className="text-sm text-gray-400">Ledger load karne me dikkat.</p>
        ) : (
          <>
            <div className="text-xs text-gray-500 mb-2">
              Source: <b>{ledger.source}</b> · Spent <b>{fmtInr(ledger.spentInr)}</b> of {fmtInr(health?.credit?.budgetInr)}
            </div>
            {(ledger.runs?.length || 0) === 0 ? (
              <p className="text-xs text-gray-400">Abhi koi Vertex call nahi hui. Search/ingest chalao.</p>
            ) : (
              <div className="max-h-60 overflow-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-400 sticky top-0">
                    <tr><th className="text-left px-2 py-1">Time</th><th className="text-left px-2 py-1">Type</th><th className="text-right px-2 py-1">Cost</th><th className="text-left px-2 py-1">Note</th></tr>
                  </thead>
                  <tbody>
                    {[...(ledger.runs || [])].reverse().slice(0, 100).map((r, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-2 py-1 text-gray-400 whitespace-nowrap">{r.at ? new Date(r.at).toLocaleString() : "—"}</td>
                        <td className="px-2 py-1">{r.ok === false ? "❌" : "✅"} {r.type}</td>
                        <td className="px-2 py-1 text-right">{fmtInr(r.costInr)}</td>
                        <td className="px-2 py-1 text-gray-500 truncate max-w-[180px]">{r.note || `docs:${r.docs ?? 0}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-2 py-1.5">
      <div className="text-gray-400">{label}</div>
      <div className="font-semibold text-gray-700 truncate" title={value}>{value}</div>
    </div>
  );
}
