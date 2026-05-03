// @ts-nocheck
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config'; 
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore'; 
import { Calendar, User, Tag, Clock, ChevronLeft, Share2, ExternalLink, Flame, ShoppingCart, ArrowRight, BookOpen, Sparkles, FileSearch } from 'lucide-react';
import { toast } from 'sonner';
import SEO from '../components/SEO'; 

const BlogPost = () => {
  const { id } = useParams();
  const [blog, setBlog] = useState<any>(null);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [voted, setVoted] = useState(false); 
  const navigate = useNavigate();

  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);
        if (id) {
          const blogRef = doc(db, "blogs", id);
          const blogSnap = await getDoc(blogRef);
          
          if (blogSnap.exists()) {
            const blogData = blogSnap.data();
            setBlog(blogData);
          }

          const settingsRef = doc(db, "site_settings", "global");
          const settingsSnap = await getDoc(settingsRef);
          
          if (settingsSnap.exists()) {
            setGlobalSettings(settingsSnap.data());
          } else {
            setGlobalSettings({
              sidebarLinks: [
                { name: "New Govt Job Details", url: "#" },
                { name: "Best Free Study Materials", url: "#" }
              ],
              relatedBlogs: [
                { title: "SSC CGL 2024: पूरी जानकारी और सिलेबस", url: "#" },
                { title: "रेलवे ग्रुप D: पिछले साल के पेपर डाउनलोड करें", url: "#" }
              ],
              premiumBoxTitle: "Premium Material Notes",
              premiumBoxDesc: "100% सफलता के लिए श्रेणी-वार महत्वपूर्ण सवालों का असली संग्रह।",
              bottomBarText: "📢 Premium Notes: पिछले 10 साल के रिपीटेड सवालों का पूरा बंडल",
              premiumPrice: "69",
              mrpPrice: "499",
              discountPercent: "85"
            });
          }
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
    window.scrollTo(0, 0);
  }, [id]);

  const sellingPrice = Math.round(
    Number(globalSettings?.mrpPrice || 499) * (1 - Number(globalSettings?.discountPercent || 85) / 100)
  );

  const handleFeedback = async (type: 'yes' | 'no') => {
    if (voted) return toast.info("आप पहले ही अपनी राय दे चुके हैं!");
    
    try {
      const docRef = doc(db, "blogs", id!);
      await updateDoc(docRef, {
        [type === 'yes' ? 'real_likes' : 'real_dislikes']: increment(1)
      });
      setVoted(true);
      toast.success("फीडबैक देने के लिए धन्यवाद! आपकी राय सुरक्षित है।");
    } catch (err) {
      toast.error("फीडबैक सेव नहीं हो सका।");
    }
  };

  const loopColors = [
    { bg: "bg-rose-50", border: "border-rose-200 hover:border-rose-400", text: "text-rose-900", iconText: "text-rose-600" },
    { bg: "bg-blue-50", border: "border-blue-200 hover:border-blue-400", text: "text-blue-900", iconText: "text-blue-600" },
    { bg: "bg-emerald-50", border: "border-emerald-200 hover:border-emerald-400", text: "text-emerald-900", iconText: "text-emerald-600" },
    { bg: "bg-amber-50", border: "border-amber-200 hover:border-amber-400", text: "text-amber-900", iconText: "text-amber-600" },
    { bg: "bg-purple-50", border: "border-purple-200 hover:border-purple-400", text: "text-purple-900", iconText: "text-purple-600" }
  ];

  const sidebarUpdates = (globalSettings?.relatedBlogs || []).slice(0, 5);
  const pageQuickLinks = globalSettings?.sidebarLinks || [];

  if (loading || !globalSettings) return <div className="flex justify-center items-center min-h-screen font-hindi text-blue-600 font-bold text-sm">प्रोफेशनल डेटा लोड हो रहा है... 🔍</div>;
  if (!blog) return <div className="text-center py-10 font-hindi text-sm font-bold text-gray-500">लेख नहीं मिला! 🥲</div>;

  // 🔥 ARTICLE SCHEMA FOR GOOGLE DISCOVER / SEARCH 🔥
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://studygyaan.in/blog/${id}`
    },
    "headline": blog.title,
    "description": blog.description || `Read full article about ${blog.title} on StudyGyaan. Best educational materials and updates.`,
    "image": blog.imageUrl || "https://studygyaan.in/og-image.jpg",
    "author": {
      "@type": "Person",
      "name": blog.author || "Rahul Sir",
      "url": "https://studygyaan.in/about-us"
    },
    "publisher": {
      "@type": "Organization",
      "name": "StudyGyaan",
      "logo": {
        "@type": "ImageObject",
        "url": "https://studygyaan.in/logo.png"
      }
    },
    "datePublished": blog.date?.seconds ? new Date(blog.date.seconds * 1000).toISOString() : new Date().toISOString(),
    "dateModified": blog.date?.seconds ? new Date(blog.date.seconds * 1000).toISOString() : new Date().toISOString()
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-hindi antialiased pb-16 md:pb-20">
      
      {/* 🔥 DYNAMIC SEO TAGS */}
      <SEO 
        customTitle={`${blog.title} - StudyGyaan 2026`}
        customDescription={blog.description || `Read full article about ${blog.title} on StudyGyaan. Best educational materials and updates.`}
        customUrl={`https://studygyaan.in/blog/${id}`}
        customImage={blog.imageUrl || "https://studygyaan.in/og-image.jpg"}
      />

      {/* 🔥 JSON-LD INJECTION */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-3 md:px-6 h-12 md:h-14 flex items-center justify-between shadow-sm">
        <button onClick={() => navigate(-1)} className="flex items-center text-slate-600 hover:text-blue-600 font-bold transition-colors text-xs md:text-sm bg-slate-100/50 px-2.5 py-1.5 rounded-lg border border-slate-200">
          <ChevronLeft className="w-4 h-4 md:w-5 md:h-5 mr-1" aria-hidden="true" /> वापस जाएँ
        </button>
        <div className="text-blue-700 font-black text-base md:text-lg tracking-tight">StudyGyaan</div>
        <div className="w-8 md:w-10"></div> 
      </nav>

      <header className="relative w-full h-[25vh] md:h-[40vh] bg-slate-900 overflow-hidden">
<img 
  src={blog.imageUrl || 'https://via.placeholder.com/1200x600'} 
  className="w-full h-full object-cover opacity-30" 
  alt={blog.title || "StudyGyaan Blog Banner"} 
  fetchPriority="high" 
/>
        <div className="absolute inset-0 bg-gradient-to-t from-[#F8FAFC] via-slate-900/50 to-transparent"></div>
        <div className="absolute bottom-0 left-0 w-full p-4 md:p-8 text-left">
          <div className="max-w-7xl mx-auto px-2 md:px-4">
            <span className="bg-blue-600 text-white text-[9px] md:text-xs font-black px-2 py-1 rounded-md uppercase tracking-tighter mb-2 md:mb-4 inline-block shadow-md">
              Official Study Material
            </span>
            {/* ✅ SEO FIX: H1 Tag for Main Title */}
            <h1 className="text-xl md:text-4xl font-black text-slate-900 leading-[1.2] break-words max-w-4xl drop-shadow-md">
              {blog.title}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 md:px-4 py-4 md:py-8 relative z-20">
        
        <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-start">
          
          <div className="w-full md:w-[65%] min-w-0">
            <article className="bg-white rounded-2xl md:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
              
              <div className="flex flex-wrap items-center gap-2 md:gap-4 p-3 md:p-5 border-b border-slate-100 text-slate-600 text-[10px] md:text-sm font-bold bg-slate-50/50">
                <div className="flex items-center bg-white px-2.5 py-1.5 rounded-lg shadow-sm border border-slate-200"><User className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-1.5 text-blue-500" aria-hidden="true" /> {blog.author || "Rahul Sir"}</div>
                <div className="flex items-center bg-white px-2.5 py-1.5 rounded-lg shadow-sm border border-slate-200"><Calendar className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-1.5 text-blue-500" aria-hidden="true" /> {blog.date ? new Date(blog.date.seconds * 1000).toLocaleDateString('hi-IN') : new Date().toLocaleDateString('hi-IN')}</div>
                <div className="flex items-center bg-orange-50 text-orange-700 px-2.5 py-1.5 rounded-lg shadow-sm border border-orange-200"><Clock className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-1.5" aria-hidden="true" /> 10 साल का निचोड़</div>
              </div>

              <div className="p-4 md:p-8">
                <div 
                  className="
                    prose prose-sm md:prose-base max-w-none 
                    text-slate-700 
                    [&_p]:!text-left [&_span]:!text-left [&_div]:!text-left
                    [word-break:break-word]
                    prose-p:leading-relaxed prose-p:mb-5
                    prose-strong:text-blue-900 prose-strong:font-black
                    prose-headings:text-slate-900 prose-headings:font-black prose-headings:mb-3 
                    prose-ul:space-y-2 prose-ul:mb-5 prose-li:marker:text-blue-500
                    prose-img:rounded-xl md:prose-img:rounded-2xl prose-img:shadow-md
                  "
                  dangerouslySetInnerHTML={{ __html: blog.content }} 
                />

                <section className="mt-8 md:mt-12 p-4 md:p-6 bg-blue-50/50 rounded-xl md:rounded-3xl border border-blue-100 text-center shadow-inner">
                  {/* ✅ SEO FIX: Replaced h4 with h3 for Semantic HTML */}
                  <h3 className="text-[12px] md:text-base font-black text-slate-800 mb-3 md:mb-5">क्या यह आर्टिकल आपके लिए फायदेमंद रहा?</h3>
                  <div className="flex justify-center gap-3 md:gap-5">
                    <button onClick={() => handleFeedback('yes')} className={`px-4 py-2 md:px-8 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-sm font-black transition-all shadow-md flex items-center gap-2 ${voted ? 'bg-slate-200 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'}`}> हाँ 👍 </button>
                    <button onClick={() => handleFeedback('no')} className={`px-4 py-2 md:px-8 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-sm font-black transition-all shadow-md flex items-center gap-2 ${voted ? 'bg-slate-200 text-slate-400' : 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50 active:scale-95'}`}> नहीं 👎 </button>
                  </div>
                  {voted && <p className="mt-3 md:mt-4 text-[9px] md:text-xs text-blue-600 font-bold bg-white inline-block px-3 py-1.5 rounded-full shadow-sm border border-blue-100">आपकी राय सेव कर ली गई है। धन्यवाद!</p>}
                </section>
                {/* ✅ SEO FIX: Internal Links Section (Fixes 'No outgoing links' and 'Orphan page' error) */}
                <div className="bg-blue-50/50 p-6 md:p-8 rounded-[2rem] border border-blue-100 shadow-sm mt-8">
                  <h2 className="text-sm md:text-xl font-black text-slate-800 mb-5 uppercase tracking-tight flex items-center gap-2">
                    <FileSearch size={20} className="text-blue-600" aria-hidden="true" /> Explore More on StudyGyaan
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

          <aside className="w-full md:w-[35%] space-y-4 md:space-y-6 sticky top-12 md:top-16">
            
             {sidebarUpdates.length > 0 && (
              <section className="bg-white/80 backdrop-blur-xl p-4 md:p-6 rounded-2xl md:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-100 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
                  {/* ✅ SEO FIX: Replaced h3 with h2 for Sidebar Semantic HTML */}
                  <h2 className="text-sm md:text-lg font-black text-slate-900 mb-4 flex items-center relative z-10 border-b border-slate-100 pb-3">
                    <Sparkles className="w-4 h-4 md:w-5 md:h-5 mr-1.5 md:mr-2 text-purple-600 animate-pulse" aria-hidden="true" /> 
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-700 to-pink-600"> ट्रेंडिंग आर्टिकल्स 🔥 </span>
                  </h2>
                  <ul className="space-y-3 relative z-10">
                      {sidebarUpdates.map((blogInfo: any, index: number) => {
                          if (!blogInfo.title) return null;
                          const style = loopColors[index % loopColors.length];
                          return (
                            <li 
                              key={index} 
                              onClick={() => blogInfo.url && window.open(blogInfo.url, '_blank')}
                              className={`group cursor-pointer border-2 ${style.border} ${style.bg} p-3 md:p-4 rounded-xl md:rounded-2xl transition-all hover:-translate-y-1 shadow-sm hover:shadow-md flex items-center justify-between`}
                            >
                                <div className="flex-1 pr-3">
                                    <span className={`block text-[13px] md:text-[16px] font-black ${style.text} line-clamp-2 min-h-[2.8em] leading-snug`}>
                                        {blogInfo.title}
                                    </span>
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
                  {/* ✅ SEO FIX: Replaced h3 with h2 */}
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

            <section className="p-4 md:p-6 bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 rounded-2xl md:rounded-[2rem] text-white shadow-2xl relative overflow-hidden border-b-4 border-black/20">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-all duration-700 pointer-events-none"></div>
                <div className="font-black text-[14px] md:text-xl mb-1.5 italic flex items-center gap-2 relative z-10 text-yellow-300">
                  <ShoppingCart size={18} className="md:w-5 md:h-5 animate-bounce" aria-hidden="true" /> {globalSettings.premiumBoxTitle}
                </div>
                <p className="text-[10px] md:text-xs opacity-90 mb-4 leading-relaxed relative z-10">{globalSettings.premiumBoxDesc}</p>
                
                <div className="flex items-center gap-2 mb-4 bg-white/10 p-2 md:p-3 rounded-xl border border-white/10 relative z-10 backdrop-blur-sm">
                    <span className="line-through text-white/50 text-[10px] md:text-[12px] font-bold">₹{globalSettings.mrpPrice}</span>
                    <span className="bg-red-500 text-white text-[8px] md:text-[10px] font-black px-2 py-0.5 rounded shadow-sm"> {globalSettings.discountPercent}% OFF </span>
                    <div className="text-[14px] md:text-xl font-black text-yellow-400 ml-auto font-mono">₹{sellingPrice}</div>
                </div>
                <button onClick={() => navigate('/premium-notes')} className="w-full relative z-10 bg-yellow-400 text-blue-900 font-black py-2.5 md:py-3.5 rounded-xl md:rounded-2xl text-[12px] md:text-sm hover:bg-yellow-300 active:scale-95 shadow-xl transition-transform"> अभी खरीदें </button>
            </section>
          </aside>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 py-2 px-3 md:py-3 md:px-4 z-[100] shadow-[0_-10px_30px_rgba(0,0,0,0.08)]">
        <div className="max-w-5xl mx-auto flex flex-row justify-between items-center gap-2">
          <div className="flex flex-col">
             <span className="text-[10px] md:text-xs font-black text-red-600 flex items-center gap-1 uppercase tracking-wider"> <Flame className="w-3 h-3 md:w-4 md:h-4 text-orange-500 animate-pulse" aria-hidden="true" /> OFFER: {globalSettings.discountPercent}% OFF </span>
             <span className="hidden md:inline text-[13px] font-bold text-slate-600 mt-1">{globalSettings.bottomBarText}</span>
             <span className="md:hidden text-[12px] font-black text-slate-900 mt-0.5">अनलॉक: ₹{sellingPrice}</span>
          </div>
          <button onClick={() => navigate('/premium-notes')} className="bg-blue-700 text-white font-black py-2 px-6 md:py-2.5 md:px-8 rounded-xl hover:bg-blue-800 transition-all shadow-lg shadow-blue-700/30 active:scale-95 flex items-center justify-center gap-1.5 text-[12px] md:text-sm"> <span className="hidden md:inline">सिर्फ ₹{sellingPrice} में अनलॉक करें</span> <span className="md:hidden">अनलॉक करें</span> <ArrowRight className="w-4 h-4" aria-hidden="true" /> </button>
        </div>
      </div>
    </div>
  );
};

export default BlogPost;