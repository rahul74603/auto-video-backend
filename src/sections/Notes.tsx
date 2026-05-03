// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Download, ShoppingCart, Info, Sparkles, Tag, ExternalLink, Flame, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { db } from '../firebase/config'; 
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import ShareButtons from '../components/ShareButtons'; 
import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO'; 

interface AffiliateItem {
  id: string;
  title: string;
  description?: string;
  price?: string;
  applyLink: string;
  imageUrl?: string;
}

const Notes: React.FC = () => {
  const [notes, setNotes] = useState<AffiliateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEbooks, setShowEbooks] = useState(true);
  const [globalSettings, setGlobalSettings] = useState<any>(null); 
  const navigate = useNavigate();

  useEffect(() => {
    const fetchNotesAndConfig = async () => {
      try {
        setLoading(true);
        
        // 1. Settings Check (Sidebar & Controls)
        try {
            const settingsSnap = await getDoc(doc(db, "site_settings", "global"));
            if (settingsSnap.exists()) setGlobalSettings(settingsSnap.data());

            const configRef = doc(db, "siteSettings", "controls"); 
            const configSnap = await getDoc(configRef);
            if (configSnap.exists()) {
                setShowEbooks(configSnap.data().ebooksActive); 
            }
        } catch (e) {
            console.log("Config/Settings not found.");
        }

        // 2. DATA FETCHING
        const q = query(
            collection(db, "jobs"), 
            where("type", "==", "AFFILIATE")
        );

        const querySnapshot = await getDocs(q);
        const fetchedNotes: AffiliateItem[] = [];
        querySnapshot.forEach((doc) => {
          fetchedNotes.push({ id: doc.id, ...doc.data() } as AffiliateItem);
        });
        
        setNotes(fetchedNotes);
      } catch (error) {
        console.error("Error fetching notes:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchNotesAndConfig();
  }, []);

  const sellingPrice = Math.round(Number(globalSettings?.mrpPrice || 499) * (1 - Number(globalSettings?.discountPercent || 85) / 100));
  
  const loopColors = [
    { bg: "bg-rose-50", border: "border-rose-200 hover:border-rose-400", text: "text-rose-900", iconText: "text-rose-600" },
    { bg: "bg-blue-50", border: "border-blue-200 hover:border-blue-400", text: "text-blue-900", iconText: "text-blue-600" },
    { bg: "bg-emerald-50", border: "border-emerald-200 hover:border-emerald-400", text: "text-emerald-900", iconText: "text-emerald-600" },
    { bg: "bg-amber-50", border: "border-amber-200 hover:border-amber-400", text: "text-amber-900", iconText: "text-amber-600" },
    { bg: "bg-purple-50", border: "border-purple-200 hover:border-purple-400", text: "text-purple-900", iconText: "text-purple-600" }
  ];

  const trendingBlogs = (globalSettings?.relatedBlogs || []).slice(0, 5); 
  const pageQuickLinks = (globalSettings?.ebookUpdates?.length > 0) ? globalSettings.ebookUpdates : (globalSettings?.sidebarLinks || []);

  // 🔥 1. BREADCRUMB SCHEMA (Google Search Hierarchy)
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://studygyaan.in" },
      { "@type": "ListItem", "position": 2, "name": "E-Books & Notes" }
    ]
  };

  // 🔥 2. PRODUCT COLLECTION SCHEMA
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Best E-Books & Study Notes 2026",
    "description": "Handpicked educational resources and handwritten notes for exam preparation.",
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": notes.map((note, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "item": {
          "@type": "Product",
          "name": note.title,
          "image": note.imageUrl || "https://studygyaan.in/og-image.jpg",
          "offers": {
            "@type": "Offer",
            "price": note.price || "0",
            "priceCurrency": "INR"
          }
        }
      }))
    }
  };

  const ComingSoonUI = (
    <div className="flex flex-col items-center justify-center py-8 md:py-20 bg-white rounded-xl border-2 border-dashed border-orange-400 text-center px-4 shadow-sm mx-1 flex-1">
        <div className="w-10 h-10 md:w-24 md:h-24 bg-orange-50 rounded-full flex items-center justify-center mb-3 animate-bounce">
            <BookOpen className="w-5 h-5 md:w-12 md:h-12 text-orange-500" aria-hidden="true" />
        </div>
        <h2 className="text-sm md:text-3xl font-black text-gray-900">E-Books Coming Soon! 📚</h2>
    </div>
  );

  return (
    <div id="notes-page" className="py-6 md:py-20 bg-yellow-50/50 min-h-screen font-hindi antialiased">
      
      <SEO 
        customTitle="Best E-Books & Handwritten Notes 2026 | StudyGyaan"
        customDescription="Download the best handwritten notes and exam-oriented E-books. Handpicked resources to boost your exam preparation."
        customUrl="https://studygyaan.in/e-books"
        customImage="https://studygyaan.in/og-image.jpg"
      />

      {/* 🔥 Schema Injections 🔥 */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }} />

      <div className="max-w-7xl mx-auto px-2 md:px-8">
        
        {/* Header - Compact */}
        <header className="text-center mb-4 md:mb-12">
          <div className="inline-flex items-center gap-1 px-2 py-0.5 md:px-4 md:py-2 bg-orange-100 rounded-full text-orange-800 text-[8px] md:text-sm font-black mb-2 shadow-sm">
            <Sparkles size={10} className="md:w-4 md:h-4" aria-hidden="true" /> Study Recommendations
          </div>
          {/* ✅ SEO FIX: Semantic H1 for page title */}
          <h1 className="text-[18px] md:text-5xl font-black text-gray-900 mb-0.5">Best E-Books & Notes 📚</h1>
          <p className="text-gray-500 text-[8px] md:text-base opacity-80 font-bold">Handpicked resources for your competitive exam preparation.</p>
        </header>

        {/* Disclaimer */}
        <section className="max-w-4xl mx-auto mb-4 bg-blue-50 border border-blue-100 rounded-lg md:rounded-2xl p-2 md:p-4 flex gap-1.5 md:gap-3 items-center shadow-sm">
            <Info className="w-4 h-4 md:w-5 md:h-5 text-blue-600 flex-shrink-0" aria-hidden="true" />
            <p className="text-[9px] md:text-sm text-blue-800 leading-tight font-medium">
                <b className="font-bold">Note:</b> buying via these links helps support our free content.
            </p>
        </section>

        {/* MAIN 60-40 LOOP LAYOUT */}
        <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-start">
          
          {/* ✅ LEFT SIDE: E-BOOKS (65%) */}
          <main className="w-full md:w-[65%]">
            {loading ? (
                <div className="text-center py-10 font-black text-[12px] md:text-lg text-orange-600 animate-pulse">Loading Bookshelf... 📚</div>
            ) : !showEbooks ? (
                ComingSoonUI
            ) : notes.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-xl border-2 border-dashed border-gray-100">
                    <BookOpen className="mx-auto text-gray-200 mb-2 w-8 h-8 md:w-16 md:h-16" aria-hidden="true" />
                    <h2 className="text-[12px] md:text-xl font-bold text-gray-400">No Books Found Currently</h2>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                {notes.map((note) => (
                    <motion.article 
                        key={note.id} 
                        initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} 
                        className="bg-white rounded-xl md:rounded-2xl p-2 md:p-5 shadow-sm hover:shadow-lg border border-gray-100 flex flex-col h-full relative overflow-hidden group transition-all"
                    >
                        {/* Compact Price Tag */}
                        {note.price && (
                            <div className="absolute top-0 right-0 bg-green-600 text-white text-[9px] md:text-sm font-black px-2 md:px-3 py-1 rounded-bl-lg md:rounded-bl-xl z-10 shadow-md">
                                ₹{note.price}
                            </div>
                        )}

                        {/* Image - Optimized for Search */}
                        <div className="h-32 md:h-56 w-full bg-gray-50 rounded-lg md:rounded-xl mb-2 md:mb-4 overflow-hidden flex items-center justify-center border border-gray-50 relative group-hover:bg-orange-50/50 transition-colors">
                            {note.imageUrl ? (
                                <img src={note.imageUrl} alt={note.title || "StudyGyaan E-Book"} loading="lazy" className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500" />
                            ) : <BookOpen className="w-8 h-8 md:w-16 md:h-16 text-gray-200" aria-hidden="true" />}
                        </div>

                        <h3 className="font-black text-gray-900 mb-2 md:mb-4 line-clamp-2 leading-tight text-[11px] md:text-[16px] min-h-[2.4rem] md:min-h-[3rem]">
                            {note.title}
                        </h3>

                        <Button 
                            onClick={() => window.open(note.applyLink, '_blank')} 
                            className="w-full mt-auto bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-2 md:py-6 h-auto rounded-lg md:rounded-xl shadow-md flex items-center justify-center gap-1.5 text-[10px] md:text-base active:scale-95 transition-transform"
                        >
                            {note.applyLink?.includes('amazon') || note.applyLink?.includes('flipkart') ? 
                                <>Buy Now <ShoppingCart size={14} className="md:w-5 md:h-5" aria-hidden="true" /></> : 
                                <>Get PDF <Download size={14} className="md:w-5 md:h-5" aria-hidden="true" /></>
                            }
                        </Button>
                    </motion.article>
                ))}
                </div>
            )}
          </main>

          {/* ✅ RIGHT SIDE: DYNAMIC SIDEBAR (35%) */}
          <aside className="w-full md:w-[35%] space-y-4 md:space-y-6 sticky top-14 md:top-20">
              
              {/* Trending Section */}
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
                              <li key={index} onClick={() => item.url && window.open(item.url, '_blank')} className={`group cursor-pointer border-2 ${style.border} ${style.bg} p-3 md:p-4 rounded-xl md:rounded-2xl transition-all hover:-translate-y-1 shadow-sm hover:shadow-md flex items-center justify-between`}>
                                  <div className="flex-1 pr-3">
                                      <span className={`block text-[13px] md:text-[16px] font-black ${style.text} line-clamp-2 min-h-[2.8em] leading-snug`}>{item.title}</span>
                                  </div>
                                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-white shadow-sm shrink-0 group-hover:scale-110 transition-transform ${style.iconText}`}>
                                      <ArrowRight className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
                                  </div>
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
                              "bg-gradient-to-r from-blue-600 to-cyan-500 shadow-blue-500/30",
                              "bg-gradient-to-r from-purple-600 to-fuchsia-500 shadow-purple-500/30",
                              "bg-gradient-to-r from-orange-500 to-red-500 shadow-orange-500/30",
                              "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-emerald-500/30",
                              "bg-gradient-to-r from-rose-500 to-pink-500 shadow-rose-500/30"
                            ];
                            const bgClass = linkGradients[index % linkGradients.length];

                            return (
                               <li 
                                 key={index} 
                                 onClick={() => item.url && item.url !== "#" && window.open(item.url, '_blank')} 
                                 className={`group flex items-center justify-between p-3 md:p-4 rounded-xl md:rounded-2xl transition-all duration-300 cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-1 ${bgClass} text-white`}
                               >
                                  <div className="flex items-start gap-2.5 w-full">
                                     <div className="bg-white/20 p-1.5 rounded-lg shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                                        <ExternalLink size={14} className="text-white md:w-4 md:h-4" aria-hidden="true" />
                                     </div>
                                     <span className="font-black text-[12px] md:text-[15px] leading-snug tracking-wide pr-2">
                                         {item.title || item.name}
                                     </span>
                                  </div>
                                  <ArrowRight size={16} className="text-white/70 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0 ml-1 self-center" aria-hidden="true" />
                               </li>
                            )
                        })}
                    </ul>
                </section>
              )}

              {/* Promo Box */}
              <section className="p-4 md:p-6 bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 rounded-2xl md:rounded-[2rem] text-white shadow-2xl relative overflow-hidden border-b-4 border-black/20">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-all duration-700 pointer-events-none"></div>
                  <div className="font-black text-[14px] md:text-xl mb-1.5 italic flex items-center gap-2 relative z-10 text-yellow-300">
                    <ShoppingCart size={18} className="md:w-5 md:h-5 animate-bounce" aria-hidden="true" /> {globalSettings?.premiumBoxTitle || "Premium Material Notes"}
                  </div>
                  <p className="text-[10px] md:text-xs opacity-90 mb-4 leading-relaxed relative z-10">{globalSettings?.premiumBoxDesc || "100% सफलता के लिए श्रेणी-वार महत्वपूर्ण सवालों का असली संग्रह।"}</p>
                  
                  <div className="flex items-center gap-2 mb-4 bg-white/10 p-2 md:p-3 rounded-xl border border-white/10 relative z-10 backdrop-blur-sm">
                      <span className="line-through text-white/50 text-[10px] md:text-[12px] font-bold">₹{globalSettings?.mrpPrice || '499'}</span>
                      <span className="bg-red-500 text-white text-[8px] md:text-[10px] font-black px-2 py-0.5 rounded shadow-sm"> {globalSettings?.discountPercent || '85'}% OFF </span>
                      <div className="text-[14px] md:text-xl font-black text-yellow-400 ml-auto font-mono">₹{sellingPrice}</div>
                  </div>
                  <button onClick={() => navigate('/premium-notes')} className="w-full relative z-10 bg-yellow-400 text-blue-900 font-black py-2.5 md:py-3.5 rounded-xl md:rounded-2xl text-[12px] md:text-sm hover:bg-yellow-300 active:scale-95 shadow-xl transition-transform"> अभी खरीदें </button>
              </section>

          </aside>
        </div>
        {/* ✅ SEO FIX: Internal Links Section (Fixes 'No outgoing links' and 'Orphan page' error) */}
        <div className="bg-blue-50/50 p-6 md:p-8 rounded-[2rem] border border-blue-100 shadow-sm mt-8">
          <h2 className="text-sm md:text-xl font-black text-slate-800 mb-5 uppercase tracking-tight flex items-center gap-2">
            <BookOpen size={20} className="text-blue-600" aria-hidden="true" /> Explore More on StudyGyaan
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

export default Notes;