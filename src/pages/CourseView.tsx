// @ts-nocheck
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, orderBy, getDocs, doc, getDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { useCourseAccess } from '../hooks/useCourseAccess'; 
import { Lock, Unlock, FileText, Folder, Loader2, ArrowLeft, ChevronRight, Home, ExternalLink, ShoppingBag, CheckCircle, ShieldCheck, BadgePercent, Tag, ArrowRight } from 'lucide-react';
import SEO from '../components/SEO';

interface CourseContent { id: string; title: string; seoTitle?: string; link?: string; type: 'PDF' | 'VIDEO' | 'FOLDER'; parentId?: string | null; }

const CourseView = () => {
  const { id } = useParams(); 
  const navigate = useNavigate();
  const { hasAccess, loading: authLoading } = useCourseAccess(id || ""); 
  
  const [course, setCourse] = useState<any>(null);
  const [globalSettings, setGlobalSettings] = useState<any>(null); 
  const [allContent, setAllContent] = useState<CourseContent[]>([]); 
  const [loading, setLoading] = useState(true);
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  
  // 📂 FOLDER STATE
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{id: string, name: string}[]>([]);

  // Timer state
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        // 1. Fetch Course Data
        const docSnap = await getDoc(doc(db, "courses", id));
        if (docSnap.exists()) {
          const courseData = docSnap.data();
          setCourse(courseData);
          
          // 2. Fetch Content
          const q = query(collection(db, `courses/${id}/content`), orderBy("createdAt", "desc"));
          const contentSnap = await getDocs(q);
          setAllContent(contentSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }

        // 3. Fetch Global Settings
        const settingsSnap = await getDoc(doc(db, "site_settings", "global"));
        if (settingsSnap.exists()) {
          setGlobalSettings(settingsSnap.data());
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    const lockAmount = async () => {
      if (globalSettings && id) {
        const basePrice = Math.round((parseInt(globalSettings?.mrpPrice || "499")) * (1 - (parseInt(globalSettings?.discountPercent || "85")) / 100));
        
        let attempts = 0;
        let generatedPrice = 0;
        let isLocked = false;

        while (attempts < 10 && !isLocked) {
          const randomPaise = (Math.floor(Math.random() * 99) + 1) / 100;
          const tempPrice = basePrice + randomPaise;
          const calculated = basePrice + randomPaise;
          generatedPrice = Number(calculated.toFixed(2));
          const lockId = `${id}_${generatedPrice.toFixed(2)}`;
          const lockRef = doc(db, "price_locks", lockId);
          
          try {
            const lockDoc = await getDoc(lockRef);
            if (!lockDoc.exists()) {
              // Attempt to acquire lock
              await setDoc(lockRef, {
                lockedAt: serverTimestamp(),
                courseId: id,
                amount: generatedPrice
              });
              isLocked = true;
              setFinalPrice(generatedPrice);

              // Set timer for 16 minutes (960 seconds)
              setTimeLeft(960);
            }
          } catch (error) {
             console.error("Error locking price:", error);
          }
          attempts++;
        }

        if (!isLocked) {
            // Fallback if unable to lock after 10 attempts
            setFinalPrice(basePrice);
            console.error("Could not secure a unique price lock.");
        }
      }
    };

    lockAmount();
  }, [globalSettings, id]);

  // Timer logic
  useEffect(() => {
    if (timeLeft > 0) {
      const timerId = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timerId);
    } else if (timeLeft === 0 && finalPrice > 0 && id) {
       // Unlock price when timer expires
       const releaseLock = async () => {
          const lockId = `${id}_${finalPrice.toFixed(2)}`;
          const lockRef = doc(db, "price_locks", lockId);
          await deleteDoc(lockRef);
       };
       releaseLock();
    }
  }, [timeLeft, finalPrice, id]);

  const handlePaymentRedirect = () => {
    navigate('/manual-payment', { state: { itemId: id, itemName: course?.title || "Premium Course", amount: finalPrice } });
  };

  const sellingPrice = Math.round(
    (parseInt(globalSettings?.mrpPrice || "499")) * (1 - (parseInt(globalSettings?.discountPercent || "85")) / 100)
  );

  const pageQuickLinks = globalSettings?.sidebarLinks || [];

  const enterFolder = (folderId: string, folderName: string) => {
      setCurrentFolderId(folderId);
      setFolderPath([...folderPath, { id: folderId, name: folderName }]);
  };

  const navigateToBreadcrumb = (index: number) => {
      if (index === -1) {
          setCurrentFolderId(null);
          setFolderPath([]);
      } else {
          const newPath = folderPath.slice(0, index + 1);
          setFolderPath(newPath);
          setCurrentFolderId(newPath[newPath.length - 1].id);
      }
  };

  const visibleContent = allContent.filter(item => {
      if (currentFolderId === null) return !item.parentId;
      return item.parentId === currentFolderId;
  });

  const handleFileClick = (item: CourseContent) => {
      if (hasAccess) {
          if (item.link) window.open(item.link, '_blank');
      } else {
          handlePaymentRedirect();
      }
  };

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading || authLoading) return <div className="h-screen flex justify-center items-center bg-gray-50"><Loader2 className="w-10 h-10 animate-spin text-blue-600"/></div>;
  if (!course) return <div className="p-10 text-center font-bold text-red-500">Course Not Found</div>;

  return (
    <div className="max-w-5xl mx-auto p-2.5 md:p-8 min-h-screen bg-gray-50 font-hindi">
      
      {/* 🔥 नया डायनामिक SEO टैग जो कोर्स का नाम और फोटो गूगल/WhatsApp पर दिखाएगा */}
      <SEO 
        customTitle={`${course.title} - StudyGyaan 2026`}
        customDescription={course.description || `Get high-quality study materials, notes and expert guidance for ${course.title} on StudyGyaan Portal.`}
        customUrl={`https://studygyaan.in/course/${id}`}
        customImage="https://studygyaan.in/og-image.jpg"
      />

      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 md:gap-2 text-gray-500 hover:text-gray-900 mb-3 md:mb-6 font-bold transition text-xs md:text-base">
        <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" /> वापस जाएँ
      </button>

      {/* HEADER CARD */}
      <div className="bg-gradient-to-br from-gray-900 via-blue-950 to-indigo-900 text-white p-6 md:p-12 rounded-2xl md:rounded-[2.5rem] mb-5 md:mb-10 shadow-2xl relative overflow-hidden border border-white/10">
        <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 md:gap-2 bg-blue-500/20 text-blue-300 px-2.5 py-1 md:px-4 md:py-1.5 rounded-full text-[9px] md:text-xs font-black uppercase tracking-widest mb-3 md:mb-6 backdrop-blur-md border border-blue-500/30">
              Premium Content
            </div>
            <h1 className="text-2xl md:text-5xl font-black mb-2 md:mb-4 leading-tight uppercase tracking-tight">{course.title}</h1>
            <p className="text-indigo-200/80 mb-6 md:mb-10 max-w-2xl text-xs md:text-lg leading-relaxed font-medium">{course.description}</p>
            
            {!hasAccess ? (
              <div className="space-y-4 md:space-y-6">
                <div className="flex flex-col items-center md:items-start gap-1">
                   <div className="flex items-center gap-3">
                      <span className="line-through text-indigo-300/50 text-sm md:text-xl font-bold italic">
                        Rs.{globalSettings?.mrpPrice || '499'}
                      </span>
                      <span className="bg-red-600 text-white text-[10px] md:text-xs font-black px-2.5 py-1 rounded-md shadow-lg animate-pulse flex items-center gap-1">
                         <BadgePercent size={14}/> {globalSettings?.discountPercent || '85'}% OFF
                      </span>
                   </div>
                   <div className="text-4xl md:text-6xl font-black text-emerald-400 drop-shadow-md flex items-baseline gap-1">
  <span className="text-xl md:text-2xl">Rs.</span>
  {finalPrice !== null ? finalPrice.toFixed(2) : "..."}
</div>
                   {timeLeft > 0 && (
                     <div className="mt-2 text-sm md:text-base text-yellow-300 font-bold bg-black/30 px-3 py-1.5 rounded-lg border border-yellow-500/30 inline-block animate-pulse">
                        ⚠️ Please pay exactly Rs. {finalPrice?.toFixed(2)}. This amount is reserved for you for {formatTime(timeLeft)}.
                     </div>
                   )}
                </div>

                <button 
                    onClick={handlePaymentRedirect} 
                    className="group bg-yellow-400 text-black px-4 py-3 md:px-10 md:py-6 rounded-xl md:rounded-3xl font-black hover:bg-yellow-300 transition-all flex items-center justify-center gap-2 md:gap-4 text-sm md:text-2xl shadow-[0_15px_40px_rgba(234,179,8,0.4)] hover:scale-[1.02] active:scale-95 w-full md:w-auto uppercase tracking-tighter"
                >
                    <ShoppingBag className="w-5 h-5 md:w-8 md:h-8" /> अभी अनलॉक करें
                </button>
                <p className="text-[9px] md:text-xs text-indigo-300/60 font-bold tracking-widest text-center md:text-left">* लाइफटाइम एक्सेस के लिए एक बार भुगतान करें</p>
              </div>
            ) : (
              <div className="bg-emerald-500/20 border border-emerald-400/50 text-emerald-400 px-4 py-2 md:px-8 md:py-4 rounded-xl md:rounded-2xl inline-flex items-center gap-1.5 md:gap-3 font-black backdrop-blur-sm shadow-xl text-xs md:text-base">
                  <Unlock className="w-4 h-4 md:w-6 md:h-6" /> एक्सेस मिल गया है
              </div>
            )}
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 md:w-96 md:h-96 bg-blue-600/20 rounded-full blur-[80px] md:blur-[120px] -mr-32 -mt-32 md:-mr-40 md:-mt-40"></div>
      </div>

      {!hasAccess && (
        <div className="bg-white border-2 border-dashed border-blue-100 rounded-2xl md:rounded-[2.5rem] p-6 md:p-12 text-center mb-5 md:mb-10 animate-in fade-in slide-in-from-bottom-4">
            <div className="w-12 h-12 md:w-20 md:h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 md:mb-6 shadow-inner">
              <Lock className="text-blue-500 w-6 h-6 md:w-10 md:h-10" />
            </div>
            <h3 className="text-lg md:text-3xl font-black text-gray-800 mb-2 md:mb-4">प्रीमियम कंटेंट लॉक है</h3>
            <p className="text-gray-500 max-w-lg mx-auto mb-6 md:mb-10 font-medium text-xs md:text-lg leading-relaxed">
              {course.lockMessage || "इस बंडल की सभी प्रीमियम फाइल्स को देखने और डाउनलोड करने के लिए कृपया अनलॉक बटन का उपयोग करें।"}
            </p>
            
            <div className="flex flex-wrap justify-center items-center gap-3 md:gap-10 text-[9px] md:text-sm font-black text-gray-400 uppercase tracking-widest">
              {course.features && course.features.length > 0 ? (
                course.features.map((item: string, index: number) => (
                  <div key={index} className="flex items-center gap-1.5 md:gap-3 bg-gray-50 px-4 py-2 md:px-6 md:py-3 rounded-xl border border-gray-100 shadow-sm">
                    <CheckCircle className="text-blue-600 w-4 h-4 md:w-5 md:h-5"/> {item}
                  </div>
                ))
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                    <ShieldCheck className="text-blue-500 w-4 h-4 md:w-5 md:h-5"/> Verified Material
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                    <CheckCircle className="text-green-500 w-4 h-4 md:w-5 md:h-5"/> Lifetime Access
                  </div>
                </>
              )}
            </div>
        </div>
      )}

      <div className="animate-in fade-in duration-500">
         <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-sm text-gray-600 bg-white px-3 py-2 md:px-5 md:py-4 rounded-xl md:rounded-2xl border shadow-sm mb-3 md:mb-6 overflow-x-auto hide-scrollbar">
               <button onClick={() => navigateToBreadcrumb(-1)} className="flex items-center gap-1 text-blue-600 hover:underline font-bold whitespace-nowrap shrink-0">
                   <Home className="w-3 h-3 md:w-4 md:h-4"/> होम
               </button>
               {folderPath.map((folder, index) => (
                   <div key={folder.id} className="flex items-center gap-1.5 md:gap-2 whitespace-nowrap shrink-0">
                       <ChevronRight className="text-gray-400 w-3 h-3 md:w-[14px] md:h-[14px]"/>
                       <button 
                           onClick={() => navigateToBreadcrumb(index)} 
                           className={`hover:underline ${index === folderPath.length - 1 ? "font-black text-gray-800" : "text-blue-600"}`}
                       >
                           {folder.name}
                       </button>
                   </div>
               ))}
         </div>

         <div className="space-y-2 md:space-y-4 pb-20">
            {visibleContent.map((item) => (
               <div 
                   key={item.id} 
                   onClick={() => item.type === 'FOLDER' ? enterFolder(item.id, item.title) : handleFileClick(item)}
                   className={`flex items-center justify-between p-3 md:p-6 rounded-xl md:rounded-[1.5rem] border transition-all group cursor-pointer ${
                      hasAccess || item.type === 'FOLDER' ? 'bg-white border-gray-100 hover:border-blue-400 hover:shadow-xl' : 'bg-gray-50 border-gray-100 opacity-80'
                   }`}
               >
                   <div className="flex items-center gap-3 md:gap-5 overflow-hidden flex-1">
                       <div className={`p-2 md:p-4 rounded-xl md:rounded-2xl shrink-0 ${
                         item.type === 'FOLDER' ? 'bg-amber-50 text-amber-600' : 
                         item.type === 'PDF' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                       }`}>
                           {item.type === 'FOLDER' ? <Folder fill="currentColor" className="w-5 h-5 md:w-8 md:h-8"/> : <FileText className="w-5 h-5 md:w-8 md:h-8"/>}
                       </div>
                       <div className="min-w-0 flex-1">
                           <h4 className="font-bold text-gray-800 text-sm md:text-xl truncate mb-0.5">{item.seoTitle || item.title}</h4>
                           <div className="flex items-center gap-2">
                               <p className="text-[8px] md:text-[11px] font-black uppercase tracking-[0.15em] text-gray-400">{item.type}</p>
                               {!hasAccess && item.type !== 'FOLDER' && (
                                  <span className="text-[8px] md:text-[10px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Lock className="w-2.5 h-2.5 md:w-3 md:h-3"/> PREMIUM</span>
                               )}
                           </div>
                       </div>
                   </div>
                   <div className={`p-2 rounded-xl transition-all shrink-0 ml-2 ${hasAccess ? 'bg-gray-50 text-gray-300 md:group-hover:bg-blue-600 md:group-hover:text-white' : 'text-gray-200'}`}>
                       {item.type === 'FOLDER' ? <ChevronRight className="w-5 h-5 md:w-6 md:h-6"/> : hasAccess ? <ExternalLink className="w-5 h-5 md:w-6 md:h-6"/> : <Lock className="w-5 h-5 md:w-6 md:h-6"/>}
                   </div>
               </div>
            ))}

            {visibleContent.length === 0 && (
               <div className="text-center py-16 md:py-28 border-2 border-dashed rounded-3xl bg-white border-gray-100">
                   <ShoppingBag className="w-12 h-12 md:w-20 md:h-20 text-gray-100 mx-auto mb-4"/>
                   <p className="text-gray-400 font-bold text-xs md:text-xl">यह सेक्शन अभी खाली है।</p>
               </div>
            )}

            {pageQuickLinks.length > 0 && (
              <div className="bg-white/80 backdrop-blur-xl p-4 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden relative mt-8 md:mt-12">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-100 rounded-bl-full opacity-60 pointer-events-none"></div>
                  <h3 className="text-sm md:text-xl font-black text-slate-900 mb-5 border-b border-slate-100 pb-3 flex items-center gap-2 relative z-10">
                      <Tag size={20} className="text-blue-600 animate-bounce" /> महत्वपूर्ण लिंक्स 🔗
                  </h3>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 relative z-10">
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
                               className={`group flex items-center justify-between p-3 md:p-5 rounded-xl md:rounded-2xl transition-all duration-300 cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-1 ${bgClass} text-white`}
                             >
                                <div className="flex items-start gap-3 w-full">
                                   <div className="bg-white/20 p-2 rounded-lg shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                                      <ExternalLink size={16} className="text-white md:w-5 md:h-5" />
                                   </div>
                                   <span className="font-black text-[13px] md:text-[16px] leading-snug tracking-wide pr-2">
                                       {item.title || item.name}
                                   </span>
                                </div>
                                <ArrowRight size={18} className="text-white/70 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0 ml-1 self-center" />
                             </li>
                          )
                      })}
                  </ul>
              </div>
            )}
         </div>
      </div>
{/* ✅ SEO FIX: Internal Links Section (Fixes 'No outgoing links' and 'Orphan page' error) */}
      <div className="bg-blue-50/50 p-6 md:p-8 rounded-[2rem] border border-blue-100 shadow-sm mt-8 mb-6">
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
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
};

export default CourseView;