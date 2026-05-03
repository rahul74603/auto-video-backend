// @ts-nocheck
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  BookOpen, Download, ShoppingCart, ArrowLeft, FileText, 
  Sparkles, Tag, ExternalLink, Flame, ArrowRight, Star, ShieldCheck, Zap, CheckCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

const EbookDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ebook, setEbook] = useState<any>(null);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAllData = async () => {
      if (!id) return;
      try {
        setLoading(true);
        // 1. Fetch Ebook/Affiliate Data (From jobs collection)
        const docRef = doc(db, "jobs", id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const ebookData = docSnap.data();
          setEbook(ebookData);
          // document.title यहाँ से हटा दिया गया है क्योंकि अब SEO कम्पोनेंट यह काम करेगा
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
        console.error("Error loading ebook details:", err);
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
    "from-indigo-400 to-blue-600 shadow-blue-500/20",
    "from-rose-400 to-pink-600 shadow-rose-500/20",
    "from-emerald-400 to-teal-600 shadow-emerald-500/20",
    "from-amber-400 to-orange-600 shadow-orange-500/20"
  ];

  const pageQuickLinks = globalSettings?.sidebarLinks || [];

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-white"><div className="animate-spin h-10 w-10 border-4 border-blue-600 rounded-full border-t-transparent shadow-lg"></div></div>;

  if (!ebook) return (
    <div className="pt-24 md:pt-40 text-center px-4 font-hindi">
      <p className="text-gray-400 text-sm md:text-xl font-black mb-6">E-Book की जानकारी नहीं मिल पाई! 🥲</p>
      <Button onClick={() => navigate('/')} className="bg-blue-600 text-white font-black px-10 py-4 rounded-xl shadow-lg h-auto">वापस होम पर जाएं</Button>
    </div>
  );

  return (
    <div className="pt-16 md:pt-20 pb-16 md:pb-24 bg-[#F8FAFC] min-h-screen font-hindi antialiased">
      
      {/* 🔥 नया डायनामिक SEO टैग जो ई-बुक का असली नाम और फोटो गूगल/WhatsApp पर दिखाएगा */}
      <SEO 
        customTitle={`${ebook.title} - StudyGyaan 2026`}
        customDescription={ebook.description || "Get the best study material and e-books for govt exams on StudyGyaan."}
        customUrl={`https://studygyaan.in/e-book/${id}`}
        customImage={ebook.imageUrl || "https://studygyaan.in/og-image.jpg"}
      />

      <div className="max-w-7xl mx-auto px-2 md:px-8">
        
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 font-black mb-6 transition-all text-[11px] md:text-base bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
          <ArrowLeft className="w-3.5 h-3.5 md:w-5 md:h-5"/> वापस लाइब्रेरी में जाएं
        </button>

        <div className="flex flex-row gap-2 md:gap-8 items-start">
          
          <div className="w-[60%] md:w-[68%] min-w-0">
            
            <article className="bg-white rounded-2xl md:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              
              <div className="flex flex-col md:flex-row gap-4 md:gap-10 p-4 md:p-12">
                
                <div className="w-full md:w-[35%] flex-shrink-0">
                   <div className="relative group">
                      <div className="absolute inset-0 bg-blue-600/10 rounded-2xl blur-2xl group-hover:bg-blue-600/20 transition-all"></div>
                      <div className="relative bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-xl aspect-[3/4] flex items-center justify-center p-2 md:p-4">
                        {ebook.imageUrl ? (
                           <img src={ebook.imageUrl} alt={ebook.title || "StudyGyaan E-Book"} fetchPriority="high" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                        ) : <BookOpen size={64} className="text-slate-100" />}
                      </div>
                      <div className="absolute -bottom-3 -right-3 bg-emerald-500 text-white p-2 rounded-full shadow-lg border-4 border-white">
                         <ShieldCheck size={20} />
                      </div>
                   </div>
                </div>

                <div className="flex-1">
                   <div className="flex items-center gap-2 mb-2">
                      <span className="bg-yellow-100 text-yellow-700 text-[8px] md:text-xs font-black px-2 py-0.5 rounded uppercase flex items-center gap-1">
                        <Star size={10} className="fill-yellow-700"/> Recommended
                      </span>
                   </div>
                   <h1 className="text-[16px] md:text-4xl font-black text-slate-900 leading-tight mb-2 md:mb-6 uppercase tracking-tight">
                     {ebook.title}
                   </h1>

                   {ebook.price && (
                      <div className="flex items-center gap-2 mb-6 md:mb-8">
                         <span className="text-xl md:text-4xl font-black text-blue-600">₹{ebook.price}</span>
                         <span className="text-[10px] md:text-lg text-slate-400 font-bold line-through opacity-60">₹{Math.round(Number(ebook.price) * 1.5)}</span>
                      </div>
                   )}

                   <div className="space-y-4">
                      <div>
                        <h4 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                          <FileText size={14} /> Description / विवरण
                        </h4>
                        <p className="text-slate-600 leading-relaxed text-[12px] md:text-lg font-bold opacity-90 bg-slate-50 p-3 md:p-6 rounded-xl border border-slate-100">
                          {ebook.description || "इस स्टडी मटेरियल के बारे में अभी कोई अतिरिक्त जानकारी उपलब्ध नहीं है। इसे विशेषज्ञों द्वारा विशेष रूप से तैयार किया गया है।"}
                        </p>
                      </div>

                      <div className="pt-4">
                        <Button 
                          onClick={() => window.open(ebook.applyLink, '_blank')}
                          className="w-full md:w-auto px-8 py-5 md:px-16 md:py-10 bg-blue-600 hover:bg-slate-900 text-white font-black text-[12px] md:text-2xl rounded-xl md:rounded-3xl shadow-2xl shadow-blue-200 flex items-center justify-center gap-3 transition-all h-auto active:scale-95 group"
                        >
                          {ebook.applyLink?.includes('amazon') || ebook.applyLink?.includes('flipkart') ? 
                            <>Buy from Store <ShoppingCart size={24} className="group-hover:translate-x-1 transition-transform"/></> : 
                            <>Download E-Book <Download size={24} className="group-hover:animate-bounce"/></>
                          }
                        </Button>
                        <p className="text-slate-400 text-[8px] md:text-xs mt-4 flex items-center gap-1.5 font-bold">
                           <Zap size={12} className="text-yellow-500 fill-yellow-500" /> आपको सुरक्षित आधिकारिक लिंक पर भेजा जाएगा।
                        </p>
                      </div>
                   </div>
                </div>
              </div>

              <div className="bg-slate-50 border-t border-slate-100 p-4 md:px-12 md:py-6 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-2 text-slate-500 font-bold text-[10px] md:text-sm">
                     <CheckCircle size={16} className="text-blue-500" /> Verified Content
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 font-bold text-[10px] md:text-sm">
                     <CheckCircle size={16} className="text-blue-500" /> Immediate Access
                  </div>
                  <p className="text-slate-400 text-[8px] md:text-xs font-black">STUDYGYAAN.IN - {new Date().getFullYear()}</p>
              </div>

            </article>
          </div>

          <aside className="w-[40%] md:w-[32%] space-y-4 md:space-y-8 sticky top-12 md:top-16">
            
            {globalSettings?.relatedBlogs && (
              <div className="bg-white p-2 md:p-6 rounded-xl md:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-bl-full opacity-40"></div>
                  <h3 className="text-[10px] md:text-base font-black text-slate-900 mb-4 border-b border-slate-50 pb-2 flex items-center gap-1.5 relative z-10">
                    <Sparkles size={16} className="text-purple-600 animate-pulse" /> TRENDING 🔥
                  </h3>
                  <ul className="space-y-2 md:space-y-4 relative z-10 font-black">
                      {globalSettings.relatedBlogs.map((b: any, i: number) => (
                          <li key={i} onClick={() => window.open(b.url, '_blank')} className={`bg-gradient-to-r ${loopColors[i % loopColors.length]} p-[0.8px] rounded-lg cursor-pointer active:scale-95 shadow-sm`}>
                              <div className="bg-white p-1.5 md:p-4 rounded-[7px] text-[8.5px] md:text-[11.5px] text-slate-800 line-clamp-2 leading-snug">
                                  {b.title}
                              </div>
                          </li>
                      ))}
                  </ul>
              </div>
            )}

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

            <div className="p-4 md:p-8 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 rounded-2xl md:rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl group-hover:scale-150 transition-all duration-1000"></div>
                <div className="relative z-10">
                   <p className="font-black text-[12px] md:text-xl mb-1 flex items-center gap-2 text-yellow-300">
                     <ShoppingCart size={18} className="animate-bounce" /> प्रीमियम नोट्स
                   </p>
                   <p className="text-[9px] md:text-sm opacity-70 mb-6 leading-relaxed font-bold">100% सिलेक्शन वाली तैयारी। आज ही अपना बंडल पाएँ!</p>
                   <div className="flex items-center gap-2 mb-6 bg-white/10 p-3 rounded-2xl border border-white/10 backdrop-blur-md">
                       <span className="line-through text-white/30 text-[8px] md:text-sm font-bold italic">₹{globalSettings?.mrpPrice || '499'}</span>
                       <div className="text-[14px] md:text-3xl font-black text-yellow-400 ml-auto font-mono">₹{sellingPrice}</div>
                   </div>
                   <button onClick={() => navigate('/premium-notes')} className="w-full bg-yellow-400 text-blue-900 font-black py-3 md:py-5 rounded-2xl text-[10px] md:text-base hover:bg-white hover:text-blue-900 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2">
                     अभी अनलॉक करें <ArrowRight size={18} />
                   </button>
                </div>
            </div>

            <div className="bg-emerald-50 border-2 border-dashed border-emerald-200 p-5 rounded-3xl text-center">
                <Flame size={24} className="text-orange-500 mx-auto mb-2 animate-pulse" />
                <p className="text-[11px] md:text-sm font-black text-emerald-900 leading-tight">कोई समस्या? <br/><a href="https://wa.me/916263396446" target="_blank" className="text-blue-600 hover:underline">WhatsApp पर बात करें</a></p>
            </div>

          </aside>
        </div>
      </div>
    </div>
  );
};

export default EbookDetails;