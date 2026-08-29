import { useEffect, useState } from 'react';
import { RefreshCw, Play, Zap, ShieldCheck, AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  fetchAutoOptimizerStatus,
  AUTO_OPTIMIZER_WORKFLOW_URL,
  type AutoOptimizerStatus,
  type AutoOptimizerPageResult,
} from '@/features/seo-intelligence/data/seoIntelligenceRepository';

const resultStatusColor = (status?: string) => {
  if (status === 'optimized' || status === 'would-improve') return 'bg-emerald-100 text-emerald-800';
  if (status === 'unchanged') return 'bg-slate-100 text-slate-600';
  if (status === 'rolled-back') return 'bg-amber-100 text-amber-800';
  if (status === 'failed') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-600';
};

const actionColor = (action?: string) => {
  if (action === 'IMPROVE') return 'bg-emerald-100 text-emerald-800';
  if (action === 'SKIP') return 'bg-blue-100 text-blue-800';
  if (action === 'REVIEW') return 'bg-amber-100 text-amber-800';
  if (action === 'BLOCK') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-600';
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const AdminAutoOptimizer = () => {
  const [status, setStatus] = useState<AutoOptimizerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setStatus(await fetchAutoOptimizerStatus());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Auto-optimizer: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetchAutoOptimizerStatus()
      .then((data) => { if (!cancelled) setStatus(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleOpenWorkflow = () => {
    window.open(AUTO_OPTIMIZER_WORKFLOW_URL, '_blank', 'noopener,noreferrer');
    toast('GitHub Actions page opened. Choose "Run workflow" to start backfill.');
  };

  if (loading && !status && !error) {
    return (
      <div className="py-16 flex flex-col items-center justify-center bg-white rounded-[2rem] border">
        <RefreshCw className="w-8 h-8 animate-spin text-violet-600 mb-3" />
        <p className="font-black text-xs uppercase tracking-widest text-violet-600">Loading auto-optimizer status…</p>
      </div>
    );
  }

  const runner = status?.optimizerRunner;
  const progress = status?.backfillProgress;
  const report = runner?.lastReport;
  const isRunning = runner?.lastStatus === 'running';
  const isFailed = runner?.lastStatus === 'failed';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border rounded-[2rem] p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2">
              <Zap className="text-violet-600" size={22} /> Auto Content Optimizer
            </h2>
            <p className="text-sm text-gray-500 font-medium mt-1">
              Automated SEO content optimizer — deterministic, fact-grounded rules (not learned policy).
              Processes oldest content first, applies safe improvements automatically, and rolls back if
              the internal quality rubric degrades.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load()} className="px-4 py-2 rounded-xl bg-gray-50 border font-black text-xs">
              Refresh
            </button>
            <button
              onClick={handleOpenWorkflow}
              className="px-5 py-2 rounded-xl bg-violet-600 text-white font-black text-xs flex items-center gap-2"
            >
              <Play size={14} />
              Run via GitHub Actions
              <ExternalLink size={13} />
            </button>
          </div>
        </div>

        {/* Safety badges */}
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
            <ShieldCheck size={12} /> Fact fields locked
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
            <ShieldCheck size={12} /> Level C never auto-applied
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
            <ShieldCheck size={12} /> Snapshot before every write
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
            <ShieldCheck size={12} /> Auto-rollback on degradation
          </span>
          <span className="px-3 py-1 rounded-full bg-violet-50 text-violet-700">
            Version: {status?.autoOptimizerVersion ?? '—'}
          </span>
        </div>
      </div>

      {/* Runner Status */}
      <div className={`border rounded-[2rem] p-5 ${isFailed ? 'bg-red-50 border-red-200' : isRunning ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-sm uppercase tracking-widest text-gray-500">Runner Status</h3>
            <p className="mt-2 text-sm font-bold text-slate-700">
              Status: <span className={isFailed ? 'text-red-700' : isRunning ? 'text-blue-700' : 'text-emerald-700'}>
                {runner?.lastStatus || 'No run yet'}
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-1">Last run: {formatDate(runner?.lastRunAt)}</p>
            {runner?.durationMs && <p className="text-xs text-gray-500 mt-1">Duration: {Math.round(runner.durationMs / 1000)}s</p>}
            {runner?.github?.runId && <p className="text-xs text-gray-500 mt-1">GitHub run: {runner.github.runId}</p>}
            {runner?.github?.actor && <p className="text-xs text-gray-500 mt-1">Actor: {runner.github.actor}</p>}
          </div>
          <a href={AUTO_OPTIMIZER_WORKFLOW_URL} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl border bg-white font-black text-xs flex items-center gap-2 w-fit">
            Open workflow <ExternalLink size={13} />
          </a>
        </div>
        {isFailed && runner?.lastError?.message && (
          <p className="mt-3 text-xs text-red-700 font-semibold">Error: {runner.lastError.message}</p>
        )}
      </div>

      {/* Summary Stats */}
      {report && (
        <div className="bg-white border rounded-[2rem] p-6">
          <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-4">Last Run Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              ['Total Processed', report.totalProcessed ?? 0, 'text-slate-800'],
              ['Improved', report.totalImproved ?? 0, 'text-emerald-700'],
              ['Already Good', report.results?.filter((r) => r.action === 'SKIP').length ?? report.totalSkipped ?? 0, 'text-blue-700'],
              ['Needs Review', report.totalNeedsReview ?? report.results?.filter((r) => r.action === 'REVIEW').length ?? 0, 'text-amber-700'],
              ['Rolled Back', report.totalRolledBack ?? 0, 'text-orange-700'],
              ['Failed', report.totalFailed ?? 0, 'text-red-700'],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="border rounded-2xl p-4 bg-slate-50">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
                <p className={`text-2xl font-black mt-1 ${color}`}>{String(value)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className={`px-3 py-1 rounded-full ${report.dryRun ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {report.dryRun ? 'DRY RUN' : 'LIVE'}
            </span>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600">
              Batches: {report.batches ?? 0}
            </span>
            {runner?.avgScoreImprovement ? (
              <span
                className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700"
                title="Internal StudyGyaan quality-rubric delta — not a Google ranking or SEO-performance measurement."
              >
                Avg rubric score gain: +{runner.avgScoreImprovement}
              </span>
            ) : null}
            {runner?.actions
              ? Object.entries(runner.actions).map(([action, count]) => (
                <span key={action} className={`px-3 py-1 rounded-full ${actionColor(action)}`}>
                  {action}: {count}
                </span>
              ))
              : null}
          </div>
          <p className="mt-3 text-[11px] text-gray-400 font-medium">
            Scores are StudyGyaan's internal diagnostic rubric (0–100), not Google ranking measurements.
            This optimizer is not self-learning: every strategy is a fixed deterministic rule.
          </p>
        </div>
      )}

      {/* Backfill Coverage */}
      {(runner?.postRun?.counts?.total != null || progress?.processedTotal != null) && (
        <div className="bg-white border rounded-[2rem] p-6">
          <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-4">Backfill Coverage (Oldest-First)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Eligible Catalog', runner?.postRun?.counts?.total ?? progress?.processedTotal != null ? runner?.postRun?.counts?.total ?? '—' : '—'],
              ['Processed', runner?.postRun?.counts?.processed ?? progress?.processedTotal ?? '—'],
              ['Remaining', runner?.postRun?.counts?.remaining ?? '—'],
              ['Last Batch At', progress?.lastBatchAt ? formatDate(progress.lastBatchAt) : '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="border rounded-2xl p-3 bg-slate-50">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
                <p className="text-xl font-black text-slate-800 mt-1">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pages requiring review */}
      {runner?.needsReviewPages && runner.needsReviewPages.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6">
          <h3 className="font-black text-sm uppercase tracking-widest text-amber-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} /> Pages Requiring Review ({runner.needsReviewPages.length})
          </h3>
          <ul className="space-y-1">
            {runner.needsReviewPages.slice(0, 10).map((page) => (
              <li key={page.page} className="text-xs font-semibold text-amber-900">
                {page.page} — {page.action}: {page.skipReason || 'weak content, no safe automatic improvement found'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Backfill Progress */}
      {progress && (
        <div className="bg-white border rounded-[2rem] p-6">
          <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-4">Backfill Progress</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Batch Size', progress.lastBatchSize ?? 0],
              ['Improved', progress.lastBatchImproved ?? 0],
              ['Skipped', progress.lastBatchSkipped ?? 0],
              ['Failed', progress.lastBatchFailed ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="border rounded-2xl p-3 bg-slate-50">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
                <p className="text-xl font-black text-slate-800 mt-1">{value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">Last batch: {formatDate(progress.lastBatchAt)}</p>
        </div>
      )}

      {/* Per-Page Results */}
      {report?.results && report.results.length > 0 && (
        <div className="bg-white border rounded-[2rem] p-6">
          <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-4">Page Results</h3>
          <p className="text-[11px] text-gray-400 font-medium mb-3">
            Before / After / Delta are internal rubric scores, not Google ranking measurements.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-gray-400 border-b">
                  <th className="py-2 pr-3 font-black">Page</th>
                  <th className="py-2 pr-3 font-black">Action</th>
                  <th className="py-2 pr-3 font-black">Status</th>
                  <th className="py-2 pr-3 font-black">Before</th>
                  <th className="py-2 pr-3 font-black">After</th>
                  <th className="py-2 pr-3 font-black">Delta</th>
                  <th className="py-2 pr-3 font-black">Passes</th>
                  <th className="py-2 pr-3 font-black">Applied</th>
                  <th className="py-2 pr-3 font-black">Rolled Back</th>
                  <th className="py-2 font-black">Detail</th>
                </tr>
              </thead>
              <tbody>
                {report.results.slice(0, 50).map((result: AutoOptimizerPageResult, idx: number) => (
                  <tr key={result.contentId || idx} className="border-b last:border-0 align-top">
                    <td className="py-3 pr-3 font-medium text-slate-700">
                      <span className="block max-w-[200px] truncate">{result.contentId || '—'}</span>
                      <span className="text-[10px] text-gray-400">{result.collectionName || ''}</span>
                    </td>
                    <td className="py-3 pr-3">
                      {result.action ? (
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${actionColor(result.action)}`}>
                          {result.action}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${resultStatusColor(result.status)}`}>
                        {result.status || 'unknown'}
                      </span>
                      {result.error && <p className="text-[10px] text-red-600 mt-1 max-w-[180px] truncate">{result.error}</p>}
                    </td>
                    <td className="py-3 pr-3 font-black">{result.originalScore ?? '—'}</td>
                    <td className="py-3 pr-3 font-black">
                      {result.detail?.projectedAfterScore ?? result.finalScore ?? '—'}
                      {result.detail?.projectedAfterScore != null && (
                        <span className="block text-[9px] font-bold text-gray-400">projected</span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`font-black ${(result.qualityDelta ?? 0) > 0 ? 'text-emerald-700' : (result.qualityDelta ?? 0) < 0 ? 'text-red-700' : 'text-gray-500'}`}>
                        {(result.qualityDelta ?? 0) > 0 ? '+' : ''}{result.qualityDelta ?? 0}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{result.totalPasses ?? result.passes?.length ?? 0}</td>
                    <td className="py-3 pr-3">
                      <span className="text-emerald-700 font-black">
                        {result.totalApplied ?? 0}
                        {result.dryRun && (result.wouldApply ?? 0) > 0 ? (
                          <span className="block text-[9px] font-bold text-emerald-600">would apply {result.wouldApply}</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <span className="text-amber-700 font-black">{result.totalRolledBack ?? 0}</span>
                    </td>
                    <td className="py-3 text-[10px] text-gray-500 max-w-[260px]">
                      {result.skipReason && (
                        <span className="block font-bold text-gray-600">↩ {result.skipReason}</span>
                      )}
                      {result.detail?.bodyContentChanged && (
                        <span className="block text-emerald-700 font-bold">✓ body content improved</span>
                      )}
                      {result.detail?.weakDimensions?.length ? (
                        <span className="block truncate">weak: {result.detail.weakDimensions.join(', ')}</span>
                      ) : null}
                      {result.detail?.fieldsChanged?.length ? (
                        <span className="block truncate">fields: {result.detail.fieldsChanged.join(', ')}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.results.length > 50 && (
            <p className="text-xs text-gray-400 mt-3">Showing 50 of {report.results.length} results</p>
          )}
        </div>
      )}

      {/* Empty state */}
      {!runner && !report && !loading && (
        <div className="bg-white border rounded-[2rem] p-8 text-center">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-black text-sm text-gray-500">No optimization runs yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Run the GitHub Actions workflow to start processing oldest content first.
            First run should use dry-run mode.
          </p>
          <button
            onClick={handleOpenWorkflow}
            className="mt-4 px-5 py-2 rounded-xl bg-violet-600 text-white font-black text-xs flex items-center gap-2 mx-auto"
          >
            <Play size={14} /> Open GitHub Actions
          </button>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6">
          <p className="font-black text-sm text-amber-800 flex items-center gap-2">
            <AlertTriangle size={16} /> Could not load optimizer status
          </p>
          <p className="text-sm text-amber-900 font-medium mt-1">{error}</p>
          <button onClick={() => void load()} className="mt-3 px-4 py-2 rounded-xl bg-white border font-black text-xs">
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminAutoOptimizer;
