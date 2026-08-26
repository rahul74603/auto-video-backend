import { useEffect, useState } from 'react';
import { RefreshCw, Search, ShieldCheck, AlertTriangle, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  fetchSeoDashboard,
  runSeoIntelligence,
  ingestSearchConsoleRows,
  type SeoDashboard,
  type SeoRecommendation,
} from '@/features/seo-intelligence/data/seoIntelligenceRepository';

const AdminSeoDashboard = () => {
  const [dashboard, setDashboard] = useState<SeoDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [gscText, setGscText] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setDashboard(await fetchSeoDashboard());
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setLoadError(msg);
      toast.error(`SEO dashboard: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetchSeoDashboard()
      .then((data) => {
        if (cancelled) return;
        setDashboard(data);
        setLoadError('');
      })
      .catch((error) => {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : String(error);
        setLoadError(msg);
        toast.error(`SEO dashboard: ${msg}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      await runSeoIntelligence(true);
      toast.success('SEO intelligence run complete — recommendations updated, nothing auto-published');
      await load();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  const handleIngest = async () => {
    try {
      const parsed = JSON.parse(gscText) as unknown;
      const rows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown[] }).rows;
      if (!Array.isArray(rows)) throw new Error('JSON array of rows required');
      const count = await ingestSearchConsoleRows(rows as Array<Record<string, unknown>>);
      toast.success(`${count} Search Console rows saved (no secrets stored)`);
      setGscText('');
      await load();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`GSC ingest: ${msg}`);
    }
  };

  if (loading && !dashboard && !loadError) {
    return (
      <div className="py-16 flex flex-col items-center justify-center bg-white rounded-[2rem] border">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="font-black text-xs uppercase tracking-widest text-blue-600">Loading SEO dashboard…</p>
      </div>
    );
  }

  if (loadError && !dashboard) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 space-y-3">
        <p className="font-black text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle size={16} /> SEO dashboard could not load
        </p>
        <p className="text-sm text-amber-900 font-medium">{loadError}</p>
        <p className="text-xs text-amber-700">
          Admin sign-in is required. If you see a configuration error, set ARTICLE_ADMIN_EMAILS
          (or a Firebase admin custom claim) on the API function. Secrets are never shown here.
        </p>
        <button onClick={() => void load()} className="px-4 py-2 rounded-xl bg-white border font-black text-xs">
          Retry
        </button>
      </div>
    );
  }

  const recs = dashboard?.recommendations || [];
  const lifecycle = dashboard?.lifecycle || {};

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-[2rem] p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2">
              <Search className="text-blue-600" size={22} /> SEO Intelligence
            </h2>
            <p className="text-sm text-gray-500 font-medium mt-1">
              Human-first recommendations only. Never auto-publishes, never invents facts, never hides AI usage.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} className="px-4 py-2 rounded-xl bg-gray-50 border font-black text-xs">
              Refresh
            </button>
            <button
              onClick={() => void handleRun()}
              disabled={running}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center gap-2 disabled:opacity-50"
            >
              {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              Run scan
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3 mt-6">
          {['OPEN', 'CLOSING_SOON', 'CLOSED', 'EXPIRED'].map((key) => (
            <div key={key} className="border rounded-2xl p-4 bg-slate-50">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{key.replace('_', ' ')}</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{Number(lifecycle[key] || 0)}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
          <span className={`px-3 py-1 rounded-full ${dashboard?.freshness?.ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            Freshness {dashboard?.freshness?.ok ? 'OK' : 'needs attention'}
          </span>
          <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700">
            GSC rows: {dashboard?.searchConsole?.rowCount || 0}
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
            <ShieldCheck size={12} /> Auto-create pages: OFF
          </span>
        </div>
      </div>

      {(dashboard?.freshness?.issues || []).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="font-black text-sm flex items-center gap-2 text-amber-800">
            <AlertTriangle size={16} /> Freshness notes
          </p>
          <ul className="mt-2 text-sm space-y-1">
            {(dashboard?.freshness?.issues || []).slice(0, 5).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border rounded-[2rem] p-6">
        <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-4">Recommendations (manual only)</h3>
        {recs.length === 0 ? (
          <p className="text-sm text-gray-400 font-medium">No recommendations yet — run a scan after content exists.</p>
        ) : (
          <div className="space-y-3">
            {recs.slice(0, 25).map((rec: SeoRecommendation, idx) => (
              <div key={rec.id || idx} className="border rounded-2xl p-4">
                <div className="flex justify-between gap-3">
                  <p className="font-black text-sm">{rec.title}</p>
                  <span className="text-[10px] font-black uppercase bg-gray-100 px-2 py-1 rounded-full h-fit">{rec.kind}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{rec.reason}</p>
                {rec.suggestedAction && <p className="text-xs text-blue-700 mt-2 font-medium">{rec.suggestedAction}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-[2rem] p-6">
        <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-2">Search Console Data Import</h3>
        <p className="text-xs text-gray-500 mb-3">
          Manual JSON import — not a live Search Console integration. Paste Search Analytics rows
          (query, page, clicks, impressions, ctr, position). Only studygyaan.in URLs are kept.
          Tokens, API keys and service-account JSON are never stored.
        </p>
        <textarea
          value={gscText}
          onChange={(e) => setGscText(e.target.value)}
          className="w-full h-32 border rounded-xl p-3 text-xs font-mono"
          placeholder='[{"query":"ssc cgl apply","page":"https://studygyaan.in/job/ssc-cgl-2026","clicks":12,"impressions":800,"ctr":0.015,"position":8}]'
        />
        <button onClick={() => void handleIngest()} className="mt-3 px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-xs">
          Save GSC rows
        </button>
      </div>
    </div>
  );
};

export default AdminSeoDashboard;
