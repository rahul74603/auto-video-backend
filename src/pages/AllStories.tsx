// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है
import { ChevronLeft, Zap } from 'lucide-react';

const AllStories = () => {
    const [stories, setStories] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchStories = async () => {
            try {
                const q = query(collection(db, "web_stories"), orderBy("createdAt", "desc"));
                const snapshot = await getDocs(q);
                setStories(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchStories();
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4 md:px-8 mt-12 md:mt-16">
            
            {/* 🔥 नया डायनामिक SEO टैग जो स्टोरी लाइब्रेरी की डिटेल गूगल/WhatsApp पर दिखाएगा */}
            <SEO 
                customTitle="All Web Stories - Latest Job & Blog Updates | StudyGyaan"
                customDescription="Watch the latest job alerts, exam updates, and educational blog posts in a swipeable web stories format on StudyGyaan Library."
                customUrl="https://studygyaan.in/web-stories"
                customImage="https://studygyaan.in/og-image.jpg"
            />

            <div className="max-w-7xl mx-auto">
                {/* 🔙 Back & Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => navigate(-1)} 
                            className="p-3 bg-white rounded-2xl shadow-sm border hover:bg-gray-100 transition-all text-gray-600"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <div>
                            <h1 className="text-2xl md:text-4xl font-black text-gray-900 uppercase tracking-tighter flex items-center gap-2">
                                <Zap className="text-yellow-500 fill-yellow-500" size={32} />
                                Web Stories Library
                            </h1>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Explore all swipeable updates</p>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                        {stories.map((story) => (
                            <div 
                                key={story.id} 
                                onClick={() => navigate(`/web-stories/${story.id}`)}
                                className="aspect-[9/16] relative rounded-3xl overflow-hidden cursor-pointer group border-4 border-white shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-300"
                            >
                                <img 
                                    src={story.coverImage || 'https://studygyaan.in/og-image.jpg'} 
                                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                                    alt="story" 
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent"></div>
                                
                                <div className="absolute bottom-0 p-4 w-full">
                                    <span className={`text-[8px] font-black text-white px-2 py-0.5 rounded-lg uppercase mb-2 inline-block shadow-sm ${story.storyType === 'blog' ? 'bg-emerald-600' : 'bg-purple-600'}`}>
                                        {story.storyType || 'Job'}
                                    </span>
                                    <h4 className="text-white font-bold text-xs md:text-sm leading-tight line-clamp-3 drop-shadow-lg">
                                        {story.title}
                                    </h4>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {stories.length === 0 && !loading && (
                    <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-200">
                        <p className="text-gray-400 font-bold uppercase tracking-widest">No Stories Found Yet</p>
                    </div>
                )}
                {/* ✅ SEO FIX: Internal Links Section (Fixes 'No outgoing links' and boosts SEO) */}
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