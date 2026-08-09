/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Sparkles, Eye, RefreshCcw, Save, Send, Trash2, Link2, FileText,
  ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, Briefcase, Zap, FileUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAIArticleDrafts from '@/features/ai-articles/hooks/useAIArticleDrafts';
import aiArticleRepository, {
  callArticleApi,
  canPublishDraft,
  EDITORIAL_AUTHOR,
  sanitizeOriginRef,
} from '@/features/ai-articles/data/aiArticleRepository';
import type { AIArticleDraftRecord } from '@/features/ai-articles/data/aiArticleRepository';
import { extractTextFromFile } from '@/features/ai-articles/data/pdfTextExtractor';

/** JOBS AI tab की draft row से generate form prefill करने का custom event. */
export const AI_ARTICLE_PREFILL_EVENT = 'sg-ai-article-prefill';

/**
 * Cross-tab prefill handoff (जैसे FastTrackManager → JOBS AI tab):
 * item भेजने वाला इस key में JSON डालकर navigate करता है; studio mount होते ही
 * consume (पढ़कर हटा) देता है — timing/race की दिक्कत नहीं रहती.
 */
export const AI_ARTICLE_PREFILL_STORAGE_KEY = 'sg-ai-article-prefill-storage';

/** Generate form को prefill करने वाला data (event या sessionStorage से). */
interface PrefillDetail {
  type?: 'job' | 'fast-track';
  sourceUrl?: string;
  title?: string;
  organization?: string;
  category?: string;
  /** JOBS AI draft row / Fast Track item ka pointer — publish hote hi wo bhi auto-delete. */
  originRef?: { collection: string; id: string } | null;
}

/** sessionStorage में पड़ा cross-tab prefill पढ़ो + हटा दो (unknown JSON → typed). */
const consumeStoredPrefill = (): PrefillDetail | null => {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(AI_ARTICLE_PREFILL_STORAGE_KEY) || 'null');
    sessionStorage.removeItem(AI_ARTICLE_PREFILL_STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    return {
      type: o.type === 'fast-track' ? 'fast-track' : 'job',
      sourceUrl: typeof o.sourceUrl === 'string' ? o.sourceUrl : undefined,
      title: typeof o.title === 'string' ? o.title : undefined,
      organization: typeof o.organization === 'string' ? o.organization : undefined,
      category: typeof o.category === 'string' ? o.category : undefined,
      originRef: sanitizeOriginRef(o.originRef),
    };
  } catch {
    return null;
  }
};

const EMPTY_EDIT_FORM = {
  title: '',
  seoTitle: '',
  metaDescription: '',
  articleHtml: '',
};

/** Backend /articles/* endpoints ka response shape. */
interface ArticleApiResult {
  draftId?: string;
  draft?: AIArticleDraftRecord;
  review?: { verdict?: 'pass' | 'fail'; score?: number; issues?: string[] } | null;
  reviewPassed?: boolean;
  collection?: string;
  docId?: string;
  autoSearched?: boolean;
  searchQuery?: string;
  resolvedSourceUrl?: string;
  published?: boolean;
  draftDeleted?: boolean;
  originDeleted?: boolean;
  /** 🤖 Self-healing agent loop — kitne attempts chale / kis attempt pe review pass hua. */
  repairAttempts?: number;
  repairPassedOnAttempt?: number | null;
  repairLog?: string[];
  generationMeta?: AIArticleDraftRecord['generationMeta'];
}

const apiErrorStatus = (err: unknown): number | undefined =>
  (err as { status?: number } | null | undefined)?.status;

const AdminAIArticleStudio = () => {
  const { drafts, loading, refresh } = useAIArticleDrafts();
  const [searchParams, setSearchParams] = useSearchParams();

  // ---------- Generate form ----------
  const [genType, setGenType] = useState('job'); // 'job' | 'fast-track'
  const [sourceUrl, setSourceUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [pastedText, setPastedText] = useState(''); // blocked/slow site ka manual source text
  const [extractStatus, setExtractStatus] = useState(''); // PDF/Image se text nikalne ka progress message
  const extractInputRef = useRef<HTMLInputElement | null>(null); // hidden file input (PDF/Image upload)
  const [originRef, setOriginRef] = useState<{ collection: string; id: string } | null>(null); // prefill ka source-pointer (publish pe delete hoga)

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(''); // '', 'generate', 'preview', 'regenerate', 'apply', 'publish', 'delete', 'extract'
  const [showPreview, setShowPreview] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);

  const selected = useMemo(
    () => drafts.find((d) => d.id === selectedId) || null,
    [drafts, selectedId]
  );

  /** Draft editor me load karo (selectedId + form fields set). */
  const loadIntoEditor = useCallback((draft: AIArticleDraftRecord | null) => {
    setSelectedId(draft?.id || null);
    setShowPreview(false);
    if (!draft) {
      setEditForm(EMPTY_EDIT_FORM);
      return;
    }
    setEditForm({
      title: draft.title || '',
      seoTitle: draft.seoTitle || '',
      metaDescription: draft.metaDescription || '',
      articleHtml: draft.articleHtml || '',
    });
  }, []);

  // 📩 JOBS AI draft row का '✨ AI Article' बटन — generate form auto-prefill
  useEffect(() => {
    const applyPrefill = (detail: PrefillDetail) => {
      const isFastTrack = detail.type === 'fast-track';
      setGenType(isFastTrack ? 'fast-track' : 'job');
      if (detail.sourceUrl) setSourceUrl(detail.sourceUrl);
      setOriginRef(detail.originRef || null); // publish ke baad source-record bhi delete hoga
      const contextBits = [detail.title, detail.organization, detail.category].filter(Boolean).join(' | ');
      if (contextBits) setInstructions(`${isFastTrack ? 'Fast Track' : 'Job'}: ${contextBits}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.success('Draft भरी गई — अब GENERATE दबाओ ✨', { duration: 3000 });
    };
    const handlePrefill = (event: Event) => {
      applyPrefill((event as CustomEvent<PrefillDetail>).detail || {});
    };
    window.addEventListener(AI_ARTICLE_PREFILL_EVENT, handlePrefill);
    // दूसरे tab (जैसे FAST TRACK manager) से भेजा गया prefill — mount होते ही consume
    const stored = consumeStoredPrefill();
    if (stored) applyPrefill(stored);
    return () => window.removeEventListener(AI_ARTICLE_PREFILL_EVENT, handlePrefill);
  }, []);

  // ================= 🔗 DEEP-LINK: ?editDraft=<id> =================
  // Telegram EDIT button se admin panel khulta hai — ye draft auto-load karke
  // editor me le aata hai. URL param consume hone ke baad clean bhi ho jaata hai.
  useEffect(() => {
    const editDraftId = searchParams.get('editDraft');
    if (!editDraftId || drafts.length === 0) return;
    const target = drafts.find((d) => d.id === editDraftId);
    if (target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadIntoEditor(target);
      toast.success(`✏️ Draft "${(target.title || '').slice(0, 40)}" editor me load hua`, { duration: 3000 });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      toast.error(`Draft "${editDraftId.slice(0, 16)}..." nahi mili — refresh karke dobara try karo`, { duration: 5000 });
    }
    // URL se param hatao (history replace) — dobara mount pe trigger na ho
    const next = new URLSearchParams(searchParams);
    next.delete('editDraft');
    next.delete('tab');
    setSearchParams(next, { replace: true });
  }, [searchParams, drafts, loadIntoEditor, setSearchParams]);

  const handleApiError = (err: unknown, fallback: string) => {
    const status = apiErrorStatus(err);
    const msg = err instanceof Error ? err.message : fallback;
    if (status === 401) toast.error('Unauthorized — admin Gmail se dubara login karke dekho');
    else if (status === 403) toast.error('Yeh Gmail AI Article Studio admin allow-list me nahi hai');
    else if (status === 409) toast.error(msg);
    else if (status === 404) {
      // Do cases: route hi nahi mila (functions पुराने) YA draft delete ho chuki.
      // Backend JSON error me asli wajah hoti hai — wahi dikhao.
      toast.error(
        msg && !/^Backend error 404/.test(msg)
          ? `${msg} — list refresh karke dobara dekho`
          : 'Backend functions पुराने हैं — ai_backend डिप्लॉय करें',
        { duration: 8000 }
      );
    }
    else if (status === 502) {
      // Source fetch/extract fail — backend message + actionable tip
      toast.error(
        `${msg} — 💡 Tip: notification का DIRECT page या PDF link डालें (homepage/menu page नहीं चलेगा)। Site block करे तो दूसरा official link try करें।`,
        { duration: 9000 }
      );
    } else if (status === 503) {
      // 503 = key missing YA Gemini rate-limit/busy — backend ka asli message hi best hint hai
      toast.error(
        /GEMINI_API_KEY/i.test(msg)
          ? 'GEMINI_API_KEY backend में set नहीं है — ai_backend/.env में key डालकर functions redeploy करें'
          : msg || 'AI service abhi busy hai — 1-2 minute baad dobara try karo',
        { duration: 9000 }
      );
    } else toast.error(msg);
  };

  // ================= PDF/IMAGE TEXT EXTRACT (scanned PDF jugaad) =================
  // Sarkari scanned PDF se copy nahi hota — browser me hi text nikal kar
  // Source Text box me bhar do. Server ki zaroorat hi nahi.
  const handleExtractFile = async (file: File) => {
    if (busy) return;
    setBusy('extract');
    setExtractStatus('📄 File padh raha hoon...');
    try {
      const text = await extractTextFromFile(file, (p) => {
        setExtractStatus(
          p.stage === 'ocr'
            ? `📷 Scanned page mila — OCR chal raha... ${p.page}/${p.totalPages} page`
            : `📄 PDF ka text padh raha... ${p.page}/${p.totalPages} page`
        );
      });
      if (text.length < 50) {
        toast.error(
          'Is file se theek se text na nikal paya — photo bahut dhundli hai. Phone ke Google Lens se text copy karke neeche box me paste kar do.',
          { duration: 9000 }
        );
      } else {
        setPastedText(text);
        toast.success(
          `✅ ${text.length} characters nikal liye — neeche box me aa gaye. Ab upar OFFICIAL link daal kar GENERATE dabao.`,
          { duration: 7000 }
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'File padhne me dikkat aayi — dobara try karo', {
        duration: 8000,
      });
    } finally {
      setExtractStatus('');
      setBusy('');
      // same file dobara select ho sake — input reset
      if (extractInputRef.current) extractInputRef.current.value = '';
    }
  };

  // ================= GENERATE =================
  const handleGenerate = async () => {
    const pasteMode = pastedText.trim().length > 0;
    if (pasteMode) {
      if (!sourceUrl.trim()) {
        toast.error('Text paste kiya hai to upar OFFICIAL link bhi daalo — Links box ke liye zaroori hai');
        return;
      }
      if (pastedText.trim().length < 400) {
        toast.error('Pasted text bahut chhota hai (min 400 characters) — page/PDF se aur text copy karke daalo');
        return;
      }
    } else if (!sourceUrl.trim() && !instructions.trim()) {
      toast.error('Source URL daalo YA niche instructions me bharti ka naam likho — AI khud dhoondh lega');
      return;
    }
    setBusy('generate');
    const toastId = toast.loading(
      pasteMode
        ? '🤖 AI Agent pasted text se article likh raha hai (self-healing loop on)...'
        : sourceUrl.trim()
          ? `🤖 ${genType === 'job' ? 'Job' : 'Fast Track'} Agent source पढ़कर article likh रहा है...`
          : '🔍 AI Agent khud notification ढूंढकर article likh रहा है...',
      { duration: Infinity }
    );
    try {
      const result = await callArticleApi<ArticleApiResult>('/articles/generate', {
        type: genType,
        sourceUrl: sourceUrl.trim(),
        instructions: instructions.trim(),
        ...(pasteMode ? { sourceText: pastedText.trim() } : {}),
        ...(originRef ? { originRef } : {}), // publish hone par JOBS AI/FT source-record bhi delete hoga
        mode: 'manual', // draft-first: कभी भी direct publish नहीं
      });

      if (result.autoSearched && result.resolvedSourceUrl) {
        toast.success(`🔍 AI ne khud notification ढूंढी: ${result.resolvedSourceUrl.slice(0, 70)}`, { duration: 8000 });
      }
      // 🤖 Self-healing loop ka hisaab — kis attempt pe pass hua (1 = pehli baar me hi)
      const attempts = result.repairAttempts || 1;
      const passedOn = result.repairPassedOnAttempt ?? null;
      const repairNote =
        passedOn && passedOn > 1 ? ` — Agent ने खुद ${passedOn}वें attempt में ठीक किया 🤖` : '';
      const adaptiveNote = result.generationMeta?.strategiesTried
        ? ` · Adaptive ${result.generationMeta.strategiesTried}/${result.generationMeta.maxStrategies || 3} (${result.generationMeta.bestStrategyLabel || result.generationMeta.bestStrategy || 'grounded'})`
        : '';
      if (result.review?.verdict === 'pass') {
        toast.success(
          `Draft तैयार! Review पास (score ${result.review.score ?? '-'}, ${attempts} attempt)${adaptiveNote}${repairNote}`,
          { id: toastId, duration: 6000 }
        );
      } else {
        toast.error(
          `Draft बनी, पर ${attempts} attempts के बाद भी review FAIL — publish blocked${adaptiveNote}${result.review?.issues?.[0] ? `\n📋 वजह: ${result.review.issues[0]}` : ''}\n🔁 Auto-Retry Machine हर ~10 min में खुद ठीक करेगी — ready होते ही Telegram approval आएगा`,
          { id: toastId, duration: 11000 }
        );
      }
      await refresh();
      setPastedText(''); // paste-mode text ka kaam khatam — box saaf
      setOriginRef(null); // origin pointer draft record me save ho gaya — form ab saaf
      if (result.draftId) {
        const fresh = await aiArticleRepository.getDraft(result.draftId);
        if (fresh) loadIntoEditor(fresh);
      }
    } catch (err) {
      toast.dismiss(toastId);
      handleApiError(err, 'Generate नहीं हो पाया');
    } finally {
      setBusy('');
    }
  };

  // ================= PREVIEW =================
  const handlePreview = async () => {
    if (!selected) {
      toast.error('पहले कोई draft चुनें');
      return;
    }
    setBusy('preview');
    try {
      // Server से latest draft + review state refresh
      const result = await callArticleApi<ArticleApiResult>('/articles/preview', { draftId: selected.id });
      if (result?.draft) loadIntoEditor(result.draft);
      setShowPreview(true);
      toast.success('Preview ready');
    } catch {
      // Backend unreachable → local draft से preview
      setShowPreview(true);
      toast('Local preview (backend से refresh नहीं हुआ)', { icon: '👁️' });
    } finally {
      setBusy('');
    }
  };

  // ================= REGENERATE =================
  const handleRegenerate = async () => {
    if (!selected) {
      toast.error('पहले कोई draft चुनें');
      return;
    }
    setBusy('regenerate');
    const toastId = toast.loading('🤖 AI Agent दोबारा लिख रहा है (self-healing loop on)...', { duration: Infinity });
    try {
      const result = await callArticleApi<ArticleApiResult>('/articles/regenerate', {
        draftId: selected.id,
        instructions: instructions.trim() || undefined,
      });
      await refresh();
      const fresh = await aiArticleRepository.getDraft(selected.id);
      if (fresh) loadIntoEditor(fresh);
      const attempts = result.repairAttempts || 1;
      const passedOn = result.repairPassedOnAttempt ?? null;
      const repairNote = passedOn && passedOn > 1 ? ` — Agent ने खुद ${passedOn}वें attempt में ठीक किया 🤖` : '';
      const adaptiveNote = result.generationMeta?.strategiesTried
        ? ` · Adaptive ${result.generationMeta.strategiesTried}/${result.generationMeta.maxStrategies || 3}`
        : '';
      if (result.review?.verdict === 'pass') {
        toast.success(`Regenerated — review पास (${attempts} attempt)${adaptiveNote}${repairNote}`, { id: toastId });
      } else {
        toast.error(
          `Regenerated, पर ${attempts} attempts के बाद भी review FAIL — publish blocked${adaptiveNote}${result.review?.issues?.[0] ? `\n📋 वजह: ${result.review.issues[0]}` : ''}\n🔁 Auto-Retry Machine हर ~10 min में खुद try करती रहेगी`,
          { id: toastId, duration: 11000 }
        );
      }
    } catch (err) {
      handleApiError(err, 'Regenerate नहीं हो पाया');
      toast.dismiss(toastId);
    } finally {
      setBusy('');
    }
  };

  // ================= APPLY (edits → re-review) =================
  const handleApply = async () => {
    if (!selected) {
      toast.error('पहले कोई draft चुनें');
      return;
    }
    setBusy('apply');
    const toastId = toast.loading('Edits save हो रहे हैं + Fact & Quality review...');
    try {
      const result = await callArticleApi<ArticleApiResult>('/articles/apply', {
        draftId: selected.id,
        edits: {
          title: editForm.title,
          seoTitle: editForm.seoTitle,
          metaDescription: editForm.metaDescription,
          articleHtml: editForm.articleHtml,
        },
      });
      await refresh();
      const fresh = await aiArticleRepository.getDraft(selected.id);
      if (fresh) loadIntoEditor(fresh);
      if (result.reviewPassed) {
        toast.success('Edits applied — review फिर से पास', { id: toastId });
      } else {
        toast.error(
          `Edits saved, पर review FAIL — publish blocked${result.review?.issues?.[0] ? `\n📋 वजह: ${result.review.issues[0]}` : ''}`,
          { id: toastId, duration: 9000 }
        );
      }
    } catch (err) {
      toast.dismiss(toastId);
      // Fallback: Firestore में save + reviewStale flag (publish तब तक blocked)
      try {
        await aiArticleRepository.updateDraft(selected.id, {
          title: editForm.title,
          seoTitle: editForm.seoTitle,
          metaDescription: editForm.metaDescription,
          articleHtml: editForm.articleHtml,
          reviewStale: true,
        });
        await refresh();
        toast('Offline save हुआ — publish से पहले backend से review ज़रूरी है', { icon: '💾', duration: 5000 });
      } catch {
        handleApiError(err, 'Apply नहीं हो पाया');
      }
    } finally {
      setBusy('');
    }
  };

  // ================= PUBLISH (guarded) =================
  const handlePublish = async () => {
    if (!selected) return;
    // ⭐ Pehle Firestore se LATEST draft lao — warna purani failed state (stale)
    // ke basis pe galat "Publish blocked" dikh sakta hai jabki server pe PASS hai.
    const latest = await aiArticleRepository.getDraft(selected.id).catch(() => null);
    if (latest) loadIntoEditor(latest);
    const current = latest || selected;

    const gate = canPublishDraft(current);
    if (!gate.ok) {
      toast.error(`Publish blocked: ${gate.reason}`, { duration: 6000 });
      return;
    }
    if (!window.confirm(`"${current.title}" publish करें?`)) return;

    setBusy('publish');
    const toastId = toast.loading('Publishing...');
    try {
      // Publish is server-authoritative. Network/backend failure par browser se
      // direct Firestore publish nahi hota—warna latest review/auth gate bypass
      // ho sakta tha.
      const result = await callArticleApi<ArticleApiResult>('/articles/publish', { draftId: current.id });
      const resultInfo = `${result.collection}/${result.docId}`;
      const originDeleted = Boolean(result.originDeleted);
      toast.success(
        `Published → ${resultInfo} ✓ (draft auto-delete — duplicate nahi${originDeleted ? ' + source-record bhi saaf 🧹' : ''})`,
        { id: toastId, duration: 7000 }
      );
      await refresh();
      loadIntoEditor(null);
    } catch (err) {
      if (apiErrorStatus(err) === 409) {
        await refresh().catch(() => {});
        const synced = await aiArticleRepository.getDraft(current.id).catch(() => null);
        if (synced) loadIntoEditor(synced);
      }
      handleApiError(err, 'Publish नहीं हो पाया');
      toast.dismiss(toastId);
    } finally {
      setBusy('');
    }
  };

  // ================= DELETE =================
  const handleDelete = async (draft: AIArticleDraftRecord) => {
    if (!window.confirm(`"${draft.title}" draft हटाएं?`)) return;
    setBusy('delete');
    try {
      await aiArticleRepository.deleteDraft(draft.id);
      toast.success('Draft deleted');
      if (selectedId === draft.id) loadIntoEditor(null);
      await refresh();
    } catch {
      toast.error('Delete नहीं हो पाया');
    } finally {
      setBusy('');
    }
  };

  const reviewBadge = (draft: AIArticleDraftRecord) => {
    if (draft.status === 'published') {
      return (
        <span className="bg-purple-50 text-purple-600 border border-purple-100 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
          <CheckCircle2 size={10} /> Published
        </span>
      );
    }
    if (draft.reviewStale) {
      return (
        <span className="bg-amber-50 text-amber-600 border border-amber-100 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
          <ShieldAlert size={10} /> Re-review pending
        </span>
      );
    }
    if (draft.reviewStatus === 'passed') {
      return (
        <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
          <ShieldCheck size={10} /> Review Passed
        </span>
      );
    }
    return (
      <span className="bg-red-50 text-red-600 border border-red-100 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
        <XCircle size={10} /> Review Failed — Blocked
      </span>
    );
  };

  const publishGate = selected ? canPublishDraft(selected) : { ok: false, reason: '' };
  const anyBusy = !!busy;

  if (loading) {
    return (
      <div className="py-16 flex flex-col justify-center items-center">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 rounded-full border-t-transparent mb-4"></div>
        <p className="font-black text-blue-600 uppercase tracking-widest text-xs">Loading AI Article Studio...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-0 font-hindi">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ============ HEADER ============ */}
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter">
            <Sparkles className="text-blue-600" /> AI Article Studio
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            Source-grounded Job & Fast Track writers · Fact & Quality review · Draft-first · Author: {EDITORIAL_AUTHOR}
          </p>
        </div>

        {/* ============ GENERATE PANEL ============ */}
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-6 md:p-8 space-y-5">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-blue-600" />
            <h3 className="font-black text-slate-800 uppercase text-sm tracking-widest">नया Article Generate करें</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Type selector */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Article Type</label>
              <div className="flex gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => setGenType('job')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${genType === 'job' ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                >
                  <Briefcase size={14} /> Job
                </button>
                <button
                  type="button"
                  onClick={() => setGenType('fast-track')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${genType === 'fast-track' ? 'bg-amber-500 text-white border-amber-500 shadow-lg' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                >
                  <Zap size={14} /> Fast Track
                </button>
              </div>
            </div>

            {/* Source URL */}
            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Official Notification / Source URL</label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://ssc.gov.in/... (khaali chhodo + niche naam likho → AI khud ढूंढेगा 🔍)"
                className="mt-1.5 w-full p-3 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-blue-500 transition-all"
              />
            </div>
          </div>

          <div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extra Instructions (optional)</label>
              <input
                type="text"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="जैसे: dates section को detail में लिखो"
                className="mt-1.5 w-full p-3 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-blue-500 transition-all"
              />
            </div>
          </div>

          {/* ⭐ PASTE MODE — blocked/slow sarkari site ka pakka raasta */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
              <span>Source Text (paste fallback — कभी-कभी hi चाहिए)</span>
              {pastedText.trim().length > 0 && (
                <span className={pastedText.trim().length >= 400 ? 'text-emerald-500' : 'text-red-400'}>
                  {pastedText.trim().length} chars {pastedText.trim().length >= 400 ? '✓' : '(min 400)'}
                </span>
              )}
            </label>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={3}
              placeholder="सिर्फ तब भरो जब upar ka link slow/block हो (जैसे HPSC) — page/PDF खोलकर पूरा text copy करके यहाँ paste कर दो। Article seedha इसी text से बनेगा। (Link भी भरना ज़रूरी है — Links box के लिए)"
              className="mt-1.5 w-full p-3 border border-amber-200 bg-amber-50/40 rounded-xl text-xs font-semibold outline-none focus:ring-2 ring-amber-400 transition-all resize-y"
            />
            {/* 📄 SCANNED PDF jugaad: copy na ho paane wali PDF/Image se browser me hi text nikalo */}
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <input
                ref={extractInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleExtractFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => extractInputRef.current?.click()}
                disabled={anyBusy}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all ${anyBusy ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 active:scale-95'}`}
              >
                {busy === 'extract' ? <RefreshCcw size={13} className="animate-spin" /> : <FileUp size={13} />}
                {busy === 'extract' ? 'Text nikal raha...' : 'PDF/Image upload — text khud niklega'}
              </button>
              {extractStatus && (
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider animate-pulse">
                  {extractStatus}
                </span>
              )}
              {busy !== 'extract' && !extractStatus && (
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Copy na ho paane wali (scanned) PDF ho to सीधे file upload कर दो — text खुद box में आ जाएगा
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={anyBusy}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 ${anyBusy ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'}`}
            >
              {busy === 'generate' ? <RefreshCcw size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Generate
            </button>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              * Generate हमेशा पहले Draft बनाता है — automatic direct publish कभी नहीं होता। फेल review पर publish block रहता है।
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-8 items-start">
          {/* ============ DRAFT LIST ============ */}
          <div className="lg:col-span-2 bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-50 flex justify-between items-center">
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest flex items-center gap-2">
                <FileText size={15} className="text-blue-600" /> AI Drafts ({drafts.length})
              </h3>
              <button onClick={refresh} className="p-2 text-slate-400 hover:text-blue-600 transition-all" title="Refresh list">
                <RefreshCcw size={15} />
              </button>
            </div>
            <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  onClick={() => loadIntoEditor(draft)}
                  className={`p-4 cursor-pointer transition-all ${selectedId === draft.id ? 'bg-blue-50/60 border-l-4 border-blue-600' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-black text-slate-800 text-xs md:text-sm leading-snug line-clamp-2">{draft.title || 'Untitled'}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(draft); }}
                      className="p-1.5 text-slate-300 hover:text-red-500 transition-all shrink-0"
                      title="Delete draft"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border ${draft.type === 'JOB' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                      {draft.type === 'JOB' ? 'Job' : 'Fast Track'}
                    </span>
                    {reviewBadge(draft)}
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 mt-1.5 flex items-center gap-1 uppercase tracking-wider">
                    <Clock size={10} />
                    {draft.createdAt?.seconds ? new Date(draft.createdAt.seconds * 1000).toLocaleString('hi-IN') : 'New'}
                    {draft.wordCount ? ` · ${draft.wordCount} words` : ''}
                  </p>
                </div>
              ))}
              {drafts.length === 0 && (
                <div className="p-14 text-center">
                  <Sparkles className="text-blue-300 mx-auto mb-4" size={34} />
                  <h4 className="font-black text-slate-700 uppercase text-xs tracking-widest">अभी कोई AI draft नहीं</h4>
                  <p className="text-slate-400 text-[11px] mt-2 font-bold">ऊपर official URL डालकर Generate दबाएं।</p>
                </div>
              )}
            </div>
          </div>

          {/* ============ EDITOR / REVIEW PANEL ============ */}
          <div className="lg:col-span-3 space-y-5">
            {!selected && (
              <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-14 text-center">
                <Eye className="text-slate-200 mx-auto mb-4" size={40} />
                <h4 className="font-black text-slate-700 uppercase text-xs tracking-widest">कोई draft चुनें</h4>
                <p className="text-slate-400 text-[11px] mt-2 font-bold">Left list से draft चुनकर Preview / Regenerate / Apply / Publish करें।</p>
              </div>
            )}

            {selected && (
              <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-6 md:p-7 space-y-5">
                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handlePreview}
                    disabled={anyBusy}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all active:scale-95 disabled:opacity-40"
                  >
                    <Eye size={13} /> Preview
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={anyBusy || selected.status === 'published'}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-40"
                  >
                    <RefreshCcw size={13} className={busy === 'regenerate' ? 'animate-spin' : ''} /> Regenerate
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={anyBusy || selected.status === 'published'}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-40"
                  >
                    <Save size={13} /> Apply
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={anyBusy || !publishGate.ok}
                    title={publishGate.ok ? 'Publish to live site' : publishGate.reason}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${publishGate.ok && !anyBusy ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                  >
                    <Send size={13} /> Publish
                  </button>
                </div>

                {!publishGate.ok && selected.status !== 'published' && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-2xl p-3.5">
                    <ShieldAlert size={16} className="text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-black text-red-600 uppercase tracking-wider">Publish Blocked</p>
                      <p className="text-[10px] font-bold text-red-400 mt-0.5">{publishGate.reason}</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-1.5 leading-relaxed">
                        🔁 <span className="text-emerald-600">Auto-Retry Machine</span> har ~10 min me ise khud theek karegi (tab tak retry jab tak review PASS na ho) — ready hote hi <span className="text-blue-600">Telegram pe ✅ approval</span> aayega. Turant chahiye to <span className="text-amber-600">🔄 REGENERATE</span> dabao.
                      </p>
                    </div>
                  </div>
                )}

                {/* Review report */}
                {selected.reviewReport && (
                  <div className={`rounded-2xl border p-4 ${selected.reviewReport.verdict === 'pass' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 text-slate-600">
                      <ShieldCheck size={13} className={selected.reviewReport.verdict === 'pass' ? 'text-emerald-500' : 'text-red-500'} />
                      Fact & Quality Review — {selected.reviewReport.verdict === 'pass' ? 'PASS' : 'FAIL'}
                      {selected.reviewReport.score !== undefined && ` (score ${selected.reviewReport.score})`}
                      {Boolean(selected.reviewReport.metrics?.wordCount) && ` · ${String(selected.reviewReport.metrics?.wordCount)} words`}
                      {(Number(selected.repairAttempts) || 1) > 1 && (
                        <span className="text-blue-500 normal-case tracking-normal">
                          · 🤖 Agent self-heal: attempt {String(selected.repairPassedOnAttempt ?? selected.repairAttempts)}/{String(selected.repairAttempts)}
                        </span>
                      )}
                      {Boolean(selected.generationMeta?.strategiesTried) && (
                        <span className="text-violet-600 normal-case tracking-normal">
                          · Adaptive grounded: {String(selected.generationMeta?.strategiesTried)}/{String(selected.generationMeta?.maxStrategies || 3)}
                          {' · '}{selected.generationMeta?.bestStrategyLabel || selected.generationMeta?.bestStrategy}
                        </span>
                      )}
                    </p>
                    {(selected.reviewReport.issues?.length ?? 0) > 0 && (
                      <ul className="mt-2 space-y-1">
                        {(selected.reviewReport.issues ?? []).slice(0, 6).map((issue, i) => (
                          <li key={i} className="text-[10px] font-bold text-red-500 flex items-start gap-1">
                            <XCircle size={11} className="shrink-0 mt-0.5" /> {issue}
                          </li>
                        ))}
                      </ul>
                    )}
                    {(selected.reviewReport.warnings?.length ?? 0) > 0 && (
                      <ul className="mt-2 space-y-1">
                        {(selected.reviewReport.warnings ?? []).slice(0, 4).map((warn, i) => (
                          <li key={i} className="text-[10px] font-bold text-amber-500">{warn}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Meta + editable fields */}
                <div className="space-y-3">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Title (H1)</label>
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                      disabled={selected.status === 'published'}
                      className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-sm font-black outline-none focus:ring-2 ring-blue-500 disabled:bg-slate-50"
                    />
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SEO Title ({editForm.seoTitle.length}/70)</label>
                      <input
                        value={editForm.seoTitle}
                        onChange={(e) => setEditForm((p) => ({ ...p, seoTitle: e.target.value }))}
                        disabled={selected.status === 'published'}
                        className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 ring-blue-500 disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Meta Description ({editForm.metaDescription.length}/160)</label>
                      <input
                        value={editForm.metaDescription}
                        onChange={(e) => setEditForm((p) => ({ ...p, metaDescription: e.target.value }))}
                        disabled={selected.status === 'published'}
                        className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 ring-blue-500 disabled:bg-slate-50"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <span>Slug: <span className="text-slate-600">{selected.slug}</span></span>
                    <span>Author: <span className="text-slate-600">{selected.authorName || EDITORIAL_AUTHOR}</span></span>
                    <span>Source: <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-500 underline break-all normal-case">{selected.sourceUrl}</a></span>
                  </div>
                </div>

                {/* HTML editor */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Article HTML ({selected.wordCount || 0} words)</label>
                  <textarea
                    value={editForm.articleHtml}
                    onChange={(e) => setEditForm((p) => ({ ...p, articleHtml: e.target.value }))}
                    disabled={selected.status === 'published'}
                    rows={12}
                    className="mt-1 w-full p-3 border border-slate-200 rounded-xl text-[11px] font-mono outline-none focus:ring-2 ring-blue-500 disabled:bg-slate-50"
                  />
                  <p className="text-[9px] font-bold text-amber-500 mt-1 uppercase tracking-wider">
                    * HTML edit के बाद Apply दबाएं — Fact & Quality review दोबारा होगा; फेल होने पर publish block रहेगा।
                  </p>
                </div>

                {/* Rendered preview */}
                {showPreview && (
                  <div className="border-t border-slate-100 pt-5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                      <Eye size={12} /> Rendered Preview
                    </p>
                    <div
                      className="prose prose-sm md:prose max-w-none bg-slate-50 rounded-2xl p-5 border border-slate-100 ai-article-preview"
                      dangerouslySetInnerHTML={{ __html: editForm.articleHtml }}
                    />
                    {(selected.faqs?.length ?? 0) > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">FAQs ({selected.faqs?.length ?? 0})</p>
                        {(selected.faqs ?? []).map((faq, i) => (
                          <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <p className="text-xs font-black text-slate-700">{faq.question}</p>
                            <p className="text-[11px] font-bold text-slate-500 mt-1">{faq.answer}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAIArticleStudio;
