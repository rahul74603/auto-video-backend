import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Search, ShieldCheck, AlertTriangle, Play, Clipboard } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  fetchSeoDashboard,
  getSeoIntelligenceWorkflowUrl,
  prepareSearchConsoleImport,
  type SeoDashboard,
  type SeoPageAudit,
  type SeoRecommendation,
} from '@/features/seo-intelligence/data/seoIntelligenceRepository';

const healthClass = (label?: string) => {
  if (label === 'healthy') return 'bg-green-100 text-green-800';
  if (label === 'fair') return 'bg-slate-100 text-slate-700';
  if (label === 'needs-work') return 'bg-amber-100 text-amber-800';
  if (label === 'critical') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-600';
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const AdminSeoDashboard = () => {
  const [dashboard, setDashboard] = useState<SeoDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [gscText, setGscText] = useState('');
  const [preparedGscJson, setPreparedGscJson] = useState('');
  const [loadError, setLoadError] = useState('');
  const workflowUrl = getSeoIntelligenceWorkflowUrl();

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

  const handleRunInstructions = () => {
    window.open(workflowUrl, '_blank', 'noopener,noreferrer');
    toast('GitHub Actions page opened. Choose “Run workflow” to scan without Cloud Run.');
  };

  const handlePrepareGsc = async () => {
    try {
      const parsed = JSON.parse(gscText) as unknown;
      const rows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown[] }).rows;
      const prepared = prepareSearchConsoleImport(rows);
      setPreparedGscJson(prepared.json);
      try {
        await navigator.clipboard?.writeText(prepared.json);
        toast.success(`${prepared.rows.length} valid GSC rows prepared and copied. Paste into GitHub Actions gsc_json input.`);
      } catch {
        toast.success(`${prepared.rows.length} valid GSC rows prepared. Paste the JSON below into GitHub Actions gsc_json input.`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`GSC import: ${msg}`);
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
          This dashboard now reads persisted SEO Intelligence data directly from Firestore. If this fails,
          verify Firestore rules allow the signed-in admin to read system_settings/seo_intelligence and seo_recommendations.
        </p>
        <button onClick={() => void load()} className="px-4 py-2 rounded-xl bg-white border font-black text-xs">
          Retry
        </button>
      </div>
    );
  }

  const recs = dashboard?.recommendations || [];
  const lifecycle = dashboard?.lifecycle || {};
  const scan = dashboard?.scan;
  const failed = scan?.lastStatus === 'failed';
  const running = scan?.lastStatus === 'running';

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-[2rem] p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2">
              <Search className="text-blue-600" size={22} /> SEO Intelligence
            </h2>
            <p className="text-sm text-gray-500 font-medium mt-1">
              Billing-safe mode: dashboard reads Firestore results. Scans run in GitHub Actions, not Cloud Run.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load()} className="px-4 py-2 rounded-xl bg-gray-50 border font-black text-xs">
              Refresh
            </button>
            <button
              onClick={handleRunInstructions}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center gap-2"
            >
              <Play size={14} />
              Run Scan via GitHub Actions
              <ExternalLink size={13} />
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
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
            <ShieldCheck size={12} /> Auto-publish: OFF
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
            <ShieldCheck size={12} /> Page-audit Apply: OFF
          </span>
          <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700">
            Page audits: {dashboard?.pageAuditSummary?.count || dashboard?.pageAudits?.length || 0}
          </span>
        </div>
      </div>

      <div className={`border rounded-[2rem] p-5 ${failed ? 'bg-red-50 border-red-200' : running ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-sm uppercase tracking-widest text-gray-500">Scan status</h3>
            <p className="mt-2 text-sm font-bold text-slate-700">
              Latest status: <span className={failed ? 'text-red-700' : running ? 'text-blue-700' : 'text-emerald-700'}>{scan?.lastStatus || 'No scan yet'}</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">Last success: {formatDate(scan?.lastSuccessAt || scan?.lastRunAt)}</p>
            <p className="text-xs text-gray-500 mt-1">Duration: {scan?.scanDurationMs ? `${Math.round(scan.scanDurationMs / 1000)}s` : 'Not available'}</p>
            <p className="text-xs text-gray-500 mt-1">Recommendations: {scan?.recommendationCount ?? recs.length}</p>
            {scan?.github?.runId && <p className="text-xs text-gray-500 mt-1">GitHub run: {scan.github.runId}</p>}
          </div>
          <a href={workflowUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl border bg-white font-black text-xs flex items-center gap-2 w-fit">
            Open workflow <ExternalLink size={13} />
          </a>
        </div>
        {failed && scan?.lastError?.message && (
          <p className="mt-3 text-xs text-red-700 font-semibold">Latest error: {scan.lastError.message}</p>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Browser never runs privileged SEO code and never stores GitHub tokens. Use GitHub Actions → SEO Intelligence Runner → Run workflow.
        </p>
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
          <p className="text-sm text-gray-400 font-medium">No recommendations yet — run the GitHub Actions scan after content exists.</p>
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
        <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-2">Page SEO Health (diagnostic)</h3>
        <p className="text-xs text-gray-500 mb-4">
          Page SEO Health is a StudyGyaan diagnostic score, not a Google ranking score and not an AI Overview / GEO / LLMO claim.
          Phase 2 is read-only: no Apply, no auto-fix, no title/meta rewrite. Live HTTP audit is off by default, so technical status may be unavailable.
          GSC findings appear only when imported Search Console rows exist for that URL.
        </p>
        {(dashboard?.pageAudits || []).length === 0 ? (
          <p className="text-sm text-gray-400 font-medium">No page audits yet — run the GitHub Actions scan. Sample is capped at 40 published pages.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-gray-400 border-b">
                  <th className="py-2 pr-3 font-black">Type</th>
                  <th className="py-2 pr-3 font-black">Page</th>
                  <th className="py-2 pr-3 font-black">Health</th>
                  <th className="py-2 pr-3 font-black">Priority</th>
                  <th className="py-2 pr-3 font-black">Main opportunity</th>
                  <th className="py-2 font-black">Findings</th>
                </tr>
              </thead>
              <tbody>
                {[...(dashboard?.pageAudits || [])]
                  .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
                  .slice(0, 40)
                  .map((audit: SeoPageAudit, idx) => (
                    <tr key={audit.contentId || audit.url || idx} className="border-b last:border-0 align-top">
                      <td className="py-3 pr-3">
                        <span className="text-[10px] font-black uppercase bg-gray-100 px-2 py-1 rounded-full">{audit.contentType || 'OTHER'}</span>
                      </td>
                      <td className="py-3 pr-3 font-medium text-slate-700">
                        <span className="block max-w-[220px] truncate">{audit.url || audit.contentId || '—'}</span>
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${healthClass(audit.health?.label)}`}>
                          {audit.health?.score ?? '—'} {audit.health?.label || ''}
                        </span>
                      </td>
                      <td className="py-3 pr-3 font-black">{audit.priority ?? '—'}</td>
                      <td className="py-3 pr-3 text-xs text-slate-600 max-w-[280px]">
                        {audit.mainOpportunity || audit.summary?.mainOpportunity || 'No issues detected in this diagnostic pass.'}
                      </td>
                      <td className="py-3 text-xs text-slate-500">
                        <p>
                          blockers {audit.criticalCount ?? audit.summary?.criticalCount ?? 0}
                          {' · '}
                          high {audit.highCount ?? audit.summary?.highCount ?? 0}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {(audit.findings || []).slice(0, 4).map((finding) => (
                            <li key={finding.id}>
                              <span className="font-bold uppercase text-[10px] text-gray-400">{finding.severity}</span>{' '}
                              {finding.id}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {dashboard?.pageAuditSummary?.preferredCollectionBlocked && (
          <p className="mt-3 text-[11px] text-gray-400">
            Storage: {dashboard.pageAuditSummary.storage}. {dashboard.pageAuditSummary.preferredCollectionBlocked}.
          </p>
        )}
      </div>

      <div className="bg-white border rounded-[2rem] p-6">
        <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-2">Search Console Data Import</h3>
        <p className="text-xs text-gray-500 mb-3">
          Manual JSON import is preserved, but browser direct Firestore write is disabled because Firestore rules are not in this repo.
          Paste rows here to validate and prepare safe JSON, then paste the prepared JSON into the GitHub Actions workflow input named <b>gsc_json</b>.
          Tokens, API keys and service-account JSON are never stored.
        </p>
        <textarea
          value={gscText}
          onChange={(e) => setGscText(e.target.value)}
          className="w-full h-32 border rounded-xl p-3 text-xs font-mono"
          placeholder='[{"query":"ssc cgl apply","page":"https://studygyaan.in/job/ssc-cgl-2026","clicks":12,"impressions":800,"ctr":0.015,"position":8}]'
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => void handlePrepareGsc()} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-xs flex items-center gap-2">
            <Clipboard size={13} /> Prepare GSC JSON
          </button>
          <button onClick={handleRunInstructions} className="px-4 py-2 bg-white border rounded-xl font-black text-xs flex items-center gap-2">
            Open GitHub Actions <ExternalLink size={13} />
          </button>
        </div>
        {preparedGscJson && (
          <div className="mt-4 bg-slate-50 border rounded-2xl p-4">
            <p className="text-xs font-black text-slate-600 mb-2">Prepared gsc_json workflow input</p>
            <textarea readOnly value={preparedGscJson} className="w-full h-32 border rounded-xl p-3 text-xs font-mono bg-white" />
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSeoDashboard;
