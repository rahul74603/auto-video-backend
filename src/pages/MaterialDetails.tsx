// @ts-nocheck
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  FileText, Download, ArrowLeft, Info, Sparkles, 
  Tag, ExternalLink, ShoppingCart, Flame, ArrowRight, User, Calendar, BookOpen, CheckCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

const MaterialDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<any>(null);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAllData = async () => {
      if (!id) return;
      try {
        setLoading(true);
        // 1. Fetch Material Detail
        const docRef = doc(db, "study_materials", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const materialData = docSnap.data();
          setItem(materialData);
          // पुराना document.title यहाँ से हटा दिया गया है
        }

        // 2. Fetch Global Settings for Sidebar
        const settingsSnap = await getDoc(doc(db, "site_settings", "global"));
        if (settingsSnap.exists()) {
          setGlobalSettings(settingsSnap.data());
        } else {
          setGlobalSettings({
            relatedBlogs: [],
            sidebarLinks: [],
            mrpPrice: "499",
            discountPercent: "85"
          });
        }
      } catch (err) {
        console.error("Error loading PDF details:", err);
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

  const loopColors = [
    "from-rose-400 to-pink-600 shadow-rose-500/30",
    "from-blue-400 to-indigo-600 shadow-blue-500/30",
    "from-emerald-400 to-teal-600 shadow-emerald-500/30",
    "from-amber-400 to-orange-600 shadow-orange-500/30"
  ];

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-white"><div className="animate-spin h-10 w-10 border-4 border-blue-600 rounded-full border-t-transparent shadow-lg"></div></div>;

  if (!item) return (
    <div className="pt-24 md:pt-40 text-center px-4 font-hindi">
      <p className="text-sm md:text-xl font-black text-slate-400 mb-6">नोट्स नहीं मिल पाए! 🥲</p>
      <Button onClick={() => navigate('/free-study-material')} className="bg-blue-600 text-white font-black px-8 py-4 rounded-xl shadow-lg h-auto">वापस लाइब्रेरी जाएं</Button>
    </div>
  );

  return (
    <div className="pt-16 md:pt-20 pb-16 md:pb-24 bg-[#F8FAFC] min-h-screen font-hindi antialiased">
      
      {/* 🔥 नया डायनामिक SEO टैग जो PDF का नाम और फोटो गूगल/WhatsApp पर दिखाएगा */}
      <SEO 
        customTitle={`${item.title} - Free PDF Download | StudyGyaan 2026`}
        customDescription={item.description || `Download free PDF: ${item.title} for your exam preparation. Best high-quality study notes on StudyGyaan.`}
        customUrl={`https://studygyaan.in/free-study-material/${id}`}
        customImage="https://studygyaan.in/og-image.jpg"
      />

      <div className="max-w-7xl mx-auto px-2 md:px-8">
        
        <button onClick={() => navigate('/free-study-material')} className="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 font-black mb-4 transition-all text-[11px] md:text-base bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
          <ArrowLeft className="w-4 h-4 md:w-5 md:h-5"/> पूरी लाइब्रेरी देखें
        </button>

        <div className="flex flex-row gap-2 md:gap-8 items-start">
          
          <div className="w-[60%] md:w-[68%] min-w-0">
            
            <article className="bg-white rounded-xl md:rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
              
              <div className="p-3 md:p-10 border-b border-slate-50">
                <div className="flex items-start gap-3 md:gap-6">
                  <div className="p-2.5 md:p-6 bg-red-50 rounded-xl md:rounded-[2rem] text-red-500 shrink-0 shadow-inner">
                    <FileText className="w-8 h-8 md:w-16 md:h-16" />
                  </div>
                  <div className="min-w-0">
                    <span className="bg-blue-50 text-blue-600 text-[7px] md:text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest mb-1.5 inline-block">Official Study Material</span>
                    <h1 className="text-[14px] md:text-4xl font-black text-slate-900 leading-tight mb-2 md:mb-4 uppercase tracking-tight">
                      {item.title}
                    </h1>
                    <div className="flex items-center gap-1.5 md:gap-3 text-slate-400 text-[8.5px] md:text-base font-bold">
                        <User size={14} className="text-blue-500" /> Rahul Sir 
                        <span className="opacity-30">•</span>
                        <Tag size={14} className="text-blue-500" /> {item.subject || "General Study"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 md:p-10 space-y-4 md:space-y-8">
                
                <div className="bg-slate-50 rounded-xl md:rounded-2xl p-3 md:p-8 border border-slate-100">
                   <div className="flex justify-between items-center text-[10px] md:text-lg border-b border-slate-200 pb-2 md:pb-4 mb-2 md:mb-4">
                      <span className="text-slate-400 font-black uppercase tracking-tighter">Document Format</span>
                      <span className="font-black text-slate-800">PDF Document</span>
                   </div>
                   <div className="flex justify-between items-center text-[10px] md:text-lg">
                      <span className="text-slate-400 font-black uppercase tracking-tighter">File Status</span>
                      <span className="font-black text-green-600 bg-green-50 px-2 py-0.5 rounded">Free Access ✅</span>
                   </div>
                </div>

                <div className="flex gap-2.5 md:gap-4 p-3 md:p-6 bg-blue-50 rounded-xl border border-blue-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-blue-100 rounded-bl-full opacity-50 group-hover:scale-110 transition-transform"></div>
                  <Info className="text-blue-500 shrink-0 mt-0.5 w-4 h-4 md:w-7 md:h-7" />
                  <p className="text-[9px] md:text-lg text-blue-800 leading-snug font-bold relative z-10">
                    यह स्टडी मटेरियल विशेष रूप से StudyGyaan के छात्रों के लिए तैयार किया गया है। आप इसे नीचे दिए गए सुरक्षित बटन से डाउनलोड कर सकते हैं।
                  </p>
                </div>

                <div className="py-4">
                  <Button 
                    onClick={() => window.open(item.applyLink, '_blank')}
                    className="w-full py-5 md:py-12 bg-blue-600 hover:bg-slate-900 text-white font-black text-[12px] md:text-3xl rounded-xl md:rounded-[2.5rem] shadow-xl shadow-blue-200 flex items-center justify-center gap-2 md:gap-4 transition-all h-auto group active:scale-95"
                  >
                    Download PDF Now <Download className="w-5 h-5 md:w-10 md:h-10 group-hover:animate-bounce" />
                  </Button>
                </div>

                <div className="text-center">
                   <p className="text-slate-400 text-[8px] md:text-sm font-bold uppercase tracking-widest">
                     © {new Date().getFullYear()} StudyGyaan.in - Free High-Quality Education
                   </p>
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
            </article>
          </div>

          <aside className="w-[40%] md:w-[32%] space-y-3 md:space-y-6 sticky top-12 md:top-16">
            
            {globalSettings?.relatedBlogs && (
              <div className="bg-white p-2 md:p-5 rounded-xl md:rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full opacity-40"></div>
                  <h3 className="text-[10px] md:text-base font-black text-slate-900 mb-3 border-b border-slate-50 pb-2 flex items-center gap-1.5 relative z-10">
                    <Sparkles size={14} className="text-purple-600 animate-pulse" /> ट्रेंडिंग टॉपिक्स 🔥
                  </h3>
                  <ul className="space-y-2 md:space-y-3 relative z-10 font-black">
                      {globalSettings.relatedBlogs.map((b: any, i: number) => (
                          <li key={i} onClick={() => window.open(b.url, '_blank')} className={`bg-gradient-to-r ${loopColors[i % loopColors.length]} p-[0.8px] rounded-lg cursor-pointer active:scale-95 shadow-sm`}>
                              <div className="bg-white p-1.5 md:p-3 rounded-[7px] text-[8.5px] md:text-[11.5px] text-slate-800 line-clamp-2 leading-tight">
                                  {b.title}
                              </div>
                          </li>
                      ))}
                  </ul>
              </div>
            )}

            <div className="p-3 md:p-6 bg-gradient-to-br from-indigo-700 via-blue-800 to-slate-900 rounded-xl md:rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-all duration-700"></div>
                <p className="font-black text-[11px] md:text-lg mb-1 flex items-center gap-2 text-yellow-300">
                  <ShoppingCart size={14} className="animate-bounce" /> प्रीमियम नोट्स
                </p>
                <p className="text-[8px] md:text-xs opacity-80 mb-4 leading-tight font-bold">सिलेक्शन पक्का करने वाले ब्रह्मास्त्र नोट्स। आज ही अनलॉक करें!</p>
                <div className="flex items-center gap-1.5 mb-4 bg-white/10 p-2 rounded-xl border border-white/10 backdrop-blur-sm">
                    <span className="line-through text-white/40 text-[7px] md:text-[11px] font-bold">₹{globalSettings?.mrpPrice || '499'}</span>
                    <div className="text-[11px] md:text-xl font-black text-yellow-400 ml-auto font-mono">₹{sellingPrice}</div>
                </div>
                <button onClick={() => navigate('/premium-notes')} className="w-full bg-yellow-400 text-blue-900 font-black py-2 md:py-4 rounded-xl text-[9px] md:text-sm hover:bg-white transition-all shadow-xl"> अभी पाएँ ➔ </button>
            </div>

            <div className="bg-white p-2 md:p-5 rounded-xl md:rounded-3xl shadow-sm border border-slate-100 hidden sm:block">
              <h3 className="text-[10px] md:text-sm font-black text-slate-900 mb-3 border-b border-slate-50 pb-2 flex items-center gap-1.5">
                <Tag size={12} className="text-blue-600" /> महत्वपूर्ण लिंक्स
              </h3>
              <ul className="space-y-2">
                {globalSettings?.sidebarLinks?.map((item: any, index: number) => (
                  <li key={index} onClick={() => item.url && window.open(item.url, '_blank')} className="flex items-center justify-between p-2 md:p-3 bg-slate-50 rounded-xl hover:bg-blue-50 transition-all cursor-pointer border border-transparent hover:border-blue-100">
                    <span className="text-slate-600 font-black text-[9px] md:text-[11px] truncate pr-1">{item.name}</span>
                    <ExternalLink size={10} className="text-slate-300" />
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-emerald-50 border-2 border-dashed border-emerald-200 p-4 rounded-2xl text-center">
                <Flame size={20} className="text-orange-500 mx-auto mb-1 animate-pulse" />
                <p className="text-[10px] md:text-sm font-black text-emerald-800 leading-tight">कोई सवाल है? <br/><a href="https://wa.me/916263396446" target="_blank" className="text-blue-600 hover:underline">यहाँ क्लिक करें</a></p>
            </div>

          </aside>
        </div>
      </div>
    </div>
  );
};

export default MaterialDetails;