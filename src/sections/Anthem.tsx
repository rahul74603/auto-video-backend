// @ts-nocheck
import React, { useRef, useState } from 'react';
import { Music, Zap, ShieldCheck, PlayCircle } from 'lucide-react';

const Anthem = () => {
  const videoRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // 🔥 28-Second Loop Logic
  const handleTimeUpdate = () => {
    if (videoRef.current && videoRef.current.currentTime >= 28) {
      videoRef.current.currentTime = 0; 
      videoRef.current.play();
    }
  };

  return (
    <section className="py-12 md:py-24 bg-white font-sans antialiased overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        
        {/* Header - Clean English Typography */}
        <div className="text-center mb-10 md:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-[10px] md:text-sm font-black uppercase tracking-[0.2em] mb-4 border border-blue-100 shadow-sm">
             <Zap size={16} className="fill-blue-700 animate-pulse" /> Official Brand Anthem
          </div>
          <h2 className="text-3xl md:text-6xl font-black text-slate-900 leading-tight tracking-tighter uppercase italic">
            StudyGyaan: <span className="text-blue-600">The Sound of Success</span>
          </h2>
          <p className="mt-4 text-slate-500 font-bold text-xs md:text-xl opacity-70 max-w-2xl mx-auto uppercase tracking-wide">
            Empowering the next generation of achievers.
          </p>
        </div>

        {/* Cinematic Video Player Container */}
        <div className="relative max-w-5xl mx-auto">
          
          {/* Subtle Background Glows */}
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-600/5 rounded-full blur-[100px]"></div>
          <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-indigo-600/5 rounded-full blur-[100px]"></div>

          {/* Video Frame - Premium Black Finish */}
          <div className="relative z-10 bg-slate-900 rounded-[2rem] md:rounded-[3.5rem] p-1 md:p-2.5 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)] border border-slate-100">
            {/* ✅ CLS FIX: Added aspect-video to maintain space before load */}
            <div className="overflow-hidden rounded-[1.8rem] md:rounded-[3rem] aspect-video bg-slate-800 relative group min-h-[200px] md:min-h-[450px]">
              
              {/* ✅ SPEED FIX: preload="none" ensures 3.3MB video doesn't kill mobile speed on start */}
              <video 
                ref={videoRef}
                className={`w-full h-full object-cover transition-opacity duration-700 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                controls
                playsInline
                preload="none" 
                onLoadedData={() => setIsLoaded(true)}
                onTimeUpdate={handleTimeUpdate}
                poster="https://studygyaan.in/my-fav-pic.webp"
              >
                <source src="https://studygyaan.in/studygyaan-anthem.mp4" type="video/mp4" /> 
                Your browser does not support the video tag.
              </video>

              {/* Loading Shimmer - No more blank jumps */}
              {!isLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-800 animate-pulse">
                   <PlayCircle size={48} className="text-slate-600" />
                </div>
              )}

              {/* Status Badge */}
              <div className="absolute top-4 left-6 md:top-8 md:left-10 flex items-center gap-2 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-white/20 pointer-events-none">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                  <span className="text-[10px] md:text-xs font-black text-white uppercase tracking-widest">Cinema Mode</span>
              </div>
            </div>
          </div>

          {/* Bottom Branding Section */}
          <div className="mt-8 md:mt-14 flex flex-col md:flex-row items-center justify-between gap-6 px-4 md:px-10">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 md:w-20 md:h-20 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl shadow-slate-200">
                   <PlayCircle size={32} className="text-white md:w-10 md:h-10" />
                </div>
                <div className="text-left">
                   <h4 className="text-lg md:text-3xl font-black text-slate-900 tracking-tight leading-none uppercase">Har Ghar StudyGyaan</h4>
                   <p className="text-slate-400 text-[10px] md:text-base font-bold mt-1 uppercase tracking-[0.2em]">The Identity of India's Students</p>
                </div>
             </div>

             <div className="flex items-center gap-3 bg-emerald-50 px-5 py-3 rounded-2xl border border-emerald-100">
                <ShieldCheck className="text-emerald-600 w-6 h-6 md:w-8 md:h-8" />
                <div className="text-left">
                  <p className="text-emerald-800 text-[10px] md:text-sm font-black leading-none uppercase">Verified Quality</p>
                  <p className="text-emerald-600 text-[8px] md:text-[10px] font-bold uppercase mt-1">Authentic Content</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Anthem;