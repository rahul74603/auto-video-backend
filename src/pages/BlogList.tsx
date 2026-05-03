// @ts-nocheck
import { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Clock, Flame, TrendingUp, BookOpen, Tag, ExternalLink, ShoppingCart } from 'lucide-react';
import { Helmet } from 'react-helmet-async'; // ✅ Helmet Import

const BlogList = () => {
  const [blogs, setBlogs] = useState<any[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // 🚀 पेज लोड होते ही डिफ़ॉल्ट टाइटल सेट करें
    document.title = "StudyGyaan Hub - Latest Updates & Notes 2026";

    const loadAllData = async () => {
      try {
        const q = query(collection(db, "blogs"), orderBy("date", "desc"));
        const querySnapshot = await getDocs(q);
        const blogData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBlogs(blogData);

        const settingsRef = doc(db, "site_settings", "global");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setGlobalSettings(settingsSnap.data());
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
    window.scrollTo(0, 0);
  }, []);

  const sellingPrice = Math.round(
    Number(globalSettings?.mrpPrice || 499) * (1 - Number(globalSettings?.discountPercent || 85) / 100)
  );

  // ✅ Colorful Boxes Configuration
  const loopColors = [
    { bg: "bg-rose-50", border: "border-rose-200 hover:border-rose-400", text: "text-rose-900", iconText: "text-rose-600" },
    { bg: "bg-blue-50", border: "border-blue-200 hover:border-blue-400", text: "text-blue-900", iconText: "text-blue-600" },
    { bg: "bg-emerald-50", border: "border-emerald-200 hover:border-emerald-400", text: "text-emerald-900", iconText: "text-emerald-600" },
    { bg: "bg-amber-50", border: "border-amber-200 hover:border-amber-400", text: "text-amber-900", iconText: "text-amber-600" },
    { bg: "bg-purple-50", border: "border-purple-200 hover:border-purple-400", text: "text-purple-900", iconText: "text-purple-600" }
  ];

  const trendingUpdates = (globalSettings?.relatedBlogs || []).slice(0, 5); 
  const pageQuickLinks = globalSettings?.sidebarLinks || [];

  if (loading || !globalSettings) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[40vh] font-hindi text-blue-600 font-bold text-xs animate-pulse">
        लोडिंग... 🚀
      </div>
    );
  }

  return (
    <div className="bg-[#F8FAFC] min-h-screen pb-16 font-hindi antialiased">
      
      {/* ✅ SEO HELMET: ब्राउज़र टैब और गूगल के लिए */}
      <Helmet>
        <title>StudyGyaan Hub - Latest Educational Blogs & Notes 2026</title>
        <meta name="description" content="Stay updated with the latest educational news, exam tips, and free study materials on StudyGyaan Hub." />
        <meta property="og:title" content="StudyGyaan Hub - Educational Updates" />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white py-4 md:py-8 px-2 text-center mb-3 shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-[15px] md:text-3xl font-black mb-0.5 flex items-center justify-center gap-1.5">
            StudyGyaan Hub <Flame className="w-3.5 h-3.5 md:w-5 md:h-5 text-orange-500" />
          </h1>
          <p className="text-[7px] md:text-xs opacity-75 uppercase tracking-tighter font-bold">Daily Updates • Notes • Papers</p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-2 md:px-4">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-start">
          
          {/* बायीं तरफ: ब्लॉग ग्रिड (65%) */}
          <div className="w-full md:w-[65%]">
            {blogs.length === 0 ? (
              <p className="text-center text-sm py-10 text-slate-400 font-bold">कोई लेख नहीं मिला।</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
                {blogs.map((blog) => (
                  <Link to={`/blog/${blog.id}`} key={blog.id} className="group">
                    <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col h-full">
                      <div className="h-32 md:h-44 overflow-hidden relative">
                        <img src={blog.imageUrl || 'https://via.placeholder.com/400x300'} alt={blog.title || "StudyGyaan Blog"} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        <div className="absolute top-2 left-2 bg-blue-600/90 backdrop-blur-md text-white text-[8px] md:text-[10px] font-black px-2.5 py-1 rounded-md uppercase shadow-lg">{blog.category || 'New'}</div>
                      </div>
                      <div className="p-3 md:p-4 flex-grow flex flex-col justify-between">
                        <h2 className="text-[12px] md:text-[15px] font-black text-slate-800 line-clamp-2 leading-snug mb-3 group-hover:text-blue-600 transition-colors">{blog.title}</h2>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                           <span className="text-[9px] md:text-[11px] text-slate-400 font-bold flex items-center gap-1">
                             <Clock size={12} className="md:w-3.5 md:h-3.5" /> {blog.date ? new Date(blog.date.seconds * 1000).toLocaleDateString('hi-IN') : 'Recent'}
                           </span>
                           <ArrowRight size={14} className="text-blue-500 md:w-4 md:h-4 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ✅ दायीं तरफ: साइडबार (Fixed Height, Big Font, Colorful Boxes) */}
          <aside className="w-full md:w-[35%] space-y-4 md:space-y-6 sticky top-12">
            
            {/* Trending Links Section */}
            {trendingUpdates.length > 0 && (
              <div className="bg-white/80 backdrop-blur-xl p-4 md:p-6 rounded-2xl md:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-100 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
                  <h3 className="text-sm md:text-lg font-black text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center gap-2 relative z-10">
                    <Sparkles size={18} className="text-purple-600 animate-pulse" /> 
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-700 to-pink-600">ट्रेंडिंग आर्टिकल्स 🔥</span>
                  </h3>
                  
                  <ul className="space-y-3 relative z-10">
                      {trendingUpdates.map((item: any, index: number) => {
                          const style = loopColors[index % loopColors.length];
                          return (
                            <li 
                              key={index} 
                              onClick={() => item.url && window.open(item.url, '_blank')} 
                              className={`group cursor-pointer border-2 ${style.border} ${style.bg} p-3 md:p-4 rounded-xl md:rounded-2xl transition-all hover:-translate-y-1 shadow-sm hover:shadow-md flex items-center justify-between`}
                            >
                                <div className="flex-1 pr-3">
                                    <span className={`block text-[13px] md:text-[16px] font-black ${style.text} line-clamp-2 min-h-[2.8em] leading-snug`}>
                                        {item.title || item.name}
                                    </span>
                                </div>
                                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-white shadow-sm shrink-0 group-hover:scale-110 transition-transform ${style.iconText}`}>
                                    <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />
                                </div>
                            </li>
                          );
                      })}
                  </ul>
              </div>
            )}

            {/* 🎯 COLORFUL QUICK LINKS */}
            {pageQuickLinks.length > 0 && (
              <div className="bg-white/80 backdrop-blur-xl p-4 md:p-6 rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-100 rounded-bl-full opacity-60 pointer-events-none"></div>
                  <h3 className="text-sm md:text-lg font-black text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center gap-2 relative z-10">
                     <Tag size={18} className="text-blue-600 animate-bounce" /> महत्वपूर्ण लिंक्स 🔗
                  </h3>
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
                                      <ExternalLink size={14} className="text-white md:w-4 md:h-4" />
                                   </div>
                                   <span className="font-black text-[12px] md:text-[15px] leading-snug tracking-wide pr-2">
                                       {item.title || item.name}
                                   </span>
                                </div>
                                <ArrowRight size={16} className="text-white/70 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0 ml-1 self-center" />
                             </li>
                          )
                      })}
                  </ul>
              </div>
            )}

            {/* Premium Notes Box */}
            <div className="p-4 md:p-6 bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 rounded-2xl md:rounded-[2rem] text-white shadow-2xl relative overflow-hidden border-b-4 border-black/20">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-all duration-700 pointer-events-none"></div>
                <p className="font-black text-[14px] md:text-xl mb-1.5 italic flex items-center gap-2 relative z-10 text-yellow-300">
                  <ShoppingCart size={18} className="md:w-5 md:h-5 animate-bounce" /> प्रीमियम नोट्स
                </p>
                <div className="flex items-center gap-2 mb-4 bg-white/10 p-2 md:p-3 rounded-xl border border-white/10 relative z-10 backdrop-blur-sm">
                    <span className="line-through text-white/50 text-[10px] md:text-[12px] font-bold">₹{globalSettings?.mrpPrice || 499}</span>
                    <div className="text-[14px] md:text-xl font-black text-yellow-400 ml-auto font-mono">₹{sellingPrice}</div>
                </div>
                <button onClick={() => navigate('/premium-notes')} className="w-full relative z-10 bg-yellow-400 text-blue-900 font-black py-2.5 md:py-3.5 rounded-xl md:rounded-2xl text-[12px] md:text-sm hover:bg-yellow-300 active:scale-95 shadow-xl transition-transform"> अभी खरीदें </button>
            </div>

          </aside>
        </div>
      </main>
    </div>
  );
};

export default BlogList;