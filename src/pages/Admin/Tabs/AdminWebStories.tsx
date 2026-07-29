import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import { mockTestRepository } from '@/features/mock-tests/data/mockTestRepository';
import type { MockTestRecord } from '@/features/mock-tests/data/mockTestRepository';
import { blogRepository } from '@/features/blogs/data/blogRepository';
import type { BlogRecord } from '@/features/blogs/data/blogRepository';
import { storyRepository } from '@/features/stories/data/storyRepository';
import { ARTICLE_API_BASE } from '@/features/ai-articles/data/aiArticleRepository';
import { Layers, Plus, RefreshCw, Save, X, Zap } from 'lucide-react';
import { asText } from '@/types/firestore';

// =========================================================
// 🧾 VIEW TYPES (Firestore records ko display-safe shape mein normalize karte hain)
// =========================================================
interface StorySourceTest {
    id: string;
    title: string;
    requestedTopic: string;
    totalQuestions: string;
    durationMinutes: string;
    imageUrl: string;
}

interface StorySourceBlog {
    id: string;
    title: string;
    category: string;
    author: string;
    imageUrl: string;
}

interface PublishedStory {
    id: string;
    title: string;
    storyType: string;
    coverImage: string;
}

interface StoryFormData {
    storyType: 'mocktest' | 'blog';
    sourceId: string;
    title: string;
    questions: string;
    duration: string;
    category: string;
    author: string;
    applyLink: string;
    coverImage: string;
}

function errMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** Firestore Timestamp / Date / ISO string / number → epoch ms (safe). */
function timeVal(v: unknown): number {
    if (!v) return 0;
    try {
        if (v instanceof Date) return v.getTime();
        const d = v as { seconds?: number; toDate?: () => Date };
        if (typeof d.seconds === 'number') return d.seconds * 1000;
        if (typeof d.toDate === 'function') return d.toDate().getTime();
        const t = new Date(v as string | number).getTime();
        return Number.isNaN(t) ? 0 : t;
    } catch {
        return 0;
    }
}

const normTest = (t: MockTestRecord): StorySourceTest => ({
    id: t.id,
    title: asText(t['title']),
    requestedTopic: asText(t['requestedTopic']),
    totalQuestions: asText(t['totalQuestions']),
    durationMinutes: asText(t['durationMinutes']),
    imageUrl: asText(t['imageUrl'])
});

const normBlog = (b: BlogRecord): StorySourceBlog => ({
    id: b.id,
    title: asText(b['title']),
    category: asText(b['category']),
    author: asText(b['author']),
    imageUrl: asText(b['imageUrl'])
});

const normStory = (s: { id: string; [key: string]: unknown }): PublishedStory => ({
    id: s.id,
    title: asText(s['title']),
    storyType: asText(s['storyType']),
    coverImage: asText(s['coverImage'])
});

const AdminWebStories = () => {
    const [mockTests, setMockTests] = useState<StorySourceTest[]>([]);
    const [blogs, setBlogs] = useState<StorySourceBlog[]>([]);
    const [stories, setStories] = useState<PublishedStory[]>([]);
    const [loading, setLoading] = useState(false);
    const [backfillLoading, setBackfillLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [activeSource, setActiveSource] = useState<'mocktests' | 'blogs'>('mocktests');

    // Story Data State (Updated for Mock Tests & Blogs)
    const [storyData, setStoryData] = useState<StoryFormData>({
        storyType: 'mocktest',
        sourceId: '',
        title: '',
        questions: '',
        duration: '',
        category: '',
        author: '',
        applyLink: '',
        coverImage: '',
    });

    const loadMockTests = async (): Promise<StorySourceTest[]> => {
        const data = await mockTestRepository.listLatest();
        data.sort((a, b) => timeVal(b.createdAt) - timeVal(a.createdAt));
        return data.map(normTest);
    };

    const loadBlogs = async (): Promise<StorySourceBlog[]> => {
        const data = await blogRepository.listLatest();
        data.sort((a, b) => timeVal(b.createdAt) - timeVal(a.createdAt));
        return data.map(normBlog);
    };

    const loadStories = async (): Promise<PublishedStory[]> => {
        const data = await storyRepository.listLatest();
        data.sort((a, b) => timeVal(b.createdAt) - timeVal(a.createdAt));
        return data.map(normStory);
    };

    // Initial load (setState sirf async callback mein)
    useEffect(() => {
        let cancelled = false;
        Promise.allSettled([loadMockTests(), loadBlogs(), loadStories()])
            .then(([tests, blogList, storyList]) => {
                if (cancelled) return;
                if (tests.status === 'fulfilled') setMockTests(tests.value);
                else console.error(tests.reason);
                if (blogList.status === 'fulfilled') setBlogs(blogList.value);
                else console.error(blogList.reason);
                if (storyList.status === 'fulfilled') setStories(storyList.value);
                else console.error(storyList.reason);
            });
        return () => { cancelled = true; };
    }, []);

    const refreshStories = useCallback(async () => {
        try {
            setStories(await loadStories());
        } catch (err) { console.error(err); }
    }, []);

    const handleSelectMockTest = (id: string) => {
        const item = mockTests.find(m => m.id === id);
        if (item) {
            setStoryData({
                storyType: 'mocktest',
                sourceId: item.id,
                title: item.title || item.requestedTopic || 'New Mock Test',
                questions: item.totalQuestions || '50',
                duration: item.durationMinutes || '30',
                applyLink: `https://studygyaan.in/mocktest/${item.id}`,
                coverImage: item.imageUrl || 'https://studygyaan.in/og-image.jpg',
                category: '', author: ''
            });
            setShowForm(true);
        }
    };

    const handleSelectBlog = (id: string) => {
        const item = blogs.find(b => b.id === id);
        if (item) {
            setStoryData({
                storyType: 'blog',
                sourceId: item.id,
                title: item.title || '',
                category: item.category || 'General',
                author: item.author || 'StudyGyaan Editorial Team',
                applyLink: `https://studygyaan.in/blog/${item.id}`,
                coverImage: item.imageUrl || 'https://studygyaan.in/og-image.jpg',
                questions: '', duration: ''
            });
            setShowForm(true);
        }
    };

    // ⚡ Purane published articles (Jobs/FastTrack/Blogs) se stories ek click me
    const handleBackfill = async () => {
        setBackfillLoading(true);
        try {
            const res = await fetch(`${ARTICLE_API_BASE}/stories/backfill`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 80, refreshCovers: true })
            });
            const data = (await res.json()) as {
                success?: boolean;
                error?: string;
                created?: string[];
                junkArchived?: number;
                coversRefreshed?: number;
                skippedExisting?: number;
                errors?: string[];
            };
            if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
            const createdCount = (data.created || []).length;
            alert(
                `📱 AUTO-STORY RESULT\n\n` +
                `✅ Nayi stories: ${createdCount}\n` +
                `🖼️ Covers refresh (unique pics): ${data.coversRefreshed || 0}\n` +
                `🧹 Purani junk stories safai (noIndex): ${data.junkArchived || 0}\n` +
                `⏭️ Pehle se bani hui: ${data.skippedExisting || 0}\n` +
                ((data.errors || []).length ? `⚠️ Errors: ${(data.errors || []).length}\n` : '') +
                `\nGoogle Discover auto-ready! 🚀`
            );
            void refreshStories();
        } catch (err) {
            alert(`❌ Backfill fail: ${errMsg(err)}`);
        } finally {
            setBackfillLoading(false);
        }
    };

    const handlePublishStory = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                ...storyData,
                status: 'published',
                createdAt: new Date(),
                publisher: 'StudyGyaan',
                publisherLogo: 'https://studygyaan.in/story-assets/publisher-logo.png',
            };
            await storyRepository.createStory(payload);
            alert("✅ Web Story Live! Google Discover ready.");
            setShowForm(false);
            void refreshStories();
        } catch (err) { alert(errMsg(err)); } finally { setLoading(false); }
    };

    return (
        <div className="mt-16 md:mt-24 bg-white rounded-xl shadow-lg border p-3 md:p-6 animate-in fade-in w-full overflow-hidden font-hindi">

            {/* Header */}
            <div className="flex justify-between items-center mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                    <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight">
                        <Zap size={24} className="text-yellow-500 fill-yellow-500" />
                        Web Stories Traffic Machine
                    </h2>
                    <p className="text-xs font-bold text-slate-500 mt-1">
                        Job/FastTrack/Blog publish hote hi story AUTO banti hai.
                        Purane articles ke liye Backfill dabao.
                    </p>
                </div>
                {!showForm && (
                    <div className="flex flex-col sm:flex-row gap-2">
                        <button
                            onClick={() => { void handleBackfill(); }}
                            disabled={backfillLoading}
                            className="px-4 py-2 bg-orange-600 text-white rounded-xl font-black text-xs uppercase shadow-md flex items-center gap-1 disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={backfillLoading ? 'animate-spin' : ''} />
                            {backfillLoading ? 'Bana raha...' : '⚡ Articles → Stories'}
                        </button>
                        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-slate-800 text-white rounded-xl font-black text-xs uppercase shadow-md flex items-center gap-1">
                            <Plus size={16} /> Custom Story
                        </button>
                    </div>
                )}
            </div>

            {!showForm ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Selection Source */}
                    <div className="border-2 border-gray-100 rounded-2xl p-4">
                        <div className="flex gap-2 mb-4">
                            <button onClick={() => setActiveSource('mocktests')} className={`flex-1 py-2 rounded-xl font-black text-[10px] uppercase transition-all ${activeSource === 'mocktests' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`}>Mock Tests</button>
                            <button onClick={() => setActiveSource('blogs')} className={`flex-1 py-2 rounded-xl font-black text-[10px] uppercase transition-all ${activeSource === 'blogs' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`}>Blogs List</button>
                        </div>

                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {activeSource === 'mocktests' ? (
                                mockTests.map(item => (
                                    <div key={item.id} className="flex justify-between items-center p-3 border rounded-xl bg-gray-50 hover:border-blue-300 transition-all">
                                        <div className="truncate flex-1">
                                            <span className="font-bold text-gray-800 text-xs block truncate">{item.title || item.requestedTopic}</span>
                                            <span className="text-[10px] font-bold text-blue-500">{item.totalQuestions} Questions</span>
                                        </div>
                                        <button onClick={() => handleSelectMockTest(item.id)} className="px-3 py-1.5 bg-white border-2 border-blue-200 text-blue-600 rounded-lg text-[10px] font-black uppercase shrink-0">Select</button>
                                    </div>
                                ))
                            ) : (
                                blogs.map(item => (
                                    <div key={item.id} className="flex justify-between items-center p-3 border rounded-xl bg-gray-50 hover:border-emerald-300 transition-all">
                                        <div className="truncate flex-1">
                                            <span className="font-bold text-gray-800 text-xs block truncate">{item.title}</span>
                                            <span className="text-[10px] font-bold text-emerald-600">{item.category}</span>
                                        </div>
                                        <button onClick={() => handleSelectBlog(item.id)} className="px-3 py-1.5 bg-white border-2 border-emerald-200 text-emerald-600 rounded-lg text-[10px] font-black uppercase shrink-0">Select</button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Right: Published List */}
                    <div className="border-2 border-gray-100 rounded-2xl p-4">
                        <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2 uppercase"><Layers size={16} /> Active Stories</h3>
                        <div className="grid grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {stories.map(story => (
                                <div key={story.id} className="relative group rounded-xl overflow-hidden border-2 border-gray-200 aspect-[9/16] bg-gray-900">
                                    <img src={story.coverImage} className="absolute inset-0 w-full h-full object-cover opacity-50" alt="bg" />
                                    <div className="absolute inset-0 p-3 flex flex-col justify-end bg-gradient-to-t from-black via-transparent">
                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded mb-1 w-fit ${story.storyType === 'blog' ? 'bg-emerald-600' : 'bg-blue-600'} text-white`}>{story.storyType}</span>
                                        <h4 className="text-white font-bold text-[10px] leading-tight line-clamp-2">{story.title}</h4>
                                        <a href={`/web-stories/${story.id}`} target="_blank" rel="noreferrer" className="mt-2 text-[9px] text-white underline font-black">View Live</a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                /* Editor Form */
                <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-black text-gray-800 uppercase">Designing {storyData.storyType} Story</h3>
                        <button onClick={() => setShowForm(false)} className="p-2 bg-gray-100 rounded-full text-red-500"><X size={20} /></button>
                    </div>

                    <form onSubmit={handlePublishStory} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4 bg-gray-50 p-5 rounded-2xl border border-gray-200">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Title *</label>
                                <textarea value={storyData.title} onChange={e => setStoryData({ ...storyData, title: e.target.value })} className="w-full p-3 border-2 border-white rounded-xl font-bold text-sm outline-none focus:border-blue-400" rows={2} required />
                            </div>

                            {storyData.storyType === 'mocktest' ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-[10px] font-black text-gray-500 uppercase block">Total Questions</label><input value={storyData.questions} onChange={e => setStoryData({ ...storyData, questions: e.target.value })} className="w-full p-3 border-2 border-white rounded-xl text-sm font-bold" /></div>
                                    <div><label className="text-[10px] font-black text-gray-500 uppercase block">Duration (Mins)</label><input value={storyData.duration} onChange={e => setStoryData({ ...storyData, duration: e.target.value })} className="w-full p-3 border-2 border-white rounded-xl text-sm font-bold" /></div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-[10px] font-black text-gray-500 uppercase block">Category</label><input value={storyData.category} onChange={e => setStoryData({ ...storyData, category: e.target.value })} className="w-full p-3 border-2 border-white rounded-xl text-sm font-bold" /></div>
                                    <div><label className="text-[10px] font-black text-gray-500 uppercase block">Author Name</label><input value={storyData.author} onChange={e => setStoryData({ ...storyData, author: e.target.value })} className="w-full p-3 border-2 border-white rounded-xl text-sm font-bold" /></div>
                                </div>
                            )}

                            <div><label className="text-[10px] font-black text-gray-500 uppercase block">Background Image URL</label><input value={storyData.coverImage} onChange={e => setStoryData({ ...storyData, coverImage: e.target.value })} className="w-full p-3 border-2 border-white rounded-xl text-sm font-bold" required /></div>
                            <div><label className="text-[10px] font-black text-gray-500 uppercase block">Swipe Up Link</label><input value={storyData.applyLink} onChange={e => setStoryData({ ...storyData, applyLink: e.target.value })} className="w-full p-3 border-2 border-white rounded-xl text-sm font-black text-blue-600" required /></div>

                            <button type="submit" disabled={loading} className={`w-full mt-4 flex justify-center items-center gap-2 py-4 text-white rounded-xl font-black uppercase text-sm shadow-xl active:scale-95 transition-all ${storyData.storyType === 'blog' ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                                {loading ? "Publishing..." : <><Save size={20} /> Publish Web Story</>}
                            </button>
                        </div>

                        {/* Preview */}
                        <div className="flex justify-center items-start">
                            <div className="w-[280px] h-[500px] border-[8px] border-gray-900 rounded-[2.5rem] relative overflow-hidden bg-gray-800 shadow-2xl">
                                <img src={storyData.coverImage || 'https://studygyaan.in/og-image.jpg'} className="w-full h-full object-cover opacity-60" alt="bg" />
                                <div className={`absolute inset-0 bg-gradient-to-b from-black/40 via-transparent ${storyData.storyType === 'blog' ? 'to-emerald-900/90' : 'to-blue-900/90'}`}></div>
                                <div className="absolute inset-0 p-5 flex flex-col justify-end text-white">
                                    <span className={`text-[8px] font-black uppercase px-2 py-1 rounded w-fit mb-2 ${storyData.storyType === 'blog' ? 'bg-emerald-600' : 'bg-blue-600'}`}>{storyData.storyType === 'blog' ? 'New Blog' : 'Mock Test'}</span>
                                    <h1 className="text-lg font-black leading-tight mb-4">{storyData.title || 'Preview Title'}</h1>
                                    <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 text-[10px] font-bold border border-white/20">
                                        {storyData.storyType === 'mocktest' ? (
                                            <>
                                                <p>📝 Questions: {storyData.questions}</p>
                                                <p>⏱️ Time: {storyData.duration} Mins</p>
                                            </>
                                        ) : (
                                            <>
                                                <p>📁 Category: {storyData.category}</p>
                                                <p>✍️ Author: {storyData.author}</p>
                                            </>
                                        )}
                                    </div>
                                    <div className="mt-8 text-center animate-bounce">
                                        <span className="text-[8px] font-black uppercase tracking-widest opacity-70">Swipe Up</span>
                                        <div className="w-6 h-1 bg-white mx-auto rounded-full mt-1"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default AdminWebStories;
