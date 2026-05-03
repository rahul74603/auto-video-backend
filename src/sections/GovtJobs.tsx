// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Briefcase, MapPin, Clock, ArrowRight, 
  Search, Banknote, GraduationCap, Users, FileText,
  ChevronLeft, ChevronRight, Share2, MessageCircle, Sparkles, Tag, ExternalLink, ShoppingCart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/context/LanguageContext';
import { useNavigate } from 'react-router-dom'; 

import { collection, getDocs, query, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import SEO from '../components/SEO'; 

interface Job {
  id: string; title: string; organization: string; vacancies: string; location: string;
  lastDate: string; salary: string; applyLink: string; category: string; type?: string; 
  advtNo?: string; qualification?: string; ageLimit?: string; updatedAt?: string; createdAt?: string;
}

const GovtJobs: React.FC = () => {
  const { t } = useLanguage();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [globalSettings, setGlobalSettings] = useState<any>(null); 
  const navigate = useNavigate();

  const [currentPage, setCurrentPage] = useState(1);
  const jobsPerPage = 7;

  const handleWhatsAppShare = (title: string, jobUrl: string) => {
    const message = encodeURIComponent(`🔥 *New Job Update!* 📢\n\n📌 *${title}*\n\nपूरी जानकारी और आवेदन यहाँ से करें 👇\n${jobUrl}\n\n(Shared via StudyGyaan.in)`);
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const cleanupExpiredJobs = async (allJobs: any[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const job of allJobs) {
      if (!job.lastDate) continue; 
      const jobDate = new Date(job.lastDate);
      if (jobDate < today) {
        try { await deleteDoc(doc(db, "jobs", job.id)); } catch (err) {}
      }
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const q = query(collection(db, "jobs")); 
        const querySnapshot = await getDocs(q);
        const fetchedJobs: Job[] = [];
        const rawJobsForCleanup: any[] = []; 
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const jobData = { ...data, id: doc.id } as Job;
          if (jobData.type && jobData.type !== 'JOB') return;
          rawJobsForCleanup.push(jobData); 
          const jobDate = new Date(jobData.lastDate);
          if (jobData.lastDate && jobDate >= today) { fetchedJobs.push(jobData); } 
          else if (!jobData.lastDate) { fetchedJobs.push(jobData); }
        });

        fetchedJobs.sort((a, b) => {
            const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return dateB - dateA; 
        });

        setJobs(fetchedJobs);
        if (rawJobsForCleanup.length > 0) cleanupExpiredJobs(rawJobsForCleanup);

        const settingsSnap = await getDoc(doc(db, "site_settings", "global"));
        if (settingsSnap.exists()) setGlobalSettings(settingsSnap.data());

      } catch (error) { console.error("Error fetching data:", error); } 
      finally { setLoading(false); }
    };
    loadData();
  }, []);

  const filteredJobs = jobs.filter(job => {
    let matchesCategory = false;
    if (selectedCategory === 'all') matchesCategory = true;
    else if (selectedCategory === 'state-exams' || selectedCategory === 'state') matchesCategory = job.category?.toLowerCase() === 'state' || job.category?.toLowerCase() === 'state-exams';
    else matchesCategory = job.category?.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch = job.title.toLowerCase().includes(searchQuery.toLowerCase()) || job.organization.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const indexOfLastJob = currentPage * jobsPerPage;
  const indexOfFirstJob = indexOfLastJob - jobsPerPage;
  const currentJobs = filteredJobs.slice(indexOfFirstJob, indexOfLastJob);
  const totalPages = Math.ceil(filteredJobs.length / jobsPerPage);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    const section = document.getElementById('govt-jobs');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  };

  // 🔥 ITEM LIST SCHEMA FOR GOOGLE SEARCH 🔥
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": currentJobs.map((job, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": `https://studygyaan.in/job/${job.id}`,
      "name": job.title
    }))
  };

  const sellingPrice = Math.round(Number(globalSettings?.mrpPrice || 499) * (1 - Number(globalSettings?.discountPercent || 85) / 100));
  
  const loopColors = [
    { bg: "bg-rose-50", border: "border-rose-200 hover:border-rose-400", text: "text-rose-900", iconText: "text-rose-600" },
    { bg: "bg-blue-50", border: "border-blue-200 hover:border-blue-400", text: "text-blue-900", iconText: "text-blue-600" },
    { bg: "bg-emerald-50", border: "border-emerald-200 hover:border-emerald-400", text: "text-emerald-900", iconText: "text-emerald-600" },
    { bg: "bg-amber-50", border: "border-amber-200 hover:border-amber-400", text: "text-amber-900", iconText: "text-amber-600" },
    { bg: "bg-purple-50", border: "border-purple-200 hover:border-purple-400", text: "text-purple-900", iconText: "text-purple-600" }
  ];

  const trendingBlogs = (globalSettings?.relatedBlogs || []).slice(0, 5); 
  const pageQuickLinks = (globalSettings?.jobUpdates?.length > 0) ? globalSettings.jobUpdates : (globalSettings?.sidebarLinks || []);

  const categoryTabs = [
    { id: 'all', label: 'All Jobs' }, { id: 'ssc', label: 'SSC' }, { id: 'banking', label: 'Banking' },
    { id: 'railway', label: 'Railway' }, { id: 'defense', label: 'Defense' }, { id: 'upsc', label: 'UPSC' },
    { id: 'teaching', label: 'Teaching' }, { id: 'state', label: 'State Govt' },
    { id: 'engineering', label: 'Engineering' }, { id: 'medical', label: 'Medical' }, { id: 'other', label: 'Other' }
  ];

  return (
    <section id="govt-jobs" className="py-4 md:py-20 bg-gray-50 font-hindi">
      
      <SEO 
        customTitle="Latest Govt Jobs Alert 2026 - Instant Notifications | StudyGyaan"
        customDescription="Find and apply for latest government jobs in SSC, Railway, Banking, and State exams. Daily updates and direct apply links on StudyGyaan."
      />

      {/* 🔥 JSON-LD INJECTION 🔥 */}
      {currentJobs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      )}

      <div className="max-w-7xl mx-auto px-1.5 md:px-8">
        
        <header className="text-center mb-3 md:mb-12">
          {/* ✅ SEO FIX: Semantic H2 Title */}
          <h2 className="text-[18px] md:text-4xl font-black text-gray-900 mb-0.5">{t('jobs.title')}</h2>
          <p className="text-[8px] md:text-base text-gray-500 max-w-2xl mx-auto opacity-80 font-bold text-center">लेटेस्ट सरकारी भर्तियों की जानकारी सबसे पहले</p>
        </header>

        {/* Categories and Search */}
        <div className="bg-white p-1 md:p-4 rounded-lg shadow-sm border border-gray-100 mb-3">
          <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
            <nav aria-label="Job Categories" className="flex gap-1 overflow-x-auto pb-1 w-full no-scrollbar snap-x">
              {categoryTabs.map((cat) => (
                <button 
                  key={cat.id} 
                  onClick={() => { setSelectedCategory(cat.id); setCurrentPage(1); }} 
                  className={`px-2 py-0.5 rounded-md text-[8px] md:text-sm font-bold transition-all whitespace-nowrap snap-start ${selectedCategory === cat.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {cat.label}
                </button>
              ))}
            </nav>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 md:w-4 md:h-4 text-gray-400" aria-hidden="true" />
              <input type="text" aria-label="Search Jobs" placeholder="Search jobs..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="w-full pl-6 md:pl-9 pr-2 py-1 md:py-2 text-[9px] md:text-base border rounded-md focus:ring-1 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-start">
          
          {/* ✅ LEFT SIDE: JOB CARDS & PAGINATION */}
          <main className="w-full md:w-[65%] flex flex-col gap-2">
            {loading ? (
                 <div className="text-center py-10 font-bold text-[8px] md:text-base text-blue-600 animate-pulse">Loading Jobs...</div>
            ) : currentJobs.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-lg border border-dashed">
                <Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-2" aria-hidden="true" />
                <h3 className="text-[12px] md:text-xl font-bold text-gray-900">No active jobs found currently</h3>
              </div>
            ) : (
              <>
                <AnimatePresence mode='popLayout'>
                  {currentJobs.map((job) => (
                    <motion.article 
                      key={job.id} 
                      layout 
                      initial={{ opacity: 0, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      exit={{ opacity: 0, scale: 0.9 }} 
                      className="bg-white rounded-md md:rounded-xl p-1.5 md:p-6 border border-gray-100 hover:shadow-md transition-all relative overflow-hidden mb-2 h-full"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 md:w-1 bg-blue-600" />
                      <div className="flex flex-col gap-1 pl-1 md:pl-4 h-full">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Badge className="bg-blue-50 text-blue-700 text-[5px] md:text-[10px] px-1 py-0 shadow-none border-none font-black truncate max-w-[80%]">{job.organization}</Badge>
                          {job.advtNo && <span className="text-[5px] md:text-xs text-gray-400 hidden sm:flex items-center gap-0.5 truncate"><FileText size={8} aria-hidden="true" /> {job.advtNo}</span>}
                        </div>
                        <a href={`/job/${job.id}`} className="block">
                          <h3 className="text-[10px] md:text-xl font-black text-gray-900 hover:text-blue-600 line-clamp-2 leading-tight">{job.title}</h3>
                        </a>
                        <div className="grid grid-cols-1 gap-0.5 text-[7px] md:text-sm text-gray-500 md:flex md:flex-row md:gap-4 md:mt-2">
                          <div className="flex items-center gap-0.5"><MapPin size={8} className="md:w-4 md:h-4" aria-hidden="true" /> <span className="truncate">{job.location || 'All India'}</span></div>
                          <div className="flex items-center gap-0.5 text-orange-600 font-bold"><Clock size={8} className="md:w-4 md:h-4" aria-hidden="true" /> <span className="truncate">Last Date: {job.lastDate}</span></div>
                        </div>
                        <div className="flex items-center gap-1 mt-2 md:mt-4">
                          <button 
                            onClick={() => handleWhatsAppShare(job.title, `${window.location.origin}/job/${job.id}`)} 
                            aria-label="Share Job on WhatsApp"
                            className="bg-green-500 text-white p-1 rounded md:px-3 md:py-1.5 flex items-center justify-center gap-0.5 flex-1 md:flex-none active:scale-95 transition-transform"
                          >
                            <MessageCircle size={10} className="md:w-4 md:h-4" aria-hidden="true" /> <span className="text-[8px] md:text-xs font-bold">Share</span>
                          </button>
                          
                          <a 
                            href={`/redirect?url=${encodeURIComponent(job.applyLink)}`} 
                            target="_blank" 
                            rel="nofollow noopener noreferrer"
                            className="bg-slate-900 text-white p-1 rounded md:px-4 md:py-1.5 flex items-center justify-center gap-0.5 flex-1 md:flex-none font-bold active:scale-95 transition-transform"
                          >
                            <span className="text-[8px] md:text-xs text-white">Apply Now</span> <ArrowRight size={10} className="md:w-4 md:h-4" aria-hidden="true" />
                          </a>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </AnimatePresence>

                {/* 🚀 PAGINATION */}
                {!loading && totalPages > 1 && (
                  <nav aria-label="Pagination" className="mt-4 md:mt-10 mb-6 flex flex-col items-center">
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" aria-label="Previous Page" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="h-6 w-6 md:h-8 md:w-8 border-gray-200 p-0"><ChevronLeft size={12} /></Button>
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded text-[9px] md:text-xs font-bold">
                        <span className="text-blue-600">{currentPage}</span><span className="text-gray-400">/</span><span>{totalPages}</span>
                      </div>
                      <Button variant="outline" size="icon" aria-label="Next Page" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-6 w-6 md:h-8 md:w-8 border-gray-200 p-0"><ChevronRight size={12} /></Button>
                    </div>
                  </nav>
                )}
              </>
            )}
            {/* ✅ SEO FIX: Internal Links Section (Boosts Interlinking & reduces Low Word Count) */}
            <div className="bg-blue-50/50 p-6 md:p-8 rounded-[2rem] border border-blue-100 shadow-sm mt-4 md:mt-8">
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
          </main>

          {/* ✅ RIGHT SIDE: DYNAMIC SIDEBAR */}
          <aside className="w-full md:w-[35%] space-y-4 md:space-y-6 sticky top-14">
              
              {/* Trending Blogs */}
              {trendingBlogs.length > 0 && (
                <section className="bg-white/80 backdrop-blur-xl p-4 md:p-6 rounded-2xl md:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-100 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
                    <h2 className="text-sm md:text-lg font-black text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center gap-2 relative z-10">
                      <Sparkles size={18} className="text-purple-600 animate-pulse" aria-hidden="true" /> 
                      <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-700 to-pink-600">ट्रेंडिंग ब्लॉग्स 🔥</span>
                    </h2>
                    
                    <ul className="space-y-3 relative z-10">
                        {trendingBlogs.map((item: any, index: number) => {
                            const style = loopColors[index % loopColors.length];
                            return (
                              <li key={index}>
                                <a 
                                  href={`/redirect?url=${encodeURIComponent(item.url)}`} 
                                  target="_blank" 
                                  rel="nofollow noopener noreferrer"
                                  className={`group flex items-center justify-between border-2 ${style.border} ${style.bg} p-3 md:p-4 rounded-xl md:rounded-2xl transition-all hover:-translate-y-1 shadow-sm hover:shadow-md`}
                                >
                                  <div className="flex-1 pr-3">
                                      <span className={`block text-[13px] md:text-[16px] font-black ${style.text} line-clamp-2 min-h-[2.8em] leading-snug`}>{item.title}</span>
                                  </div>
                                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-white shadow-sm shrink-0 group-hover:scale-110 transition-transform ${style.iconText}`}>
                                      <ArrowRight className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
                                  </div>
                                </a>
                              </li>
                            );
                        })}
                    </ul>
                </section>
              )}

              {/* Quick Links Section */}
              {pageQuickLinks.length > 0 && (
                <section className="bg-white/80 backdrop-blur-xl p-4 md:p-6 rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-100 rounded-bl-full opacity-60 pointer-events-none"></div>
                    <h2 className="text-sm md:text-lg font-black text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center gap-2 relative z-10">
                        <Tag size={18} className="text-blue-600 animate-bounce" aria-hidden="true" /> महत्वपूर्ण लिंक्स 🔗
                    </h2>
                    <ul className="space-y-3 relative z-10">
                        {pageQuickLinks.map((item: any, index: number) => {
                            const linkGradients = [
                              "bg-gradient-to-r from-blue-600 to-cyan-500",
                              "bg-gradient-to-r from-purple-600 to-fuchsia-500",
                              "bg-gradient-to-r from-orange-500 to-red-500",
                              "bg-gradient-to-r from-emerald-500 to-teal-400",
                              "bg-gradient-to-r from-rose-500 to-pink-500"
                            ];
                            const bgClass = linkGradients[index % linkGradients.length];

                            return (
                               <li key={index}>
                                 <a 
                                   href={item.url && item.url !== "#" ? `/redirect?url=${encodeURIComponent(item.url)}` : "#"} 
                                   target="_blank" 
                                   rel="nofollow noopener noreferrer"
                                   className={`group flex items-center justify-between p-3 md:p-4 rounded-xl md:rounded-2xl transition-all duration-300 shadow-md hover:shadow-xl hover:-translate-y-1 ${bgClass} text-white`}
                                 >
                                    <div className="flex items-start gap-2.5 w-full">
                                       <div className="bg-white/20 p-1.5 rounded-lg shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                                          <ExternalLink size={14} className="text-white" aria-hidden="true" />
                                       </div>
                                       <span className="font-black text-[12px] md:text-[15px] leading-snug tracking-wide pr-2">
                                           {item.title || item.name}
                                       </span>
                                    </div>
                                    <ArrowRight size={16} className="text-white/70 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0 ml-1 self-center" aria-hidden="true" />
                                 </a>
                               </li>
                            )
                        })}
                    </ul>
                </section>
              )}

              {/* Promo Box */}
              <section className="p-4 md:p-6 bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 rounded-2xl md:rounded-[2rem] text-white shadow-2xl relative overflow-hidden border-b-4 border-black/20 group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-all duration-700 pointer-events-none"></div>
                  <div className="font-black text-[14px] md:text-xl mb-1.5 italic flex items-center gap-2 relative z-10 text-yellow-300">
                    <ShoppingCart size={18} className="animate-bounce" aria-hidden="true" /> प्रीमियम नोट्स
                  </div>
                  <p className="text-[10px] md:text-xs opacity-90 mb-4 leading-relaxed relative z-10">10 साल के रिपीटेड सवालों का पूरा निचोड़।</p>
                  <div className="flex items-center gap-2 mb-4 bg-white/10 p-2 md:p-3 rounded-xl border border-white/10 relative z-10 backdrop-blur-sm">
                      <span className="line-through text-white/50 text-[10px] md:text-[12px] font-bold">₹{globalSettings?.mrpPrice || '499'}</span>
                      <span className="bg-red-500 text-white text-[8px] md:text-[10px] font-black px-2 py-0.5 rounded shadow-sm"> {globalSettings?.discountPercent || '85'}% OFF </span>
                      <div className="text-[14px] md:text-xl font-black text-yellow-400 ml-auto font-mono">₹{sellingPrice}</div>
                  </div>
                  <button onClick={() => navigate('/premium-notes')} className="w-full relative z-10 bg-yellow-400 text-blue-900 font-black py-2.5 md:py-3.5 rounded-xl md:rounded-2xl text-[12px] md:text-sm hover:bg-yellow-300 active:scale-95 shadow-xl transition-transform"> अभी खरीदें </button>
              </section>

          </aside>
        </div>
      </div>
    </section>
  );
};

export default GovtJobs;