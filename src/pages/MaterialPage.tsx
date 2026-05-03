// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config'; 
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, FileText, Download, ArrowLeft, ChevronRight, Home, Search, Loader2, Sparkles, Tag, ExternalLink, ShoppingCart, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ShareButtons from '../components/ShareButtons';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO'; 

interface Category { id: string; name: string; parentId: string; }
interface Material { id: string; title: string; applyLink: string; category: string; fileSize?: string; updatedAt?: string; }

const StudyMaterials: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null); 
  const [loading, setLoading] = useState(true);
  
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [currentFolderName, setCurrentFolderName] = useState<string>('All Subjects');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  // ✅ PRECISE SCROLL FIX
  useEffect(() => {
    if (currentFolderId !== 'root' || searchQuery) {
      const element = document.getElementById('materials-content');
      if (element) {
        const offset = 80; 
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    }
  }, [currentFolderId]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const catSnap = await getDocs(collection(db, "categories"));
        const fetchedCats: Category[] = [];
        catSnap.forEach(doc => fetchedCats.push({ id: doc.id, ...doc.data() } as Category));
        setCategories(fetchedCats);

        const q1 = query(collection(db, "jobs"), where("category", "==", currentFolderId));
        const q2 = query(collection(db, "study_materials"), where("category", "==", currentFolderId));
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

        const fetchedMats: Material[] = [];
        snap1.forEach(doc => {
            const data = doc.data();
            if (data.type !== 'MATERIAL') return; 
            fetchedMats.push({ id: doc.id, ...data } as Material);
        });
        snap2.forEach(doc => { fetchedMats.push({ id: doc.id, ...doc.data() } as Material); });

        fetchedMats.sort((a, b) => (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) - (a.updatedAt ? new Date(a.updatedAt).getTime() : 0));
        setMaterials(fetchedMats);

        const settingsSnap = await getDoc(doc(db, "site_settings", "global"));
        if (settingsSnap.exists()) setGlobalSettings(settingsSnap.data());
      } catch (error) { console.error(error); } finally { setLoading(false); }
    };
    fetchData();
  }, [currentFolderId]);

  const currentFolders = useMemo(() => {
    return categories.filter(c => c.parentId === currentFolderId).sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, currentFolderId]);

  const isSearching = searchQuery.length > 0;
  const searchedFiles = useMemo(() => {
      if (!isSearching) return [];
      return materials.filter(m => m.title?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [materials, searchQuery, isSearching]);

  const enterFolder = (folder: Category) => {
    setCurrentFolderId(folder.id);
    setCurrentFolderName(folder.name);
    setSearchQuery('');
  };

  const goHome = () => {
    setCurrentFolderId('root');
    setCurrentFolderName('All Subjects');
    setSearchQuery('');
  };

  const goBack = () => {
    if (currentFolderId === 'root') return;
    const currentCat = categories.find(c => c.id === currentFolderId);
    if (currentCat) {
      const parentId = currentCat.parentId;
      const parentCat = categories.find(c => c.id === parentId);
      setCurrentFolderId(parentId);
      setCurrentFolderName(parentCat ? parentCat.name : 'All Subjects');
    } else {
      goHome();
    }
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
  const pageQuickLinks = (globalSettings?.pdfUpdates?.length > 0) ? globalSettings.pdfUpdates : (globalSettings?.sidebarLinks || []);

  // 🔥 1. BREADCRUMB SCHEMA
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://studygyaan.in" },
      { "@type": "ListItem", "position": 2, "name": "Free Study Material", "item": "https://studygyaan.in/free-study-material" },
      { "@type": "ListItem", "position": 3, "name": currentFolderName }
    ]
  };

  // 🔥 2. COLLECTION SCHEMA
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${currentFolderName} Free PDF Notes`,
    "description": `Download free high-quality study materials for ${currentFolderName} on StudyGyaan.`,
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": materials.map((m, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "name": m.title,
        "url": `https://studygyaan.in/pdf/${m.id}`
      }))
    }
  };

  if (loading || !globalSettings) return <div className="flex flex-col items-center justify-center min-h-screen text-blue-600 font-black text-xs animate-pulse"><Loader2 className="w-6 h-6 animate-spin mb-2" />लाइब्रेरी खुल रही है...</div>;

  return (
    <div id="materials-page" className="bg-[#F8FAFC] min-h-screen font-hindi antialiased">
      
      <SEO 
        customTitle={`${currentFolderName} - Free Study Materials 2026 | StudyGyaan`}
        customDescription={`Download free high-quality study materials, handwritten notes and previous year papers for ${currentFolderName} on StudyGyaan Portal.`}
        customUrl="https://studygyaan.in/free-study-material"
        customImage="https://studygyaan.in/og-image.jpg"
      />

      {/* 🔥 Schema Injections */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }} />

      <header className="py-4 md:py-16 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 text-center">
          {/* ✅ SEO FIX: Dynamic H1 Tag */}
          <h1 className="text-lg md:text-5xl font-black text-slate-900 mb-0.5">
            {currentFolderName === 'All Subjects' ? 'Free PDF Study Materials Library' : `${currentFolderName} Notes PDF`}
          </h1>
          <p className="text-blue-600 text-[8px] md:text-lg font-black uppercase tracking-widest">StudyGyaan Smart Library Portal</p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-2 md:px-8 py-4 md:py-8">
        
        {/* Navigation & Search Bar */}
        <div className="bg-white p-2 md:p-4 rounded-xl border border-slate-100 mb-6 flex flex-col md:flex-row justify-between items-center gap-2 shadow-sm sticky top-14 md:top-20 z-30 backdrop-blur-md bg-opacity-95">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 w-full md:w-auto overflow-x-auto no-scrollbar">
              {isSearching ? (
                <Button variant="ghost" onClick={() => setSearchQuery('')} className="text-red-500 gap-1 text-[9px] md:text-sm h-7 font-black"><ArrowLeft size={12}/> Exit Search</Button>
              ) : (
                <div className="flex items-center gap-1 text-[8px] md:text-sm text-slate-600 whitespace-nowrap font-bold">
                    <button onClick={goHome} className="flex items-center gap-1 hover:text-blue-600"><Home size={12} className="text-blue-500" aria-hidden="true" />Home</button>
                    {currentFolderId !== 'root' && (
                      <>
                        <ChevronRight size={8} aria-hidden="true" />
                        <button onClick={goBack} className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors font-black">
                          <ArrowLeft size={12} aria-hidden="true" /> BACK
                        </button>
                      </>
                    )}
                    <ChevronRight size={8} aria-hidden="true" />
                    <span className="font-black text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded-sm truncate max-w-[100px]">{currentFolderName}</span>
                </div>
              )}
          </nav>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3" aria-hidden="true" />
            <input type="text" aria-label="Search Materials" placeholder="खोजें..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-4 py-1.5 border rounded-lg bg-slate-50 text-[10px] md:text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* ✅ CLS FIX: Added min-height to prevent layout jumps during content change */}
        <div id="materials-content" className="flex flex-col md:flex-row gap-4 md:gap-8 items-start min-h-[600px]">
          
          <main className="w-full md:w-[65%] min-h-[400px]">
            <AnimatePresence mode="wait">
              <motion.div key={currentFolderId + searchQuery} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                
                {/* 📂 FOLDERS SECTION */}
                {!isSearching && currentFolders.length > 0 && (
                  <section>
                    <h2 className="text-[10px] md:text-sm font-black text-slate-400 uppercase mb-4 tracking-widest flex items-center gap-1.5 px-1"><Folder size={16} aria-hidden="true" /> विषय चुनें (Select Subject)</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5 mb-10">
                      {currentFolders.map((folder) => (
                        <article key={folder.id} onClick={() => enterFolder(folder)} className="group bg-white border border-slate-100 p-3 md:p-10 rounded-2xl md:rounded-[2.5rem] cursor-pointer flex flex-col items-center text-center transition-all shadow-sm hover:shadow-xl h-32 md:h-72 justify-center active:scale-95">
                          <Folder size={32} className="md:w-24 md:h-24 text-yellow-400 fill-yellow-400/20 group-hover:scale-110 transition-transform mb-2 md:mb-6" aria-hidden="true" />
                          <h3 className="text-[12px] md:text-xl font-black text-slate-800 line-clamp-2 leading-tight">{folder.name}</h3>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {/* 📄 FILES SECTION */}
                {(isSearching ? searchedFiles : materials).length > 0 ? (
                  <section className="space-y-4">
                     <h2 className="text-[10px] md:text-sm font-black text-slate-400 uppercase mb-2 tracking-widest flex items-center gap-1.5 px-1"><FileText size={16} aria-hidden="true" /> उपलब्ध सामग्री (PDF Notes)</h2>
                     <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                        {(isSearching ? searchedFiles : materials).map((file) => <FileCard key={file.id} file={file} />)}
                     </div>
                  </section>
                ) : (
                    !currentFolders.length && <div className="text-center py-20 font-black text-slate-300 text-sm border-2 border-dashed border-slate-100 rounded-[2.5rem]">अभी इस कैटेगरी में सामग्री उपलब्ध नहीं है 🥲</div>
                )}
              </motion.div>
            </AnimatePresence>
          </main>

          <aside className="w-full md:w-[35%] space-y-4 md:space-y-6 sticky top-14 md:top-24 min-h-[300px]">
              
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
                               <li 
                                 key={index} 
                                 onClick={() => item.url && item.url !== "#" && window.open(item.url, '_blank')} 
                                 className={`group flex items-center justify-between p-3 md:p-4 rounded-xl md:rounded-2xl transition-all duration-300 cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-1 ${bgClass} text-white`}
                               >
                                  <div className="flex items-start gap-2.5 w-full">
                                     <div className="bg-white/20 p-1.5 rounded-lg shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                                        <ExternalLink size={14} className="text-white md:w-4 md:h-4" aria-hidden="true" />
                                     </div>
                                     <span className="font-black text-[12px] md:text-[15px] font-hindi leading-snug tracking-wide pr-2">
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

              <section className="p-4 md:p-6 bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 rounded-2xl md:rounded-[2rem] text-white shadow-2xl relative overflow-hidden border-b-4 border-black/20">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-all duration-700 pointer-events-none"></div>
                  <div className="font-black text-[14px] md:text-xl mb-1.5 italic flex items-center gap-2 relative z-10 text-yellow-300 font-hindi">
                    <ShoppingCart size={18} className="md:w-5 md:h-5 animate-bounce" aria-hidden="true" /> प्रीमियम नोट्स
                  </div>
                  <p className="text-[10px] md:text-xs opacity-90 mb-4 leading-relaxed relative z-10 font-hindi">10 साल के रिपीटेड सवालों का पूरा निचोड़।</p>
                  <div className="flex items-center gap-2 mb-4 bg-white/10 p-2 md:p-3 rounded-xl border border-white/10 relative z-10 backdrop-blur-sm">
                      <span className="line-through text-white/50 text-[10px] md:text-[12px] font-bold">₹{globalSettings?.mrpPrice || '499'}</span>
                      <div className="text-[14px] md:text-xl font-black text-yellow-400 ml-auto font-mono">₹{sellingPrice}</div>
                  </div>
                  <button onClick={() => navigate('/premium-notes')} className="w-full relative z-10 bg-yellow-400 text-blue-900 font-black py-2.5 md:py-3.5 rounded-xl md:rounded-2xl text-[12px] md:text-sm hover:bg-yellow-300 active:scale-95 shadow-xl transition-transform font-hindi"> अभी खरीदें </button>
              </section>

          </aside>
        </div>
      </div>
    </div>
  );
};

const FileCard = React.memo(({ file }: { file: Material }) => (
  <article className="bg-white border border-slate-100 p-3 md:p-5 rounded-xl md:rounded-2xl shadow-sm hover:shadow-md flex flex-col h-full active:scale-95 transition-all">
    <div className="flex flex-col gap-2 flex-1">
        <div className="bg-red-50 p-2 md:p-4 rounded-xl self-start">
          <FileText size={20} className="text-red-500 md:w-8 md:h-8" aria-hidden="true" />
        </div>
        <div className="min-w-0">
            <h3 className="font-black text-slate-800 text-[12px] md:text-lg line-clamp-3 leading-tight uppercase tracking-tighter">{file.title}</h3>
            <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[9px] md:text-xs text-slate-400 font-bold bg-slate-50 px-1.5 rounded border">PDF</span>
                {file.fileSize && <span className="text-[9px] md:text-xs text-slate-300 font-bold">{file.fileSize}</span>}
            </div>
        </div>
    </div>
    <div className="mt-4 pt-3 border-t border-dashed border-slate-100 flex items-center justify-between">
        <div className="scale-90 md:scale-100 origin-left">
            <ShareButtons title={file.title} url={`${window.location.origin}/pdf/${file.id}`} />
        </div>
        <div className="flex-1"></div> 
        <button 
          aria-label={`Download ${file.title}`}
          className="bg-blue-600 text-white p-2 md:p-3 rounded-lg shadow-md hover:bg-blue-700 active:scale-90 transition-colors" 
          onClick={() => window.open(file.applyLink, '_blank')}
        >
          <Download size={16} className="md:w-5 md:h-5" aria-hidden="true" />
        </button>
    </div>
  </article>
));

export default StudyMaterials;