// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { db } from '@/firebase/config'; 
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { Save, Trash2, Edit2, Database, Plus, X, CheckCircle, RefreshCw, Loader2, Filter } from 'lucide-react';

const FastTrackManager = () => {
  const [updates, setUpdates] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  
  const [activeTab, setActiveTab] = useState('draft'); 

  const [formData, setFormData] = useState({
    title: '', category: 'Result', org: '', updateDate: '', shortInfo: '', directLink: '', status: 'draft' 
  });

  useEffect(() => {
    const q = query(collection(db, "fast_track"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUpdates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 🚀 NEW: GitHub Actions Webhook Trigger
  const triggerGitHubVideoRender = async (jobData) => {
    // 🚨 FIX: Token Sanitize & Bearer Auth
    const rawPat = import.meta.env.VITE_GITHUB_PAT || "";
    const GITHUB_PAT = rawPat.replace(/['"]/g, '').trim(); 
    const GITHUB_OWNER = import.meta.env.VITE_GITHUB_OWNER; 
    const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO;   
    
    console.log("Token Check:", GITHUB_PAT ? "Token Mil Gaya" : "Token GAYAB Hai!");
    
    if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) {
        console.warn("GitHub Credentials missing in .env, video render skipped.");
        return;
    }

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`;

    try {
        await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `Bearer ${GITHUB_PAT}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event_type: 'generate_video', 
                client_payload: {
                    jobData: jobData
                }
            })
        });
        console.log("✅ GitHub Action Triggered for Fast Track Video!");
    } catch (err) {
        console.error("❌ GitHub Action Failed:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.directLink) return alert("Title and Direct Link are required!");
    
    setLoading(true);
    try {
      if (editingId) {
        const docRef = doc(db, "fast_track", editingId);
        await updateDoc(docRef, formData);
        alert("Update Saved! ✅");
      } else {
        await addDoc(collection(db, "fast_track"), {
          ...formData,
          createdAt: serverTimestamp() 
        });
        
        // 🚨 अगर डायरेक्ट "Published" स्टेटस के साथ नया ऐड किया है, तो वीडियो बनाओ
        if (formData.status === 'published') {
            await triggerGitHubVideoRender(formData);
        }
        
        alert("New Update Added! 🚀");
      }
      
    setFormData({ title: '', category: 'Result', org: '', updateDate: '', shortInfo: '', directLink: '', status: 'draft' });
      setEditingId(null);
    } catch (error) {
      console.error("Error saving document: ", error);
      alert("Error: " + error.message);
    }
    setLoading(false);
  };

  const handleEdit = (item) => {
    setFormData({
      title: item.title,
      category: item.category,
      org: item.org || '',
      updateDate: item.updateDate || '',
      shortInfo: item.shortInfo || '',
      directLink: item.directLink || '',
      status: item.status || 'published'
    });
    setEditingId(item.id);
    window.scrollTo(0, 0); 
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to DELETE this? ❌")) {
      await deleteDoc(doc(db, "fast_track", id));
    }
  };

  const handleApprove = async (item) => {
    if (window.confirm("Approve and make it LIVE on website? 🚀")) {
      await updateDoc(doc(db, "fast_track", item.id), { status: 'published' });
      
      // 🚨 अप्रूव होते ही GitHub को वीडियो बनाने का सिग्नल भेजो
      const liveData = { ...item, status: 'published' };
      await triggerGitHubVideoRender(liveData);
    }
  };

  const handleManualFetch = async () => {
    const isConfirm = window.confirm("Are you sure? This will fetch new Fast Track updates from the website.");
    if (!isConfirm) return;

    setIsFetching(true);
    try {
        const response = await fetch("https://us-central1-studymaterial-406ad.cloudfunctions.net/fetchFastTrackUpdates?key=StudyGyaan_FastTrack_786");
        const data = await response.json();
        
        if (data.success) {
            alert(`✅ Success! ${data.updatesFound} new updates fetched and saved as Draft!`);
        } else {
            alert("⚠️ Something went wrong!");
        }
    } catch (error) {
        alert("❌ Error fetching data: " + error.message);
    } finally {
        setIsFetching(false);
    }
  };

  const filteredUpdates = updates.filter(item => {
    if (activeTab === 'all') return true;
    return item.status === activeTab || (activeTab === 'published' && !item.status);
  });

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen font-hindi">
      
      <div className="mb-8 border-b border-slate-200 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-3">
            <Database className="text-blue-600" /> Fast Track <span className="text-blue-600">Database</span>
          </h2>
          <p className="text-slate-500 font-bold text-sm uppercase mt-1">Manage Results, Admit Cards, Keys & Drafts</p>
        </div>

        <button 
          onClick={handleManualFetch} 
          disabled={isFetching}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-200 active:scale-95 transition-all"
        >
          {isFetching ? <Loader2 className="animate-spin w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
          {isFetching ? "Fetching Data..." : "Auto Fetch Now"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* 📝 LEFT SIDE: FORM */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-blue-100 sticky top-4">
            <h3 className="font-black text-blue-700 mb-6 text-xl uppercase flex items-center gap-2">
              {editingId ? <><Edit2 size={20}/> Edit Update</> : <><Plus size={20}/> Add New Update</>}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Category</label>
                  <select name="category" value={formData.category} onChange={handleChange} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200">
                    <option value="Result">Result</option>
                    <option value="Admit Card">Admit Card</option>
                    <option value="Answer Key">Answer Key</option>
                    <option value="Syllabus">Syllabus</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Status</label>
                  <select name="status" value={formData.status} onChange={handleChange} className={`w-full p-3 border rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200 ${formData.status === 'draft' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                    <option value="published">🟢 Published (Live)</option>
                    <option value="draft">🟡 Draft (Hidden)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Job Title / Name *</label>
                <input required name="title" value={formData.title} onChange={handleChange} placeholder="e.g. SSC CGL 2026 Tier 1 Result" className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Organization</label>
                  <input name="org" value={formData.org} onChange={handleChange} placeholder="e.g. SSC" className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Update Date</label>
                  <input name="updateDate" value={formData.updateDate} onChange={handleChange} placeholder="e.g. 15 March 2026" className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Short Description</label>
                <textarea rows={3} name="shortInfo" value={formData.shortInfo} onChange={handleChange} placeholder="Write a few lines about this update..." className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Direct Link (URL) *</label>
                <input required name="directLink" value={formData.directLink} onChange={handleChange} placeholder="https://ssc.nic.in/..." className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl font-black text-sm uppercase shadow-lg shadow-blue-200 active:scale-95 transition-all flex justify-center items-center gap-2">
                  <Save size={18} /> {loading ? "Saving..." : (editingId ? "Update Now" : "Publish")}
                </button>
                {editingId && (
                  <button type="button" onClick={() => { setEditingId(null); setFormData({ title: '', category: 'Result', org: '', updateDate: '', shortInfo: '', directLink: '', status: 'draft' }); }} className="p-4 bg-slate-200 text-slate-600 rounded-2xl hover:bg-slate-300 font-black transition-all">
                    <X size={18} />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* 🗄️ RIGHT SIDE: DATABASE LIST WITH TABS */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100 h-full max-h-[85vh] flex flex-col">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <h3 className="font-black text-slate-800 text-xl uppercase flex items-center gap-2">
                <Filter size={20} className="text-blue-500"/> Updates List
                <span className="text-xs bg-slate-100 px-3 py-1 rounded-full text-slate-500">{filteredUpdates.length} found</span>
              </h3>

              <div className="flex bg-slate-100 p-1.5 rounded-xl">
                <button 
                  onClick={() => setActiveTab('draft')} 
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'draft' ? 'bg-white shadow-sm text-yellow-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  🟡 Pending Drafts
                </button>
                <button 
                  onClick={() => setActiveTab('published')} 
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'published' ? 'bg-white shadow-sm text-green-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  🟢 Live Updates
                </button>
                <button 
                  onClick={() => setActiveTab('all')} 
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'all' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  All
                </button>
              </div>
            </div>
            
            <div className="space-y-3 overflow-y-auto custom-scrollbar pr-2 flex-1">
              {filteredUpdates.map((item) => {
                const isDraft = item.status === 'draft';
                return (
                  <div key={item.id} className={`flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-2xl hover:shadow-md transition-shadow group ${isDraft ? 'bg-yellow-50/50 border-yellow-200' : 'bg-slate-50/50 border-slate-100'}`}>
                    <div className="mb-3 md:mb-0 pr-4">
                      <div className="flex items-center gap-2 mb-2">
                        {isDraft ? (
                          <span className="bg-yellow-200 text-yellow-800 text-[9px] font-black uppercase px-2 py-1 rounded-md animate-pulse">Draft</span>
                        ) : (
                          <span className="bg-green-100 text-green-700 text-[9px] font-black uppercase px-2 py-1 rounded-md">Live</span>
                        )}
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md inline-block ${
    item.category === 'Result' ? 'bg-green-100 text-green-700' : 
    item.category === 'Admit Card' ? 'bg-red-100 text-red-700' : 
    item.category === 'Answer Key' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
}`}>
    {item.category}
</span>

{item.syllabusPDF && (
    <a 
        href={item.syllabusPDF} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="bg-purple-100 text-purple-700 text-[9px] font-black uppercase px-2 py-1 rounded-md hover:bg-purple-200 transition-colors inline-flex items-center gap-1"
    >
        📄 View PDF
    </a>
)}
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm leading-tight group-hover:text-blue-600 transition-colors">{item.title}</h4>
                      <p className="text-xs text-slate-400 mt-1 truncate max-w-md">{item.directLink}</p>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      {isDraft && (
                        <button onClick={() => handleApprove(item)} className="p-2 bg-green-50 text-green-600 hover:bg-green-600 hover:text-white rounded-xl transition-colors font-bold text-xs flex items-center gap-1">
                          <CheckCircle size={14} /> Approve
                        </button>
                      )}
                      <button onClick={() => handleEdit(item)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-colors font-bold text-xs flex items-center gap-1">
                        <Edit2 size={14} /> Edit
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
              
              {filteredUpdates.length === 0 && (
                <div className="text-center py-20 text-slate-400 font-bold italic">
                  No updates found in this tab!
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; rounded-full: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default FastTrackManager;