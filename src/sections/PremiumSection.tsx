// @ts-nocheck
import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Crown, ArrowRight, Star, BookOpen, Sparkles, MessageCircle, FileText, Lock, Tag, ExternalLink, ShoppingCart, Flame } from 'lucide-react';
import { Button } from '../components/ui/button';
import SEO from '../components/SEO'; 

interface Course {
  id: string;
  title: string;
  price: string;
  description: string;
}

/**
 * 📂 Sub-component: Course Files List (Logic untouched)
 */
const CourseFilesList = ({ courseId }: { courseId: string }) => {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const q = query(collection(db, `courses/${courseId}/content`), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        setFiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error fetching files:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, [courseId]);

  if (loading) return <div className="text-[7px] md:text-[10px] text-gray-400 animate-pulse">सामग्री लोड हो रही है...</div>;
  if (files.length === 0) return null;

  return (
    <div className="w-full mt-1.5 md:mt-4 bg-slate-50 rounded-lg p-1.5 md:p-3 border border-dashed border-slate-200">
      <div className="text-[7.5px] md:text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-1 flex items-center gap-1">
        <BookOpen size={8} className="md:w-3 md:h-3" aria-hidden="true"/> Included ({files.length})
      </div>
      <div className="space-y-1 max-h-20 md:max-h-32 overflow-y-auto hide-scrollbar">
        {files.map((file) => (
          <div key={file.id} className="flex justify-between items-center bg-white p-1 rounded border border-slate-100 shadow-sm gap-1">
            <div className="flex items-center gap-1 overflow-hidden flex-1">
              <FileText className="text-red-500 shrink-0 w-2.5 h-2.5 md:w-3.5 md:h-3.5" aria-hidden="true" />
              <span className="text-[8.5px] md:text-xs font-bold text-slate-700 truncate">{file.title}</span>
            </div>
            <Lock className="text-slate-300 shrink-0 w-2 h-2 md:w-3 md:h-3" aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  );
};

const PremiumSection = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const myPhoneNumber = "916263396446"; 
  const navigate = useNavigate();

  useEffect(() => {
    const loadAllData = async () => {
      try {
        const q = query(collection(db, "courses"));
        const snapshot = await getDocs(q);
        setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)));

        const settingsSnap = await getDoc(doc(db, "site_settings", "global"));
        if (settingsSnap.exists()) setGlobalSettings(settingsSnap.data());
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    loadAllData();
  }, []);

  const handleBuy = (course: Course) => {
    const message = `Hello Sir! 👋\nMujhe ye Premium Notes khareedna hai:\n\n📚 *${course.title}*\n💰 Price: ₹${course.price}\n\nPlease send QR Code for payment.`;
    const url = `https://wa.me/${myPhoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const loopColors = ["from-rose-400 to-pink-600", "from-blue-400 to-indigo-600", "from-emerald-400 to-teal-600", "from-amber-400 to-orange-600"];

  // 🔥 PRODUCT SCHEMA FOR GOOGLE SEARCH 🔥
  const productSchema = {
    "@context": "https://schema.org/",
    "@type": "ItemList",
    "itemListElement": courses.map((course, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "Product",
        "name": course.title,
        "description": course.description,
        "offers": {
          "@type": "Offer",
          "price": course.price,
          "priceCurrency": "INR",
          "availability": "https://schema.org/InStock"
        }
      }
    }))
  };

  const sellingPrice = Math.round(Number(globalSettings?.mrpPrice || 499) * (1 - Number(globalSettings?.discountPercent || 85) / 100));

  if (courses.length === 0) return null;

  return (
    <section className="relative pt-8 md:pt-24 pb-6 md:pb-10 bg-[#F8FAFC] overflow-hidden font-hindi" id="premium">
      
      {/* Dynamic SEO (Optional for this section if used on Home, otherwise helpful for direct links) */}
      <SEO 
        customTitle="Premium Study Notes - Success Guaranteed | StudyGyaan"
        customDescription="Get high-quality handwritten premium study notes for all competitive exams. 10 years repeated questions included."
      />

      {/* 🔥 JSON-LD Schema Injection 🔥 */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />

      {/* Decorative Glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         <div className="absolute -top-5 -right-5 md:-top-10 md:-right-10 w-24 h-24 bg-yellow-300 rounded-full blur-2xl opacity-10 animate-pulse"></div>
         <div className="absolute top-10 -left-5 w-24 h-24 bg-purple-300 rounded-full blur-2xl opacity-10"></div>
      </div>

      <div className="max-w-7xl mx-auto px-1.5 md:px-4 relative z-10">
        <header className="text-center mb-5 md:mb-12">
           {/* ✅ SEO FIX: Semantic H2 Header */}
           <h2 className="text-[16px] md:text-4xl font-black text-slate-900 flex justify-center items-center gap-1.5">
             <Crown className="text-yellow-500 fill-yellow-500 w-4 h-4 md:w-8 md:h-8" aria-hidden="true" />
             <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-600 to-orange-600">
               Premium Study Notes
             </span>
             <Crown className="text-yellow-500 fill-yellow-500 w-4 h-4 md:w-8 md:h-8" aria-hidden="true" />
           </h2>
           <p className="text-slate-500 mt-0.5 font-bold text-[9px] md:text-base opacity-80">तैयारी जीत की, स्टडी मटेरियल असली वाला</p>
        </header>

        {/* MAIN 60-40 SPLIT LAYOUT */}
        <div className="flex flex-row gap-2 md:gap-6 items-start">
          
          {/* ✅ LEFT SIDE: PREMIUM CARDS (60%) */}
          <div className="w-[60%] md:w-[65%] grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
            {courses.map((course, index) => (
              <motion.article
                key={course.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="relative group h-full"
              >
                <div className="relative bg-white rounded-xl md:rounded-3xl p-3 md:p-6 shadow-sm border border-slate-100 hover:border-yellow-400 transition-all flex flex-col items-center text-center overflow-hidden h-full">
                  
                  {/* Price Tag */}
                  <div className="absolute top-0 right-2 md:right-8 bg-red-600 text-white font-black py-0.5 px-1.5 md:py-2 md:px-4 rounded-b-md shadow-md z-20 text-[8.5px] md:text-sm">
                      ₹{course.price} Only
                  </div>

                  {/* Micro Icon */}
                  <div className="relative z-10 w-9 h-9 md:w-20 md:h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg md:rounded-2xl flex items-center justify-center shadow-sm mb-2 md:mb-4 group-hover:rotate-3 transition-transform">
                     <BookOpen className="text-white w-4 h-4 md:w-10 md:h-10" aria-hidden="true" />
                  </div>

                  {/* ✅ SEO FIX: Semantic H3 for individual products */}
                  <h3 className="relative z-10 text-[10px] md:text-xl font-black text-slate-800 mb-0.5 line-clamp-1 group-hover:text-yellow-600 transition-colors">
                    {course.title}
                  </h3>
                  
                  <p className="relative z-10 text-slate-500 text-[8.5px] md:text-xs mb-2 line-clamp-1 opacity-80 font-bold">
                    {course.description}
                  </p>

                  {/* Content List */}
                  <CourseFilesList courseId={course.id} />

                  <div className="relative z-10 flex gap-1 justify-center my-2 md:my-4">
                     <span className="px-1 py-0.5 bg-green-50 text-green-700 text-[6.5px] md:text-[10px] font-black rounded flex items-center gap-0.5"><Sparkles size={7} aria-hidden="true"/> Full Access</span>
                     <span className="hidden sm:flex px-1 py-0.5 bg-blue-50 text-blue-700 text-[6.5px] md:text-[10px] font-black rounded items-center gap-0.5"><Star size={7} aria-hidden="true"/> Best Seller</span>
                  </div>

                  <Button 
                      onClick={() => handleBuy(course)} 
                      className="relative z-10 w-full bg-slate-900 hover:bg-green-600 text-white font-black py-1.5 md:py-6 h-auto rounded-lg mt-auto shadow-sm text-[9.5px] md:text-base transition-all active:scale-95 flex items-center justify-center gap-1"
                  >
                      <MessageCircle size={10} className="md:w-5 md:h-5" aria-hidden="true"/> <span>Buy on WhatsApp</span> <ArrowRight size={10} className="md:w-5 md:h-5" aria-hidden="true"/>
                  </Button>
                </div>
              </motion.article>
            ))}
          </div>

          {/* ✅ RIGHT SIDE: DYNAMIC SIDEBAR (40%) */}
          <aside className="w-[40%] md:w-[35%] space-y-2 md:space-y-4 sticky top-14">
              
              {/* Trending Section */}
              {globalSettings?.relatedBlogs && (
                <section className="bg-white p-1.5 md:p-4 rounded-lg shadow-sm border border-slate-100">
                    <h2 className="text-[8.5px] md:text-sm font-black text-slate-900 mb-1.5 border-b pb-1 flex items-center gap-1">
                      <Sparkles size={10} className="text-purple-600 animate-pulse" aria-hidden="true" /> ट्रेंडिंग 🔥
                    </h2>
                    <ul className="space-y-1.5 md:space-y-2.5">
                        {globalSettings.relatedBlogs.map((blogInfo: any, index: number) => (
                            <li key={index} onClick={() => blogInfo.url && window.open(blogInfo.url, '_blank')} className={`bg-gradient-to-r ${loopColors[index % loopColors.length]} p-[0.6px] rounded-[3px] md:rounded-lg cursor-pointer active:scale-95 shadow-sm`}>
                                <div className="bg-white p-1 md:p-2 rounded-[2.5px] md:rounded-[7.5px] text-[7.5px] md:text-[11px] font-black text-slate-800 line-clamp-2 leading-tight">
                                    {blogInfo.title}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
              )}

              {/* Promo Box */}
              <section className="p-2 md:p-4 bg-gradient-to-br from-indigo-600 to-blue-800 rounded-lg text-white shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-10 h-10 bg-white/10 rounded-full blur-xl"></div>
                  <div className="font-black text-[9px] md:text-sm mb-1 flex items-center gap-1">
                    <Flame size={10} className="text-orange-400" aria-hidden="true" /> धमाका ऑफर!
                  </div>
                  <p className="text-[7.5px] md:text-xs opacity-90 leading-tight mb-2">आज ही जॉइन करें और पाएँ परीक्षा में 100% सफलता दिलाने वाले नोट्स।</p>
                  <button onClick={() => navigate('/premium-notes')} className="w-full bg-white text-indigo-700 font-black py-1 rounded text-[7.5px] md:text-xs hover:bg-slate-100 transition-colors">अभी चेक करें ➔</button>
              </section>

              {/* Quick Links Section */}
              <section className="bg-white p-1.5 md:p-4 rounded-lg shadow-sm border border-slate-100 hidden sm:block">
                <h2 className="text-[9px] md:text-sm font-black text-slate-900 mb-1 border-b pb-1 flex items-center gap-1">
                  <Tag size={10} className="text-blue-600" aria-hidden="true" /> क्विक लिंक्स
                </h2>
                <ul className="space-y-1">
                  {globalSettings?.sidebarLinks?.map((item: any, index: number) => (
                    <li key={index} onClick={() => item.url && window.open(item.url, '_blank')} className="flex items-center justify-between p-1 md:p-2.5 bg-slate-50 rounded-md hover:bg-blue-50 transition-all cursor-pointer">
                      <span className="text-slate-600 font-bold text-[7.5px] md:text-[10px] truncate pr-1">{item.name}</span>
                      <ExternalLink size={8} className="text-slate-300" aria-hidden="true" />
                    </li>
                  ))}
                </ul>
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

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </section>
  );
};

export default PremiumSection;