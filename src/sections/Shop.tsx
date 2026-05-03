// @ts-nocheck
import React, { useEffect, useState } from 'react';
// ✅ यहाँ doc और getDoc को ऐड कर दिया है (यही असली एरर था)
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import { Crown, ArrowRight, Loader2, Sparkles, Tag, Zap, ExternalLink, FileText, Lock, BookOpen, ShoppingCart } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';

// 🔥 Included Files List (PC पर डिटेल दिखाने के लिए)
const CourseFilesList = ({ courseId }: { courseId: string }) => {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const q = query(collection(db, `courses/${courseId}/content`), orderBy("createdAt", "desc"), limit(5));
        const snapshot = await getDocs(q);
        setFiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) { 
        console.error("Files Fetch Error:", err); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchFiles();
  }, [courseId]);

  if (loading || files.length === 0) return null;

  return (
    <div className="w-full mt-4 bg-slate-50 rounded-xl p-3 border border-dashed border-slate-200 text-left">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
        <BookOpen size={12} /> सामग्री सूची ({files.length}+)
      </p>
      <div className="space-y-1.5">
        {files.map((file) => (
          <div key={file.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 overflow-hidden">
              <FileText className="text-red-500 shrink-0 w-3.5 h-3.5" />
              <span className="text-[11px] font-bold text-slate-700 truncate">{file.title}</span>
            </div>
            <Lock className="text-slate-300 shrink-0 w-3 h-3" />
          </div>
        ))}
      </div>
    </div>
  );
};

const Shop: React.FC = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null); 
  const [purchasedCourseIds, setPurchasedCourseIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Courses लाना
        const snapshot = await getDocs(collection(db, "courses"));
        let fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        fetched.sort((a, b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999));
        setCourses(fetched);

        // ✅ Global Settings लाना (अब यह एरर नहीं देगा क्योंकि getDoc इम्पोर्टेड है)
        const settingsSnap = await getDoc(doc(db, "site_settings", "global"));
        if (settingsSnap.exists()) {
          setGlobalSettings(settingsSnap.data());
        }
      } catch (err) { 
        console.error("Data Fetch Error:", err); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchData();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const q = query(collection(db, "orders"), where("userId", "==", user.uid));
          const snap = await getDocs(q);
          setPurchasedCourseIds(snap.docs.map(doc => doc.data().courseId));
        } catch (err) {
          console.error("Orders Fetch Error:", err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // कैलकुलेशन
  const sellingPrice = Math.round((parseInt(globalSettings?.mrpPrice || "499")) * (1 - (parseInt(globalSettings?.discountPercent || "85")) / 100));
  const pureGold = "bg-gradient-to-r from-[#BF953F] via-[#FCF6BA] via-[#B38728] via-[#FBF5B7] to-[#AA771C]";

  if (loading) return (
    <div className="flex justify-center items-center h-screen bg-[#FAFAFA]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-yellow-600 w-12 h-12" />
        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Loading Premium Content...</p>
      </div>
    </div>
  );

  return (
    <section className="py-6 md:py-16 bg-[#FAFAFA] font-hindi">
      <div className="max-w-7xl mx-auto px-3">
        
        {/* Header */}
        <div className="flex items-center justify-center gap-2 mb-8 md:mb-16">
          <div className={`p-1.5 rounded-lg ${pureGold}`}>
            <Crown className="text-slate-900 w-6 h-6 md:w-10 md:h-10" />
          </div>
          <h2 className="text-2xl md:text-6xl font-black text-slate-800 tracking-tighter uppercase italic">
            Premium <span className="text-blue-600">Notes</span>
          </h2>
        </div>

        {/* ✅ Main Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-10 mb-16">
          {courses.map((course) => {
            const isPurchased = purchasedCourseIds.includes(course.id);
            return (
              <div key={course.id} className={`group relative p-[2px] md:p-[5px] rounded-[1.5rem] md:rounded-[3rem] ${pureGold} shadow-xl`}>
                <div className="bg-white rounded-[1.4rem] md:rounded-[2.8rem] p-3 md:p-10 flex flex-col h-full relative z-10">
                  
                  {/* Icon & Title */}
                  <div className="flex flex-col items-center text-center">
                    <div className={`p-2 md:p-5 rounded-2xl mb-3 md:mb-8 shadow-md ${pureGold}`}>
                      <Crown size={24} className="text-slate-900 md:w-10 md:h-10" />
                    </div>
                    <h3 className="text-[12px] md:text-2xl font-black text-slate-900 mb-2 md:mb-4 uppercase leading-tight italic line-clamp-2">
                      {course.title}
                    </h3>
                  </div>

                  {/* ✅ Full Detail only for PC (Description & Files) */}
                  <div className="hidden md:block">
                    <p className="text-slate-500 text-sm font-bold leading-relaxed mb-6 text-center opacity-80">
                      {course.description || "सरकारी परीक्षा के लिए सबसे सटीक और प्रीमियम हैंड रिटन नोट्स।"}
                    </p>
                    <CourseFilesList courseId={course.id} />
                  </div>

                  {/* Pricing Badge */}
                  <div className="flex flex-col items-center gap-1 my-4 md:my-8 mt-auto">
                    <div className="flex items-center gap-2 font-bold">
                       <span className="text-slate-400 line-through text-[9px] md:text-sm">₹{globalSettings?.mrpPrice || '499'}</span>
                       <span className="text-red-500 text-[9px] md:text-sm font-black italic">{globalSettings?.discountPercent || '85'}% OFF</span>
                    </div>
                    <div className="bg-emerald-50 text-emerald-600 px-3 py-1 md:px-6 md:py-2 rounded-full text-xs md:text-2xl font-black border-2 border-emerald-200">
                      ₹{sellingPrice}
                    </div>
                  </div>

                  {/* Action Button */}
                  <button 
                    onClick={() => navigate(`/course/${course.id}`)}
                    className="w-full bg-[#0F172A] text-white py-3 md:py-5 rounded-xl font-black text-[10px] md:text-base uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
                  >
                    {isPurchased ? "OWNED ✅" : "GET FULL ACCESS"}
                  </button>
                </div>

                {/* Zap Badge */}
                <div className={`absolute -top-2 -right-2 p-1.5 md:p-3 rounded-xl shadow-lg border-2 border-white rotate-12 ${pureGold}`}>
                   <Zap size={12} className="text-slate-900 md:w-5 md:h-5 fill-slate-900" />
                </div>
              </div>
            );
          })}
        </div>

        {/* ✅ Bottom Info Grid (Simplified) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Blogs */}
          <div className="bg-white p-5 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm">
             <h3 className="text-sm md:text-xl font-black text-slate-900 mb-6 flex items-center gap-2 uppercase italic">
                <Sparkles size={20} className="text-purple-600" /> Trending Updates
             </h3>
             <div className="space-y-3">
                {(globalSettings?.relatedBlogs || []).slice(0, 3).map((item: any, i: number) => (
                  <div key={i} onClick={() => window.open(item.url, '_blank')} className="cursor-pointer p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between group">
                    <span className="text-[12px] md:text-base font-bold text-slate-700 line-clamp-1">{item.title}</span>
                    <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                  </div>
                ))}
             </div>
          </div>

          {/* Links */}
          <div className="bg-white p-5 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm">
             <h3 className="text-sm md:text-xl font-black text-slate-900 mb-6 flex items-center gap-2 uppercase italic">
                <Tag size={20} className="text-blue-600" /> Quick Access
             </h3>
             <div className="grid grid-cols-1 gap-3">
                {(globalSettings?.shopUpdates || []).slice(0, 3).map((item: any, i: number) => (
                  <div key={i} onClick={() => window.open(item.url, '_blank')} className="cursor-pointer p-4 bg-blue-600 text-white rounded-2xl flex items-center justify-between font-black text-xs md:text-base italic tracking-tight">
                    <span className="truncate pr-4">{item.title}</span>
                    <ExternalLink size={16} />
                  </div>
                ))}
             </div>
          </div>
        </div>
{/* ✅ SEO FIX: Internal Links Section (Fixes 'No outgoing links' and 'Orphan page' error) */}
        <div className="bg-blue-50/50 p-6 md:p-8 rounded-[2rem] border border-blue-100 shadow-sm mt-8">
          <h2 className="text-sm md:text-xl font-black text-slate-800 mb-5 uppercase tracking-tight flex items-center gap-2">
            <ShoppingCart size={20} className="text-blue-600" aria-hidden="true" /> Explore More on StudyGyaan
          </h2>
          <div className="flex flex-wrap gap-3">
            <a href="/govt-jobs" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Latest Govt Jobs</a>
            <a href="/free-study-material" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Free Study Material</a>
            <a href="/test" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Free Mock Tests</a>
            <a href="/blog" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Sarkari Yojana & Blogs</a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Shop;