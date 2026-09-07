import { useState, useEffect } from 'react';
import { siteSettingsRepository } from '@/features/site-settings/data/siteSettingsRepository';
import { toast } from 'sonner';
import { asText } from '@/types/firestore';
import {
    Settings, Save, ShoppingBag,
    Megaphone, ToggleRight, ToggleLeft
} from 'lucide-react';

// =========================================================
// 🧾 SETTINGS TYPE (type alias → Record<string, unknown> compatible)
// =========================================================
type SiteSettingsState = {
    premiumBoxTitle: string;
    premiumBoxDesc: string;
    bottomBarText: string;
    premiumPrice: string;
    mrpPrice: string;
    discountPercent: string;
    popupActive: boolean;
    popupTitle: string;
    popupDescription: string;
    popupButtonText: string;
};

const strVal = (v: unknown, fb: string): string => (v !== undefined ? asText(v, fb) : fb);
const SiteSettings = () => {
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState<SiteSettingsState>({
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
        let cancelled = false;
        siteSettingsRepository.getGlobal()
            .then((data) => {
                if (cancelled || !data) return;
                setSettings(prev => ({
                    ...prev,
                    premiumBoxTitle: strVal(data['premiumBoxTitle'], prev.premiumBoxTitle),
                    premiumBoxDesc: strVal(data['premiumBoxDesc'], prev.premiumBoxDesc),
                    bottomBarText: strVal(data['bottomBarText'], prev.bottomBarText),
                    premiumPrice: strVal(data['premiumPrice'], prev.premiumPrice),
                    mrpPrice: strVal(data['mrpPrice'], prev.mrpPrice),
                    discountPercent: strVal(data['discountPercent'], prev.discountPercent),
                    popupActive: typeof data['popupActive'] === 'boolean'
                        ? data['popupActive']
                        : prev.popupActive,
                    popupTitle: strVal(data['popupTitle'], prev.popupTitle),
                    popupDescription: strVal(data['popupDescription'], prev.popupDescription),
                    popupButtonText: strVal(data['popupButtonText'], prev.popupButtonText)
                }));
            })
            .catch((err) => console.error("Settings fetch error:", err));
        return () => { cancelled = true; };
    }, []);

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
            await siteSettingsRepository.setGlobal(finalData, true);
            
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