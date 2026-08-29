import { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Search, ShieldCheck, AlertTriangle, Play, Clipboard } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  applyOptimizationProposal,
  applyOptimizationProposals,
  approveOptimizationProposals,
  checkOptimizationProposals,
  fetchGscSearchAnalyticsOverview,
  fetchSeoApplySnapshot,
  fetchSeoDashboard,
  fetchSeoChangeHistorySummary,
  getSeoIntelligenceWorkflowUrl,
  prepareSearchConsoleImport,
  fetchProposalArticleHtml,
  previewOptimizationProposal,
  rollbackOptimizationProposal,
  setOptimizationProposalStatus,
  summarizeApplyPreview,
  type GscSearchAnalyticsOverview,
  type SeoChangeEvent,
  type SeoChangeHistorySummary,
  type SeoApplySnapshot,
  type SeoDashboard,
  type SeoOptimizationProposal,
  type SeoPageAudit,
  type SeoProposalBulkResult,
  type SeoProposalCheck,
  type SeoProposalCheckSummary,
  type SeoRecommendation,
} from '@/features/seo-intelligence/data/seoIntelligenceRepository';

const eventValueLabel = (value: { kind: string; value?: unknown; length?: number; hash?: string } | undefined): string => {
  if (!value) return '—';
  if (value.kind === 'compact') return `[compact ${value.length} chars · ${(value.hash || '').slice(0, 8)}…]`;
  const raw = value.value;
  if (raw === null || raw === undefined || raw === '') return '(empty)';
  const text = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
};

const eventChangeLabel = (event: SeoChangeEvent): string =>
  `${eventValueLabel(event.oldValue)} → ${eventValueLabel(event.newValue)}`;

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

const statusClass = (status?: string) => {
  if (status === 'pending') return 'bg-amber-100 text-amber-800';
  if (status === 'approved') return 'bg-blue-100 text-blue-800';
  if (status === 'applied') return 'bg-emerald-100 text-emerald-800';
  if (status === 'rejected') return 'bg-slate-200 text-slate-600';
  if (status === 'failed') return 'bg-red-100 text-red-800';
  if (status === 'rolled_back') return 'bg-purple-100 text-purple-800';
  return 'bg-gray-100 text-gray-600';
};

const statusLabel = (status?: string) => {
  if (status === 'rolled_back') return 'ROLLED BACK';
  return String(status || 'pending').replace(/_/g, ' ').toUpperCase();
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

const proposalSelectionKey = (proposal?: SeoOptimizationProposal | null) => {
  if (!proposal) return '';
  if (proposal.id) return String(proposal.id);
  return [proposal.contentId, proposal.field, proposal.url].filter(Boolean).join(':');
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const ProofValue = ({
  label,
  value,
  field,
  expanded,
  onToggle,
}: {
  label: string;
  value: unknown;
  field?: string;
  expanded?: boolean;
  onToggle?: () => void;
}) => {
  const text = formatProposedChange(value);
  const long = field === 'articleHtml' || text.length > 320;
  const shown = !long || expanded ? text : `${text.slice(0, 320)}…`;
  return (
    <div className="bg-white border rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
        {long && onToggle && (
          <button type="button" onClick={onToggle} className="text-[10px] font-black uppercase text-blue-700">
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      <pre className="text-[11px] whitespace-pre-wrap break-words max-h-64 overflow-auto text-slate-700">{shown}</pre>
    </div>
  );
};

const CheckSummaryGrid = ({ summary }: { summary: SeoProposalCheckSummary }) => (
  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
    {[
      ['Total checked', summary.total],
      ['Ready to apply', summary.readyToApply],
      ['Needs approval', summary.needsApproval],
      ['Needs review', summary.needsReview],
      ['Blocked', summary.blocked],
      ['Level C', summary.levelC],
      ['Fact fields blocked', summary.factFieldsBlocked],
      ['Invalid/missing mapping', summary.invalidMapping],
      ['Already applied', summary.alreadyApplied],
      ['Rejected', summary.rejected],
    ].map(([label, value]) => (
      <div key={String(label)} className="border rounded-xl p-3 bg-white">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
        <p className="text-lg font-black text-slate-800 mt-1">{value}</p>
      </div>
    ))}
  </div>
);

const ProposalArticleHtmlPreview = ({ proposal }: { proposal: SeoOptimizationProposal }) => {
  const [htmlPreview, setHtmlPreview] = useState('');
  const [htmlPreviewError, setHtmlPreviewError] = useState('');
  const [htmlView, setHtmlView] = useState<'raw' | 'preview'>('raw');

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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">PROPOSED HTML</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => setHtmlView('raw')} className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${htmlView === 'raw' ? 'bg-slate-900 text-white' : 'bg-white border'}`}>
              Raw HTML
            </button>
            <button
              type="button"
              disabled={Boolean(htmlPreviewError) || !htmlPreview}
              onClick={() => setHtmlView('preview')}
              className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase disabled:opacity-50 ${htmlView === 'preview' ? 'bg-slate-900 text-white' : 'bg-white border'}`}
            >
              Rendered preview
            </button>
          </div>
        </div>
        {htmlPreviewError ? (
          <p className="text-[11px] text-amber-700">{htmlPreviewError}</p>
        ) : htmlView === 'preview' && htmlPreview ? (
          <div className="text-[11px] max-h-64 overflow-auto text-slate-700 border rounded-lg p-2 bg-slate-50" dangerouslySetInnerHTML={{ __html: htmlPreview }} />
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
  const [gscAnalytics, setGscAnalytics] = useState<GscSearchAnalyticsOverview | null>(null);
  const [gscAnalyticsLoaded, setGscAnalyticsLoaded] = useState(false);
  const [changeHistory, setChangeHistory] = useState<SeoChangeHistorySummary | null>(null);
  const [changeHistoryLoaded, setChangeHistoryLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gscText, setGscText] = useState('');
  const [preparedGscJson, setPreparedGscJson] = useState('');
  const [loadError, setLoadError] = useState('');
  const [selectedProposal, setSelectedProposal] = useState<SeoOptimizationProposal | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [statusBusy, setStatusBusy] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [checkReport, setCheckReport] = useState<{ items: SeoProposalCheck[]; summary: SeoProposalCheckSummary; scope: string } | null>(null);
  const [approvePreview, setApprovePreview] = useState<{ ids: string[]; items: SeoProposalCheck[]; scope: string } | null>(null);
  const [approveResult, setApproveResult] = useState<{ results: SeoProposalBulkResult[]; scope: string } | null>(null);
  const [applyPreview, setApplyPreview] = useState<{ ids: string[]; items: SeoProposalCheck[]; scope: string } | null>(null);
  const [applyResult, setApplyResult] = useState<{ results: SeoProposalBulkResult[]; scope: string } | null>(null);
  const [rollbackPreview, setRollbackPreview] = useState<{ proposal: SeoOptimizationProposal; snapshot: SeoApplySnapshot | null; error?: string } | null>(null);
  const [expandedProof, setExpandedProof] = useState<Record<string, boolean>>({});
  const proposalDetailsRef = useRef<HTMLDivElement | null>(null);
  const bulkPanelRef = useRef<HTMLDivElement | null>(null);
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

  // Read-only SEO Change History (Phase 2 ledger) — separate fetch so a
  // failure here never blocks the main dashboard.
  useEffect(() => {
    let cancelled = false;
    void fetchSeoChangeHistorySummary()
      .then((summary) => {
        if (cancelled) return;
        setChangeHistory(summary);
      })
      .catch(() => {
        if (!cancelled) setChangeHistory(null);
      })
      .finally(() => {
        if (!cancelled) setChangeHistoryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Read-only GSC Search Analytics evidence (Phase 1 measurement) — separate
  // fetch so a failure here never blocks the main dashboard.
  useEffect(() => {
    let cancelled = false;
    void fetchGscSearchAnalyticsOverview()
      .then((overview) => {
        if (cancelled) return;
        setGscAnalytics(overview);
      })
      .catch(() => {
        if (!cancelled) setGscAnalytics(null);
      })
      .finally(() => {
        if (!cancelled) setGscAnalyticsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectProposal = (proposal: SeoOptimizationProposal) => {
    setSelectedProposal(proposal);
    window.setTimeout(() => {
      proposalDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  };

  const scrollBulkPanel = () => {
    window.setTimeout(() => {
      bulkPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  };

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

  const syncProposals = (next: SeoOptimizationProposal[]) => {
    setDashboard((current) => current ? { ...current, optimizationProposals: next } : current);
    setSelectedProposal((current) => current?.id ? next.find((item) => item.id === current.id) || current : current);
    const valid = new Set(next.map((item) => item.id).filter(Boolean) as string[]);
    setCheckedIds((current) => current.filter((id) => valid.has(id)));
  };

  const handleProposalStatus = async (proposal: SeoOptimizationProposal, status: 'approved' | 'rejected') => {
    if (!proposal.id) return;
    setStatusBusy(`${proposal.id}:${status}`);
    try {
      const next = await setOptimizationProposalStatus(proposal.id, status);
      syncProposals(next);
      toast.success(`Proposal ${status}. This does not apply or publish anything.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Proposal status: ${msg}`);
    } finally {
      setStatusBusy('');
    }
  };

  const proposalsFromIds = (ids: string[]) => {
    const wanted = new Set(ids);
    return (dashboard?.optimizationProposals || []).filter((item) => item.id && wanted.has(item.id));
  };

  const runCheck = (ids: string[], scope: string) => {
    const report = checkOptimizationProposals(proposalsFromIds(ids));
    setCheckReport({ ...report, scope });
    setApprovePreview(null);
    setApplyPreview(null);
    scrollBulkPanel();
  };

  const openApprovePreview = (ids: string[], scope: string) => {
    const report = checkOptimizationProposals(proposalsFromIds(ids));
    setApprovePreview({ ids, items: report.items, scope });
    setApproveResult(null);
    scrollBulkPanel();
  };

  const openApplyPreview = (ids: string[], scope: string) => {
    const report = checkOptimizationProposals(proposalsFromIds(ids));
    setApplyPreview({ ids, items: report.items, scope });
    setApplyResult(null);
    scrollBulkPanel();
  };

  const handleApply = (proposal: SeoOptimizationProposal) => {
    if (!proposal.id) return;
    const preview = previewOptimizationProposal(proposal);
    if (!preview.applyable) {
      toast.error(preview.reason);
      return;
    }
    openApplyPreview([proposal.id], 'INDIVIDUAL');
  };

  const confirmApproveSafe = async () => {
    if (!approvePreview) return;
    const safeIds = approvePreview.items.filter((item) => item.approvable).map((item) => item.proposalId);
    setStatusBusy('bulk-approve');
    try {
      const { proposals, results } = await approveOptimizationProposals(safeIds);
      syncProposals(proposals);
      setApprovePreview(null);
      setApproveResult({ results, scope: approvePreview.scope });
      toast.success(`Approved ${results.filter((item) => item.outcome === 'approved').length}. Public content was not changed.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Approve safe: ${msg}`);
    } finally {
      setStatusBusy('');
    }
  };

  const confirmApplyApproved = async () => {
    if (!applyPreview) return;
    setStatusBusy('bulk-apply');
    try {
      const fresh = checkOptimizationProposals(proposalsFromIds(applyPreview.ids));
      if (applyPreview.scope === 'INDIVIDUAL' && applyPreview.ids[0]) {
        const next = await applyOptimizationProposal(applyPreview.ids[0]);
        syncProposals(next);
        const applied = next.find((item) => item.id === applyPreview.ids[0]);
        setApplyPreview(null);
        setApplyResult({
          results: [{
            id: applyPreview.ids[0],
            outcome: applied?.status === 'applied' ? 'applied' : 'failed',
            reason: applied?.status === 'applied' ? 'Applied allowlisted fields after snapshot.' : (applied?.lastError || 'Apply did not mark the proposal as applied.'),
            snapshotId: applied?.snapshotId || null,
            field: applied?.field,
          }],
          scope: applyPreview.scope,
        });
        toast.success('Applied allowlisted fields after snapshot. Indexing was requested only as best-effort — not a ranking claim.');
        return;
      }
      const ids = fresh.items.filter((item) => item.applyable && item.field !== 'articleHtml' && item.level !== 'B').map((item) => item.proposalId);
      const { proposals, results } = await applyOptimizationProposals(ids);
      syncProposals(proposals);
      setApplyPreview(null);
      setApplyResult({ results, scope: applyPreview.scope });
      toast.success(`Applied ${results.filter((item) => item.outcome === 'applied').length} after snapshots. Failures did not abort the rest.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Apply: ${msg}`);
    } finally {
      setStatusBusy('');
    }
  };

  const openRollbackPreview = async (proposal: SeoOptimizationProposal) => {
    if (!proposal.id || !proposal.snapshotId) return;
    setStatusBusy(`${proposal.id}:rollback-preview`);
    try {
      const snapshot = await fetchSeoApplySnapshot(proposal.snapshotId);
      setRollbackPreview({ proposal, snapshot });
      scrollBulkPanel();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setRollbackPreview({ proposal, snapshot: null, error: msg });
      scrollBulkPanel();
    } finally {
      setStatusBusy('');
    }
  };

  const handleRollback = async (proposal: SeoOptimizationProposal) => {
    if (!proposal.id) return;
    setStatusBusy(`${proposal.id}:rollback`);
    try {
      const next = await rollbackOptimizationProposal(proposal.id);
      syncProposals(next);
      setRollbackPreview(null);
      toast.success('Rolled back from snapshot. Public fields restored.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Rollback: ${msg}`);
    } finally {
      setStatusBusy('');
    }
  };

  const toggleChecked = (id: string) => {
    if (!id) return;
    setCheckedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
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
  const filteredIds = filteredProposals.map((item) => item.id).filter(Boolean) as string[];
  const selectedInFilter = checkedIds.filter((id) => filteredIds.includes(id));
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => checkedIds.includes(id));
  const someFilteredSelected = selectedInFilter.length > 0 && !allFilteredSelected;
  const renderedProposals = filteredProposals.slice(0, 80);
  const loadedCount = proposals.length;
  const summaryCount = Number(dashboard?.optimizationProposalSummary?.count || loadedCount);
  const liveCheck = checkOptimizationProposals(filteredProposals);
  const healthCounts = {
    audited: audits.length,
    healthy: audits.filter((item) => item.health?.label === 'healthy').length,
    blockers: audits.filter((item) => (item.criticalCount || item.summary?.criticalCount || 0) > 0).length,
    high: audits.filter((item) => (item.highCount || item.summary?.highCount || 0) > 0).length,
    pending: proposals.filter((item) => item.status === 'pending').length,
    approved: proposals.filter((item) => item.status === 'approved').length,
    applied: proposals.filter((item) => item.status === 'applied').length,
    failedApply: proposals.filter((item) => item.status === 'failed').length,
    rejected: proposals.filter((item) => item.status === 'rejected').length,
  };
  const selectedCheck = selectedProposal ? checkOptimizationProposals([selectedProposal]).items[0] : null;
  const bulkApplyable = (item: SeoProposalCheck) => item.applyable && item.field !== 'articleHtml' && item.level !== 'B';
  const applyCounts = applyPreview ? summarizeApplyPreview(applyPreview.items.filter((item) => applyPreview.scope === 'INDIVIDUAL' ? item.applyable : bulkApplyable(item))) : null;
  const applyablePreviewCount = applyPreview ? applyPreview.items.filter((item) => applyPreview.scope === 'INDIVIDUAL' ? item.applyable : bulkApplyable(item)).length : 0;
  const blockedPreviewCount = applyPreview ? applyPreview.items.length - applyablePreviewCount : 0;
  const approveSafeCount = approvePreview ? approvePreview.items.filter((item) => item.approvable).length : 0;

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
              onClick={() => {
                setTypeFilter(type);
                setCheckedIds([]);
              }}
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
          CHECK inspects only. APPROVE changes status only. APPLY writes allowlisted fields after a snapshot. ROLLBACK restores that snapshot.
          Level C and fact fields never apply. Auto-apply stays OFF. articleHtml is never bulk-applied.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
          {[
            ['Total loaded', loadedCount],
            ['Pending', healthCounts.pending],
            ['Approved', healthCounts.approved],
            ['Applied', healthCounts.applied],
            ['Rejected', healthCounts.rejected],
            ['Failed', healthCounts.failedApply],
            ['Selected', selectedInFilter.length],
            ['Ready / blocked', `${liveCheck.summary.readyToApply} / ${liveCheck.summary.blocked}`],
          ].map(([label, value]) => (
            <div key={String(label)} className="border rounded-2xl p-3 bg-slate-50">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
              <p className="text-xl font-black text-slate-800 mt-1">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          Showing {renderedProposals.length} of {filteredProposals.length} loaded proposals in current filter
          {summaryCount > loadedCount ? ` · Firestore summary count ${summaryCount} (not all database rows are loaded)` : ''}.
          Select All selects all {filteredProposals.length} loaded/filtered proposals, not the whole database.
        </p>

        <div className="mb-4 border rounded-2xl p-4 bg-slate-50 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-black text-sm">Selected: {selectedInFilter.length} of {filteredProposals.length} loaded/filtered</p>
            <p className="text-[11px] text-gray-500">Scope labels: SELECTED = checked rows · ALL LOADED = current filter, already loaded only.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!selectedInFilter.length || Boolean(statusBusy)} onClick={() => runCheck(selectedInFilter, 'SELECTED')} className="px-3 py-2 rounded-xl bg-white border font-black text-[10px] uppercase tracking-widest disabled:opacity-50">
              Check selected
            </button>
            <button type="button" disabled={!selectedInFilter.length || Boolean(statusBusy)} onClick={() => openApprovePreview(selectedInFilter, 'SELECTED')} className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest disabled:opacity-50">
              Approve safe selected
            </button>
            <button type="button" disabled={!selectedInFilter.length || Boolean(statusBusy)} onClick={() => openApplyPreview(selectedInFilter, 'SELECTED')} className="px-3 py-2 rounded-xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest disabled:opacity-50">
              Apply approved selected
            </button>
            <button type="button" disabled={!selectedInFilter.length} onClick={() => setCheckedIds([])} className="px-3 py-2 rounded-xl bg-white border font-black text-[10px] uppercase tracking-widest disabled:opacity-50">
              Clear selection
            </button>
            <button type="button" disabled={!filteredIds.length || Boolean(statusBusy)} onClick={() => runCheck(filteredIds, 'ALL LOADED')} className="px-3 py-2 rounded-xl bg-white border font-black text-[10px] uppercase tracking-widest disabled:opacity-50">
              Check all loaded
            </button>
            <button type="button" disabled={!filteredIds.length || Boolean(statusBusy)} onClick={() => openApprovePreview(filteredIds, 'ALL LOADED')} className="px-3 py-2 rounded-xl bg-white border font-black text-[10px] uppercase tracking-widest disabled:opacity-50">
              Approve all safe loaded
            </button>
            <button type="button" disabled={!filteredIds.length || Boolean(statusBusy)} onClick={() => openApplyPreview(filteredIds, 'ALL APPROVED LOADED')} className="px-3 py-2 rounded-xl bg-white border font-black text-[10px] uppercase tracking-widest disabled:opacity-50">
              Apply all approved loaded
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            CHECK = inspect/validate only. APPROVE = status only, public content is NOT changed. APPLY = snapshot then write allowlisted fields. ROLLBACK = restore snapshot.
          </p>
        </div>

        <div ref={bulkPanelRef} className="space-y-4 mb-4">
          {checkReport && (
            <div className="border rounded-2xl p-4 bg-indigo-50 space-y-3">
              <p className="font-black text-sm">CHECK RESULT · {checkReport.scope}</p>
              <p className="text-xs text-slate-600">Read-only. Nothing was approved, applied, or published.</p>
              <CheckSummaryGrid summary={checkReport.summary} />
              <div className="space-y-3 max-h-[28rem] overflow-auto">
                {checkReport.items.map((item) => (
                  <div key={item.proposalId || `${item.page}-${item.field}`} className="bg-white border rounded-xl p-3 text-xs space-y-1">
                    <p className="font-black">{item.proposalId || 'no-id'} · {item.page || '—'}</p>
                    <p>Type: {item.contentType} · Field: {item.field} · Level: {item.level} · Confidence: {item.confidence} · Status: {item.status}</p>
                    <p>Applyable: {item.applyable ? 'yes' : 'no'} · {item.applyReason}</p>
                    <p>Fact field: {item.isFactField ? 'yes' : 'no'} · Level C: {item.isLevelC ? 'yes' : 'no'} · Requires review: {item.requiresReview ? 'yes' : 'no'} · Mapping: {item.hasDocumentMapping ? 'yes' : 'no'}</p>
                    <p>articleHtml applyable: {item.articleHtmlApplyable == null ? 'n/a' : item.articleHtmlApplyable ? 'yes' : 'no'}{item.articleHtmlReason ? ` · ${item.articleHtmlReason}` : ''}</p>
                    <div className="grid md:grid-cols-2 gap-2 pt-1">
                      <ProofValue label="OLD" value={item.oldValue} field={item.field} expanded={expandedProof[`old-${item.proposalId}`]} onToggle={() => setExpandedProof((current) => ({ ...current, [`old-${item.proposalId}`]: !current[`old-${item.proposalId}`] }))} />
                      <ProofValue label="NEW" value={item.proposedValue} field={item.field} expanded={expandedProof[`new-${item.proposalId}`]} onToggle={() => setExpandedProof((current) => ({ ...current, [`new-${item.proposalId}`]: !current[`new-${item.proposalId}`] }))} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {approvePreview && (
            <div className="border rounded-2xl p-4 bg-emerald-50 space-y-3">
              <p className="font-black text-sm">Approve all safe proposals in current scope?</p>
              <p className="text-xs">Scope: {approvePreview.scope}. Total: {approvePreview.items.length}. Safe: {approveSafeCount}. Will be skipped: {approvePreview.items.length - approveSafeCount}. Approval does NOT write public content.</p>
              <ul className="text-xs space-y-1 max-h-48 overflow-auto">
                {approvePreview.items.map((item) => (
                  <li key={item.proposalId}>{item.approvable ? '✓' : '–'} {item.proposalId} · {item.field} · {item.approvable ? 'will approve' : item.approveReason}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setApprovePreview(null)} className="px-4 py-2 rounded-xl bg-white border font-black text-xs">Cancel</button>
                <button type="button" disabled={!approveSafeCount || Boolean(statusBusy)} onClick={() => void confirmApproveSafe()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-black text-xs disabled:opacity-50">
                  Approve {approveSafeCount} safe
                </button>
              </div>
            </div>
          )}

          {approveResult && (
            <div className="border rounded-2xl p-4 bg-white space-y-2">
              <p className="font-black text-sm">APPROVE RESULT · {approveResult.scope}</p>
              <p className="text-xs">Approved: {approveResult.results.filter((item) => item.outcome === 'approved').length} · Skipped: {approveResult.results.filter((item) => item.outcome === 'skipped').length} · Failed: {approveResult.results.filter((item) => item.outcome === 'failed').length}</p>
              <ul className="text-xs space-y-1">
                {approveResult.results.map((item) => (
                  <li key={item.id}>{item.outcome === 'approved' ? '✓' : '–'} {item.id} · {item.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {applyPreview && (
            <div className="border rounded-2xl p-4 bg-blue-50 space-y-3">
              <p className="font-black text-sm">SEO APPLY PREVIEW</p>
              <p className="text-xs">Scope: {applyPreview.scope}. You are about to apply {applyablePreviewCount} changes. Safe / applyable: {applyablePreviewCount}. Blocked: {blockedPreviewCount}.</p>
              {applyCounts && (
                <p className="text-xs">
                  {applyCounts.metadata} SEO metadata changes · {applyCounts['internal-link']} internal-link changes · {applyCounts.factual} factual changes · {applyCounts.levelC} Level C changes · {applyCounts.unsafeHtml} unsafe HTML changes.
                  Snapshot: a backup will be created before every applied proposal. articleHtml is never bulk-applied.
                </p>
              )}
              <div className="space-y-3 max-h-[28rem] overflow-auto">
                {applyPreview.items.map((item, idx) => (
                  <div key={item.proposalId} className="bg-white border rounded-xl p-3 text-xs space-y-1">
                    <p className="font-black">{idx + 1}. PAGE: {item.page || '—'} · FIELD: {item.field} · {applyPreview.scope === 'INDIVIDUAL' ? (item.applyable ? 'WILL APPLY' : `SKIP · ${item.applyReason}`) : (bulkApplyable(item) ? 'WILL APPLY' : `SKIP · ${item.field === 'articleHtml' ? 'articleHtml is never bulk-applied' : item.level === 'B' ? 'level-B-not-batched' : item.applyReason}`)}</p>
                    <div className="grid md:grid-cols-2 gap-2">
                      <ProofValue label="OLD" value={item.oldValue} field={item.field} expanded={expandedProof[`aold-${item.proposalId}`]} onToggle={() => setExpandedProof((current) => ({ ...current, [`aold-${item.proposalId}`]: !current[`aold-${item.proposalId}`] }))} />
                      <ProofValue label="NEW" value={item.proposedValue} field={item.field} expanded={expandedProof[`anew-${item.proposalId}`]} onToggle={() => setExpandedProof((current) => ({ ...current, [`anew-${item.proposalId}`]: !current[`anew-${item.proposalId}`] }))} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setApplyPreview(null)} className="px-4 py-2 rounded-xl bg-white border font-black text-xs">Cancel</button>
                <button type="button" disabled={!applyablePreviewCount || Boolean(statusBusy)} onClick={() => void confirmApplyApproved()} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-black text-xs disabled:opacity-50">
                  Apply {applyablePreviewCount} safe changes
                </button>
              </div>
            </div>
          )}

          {applyResult && (
            <div className="border rounded-2xl p-4 bg-white space-y-2">
              <p className="font-black text-sm">BULK APPLY COMPLETE · {applyResult.scope}</p>
              <p className="text-xs">
                Requested: {applyResult.results.length}
                {' · '}Applied: {applyResult.results.filter((item) => item.outcome === 'applied').length}
                {' · '}Failed: {applyResult.results.filter((item) => item.outcome === 'failed').length}
                {' · '}Skipped: {applyResult.results.filter((item) => item.outcome === 'skipped').length}
                {' · '}Snapshots created: {applyResult.results.filter((item) => item.outcome === 'applied' && item.snapshotId).length}
              </p>
              <ul className="text-xs space-y-1">
                {applyResult.results.map((item) => (
                  <li key={item.id}>
                    {item.outcome === 'applied' ? '✓' : item.outcome === 'failed' ? '✗' : '–'} {item.id}
                    {item.snapshotId ? ` · Snapshot: ${item.snapshotId}` : ''} · {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rollbackPreview && (
            <div className="border rounded-2xl p-4 bg-amber-50 space-y-3">
              <p className="font-black text-sm">ROLLBACK CONFIRMATION</p>
              <p className="text-xs">Page: {rollbackPreview.proposal.url || rollbackPreview.proposal.contentId || '—'}</p>
              <p className="text-xs">Field: {rollbackPreview.proposal.field}</p>
              <p className="text-xs">Snapshot: {rollbackPreview.proposal.snapshotId} · Created at: {formatDate(rollbackPreview.snapshot?.createdAt)}</p>
              {rollbackPreview.error && <p className="text-xs text-red-700">{rollbackPreview.error}</p>}
              <div className="grid md:grid-cols-2 gap-2">
                <ProofValue label="Current value" value={rollbackPreview.snapshot?.newValues || rollbackPreview.proposal.proposedValue} field={rollbackPreview.proposal.field} />
                <ProofValue label="Restore to" value={rollbackPreview.snapshot?.oldValues || rollbackPreview.proposal.oldValue} field={rollbackPreview.proposal.field} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setRollbackPreview(null)} className="px-4 py-2 rounded-xl bg-white border font-black text-xs">Cancel</button>
                <button type="button" disabled={Boolean(statusBusy) || !rollbackPreview.proposal.snapshotId} onClick={() => void handleRollback(rollbackPreview.proposal)} className="px-4 py-2 rounded-xl bg-amber-700 text-white font-black text-xs disabled:opacity-50">
                  Rollback
                </button>
              </div>
            </div>
          )}
        </div>

        {selectedProposal && (
          <div
            id="seo-proposal-details"
            ref={proposalDetailsRef}
            className="mb-4 border rounded-2xl p-4 bg-slate-50 space-y-2"
          >
            <p className="font-black text-sm">Proposal details</p>
            <p className="text-xs text-slate-600"><span className="font-black">Page:</span> {selectedProposal.url || selectedProposal.contentId || '—'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Type:</span> {selectedProposal.contentType || 'OTHER'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Issue:</span> {(selectedProposal.evidenceIds || [])[0] || selectedProposal.field || '—'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Old value:</span> {formatProposedChange(selectedProposal.oldValue)}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Proposed value:</span> {formatProposedChange(selectedProposal.proposedValue)}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Reason:</span> {selectedProposal.reason || '—'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Evidence:</span> {(selectedProposal.evidenceIds || []).join(', ') || '—'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Source:</span> {selectedProposal.source || selectedProposal.htmlSource || 'deterministic-optimizer'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Level:</span> {selectedProposal.level || '—'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Confidence:</span> {selectedProposal.confidence || '—'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Requires review:</span> {selectedProposal.requiresReview ? 'yes' : 'no'}</p>
            <p className="text-xs text-slate-600"><span className="font-black">Status:</span> {selectedProposal.status || 'pending'}</p>
            {selectedProposal.snapshotId && <p className="text-xs text-slate-600"><span className="font-black">Snapshot:</span> {selectedProposal.snapshotId}</p>}
            {selectedProposal.lastError && <p className="text-xs text-red-700"><span className="font-black">Failed reason:</span> {selectedProposal.lastError}</p>}
            {selectedCheck && (
              <p className="text-xs text-slate-600">
                Applyable: {selectedCheck.applyable ? 'yes' : 'no'} · {selectedCheck.applyReason}
              </p>
            )}
            {selectedProposal.field === 'articleHtml' && (
              <ProposalArticleHtmlPreview
                key={proposalSelectionKey(selectedProposal) || 'articleHtml'}
                proposal={selectedProposal}
              />
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              {selectedProposal.id && (
                <button
                  type="button"
                  disabled={Boolean(statusBusy)}
                  onClick={() => runCheck([selectedProposal.id as string], 'INDIVIDUAL')}
                  className="px-4 py-2 rounded-xl bg-white border font-black text-xs disabled:opacity-50"
                >
                  Check
                </button>
              )}
              {selectedProposal.status === 'pending' && (
                <>
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
                </>
              )}
              {selectedProposal.status === 'approved' && (
                <button
                  type="button"
                  disabled={Boolean(statusBusy)}
                  onClick={() => handleApply(selectedProposal)}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-black text-xs disabled:opacity-50"
                >
                  Apply (snapshot first)
                </button>
              )}
              {selectedProposal.status === 'applied' && selectedProposal.snapshotId && (
                <button
                  type="button"
                  disabled={Boolean(statusBusy)}
                  onClick={() => void openRollbackPreview(selectedProposal)}
                  className="px-4 py-2 rounded-xl bg-white border font-black text-xs disabled:opacity-50"
                >
                  Rollback
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              CHECK = inspect only. APPROVE never writes public pages. APPLY writes allowlisted fields after a snapshot. articleHtml is never bulk-applied.
            </p>
          </div>
        )}
        {filteredProposals.length === 0 ? (
          <p className="text-sm text-gray-400 font-medium">No optimization proposals yet — run the GitHub Actions scan after page audits exist.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-gray-400 border-b">
                  <th className="py-2 pr-3 font-black">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someFilteredSelected;
                      }}
                      onChange={() => {
                        setCheckedIds(allFilteredSelected ? [] : filteredIds);
                      }}
                      aria-label="Select all loaded/filtered proposals"
                    />
                  </th>
                  <th className="py-2 pr-3 font-black">Page</th>
                  <th className="py-2 pr-3 font-black">Type</th>
                  <th className="py-2 pr-3 font-black">Issue</th>
                  <th className="py-2 pr-3 font-black">Proposed Change</th>
                  <th className="py-2 pr-3 font-black">Level</th>
                  <th className="py-2 pr-3 font-black">Confidence</th>
                  <th className="py-2 pr-3 font-black">Status</th>
                  <th className="py-2 font-black">Action</th>
                </tr>
              </thead>
              <tbody>
                {renderedProposals.map((proposal, idx) => {
                  const selected = proposalSelectionKey(selectedProposal) === proposalSelectionKey(proposal)
                    && Boolean(proposalSelectionKey(proposal));
                  const checked = Boolean(proposal.id && checkedIds.includes(proposal.id));
                  return (
                  <tr
                    key={proposalSelectionKey(proposal) || idx}
                    className={`border-b last:border-0 align-top cursor-pointer hover:bg-violet-50 ${selected ? 'bg-violet-50' : ''}`}
                    onClick={() => selectProposal(proposal)}
                    aria-selected={selected}
                  >
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        disabled={!proposal.id}
                        checked={checked}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          event.stopPropagation();
                          if (proposal.id) toggleChecked(proposal.id);
                        }}
                        aria-label={`Select proposal ${proposal.id || proposal.url || 'row'}`}
                      />
                    </td>
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
                    <td className="py-3 pr-3 text-xs">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${statusClass(proposal.status)}`}>
                        {statusLabel(proposal.status)}
                      </span>
                      {proposal.status === 'applied' && proposal.snapshotId && (
                        <span className="block text-[10px] text-emerald-700 mt-1">Snapshot: {proposal.snapshotId}</span>
                      )}
                      {proposal.status === 'failed' && proposal.lastError && (
                        <span className="block text-[10px] text-red-700 mt-1">Reason: {proposal.lastError}</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className="px-3 py-1 rounded-lg border bg-white font-black text-[10px] uppercase tracking-widest"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (proposal.id) runCheck([proposal.id], 'INDIVIDUAL');
                          }}
                        >
                          Check
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1 rounded-lg border bg-white font-black text-[10px] uppercase tracking-widest"
                          onClick={(event) => {
                            event.stopPropagation();
                            selectProposal(proposal);
                          }}
                        >
                          View details
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
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
        <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-2">Google Search Console Search Analytics</h3>
        <p className="text-xs text-gray-500 mb-4">
          Dated raw Search Analytics evidence collected by the scheduled ingest (clicks, impressions, CTR, position — exactly as Google returned them).
          Measurement only: no SEO score, no ranking claim, no learning. Averages below are impression-weighted aggregates of collected rows, not Google metrics.
        </p>
        {!gscAnalyticsLoaded ? (
          <p className="text-xs text-gray-400">Loading GSC Search Analytics…</p>
        ) : !gscAnalytics ? (
          <p className="text-xs text-gray-500">No GSC Search Analytics data collected yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400">Latest collection</p>
                <p className="font-bold mt-1">{gscAnalytics.latestRun?.at ? new Date(gscAnalytics.latestRun.at).toLocaleString() : '—'}</p>
                <p className="text-gray-400">status: {gscAnalytics.latestRun?.status ?? '—'}</p>
              </div>
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400">Date window</p>
                <p className="font-bold mt-1">
                  {gscAnalytics.latestRun?.window?.startDate ?? '—'} → {gscAnalytics.latestRun?.window?.endDate ?? '—'}
                </p>
                <p className="text-gray-400">requested window (per day)</p>
              </div>
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400">Latest collected date</p>
                <p className="font-bold mt-1">{gscAnalytics.latestDay?.date ?? '—'}</p>
                <p className="text-gray-400">
                  rows: {gscAnalytics.latestDay?.rowCount ?? 0} · pages: {gscAnalytics.latestDay?.pages ?? 0} · queries: {gscAnalytics.latestDay?.queries ?? 0}
                </p>
              </div>
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400">Coverage</p>
                <p className="font-bold mt-1">{gscAnalytics.coverage.daysWithData} day(s) with data</p>
                <p className="text-gray-400">{gscAnalytics.coverage.firstDate ?? '—'} → {gscAnalytics.coverage.lastDate ?? '—'}</p>
              </div>
            </div>
            {gscAnalytics.recentTotals && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="border rounded-xl p-3">
                  <p className="font-black uppercase text-[10px] text-gray-400">Clicks (last {gscAnalytics.recentTotals.days} collected day(s))</p>
                  <p className="font-bold mt-1">{gscAnalytics.recentTotals.clicks}</p>
                </div>
                <div className="border rounded-xl p-3">
                  <p className="font-black uppercase text-[10px] text-gray-400">Impressions</p>
                  <p className="font-bold mt-1">{gscAnalytics.recentTotals.impressions}</p>
                </div>
                <div className="border rounded-xl p-3">
                  <p className="font-black uppercase text-[10px] text-gray-400">Average CTR</p>
                  <p className="font-bold mt-1">
                    {gscAnalytics.recentTotals.avgCtr != null ? `${(gscAnalytics.recentTotals.avgCtr * 100).toFixed(2)}%` : '—'}
                  </p>
                </div>
                <div className="border rounded-xl p-3">
                  <p className="font-black uppercase text-[10px] text-gray-400">Average position</p>
                  <p className="font-bold mt-1" title={gscAnalytics.recentTotals.avgPosition != null ? String(gscAnalytics.recentTotals.avgPosition) : undefined}>
                    {gscAnalytics.recentTotals.avgPosition != null ? gscAnalytics.recentTotals.avgPosition.toFixed(1) : '—'}
                  </p>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-gray-400">
                    <th className="py-1 pr-4">Date</th>
                    <th className="py-1 pr-4">Status</th>
                    <th className="py-1 pr-4">Rows</th>
                    <th className="py-1 pr-4">Clicks</th>
                    <th className="py-1 pr-4">Impressions</th>
                  </tr>
                </thead>
                <tbody>
                  {gscAnalytics.days.slice(0, 10).map((day) => (
                    <tr key={day.date} className="border-t">
                      <td className="py-1 pr-4 font-mono">{day.date}</td>
                      <td className="py-1 pr-4">
                        <span className={day.status === 'success' ? 'text-emerald-700' : day.status === 'error' ? 'text-red-600' : 'text-gray-500'}>
                          {day.status}
                        </span>
                        {day.lastRun?.error ? <span className="text-gray-400"> ({day.lastRun.errorType})</span> : null}
                      </td>
                      <td className="py-1 pr-4">{day.rowCount}</td>
                      <td className="py-1 pr-4">{day.clicks}</td>
                      <td className="py-1 pr-4">{day.impressions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400">
              Search Console data is not real-time — recent dates may legitimately show zero rows until Google finalizes them, and errors are recorded as errors.
              Raw rows (page / query / country / device) stay in Firestore exactly as collected; this section derives nothing beyond the sums and weighted averages shown.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white border rounded-[2rem] p-6">
        <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-2">SEO Change History</h3>
        <p className="text-xs text-gray-500 mb-4">
          Append-only ledger of applied SEO changes and rollbacks (Phase 2 measurement foundation).
          Counts below are recorded change history only — they are NOT Google ranking measurements and nothing here is "learning".
        </p>
        {!changeHistoryLoaded ? (
          <p className="text-xs text-gray-400">Loading SEO change history…</p>
        ) : !changeHistory ? (
          <p className="text-xs text-gray-500">No SEO changes recorded yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400">Applied changes</p>
                <p className="font-bold mt-1">{changeHistory.totalApplied}</p>
              </div>
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400">Rolled back</p>
                <p className="font-bold mt-1">{changeHistory.totalRolledBack}</p>
              </div>
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400">Manual vs automatic</p>
                <p className="font-bold mt-1">{changeHistory.manualCount} manual · {changeHistory.automaticCount} automatic</p>
              </div>
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400">Pending proposals (not changes)</p>
                <p className="font-bold mt-1">{changeHistory.pendingProposalCount}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400 mb-2">By content type</p>
                <p className="text-gray-600">{Object.entries(changeHistory.byContentType).map(([key, count]) => `${key}: ${count}`).join(' · ') || '—'}</p>
              </div>
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400 mb-2">By lifecycle at change time</p>
                <p className="text-gray-600">{Object.entries(changeHistory.byLifecycle).map(([key, count]) => `${key}: ${count}`).join(' · ') || '—'}</p>
              </div>
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400 mb-2">By field</p>
                <p className="text-gray-600">{Object.entries(changeHistory.byField).map(([key, count]) => `${key}: ${count}`).join(' · ') || '—'}</p>
              </div>
              <div className="border rounded-xl p-3">
                <p className="font-black uppercase text-[10px] text-gray-400 mb-2">By source</p>
                <p className="text-gray-600">{Object.entries(changeHistory.bySource).map(([key, count]) => `${key}: ${count}`).join(' · ') || '—'}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-gray-400">
                    <th className="py-1 pr-4">Date</th>
                    <th className="py-1 pr-4">Page</th>
                    <th className="py-1 pr-4">Field</th>
                    <th className="py-1 pr-4">Old → New</th>
                    <th className="py-1 pr-4">Proposal</th>
                    <th className="py-1 pr-4">Status</th>
                    <th className="py-1 pr-4">Source</th>
                    <th className="py-1 pr-4">Lifecycle</th>
                  </tr>
                </thead>
                <tbody>
                  {changeHistory.events.slice(0, 12).map((event: SeoChangeEvent) => (
                    <tr key={`${event.eventId}-${event.at}`} className="border-t">
                      <td className="py-1 pr-4 font-mono whitespace-nowrap">{event.at.slice(0, 16).replace('T', ' ')}</td>
                      <td className="py-1 pr-4 max-w-[220px] truncate" title={event.gscJoinKey || event.pageUrl}>{event.pageUrl || event.contentId}</td>
                      <td className="py-1 pr-4 whitespace-nowrap">{event.field}</td>
                      <td className="py-1 pr-4 max-w-[260px] truncate" title={eventChangeLabel(event)}>
                        {eventChangeLabel(event)}
                      </td>
                      <td className="py-1 pr-4 font-mono truncate max-w-[120px]" title={event.proposalId || ''}>{event.proposalId || '—'}</td>
                      <td className="py-1 pr-4">
                        <span className={event.status === 'applied' ? 'text-emerald-700' : 'text-amber-700'}>{event.status}</span>
                      </td>
                      <td className="py-1 pr-4 whitespace-nowrap">{event.autoApplied ? `auto (${event.source})` : event.source}</td>
                      <td className="py-1 pr-4 whitespace-nowrap" title={event.lifecycle.reason || ''}>{event.lifecycle.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400">
              Large values (articleHtml etc.) are stored as compact hashes referencing their snapshot — full old/new values stay in the snapshot/rollback system.
              Events join to GSC Search Analytics rows by normalized page URL (query strings kept distinct).
            </p>
          </div>
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
