// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase/config'; 
import { collection, doc, getDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Calendar, Building2, ArrowLeft, Download, FileText, ChevronRight } from 'lucide-react';
import SEO from '../components/SEO'; 

const FastTrackDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [data, setData] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [updatesList, setUpdatesList] = useState<any[]>([]);

  // 1. Fetch Current Update Details
  useEffect(() => {
    const fetchDetails = async () => {
      if (!id) return;
      setLoadingDetails(true);
      try {
        const docRef = doc(db, "fast_track", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setData(docSnap.data());
        }
      } catch (err) {
        console.error("Firebase Error:", err);
      }
      setLoadingDetails(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    fetchDetails();
  }, [id]);

  // 2. Fetch All Updates for the Right Side
  useEffect(() => {
    const q = query(collection(db, "fast_track"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const liveUpdates = allData.filter(item => item.status !== 'draft');
      setUpdatesList(liveUpdates);
    });
    return () => unsubscribe();
  }, []);

  if (loadingDetails && !data) return <div className="p-20 text-center font-black text-2xl text-slate-400 animate-pulse">Loading Details... 🚀</div>;
  if (!data) return <div className="p-20 text-center font-black text-2xl text-red-500">Details Not Found! ❌</div>;

  const themeColor = data.category === 'Result' ? 'bg-green-600' : 
                     data.category === 'Admit Card' ? 'bg-red-600' : 
                     data.category === 'Answer Key' ? 'bg-blue-600' : 'bg-purple-600';

  // 🔥 अलग-अलग कैटेगरी में डेटा को बाँटना
  const results = updatesList.filter(u => u.category === 'Result').slice(0, 6);
  const admitCards = updatesList.filter(u => u.category === 'Admit Card').slice(0, 6);
  const answerKeys = updatesList.filter(u => u.category === 'Answer Key').slice(0, 6);
  const syllabuses = updatesList.filter(u => u.category === 'Syllabus').slice(0, 6);

  const renderListCard = (item) => {
    const isActive = item.id === id;
    const colorClass = item.category === 'Result' ? 'text-green-700 bg-green-50 border-green-200' : 
                       item.category === 'Admit Card' ? 'text-red-700 bg-red-50 border-red-200' : 
                       item.category === 'Answer Key' ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-purple-700 bg-purple-50 border-purple-200';

    return (
      <Link 
        key={item.id} 
        to={`/update/${item.id}`} // ✅ Updated path to match routing logic
        className={`block p-3 rounded-2xl border transition-all ${
          isActive 
            ? `${colorClass} shadow-md ring-2 ring-opacity-50` 
            : 'bg-white border-slate-100 hover:shadow-md hover:border-slate-300'
        }`}
      >
        <div className="flex justify-between items-center">
          <div className="flex-1 pr-3">
            <span className="text-[10px] font-bold text-slate-400 mb-1 block">{item.updateDate || 'New'}</span>
            {/* ✅ SEO FIX: Changed h4 to div to prevent semantic errors */}
            <div className={`font-bold text-sm leading-tight line-clamp-2 ${isActive ? '' : 'text-slate-700'}`}>
              {item.title}
            </div>
          </div>
          <ChevronRight size={16} className={isActive ? '' : 'text-slate-300'} aria-hidden="true" />
        </div>
      </Link>
    );
  };

  // 🔥 JSON-LD NEWS ARTICLE SCHEMA 🔥
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://studygyaan.in/update/${id}`
    },
    "headline": data.title,
    "description": data.shortInfo || `Latest ${data.category} update for ${data.title}. Get direct links and official updates on StudyGyaan.`,
    "image": "https://studygyaan.in/og-image.jpg",
    "datePublished": data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
    "dateModified": data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
    "author": {
      "@type": "Organization",
      "name": "StudyGyaan",
      "url": "https://studygyaan.in"
    },
    "publisher": {
      "@type": "Organization",
      "name": "StudyGyaan",
      "logo": {
        "@type": "ImageObject",
        "url": "https://studygyaan.in/logo.png"
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen">
      
      {/* 🔥 DYNAMIC SEO SETTINGS */}
      <SEO 
        customTitle={`${data.title} - ${data.category} 2026 | StudyGyaan`}
        customDescription={`Check latest ${data.category} for ${data.title}. Get direct links, official updates and detailed information on StudyGyaan.`}
        customUrl={`https://studygyaan.in/update/${id}`}
        customImage="https://studygyaan.in/og-image.jpg"
      />

      {/* 🔥 JSON-LD INJECTION */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <div className="lg:col-span-4 lg:sticky lg:top-8 h-fit">
          
          <button onClick={() => navigate(-1)} className="flex items-center text-slate-500 mb-4 hover:text-blue-600 transition-colors font-black text-sm uppercase">
            <ArrowLeft size={18} className="mr-2" aria-hidden="true" /> Back 
          </button>

          <article>
            <div className={`${themeColor} text-white p-6 rounded-t-3xl shadow-lg`}>
              <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/30">
                {data.category}
              </span>
              <h1 className="text-xl md:text-2xl font-black mt-4 leading-tight">
                {data.title}
              </h1>
            </div>

            <div className="bg-white border-x border-b border-slate-200 rounded-b-3xl shadow-xl p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1 flex items-center gap-1"><Building2 size={12} aria-hidden="true"/> Org</p>
                  <p className="font-bold text-xs text-slate-800 line-clamp-1">{data.org || "Govt. Dept."}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1 flex items-center gap-1"><Calendar size={12} aria-hidden="true"/> Date</p>
                  <p className="font-bold text-xs text-slate-800">{data.updateDate || "Check Link"}</p>
                </div>
              </div>

              <hr className="border-slate-100" />

              <div>
                <p className="text-slate-600 text-sm leading-relaxed bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 whitespace-pre-wrap font-medium">
                  {data.shortInfo || "Official details are provided in the link below. Click to check the complete update."}
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <a 
                  href={`/redirect?url=${encodeURIComponent(data.directLink)}`} 
                  target="_blank" 
                  rel="nofollow noopener noreferrer" 
                  className={`flex items-center justify-center w-full py-4 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg transition transform hover:scale-[1.02] active:scale-[0.98] ${themeColor}`}
                >
                  <Download className="mr-2" size={18} aria-hidden="true" /> Official Link
                </a>

                {data.syllabusPDF && (
                  <div className="p-4 bg-purple-50 border-2 border-dashed border-purple-200 rounded-2xl text-center">
                      <div className="text-xs font-black text-purple-900 mb-1">
                          📥 Download Official Pattern
                      </div>
                      <p className="text-[10px] text-purple-600 font-bold mb-3">
                          AI Generated High Quality PDF
                      </p>
                      <a 
                          href={data.syllabusPDF} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-black px-4 py-2 rounded-xl shadow-md active:scale-95 transition-all w-full text-xs uppercase"
                      >
                          📄 Download PDF
                      </a>
                  </div>
                )}
              </div>
            </div>
          </article>
          {/* ✅ SEO FIX: Internal Links Section (Fixes 'No outgoing links' and 'Orphan page' error) */}
            <div className="bg-blue-50/50 p-6 md:p-8 rounded-[2rem] border border-blue-100 shadow-sm mt-6">
              <h2 className="text-sm md:text-xl font-black text-slate-800 mb-5 uppercase tracking-tight flex items-center gap-2">
                <FileText size={20} className="text-blue-600" aria-hidden="true" /> Explore More on StudyGyaan
              </h2>
              <div className="flex flex-wrap gap-3">
                <a href="/govt-jobs" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Latest Govt Jobs</a>
                <a href="/free-study-material" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Free Study Material</a>
                <a href="/test" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Free Mock Tests</a>
                <a href="/blog" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm">Sarkari Yojana & Blogs</a>
              </div>
            </div>
        </div>

        <aside className="lg:col-span-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {results.length > 0 && (
              <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                {/* ✅ SEO FIX: Changed to H2 */}
                <h2 className="text-lg font-black text-green-700 uppercase tracking-tight mb-4 flex items-center border-b-2 border-green-100 pb-2">
                  🏆 Latest Results
                </h2>
                <div className="space-y-3">
                  {results.map(item => renderListCard(item))}
                </div>
              </section>
            )}

            {admitCards.length > 0 && (
              <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                {/* ✅ SEO FIX: Changed to H2 */}
                <h2 className="text-lg font-black text-red-700 uppercase tracking-tight mb-4 flex items-center border-b-2 border-red-100 pb-2">
                  🎫 Admit Cards
                </h2>
                <div className="space-y-3">
                  {admitCards.map(item => renderListCard(item))}
                </div>
              </section>
            )}

            {answerKeys.length > 0 && (
              <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                {/* ✅ SEO FIX: Changed to H2 */}
                <h2 className="text-lg font-black text-blue-700 uppercase tracking-tight mb-4 flex items-center border-b-2 border-blue-100 pb-2">
                  🔑 Answer Keys
                </h2>
                <div className="space-y-3">
                  {answerKeys.map(item => renderListCard(item))}
                </div>
              </section>
            )}

            {syllabuses.length > 0 && (
              <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                {/* ✅ SEO FIX: Changed to H2 */}
                <h2 className="text-lg font-black text-purple-700 uppercase tracking-tight mb-4 flex items-center border-b-2 border-purple-100 pb-2">
                  📚 Syllabus & Patterns
                </h2>
                <div className="space-y-3">
                  {syllabuses.map(item => renderListCard(item))}
                </div>
              </section>
            )}

          </div>

          {updatesList.length === 0 && (
            <p className="text-center text-slate-400 font-bold p-20 bg-white rounded-3xl border border-slate-100">No other updates available right now.</p>
          )}

        </aside>

      </div>
    </div>
  );
};

export default FastTrackDetails;