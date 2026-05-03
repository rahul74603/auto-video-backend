// @ts-nocheck
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collectionGroup, getDocs, query, collection, limit } from 'firebase/firestore'; // limit और collection जोड़ा
import { db } from '../firebase/config';
import { Loader2, ArrowLeft, Printer, AlertCircle, Globe, Phone, Mail, Sparkles, ArrowRight, BookOpen } from 'lucide-react';

const FileViewer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [articleData, setArticleData] = useState(null);
  const [relatedBlogs, setRelatedBlogs] = useState([]); // 🚀 रैंडम ब्लॉग्स के लिए
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAndProcess = async () => {
      if (!id) return;
      setLoading(true);
      try {
        // 1. मुख्य नोट्स/आर्टिकल लाना
        let docRef = doc(db, "jobs", id);
        let docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          docRef = doc(db, "study_materials", id);
          docSnap = await getDoc(docRef);
        }

        if (!docSnap || !docSnap.exists()) {
          const premiumQuery = query(collectionGroup(db, 'content')); 
          const premiumSnap = await getDocs(premiumQuery);
          const foundDoc = premiumSnap.docs.find(d => d.id === id);
          if (foundDoc) docSnap = foundDoc;
        }

        if (docSnap && docSnap.exists()) {
          const data = docSnap.data();
          if (data.type === 'article') {
            setArticleData(data);
            
            // 🚀 2. रैंडम ब्लॉग्स लाना (जब नोट्स मिल जाएँ)
            fetchRandomBlogs(); 

            setLoading(false);
          } else {
            const fileUrl = data.applyLink || data.downloadUrl || data.link;
            if (fileUrl) {
              window.location.href = fileUrl;
            } else {
              setError("File link is missing in database.");
              setLoading(false);
            }
          }
        } else {
          setError("Material not found (ID: " + id + ")");
          setLoading(false);
        }
      } catch (err) {
        setError("Firebase Error: " + err.message);
        setLoading(false);
      }
    };

    // 🚀 रैंडम ब्लॉग्स फेच करने का फंक्शन
    const fetchRandomBlogs = async () => {
        try {
            // 'blog' कलेक्शन से 8 लेटेस्ट ब्लॉग्स उठाओ
            const blogSnap = await getDocs(query(collection(db, "blog"), limit(8)));
            const blogs = blogSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // ब्लॉग्स को Shuffle (रैंडम) करो और सिर्फ 3 चुनो
            const shuffled = blogs.sort(() => 0.5 - Math.random()).slice(0, 3);
            setRelatedBlogs(shuffled);
        } catch (e) { console.log("Blog fetch error:", e); }
    };

    fetchAndProcess();
  }, [id]);

  const handlePrint = () => window.print();

  if (error) return (
    <div className="h-screen flex flex-col justify-center items-center gap-4 px-4 text-center">
        <AlertCircle size={48} className="text-red-500" />
        <div className="font-bold text-red-600 text-lg">{error}</div>
        <button onClick={() => navigate(-1)} className="bg-gray-800 text-white px-6 py-2 rounded-lg font-bold">Go Back</button>
    </div>
  );

  if (articleData) {
    let cleanHTML = articleData.content || "";
    // पुराने फालतू टेक्स्ट की सफाई
    cleanHTML = cleanHTML.replace(/<[^>]*>StudyGyaan\.in\s*\|\s*Contact:\s*\+91-6263396446\s*\|\s*Email:\s*contact@studygyaan\.in<\/[^>]*>/gi, '');
    cleanHTML = cleanHTML.replace(/StudyGyaan\.in\s*\|\s*Contact:\s*\+91-6263396446\s*\|\s*Email:\s*contact@studygyaan\.in/gi, '');

    // Markdown Fixes
    cleanHTML = cleanHTML.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    cleanHTML = cleanHTML.replace(/(^|\s+)-\s+<strong>/g, '<br /><br />• <strong>');
    cleanHTML = cleanHTML.replace(/(^|\s+)(\d+)\.\s+<strong>/g, '<br /><br />$2. <strong>');

    return (
      <div className="min-h-screen bg-slate-100 pb-20 relative max-w-[100vw] overflow-x-hidden font-hindi">
        
        {/* Navigation Bar */}
        <div className="bg-white border-b sticky top-0 z-50 px-3 md:px-4 py-2 md:py-3 shadow-sm print:hidden">
          <div className="max-w-5xl mx-auto flex justify-between items-center">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1 md:gap-2 text-gray-600 font-bold hover:text-blue-600 transition text-xs md:text-base">
              <ArrowLeft size={16} className="md:w-5 md:h-5"/> Back
            </button>
            <button onClick={handlePrint} className="p-1.5 md:p-2.5 bg-blue-600 text-white rounded-md md:rounded-lg hover:bg-blue-700 transition shadow-md flex items-center gap-1.5 font-bold text-[10px] md:text-sm">
              <Printer size={14} className="md:w-[18px] md:h-[18px]"/> Print Notes
            </button>
          </div>
        </div>

        {/* Content Section */}
        <div className="max-w-4xl mx-auto mt-3 md:mt-8 px-2 md:px-4">
          <div className="bg-white p-3 md:p-14 md:shadow-2xl rounded-lg md:rounded-[2rem] border border-gray-100 relative overflow-hidden">
             
             {/* Watermark */}
             <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-0 overflow-hidden">
                <span className="text-[14vw] md:text-[12vw] font-black text-gray-500 opacity-[0.03] -rotate-45 select-none whitespace-nowrap">StudyGyaan.in</span>
             </div>

             <div className="relative z-10 w-full">
                 {/* StudyGyaan Header */}
                 <div className="border-b-2 md:border-b-4 border-blue-600 pb-2 md:pb-5 mb-4 md:mb-8 text-center bg-white/80 backdrop-blur-sm rounded-lg p-2 md:p-4">
                     <h1 className="text-2xl md:text-5xl font-black text-blue-900 uppercase tracking-tight mb-1 md:mb-3">StudyGyaan</h1>
                     <div className="flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-6 text-[8px] md:text-sm font-bold text-gray-600">
                         <span className="flex items-center gap-1 md:gap-1.5"><Globe size={10} className="md:w-3.5 md:h-3.5 text-blue-500"/> Studygyaan.in</span>
                         <span className="flex items-center gap-1 md:gap-1.5"><Phone size={10} className="md:w-3.5 md:h-3.5 text-blue-500"/> +91-6263396446</span>
                         <span className="flex items-center gap-1 md:gap-1.5"><Mail size={10} className="md:w-3.5 md:h-3.5 text-blue-500"/> contact@studygyaan.in</span>
                     </div>
                 </div>

                 {/* Main Content */}
                 <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
                     <div 
                        className="studygyaan-article prose prose-blue max-w-none font-hindi text-gray-800 min-w-full"
                        dangerouslySetInnerHTML={{ __html: cleanHTML }} 
                     />
                 </div>

                 {/* 🚀 2-3 रैंडम ब्लॉग्स का नया सेक्शन (Hidden in Print) */}
                 {relatedBlogs.length > 0 && (
                    <div className="mt-16 border-t-4 border-dashed border-blue-100 pt-10 print:hidden">
                        <h3 className="text-lg md:text-2xl font-black text-blue-900 mb-6 flex items-center gap-2 italic uppercase tracking-tighter">
                            <Sparkles className="text-yellow-500 animate-pulse" /> इसे भी पढ़ें (Recommended for You)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {relatedBlogs.map((blog, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => navigate(`/blog/${blog.id}`)}
                                    className="group cursor-pointer bg-blue-50/50 hover:bg-blue-600 border-2 border-blue-100 hover:border-blue-600 p-4 rounded-2xl transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1"
                                >
                                    <div className="bg-white w-10 h-10 rounded-full flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform">
                                        <BookOpen size={20} className="text-blue-600" />
                                    </div>
                                    <h4 className="text-sm md:text-[15px] font-black text-blue-900 group-hover:text-white leading-tight line-clamp-3 mb-4">
                                        {blog.title}
                                    </h4>
                                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-blue-500 group-hover:text-blue-100">
                                        <span>Read More</span>
                                        <ArrowRight size={14} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                 )}
             </div>
          </div>
          
          <div className="text-center mt-4 md:mt-8 text-gray-400 text-[8px] md:text-sm font-bold uppercase tracking-widest print:hidden">
            © {new Date().getFullYear()} StudyGyaan.in - All Rights Reserved
          </div>
          {/* ✅ SEO FIX: Internal Links Section (Fixes 'No outgoing links' and 'Orphan page' error) */}
          <div className="bg-blue-50/50 p-6 md:p-8 rounded-[2rem] border border-blue-100 shadow-sm mt-8 print:hidden">
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

        {/* ... (Styles Code Same Rehega) ... */}
        <style dangerouslySetInnerHTML={{ __html: `
          .studygyaan-article h2 { color: #1e40af; font-weight: 900; border-bottom: 3px solid #dbeafe; padding-bottom: 8px; margin-top: 35px; font-size: 1.5rem; text-transform: uppercase; }
          .studygyaan-article h3 { color: #1e3a8a; font-weight: 800; margin-top: 20px; font-size: 1.25rem; }
          .studygyaan-article p { font-size: 1.05rem; line-height: 1.7; margin-bottom: 16px; }
          .studygyaan-article ul { list-style-type: disc; padding-left: 20px; margin-bottom: 20px; }
          .studygyaan-article li { margin-bottom: 8px; font-size: 1.05rem; }
          .studygyaan-article table { width: 100%; border-collapse: collapse; margin: 25px 0; border: 2px solid #e2e8f0; font-size: 0.95rem; background: white; }
          .studygyaan-article th { background-color: #eff6ff; color: #1e40af; padding: 14px; border: 1px solid #e2e8f0; text-align: left; font-weight: 800; text-transform: uppercase; }
          .studygyaan-article td { padding: 14px; border: 1px solid #f1f5f9; vertical-align: top; }
          .studygyaan-article tr:nth-child(even) { background-color: #f8fafc; }
          .studygyaan-article strong { color: #111827; font-weight: 800; }

          @media (max-width: 768px) {
            .studygyaan-article h2 { font-size: 1rem; margin-top: 18px; border-bottom-width: 2px; padding-bottom: 4px; }
            .studygyaan-article h3 { font-size: 0.85rem; margin-top: 12px; }
            .studygyaan-article p, .studygyaan-article li { font-size: 0.75rem; line-height: 1.45; margin-bottom: 8px; }
            .studygyaan-article ul { padding-left: 15px; margin-bottom: 12px; }
            .studygyaan-article table { font-size: 0.7rem; margin: 10px 0; display: block; overflow-x: auto; white-space: nowrap; }
            .studygyaan-article th, .studygyaan-article td { padding: 6px 8px; white-space: normal; line-height: 1.4; }
          }
          
          .custom-scrollbar::-webkit-scrollbar { height: 4px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

          @media print {
            body, .bg-slate-100 { background: white !important; }
            .max-w-4xl { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
            .md\\:shadow-2xl { box-shadow: none !important; border: none !important; }
            .print\\:hidden { display: none !important; }
            .studygyaan-article table { display: table; overflow: visible; white-space: normal; }
          }
        `}} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col justify-center items-center bg-gray-50 px-4">
      <Loader2 className="h-12 w-12 text-blue-600 animate-spin mb-4" />
      <h2 className="text-xl font-bold text-gray-800">Preparing Premium Notes...</h2>
    </div>
  );
};

export default FileViewer;