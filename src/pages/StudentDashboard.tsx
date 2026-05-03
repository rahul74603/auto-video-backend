// @ts-nocheck
import { useEffect, useState } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore'; 
import { BookOpen, LogOut, Download, PlayCircle, Lock, ChevronRight, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

const StudentDashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [purchasedCourses, setPurchasedCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [courseContent, setCourseContent] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchMyCourses(currentUser.email);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchMyCourses = async (email: string | null) => {
    if (!email) return;
    try {
      const q = query(
        collection(db, "orders"), 
        where("customerEmail", "==", email), 
        where("status", "==", "completed")   
      );
      
      const snapshot = await getDocs(q);
      
      let courses: any[] = [];
      snapshot.forEach(doc => {
        const orderData = doc.data();
        if(orderData.items) {
            orderData.items.forEach((item: any) => {
                if(item.product) courses.push(item.product);
                else courses.push(item);
            });
        }
      });
      
      const uniqueCourses = courses.filter((v,i,a)=>a.findIndex(v2=>(v2.id===v.id))===i);
      setPurchasedCourses(uniqueCourses);
    } catch (error) {
      console.error("Error fetching courses", error);
    } finally {
      setLoading(false);
    }
  };

  const openCourse = async (course: any) => {
    setSelectedCourse(course);
    // document.title यहाँ से हटा दिया गया है क्योंकि SEO कम्पोनेंट इसे संभालेगा
    
    const q = query(collection(db, `courses/${course.id}/content`));
    const snapshot = await getDocs(q);
    setCourseContent(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const closeCourse = () => {
    setSelectedCourse(null);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm md:text-base font-hindi">डैशबोर्ड लोड हो रहा है... ✨</div>;

  if (!user) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-3 md:p-4 font-hindi">
      <Lock className="w-8 h-8 md:w-12 md:h-12 text-gray-400 mb-3 md:mb-4"/>
      <h2 className="text-lg md:text-2xl font-bold text-gray-800">लॉगिन आवश्यक है</h2>
      <p className="text-xs md:text-base text-gray-600 mb-4 md:mb-6">अपने खरीदे गए कोर्सेज देखने के लिए कृपया लॉगिन करें।</p>
      <Link to="/" className="bg-blue-600 text-white px-4 md:px-6 py-1.5 md:py-2 rounded-md md:rounded-lg font-bold text-sm md:text-base shadow-lg">होम पर जाएं और लॉगिन करें</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-6 md:py-10 px-3 md:px-4 font-hindi">
      
      {/* 🔥 डायनामिक SEO: टैब का नाम कोर्स के हिसाब से बदलेगा, पर गूगल इसे इंडेक्स नहीं करेगा */}
      <SEO 
        customTitle={selectedCourse ? `${selectedCourse.title} - Learning Hub | StudyGyaan` : "My Dashboard - StudyGyaan 2026"}
        customDescription="Access your purchased study materials and premium courses on StudyGyaan Learning Dashboard."
      />
      
      {/* 🔐 सुरक्षा: डैशबोर्ड को गूगल से गुप्त (Private) रखने के लिए */}
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-4 md:mb-8 bg-white p-4 md:p-6 rounded-lg md:rounded-xl shadow-sm border border-slate-100">
            <div>
                <h1 className="text-lg md:text-3xl font-black text-slate-800">My Learning Dashboard 🎓</h1>
                <p className="text-slate-500 text-xs md:text-base mt-0.5 md:mt-1 font-bold">Welcome back, <span className="text-blue-600">{user.displayName || user.email}</span></p>
            </div>
            <button onClick={() => signOut(auth)} className="flex items-center gap-1.5 md:gap-2 text-red-600 hover:bg-red-50 px-2.5 md:px-4 py-1.5 md:py-2 rounded-md md:rounded-lg border border-red-200 transition text-[10px] md:text-base shrink-0 font-black">
                <LogOut className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]"/> <span className="hidden sm:inline">Logout</span>
            </button>
        </div>

        {selectedCourse ? (
            <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl shadow-lg animate-in fade-in slide-in-from-bottom-2 border border-slate-100">
                <button onClick={closeCourse} className="text-slate-400 mb-2 md:mb-4 hover:text-blue-600 font-black flex items-center gap-1 text-[10px] md:text-base transition-colors">
                  <ArrowLeft className="w-3 h-3 md:w-5 md:h-5"/> Back to My Courses
                </button>
                <div className="border-b border-slate-50 pb-2 md:pb-4 mb-4 md:mb-6">
                    <h2 className="text-lg md:text-2xl font-black text-blue-900 uppercase tracking-tight">{selectedCourse.title}</h2>
                    <p className="text-slate-400 text-[10px] md:text-sm mt-0.5 md:mt-1 font-bold uppercase tracking-widest">Premium Course Content</p>
                </div>
                
                {courseContent.length === 0 ? (
                    <div className="text-center py-6 md:py-10 bg-slate-50 rounded-lg md:rounded-xl border border-dashed border-slate-200">
                        <p className="text-slate-400 italic text-[10px] md:text-base font-bold">No content uploaded by Admin yet.</p>
                        <p className="text-[8px] md:text-xs text-slate-400 mt-0.5 md:mt-1">Please check back later or contact support.</p>
                    </div>
                ) : (
                    <div className="grid gap-2 md:gap-4">
                        {courseContent.map((item: any) => (
                            <div key={item.id} className="flex justify-between items-center p-2.5 md:p-4 border border-slate-100 rounded-lg md:rounded-xl hover:border-blue-400 hover:bg-blue-50 transition group bg-white shadow-sm gap-2">
                                <div className="flex items-center gap-2.5 md:gap-4 flex-1 min-w-0">
                                    <div className={`p-2 md:p-3 rounded-md md:rounded-lg shrink-0 ${item.type === 'VIDEO' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-500'}`}>
                                        {item.type === 'VIDEO' ? <PlayCircle className="w-4 h-4 md:w-6 md:h-6"/> : <BookOpen className="w-4 h-4 md:w-6 md:h-6"/>}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="font-black text-xs md:text-lg text-slate-800 block truncate leading-tight">{item.title}</span>
                                        <span className="text-[8px] md:text-xs text-slate-400 font-black uppercase tracking-wider mt-0.5">{item.type}</span>
                                    </div>
                                </div>
                                <a href={item.link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 md:gap-2 bg-blue-600 text-white px-3 md:px-5 py-1.5 md:py-2.5 rounded-md md:rounded-lg hover:bg-slate-900 font-black shadow-md transition transform active:scale-95 text-[10px] md:text-base shrink-0 uppercase tracking-tighter">
                                    <Download className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]"/> Open
                                </a>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                {purchasedCourses.length === 0 ? (
                    <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center py-10 md:py-20 bg-white rounded-xl md:rounded-[2.5rem] border border-dashed border-slate-200 shadow-sm">
                        <div className="bg-slate-50 w-12 h-12 md:w-20 md:h-20 rounded-full flex items-center justify-center mx-auto mb-2.5 md:mb-4 text-slate-300">
                            <BookOpen className="w-6 h-6 md:w-10 md:h-10"/>
                        </div>
                        <h3 className="text-sm md:text-xl font-black text-slate-400 uppercase">No Courses Yet</h3>
                        <p className="text-[10px] md:text-base text-slate-400 mt-1 md:mt-2 mb-4 md:mb-6 font-bold">You haven't purchased any premium courses yet.</p>
                        <Link to="/" className="bg-blue-600 text-white px-5 md:px-10 py-2 md:py-4 rounded-lg md:rounded-xl font-black hover:bg-slate-900 shadow-xl transition text-[10px] md:text-base uppercase tracking-widest">Browse Store</Link>
                    </div>
                ) : (
                    purchasedCourses.map((course: any, index: number) => (
                        <div key={index} className="bg-white border border-slate-100 p-3.5 md:p-6 rounded-xl md:rounded-[2rem] shadow-sm hover:shadow-xl transition-all group relative overflow-hidden flex flex-col hover:-translate-y-1">
                            <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[8px] md:text-[10px] font-black px-2 md:px-4 py-1 rounded-bl-xl shadow-sm">PREMIUM</div>
                            <div className="h-8 w-8 md:h-14 md:w-14 bg-gradient-to-br from-blue-100 to-blue-50 rounded-lg md:rounded-2xl flex items-center justify-center text-blue-600 mb-2.5 md:mb-4 shadow-inner border border-blue-100">
                                <Crown className="w-4 h-4 md:w-7 md:h-7"/>
                            </div>
                            <h3 className="text-xs md:text-xl font-black text-slate-800 mb-1 md:mb-2 line-clamp-1 uppercase tracking-tighter">{course.title}</h3>
                            <p className="text-[9px] md:text-sm text-slate-400 mb-3 md:mb-6 line-clamp-2 font-bold">{course.description || "Learn from expert-curated materials."}</p>
                            <button onClick={() => openCourse(course)} className="w-full mt-auto bg-slate-900 text-white py-2 md:py-3.5 rounded-lg md:rounded-xl font-black hover:bg-blue-600 flex items-center justify-center gap-1.5 md:gap-2 transition transform group-hover:shadow-lg text-[10px] md:text-base uppercase tracking-widest">
                                Start Learning <ChevronRight className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]"/>
                            </button>
                        </div>
                    ))
                )}
            </div>
        )}
      </div>
    </div>
  );
};

// Internal utility to keep Lucide imports clean
const ArrowLeft = ({className, size}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size || "24"} height={size || "24"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
);

export default StudentDashboard;