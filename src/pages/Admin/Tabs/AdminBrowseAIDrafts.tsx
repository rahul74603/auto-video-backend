/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Edit3, Send, Trash2, Clock, ShieldCheck, ShieldAlert,
  CheckCircle2, XCircle, Briefcase, Zap, Eye, RefreshCcw, FileText,
  Wrench, Bot
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAIArticleDrafts from '@/features/ai-articles/hooks/useAIArticleDrafts';
import { canPublishDraft, publishDraftClientSide } from '@/features/ai-articles/data/aiArticleRepository';
import type { AIArticleDraftRecord } from '@/features/ai-articles/data/aiArticleRepository';
import aiArticleRepository from '@/features/ai-articles/data/aiArticleRepository';
import AdminDraftEditor from './AdminDraftEditor';

/**
 * 📋 Browse AI Drafts — REVIEW DRAFT workflow (primary admin experience)
 *
 * ✅ Publish ab CLIENT-SIDE hai (purani Cloud Run API delete ho chuki — ₹0 setup)
 * ✅ Edit ab full REVIEW DRAFT editor me hota hai (Studio ki zaroorat nahi)
 * ✅ Failed drafts: GitHub Actions wali AI run khud repair karti hai —
 *    🔧 button dabao to agli run me PRIORITY repair queue me chala jata hai
 * ✅ Edited drafts: "Admin Verified" publish — tum khud hi final reviewer ho
 */
type FilterStatus = 'all' | 'passed' | 'failed' | 'published';

const REPAIR_QUEUE_RESET = '2000-01-01T00:00:00.000Z';

const AdminBrowseAIDrafts = () => {
  const { drafts, loading, refresh } = useAIArticleDrafts();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterType, setFilterType] = useState<'all' | 'job' | 'fast-track'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingDraft, setEditingDraft] = useState<AIArticleDraftRecord | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // 🔗 Telegram EDIT deep-link: ?editDraft=<id> → editor khol do (render-time sync)
  const editDraftParam = searchParams.get('editDraft');
  const [handledEditParam, setHandledEditParam] = useState<string | null>(null);
  if (editDraftParam && editDraftParam !== handledEditParam && drafts.length) {
    const target = drafts.find((d) => d.id === editDraftParam);
    setHandledEditParam(editDraftParam);
    if (target) {
      setEditingDraft(target);
    }
  }

  const filtered = useMemo(() => {
    let result = drafts;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.slug || '').toLowerCase().includes(q) ||
        (d.sourceUrl || '').toLowerCase().includes(q) ||
        (d.type || '').toLowerCase().includes(q)
      );
    }
    if (filterType !== 'all') {
      const ft = filterType === 'job' ? 'JOB' : 'FAST_TRACK';
      result = result.filter((d) => d.type === ft);
    }
    if (filterStatus === 'passed') {
      result = result.filter((d) => d.reviewStatus === 'passed' && !d.reviewStale);
    } else if (filterStatus === 'failed') {
      result = result.filter((d) => d.reviewStatus === 'failed' || d.reviewStale);
    } else if (filterStatus === 'published') {
      result = result.filter((d) => d.status === 'published');
    }
    return result;
  }, [drafts, searchQuery, filterStatus, filterType]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    toast.success('Drafts refreshed');
    setIsRefreshing(false);
  };

  /** ✏️ REVIEW DRAFT editor kholo (Studio replace ho gaya) */
  const handleEditDraft = (draft: AIArticleDraftRecord) => {
    setEditingDraft(draft);
  };

  const closeEditor = () => {
    setEditingDraft(null);
    if (searchParams.get('editDraft')) {
      const next = new URLSearchParams(searchParams);
      next.delete('editDraft');
      setSearchParams(next, { replace: true });
    }
  };

  const handleDelete = async (draft: AIArticleDraftRecord) => {
    if (!window.confirm(`"${draft.title}" draft permanently delete karein?`)) return;
    try {
      await aiArticleRepository.deleteDraft(draft.id);
      toast.success('Draft deleted');
      await refresh();
    } catch {
      toast.error('Delete nahi ho paya');
    }
  };

  /** 🚀 Publish — client-side (API deleted). Review-passed = normal publish;
   *  edited/re-review-pending = "Admin Verified" override (tum final reviewer ho). */
  const handlePublish = async (draft: AIArticleDraftRecord) => {
    if (publishingId) return;
    const latest = await aiArticleRepository.getDraft(draft.id).catch(() => null);
    const current = latest || draft;
    if (current.status === 'published') {
      toast.error('Ye draft pehle se published hai');
      await refresh();
      return;
    }
    const gate = canPublishDraft(current);
    let adminOverride = false;

    if (!gate.ok) {
      const hasEssentials = current.title && current.slug && current.articleHtml;
      const isFatal = current.reviewReport?.issues?.some((iss: string) => /duplicate/i.test(iss));
      if (!hasEssentials || isFatal) {
        toast.error(`Publish blocked: ${gate.reason}`, { duration: 6000 });
        return;
      }
      // Edited / review-pending → Admin khud verify karke publish kar sakta hai
      if (!window.confirm(
        `⚠️ AI review gate: ${gate.reason}\n\n` +
        `Kya tumne content khud check kar liya hai?\n` +
        `"ADMIN VERIFIED" publish karein?`
      )) return;
      adminOverride = true;
    } else {
      if (!window.confirm(`"${current.title}" publish karein?`)) return;
    }

    setPublishingId(current.id);
    try {
      const result = await publishDraftClientSide(current, { adminOverride });
      toast.success(`✅ Published → ${result.collection}/${result.docId}${result.originDeleted ? ' (origin row cleaned)' : ''}`, { duration: 6000 });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Publish fail');
      await refresh().catch(() => {});
    } finally {
      setPublishingId(null);
    }
  };

  /** 🔧 Failed draft ko agli AI run (GitHub Actions) ki PRIORITY repair queue me daalo */
  const handleQueueRepair = async (draft: AIArticleDraftRecord) => {
    try {
      await aiArticleRepository.updateDraft(draft.id, { aiDraftLastTryAt: REPAIR_QUEUE_RESET });
      toast.success(`🔁 "${(draft.title || '').slice(0, 35)}" repair queue me — agli AI run me apne aap fix hoga (GitHub Actions)`, { duration: 6000 });
    } catch {
      toast.error('Queue nahi ho paya');
    }
  };

  const handleQueueAllBlocked = async () => {
    const failed = drafts.filter((d) => (d.reviewStatus === 'failed' || d.reviewStale) && d.status !== 'published' && !d.reviewReport?.issues?.some((iss) => /duplicate|expired/i.test(iss)));
    if (!failed.length) {
      toast.error('Koi fixable blocked draft nahi (duplicate/expired wale skip)');
      return;
    }
    if (!window.confirm(`${failed.length} blocked drafts ko repair queue me daalein?\nAgli AI Drafts run (GitHub Actions) inhe ek-ek karke fix karegi.`)) return;
    let ok = 0;
    for (const d of failed) {
      try {
        await aiArticleRepository.updateDraft(d.id, { aiDraftLastTryAt: REPAIR_QUEUE_RESET });
        ok++;
      } catch { /* skip */ }
    }
    toast.success(`🔁 ${ok}/${failed.length} drafts repair queue me!`);
  };

  const statusCounts = useMemo(() => ({
    all: drafts.length,
    passed: drafts.filter((d) => d.reviewStatus === 'passed' && !d.reviewStale).length,
    failed: drafts.filter((d) => d.reviewStatus === 'failed' || d.reviewStale).length,
    published: drafts.filter((d) => d.status === 'published').length,
  }), [drafts]);

  const formatDate = (ts: AIArticleDraftRecord['createdAt']) => {
    if (ts && typeof ts === 'object' && 'seconds' in ts && typeof ts.seconds === 'number') {
      return new Date(ts.seconds * 1000).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return 'New';
  };

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent mb-3"></div>
        <p className="font-black text-blue-600 uppercase tracking-widest text-xs">Loading AI Drafts...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
      {editingDraft && (
        <AdminDraftEditor
          draft={editingDraft}
          onClose={closeEditor}
          onSaved={() => { refresh().catch(() => {}); }}
        />
      )}

      {/* Header */}
      <div className="p-5 md:p-6 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h3 className="font-black text-slate-800 uppercase text-sm tracking-widest flex items-center gap-2">
            <FileText size={16} className="text-blue-600" /> Review AI Drafts
            <span className="ml-2 text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100 normal-case tracking-normal">100% Free — GitHub Actions powered</span>
          </h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {filtered.length} of {drafts.length} drafts
            {statusCounts.passed > 0 && (
              <span className="text-emerald-500 ml-1">· {statusCounts.passed} ready to publish</span>
            )}
            {statusCounts.failed > 0 && (
              <span className="text-amber-600 ml-2">· {statusCounts.failed} repair queue me (agli AI run fix karegi)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusCounts.failed > 0 && (
            <button
              onClick={handleQueueAllBlocked}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-100"
            >
              <Bot size={13} />
              Queue {statusCounts.failed} Blocked
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${isRefreshing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100'}`}
          >
            <RefreshCcw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="mx-4 mt-4 bg-gradient-to-r from-blue-50 to-emerald-50 border border-blue-100 rounded-2xl p-3 flex items-start gap-2.5">
        <div className="p-1.5 bg-white rounded-lg border border-blue-100 shrink-0">
          <Bot size={14} className="text-blue-600" />
        </div>
        <div className="text-[11px] leading-relaxed">
          <p className="font-black text-slate-700 uppercase tracking-wider text-[10px]">🤖 Ek hi workflow: Fetch → AI Article → Review → Publish</p>
          <ul className="mt-1 space-y-0.5 font-bold text-slate-600">
            <li>📥 Naye jobs/updates fetch hote hi <span className="text-blue-600">GitHub Actions AI run full article draft</span> (1600+ words, tables, FAQs) bana deti hai.</li>
            <li>✏️ <span className="text-blue-600">Edit</span> dabao → Review Draft editor me sab kuch dikh jayega — facts, dates, fees, links, FULL description, SEO, FAQs.</li>
            <li>🚀 <span className="text-emerald-600">Publish yahi se hota hai</span> (review-passed = direct; edited = "Admin Verified" confirm ke saath).</li>
            <li>🔧 Blocked drafts: <span className="text-amber-600">Queue Repair</span> dabao → agli AI run me priority pe apne aap fix.</li>
          </ul>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-slate-50 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search drafts by title, slug, source..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 ring-blue-500 transition-all"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'job', 'fast-track'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${filterType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
            >
              {t === 'job' ? <><Briefcase size={11} /> Jobs</> :
               t === 'fast-track' ? <><Zap size={11} /> Fast Track</> : 'All Types'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {([
            { id: 'all', label: 'All', icon: null },
            { id: 'passed', label: 'Ready', icon: <ShieldCheck size={11} /> },
            { id: 'failed', label: 'Blocked', icon: <ShieldAlert size={11} /> },
          ] as const).map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setFilterStatus(id as FilterStatus)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${filterStatus === id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
            >
              {icon}{label}
              <span className="bg-black/10 rounded-full px-1.5 text-[8px]">{statusCounts[id as keyof typeof statusCounts]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Draft list */}
      <div className="divide-y divide-slate-50 max-h-[700px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-14 text-center">
            <Search className="text-slate-200 mx-auto mb-4" size={32} />
            <h4 className="font-black text-slate-700 uppercase text-xs tracking-widest">Koi draft nahi mili</h4>
            <p className="text-slate-400 text-[11px] mt-2 font-bold">
              {searchQuery ? 'Search query change karke dekho' : 'AI Drafts workflow (GitHub Actions) chalne par yahan naye drafts aayenge'}
            </p>
          </div>
        ) : (
          filtered.map((draft) => {
            const gate = canPublishDraft(draft);
            const isPublished = draft.status === 'published';
            const isFailed = draft.reviewStatus === 'failed' || draft.reviewStale;
            const isFatal = draft.reviewReport?.issues?.some(iss => /duplicate|expired/i.test(iss));
            const isPublishing = publishingId === draft.id;
            const canOverride = !isPublished && !!draft.title && !!draft.slug && !!draft.articleHtml && !isFatal;

            return (
              <div
                key={draft.id}
                className={`p-4 md:p-5 hover:bg-blue-50/30 transition-all group ${isPublished ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-black text-slate-800 text-sm leading-tight line-clamp-1 ${isPublished ? 'text-slate-500' : 'group-hover:text-blue-600 transition-colors'}`}>
                      {draft.title || 'Untitled'}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border ${draft.type === 'JOB' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                        {draft.type === 'JOB' ? '⚡ Job' : '🏛️ Fast Track'}
                      </span>
                      {isPublished ? (
                        <span className="bg-purple-50 text-purple-600 border border-purple-100 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
                          <CheckCircle2 size={9} /> Published
                        </span>
                      ) : draft.reviewStale ? (
                        <span className="bg-amber-50 text-amber-600 border border-amber-100 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
                          <ShieldAlert size={9} /> Edited — Admin Verified publish allowed
                        </span>
                      ) : draft.reviewStatus === 'passed' ? (
                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
                          <ShieldCheck size={9} /> Ready to Publish
                        </span>
                      ) : (
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1 border ${isFatal ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-red-50 text-red-600 border-red-100'}`}>
                          <XCircle size={9} /> {isFatal ? 'Fatal — Skip/Delete' : 'Blocked — repair queue'}
                        </span>
                      )}
                      {draft.wordCount ? (
                        <span className="text-[8px] font-bold text-slate-400">{draft.wordCount} words</span>
                      ) : null}
                      {draft.reviewReport?.score !== undefined && (
                        <span className="text-[8px] font-bold text-slate-400">⭐ {draft.reviewReport.score}</span>
                      )}
                      {draft.repairAttempts ? (
                        <span className="text-[8px] font-bold text-blue-400">🤖 {draft.repairAttempts} attempts {draft.repairPassedOnAttempt ? `→ pass on ${draft.repairPassedOnAttempt}` : ''}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      <span className="flex items-center gap-1"><Clock size={10} />{formatDate(draft.createdAt)}</span>
                      {draft.sourceUrl && (
                        <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-600 truncate max-w-[200px] normal-case tracking-normal">
                          {(() => { try { return new URL(draft.sourceUrl).hostname.replace(/^www\./, ''); } catch { return draft.sourceUrl.slice(0, 30); } })()}
                        </a>
                      )}
                      <span className="text-slate-300">ID: {draft.id.slice(0, 12)}…</span>
                    </div>
                    {draft.reviewStatus === 'failed' && draft.reviewReport?.issues?.length ? (
                      <p className="text-[9px] font-bold text-red-400 mt-1 line-clamp-1">
                        ❌ {draft.reviewReport.issues.slice(0, 2).join(' · ')}
                      </p>
                    ) : null}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {!isPublished && (
                      <>
                        <button
                          onClick={() => handleEditDraft(draft)}
                          className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all active:scale-90"
                          title="Review & Edit draft"
                        >
                          <Edit3 size={14} />
                        </button>

                        {isFailed && !isFatal && (
                          <button
                            onClick={() => handleQueueRepair(draft)}
                            className="p-2.5 rounded-xl transition-all active:scale-90 bg-amber-500 text-white hover:bg-amber-600 shadow-md"
                            title="Agli AI run me priority repair"
                          >
                            <Wrench size={14} />
                          </button>
                        )}

                        <button
                          onClick={() => handlePublish(draft)}
                          disabled={isPublishing || (!gate.ok && !canOverride)}
                          className={`p-2.5 rounded-xl transition-all active:scale-90 ${(gate.ok || canOverride) && !isPublishing ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-50 text-slate-300 cursor-not-allowed'}`}
                          title={gate.ok ? 'Publish now' : canOverride ? `Admin Verified publish (${gate.reason})` : `Blocked: ${gate.reason}`}
                        >
                          <Send size={14} className={isPublishing ? 'animate-pulse' : ''} />
                        </button>
                      </>
                    )}
                    {isPublished && (
                      <button
                        onClick={() => window.open(draft.type === 'JOB' ? `/job/${draft.slug}` : `/update/${draft.slug || draft.id}`, '_blank')}
                        className="p-2.5 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-all active:scale-90"
                        title="View live page"
                      >
                        <Eye size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(draft)}
                      className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all active:scale-90 disabled:opacity-30"
                      title="Delete draft"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AdminBrowseAIDrafts;
