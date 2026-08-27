import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Search, ShieldCheck, AlertTriangle, Play, Clipboard } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  applyOptimizationProposal,
  fetchSeoDashboard,
  getSeoIntelligenceWorkflowUrl,
  prepareSearchConsoleImport,
  fetchProposalArticleHtml,
  previewOptimizationProposal,
  rollbackOptimizationProposal,
  setOptimizationProposalStatus,
  type SeoDashboard,
  type SeoOptimizationProposal,
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

const levelClass = (level?: string) => {
  if (level === 'A') return 'bg-green-100 text-green-800';
  if (level === 'B') return 'bg-amber-100 text-amber-800';
  if (level === 'C') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-600';
};

const formatProposedChange = (value: unknown): string => {
  if (value == null) return 'No replacement (review only)';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!item || typeof item !== 'object') return String(item);
      const rec = item as { url?: string; question?: string; title?: string };
      return rec.url || rec.question || rec.title || JSON.stringify(item);
    }).join('; ');
  }
  if (typeof value === 'object') {
    const rec = value as {
      suggestedSections?: string[];
      suggestedH2?: string[];
      heading?: string;
      note?: string;
      articleHtml?: string | null;
      previewText?: string;
      insufficientSource?: boolean;
      headings?: string[];
    };
    if (rec.insufficientSource) return 'Insufficient source — HTML not generated (review only)';
    if (typeof rec.articleHtml === 'string' && rec.articleHtml) {
      return rec.previewText || rec.articleHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
    }
    if (Array.isArray(rec.headings) && rec.headings.length) return rec.headings.join('; ');
    if (Array.isArray(rec.suggestedSections)) return rec.suggestedSections.join('; ');
    if (Array.isArray(rec.suggestedH2)) return rec.suggestedH2.join('; ');
    if (rec.heading) return rec.heading;
    if (rec.note) return rec.note;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return 'See details';
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const ProposalArticleHtmlPreview = ({ proposal }: { proposal: SeoOptimizationProposal }) => {
  const [htmlPreview, setHtmlPreview] = useState('');
  const [htmlPreviewError, setHtmlPreviewError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchProposalArticleHtml(proposal)
      .then((html) => {
        if (!cancelled) setHtmlPreview(html);
      })
      .catch((error) => {
        if (!cancelled) setHtmlPreviewError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [proposal]);

  return (
    <div className="grid md:grid-cols-2 gap-3 pt-2">
      <div className="bg-white border rounded-xl p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">OLD HTML</p>
        <pre className="text-[11px] whitespace-pre-wrap break-words max-h-64 overflow-auto text-slate-700">
          {typeof proposal.oldValue === 'string' ? proposal.oldValue : formatProposedChange(proposal.oldValue)}
        </pre>
      </div>
      <div className="bg-white border rounded-xl p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">PROPOSED HTML</p>
        {htmlPreviewError ? (
          <p className="text-[11px] text-amber-700">{htmlPreviewError}</p>
        ) : (
          <pre className="text-[11px] whitespace-pre-wrap break-words max-h-64 overflow-auto text-slate-700">
            {htmlPreview || formatProposedChange(proposal.proposedValue)}
          </pre>
        )}
      </div>
    </div>
  );
};

const AdminSeoDashboard = () => {
  const [dashboard, setDashboard] = useState<SeoDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [gscText, setGscText] = useState('');
  const [preparedGscJson, setPreparedGscJson] = useState('');
  const [loadError, setLoadError] = useState('');
  const [selectedProposal, setSelectedProposal] = useState<SeoOptimizationProposal | null>(null);
  const [statusBusy, setStatusBusy] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
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

  const handleProposalStatus = async (proposal: SeoOptimizationProposal, status: 'approved' | 'rejected') => {
    if (!proposal.id) return;
    setStatusBusy(`${proposal.id}:${status}`);
    try {
      const next = await setOptimizationProposalStatus(proposal.id, status);
      setDashboard((current) => current ? { ...current, optimizationProposals: next } : current);
      setSelectedProposal(next.find((item) => item.id === proposal.id) || null);
      toast.success(`Proposal ${status}. This does not apply or publish anything.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Proposal status: ${msg}`);
    } finally {
      setStatusBusy('');
    }
  };

  const handleApply = async (proposal: SeoOptimizationProposal) => {
    if (!proposal.id) return;
    const preview = previewOptimizationProposal(proposal);
    if (!preview.applyable) {
      toast.error(preview.reason);
      return;
    }
    setStatusBusy(`${proposal.id}:apply`);
    try {
      const next = await applyOptimizationProposal(proposal.id);
      setDashboard((current) => current ? { ...current, optimizationProposals: next } : current);
      setSelectedProposal(next.find((item) => item.id === proposal.id) || null);
      toast.success('Applied allowlisted fields after snapshot. Indexing was requested only as best-effort — not a ranking claim.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Apply: ${msg}`);
    } finally {
      setStatusBusy('');
    }
  };

  const handleRollback = async (proposal: SeoOptimizationProposal) => {
    if (!proposal.id) return;
    setStatusBusy(`${proposal.id}:rollback`);
    try {
      const next = await rollbackOptimizationProposal(proposal.id);
      setDashboard((current) => current ? { ...current, optimizationProposals: next } : current);
      setSelectedProposal(next.find((item) => item.id === proposal.id) || null);
      toast.success('Rolled back from snapshot. Public fields restored.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Rollback: ${msg}`);
    } finally {
      setStatusBusy('');
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
  const audits = dashboard?.pageAudits || [];
  const proposals = dashboard?.optimizationProposals || [];
  const filteredAudits = typeFilter === 'ALL' ? audits : audits.filter((item) => item.contentType === typeFilter);
  const filteredProposals = typeFilter === 'ALL' ? proposals : proposals.filter((item) => item.contentType === typeFilter);
  const healthCounts = {
    audited: audits.length,
    healthy: audits.filter((item) => item.health?.label === 'healthy').length,
    blockers: audits.filter((item) => (item.criticalCount || item.summary?.criticalCount || 0) > 0).length,
    high: audits.filter((item) => (item.highCount || item.summary?.highCount || 0) > 0).length,
    pending: proposals.filter((item) => item.status === 'pending').length,
    approved: proposals.filter((item) => item.status === 'approved').length,
    applied: proposals.filter((item) => item.status === 'applied').length,
    failedApply: proposals.filter((item) => item.status === 'failed').length,
  };

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
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">Healthy {healthCounts.healthy}</span>
          <span className="px-3 py-1 rounded-full bg-red-50 text-red-700">Blockers {healthCounts.blockers}</span>
          <span className="px-3 py-1 rounded-full bg-violet-50 text-violet-700">Pending {healthCounts.pending}</span>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">Applied {healthCounts.applied}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {['ALL', 'BLOG', 'JOB', 'FAST_TRACK', 'MOCK_TEST', 'STUDY_MATERIAL'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${typeFilter === type ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
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
          Live HTTP audit is off by default. GSC findings appear only when imported Search Console rows exist for that URL.
        </p>
        {filteredAudits.length === 0 ? (
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
                {[...filteredAudits]
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
        <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-2">Optimization Proposals</h3>
        <p className="text-xs text-gray-500 mb-4">
          Approve/Reject only change proposal status. Apply writes allowlisted fields after a snapshot. Rollback restores that snapshot.
          Level C and fact fields never apply. Auto-apply stays OFF. Indexing after apply is a request, not a ranking claim.
        </p>
        {filteredProposals.length === 0 ? (
          <p className="text-sm text-gray-400 font-medium">No optimization proposals yet — run the GitHub Actions scan after page audits exist.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-gray-400 border-b">
                  <th className="py-2 pr-3 font-black">Page</th>
                  <th className="py-2 pr-3 font-black">Type</th>
                  <th className="py-2 pr-3 font-black">Issue</th>
                  <th className="py-2 pr-3 font-black">Proposed Change</th>
                  <th className="py-2 pr-3 font-black">Level</th>
                  <th className="py-2 pr-3 font-black">Confidence</th>
                  <th className="py-2 font-black">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredProposals.slice(0, 80).map((proposal, idx) => (
                  <tr
                    key={proposal.id || idx}
                    className={`border-b last:border-0 align-top cursor-pointer ${selectedProposal?.id === proposal.id ? 'bg-violet-50' : ''}`}
                    onClick={() => setSelectedProposal(proposal)}
                  >
                    <td className="py-3 pr-3 font-medium text-slate-700">
                      <span className="block max-w-[200px] truncate">{proposal.url || proposal.contentId || '—'}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <span className="text-[10px] font-black uppercase bg-gray-100 px-2 py-1 rounded-full">{proposal.contentType || 'OTHER'}</span>
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-600 max-w-[180px]">
                      {(proposal.evidenceIds || [])[0] || proposal.field || '—'}
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-600 max-w-[260px]">
                      <span className="block line-clamp-2">{formatProposedChange(proposal.proposedValue)}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${levelClass(proposal.level)}`}>
                        {proposal.level || '—'}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-xs">{proposal.confidence || '—'}</td>
                    <td className="py-3 text-xs font-black uppercase">{proposal.status || 'pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selectedProposal && (
          <div className="mt-4 border rounded-2xl p-4 bg-slate-50 space-y-2">
            <p className="font-black text-sm">Proposal details</p>
            <p className="text-xs text-slate-600"><span className="font-black">Old:</span> {formatProposedChange(selectedProposal.oldValue)}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Proposed:</span> {formatProposedChange(selectedProposal.proposedValue)}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Reason:</span> {selectedProposal.reason || '—'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Evidence:</span> {(selectedProposal.evidenceIds || []).join(', ') || '—'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Source:</span> {selectedProposal.source || selectedProposal.htmlSource || 'deterministic-optimizer'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Level:</span> {selectedProposal.level} · requiresReview: {selectedProposal.requiresReview ? 'yes' : 'no'}</p>
            {selectedProposal.field === 'articleHtml' && (
              <ProposalArticleHtmlPreview
                key={selectedProposal.id || selectedProposal.contentId || 'articleHtml'}
                proposal={selectedProposal}
              />
            )}
            {selectedProposal.status === 'pending' && (
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={Boolean(statusBusy)}
                  onClick={() => void handleProposalStatus(selectedProposal, 'approved')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-black text-xs disabled:opacity-50"
                >
                  Approve (status only)
                </button>
                <button
                  type="button"
                  disabled={Boolean(statusBusy)}
                  onClick={() => void handleProposalStatus(selectedProposal, 'rejected')}
                  className="px-4 py-2 rounded-xl bg-white border font-black text-xs disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
            {selectedProposal.status === 'approved' && (
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={Boolean(statusBusy)}
                  onClick={() => void handleApply(selectedProposal)}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-black text-xs disabled:opacity-50"
                >
                  Apply (snapshot first)
                </button>
              </div>
            )}
            {selectedProposal.status === 'applied' && selectedProposal.snapshotId && (
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={Boolean(statusBusy)}
                  onClick={() => void handleRollback(selectedProposal)}
                  className="px-4 py-2 rounded-xl bg-white border font-black text-xs disabled:opacity-50"
                >
                  Rollback snapshot
                </button>
              </div>
            )}
            <p className="text-[11px] text-gray-400">
              Approve never writes public pages. Apply writes allowlisted fields after a snapshot. articleHtml is never batch-applied.
            </p>
          </div>
        )}
        {dashboard?.optimizationProposalSummary?.storage && (
          <p className="mt-3 text-[11px] text-gray-400">
            Storage: {dashboard.optimizationProposalSummary.storage}. {dashboard.optimizationProposalSummary.preferredCollectionBlocked}.
          </p>
        )}
      </div>

      {(dashboard?.gscInsights?.insights || []).length > 0 && (
        <div className="bg-white border rounded-[2rem] p-6">
          <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-2">Search Console insights (imported rows only)</h3>
          <p className="text-xs text-gray-500 mb-3">
            Status: {dashboard?.gscInsights?.status}. Missing GSC stays unavailable. Nothing here is fabricated and nothing is a ranking claim.
          </p>
          <ul className="space-y-2 text-xs text-slate-600">
            {(dashboard?.gscInsights?.insights || []).slice(0, 12).map((item, idx) => (
              <li key={`${item.kind}-${item.page}-${idx}`} className="border rounded-xl p-3">
                <span className="font-black uppercase text-[10px] text-gray-400">{item.kind}</span>
                <p className="mt-1">{item.reason}</p>
                <p className="text-gray-400 mt-1">{item.page} {item.query ? `· ${item.query}` : ''}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(dashboard?.applyHistory || []).length > 0 && (
        <div className="bg-white border rounded-[2rem] p-6">
          <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-2">Apply / rollback history</h3>
          <ul className="text-xs text-slate-600 space-y-1">
            {(dashboard?.applyHistory || []).slice(0, 15).map((item, idx) => (
              <li key={`${item.proposalId}-${idx}`}>
                {item.at} · {item.status} · {item.field} · {item.proposalId} {item.snapshotId ? `· snap ${item.snapshotId}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

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
