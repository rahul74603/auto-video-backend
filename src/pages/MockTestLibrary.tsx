// @ts-nocheck
import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, orderBy, doc, getDoc, limit } from 'firebase/firestore'; 
import { useNavigate, Link } from 'react-router-dom';
import { 
    Clock, BookOpen, ArrowRight, Zap, Target, 
    ChevronRight, Flame, ExternalLink, Sparkles
} from 'lucide-react';
import SEO from '../components/SEO'; 

const MockTestLibrary = () => {
    const [tests, setTests] = useState([]);
    const [mockBlogs, setMockBlogs] = useState([]); 
    const [mockLinks, setMockLinks] = useState([]); 
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // --- 📥 FETCH ALL DATA ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                
                // 1. Fetch Mock Tests 
                const testsRef = collection(db, "mock_tests");
                const qTests = query(testsRef, orderBy("createdAt", "desc"));
                
                let snapTests = await getDocs(qTests);
                
                if (snapTests.empty) {
                    console.log("Ordering failed or empty, fetching simple collection...");
                    snapTests = await getDocs(testsRef);
                }

                const fetchedTests = snapTests.docs.map(doc => ({ 
                    id: doc.id, 
                    ...doc.data() 
                }));

                setTests(fetchedTests);

                // 2. Fetch Global Sidebar Settings
                const globalSnap = await getDoc(doc(db, "site_settings", "global"));
                if (globalSnap.exists()) {
                    const data = globalSnap.data();
                    setMockBlogs(data.mockBlogs || []); 
                    setMockLinks(data.mockLinks || []);  
                }

            } catch (err) { 
                console.error("Data fetching error:", err);
                try {
                    const simpleSnap = await getDocs(collection(db, "mock_tests"));
                    setTests(simpleSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                } catch (innerErr) {
                    console.error("Final Fallback Error:", innerErr);
                }
            } finally { 
                setLoading(false); 
            }
        };
        fetchData();
        window.scrollTo(0, 0);
    }, []);

    // 🔥 ITEM LIST SCHEMA FOR GOOGLE SEARCH 🔥
    const itemListSchema = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "itemListElement": tests.map((test, index) => ({
            "@type": "ListItem",
            "position": index + 1,
            "url": `https://studygyaan.in/test/${test.id}`,
            "name": test.title
        }))
    };

    if (loading) return (
        <div className="h-screen flex items-center justify-center bg-[#020617]">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#020617] font-hindi">
            
            <SEO 
                customTitle="Online Mock Tests 2026 - Practice Portal | StudyGyaan"
                customDescription="Improve your score with latest pattern mock tests for SSC, Railway, and State exams 2026. Practice daily on StudyGyaan Hub."
                customUrl="https://studygyaan.in/mock-tests"
                customImage="https://studygyaan.in/og-image.jpg"
            />

            {/* 🔥 JSON-LD INJECTION */}
            {tests.length > 0 && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
            )}

            {/* --- HERO HEADER --- */}
            <header className="bg-gradient-to-b from-slate-900 to-[#020617] py-10 md:py-16 border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 text-center">
                    <div className="inline-flex items-center gap-2 bg-blue-600/10 text-blue-400 px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-blue-500/20 mb-4">
                        <Target size={14} aria-hidden="true" /> Practice Portal
                    </div>
                    {/* ✅ SEO FIX: Ensure Main H1 */}
                    <h1 className="text-2xl md:text-4xl font-black text-white mb-2 uppercase">
                        ALL SUBJECT <span className="text-blue-500">MOCK TESTS</span>
                    </h1>
                    <p className="text-slate-400 font-bold max-w-lg mx-auto text-[11px] md:text-sm">
                        Apni speed aur accuracy check karein latest pattern tests ke saath.
                    </p>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-3 md:px-4 py-8 md:py-12">
                <div className="flex flex-col lg:flex-row gap-6 md:gap-10">
                    
                    {/* --- MAIN CONTENT: TESTS --- */}
                    <main className="flex-1 order-1">
                        {tests.length === 0 ? (
                            <div className="text-center py-20 bg-white/5 rounded-[40px] border border-dashed border-white/10">
                                <Target size={48} className="mx-auto text-slate-700 mb-4 opacity-20" aria-hidden="true"/>
                                <p className="text-slate-500 font-black uppercase tracking-widest text-xs">No tests found in Library</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                {tests.map((test) => (
                                    <article key={test.id} className="relative group">
                                        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-[35px] blur opacity-10 group-hover:opacity-30 transition duration-500"></div>
                                        
                                        <div className="relative bg-slate-900/50 backdrop-blur-xl rounded-[35px] p-6 md:p-8 border border-white/5 h-full flex flex-col hover:border-blue-500/30 transition-all">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20">
                                                    <Zap size={20} className="fill-current" aria-hidden="true"/>
                                                </div>
                                                <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter">
                                                    Latest Pattern
                                                </span>
                                            </div>

                                            {/* ✅ SEO FIX: Semantic H2 */}
                                            <h2 className="text-lg md:text-xl font-black text-white mb-5 leading-tight group-hover:text-blue-400 transition-colors line-clamp-2">
                                                {test.title}
                                            </h2>

                                            <div className="grid grid-cols-2 gap-3 mb-6">
                                                <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <Clock size={12} className="text-orange-400" aria-hidden="true"/>
                                                        <span className="text-[8px] font-black text-slate-500 uppercase">Duration</span>
                                                    </div>
                                                    <p className="text-sm md:text-base font-black text-white">{test.durationMinutes || '60'} Min</p>
                                                </div>
                                                <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <BookOpen size={12} className="text-emerald-400" aria-hidden="true"/>
                                                        <span className="text-[8px] font-black text-slate-500 uppercase">Questions</span>
                                                    </div>
                                                    <p className="text-sm md:text-base font-black text-white">{test.totalQuestions || '100'} Q</p>
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => navigate(`/test/${test.id}`)}
                                                className="mt-auto w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl font-black text-xs tracking-widest uppercase flex items-center justify-center gap-2 shadow-xl hover:shadow-blue-500/20 active:scale-95 transition-all group/btn"
                                            >
                                                START PRACTICE <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" aria-hidden="true"/>
                                            </button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                        {/* ✅ SEO FIX: Internal Links Section (Fixes 'No outgoing links' and 'Orphan page' error) */}
                            <div className="bg-white/5 p-6 md:p-8 rounded-[2rem] border border-white/10 shadow-sm mt-8">
                                <h2 className="text-sm md:text-xl font-black text-white mb-5 uppercase tracking-tight flex items-center gap-2">
                                    <Target size={20} className="text-blue-400" aria-hidden="true" /> Explore More on StudyGyaan
                                </h2>
                                <div className="flex flex-wrap gap-3">
                                    <a href="/govt-jobs" className="bg-white/5 text-blue-400 hover:bg-blue-600/20 hover:text-white border border-white/10 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Latest Govt Jobs</a>
                                    <a href="/free-study-material" className="bg-white/5 text-blue-400 hover:bg-blue-600/20 hover:text-white border border-white/10 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Free Study Material</a>
                                    <a href="/test" className="bg-white/5 text-blue-400 hover:bg-blue-600/20 hover:text-white border border-white/10 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Free Mock Tests</a>
                                    <a href="/blog" className="bg-white/5 text-blue-400 hover:bg-blue-600/20 hover:text-white border border-white/10 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Sarkari Yojana & Blogs</a>
                                </div>
                            </div>
                    </main>

                    {/* --- SIDEBAR --- */}
                    <aside className="w-full lg:w-[320px] space-y-6 order-2">
                        {mockBlogs.length > 0 && (
                            <section className="bg-white/5 border border-white/10 rounded-[30px] p-5 backdrop-blur-md">
                                <h2 className="text-white font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Sparkles size={16} className="text-orange-400" aria-hidden="true"/> Trending
                                </h2>
                                <div className="space-y-3">
                                    {mockBlogs.map((blog, idx) => (
                                        <Link key={idx} to={blog.url} className="block bg-white/5 hover:bg-blue-600/10 border border-white/5 p-3 rounded-2xl transition-all group">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-[11px] font-bold text-slate-300 leading-tight group-hover:text-blue-400">
                                                    {blog.title || blog.name}
                                                </p>
                                                <ChevronRight size={14} className="text-slate-600 shrink-0 group-hover:translate-x-1 transition-transform" aria-hidden="true"/>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )} 

                        {mockLinks.length > 0 && (
                            <section className="bg-white/5 border border-white/10 rounded-[30px] p-5">
                                <h2 className="text-white font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <ExternalLink size={16} className="text-blue-400" aria-hidden="true"/> Quick Links
                                </h2>
                                <div className="space-y-3">
                                    {mockLinks.map((link, idx) => (
                                        <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="block bg-gradient-to-br from-blue-600 to-indigo-700 p-4 rounded-2xl text-white group shadow-lg active:scale-95 transition-all">
                                            <div className="flex justify-between items-center">
                                                <p className="font-black text-[10px] uppercase tracking-tighter">{link.title || link.name || 'Important Link'}</p>
                                                <ExternalLink size={12} className="opacity-50 group-hover:opacity-100 transition-opacity" aria-hidden="true"/>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            </section>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default MockTestLibrary;