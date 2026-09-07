/**
 * AdminDraftEditor — 📝 REVIEW DRAFT editor modal
 * ================================================
 * AI Article draft ka poora review/edit screen:
 *   Basic info · Important dates · Job info · Fees · Links ·
 *   FULL DESCRIPTION (bada editor + word count) · SEO · FAQs
 *
 * Save Draft → Firestore me save (publish NAHI hota, reviewStale mark hota hai)
 * Publish "Admin Verified" wala flow parent (AdminBrowseAIDrafts) me hai.
 */
import { useMemo, useState } from 'react';
import { X, Save, Plus, Trash2, Loader2, FileText, Link2, HelpCircle, CalendarDays, Briefcase, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';
import aiArticleRepository from '@/features/ai-articles/data/aiArticleRepository';
import type { AIArticleDraftRecord } from '@/features/ai-articles/data/aiArticleRepository';

type Props = {
  draft: AIArticleDraftRecord;
  onClose: () => void;
  onSaved: () => void;
};

type Faq = { question: string; answer: string };
type OfficialLink = { label: string; url: string };

const JOB_FACT_FIELDS: Array<{ key: string; label: string; section: 'basic' | 'dates' | 'info' | 'fees' | 'links' }> = [
  { key: 'organization', label: 'Organization', section: 'basic' },
  { key: 'advtNo', label: 'Advertisement No.', section: 'basic' },
  { key: 'category', label: 'Category', section: 'basic' },
  { key: 'startDate', label: 'Application Start Date', section: 'dates' },
  { key: 'lastDate', label: 'Last Date', section: 'dates' },
  { key: 'examDate', label: 'Exam Date', section: 'dates' },
  { key: 'vacancies', label: 'Total Vacancies', section: 'info' },
  { key: 'salary', label: 'Salary / Pay Scale', section: 'info' },
  { key: 'qualification', label: 'Qualification', section: 'info' },
  { key: 'ageLimit', label: 'Age Limit', section: 'info' },
  { key: 'location', label: 'Job Location', section: 'info' },
  { key: 'eligibility', label: 'Eligibility', section: 'info' },
  { key: 'selectionProcess', label: 'Selection Process', section: 'info' },
  { key: 'feeGen', label: 'Fee — General', section: 'fees' },
  { key: 'feeOBC', label: 'Fee — OBC', section: 'fees' },
  { key: 'feeSCST', label: 'Fee — SC/ST', section: 'fees' },
  { key: 'feeFemale', label: 'Fee — Female', section: 'fees' },
  { key: 'applyLink', label: 'Apply Online URL', section: 'links' },
  { key: 'notificationLink', label: 'Notification PDF URL', section: 'links' },
  { key: 'officialSiteLink', label: 'Official Website URL', section: 'links' },
];

const FT_FACT_FIELDS: Array<{ key: string; label: string; section: 'basic' | 'links' }> = [
  { key: 'category', label: 'Category (Result/Admit Card/...)', section: 'basic' },
  { key: 'org', label: 'Organization', section: 'basic' },
  { key: 'updateDate', label: 'Update Date', section: 'basic' },
  { key: 'directLink', label: 'Direct Link URL', section: 'links' },
];

const countWords = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;

const AdminDraftEditor = ({ draft, onClose, onSaved }: Props) => {
  const isJob = draft.type === 'JOB';
  const factFields = isJob ? JOB_FACT_FIELDS : FT_FACT_FIELDS;

  const [title, setTitle] = useState(draft.title || '');
  const [slug, setSlug] = useState(draft.slug || '');
  const [seoTitle, setSeoTitle] = useState(draft.seoTitle || '');
  const [metaDescription, setMetaDescription] = useState(draft.metaDescription || '');
  const [shortDescription, setShortDescription] = useState(draft.shortDescription || '');
  const [articleHtml, setArticleHtml] = useState(draft.articleHtml || '');
  const [keywords, setKeywords] = useState((draft.keywords || []).join(', '));
  const [faqs, setFaqs] = useState<Faq[]>((draft.faqs || []).map((f) => ({ question: f.question || '', answer: f.answer || '' })));
  const [links, setLinks] = useState<OfficialLink[]>((draft.officialLinks || []).map((l) => ({ label: l.label || '', url: l.url || '' })));
  const [facts, setFacts] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    for (const f of factFields) base[f.key] = String((draft.facts || {})[f.key] || '');
    return base;
  });
  const [saving, setSaving] = useState(false);

  const wordCount = useMemo(() => countWords(articleHtml), [articleHtml]);

  const handleSave = async () => {
    if (!title.trim() || !slug.trim()) {
      toast.error('Title aur slug zaroori hain');
      return;
    }
    setSaving(true);
    try {
      const cleanFacts: Record<string, string> = { ...(draft.facts || {}) };
      for (const [k, v] of Object.entries(facts)) {
        const val = String(v || '').trim();
        if (val) cleanFacts[k] = val;
        else delete cleanFacts[k];
      }
      await aiArticleRepository.updateDraft(draft.id, {
        title: title.trim(),
        slug: slug.trim(),
        seoTitle: seoTitle.trim(),
        metaDescription: metaDescription.trim(),
        shortDescription: shortDescription.trim(),
        articleHtml,
        wordCount,
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        faqs: faqs.filter((f) => f.question.trim() && f.answer.trim()),
        officialLinks: links.filter((l) => l.label.trim() && /^https?:\/\//i.test(l.url.trim())),
        facts: cleanFacts,
        draftEdited: true,
        reviewStale: true,
      });
      toast.success('✅ Draft saved! Publish ke liye "Admin Verified" publish use karo (ya agli AI run re-review karegi)');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save fail');
    } finally {
      setSaving(false);
    }
  };

  const sectionBlock = (section: string, label: string, icon: React.ReactNode) => {
    const fields = factFields.filter((f) => f.section === section);
    if (!fields.length) return null;
    return (
      <div className="bg-slate-50 rounded-2xl p-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">{icon}{label}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{f.label}</span>
              <input
                type="text"
                value={facts[f.key] || ''}
                onChange={(e) => setFacts((p) => ({ ...p, [f.key]: e.target.value }))}
                className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 ring-blue-500 bg-white"
              />
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center overflow-y-auto p-2 md:p-6">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl my-4">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white rounded-t-[2rem] border-b border-slate-100 p-4 md:p-5 flex items-center justify-between">
          <div>
            <h3 className="font-black text-slate-800 uppercase text-sm tracking-widest flex items-center gap-2">
              <FileText size={16} className="text-blue-600" />
              Review Draft {isJob ? 'Job' : 'Fast Track'}
            </h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {wordCount} words · {faqs.length} FAQs · {links.length} links
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button onClick={onClose} className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-5">
          {/* Basic Information */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Briefcase size={12} />Basic Information</p>
            <label className="block">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Title (H1)</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full p-3 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-blue-500 bg-white" />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Slug (URL)</span>
                <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
                  className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 ring-blue-500 bg-white" />
              </label>
              <label className="block">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Source URL</span>
                <input type="text" value={String(draft.sourceUrl || '')} readOnly
                  className="mt-1 w-full p-2.5 border border-slate-100 rounded-xl text-xs font-mono bg-slate-100 text-slate-500" />
              </label>
            </div>
          </div>

          {sectionBlock('basic', isJob ? 'Organization & Category' : 'Update Info', <Briefcase size={12} />)}
          {isJob && sectionBlock('dates', 'Important Dates', <CalendarDays size={12} />)}
          {isJob && sectionBlock('info', 'Job Information', <Briefcase size={12} />)}
          {isJob && sectionBlock('fees', 'Application Fee (sirf number, ₹ mat likho)', <IndianRupee size={12} />)}
          {sectionBlock('links', 'Official Links (facts)', <Link2 size={12} />)}

          {/* SEO */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">SEO Metadata</p>
            <label className="block">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">SEO Title <span className={seoTitle.length > 70 ? 'text-red-500' : 'text-emerald-500'}>({seoTitle.length}/70)</span></span>
              <input type="text" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)}
                className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 ring-blue-500 bg-white" />
            </label>
            <label className="block">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Meta Description <span className={metaDescription.length > 160 || metaDescription.length < 120 ? 'text-amber-500' : 'text-emerald-500'}>({metaDescription.length}/160)</span></span>
              <textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} rows={2}
                className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 ring-blue-500 bg-white resize-none" />
            </label>
            <label className="block">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Short Description (cards/listing ke liye)</span>
              <textarea value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} rows={2}
                className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 ring-blue-500 bg-white resize-none" />
            </label>
            <label className="block">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Keywords (comma separated)</span>
              <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)}
                className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 ring-blue-500 bg-white" />
            </label>
          </div>

          {/* FULL DESCRIPTION */}
          <div className="bg-slate-50 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <FileText size={12} />Full Job Description (HTML)
              </p>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${wordCount >= (isJob ? 1600 : 1200) ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                {wordCount} words {wordCount < (isJob ? 1600 : 1200) ? `(min ${isJob ? 1600 : 1200})` : '✓'}
              </span>
            </div>
            <textarea
              value={articleHtml}
              onChange={(e) => setArticleHtml(e.target.value)}
              spellCheck={false}
              className="w-full h-[28rem] p-3 border border-slate-200 rounded-xl text-[11px] font-mono outline-none focus:ring-2 ring-blue-500 bg-white leading-relaxed"
            />
          </div>

          {/* FAQs */}
          <div className="bg-slate-50 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><HelpCircle size={12} />FAQs ({faqs.length})</p>
              <button onClick={() => setFaqs((p) => [...p, { question: '', answer: '' }])}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-blue-700">
                <Plus size={11} /> Add FAQ
              </button>
            </div>
            <div className="space-y-3">
              {faqs.map((f, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 relative">
                  <button onClick={() => setFaqs((p) => p.filter((_, j) => j !== i))}
                    className="absolute top-2 right-2 p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"><Trash2 size={11} /></button>
                  <input type="text" placeholder="Question" value={f.question}
                    onChange={(e) => setFaqs((p) => p.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                    className="w-full p-2 pr-10 border-b border-slate-100 text-xs font-black outline-none" />
                  <textarea placeholder="Answer" value={f.answer} rows={2}
                    onChange={(e) => setFaqs((p) => p.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                    className="w-full p-2 text-xs font-bold outline-none resize-none" />
                </div>
              ))}
            </div>
          </div>

          {/* Official Links */}
          <div className="bg-slate-50 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Link2 size={12} />Official Links ({links.length})</p>
              <button onClick={() => setLinks((p) => [...p, { label: '', url: '' }])}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-blue-700">
                <Plus size={11} /> Add Link
              </button>
            </div>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="text" placeholder="Label (e.g. Apply Online)" value={l.label}
                    onChange={(e) => setLinks((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    className="w-1/3 p-2.5 border border-slate-200 rounded-xl text-xs font-black outline-none bg-white" />
                  <input type="text" placeholder="https://..." value={l.url}
                    onChange={(e) => setLinks((p) => p.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                    className="flex-1 p-2.5 border border-slate-200 rounded-xl text-xs font-mono outline-none bg-white" />
                  <button onClick={() => setLinks((p) => p.filter((_, j) => j !== i))}
                    className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-100"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Footer save */}
          <div className="flex justify-end gap-2 pb-2">
            <button onClick={onClose} className="px-5 py-3 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-200">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-6 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 active:scale-95 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDraftEditor;
