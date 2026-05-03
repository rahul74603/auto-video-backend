// @ts-nocheck
import { useState, useEffect } from 'react';
import { db } from '../../../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore'; // setDoc को रहने दिया है
import { toast } from 'sonner';
import { 
    Settings, Save, Link as LinkIcon, ShoppingBag, 
    PlusCircle, Trash2, Megaphone, ToggleRight, ToggleLeft, BookOpen
} from 'lucide-react';

const SiteSettings = () => {
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState({
        sidebarLinks: [], // इसे खाली रखा है ताकि डेटाबेस से आए
        relatedBlogs: [],
        premiumBoxTitle: "",
        premiumBoxDesc: "",
        bottomBarText: "",
        premiumPrice: "0",
        mrpPrice: "0", 
        discountPercent: "0",
        popupActive: true,
        popupTitle: "",
        popupDescription: "",
        popupButtonText: ""
    });

    useEffect(() => {
        const fetchSettings = async () => {
            const docSnap = await getDoc(doc(db, "site_settings", "global"));
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSettings(prev => ({ ...prev, ...data }));
            }
        };
        fetchSettings();
    }, []);

    // --- Sidebar Links Handlers (For All-in-1 Sidebars) ---
    const addLink = () => {
        setSettings({ ...settings, sidebarLinks: [...(settings.sidebarLinks || []), { name: "", url: "" }] });
    };

    const removeLink = (index: number) => {
        const updated = settings.sidebarLinks.filter((_, i) => i !== index);
        setSettings({ ...settings, sidebarLinks: updated });
    };

    const updateLink = (index: number, field: 'name' | 'url', value: string) => {
        const updated = [...settings.sidebarLinks];
        updated[index][field] = value;
        setSettings({ ...settings, sidebarLinks: updated });
    };

    // --- Related Blogs Handlers (Trending Section) ---
    const addRelatedBlog = () => {
        setSettings({ ...settings, relatedBlogs: [...(settings.relatedBlogs || []), { title: "", url: "" }] });
    };

    const removeRelatedBlog = (index: number) => {
        const updated = settings.relatedBlogs.filter((_, i) => i !== index);
        setSettings({ ...settings, relatedBlogs: updated });
    };

    const updateRelatedBlog = (index: number, field: 'title' | 'url', value: string) => {
        const updated = [...settings.relatedBlogs];
        updated[index][field] = value;
        setSettings({ ...settings, relatedBlogs: updated });
    };

    // --- ✅ SAFE SAVE LOGIC (No Overwriting) ---
    const handleSave = async () => {
        setLoading(true);
        try {
            const mrp = parseInt(settings.mrpPrice || "0");
            const disc = parseInt(settings.discountPercent || "0");
            const calculatedPrice = Math.round(mrp * (1 - disc / 100)).toString();

            const finalData = {
                ...settings,
                premiumPrice: calculatedPrice
            };

            // 🔥 यहाँ 'merge: true' लगाया है ताकि 'mockBlogs' और 'mockLinks' डिलीट न हों
            await setDoc(doc(db, "site_settings", "global"), finalData, { merge: true });
            
            setSettings(finalData); 
            toast.success(`Settings Saved! Price set to: ₹${calculatedPrice} 🚀`);
        } catch (err) {
            toast.error("Save failed!");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="animate-in fade-in duration-500 font-hindi pb-20">
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
                <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white flex items-center justify-between">
                    <h2 className="text-xl font-black flex items-center gap-2">
                        <Settings className="w-6 h-6 animate-spin-slow" /> Master Control Panel
                    </h2>
                    <button onClick={handleSave} disabled={loading} className="bg-yellow-400 text-blue-900 px-6 py-2 rounded-xl font-black flex items-center gap-2 hover:bg-yellow-300 transition-all shadow-lg active:scale-95 disabled:opacity-50">
                        <Save size={18} /> {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>

                <div className="p-6 md:p-10 grid grid-cols-1 lg:grid-cols-2 gap-10">
                    
                    {/* LEFT COLUMN: LINKS & BLOGS */}
                    <div className="space-y-8">
                        {/* Section 1: Global Sidebar Links */}
                        <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="font-black text-blue-700 flex items-center gap-2 text-md uppercase tracking-tight">
                                    <LinkIcon size={20} /> Sidebar Quick Links
                                </h3>
                                <button onClick={addLink} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"><PlusCircle size={18} /></button>
                            </div>
                            <div className="space-y-3">
                                {settings.sidebarLinks?.map((link, idx) => (
                                    <div key={idx} className="flex gap-2 bg-white p-2 rounded-xl border border-slate-200">
                                        <input id={`sl-n-${idx}`} name={`sl-n-${idx}`} placeholder="Name" className="flex-1 p-2 text-xs font-bold outline-none" value={link.name} onChange={e => updateLink(idx, 'name', e.target.value)} />
                                        <input id={`sl-u-${idx}`} name={`sl-u-${idx}`} placeholder="URL" className="flex-1 p-2 text-[10px] text-blue-500 outline-none" value={link.url} onChange={e => updateLink(idx, 'url', e.target.value)} />
                                        <button onClick={() => removeLink(idx)} className="text-red-400 p-1"><Trash2 size={16}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Section 2: Trending Blogs */}
                        <div className="bg-purple-50/50 p-6 rounded-[32px] border border-purple-100">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="font-black text-purple-700 flex items-center gap-2 text-md uppercase tracking-tight">
                                    <BookOpen size={20} /> Trending Blog Links
                                </h3>
                                <button onClick={addRelatedBlog} className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all"><PlusCircle size={18} /></button>
                            </div>
                            <div className="space-y-3">
                                {settings.relatedBlogs?.map((blog, idx) => (
                                    <div key={idx} className="flex gap-2 bg-white p-2 rounded-xl border border-purple-100">
                                        <input id={`rb-t-${idx}`} name={`rb-t-${idx}`} placeholder="Blog Title" className="flex-1 p-2 text-xs font-bold outline-none" value={blog.title} onChange={e => updateRelatedBlog(idx, 'title', e.target.value)} />
                                        <input id={`rb-u-${idx}`} name={`rb-u-${idx}`} placeholder="URL" className="flex-1 p-2 text-[10px] text-purple-500 outline-none" value={blog.url} onChange={e => updateRelatedBlog(idx, 'url', e.target.value)} />
                                        <button onClick={() => removeRelatedBlog(idx)} className="text-red-400 p-1"><Trash2 size={16}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: PRICING & PROMO */}
                    <div className="space-y-8">
                        <div className="bg-blue-50/50 p-6 rounded-[32px] border border-blue-100">
                            <h3 className="font-black text-blue-700 mb-6 flex items-center gap-2 uppercase text-sm"><ShoppingBag size={18} /> Pricing & Sale</h3>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label htmlFor="mrp" className="text-[10px] font-black text-slate-400 uppercase mb-1 block">MRP (₹)</label>
                                    <input id="mrp" name="mrp" type="number" className="w-full p-3 border border-slate-200 rounded-xl font-bold" value={settings.mrpPrice} onChange={e => setSettings({...settings, mrpPrice: e.target.value})} />
                                </div>
                                <div>
                                    <label htmlFor="disc" className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Discount (%)</label>
                                    <input id="disc" name="disc" type="number" className="w-full p-3 border border-slate-200 rounded-xl font-bold text-red-600" value={settings.discountPercent} onChange={e => setSettings({...settings, discountPercent: e.target.value})} />
                                </div>
                            </div>
                            <div className="p-4 bg-white rounded-2xl border-2 border-blue-100 text-center">
                                <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Selling Price Preview</p>
                                <p className="text-4xl font-black text-blue-800">₹{Math.round(parseInt(settings.mrpPrice || "0") * (1 - parseInt(settings.discountPercent || "0") / 100))}</p>
                            </div>
                        </div>

                        <div className="bg-emerald-50/50 p-6 rounded-[32px] border border-emerald-100">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="font-black text-emerald-700 flex items-center gap-2 uppercase text-sm"><Megaphone size={18} /> Promo Popup</h3>
                                <button onClick={() => setSettings({...settings, popupActive: !settings.popupActive})}>
                                    {settings.popupActive ? <ToggleRight size={32} className="text-emerald-600"/> : <ToggleLeft size={32} className="text-slate-300"/>}
                                </button>
                            </div>
                            <input id="p-t" name="p-t" placeholder="Popup Title" className="w-full p-3 border rounded-xl font-bold text-sm mb-3" value={settings.popupTitle} onChange={e => setSettings({...settings, popupTitle: e.target.value})} />
                            <textarea id="p-d" name="p-d" placeholder="Description" rows={2} className="w-full p-3 border rounded-xl text-xs mb-3" value={settings.popupDescription} onChange={e => setSettings({...settings, popupDescription: e.target.value})} />
                            <input id="p-b" name="p-b" placeholder="Button Text" className="w-full p-3 border rounded-xl font-bold text-xs" value={settings.popupButtonText} onChange={e => setSettings({...settings, popupButtonText: e.target.value})} />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default SiteSettings;