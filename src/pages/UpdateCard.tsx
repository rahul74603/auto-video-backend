// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import { Calendar, FileText, AlertCircle, ArrowRight } from 'lucide-react';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

interface CategoryPageProps {
  category: string;
  pageTitle: string;
  description: string;
}

const CategoryPage: React.FC<CategoryPageProps> = ({ category, pageTitle, description }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCategoryData = async () => {
      setLoading(true);
      try {
        // 🎯 सही कलेक्शन 'fast_track' और सही फील्ड 'createdAt'
        const q = query(
          collection(db, "fast_track"),
          where("category", "==", category),
          where("status", "==", "published"), // सिर्फ लाइव वाले दिखाओ
          orderBy("createdAt", "desc"),
          limit(50) // एक बार में 50 आइटम लाओ ताकि पेज फास्ट रहे
        );
        const snap = await getDocs(q);
        setData(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error(`Error fetching ${category}:`, err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCategoryData();
  }, [category]);

  return (
    <div className="bg-[#F8FAFC] min-h-screen font-hindi pb-20">
      
      {/* 🔥 नया डायनामिक SEO टैग जो केटेगरी (Result/Admit Card) के हिसाब से अपडेट होगा */}
      <SEO 
        customTitle={`${pageTitle} 2026 - StudyGyaan Official`}
        customDescription={description}
        customUrl={`https://studygyaan.in/${category.toLowerCase().replace(/\s+/g, '-')}`}
        customImage="https://studygyaan.in/og-image.jpg"
      />

      {/* 🔵 Header Section */}
      <section className="bg-[#0052CC] text-white pt-16 pb-20 px-4 rounded-b-[40px] shadow-xl relative overflow-hidden">
        <div className="max-w-6xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full mb-4 border border-white/20">
            <FileText className="w-4 h-4 text-yellow-300" />
            <p className="text-xs font-black uppercase tracking-widest">StudyGyaan Exclusive</p>
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4">{pageTitle}</h1>
          <p className="text-blue-100 font-bold max-w-2xl mx-auto">{description}</p>
        </div>
      </section>

      {/* 📋 Data Grid Section */}
      <main className="max-w-7xl mx-auto px-4 -mt-10 relative z-20">
        <div className="bg-white rounded-[30px] shadow-2xl border border-white p-6 md:p-10">
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              // Skeleton Loader
              [1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-48 bg-slate-50 animate-pulse rounded-[2rem]"></div>
              ))
            ) : data.length === 0 ? (
              // Empty State
              <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                <AlertCircle size={48} className="mb-4 text-slate-300" />
                <h3 className="text-xl font-black text-slate-500">अभी कोई {category} नहीं है</h3>
                <p className="text-sm font-bold mt-2">जैसे ही कोई नया अपडेट आएगा, हम यहाँ जोड़ देंगे!</p>
              </div>
            ) : (
              // Actual Data Cards
              data.map((item) => (
                <div key={item.id} className="bg-[#F9FBFF] rounded-[2rem] p-6 border border-slate-100 hover:border-blue-300 hover:shadow-xl transition-all flex flex-col justify-between group">
                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-sm uppercase">{item.category}</span>
                      <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                        <Calendar size={12}/> {item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleDateString('hi-IN') : 'Recent'}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-slate-800 leading-snug group-hover:text-blue-600 transition-colors line-clamp-2">{item.title}</h3>
                  </div>
                  <button 
                    onClick={() => navigate(`/fast-track/${item.id}`)}
                    className="w-full bg-white text-[#0052CC] border-2 border-slate-100 py-3 rounded-xl font-black text-xs hover:bg-[#0052CC] hover:text-white hover:border-[#0052CC] transition-all flex items-center justify-center gap-2"
                  >
                    View Details <ArrowRight size={16} />
                  </button>
                </div>
              ))
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default CategoryPage;