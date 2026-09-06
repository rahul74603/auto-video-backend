/* eslint-disable */
import SEO from '../components/SEO';
import { useEffect, useState } from 'react';
import { useBlogs } from '@/features/blogs/hooks/useBlogs';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Flame, ShoppingCart } from 'lucide-react';
import { siteSettingsRepository } from '@/features/site-settings/data/siteSettingsRepository';
import DynamicSidebar from '../components/DynamicSidebar';
import { asText, toDateSafe, type TimestampLike } from '@/types/firestore';
import { ROUTES } from '@/config/routes';

type BlogListSettings = {
  mrpPrice?: string | number;
  discountPercent?: string | number;
};

const BlogList = () => {
  const { blogs, loading: blogsLoading } = useBlogs();
  const [globalSettings, setGlobalSettings] = useState<BlogListSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsSnap = await siteSettingsRepository.getGlobal();
        if (settingsSnap) setGlobalSettings(settingsSnap as BlogListSettings);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
    window.scrollTo(0, 0);
  }, []);

  const isLoading = blogsLoading || loading;

  const sellingPrice = Math.round(
    Number(globalSettings?.mrpPrice || 499) * (1 - Number(globalSettings?.discountPercent || 85) / 100)
  );

  // ✅ Colorful Boxes Configuration


  if (isLoading || !globalSettings) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[40vh] font-hindi text-blue-600 font-bold text-xs animate-pulse">
        लोडिंग... 🚀
      </div>
    );
  }

  return (
    <div className="bg-[#F8FAFC] min-h-screen pb-16 font-hindi antialiased">
      
     {/* ✅ NEW SEO COMPONENT */}
      <SEO 
        customTitle="StudyGyaan Hub - Latest Educational Blogs & Notes 2026" 
        customDescription="Stay updated with the latest educational news, exam tips, and free study materials on StudyGyaan Hub."
        customUrl="https://studygyaan.in/blog" 
      />
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
                  <Link to={ROUTES.blogPost(blog.id)} key={blog.id} className="group">
                    <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col h-full">
                      <div className="h-32 md:h-44 overflow-hidden relative">
                        <img src={asText(blog.imageUrl) || 'https://via.placeholder.com/400x300'} alt={asText(blog.title) || "StudyGyaan Blog"} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        <div className="absolute top-2 left-2 bg-blue-600/90 backdrop-blur-md text-white text-[8px] md:text-[10px] font-black px-2.5 py-1 rounded-md uppercase shadow-lg">{asText(blog.category) || 'New'}</div>
                      </div>
                      <div className="p-3 md:p-4 flex-grow flex flex-col justify-between">
                        <h2 className="text-[12px] md:text-[15px] font-black text-slate-800 line-clamp-2 leading-snug mb-3 group-hover:text-blue-600 transition-colors">{asText(blog.title)}</h2>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                           <span className="text-[9px] md:text-[11px] text-slate-400 font-bold flex items-center gap-1">
                             <Clock size={12} className="md:w-3.5 md:h-3.5" /> {toDateSafe(blog.date as TimestampLike)?.toLocaleDateString('hi-IN') ?? 'Recent'}
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
            
            {/* 🎯 COLORFUL QUICK LINKS */}
            <DynamicSidebar />

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
                <button onClick={() => navigate(ROUTES.premiumNotes)} className="w-full relative z-10 bg-yellow-400 text-blue-900 font-black py-2.5 md:py-3.5 rounded-xl md:rounded-2xl text-[12px] md:text-sm hover:bg-yellow-300 active:scale-95 shadow-xl transition-transform"> अभी खरीदें </button>
            </div>

          </aside>
        </div>
      </main>
    </div>
  );
};

export default BlogList;
