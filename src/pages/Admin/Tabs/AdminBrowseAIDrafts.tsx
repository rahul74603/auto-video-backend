import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Edit3, Send, Trash2, Clock, ShieldCheck, ShieldAlert,
  CheckCircle2, XCircle, Briefcase, Zap, Eye, RefreshCcw, FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAIArticleDrafts from '@/features/ai-articles/hooks/useAIArticleDrafts';
import { canPublishDraft } from '@/features/ai-articles/data/aiArticleRepository';
import type { AIArticleDraftRecord } from '@/features/ai-articles/data/aiArticleRepository';
import aiArticleRepository from '@/features/ai-articles/data/aiArticleRepository';

/**
 * 📋 Browse AI Drafts Panel
 * Dedicated management view for all ai_article_drafts — searchable, filterable,
 * with quick actions. Complements the Studio's editor-centric workflow.
 *
 * Telegram EDIT button deep-links here: ?editDraft=<id>
 * Studio auto-loads the targeted draft for immediate editing.
 */
type FilterStatus = 'all' | 'passed' | 'failed' | 'published';

const AdminBrowseAIDrafts = () => {
  const { drafts, loading, refresh } = useAIArticleDrafts();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterType, setFilterType] = useState<'all' | 'job' | 'fast-track'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, setSearchParams] = useSearchParams();

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

  /** Telegram EDIT button flow: load this draft into Studio editor. */
  const handleEditDraft = (draft: AIArticleDraftRecord) => {
    setSearchParams({ editDraft: draft.id, tab: 'JOBS AI' }, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success(`✏️ "${(draft.title || '').slice(0, 40)}" Studio me load hoga`, { duration: 3000 });
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

  const handlePublish = async (draft: AIArticleDraftRecord) => {
    const gate = canPublishDraft(draft);
    if (!gate.ok) {
      toast.error(`Publish blocked: ${gate.reason}`, { duration: 6000 });
      return;
    }
    if (!window.confirm(`"${draft.title}" publish karein?`)) return;
    try {
      const fallback = await aiArticleRepository.publishDraftClientSide(draft);
      toast.success(`Published → ${fallback.collection}/${fallback.docId}`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Publish fail');
    }
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
      {/* Header */}
      <div className="p-5 md:p-6 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h3 className="font-black text-slate-800 uppercase text-sm tracking-widest flex items-center gap-2">
            <FileText size={16} className="text-blue-600" /> Browse AI Drafts
          </h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {filtered.length} of {drafts.length} drafts
            {drafts.some(d => d.reviewStatus === 'passed' && !d.reviewStale) && (
              <span className="text-emerald-500 ml-1">· {statusCounts.passed} ready to publish</span>
            )}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${isRefreshing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100'}`}
        >
          <RefreshCcw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-slate-50 flex flex-col md:flex-row gap-3">
        {/* Search */}
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
        {/* Type filter */}
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
        {/* Status filter */}
        <div className="flex gap-1.5">
          {([
            { id: 'all', label: 'All', icon: null },
            { id: 'passed', label: 'Ready', icon: <ShieldCheck size={11} /> },
            { id: 'failed', label: 'Blocked', icon: <ShieldAlert size={11} /> },
          ] as const).map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setFilterStatus(id)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${filterStatus === id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
            >
              {icon}{label}
              <span className="bg-black/10 rounded-full px-1.5 text-[8px]">{statusCounts[id]}</span>
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
              {searchQuery ? 'Search query change karke dekho' : 'Studio se naya article generate karo'}
            </p>
          </div>
        ) : (
          filtered.map((draft) => {
            const gate = canPublishDraft(draft);
            const isPublished = draft.status === 'published';

            return (
              <div
                key={draft.id}
                className={`p-4 md:p-5 hover:bg-blue-50/30 transition-all group ${isPublished ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: Title + metadata */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-black text-slate-800 text-sm leading-tight line-clamp-1 ${isPublished ? 'text-slate-500' : 'group-hover:text-blue-600 transition-colors'}`}>
                      {draft.title || 'Untitled'}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border ${draft.type === 'JOB' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                        {draft.type === 'JOB' ? '⚡ Job' : '🏛️ Fast Track'}
                      </span>
                      {/* Review badge */}
                      {isPublished ? (
                        <span className="bg-purple-50 text-purple-600 border border-purple-100 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
                          <CheckCircle2 size={9} /> Published
                        </span>
                      ) : draft.reviewStale ? (
                        <span className="bg-amber-50 text-amber-600 border border-amber-100 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
                          <ShieldAlert size={9} /> Re-review pending
                        </span>
                      ) : draft.reviewStatus === 'passed' ? (
                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
                          <ShieldCheck size={9} /> Ready
                        </span>
                      ) : (
                        <span className="bg-red-50 text-red-600 border border-red-100 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
                          <XCircle size={9} /> Blocked
                        </span>
                      )}
                      {draft.wordCount ? (
                        <span className="text-[8px] font-bold text-slate-400">{draft.wordCount} words</span>
                      ) : null}
                      {draft.reviewReport?.score !== undefined && (
                        <span className="text-[8px] font-bold text-slate-400">⭐ {draft.reviewReport.score}</span>
                      )}
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
                    {/* Review issues preview (if failed) */}
                    {draft.reviewStatus === 'failed' && draft.reviewReport?.issues?.length ? (
                      <p className="text-[9px] font-bold text-red-400 mt-1 line-clamp-1">
                        ❌ {draft.reviewReport.issues.slice(0, 2).join(' · ')}
                      </p>
                    ) : null}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isPublished && (
                      <>
                        <button
                          onClick={() => handleEditDraft(draft)}
                          className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all active:scale-90"
                          title="Edit in Studio"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handlePublish(draft)}
                          disabled={!gate.ok}
                          className={`p-2.5 rounded-xl transition-all active:scale-90 ${gate.ok ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-50 text-slate-300 cursor-not-allowed'}`}
                          title={gate.ok ? 'Publish now' : `Blocked: ${gate.reason}`}
                        >
                          <Send size={14} />
                        </button>
                      </>
                    )}
                    {isPublished && (
                      <button
                        onClick={() => window.open(draft.type === 'JOB' ? `/job/${draft.slug}` : `/fasttrack/${draft.id}`, '_blank')}
                        className="p-2.5 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-all active:scale-90"
                        title="View live page"
                      >
                        <Eye size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(draft)}
                      className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all active:scale-90"
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
