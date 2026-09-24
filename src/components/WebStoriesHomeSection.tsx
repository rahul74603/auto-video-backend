import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { storyRepository, type StoryRecord } from '@/features/stories/data/storyRepository';
import SmartImage from './SmartImage';

/**
 * 📱 Web Stories — homepage section (Instagram-style story circles).
 * Pehle stories homepage pe BILKUL nahi dikhti thi → users/bots dono ke liye
 * hidden thi (views zero). Ab latest 12 stories front-page pe milengi —
 * internal discovery + homepage se story pages ko internal links.
 */

const asText = (v: unknown): string => (typeof v === 'string' ? v : '');

const WebStoriesHomeSection = () => {
    const [stories, setStories] = useState<StoryRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        storyRepository
            .listLatest({ limitCount: 12 })
            .then((rows) => { if (alive) setStories(rows); })
            .catch(() => { /* silent — section khud hide ho jayega */ })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    if (!loading && stories.length === 0) return null;

    return (
        <section className="py-10 bg-white font-hindi border-t border-slate-100" aria-label="Web Stories">
            <div className="max-w-6xl mx-auto px-4">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-l-4 border-purple-600 pl-4">
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase">Web Stories 📱</h2>
                        <p className="text-[11px] md:text-xs text-slate-500 font-bold mt-0.5">
                            Tap karke dekho — Exam updates, Results, Jobs in story format
                        </p>
                    </div>
                    <Link
                        to="/web-stories"
                        className="text-purple-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all shrink-0"
                    >
                        View All <ChevronRight size={14} />
                    </Link>
                </div>

                {loading ? (
                    <div className="flex gap-4 overflow-hidden">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="shrink-0 flex flex-col items-center gap-2">
                                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-100 animate-pulse" />
                                <div className="w-14 h-2 rounded bg-slate-100 animate-pulse" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex gap-4 md:gap-5 overflow-x-auto pb-2 custom-scrollbar -mx-1 px-1">
                        {stories.map((story) => {
                            const slug = asText(story.slug) || story.id;
                            const img = asText(story.coverImage) || asText(story.imageUrl);
                            return (
                                <Link
                                    key={story.id}
                                    to={`/web-stories/${slug}`}
                                    className="shrink-0 flex flex-col items-center gap-2 group w-[72px] md:w-[88px]"
                                >
                                    {/* 🌈 Story ring — gradient (Instagram style) */}
                                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full p-[2.5px] bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 group-hover:scale-105 transition-transform">
                                        <div className="w-full h-full rounded-full p-[2px] bg-white">
                                            <div className="w-full h-full rounded-full overflow-hidden bg-slate-100">
                                                <SmartImage
                                                    src={img}
                                                    alt={asText(story.title) || 'StudyGyaan Web Story'}
                                                    fallbackType="story"
                                                    title={asText(story.title)}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <p className="w-full text-center text-[10px] md:text-[11px] font-bold text-slate-700 truncate group-hover:text-purple-700">
                                        {asText(story.title) || 'Web Story'}
                                    </p>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};

export default WebStoriesHomeSection;
