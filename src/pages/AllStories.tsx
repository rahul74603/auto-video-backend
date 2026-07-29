import { useMemo, useState } from 'react';
import { useStories } from '@/features/stories/hooks/useStories';
import { asText } from '@/types/firestore';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO';
import {
    ChevronLeft, Zap, Eye, CalendarDays, ArrowDownWideNarrow, ArrowUpNarrowWide
} from 'lucide-react';
import {
    STORY_TYPE_META,
    storyTypeKey,
    storyDateLabel,
    storyRelativeLabel,
    sortStories,
    filterStoriesByType,
    type SortDir,
    type TypeFilter,
} from '@/features/stories/storyUi';

const FILTER_CHIPS: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: '✨ Sabhi' },
    { key: 'job', label: '🏛️ Jobs' },
    { key: 'fasttrack', label: '⚡ Updates' },
    { key: 'blog', label: '📝 Blog' },
    { key: 'mocktest', label: '🎯 Mock' },
];

const AllStories = () => {
    const { stories, loading } = useStories({ limitCount: 120 });
    const navigate = useNavigate();

    const [sortDir, setSortDir] = useState<SortDir>('new');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

    const visibleStories = useMemo(
        () => sortStories(filterStoriesByType(stories, typeFilter), sortDir),
        [stories, typeFilter, sortDir]
    );

    const typeCount = useMemo(() => {
        const counts: Record<string, number> = { all: stories.length };
        for (const s of stories) {
            const k = storyTypeKey(s.storyType);
            counts[k] = (counts[k] || 0) + 1;
        }
        return counts;
    }, [stories]);

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4 md:px-8 mt-12 md:mt-16">

            <SEO
                customTitle="All Web Stories - Latest Job & Blog Updates | StudyGyaan"
                customDescription="Watch the latest job alerts, exam updates, and educational blog posts in a swipeable web stories format on StudyGyaan Library."
                customUrl="https://studygyaan.in/web-stories"
                customImage="https://studygyaan.in/og-image.jpg"
            />

            <div className="max-w-7xl mx-auto">
                {/* 🔙 Back & Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-3 bg-white rounded-2xl shadow-sm border hover:bg-gray-100 transition-all text-gray-600"
                            aria-label="Wapas jao"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <div>
                            <h1 className="text-2xl md:text-4xl font-black text-gray-900 uppercase tracking-tighter flex items-center gap-2">
                                <Zap className="text-yellow-500 fill-yellow-500" size={32} />
                                Web Stories Library
                            </h1>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                                {visibleStories.length} stories • {sortDir === 'new' ? 'nayi se purani' : 'purani se nayi'}
                            </p>
                        </div>
                    </div>

                    {/* 🔀 Sort toggle */}
                    <button
                        onClick={() => setSortDir(d => (d === 'new' ? 'old' : 'new'))}
                        className="self-start md:self-auto flex items-center gap-2 bg-white border-2 border-gray-200 hover:border-blue-400 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider text-gray-700 shadow-sm transition-all"
                    >
                        {sortDir === 'new'
                            ? <><ArrowDownWideNarrow size={16} /> Naye pehle</>
                            : <><ArrowUpNarrowWide size={16} /> Purane pehle</>}
                    </button>
                </div>

                {/* 🏷️ Type filter chips */}
                <div className="flex gap-2 overflow-x-auto pb-4 mb-4 no-scrollbar">
                    {FILTER_CHIPS.map((chip) => {
                        const active = typeFilter === chip.key;
                        const count = typeCount[chip.key] ?? 0;
                        if (chip.key !== 'all' && count === 0) return null;
                        return (
                            <button
                                key={chip.key}
                                onClick={() => setTypeFilter(chip.key)}
                                className={`shrink-0 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider border-2 transition-all ${
                                    active
                                        ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                                }`}
                            >
                                {chip.label} <span className="opacity-60">({count})</span>
                            </button>
                        );
                    })}
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                        {visibleStories.map((story) => {
                            const typeKey = storyTypeKey(story.storyType);
                            const meta = STORY_TYPE_META[typeKey];
                            const dateStr = storyDateLabel(story.createdAt);
                            const relStr = storyRelativeLabel(story.createdAt);
                            const views = Number(story.views) || 0;
                            return (
                                <div
                                    key={story.id}
                                    onClick={() => navigate(`/web-stories/${story.id}`)}
                                    className="aspect-[9/16] relative rounded-3xl overflow-hidden cursor-pointer group border-4 border-white shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-300"
                                >
                                    <img
                                        src={asText(story.coverImage) || 'https://studygyaan.in/og-image.jpg'}
                                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                        alt={asText(story.title) || 'web story'}
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-black/10"></div>

                                    {/* 🏷️ Type chip (top-left) */}
                                    <span className={`absolute top-3 left-3 text-[9px] font-black text-white px-2 py-1 rounded-lg uppercase shadow-md ${meta.chipClass}`}>
                                        {meta.label}
                                    </span>

                                    {/* 👁️ Views (top-right) */}
                                    <span className="absolute top-3 right-3 flex items-center gap-1 text-[9px] font-black text-white bg-black/45 px-2 py-1 rounded-lg backdrop-blur-sm">
                                        <Eye size={11} /> {views}
                                    </span>

                                    <div className="absolute bottom-0 p-4 w-full">
                                        <h4 className="text-white font-bold text-xs md:text-sm leading-tight line-clamp-3 drop-shadow-lg mb-2">
                                            {asText(story.title)}
                                        </h4>
                                        {/* 📅 Date row — kaunsi kab dali, seedha dikhe */}
                                        {(dateStr || relStr) && (
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-300">
                                                <CalendarDays size={11} className="text-yellow-400" />
                                                <span>{dateStr}</span>
                                                {relStr && <span className="text-yellow-300/90">({relStr})</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {visibleStories.length === 0 && !loading && (
                    <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-200">
                        <p className="text-gray-400 font-bold uppercase tracking-widest">Is type me koi story nahi hai abhi</p>
                    </div>
                )}

                {/* Internal Links (SEO) */}
                <div className="bg-blue-50/50 p-6 md:p-8 rounded-[2rem] border border-blue-100 shadow-sm mt-10 mb-6">
                    <h2 className="text-sm md:text-xl font-black text-slate-800 mb-5 uppercase tracking-tight flex items-center gap-2">
                        <Zap size={20} className="text-blue-600" aria-hidden="true" /> Explore More on StudyGyaan
                    </h2>
                    <div className="flex flex-wrap gap-3">
                        <a href="/govt-jobs" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Latest Govt Jobs</a>
                        <a href="/free-study-material" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Free Study Material</a>
                        <a href="/test" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Free Mock Tests</a>
                        <a href="/blog" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Sarkari Yojana & Blogs</a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AllStories;
