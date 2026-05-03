// @ts-nocheck
import { useEffect, useState } from 'react';
import { db } from '@/firebase/config'; 
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { Trophy, Ticket, Key, BookOpen, ChevronRight, Sparkles, Zap, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
// ✅ यहाँ हमने Admin Panel वाला डेटा लाने के लिए Hook इम्पोर्ट कर लिया
import { useSiteContent } from "@/hooks/useSiteContent"; 

const FastTrackGrid = () => {
  const [updates, setUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ✅ Admin Panel का डेटा
  const { content } = useSiteContent(); 

  useEffect(() => {
    if (!db) return;
    const q = query(
      collection(db, "fast_track"),
      orderBy("createdAt", "desc"),
      limit(40)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUpdates(data);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Listen Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getAutoData = (cat: string) => updates.filter(u => u.category === cat);

  // ✅ manualKey ऐड किया ताकि एडमिन पैनल से सही डेटा उठ सके
  const sections = [
    { title: 'Results', cat: 'Result', manualKey: 'results', icon: <Trophy size={22} className="text-emerald-600" />, bgGrad: 'from-emerald-50 to-emerald-100/50', border: 'border-emerald-100', text: 'text-emerald-700' },
    { title: 'Admit Card', cat: 'Admit Card', manualKey: 'admitCard', icon: <Ticket size={22} className="text-rose-600" />, bgGrad: 'from-rose-50 to-rose-100/50', border: 'border-rose-100', text: 'text-rose-700' },
    { title: 'Answer Key', cat: 'Answer Key', manualKey: 'answerKey', icon: <Key size={22} className="text-blue-600" />, bgGrad: 'from-blue-50 to-blue-100/50', border: 'border-blue-100', text: 'text-blue-700' },
    { title: 'Syllabus', cat: 'Syllabus', manualKey: 'syllabus', icon: <BookOpen size={22} className="text-purple-600" />, bgGrad: 'from-purple-50 to-purple-100/50', border: 'border-purple-100', text: 'text-purple-700' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
      
      {/* Modern Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4 relative">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-gradient-to-b from-blue-600 to-yellow-400 rounded-full"></div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight uppercase italic flex items-center gap-2">
              Fast Track Updates <Sparkles className="w-5 h-5 text-yellow-500 animate-pulse" />
            </h2>
            <p className="text-slate-500 text-xs md:text-sm font-bold tracking-widest uppercase mt-1">
              Direct Links for Latest Announcements
            </p>
          </div>
        </div>

        {/* ✅ MOBILE ONLY: Swipe Indicator */}
        <div className="md:hidden absolute right-0 bottom-0 flex items-center gap-1.5 text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full shadow-sm animate-pulse border border-blue-100">
           <span className="text-[10px] font-black uppercase tracking-widest">Swipe</span>
           <ArrowRight size={14} />
        </div>
      </div>

      {/* 🚀 MAGIC WRAPPER: Mobile Swipe */}
      <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 md:grid md:grid-cols-4 md:gap-6 hide-mobile-scrollbar pb-8 md:pb-6 pr-12 md:pr-0">
        
        {sections.map((sec) => {
          // 🔥 हाइब्रिड लॉजिक: एडमिन डेटा + ऑटो डेटा
          const manualLinks = content?.buttons?.[sec.manualKey] || [];
          const autoLinks = getAutoData(sec.cat);
          
          // दोनों को मिला रहे हैं
          const formattedManual = manualLinks.map((m: any, idx: number) => ({ id: `manual-${idx}`, title: m.text, link: m.link, isManual: true }));
          const formattedAuto = autoLinks.map((a: any) => ({ id: a.id, title: a.title, link: `/update/${a.id}`, isManual: false }));
          
          // टॉप 5 आइटम ही दिखाएंगे ताकि डब्बा बहुत लम्बा न हो जाये
          const combinedLinks = [...formattedManual, ...formattedAuto].slice(0, 5);

          return (
            <div 
  key={sec.cat} 
  className="w-[82vw] max-w-[300px] md:w-auto snap-start shrink-0 bg-white rounded-[2rem] p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 flex flex-col group relative"
>
              {/* Soft Gradient Header */}
              <div className={`bg-gradient-to-br ${sec.bgGrad} border ${sec.border} rounded-[1.5rem] p-4 mb-3 flex items-center gap-3 transition-colors`}>
                <div className="bg-white p-2.5 rounded-xl shadow-sm transform group-hover:scale-110 transition-transform duration-300">
                  {sec.icon}
                </div>
                <h3 className={`font-black uppercase tracking-widest text-sm ${sec.text} whitespace-nowrap`}>
                  {sec.title}
                </h3>
              </div>

              {/* Links Area */}
              <div className="px-2 pb-2 space-y-1 flex-1 min-h-[260px]">
                {loading && combinedLinks.length === 0 ? (
                  <div className="flex flex-col gap-3 mt-4 px-2">
                    {[1,2,3,4].map(n => <div key={n} className="h-10 bg-slate-100 rounded-lg animate-pulse"></div>)}
                  </div>
                ) : combinedLinks.length > 0 ? (
                  combinedLinks.map(item => (
                    item.isManual ? (
                      // 🌟 Admin Panel वाले मैन्युअल लिंक्स
                      <a 
                        href={item.link} 
                        target="_blank" 
                        rel="noreferrer"
                        key={item.id}
                        className="group/link flex justify-between items-center gap-3 p-3 rounded-xl bg-blue-50/50 hover:bg-blue-100/50 transition-all border border-blue-100/50 hover:border-blue-200 relative overflow-hidden"
                      >
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase font-black text-blue-600 flex items-center gap-1 tracking-widest mb-0.5">
                            <Zap size={10} className="fill-blue-600 animate-pulse" /> Featured
                          </span>
                          <span className="text-sm font-bold text-slate-800 group-hover/link:text-blue-700 line-clamp-2 leading-snug">
                            {item.title}
                          </span>
                        </div>
                        <ChevronRight size={16} className="text-blue-400 group-hover/link:text-blue-600 group-hover/link:translate-x-1 transition-all flex-shrink-0" />
                      </a>
                    ) : (
                      // 🔄 Firestore वाले ऑटो लिंक्स
                      <Link 
                        to={item.link} 
                        key={item.id}
                        className="group/link flex justify-between items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 relative overflow-hidden"
                      >
                        <span className="text-sm font-bold text-slate-700 group-hover/link:text-blue-600 line-clamp-2 leading-snug transition-colors">
                          {item.title}
                        </span>
                        <ChevronRight size={16} className="text-slate-300 group-hover/link:text-blue-500 group-hover/link:translate-x-1 transition-all flex-shrink-0 mt-0.5" />
                      </Link>
                    )
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-300">
                    {sec.icon}
                    <p className="text-xs font-bold italic mt-2 uppercase tracking-widest text-slate-400">No Updates Yet</p>
                  </div>
                )}
              </div>

              {/* Premium View All Button */}
              <div className="px-2 pb-2 mt-auto">
                <Link to={`/${sec.title.toLowerCase().replace(' ', '-')}`} className="block w-full text-center py-3.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-500 font-black text-xs uppercase tracking-widest transition-all border border-transparent hover:border-blue-100 group/btn">
                  Explore All <span className="inline-block transition-transform group-hover/btn:translate-x-1">→</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .hide-mobile-scrollbar::-webkit-scrollbar { display: none; }
        .hide-mobile-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default FastTrackGrid;