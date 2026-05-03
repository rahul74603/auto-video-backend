// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  Briefcase, Calendar, MapPin, Banknote, Clock, 
  Download, ExternalLink, ArrowLeft, Share2, 
  CheckCircle, FileText, Smartphone, Sparkles, Tag, ShoppingCart, Flame, ArrowRight, Zap, Trophy, GraduationCap, Users, Search, Globe, ShieldCheck
} from 'lucide-react';
import SEO from '../components/SEO'; 

const JobDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAllData = async () => {
      if (!id) return;
      try {
        setLoading(true);
        // 1. Fetch Job Data
        const docRef = doc(db, "jobs", id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) { 
          const jobData = { id: docSnap.id, ...docSnap.data() };
          setJob(jobData); 
        }
        
        // 2. Global Settings Load
        const settingsSnap = await getDoc(doc(db, "site_settings", "global"));
        if (settingsSnap.exists()) { 
          setGlobalSettings(settingsSnap.data()); 
        }
      } catch (err) { 
        console.error("Error loading data:", err); 
      } finally { 
        setLoading(false); 
      }
    };
    loadAllData();
    window.scrollTo(0, 0);
  }, [id]);

  const formatDate = (d: any) => {
    if (!d) return "New Update";
    if (d.seconds) return new Date(d.seconds * 1000).toLocaleDateString('hi-IN');
    return String(d);
  };

  const sellingPrice = Math.round(Number(globalSettings?.mrpPrice || 499) * (1 - Number(globalSettings?.discountPercent || 85) / 100));
  const trendingLinks = globalSettings?.jobUpdates || globalSettings?.relatedBlogs || [];

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-white"><div className="animate-spin h-10 w-10 border-4 border-blue-600 rounded-full border-t-transparent"></div></div>;
  if (!job) return <div className="pt-32 text-center font-black text-gray-400">Job Not Found!</div>;

  // 🔥 GOOGLE JOB POSTING SCHEMA (For Google Jobs Widget) 🔥
  const jobSchema = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": job.title,
    "description": job.description || `${job.title} Recruitment 2026. Apply now for ${job.vacancies || 'various'} vacancies. Check eligibility, age limit, and application fee.`,
    "identifier": {
      "@type": "PropertyValue",
      "name": job.organization || "StudyGyaan",
      "value": job.advtNo || "N/A"
    },
    "datePosted": job.createdAt?.seconds ? new Date(job.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
    "employmentType": "FULL_TIME",
    "hiringOrganization": {
      "@type": "Organization",
      "name": job.organization || "Govt Organization",
      "sameAs": "https://studygyaan.in",
      "logo": "https://studygyaan.in/logo.png"
    },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "IN",
        "addressRegion": job.location || "India"
      }
    }
  };

  return (
    <div className="pt-14 md:pt-16 pb-12 md:pb-20 bg-[#F8FAFC] min-h-screen font-hindi antialiased text-left">
      
      {/* Dynamic SEO Tag */}
      <SEO 
        customTitle={`${job.title} Online Form 2026 - StudyGyaan`}
        customDescription={`Apply online for ${job.title} recruitment 2026. ${job.organization} vacancies eligibility, fee, and dates.`}
        customUrl={`https://studygyaan.in/job/${job.id}`}
        customImage="https://studygyaan.in/og-image.jpg"
      />

      {/* 🔥 JSON-LD Schema Injection 🔥 */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobSchema) }} />

      <div className="max-w-7xl mx-auto px-2 md:px-6">
        
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 font-bold mb-4 transition-all text-[11px] md:text-sm bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
          <ArrowLeft size={14} aria-hidden="true" /> वापस जाएँ
        </button>

        <div className="flex flex-col lg:flex-row gap-4 md:gap-6 items-start">
          
          <div className="w-full lg:w-[70%] min-w-0 space-y-4 md:space-y-5">
            
            <article className="bg-white rounded-2xl md:rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
              
              {/* 🟦 Header Section */}
              <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 p-4 md:p-8 text-white relative">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Briefcase size={120} aria-hidden="true" /></div>
                <div className="relative z-10">
                  <div className="flex gap-2 mb-2">
                     <span className="bg-yellow-400 text-blue-900 font-black text-[7px] md:text-[10px] px-2 py-0.5 rounded-full uppercase">Latest Update</span>
                     <span className="bg-white/10 text-white font-bold text-[7px] md:text-[10px] px-2 py-0.5 rounded-full border border-white/20 uppercase truncate">{job.organization}</span>
                  </div>
                  {/* ✅ SEO FIX: Main H1 Tag */}
                  <h1 className="text-lg md:text-3xl font-black mb-3 md:mb-4 leading-tight uppercase tracking-tight">
                    {job.title} Online Form 2026
                  </h1>
                  <div className="flex flex-wrap gap-3 md:gap-6 text-blue-100 font-bold text-[9px] md:text-xs pt-3 border-t border-white/10">
                     <span className="flex items-center gap-1.5"><Calendar size={14} className="text-yellow-400" aria-hidden="true"/> {formatDate(job.createdAt)}</span>
                     <span className="flex items-center gap-1.5"><MapPin size={14} className="text-yellow-400" aria-hidden="true"/> {job.location || "All India"}</span>
                     <span className="flex items-center gap-1.5"><FileText size={14} className="text-yellow-400" aria-hidden="true"/> {job.advtNo || "01/2026"}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 md:p-8 space-y-6 md:space-y-10">

                {/* ✅ 🏆 4-MASTER BOXES (SEO FIX: Changed h4 to div for semantic correctness) */}
                <div className="grid grid-cols-1 gap-3">
                    
                    {/* Vacancy Bar */}
                    <div className="bg-blue-50/40 border-l-[6px] border-blue-600 p-4 md:p-6 rounded-xl flex items-center gap-4 transition-all shadow-sm hover:bg-blue-50">
                        <div className="bg-blue-600 text-white p-3 rounded-xl shrink-0 shadow-md">
                            <Users size={24} aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-0.5">Total Vacancies / कुल पद</p>
                            <div className="text-[14px] md:text-xl font-black text-blue-900 leading-tight break-words">{job.vacancies || 'Notification के अनुसार'}</div>
                        </div>
                    </div>

                    {/* Salary Bar */}
                    <div className="bg-emerald-50/40 border-l-[6px] border-emerald-600 p-4 md:p-6 rounded-xl flex items-center gap-4 transition-all shadow-sm hover:bg-emerald-50">
                        <div className="bg-emerald-600 text-white p-3 rounded-xl shrink-0 shadow-md">
                            <Banknote size={24} aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">Monthly Salary / वेतन</p>
                            <div className="text-[14px] md:text-xl font-black text-emerald-900 leading-tight break-words">{job.salary || 'नियमों के अनुसार'}</div>
                        </div>
                    </div>

                    {/* Qualification Bar */}
                    <div className="bg-purple-50/40 border-l-[6px] border-purple-600 p-4 md:p-6 rounded-xl flex items-center gap-4 transition-all shadow-sm hover:bg-purple-50">
                        <div className="bg-purple-600 text-white p-3 rounded-xl shrink-0 shadow-md">
                            <GraduationCap size={24} aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest mb-0.5">Eligibility / पात्रता</p>
                            <div className="text-[14px] md:text-xl font-black text-purple-900 leading-tight">{job.qualification || job.eligibility || 'विवरण नीचे देखें'}</div>
                        </div>
                    </div>

                    {/* Selection Bar */}
                    <div className="bg-orange-50/40 border-l-[6px] border-orange-600 p-4 md:p-6 rounded-xl flex items-center gap-4 transition-all shadow-sm hover:bg-orange-50">
                        <div className="bg-orange-600 text-white p-3 rounded-xl shrink-0 shadow-md">
                            <Trophy size={24} aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-0.5">Selection Mode / चयन</p>
                            <div className="text-[14px] md:text-xl font-black text-orange-900 leading-tight">{job.selectionProcess || 'लिखित परीक्षा / मेरिट'}</div>
                        </div>
                    </div>

                </div>

                {/* 🟦 DATES & FEES GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="bg-white border border-slate-100 p-5 md:p-8 rounded-3xl shadow-sm">
                      {/* ✅ SEO FIX: Changed to H2 */}
                      <h2 className="text-blue-800 font-black text-[12px] md:text-lg mb-5 flex items-center gap-2 border-b border-blue-50 pb-3 uppercase italic">
                        <Clock size={20} className="text-blue-600" aria-hidden="true"/> Important Dates
                      </h2>
                      <ul className="space-y-4 text-[11px] md:text-base font-bold text-slate-600">
                        <li className="flex justify-between border-b border-slate-50 pb-2"><span>Application Begin:</span> <span className="text-blue-600">{job.startDate || "Active"}</span></li>
                        <li className="flex justify-between p-2 bg-red-50 text-red-600 rounded-xl"><span>Last Date Apply:</span> <span className="font-black animate-pulse">{job.lastDate || "Soon"}</span></li>
                        <li className="flex justify-between opacity-60"><span>Exam Date:</span> <span>नियमों के अनुसार</span></li>
                      </ul>
                   </div>

                   <div className="bg-white border border-slate-100 p-5 md:p-8 rounded-3xl shadow-sm">
                      {/* ✅ SEO FIX: Changed to H2 */}
                      <h2 className="text-emerald-800 font-black text-[12px] md:text-lg mb-5 flex items-center gap-2 border-b border-emerald-50 pb-3 uppercase italic">
                        <Banknote size={20} className="text-emerald-600" aria-hidden="true"/> Application Fee
                      </h2>
                      <div className="text-[11px] md:text-base font-bold">
                         {job.feeGen ? (
                            <ul className="space-y-3">
                               <li className="flex justify-between border-b border-slate-50 pb-2"><span>Gen / OBC:</span> <span className="text-emerald-700">₹{job.feeGen}</span></li>
                               <li className="flex justify-between border-b border-slate-50 pb-2"><span>SC / ST / PH:</span> <span className="text-emerald-700">₹{job.feeSCST || '0'}</span></li>
                               <li className="flex justify-between"><span>Female All Cat:</span> <span className="text-emerald-700">₹{job.feeFemale || '0'}</span></li>
                            </ul>
                         ) : (
                            <p className="text-slate-500 italic leading-relaxed">{job.applicationFee || "चेक ऑफिसियल नोटिफिकेशन"}</p>
                         )}
                      </div>
                   </div>
                </div>

                {/* 🟦 AGE LIMIT SECTION */}
                <div className="bg-slate-900 rounded-3xl md:rounded-[3rem] p-6 md:p-10 text-white relative overflow-hidden shadow-xl">
                    <div className="relative z-10">
                        {/* ✅ SEO FIX: Changed to H2 */}
                        <h2 className="text-[12px] md:text-xl font-black mb-8 flex items-center gap-3 uppercase tracking-widest border-l-4 border-blue-500 pl-4 italic">
                            Age Limit Details
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                           <div className="bg-white/10 p-5 rounded-2xl text-center border border-white/5">
                              <p className="text-blue-300 text-[10px] font-black uppercase mb-1">Minimum Age</p>
                              <p className="text-2xl md:text-4xl font-black">{job.minAge || "18"} Yrs</p>
                           </div>
                           <div className="bg-white/10 p-5 rounded-2xl text-center border border-white/5">
                              <p className="text-blue-300 text-[10px] font-black uppercase mb-1">Maximum Age</p>
                              <p className="text-2xl md:text-4xl font-black">{job.ageLimit || "30"} Yrs</p>
                           </div>
                           <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-5 rounded-2xl flex items-center justify-center">
                              <p className="text-xs md:text-sm font-black text-center leading-snug px-2">Age relaxation extra as per rules.</p>
                           </div>
                        </div>
                    </div>
                </div>

                {/* 🟦 ELIGIBILITY & DESCRIPTION */}
                <div className="space-y-6">
                    <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                        {/* ✅ SEO FIX: Changed to H2 */}
                        <h2 className="bg-slate-50 px-5 py-4 border-b font-black text-slate-800 uppercase text-xs flex items-center gap-2">
                           <CheckCircle size={16} className="text-blue-600" aria-hidden="true"/> Post Eligibility & Selection
                        </h2>
                        <div className="p-5 md:p-10">
                            <div className="text-blue-800 font-black text-sm md:text-2xl mb-4">{job.title}</div>
                            <div className="text-slate-600 font-bold text-xs md:text-lg leading-relaxed whitespace-pre-line border-l-4 border-blue-50 pl-6">
                                {job.qualification || job.eligibility || "विस्तृत विवरण के लिए नोटिफिकेशन देखें।"}
                            </div>
                        </div>
                    </div>

                    {job.description && (
                        <div className="bg-blue-50/20 border border-blue-50 rounded-3xl p-6 md:p-10">
                            {/* ✅ SEO FIX: Changed to H2 */}
                            <h2 className="text-blue-900 font-black text-xs md:text-2xl mb-6 border-b border-blue-100 pb-4 uppercase tracking-tighter italic">
                                <FileSearch size={24} className="inline mr-2" aria-hidden="true"/> Detailed Overview
                            </h2>
                            <div className="text-slate-700 font-medium text-xs md:text-lg leading-relaxed whitespace-pre-line">
                                {job.description}
                            </div>
                        </div>
                    )}
                </div>

                {/* ✅ 🛠️ SARKARI TOOLKIT PROMO */}
                <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-[2rem] p-6 md:p-8 text-white shadow-lg mb-8 flex flex-col md:flex-row items-center justify-between gap-6 border-b-8 border-red-700 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none"><Sparkles size={120} aria-hidden="true" /></div>
                    <div className="relative z-10 text-center md:text-left">
                        <div className="bg-yellow-400 text-red-900 font-black text-[10px] px-3 py-1 rounded-full uppercase mb-3 inline-block shadow-sm">100% Free Tool</div>
                        <div className="text-lg md:text-2xl font-black mb-2 leading-tight">फॉर्म भरने से पहले Photo/Sign रिसाइज़ करें!</div>
                        <p className="text-xs md:text-sm text-red-100 font-bold">Age Calculator, PDF Converter & Resume Maker. बिना साइबर कैफे जाए सारा काम मोबाइल से करें।</p>
                    </div>
                    <a href="https://studygyaan.in/tools/" target="_blank" rel="noopener noreferrer" className="shrink-0 bg-white text-red-600 hover:bg-yellow-400 hover:text-red-900 h-14 md:h-16 px-8 rounded-2xl flex items-center justify-center gap-2 font-black text-sm md:text-base transition-all shadow-xl z-10">
                        Open Free Toolkit 🚀
                    </a>
                </div>

                {/* 🟦 IMPORTANT LINKS */}
                <div className="bg-slate-50 p-6 md:p-12 rounded-[3rem] border border-slate-100 shadow-inner">
                  {/* ✅ SEO FIX: Changed to H2 */}
                  <h2 className="text-sm md:text-2xl font-black text-center mb-8 text-slate-900 uppercase underline decoration-blue-500 decoration-4 underline-offset-8 italic">
                    All Important Links
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl mx-auto">
                    
                    {/* 🚀 1. Apply Button (SEO Pro Redirect) */}
                    <a 
                        href={`/redirect?url=${encodeURIComponent(job.applyLink)}`} 
                        target="_blank" 
                        rel="nofollow noopener noreferrer"
                        className="h-14 md:h-20 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl flex justify-between px-6 items-center shadow-lg group transition-all active:scale-95"
                    >
                        <span className="flex items-center gap-2 text-[11px] md:text-lg font-black uppercase tracking-tight"><Zap size={22} className="fill-white animate-pulse" aria-hidden="true" /> Apply Online</span>
                        <ExternalLink size={20} aria-hidden="true"/>
                    </a>

                    {/* 📄 2. Notification Button (Smart PDF Check) */}
                    <a 
                        href={job.notificationLink?.includes('firebasestorage') ? job.notificationLink : `/redirect?url=${encodeURIComponent(job.notificationLink)}`} 
                        target="_blank" 
                        rel={job.notificationLink?.includes('firebasestorage') ? "noopener noreferrer" : "nofollow noopener noreferrer"}
                        className="h-14 md:h-20 border-2 border-red-200 bg-white text-red-600 hover:bg-red-50 rounded-2xl flex justify-between px-6 items-center transition-all active:scale-95"
                    >
                        <span className="text-[11px] md:text-sm font-black uppercase tracking-widest flex items-center gap-2"><Download size={20} aria-hidden="true" /> Notification PDF</span>
                        <ArrowRight size={20} aria-hidden="true"/>
                    </a>

                    {/* 🌍 3. Official Website Button (SEO Pro Redirect) */}
                    <a 
                        href={`/redirect?url=${encodeURIComponent(job.officialSiteLink)}`} 
                        target="_blank" 
                        rel="nofollow noopener noreferrer"
                        className="h-14 md:h-20 bg-slate-800 hover:bg-black text-white rounded-2xl flex justify-between px-6 items-center shadow-lg group transition-all active:scale-95"
                    >
                        <span className="flex items-center gap-2 text-[11px] md:text-sm font-black uppercase tracking-tight"><Globe size={20} aria-hidden="true" /> Official Website</span>
                        <ExternalLink size={20} aria-hidden="true"/>
                    </a>

                  </div>
                </div>
{/* ✅ SEO FIX: Internal Links Section (Fixes 'No outgoing links' and 'Orphan page' error) */}
                <div className="bg-blue-50/50 p-6 md:p-8 rounded-[2rem] border border-blue-100 shadow-sm mt-6">
                  <h2 className="text-sm md:text-xl font-black text-slate-800 mb-5 uppercase tracking-tight flex items-center gap-2">
                    <Search size={20} className="text-blue-600" aria-hidden="true" /> Explore More on StudyGyaan
                  </h2>
                  <div className="flex flex-wrap gap-3">
                    <a href="/govt-jobs" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Latest Govt Jobs</a>
                    <a href="/free-study-material" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Free Study Material</a>
                    <a href="/test" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Free Mock Tests</a>
                    <a href="/blog" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Sarkari Yojana & Blogs</a>
                  </div>
                </div>
                
              </div>
            </article>
          </div>

          {/* ✅ RIGHT SIDE: SIDEBAR */}
          <aside className="w-full lg:w-[30%] space-y-5 md:space-y-8 sticky top-20">
            
            {/* ✅ 🛠️ SARKARI TOOLKIT PROMO (SIDEBAR) */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-3xl shadow-xl text-white relative overflow-hidden group border-b-4 border-indigo-900">
                <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform"><Briefcase size={100} aria-hidden="true" /></div>
                <div className="text-sm md:text-base font-black mb-2 uppercase tracking-tight relative z-10">Sarkari Toolkit 🛠️</div>
                <p className="text-[11px] text-blue-100 font-medium mb-4 leading-relaxed relative z-10">Resize Photo, Signature, and Make Resume in 1-Click for FREE.</p>
                <a href="https://studygyaan.in/tools/" target="_blank" rel="noopener noreferrer" className="bg-white text-blue-700 hover:bg-yellow-400 hover:text-blue-900 font-black px-4 py-3 rounded-xl text-xs w-full flex justify-center items-center gap-2 transition-all shadow-md relative z-10">
                    Open Tools <ArrowRight size={16} aria-hidden="true"/>
                </a>
            </div>

            {/* 🚀 Trending Links */}
            <div className="bg-white p-5 md:p-8 rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative">
                {/* ✅ SEO FIX: Changed to H2 */}
                <h2 className="text-xs md:text-base font-black text-slate-900 mb-6 flex items-center gap-2 border-b pb-3 uppercase tracking-tighter">
                  <Sparkles size={18} className="text-blue-600 animate-pulse" aria-hidden="true" /> Latest Updates 🔥
                </h2>
                <div className="space-y-5 relative z-10">
                    {trendingLinks.slice(0, 5).map((item: any, i: number) => (
                        <a 
                            key={i} 
                            href={`/redirect?url=${encodeURIComponent(item.url)}`} 
                            target="_blank"
                            rel="nofollow noopener noreferrer"
                            className="group cursor-pointer block"
                        >
                            <p className="text-[12px] md:text-[14px] font-black text-slate-700 group-hover:text-blue-600 line-clamp-2 leading-tight transition-colors">{item.title}</p>
                            <div className="h-[2px] w-0 group-hover:w-full bg-blue-100 transition-all mt-2"></div>
                        </a>
                    ))}
                </div>
            </div>

            {/* Premium Promo */}
            <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 p-6 md:p-10 rounded-[3rem] text-white relative overflow-hidden shadow-2xl border-b-8 border-blue-500">
                <div className="relative z-10 text-center">
                    <div className="bg-yellow-400 text-blue-900 font-black px-4 py-1.5 rounded-full text-[9px] mb-4 uppercase tracking-[0.2em] inline-block shadow-md">Premium</div>
                    <div className="text-lg md:text-xl font-black mb-1 uppercase tracking-tighter leading-tight">Master Study Notes</div>
                    <p className="text-[10px] opacity-70 mb-5 font-bold uppercase italic">Selected by Experts</p>
                    <div className="w-full bg-white/10 p-4 rounded-2xl border border-white/10 mb-6 flex justify-between items-center backdrop-blur-sm">
                        <span className="line-through opacity-40 text-sm font-bold">₹{globalSettings?.mrpPrice || '499'}</span>
                        <span className="text-2xl md:text-3xl font-black text-yellow-400 font-mono">₹{sellingPrice}</span>
                    </div>
                    <button onClick={() => navigate('/premium-notes')} className="w-full bg-yellow-400 text-blue-900 hover:bg-white hover:text-indigo-900 font-black h-14 md:h-16 rounded-2xl text-xs md:text-sm transition-all uppercase tracking-[0.1em] shadow-xl">Get Access Now ➔</button>
                </div>
            </div>

            {/* Support Message */}
            <div className="bg-emerald-50 border-2 border-dashed border-emerald-200 p-8 rounded-[2rem] text-center shadow-sm">
                <p className="text-[10px] md:text-xs font-black text-emerald-800 uppercase mb-3 tracking-widest italic flex items-center justify-center gap-2">
                   <ShieldCheck size={18} className="text-emerald-600" aria-hidden="true" /> Facing Any Issues?
                </p>
                <a href="https://wa.me/916263396446" className="bg-white text-emerald-600 font-black px-5 py-3 rounded-2xl text-[10px] md:text-xs hover:bg-emerald-600 hover:text-white transition-all shadow-md flex items-center justify-center gap-2 border border-emerald-100">
                    Official Support <Smartphone size={16} aria-hidden="true"/>
                </a>
            </div>

          </aside>
        </div>
      </div>
    </div>
  );
};

// Internal SVG Helper (Custom File Search)
const FileSearch = ({className, size=24}) => (
  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M15 8l-4 4 4 4"/></svg>
);

export default JobDetails;