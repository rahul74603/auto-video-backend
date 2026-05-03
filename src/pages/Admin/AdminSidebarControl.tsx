// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config'; 
import { Save, Plus, Trash2, Sparkles, Link2, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

const AdminSidebarControl = () => {
  const [settings, setSettings] = useState({
    shopUpdates: [],
    jobUpdates: [],
    pdfUpdates: [],
    eBookUpdates: [], 
    mockBlogs: [],    // ✅ Mock Test: Trending Blogs के लिए
    mockLinks: []     // ✅ Mock Test: Important Links के लिए
  });
  const [loading, setLoading] = useState(true);

  // --- 📥 DATABASE SE DATA LANA ---
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, "site_settings", "global"));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings({
            shopUpdates: data.shopUpdates || [],
            jobUpdates: data.jobUpdates || [],
            pdfUpdates: data.pdfUpdates || [],
            eBookUpdates: data.eBookUpdates || [],
            mockBlogs: data.mockBlogs || [],
            mockLinks: data.mockLinks || []
          });
        }
      } catch (err) {
        console.error("Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleAdd = (section) => {
    setSettings({ ...settings, [section]: [...settings[section], { title: '', url: '' }] });
  };

  const handleChange = (section, index, field, value) => {
    const updated = [...settings[section]];
    updated[index][field] = value;
    setSettings({ ...settings, [section]: updated });
  };

  const handleRemove = (section, index) => {
    const updated = settings[section].filter((_, i) => i !== index);
    setSettings({ ...settings, [section]: updated });
  };

  // --- 📤 DATABASE ME SAVE KARNA ---
  const handleSave = async () => {
    try {
      await updateDoc(doc(db, "site_settings", "global"), settings);
      toast.success("All Sidebar Settings Updated! 🚀");
    } catch (err) {
      toast.error("Error updating settings!");
    }
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50 font-hindi">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
        <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Loading Settings...</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-10 bg-slate-50 min-h-screen font-hindi">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* --- HEADER --- */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-8">
            <div>
                <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                    <Sparkles className="text-blue-600"/> SIDEBAR LINKS MANAGER
                </h2>
                <p className="text-slate-500 font-bold text-sm">Control all dynamic sidebar links from one place</p>
            </div>
            <button onClick={handleSave} className="w-full md:w-auto px-8 py-4 bg-blue-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-blue-100 hover:bg-slate-900 transition-all active:scale-95">
              <Save size={20}/> SAVE ALL SETTINGS
            </button>
        </div>

        {/* --- DYNAMIC SECTIONS GRID --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* ✅ यहाँ सारे 6 सेक्शन्स की लिस्ट है, Mock Test वाले भी शामिल हैं */}
            {['shopUpdates', 'jobUpdates', 'pdfUpdates', 'eBookUpdates', 'mockBlogs', 'mockLinks'].map((section) => (
            <div key={section} className="bg-white p-6 rounded-[35px] shadow-sm border border-slate-100 flex flex-col h-full transition-all hover:shadow-md">
                <h3 className="text-[11px] font-black uppercase mb-6 text-blue-600 tracking-[0.15em] flex items-center gap-2 border-b pb-3">
                    <Link2 size={16} />
                    {section === 'shopUpdates' ? 'Shop Page Links (Premium)' : 
                     section === 'jobUpdates' ? 'Jobs Page Links' : 
                     section === 'pdfUpdates' ? 'PDF Page Links (Free)' : 
                     section === 'eBookUpdates' ? 'E-Book Page Links (Notes)' :
                     section === 'mockBlogs' ? 'Mock Test: Trending Blogs' : 'Mock Test: Important Links'}
                </h3>
                
                <div className="space-y-4 flex-1">
                {settings[section].length === 0 ? (
                    <div className="py-8 text-center border-2 border-dashed border-slate-50 rounded-3xl">
                        <p className="text-[10px] font-black text-slate-300 uppercase italic">No links added in this section</p>
                    </div>
                ) : (
                    settings[section].map((item, index) => (
                        <div key={index} className="space-y-3 bg-slate-50 p-4 rounded-3xl border border-slate-100 relative group">
                            {/* Browser Warning Fix: id and name added to every input */}
                            <div>
                                <label htmlFor={`${section}-title-${index}`} className="text-[9px] font-black text-slate-400 uppercase ml-1">Title</label>
                                <input 
                                    id={`${section}-title-${index}`}
                                    name={`${section}-title-${index}`}
                                    placeholder="e.g. RRB ALP Secret Strategy" 
                                    value={item.title} 
                                    onChange={(e) => handleChange(section, index, 'title', e.target.value)}
                                    className="w-full bg-white p-3 rounded-xl text-sm font-bold text-slate-800 border border-slate-200 focus:ring-2 focus:ring-blue-100 outline-none"
                                />
                            </div>
                            <div>
                                <label htmlFor={`${section}-url-${index}`} className="text-[9px] font-black text-slate-400 uppercase ml-1">URL / Path</label>
                                <input 
                                    id={`${section}-url-${index}`}
                                    name={`${section}-url-${index}`}
                                    placeholder="e.g. /blog/post-name or https://..." 
                                    value={item.url} 
                                    onChange={(e) => handleChange(section, index, 'url', e.target.value)}
                                    className="w-full bg-white p-3 rounded-xl text-xs font-medium text-blue-600 border border-slate-200 focus:ring-2 focus:ring-blue-100 outline-none"
                                />
                            </div>
                            <button 
                                onClick={() => handleRemove(section, index)} 
                                className="absolute top-2 right-2 p-2 text-slate-300 hover:text-red-500 transition-colors bg-white rounded-full shadow-sm border border-slate-100"
                                title="Remove Link"
                            >
                                <Trash2 size={14}/>
                            </button>
                        </div>
                    ))
                )}
                </div>
                
                <button onClick={() => handleAdd(section)} className="mt-6 w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-[11px] font-black uppercase text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-all group">
                    <Plus size={16} className="group-hover:rotate-90 transition-transform"/> Add New Link
                </button>
            </div>
            ))}
        </div>

        {/* --- FOOTER SAVE BAR --- */}
        <div className="bg-slate-900 p-8 rounded-[40px] flex flex-col md:flex-row justify-between items-center gap-6 text-white shadow-2xl">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                    <BookOpen size={24} className="text-blue-400"/>
                </div>
                <div>
                    <p className="font-black text-lg">Update Global Site Data</p>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Ensures all pages are in sync</p>
                </div>
            </div>
            <button onClick={handleSave} className="w-full md:w-auto px-12 py-5 bg-white text-slate-900 rounded-2xl font-black shadow-lg hover:bg-blue-600 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-3">
                <Save size={22}/> CONFIRM CHANGES
            </button>
        </div>

      </div>
    </div>
  );
};

export default AdminSidebarControl;