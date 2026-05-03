// @ts-nocheck
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../../firebase/config'; 
import { Trash2, Edit3, Sparkles, Clock, RotateCw } from 'lucide-react'; 
import toast from 'react-hot-toast'; 

const AdminJobDrafts = () => {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();

  // 1. AI Drafts को Firestore से लोड करना
  const fetchDrafts = async () => {
    try {
      const q = query(collection(db, "job_drafts"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDrafts(data);
    } catch (error) {
      console.error("Error fetching drafts:", error);
      toast.error("डेटा लोड करने में समस्या आई");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchDrafts(); 
  }, []);

  // 🚀 बैकएंड इंजन (Cloud Function) को ट्रिगर करना
  const handleRefreshJobs = async () => {
    setIsRefreshing(true);
    const toastId = toast.loading("AI इंटरनेट पर नई जॉब्स ढूँढ रहा है...");

    try {
      const response = await fetch('https://fetchlatestgovtjobs-hf6vlh5cpq-uc.a.run.app?key=StudyGyaan_786_Secure');
      const result = await response.json();

      if (result.success) {
        toast.success(result.message || "नई जॉब्स मिल गई हैं!", { id: toastId });
        fetchDrafts(); 
      } else {
        toast.error("कोई नई जॉब नहीं मिली", { id: toastId });
      }
    } catch (error) {
      console.error("Refresh Error:", error);
      toast.error("बैकएंड इंजन कनेक्ट नहीं हो पाया", { id: toastId });
    } finally {
      setIsRefreshing(false);
    }
  };

  // 2. किसी ड्राफ्ट को डिलीट करना
  const handleDelete = async (id) => {
    if(window.confirm("क्या आप इस ड्राफ्ट को हटाना चाहते हैं?")) {
      try {
        await deleteDoc(doc(db, "job_drafts", id));
        toast.success("Draft Deleted!");
        fetchDrafts();
      } catch (err) {
        toast.error("डिलीट नहीं हो पाया");
      }
    }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 rounded-full border-t-transparent mb-4"></div>
        <p className="font-black text-blue-600 uppercase tracking-widest text-xs">Loading AI Drafts...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen font-hindi">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter">
                <Sparkles className="text-blue-600" /> AI Pending Updates 
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total {drafts.length} jobs waiting for review</p>
            </div>

            <button 
                onClick={handleRefreshJobs}
                disabled={isRefreshing}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 ${
                    isRefreshing ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                }`}
            >
                {isRefreshing ? <RotateCw size={16} className="animate-spin" /> : <RotateCw size={16} />}
                {isRefreshing ? 'Discovering...' : 'Refresh Latest Jobs'}
            </button>
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900 text-white text-[10px] uppercase tracking-[0.2em]">
                <tr>
                    <th className="p-6">Job Details</th>
                    <th className="p-6">Found On</th>
                    <th className="p-6 text-center">Actions</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                {drafts.map((job) => (
                    <tr key={job.id} className="hover:bg-blue-50/30 transition-all group">
                    <td className="p-6">
                        <p className="font-black text-slate-800 text-sm md:text-lg leading-tight group-hover:text-blue-600 transition-colors">{job.title}</p>
                        <div className="flex gap-2 mt-2">
                            <span className="bg-blue-50 text-blue-600 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border border-blue-100">{job.organization || 'StudyGyaan AI'}</span>
                            <span className="bg-emerald-50 text-emerald-600 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border border-emerald-100">{job.category || 'Latest Job'}</span>
                        </div>
                    </td>
                    <td className="p-6 text-slate-500 text-xs font-bold">
                        <span className="flex items-center gap-2 bg-slate-100 w-fit px-3 py-1.5 rounded-full">
                          <Clock size={14} className="text-slate-400"/> 
                          {job.createdAt?.seconds ? new Date(job.createdAt.seconds * 1000).toLocaleDateString() : 'New'}
                        </span>
                    </td>
                    <td className="p-6">
                        <div className="flex justify-center gap-3">
                        <button 
                            onClick={() => navigate('/secret-admin', { 
                              state: { 
                                activeTab: 'BROWSE', 
                                draftData: job,
                                draftId: job.id 
                              } 
                            })}
                            className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-800 shadow-lg shadow-blue-100 transition-all active:scale-90"
                            title="Review & Publish"
                        >
                            <Edit3 size={20} />
                        </button>
                        <button 
                            onClick={() => handleDelete(job.id)}
                            className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all active:scale-90"
                            title="Delete Draft"
                        >
                            <Trash2 size={20} />
                        </button>
                        </div>
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
          </div>
          
          {drafts.length === 0 && (
            <div className="p-24 text-center">
              <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                 <Sparkles className="text-blue-400" size={40} />
              </div>
              <h4 className="font-black text-slate-800 uppercase text-sm tracking-widest">No New Drafts Found</h4>
              <p className="text-slate-400 text-xs mt-2 font-bold max-w-xs mx-auto italic">AI इंजन चलाने के लिए ऊपर दिए गए 'Refresh' बटन पर क्लिक करें।</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminJobDrafts;