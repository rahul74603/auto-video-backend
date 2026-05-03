// @ts-nocheck
import { useEffect, useState } from 'react';
import { db, auth } from '../firebase/config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { 
  BookOpen, ArrowRight, Loader2, ShoppingBag, Sparkles, 
  Tag, ExternalLink, Flame, ShoppingCart, Zap, CheckCircle2, GraduationCap, ArrowLeft
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import SEO from '../components/SEO'; 

const MyCourses = () => {
  const [myCourses, setMyCourses] = useState<any[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadDashboardData = async () => {
      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          try {
            setLoading(true);

            // 1. Fetch User Document (Direct access check)
            const userDocRef = doc(db, "users", currentUser.uid);
            const userSnap = await getDoc(userDocRef);
            
            if (userSnap.exists()) {
              const userData = userSnap.data();
              
              // 2. Filter keys that start with 'purchased_' and are true
              const purchasedCourseIds = Object.keys(userData)
                .filter(key => key.startsWith('purchased_') && userData[key] === true)
                .map(key => key.replace('purchased_', ''));

              // 3. Fetch details for each purchased course from 'courses' collection
              if (purchasedCourseIds.length > 0) {
                const coursePromises = purchasedCourseIds.map(async (courseId) => {
                  const courseSnap = await getDoc(doc(db, "courses", courseId));
                  if (courseSnap.exists()) {
                    return { id: courseSnap.id, ...courseSnap.data() };
                  }
                  return null;
                });

                const coursesResults = await Promise.all(coursePromises);
                setMyCourses(coursesResults.filter(c => c !== null));
              }
            }

            // 4. Fetch Global Settings for Sidebar
            const settingsSnap = await getDoc(doc(db, "site_settings", "global"));
            if (settingsSnap.exists()) {
              setGlobalSettings(settingsSnap.data());
            }
          } catch (error) {
            console.error("Dashboard Error:", error);
          } finally {
            setLoading(false);
          }
        } else {
          navigate('/');
        }
      });
      return unsubscribe;
    };
    loadDashboardData();
  }, [navigate]);

  const loopColors = [
    "from-indigo-400 to-blue-600 shadow-blue-500/20",
    "from-rose-400 to-pink-600 shadow-rose-500/20",
    "from-emerald-400 to-teal-600 shadow-emerald-500/20",
    "from-amber-400 to-orange-600 shadow-orange-500/20"
  ];

  const sellingPrice = Math.round(
    Number(globalSettings?.mrpPrice || 499) * (1 - Number(globalSettings?.discountPercent || 85) / 100)
  );

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500 font-black text-sm uppercase tracking-widest animate-pulse">आपका डैशबोर्ड खुल रहा है...</p>
      </div>
    );
  }

  return (
    <div className="pt-16 md:pt-20 pb-16 md:pb-24 bg-[#F8FAFC] min-h-screen font-hindi antialiased">
      
      <SEO 
        customTitle="My Study Material & Purchased Courses | StudyGyaan"
        customDescription="Access your purchased premium notes and courses on StudyGyaan."
      />
      
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-2 md:px-8">
        
        {/* Header Section */}
        <div className="mb-8 md:mb-12">
          <h2 className="text-2xl md:text-5xl font-black text-slate-900 flex items-center gap-3">
            <GraduationCap className="text-blue-600 w-8 h-8 md:w-14 md:h-14" /> 
            मेरे <span className="text-blue-600">नोट्स और कोर्स</span>
          </h2>
          <div className="h-1.5 w-20 bg-blue-600 mt-3 rounded-full"></div>
        </div>

        <div className="flex flex-row gap-3 md:gap-8 items-start">
          
          <div className="w-[60%] md:w-[68%] min-w-0">
            {myCourses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 md:py-24 bg-white rounded-2xl md:rounded-[3rem] border-2 border-dashed border-slate-200 shadow-sm px-4">
                <div className="bg-blue-50 p-6 rounded-full mb-6">
                  <ShoppingBag className="w-12 h-12 text-blue-400" />
                </div>
                <h3 className="text-lg md:text-3xl font-black text-slate-800 mb-2">अभी तक कुछ नहीं खरीदा!</h3>
                <p className="text-[10px] md:text-lg text-slate-500 text-center mb-8 font-bold opacity-70">
                  अपनी तैयारी को मज़बूत करने के लिए आज ही प्रीमियम बंडल चुनें।
                </p>
                <button 
                  onClick={() => navigate('/premium-notes')} 
                  className="bg-blue-600 hover:bg-slate-900 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl shadow-blue-200 flex items-center gap-2 active:scale-95 text-xs md:text-lg"
                >
                  प्रीमियम बंडल देखें <ArrowRight size={20}/>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
                {myCourses.map((item) => (
                  <div key={item.id} className="relative group bg-white p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] shadow-sm hover:shadow-xl transition-all border border-slate-100 flex flex-col h-[200px] md:h-[320px] active:scale-95 cursor-pointer" onClick={() => navigate(`/course/${item.id}`)}>
                    
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 md:w-16 md:h-16 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shadow-inner group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <BookOpen size={24} className="md:w-8 md:h-8" />
                      </div>
                      <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full border border-emerald-100">
                        <CheckCircle2 size={12} />
                        <span className="text-[9px] md:text-xs font-black uppercase tracking-tighter">अनलॉक है</span>
                      </div>
                    </div>
                    
                    <h3 className="text-[13px] md:text-2xl font-black text-slate-800 mb-1 leading-tight line-clamp-2 uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-[9px] md:text-sm text-slate-400 font-bold mb-4">Full Premium Access</p>
                    
                    <div className="mt-auto flex items-center justify-between pt-4 border-t border-dashed border-slate-100">
                       <span className="text-blue-600 font-black text-[10px] md:text-base flex items-center gap-1">पढ़ना शुरू करें <ArrowRight size={14} /></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="w-[40%] md:w-[32%] space-y-4 md:space-y-8 sticky top-12 md:top-16">
            
            {globalSettings?.relatedBlogs && (
              <div className="bg-white p-3 md:p-6 rounded-2xl md:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-bl-full opacity-40"></div>
                  <h3 className="text-[10px] md:text-base font-black text-slate-900 mb-4 border-b border-slate-50 pb-2 flex items-center gap-2 relative z-10">
                    <Sparkles size={16} className="text-blue-600 animate-pulse" /> नए अपडेट्स 🔥
                  </h3>
                  <ul className="space-y-3 md:space-y-4 relative z-10 font-black">
                      {globalSettings.relatedBlogs.map((b: any, i: number) => (
                          <li key={i} onClick={() => window.open(b.url, '_blank')} className={`bg-gradient-to-r ${loopColors[i % loopColors.length]} p-[0.8px] rounded-lg cursor-pointer active:scale-95 shadow-sm`}>
                              <div className="bg-white p-2 md:p-3 rounded-[7px] text-[9px] md:text-[11.5px] text-slate-800 line-clamp-2 leading-tight">
                                  {b.title}
                              </div>
                          </li>
                      ))}
                  </ul>
              </div>
            )}

            <div className="p-4 md:p-8 bg-gradient-to-br from-slate-900 to-blue-900 rounded-2xl md:rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl group-hover:scale-150 transition-all duration-1000"></div>
                <Zap size={24} className="text-yellow-400 mb-3 animate-pulse" />
                <h4 className="text-xs md:text-xl font-black mb-1">मिस न करें! 🚀</h4>
                <p className="text-[8.5px] md:text-sm opacity-70 mb-6 font-bold leading-tight">बाकी विषयों के प्रीमियम नोट्स पर अभी भारी डिस्काउंट चल रहा है।</p>
                <div className="flex items-center gap-2 mb-6 bg-white/10 p-2 md:p-3 rounded-2xl border border-white/10 backdrop-blur-md">
                    <span className="text-[13px] md:text-2xl font-black text-yellow-400">₹{sellingPrice} Only</span>
                </div>
                <button onClick={() => navigate('/premium-notes')} className="w-full bg-white text-blue-900 font-black py-3 rounded-xl text-[10px] md:text-base hover:bg-yellow-400 transition-all active:scale-95"> स्टोर देखें </button>
            </div>

           <div className="bg-emerald-50 border-2 border-emerald-100 p-4 md:p-6 rounded-[2rem] text-center">
                <Flame size={24} className="text-orange-500 mx-auto mb-2 animate-pulse" />
                <p className="text-[10px] md:text-sm font-black text-emerald-900 mb-4">एक्सेस में दिक्कत है? <br/>घबराएं नहीं, हम यहाँ हैं!</p>
                <button onClick={() => window.open('https://wa.me/916263396446', '_blank')} className="w-full bg-emerald-600 text-white font-black py-2.5 rounded-xl text-[10px] md:text-sm flex items-center justify-center gap-2">
                    <ShoppingCart size={14} /> WhatsApp Support
                </button>
            </div>

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

export default MyCourses;