// @ts-nocheck
import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, limit } from 'firebase/firestore'; 
import { useNavigate } from 'react-router-dom';
import { Play, Zap, ArrowRight, Clock, BookOpen } from 'lucide-react';

const MockTestHomeSection = () => {
    const [latestTests, setLatestTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchLatest = async () => {
            try {
                setLoading(true);
                // PC पर 6 और मोबाइल पर 10 टेस्ट के हिसाब से डेटा मंगाया है
                const q = query(collection(db, "mock_tests"), limit(12));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setLatestTests(items);
                }
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchLatest();
    }, []);

    if (loading && latestTests.length === 0) return null;

    return (
        <section className="py-4 md:py-16 bg-[#020617] border-b border-white/5 font-hindi overflow-hidden">
            <div className="max-w-7xl mx-auto px-4">
                
                {/* --- Header: Mobile me chota, PC me bada --- */}
                <div className="flex items-center justify-between mb-4 md:mb-10 px-1">
                    <div className="flex flex-col">
                        <span className="flex items-center gap-1 text-[10px] md:text-sm font-black text-blue-500 uppercase italic">
                            <Zap size={14} className="fill-blue-500 animate-pulse" /> Live Exam Portal
                        </span>
                        <h2 className="hidden md:block text-4xl font-black text-white uppercase tracking-tighter mt-1">
                            Latest <span className="text-blue-400 italic">Mock Tests</span>
                        </h2>
                    </div>
                    <button 
                        onClick={() => navigate('/mock-tests')} 
                        className="text-[10px] md:text-base font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors"
                    >
                        VIEW ALL <ArrowRight size={14}/>
                    </button>
                </div>

                {/* --- Grid: Mobile (2-Row Scroll) | PC (Static 3-Column Grid) --- */}
                <div className="
                    grid grid-rows-2 grid-flow-col gap-3 overflow-x-auto no-scrollbar pb-2 snap-x 
                    md:grid-rows-none md:grid-flow-row md:grid-cols-3 md:gap-8 md:overflow-visible
                ">
                    {latestTests.map((test) => (
                        <div 
                            key={test.id} 
                            className="
                                w-[180px] snap-start bg-slate-900/60 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-3
                                md:w-full md:p-8 md:rounded-[32px] md:flex-col md:items-start md:bg-slate-900/40 md:hover:bg-slate-900/80 md:border-white/10 md:transition-all md:duration-500 md:hover:-translate-y-2
                            "
                        >
                            {/* Text Info */}
                            <div className="flex-1 min-w-0 md:w-full">
                                <h3 className="text-[10px] md:text-xl font-bold text-slate-100 truncate md:whitespace-normal md:line-clamp-2 uppercase tracking-tight md:mb-4">
                                    {test.title || "Mock Test"}
                                </h3>
                                
                                {/* Stats: PC par extra detail dikhegi */}
                                <div className="flex items-center gap-2 mt-1 md:mt-0">
                                    <span className="text-[7px] md:text-[10px] text-blue-400 font-bold px-1 md:px-2 md:py-0.5 bg-blue-500/10 rounded uppercase">Live</span>
                                    <div className="hidden md:flex items-center gap-4 text-slate-500 font-bold text-xs ml-auto">
                                        <span className="flex items-center gap-1"><Clock size={14} className="text-orange-500"/> {test.durationMinutes}m</span>
                                        <span className="flex items-center gap-1"><BookOpen size={14} className="text-emerald-500"/> {test.totalQuestions}Q</span>
                                    </div>
                                    <span className="md:hidden text-[8px] text-slate-500 font-medium">{test.totalQuestions || '25'}Q</span>
                                </div>
                            </div>

                            {/* Play Button: Mobile me chota, PC me bada button */}
                            <button 
                                onClick={() => navigate(`/test/${test.id}`)}
                                className="
                                    w-7 h-7 flex items-center justify-center bg-blue-600 text-white rounded-lg active:scale-90 transition-transform shrink-0
                                    md:w-full md:h-14 md:rounded-2xl md:text-sm md:font-black md:tracking-widest md:uppercase md:gap-3 md:shadow-[0_10px_20px_rgba(37,99,235,0.2)]
                                "
                            >
                                <span className="hidden md:inline">Start Practice</span>
                                <Play size={10} className="fill-current md:w-4 md:h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </section>
    );
};

export default MockTestHomeSection;