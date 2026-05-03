// @ts-nocheck
import { ExternalLink, Sparkles, BookOpen, Target, Award, ChevronRight } from 'lucide-react';
import { useSiteContent } from "@/hooks/useSiteContent";
import React from 'react';
import GlobalSearch from './GlobalSearch'; 

const Hero = () => {
  const { content, loading: contentLoading } = useSiteContent();

  const scrollToSection = (id: string) => {
    const section = document.getElementById(id);
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  };

  // 🔥 GOOGLE SITELINKS SEARCHBOX SCHEMA 🔥
  const searchSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": "https://studygyaan.in",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://studygyaan.in/search?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  };

  if (contentLoading) return (
    <div className="bg-slate-950 p-20 text-center text-white min-h-[50vh] flex flex-col items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
        <p className="text-slate-400 font-medium tracking-widest uppercase text-sm">Loading StudyGyaan...</p>
    </div>
  );

  return (
    <header className="relative bg-slate-950 pt-16 md:pt-32 pb-24 md:pb-28 px-4 font-hindi z-[60]">
      
      {/* 🔥 JSON-LD SEARCH INJECTION 🔥 */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(searchSchema) }} />

      {/* 🌟 Background Glows (Optimized) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-0 right-0 w-[600px] h-[300px] bg-yellow-500/10 blur-[100px] rounded-full"></div>
      </div>

      <div className="max-w-5xl mx-auto relative z-[50] text-center">
        
        {/* 🏆 Trust Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-6 md:mb-8 shadow-lg">
          <Sparkles className="w-3 h-3 md:w-4 md:h-4 text-yellow-400" aria-hidden="true" />
          <span className="text-slate-300 text-[10px] md:text-sm font-semibold tracking-wider uppercase">
            Trusted by 50,000+ Aspirants
          </span>
        </div>

        {/* 🎯 Main Headline (H1 for SEO) */}
        <h1 className="text-3xl sm:text-5xl md:text-7xl font-black text-white mb-4 md:mb-6 tracking-tight leading-[1.2] md:leading-[1.1]">
          Crack Your Dream Job with <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-yellow-400">
            StudyGyaan
          </span>
        </h1>
        
        {/* ✅ SEO FIX: Ensure description paragraph remains semantic, not a duplicate H1 */}
        <p className="text-slate-400 text-xs sm:text-base md:text-xl font-medium mb-8 md:mb-10 max-w-2xl mx-auto leading-relaxed px-2">
          {content?.seo?.title || "India's smartest platform for Latest Govt Jobs, Mock Tests, and Premium Study Material."}
        </p>

        {/* 🔍 Search Bar Container */}
        <div className="max-w-2xl mx-auto mb-10 md:mb-16 relative group z-[100] w-full">
           <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-yellow-400 to-blue-500 rounded-2xl md:rounded-full blur opacity-30 group-hover:opacity-60 transition duration-500 pointer-events-none"></div>
           <div className="relative bg-slate-900 rounded-2xl md:rounded-full p-2 md:p-3 shadow-2xl border border-slate-700/50 flex items-center justify-center transform group-hover:-translate-y-1 transition-transform duration-300">
              <div className="w-full relative z-[101]">
                  <GlobalSearch />
              </div>
           </div>
        </div>

        {/* 🚀 Action Buttons Layout */}
        <div className="grid grid-cols-2 md:flex md:flex-row justify-center gap-3 md:gap-5 mb-16 relative z-10 w-full px-1 sm:px-0 max-w-4xl mx-auto font-hindi">
            
           {/* 1. Free Library */}
           <button 
             onClick={() => scrollToSection('free-study-material')} 
             aria-label="Navigate to Free Library"
             className="relative flex flex-col items-center justify-center gap-2 p-4 bg-slate-900/60 border border-blue-500/20 rounded-2xl backdrop-blur-md transition-all group overflow-hidden shadow-lg md:flex-row md:px-6"
           >
              <div className="bg-blue-500/10 border border-blue-500/20 p-2 md:p-3 rounded-xl text-blue-400 group-hover:bg-blue-500 group-hover:text-white group-hover:scale-110 transition-all">
                 <BookOpen size={20} className="md:w-6 md:h-6" aria-hidden="true" />
              </div>
              <div className="text-center md:text-left">
                 <p className="text-white font-black text-sm md:text-lg leading-tight">Free Library</p>
                 <p className="text-blue-200/60 text-[8px] md:text-xs font-bold uppercase mt-0.5 tracking-tighter md:tracking-widest">4000+ Notes</p>
              </div>
           </button>

           {/* 2. Mock Tests */}
           <button 
             onClick={() => scrollToSection('mock-tests')} 
             aria-label="Navigate to Mock Tests"
             className="relative flex flex-col items-center justify-center gap-2 p-4 bg-slate-900/60 border border-emerald-500/20 rounded-2xl backdrop-blur-md transition-all group overflow-hidden shadow-lg md:flex-row md:px-6"
           >
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 md:p-3 rounded-xl text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white group-hover:scale-110 transition-all">
                 <Target size={20} className="md:w-6 md:h-6" aria-hidden="true" />
              </div>
              <div className="text-center md:text-left">
                 <p className="text-white font-black text-sm md:text-lg leading-tight">Mock Tests</p>
                 <p className="text-emerald-200/60 text-[8px] md:text-xs font-bold uppercase mt-0.5 tracking-tighter md:tracking-widest">Exam Level</p>
              </div>
           </button>

           {/* 3. Premium Notes */}
           <button 
             onClick={() => scrollToSection('premium-notes')} 
             aria-label="Navigate to Premium Notes"
             className="col-span-2 md:col-span-1 relative flex flex-row items-center justify-center gap-5 px-6 py-5 bg-slate-900/80 border border-yellow-500/40 rounded-2xl backdrop-blur-md transition-all group overflow-hidden shadow-[0_0_40px_rgba(234,179,8,0.15)]"
           >
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 to-transparent opacity-100 pointer-events-none"></div>
              
              <div className="bg-yellow-500/20 border border-yellow-500/40 p-3 rounded-xl text-yellow-400 group-hover:bg-yellow-500 group-hover:text-slate-900 group-hover:scale-110 transition-all shrink-0 shadow-[0_0_15px_rgba(234,179,8,0.3)]">
                 <Award size={28} aria-hidden="true" />
              </div>
              
              <div className="text-left">
                 <p className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500 font-black text-lg md:text-xl leading-tight tracking-wide">Premium Notes</p>
                 <div className="text-yellow-400/70 text-xs font-bold uppercase mt-1 tracking-widest flex items-center gap-2">
                    SPECIAL CRAFTED <span className="bg-yellow-500/20 px-1.5 py-0.5 rounded text-yellow-300">₹150</span>
                 </div>
              </div>
              <ChevronRight size={24} className="text-yellow-400/50 group-hover:translate-x-2 transition-all hidden sm:block" aria-hidden="true" />
           </button>

        </div>

      </div>

      {/* 🔴 Live News Strip */}
      <div className="absolute bottom-0 left-0 right-0 bg-blue-600 border-t border-blue-500/50 shadow-[0_-10px_30px_rgba(37,99,235,0.2)] z-20">
        <div className="max-w-7xl mx-auto flex items-center h-10 md:h-12">
          <div className="bg-red-600 h-full flex items-center px-4 md:px-6 relative z-10 shadow-lg">
            <span className="text-white text-[10px] md:text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0"></span> Live
            </span>
            <div className="absolute right-[-10px] top-0 border-l-[10px] border-l-red-600 border-y-[20px] md:border-y-[24px] border-y-transparent"></div>
          </div>
          
          <div className="flex-1 relative overflow-hidden ml-6">
              <div className="whitespace-nowrap animate-marquee flex gap-12 md:gap-24 items-center h-full text-white">
                  {content?.liveUpdate?.updates?.map((u, i) => (
                    <a key={i} href={u.link} target="_blank" rel="noreferrer" className="text-white/90 hover:text-white font-semibold text-xs md:text-sm flex items-center gap-2 transition-colors">
                        {u.text} <ExternalLink size={14} className="opacity-70 shrink-0" aria-hidden="true" />
                    </a>
                  ))}
              </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-100%); } }
        .animate-marquee { display: inline-flex; animation: marquee 30s linear infinite; }
        .animate-marquee:hover { animation-play-state: paused; }
      `}</style>
    </header>
  );
};

export default Hero;