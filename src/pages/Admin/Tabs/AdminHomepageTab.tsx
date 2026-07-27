import { useState } from 'react';
import { Globe, Zap, Trash2, Layout } from 'lucide-react';
import type { SiteContent } from '@/hooks/useSiteContent';

// =========================================================
// 🧾 TYPES
// =========================================================
interface LinkUpdate {
    text: string;
    link: string;
}

interface SeoForm {
    title: string;
    description: string;
}

interface AdminHomepageTabProps {
    siteContent: SiteContent | null;
    updateSiteContent: (newContent: Partial<SiteContent>) => Promise<void>;
}

type ButtonSectionKey = keyof SiteContent['buttons'];

const EMPTY_UPDATE_STATE: { updates: LinkUpdate[] } = { updates: [] };

const AdminHomepageTab = ({ siteContent, updateSiteContent }: AdminHomepageTabProps) => {
    // SEO draft (null = siteContent ka original value dikhao)
    const [seoDraft, setSeoDraft] = useState<SeoForm | null>(null);

    // Derived data (sync effect zaroori nahi)
    const seoLocal: SeoForm = seoDraft
        ?? (siteContent?.seo
            ? { title: siteContent.seo.title ?? '', description: siteContent.seo.description ?? '' }
            : { title: '', description: '' });

    const liveUpdates: LinkUpdate[] = Array.isArray(siteContent?.liveUpdate?.updates)
        ? (siteContent?.liveUpdate?.updates as LinkUpdate[])
        : [];

    const getInputValue = (id: string): string =>
        (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? '';

    const clearInputs = (ids: string[]) => {
        ids.forEach(id => {
            const el = document.getElementById(id) as HTMLInputElement | null;
            if (el) el.value = '';
        });
    };

    // --- 🛠️ मास्टर हैंडलर्स ---

    // 1. Live Marquee के लिए
    const handleAddLive = () => {
        const t = getInputValue('lt');
        const l = getInputValue('ll');
        if (t && l) {
            const newUpdates = [{ text: t, link: l }, ...liveUpdates];
            void updateSiteContent({
                liveUpdate: { ...(siteContent?.liveUpdate ?? EMPTY_UPDATE_STATE), updates: newUpdates }
            });
            clearInputs(['lt', 'll']);
        }
    };

    // 2. चारों कैटेगरी (Results, Admit Card आदि) के लिए कॉमन हैंडलर
    const handleAddLink = (categoryKey: ButtonSectionKey) => {
        const t = getInputValue(`t-${categoryKey}`);
        const l = getInputValue(`l-${categoryKey}`);
        if (t && l) {
            const currentLinks = siteContent?.buttons?.[categoryKey] || [];
            const newLinks = [{ text: t, link: l }, ...currentLinks];

            void updateSiteContent({
                buttons: {
                    ...siteContent?.buttons,
                    [categoryKey]: newLinks
                } as SiteContent['buttons']
            });

            clearInputs([`t-${categoryKey}`, `l-${categoryKey}`]);
        }
    };

    const handleDeleteLink = (categoryKey: ButtonSectionKey, index: number) => {
        const currentLinks = siteContent?.buttons?.[categoryKey] || [];
        const filteredLinks = currentLinks.filter((_, i) => i !== index);
        void updateSiteContent({
            buttons: {
                ...siteContent?.buttons,
                [categoryKey]: filteredLinks
            } as SiteContent['buttons']
        });
    };

    return (
        <div className="p-4 md:p-8 space-y-10 bg-gray-50 min-h-screen pb-20 font-hindi">
            <div className="flex flex-col border-b pb-4 border-slate-200">
                <h2 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter">
                    Dashboard <span className="text-blue-600">Controller</span>
                </h2>
                <p className="text-slate-500 font-bold text-sm uppercase">Manage SEO, Live News, and Manual Links</p>
            </div>

            {/* --- 1. SEO CONTROL --- */}
            <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-purple-100">
                <h3 className="flex items-center gap-2 font-black text-purple-700 mb-6 text-xl uppercase">
                    <Globe className="animate-pulse" /> SEO Master Settings
                </h3>
                <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Meta Title</label>
                        <input value={seoLocal.title} onChange={e => setSeoDraft({ ...seoLocal, title: e.target.value })} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold focus:ring-2 focus:ring-purple-200 outline-none transition-all" placeholder="StudyGyaan: Latest Govt Jobs..." />
                    </div>
                    <button onClick={() => { void updateSiteContent({ seo: { title: seoLocal.title, description: seoLocal.description, keywords: siteContent?.seo?.keywords ?? '' } }); setSeoDraft(null); alert("SEO Saved! ✅"); }} className="bg-purple-600 hover:bg-purple-700 text-white px-10 py-4 rounded-2xl font-black shadow-lg shadow-purple-200 active:scale-95 transition-all w-fit">
                        SAVE SEO CONFIG
                    </button>
                </div>
            </div>

            {/* --- 2. LIVE MARQUEE CONTROL --- */}
            <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-yellow-100">
                <h3 className="flex items-center gap-2 font-black text-yellow-600 mb-6 text-xl uppercase">
                    <Zap className="fill-yellow-500" /> Live News Marquee
                </h3>
                <div className="flex flex-col md:flex-row gap-3 mb-6">
                    <input id="lt" placeholder="Headline (e.g. SSC GD Result Out)" className="p-4 border rounded-2xl flex-1 font-bold bg-slate-50" />
                    <input id="ll" placeholder="Link (URL)" className="p-4 border rounded-2xl flex-1 bg-slate-50" />
                    <button onClick={handleAddLive} className="bg-yellow-500 hover:bg-yellow-600 text-white px-10 rounded-2xl font-black shadow-lg shadow-yellow-100 active:scale-95 transition-all">
                        ADD TO STRIP
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {liveUpdates.map((up, i) => (
                        <div key={i} className="flex justify-between items-center p-4 bg-yellow-50/50 rounded-2xl border border-yellow-100 group">
                            <div className="flex flex-col truncate">
                                <span className="font-black text-slate-800 text-sm truncate">{up.text}</span>
                                <span className="text-[10px] text-blue-500 truncate">{up.link}</span>
                            </div>
                            <button onClick={() => {
                                const filtered = liveUpdates.filter((_, idx) => idx !== i);
                                void updateSiteContent({
                                    liveUpdate: { ...(siteContent?.liveUpdate ?? EMPTY_UPDATE_STATE), updates: filtered }
                                });
                            }} className="p-2 bg-white text-red-400 rounded-xl shadow-sm hover:text-red-600 transition-colors">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- 3. CATEGORY LINKS MANAGER (THE CORE) --- */}
            <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-blue-100">
                <h3 className="flex items-center gap-2 font-black text-blue-700 mb-8 text-xl uppercase">
                    <Layout /> Manual Sections Controller
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {([
                        { key: 'results', label: 'Results Section', color: 'red' },
                        { key: 'admitCard', label: 'Admit Card Section', color: 'blue' },
                        { key: 'answerKey', label: 'Answer Key Section', color: 'green' },
                        { key: 'syllabus', label: 'Syllabus Section', color: 'purple' }
                    ] as { key: ButtonSectionKey; label: string; color: string }[]).map((sec) => (
                        <div key={sec.key} className={`p-6 rounded-[2.5rem] bg-${sec.color}-50/30 border border-${sec.color}-100`}>
                            <h4 className={`text-${sec.color}-600 font-black mb-4 uppercase tracking-widest text-sm flex items-center gap-2`}>
                                <div className={`w-2 h-2 bg-${sec.color}-600 rounded-full animate-pulse`}></div>
                                {sec.label}
                            </h4>

                            {/* Inputs */}
                            <div className="space-y-3 mb-6">
                                <input id={`t-${sec.key}`} placeholder="Job Title" className="w-full p-3 border rounded-xl font-bold text-xs" />
                                <div className="flex gap-2">
                                    <input id={`l-${sec.key}`} placeholder="Link" className="flex-1 p-3 border rounded-xl text-xs" />
                                    <button
                                        onClick={() => handleAddLink(sec.key)}
                                        className={`bg-${sec.color}-600 text-white px-4 py-2 rounded-xl font-black text-[10px] hover:brightness-90 active:scale-95 transition-all`}
                                    >
                                        ADD
                                    </button>
                                </div>
                            </div>

                            {/* List */}
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                {(siteContent?.buttons?.[sec.key] || []).map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                        <span className="text-[10px] font-bold text-slate-700 truncate pr-2">{item.text}</span>
                                        <button onClick={() => handleDeleteLink(sec.key, idx)} className="text-red-300 hover:text-red-500">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                                {(!siteContent?.buttons?.[sec.key] || (siteContent.buttons[sec.key] || []).length === 0) && (
                                    <p className="text-center py-4 text-slate-300 italic text-[10px]">No manual links added.</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
            `}</style>
        </div>
    );
};

export default AdminHomepageTab;
