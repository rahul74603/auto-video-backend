// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, limit, query, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const HomeWebStories = () => {
    const [stories, setStories] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchStories = async () => {
            try {
                const q = query(collection(db, "web_stories"), orderBy("createdAt", "desc"), limit(5));
                const snapshot = await getDocs(q);
                setStories(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (error) {
                console.error("Error fetching stories:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchStories();
    }, []);

    if (loading || stories.length === 0) return null;

    return (
        <div className="py-6 px-4 max-w-7xl mx-auto overflow-hidden">
            {/* 🏷️ Header with View All Link */}
            <div className="flex justify-between items-end mb-6">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-8 bg-gradient-to-b from-blue-600 to-emerald-500 rounded-full"></span>
                    <div>
                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight leading-none">Latest Stories</h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Swipe for quick updates</p>
                    </div>
                </div>
                
                {/* ✅ View All Button */}
                <button 
                    onClick={() => navigate('/all-stories')} 
                    className="flex items-center gap-1 text-xs font-black text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-tighter"
                >
                    View All <ChevronRight size={14} />
                </button>
            </div>
            
            {/* 📱 5 Stories Grid/Scroll */}
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar scroll-smooth">
                {stories.map((story) => (
                    <div 
                        key={story.id} 
                        onClick={() => navigate(`/web-stories/${story.id}`)}
                        className="min-w-[140px] md:min-w-[180px] aspect-[9/16] relative rounded-2xl overflow-hidden cursor-pointer group border-2 border-transparent hover:border-blue-500 transition-all shadow-lg bg-gray-100"
                    >
                        {/* ✅ SEO & SPEED FIX: Added Alt Tag and Lazy Loading */}
                        <img 
                            src={story.coverImage || 'https://studygyaan.in/og-image.jpg'} 
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                            alt={story.title || "StudyGyaan Web Story"} 
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
                        
                        <div className="absolute bottom-0 p-3 w-full">
                            <span className={`text-[7px] font-black text-white px-2 py-0.5 rounded uppercase mb-1.5 inline-block shadow-sm ${story.storyType === 'blog' ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                                {story.storyType === 'blog' ? '📝 Blog' : '🎯 Mock Test'}
                            </span>
                            <h4 className="text-white font-bold text-[11px] md:text-xs leading-tight line-clamp-3 drop-shadow-md">
                                {story.title}
                            </h4>
                        </div>
                    </div>
                ))}
                
                {/* ➡️ Last "View More" Card */}
                <div 
                    onClick={() => navigate('/all-stories')}
                    className="min-w-[140px] md:min-w-[180px] aspect-[9/16] relative rounded-2xl overflow-hidden cursor-pointer border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-all text-gray-400 group"
                >
                    <div className="p-3 bg-white rounded-full shadow-md group-hover:scale-110 transition-transform">
                        <ChevronRight size={24} className="text-blue-600" />
                    </div>
                    <span className="text-[10px] font-black uppercase mt-3 tracking-widest">See More</span>
                </div>
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
};

export default HomeWebStories;