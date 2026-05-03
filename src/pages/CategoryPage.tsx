// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import { Calendar, ArrowRight, FileText, AlertCircle } from 'lucide-react';
import SEO from '../components/SEO'; // ✅ SEO कम्पोनेंट इम्पोर्ट किया

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
        // 🎯 1. Firebase से डेटा लाओ
        const q = query(
          collection(db, "fast_track"),
          where("category", "==", category)
        );
        
        const snap = await getDocs(q);
        let fetchedData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 🎯 2. Sorting (Latest First)
        fetchedData = fetchedData
          .filter(item => item.status === "published" || !item.status)
          .sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
          });

        setData(fetchedData);
      } catch (err) {
        console.error(`Error fetching ${category}:`, err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCategoryData();
    window.scrollTo(0, 0);
  }, [category]);

  // 🔥 1. BREADCRUMB SCHEMA (Google Search Hierarchy)
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://studygyaan.in"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": category,
        "item": `https://studygyaan.in/${category.toLowerCase().replace(/\s+/g, '-')}`
      }
    ]
  };

  // 🔥 2. COLLECTION PAGE SCHEMA (For listing pages)
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": pageTitle,
    "description": description,
    "url": window.location.href,
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": data.map((item, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "url": `https://studygyaan.in/update/${item.id}`,
        "name": item.title
      }))
    }
  };

  return (
    <div className="bg-[#F8FAFC] min-h-screen font-hindi pb-20">
      
      {/* Dynamic Meta Tags */}
      <SEO 
        customTitle={`${pageTitle} 2026 - StudyGyaan`}
        customDescription={description}
        customUrl={window.location.href}
        customImage="https://studygyaan.in/og-image.jpg"
      />

      {/* JSON-LD Schemas Injection */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }} />

      {/* 🔵 Header Section */}
      <section className="bg-[#0052CC] text-white pt-16 pb-20 px-4 rounded-b-[40px] shadow-xl relative overflow-hidden">
        <div className="max-w-6xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full mb-4 border border-white/20">
            <FileText className="w-4 h-4 text-yellow-300" aria-hidden="true" />
            <div className="text-xs font-black uppercase tracking-widest">StudyGyaan Exclusive</div>
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
                <AlertCircle size={48} className="mb-4 text-slate-300" aria-hidden="true" />
                <h2 className="text-xl font-black text-slate-500">अभी कोई {category} नहीं है</h2>
                <p className="text-sm font-bold mt-2">जैसे ही कोई नया अपडेट आएगा, हम यहाँ जोड़ देंगे!</p>
              </div>
            ) : (
              // Actual Data Cards
              data.map((item) => (
                <article key={item.id} className="bg-[#F9FBFF] rounded-[2rem] p-6 border border-slate-100 hover:border-blue-300 hover:shadow-xl transition-all flex flex-col justify-between group">
                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-sm uppercase">{item.category}</span>
                      <time className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                        <Calendar size={12} aria-hidden="true" /> {item.date ? new Date(item.date.seconds * 1000).toLocaleDateString('hi-IN') : 'Recent'}
                      </time>
                    </div>
                    {/* ✅ SEO FIX: H2/H3 structure */}
                    <h3 className="text-lg font-black text-slate-800 leading-snug group-hover:text-blue-600 transition-colors line-clamp-2">
                      {item.title}
                    </h3>
                  </div>
                  <button 
                    onClick={() => navigate(`/update/${item.id}`)}
                    className="w-full bg-white text-[#0052CC] border-2 border-slate-100 py-3 rounded-xl font-black text-xs hover:bg-[#0052CC] hover:text-white hover:border-[#0052CC] transition-all flex items-center justify-center gap-2"
                  >
                    View Details <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </article>
              ))
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default CategoryPage;