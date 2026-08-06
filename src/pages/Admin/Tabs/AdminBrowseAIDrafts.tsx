/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Edit3, Send, Trash2, Clock, ShieldCheck, ShieldAlert,
  CheckCircle2, XCircle, Briefcase, Zap, Eye, RefreshCcw, FileText,
  Wrench, Bot, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAIArticleDrafts from '@/features/ai-articles/hooks/useAIArticleDrafts';
import { canPublishDraft, callArticleApi } from '@/features/ai-articles/data/aiArticleRepository';
import type { AIArticleDraftRecord } from '@/features/ai-articles/data/aiArticleRepository';
import aiArticleRepository from '@/features/ai-articles/data/aiArticleRepository';

/**
 * 📋 Browse AI Drafts — FIXED VERSION
 * 
 * ✅ Telegram ab SIRF Ready-to-Publish pe jayega — failed pe bilkul nahi
 * ✅ Failed drafts auto-retry: backend har ~10 min me khud try karta hai (REPAIR loop)
 * ✅ Frontend pe bhi "🔁 Auto Fix Until Ready" — tab tak regenerate hota rahe jab tak pass na ho
 * ✅ No spam messages — only useful telegram when ready
 */
type FilterStatus = 'all' | 'passed' | 'failed' | 'published';

const AdminBrowseAIDrafts = () => {
  const { drafts, loading, refresh } = useAIArticleDrafts();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterType, setFilterType] = useState<'all' | 'job' | 'fast-track'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, setSearchParams] = useSearchParams();

  // 🔁 Auto-fix states
  const [autoFixingIds, setAutoFixingIds] = useState<Set<string>>(new Set());
  const [fixAttempts, setFixAttempts] = useState<Record<string, number>>({});
  const [autoFixingAll, setAutoFixingAll] = useState(false);

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

  // 🔁 AUTO FIX UNTIL READY — jab tak pass na ho tab tak regenerate
  const handleAutoFixUntilReady = async (draft: AIArticleDraftRecord) => {
    if (autoFixingIds.has(draft.id)) return;
    
    setAutoFixingIds(prev => {
      const ns = new Set(prev);
      ns.add(draft.id);
      return ns;
    });
    setFixAttempts(prev => ({ ...prev, [draft.id]: 0 }));

    const maxAttempts = 15; // 15 * 8sec = 2 min frontend, backend also retries every 10 min
    let attempts = 0;
    const toastId = toast.loading(`🤖 Auto-fix start: "${draft.title?.slice(0, 35)}" — tab tak retry jab tak ready na ho...`, { duration: Infinity });

    try {
      while (attempts < maxAttempts) {
        attempts++;
        setFixAttempts(prev => ({ ...prev, [draft.id]: attempts }));
        toast.loading(`🔁 Attempt ${attempts}/${maxAttempts}: "${(draft.title || '').slice(0, 30)}"... ${attempts > 1 ? 'pichli bar fail tha, phir try kar raha hoon' : ''}`, { id: toastId });

        try {
          // Regenerate API — feedback loop ke saath pichli issues writer ko bhejta hai backend
          const result: any = await callArticleApi('/articles/regenerate', {
            draftId: draft.id,
            instructions: '', // backend will use stored + previous issues
          });

          // Refresh local list
          await refresh();
          const fresh = await aiArticleRepository.getDraft(draft.id);

          if (fresh) {
            const isReady = fresh.reviewStatus === 'passed' && !fresh.reviewStale;
            if (isReady) {
              toast.success(`✅ Fixed in ${attempts} attempts! "${(fresh.title || '').slice(0, 40)}" ab READY hai — Telegram ab jayega publish ke liye!`, { id: toastId, duration: 8000 });
              break;
            } else {
              // Still blocked — check if fatal (duplicate/expired)
              const issues = fresh.reviewReport?.issues || [];
              const fatal = issues.some((iss: string) => /duplicate|expired|speculative|not.*article.*worthy/i.test(iss));
              if (fatal) {
                toast.error(`❌ Fatal issue (duplicate/expired) — auto-fix se thik nahi hoga: ${issues[0]?.slice(0, 80)}`, { id: toastId, duration: 8000 });
                break;
              }
              if (attempts < maxAttempts) {
                toast.loading(`⏳ Attempt ${attempts} fail — review score ${fresh.reviewReport?.score ?? 'N/A'} — 6s baad phir try... Issues: ${(fresh.reviewReport?.issues?.[0] || '').slice(0, 60)}`, { id: toastId });
                await new Promise(r => setTimeout(r, 6000));
                continue;
              }
            }
          } else {
            // Fresh not found — maybe got published/deleted
            toast.error('Draft ka data nahi mila (shayad already handled)', { id: toastId });
            break;
          }

          // If result directly says pass
          if (result?.review?.verdict === 'pass' || result?.draft?.reviewStatus === 'passed') {
            toast.success(`✅ Review PASS on attempt ${attempts}! Ready to publish`, { id: toastId });
            await refresh();
            break;
          }

        } catch (err: any) {
          const msg = err?.message || 'Unknown error';
          // 503 rate limit etc — wait longer
          const wait = /rate|busy|503/i.test(msg) ? 15000 : 6000;
          if (attempts < maxAttempts) {
            toast.loading(`⚠️ Attempt ${attempts} error: ${msg.slice(0, 80)} — ${wait/1000}s baad retry...`, { id: toastId });
            await new Promise(r => setTimeout(r, wait));
          } else {
            toast.error(`❌ Auto-fix ${maxAttempts} attempts ke baad bhi fail: ${msg}`, { id: toastId, duration: 8000 });
          }
        }
      }

      if (attempts >= maxAttempts) {
        toast.error(`⏸️ ${maxAttempts} attempts ke baad pause kiya — backend auto-retry machine har ~10 min me khud try karti rahegi, ready hote hi Telegram aayega`, { id: toastId, duration: 10000 });
      }

    } finally {
      setAutoFixingIds(prev => {
        const ns = new Set(prev);
        ns.delete(draft.id);
        return ns;
      });
      // Don't immediately clear attempts — show last count for a while
      setTimeout(() => {
        setFixAttempts(prev => {
          const copy = { ...prev };
          delete copy[draft.id];
          return copy;
        });
      }, 10000);
    }
  };

  const handleFixAllBlocked = async () => {
    const failed = drafts.filter(d => (d.reviewStatus === 'failed' || d.reviewStale) && d.status !== 'published' && !d.reviewReport?.issues?.some(iss => /duplicate|expired/i.test(iss)));
    if (failed.length === 0) {
      toast.error('Koi fixable blocked draft nahi hai (fatal duplicate/expired wale skip honge)');
      return;
    }
    if (!window.confirm(`${failed.length} blocked drafts ko ek-ek karke auto-fix karna hai?\n\nHar draft pe ~10-15 attempts lagenge, tab tak jab tak ready na ho.\nBackend bhi har 10 min me khud retry karta hai — Telegram sirf ready hone par aayega.\n\nContinue?`)) return;

    setAutoFixingAll(true);
    const toastId = toast.loading(`🔧 Fix All: ${failed.length} drafts — started...`, { duration: Infinity });

    for (let i = 0; i < failed.length; i++) {
      const d = failed[i];
      toast.loading(`🔧 Fix All: ${i + 1}/${failed.length} — "${(d.title || '').slice(0, 35)}"...`, { id: toastId });
      await handleAutoFixUntilReady(d);
      // Small gap between drafts
      if (i < failed.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    setAutoFixingAll(false);
    toast.success(`✅ All ${failed.length} drafts ka auto-fix cycle complete! Jo ready hue unka Telegram aa gaya hoga`, { id: toastId, duration: 8000 });
    await refresh();
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
            <span className="ml-2 text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100 normal-case tracking-normal">FIXED — No spam Telegram</span>
          </h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {filtered.length} of {drafts.length} drafts
            {statusCounts.passed > 0 && (
              <span className="text-emerald-500 ml-1">· {statusCounts.passed} ready to publish (Telegram only for these)</span>
            )}
            {statusCounts.failed > 0 && (
              <span className="text-amber-600 ml-2">· {statusCounts.failed} auto-retry queue me (backend har 10 min try)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusCounts.failed > 0 && (
            <button
              onClick={handleFixAllBlocked}
              disabled={autoFixingAll || autoFixingIds.size > 0}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${autoFixingAll ? 'bg-amber-100 text-amber-600 cursor-not-allowed' : 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-100'}`}
            >
              {autoFixingAll ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
              {autoFixingAll ? 'Fixing All...' : `Fix ${statusCounts.failed} Blocked`}
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

      {/* Info banner — new logic explained */}
      <div className="mx-4 mt-4 bg-gradient-to-r from-blue-50 to-emerald-50 border border-blue-100 rounded-2xl p-3 flex items-start gap-2.5">
        <div className="p-1.5 bg-white rounded-lg border border-blue-100 shrink-0">
          <Bot size={14} className="text-blue-600" />
        </div>
        <div className="text-[11px] leading-relaxed">
          <p className="font-black text-slate-700 uppercase tracking-wider text-[10px]">🔔 Telegram Fixed + 🔁 Auto-Retry Machine</p>
          <ul className="mt-1 space-y-0.5 font-bold text-slate-600">
            <li>✅ <span className="text-emerald-600">Telegram ab SIRF Ready-to-Publish (Review Passed) pe ayega</span> — failed/blocked pe bilkul nahi.</li>
            <li>🔁 Failed drafts: backend <span className="text-blue-600">har ~10 min me khud regenerate karta hai (20 attempts tak)</span> — jab tak ready na ho — aur ready hote hi Telegram bhejega.</li>
            <li>🛠️ Frontend: har blocked row pe <span className="text-amber-600">🔧 Auto Fix</span> dabao → tab tak try karega jab tak fix na ho jaye (max 15 attempts per click). Fatal duplicate/expired wale skip honge.</li>
            <li>💡 Faltu messages band — sirf kaam ka notification.</li>
          </ul>
        </div>
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
              {searchQuery ? 'Search query change karke dekho' : 'Studio se naya article generate karo'}
            </p>
          </div>
        ) : (
          filtered.map((draft) => {
            const gate = canPublishDraft(draft);
            const isPublished = draft.status === 'published';
            const isAutoFixing = autoFixingIds.has(draft.id);
            const attempts = fixAttempts[draft.id] || 0;
            const isFailed = draft.reviewStatus === 'failed' || draft.reviewStale;
            const isFatal = draft.reviewReport?.issues?.some(iss => /duplicate|expired/i.test(iss));

            return (
              <div
                key={draft.id}
                className={`p-4 md:p-5 hover:bg-blue-50/30 transition-all group ${isPublished ? 'opacity-60' : ''} ${isAutoFixing ? 'bg-amber-50/50 border-l-4 border-amber-400' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: Title + metadata */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-black text-slate-800 text-sm leading-tight line-clamp-1 ${isPublished ? 'text-slate-500' : 'group-hover:text-blue-600 transition-colors'}`}>
                      {draft.title || 'Untitled'}
                      {isAutoFixing && <span className="ml-2 text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full animate-pulse">🔁 Fixing... {attempts}/15</span>}
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
                          <ShieldCheck size={9} /> Ready — Telegram sent
                        </span>
                      ) : (
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1 border ${isFatal ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-red-50 text-red-600 border-red-100'}`}>
                          <XCircle size={9} /> {isFatal ? 'Fatal — Skip' : 'Blocked — Auto-retry queue'}
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
                    {/* Review issues preview (if failed) */}
                    {draft.reviewStatus === 'failed' && draft.reviewReport?.issues?.length ? (
                      <p className="text-[9px] font-bold text-red-400 mt-1 line-clamp-1">
                        ❌ {draft.reviewReport.issues.slice(0, 2).join(' · ')}
                        {!isFatal && <span className="ml-2 text-blue-500">· auto-fix se thik ho sakta hai</span>}
                      </p>
                    ) : null}
                    {isFailed && !isFatal && (
                      <p className="text-[9px] font-bold text-amber-600 mt-1">
                        🔁 Auto-retry: Backend har 10 min me try karta hai, Telegram sirf ready pe · Ya abhi 🔧 Auto Fix dabao
                      </p>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {!isPublished && (
                      <>
                        <button
                          onClick={() => handleEditDraft(draft)}
                          className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all active:scale-90"
                          title="Edit in Studio"
                        >
                          <Edit3 size={14} />
                        </button>

                        {/* 🔁 Auto Fix — only for failed */}
                        {isFailed && !isFatal && (
                          <button
                            onClick={() => handleAutoFixUntilReady(draft)}
                            disabled={isAutoFixing}
                            className={`p-2.5 rounded-xl transition-all active:scale-90 ${isAutoFixing ? 'bg-amber-100 text-amber-600 cursor-not-allowed' : 'bg-amber-500 text-white hover:bg-amber-600 shadow-md'}`}
                            title="Tab tak regenerate jab tak ready na ho"
                          >
                            {isAutoFixing ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                          </button>
                        )}

                        <button
                          onClick={() => handlePublish(draft)}
                          disabled={!gate.ok || isAutoFixing}
                          className={`p-2.5 rounded-xl transition-all active:scale-90 ${gate.ok && !isAutoFixing ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-50 text-slate-300 cursor-not-allowed'}`}
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
                      disabled={isAutoFixing}
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
