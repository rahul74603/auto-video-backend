import { useState, useEffect } from 'react';
import { db } from '../../../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore'; // ✅ setDoc को यहाँ इम्पोर्ट किया है
import { Loader2, Settings, ShoppingCart, Book } from 'lucide-react';

const SettingsTab = () => {
  const [settings, setSettings] = useState({ shopActive: false, ebooksActive: false });
  const [loading, setLoading] = useState(true);

  // 1. डेटाबेस से सेटिंग्स लोड करना
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'siteSettings', 'controls');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings(docSnap.data() as any);
        }
      } catch (err) {
        console.error("Settings load error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // 2. बटन क्लिक करने पर डेटा सेव/अपडेट करना
  const toggleSetting = async (key: 'shopActive' | 'ebooksActive') => {
    const newStatus = !settings[key];
    const docRef = doc(db, 'siteSettings', 'controls');
    
    try {
      // 🔥 यहाँ setDoc का जादू है: 
      // merge: true का मतलब है कि पुराने डेटा को डिलीट मत करना, बस नया वाला अपडेट कर देना।
      await setDoc(docRef, { [key]: newStatus }, { merge: true });
      
      setSettings({ ...settings, [key]: newStatus });
      alert(`✅ ${key === 'shopActive' ? 'Shop' : 'E-Books'} ${newStatus ? 'चालू (ON)' : 'बंद (OFF)'} हो गया है।`);
    } catch (err) {
      console.error("Update error:", err);
      alert("Error: डेटाबेस में डेटा सेव नहीं हो पाया।");
    }
  };

  if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>;

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-sm border animate-in fade-in">
      <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-800 border-b pb-4">
        <Settings className="text-blue-600" /> Control Center
      </h3>

      <div className="space-y-6">
        {/* Premium Shop Toggle */}
        <div className="flex items-center justify-between p-5 bg-blue-50/30 rounded-2xl border border-blue-100">
          <div>
            <h4 className="font-bold flex items-center gap-2 text-blue-900"><ShoppingCart size={20}/> Premium Shop Section</h4>
            <p className="text-xs text-blue-600 font-medium">होमपेज पर Premium Notess दिखाएं या छुपाएं</p>
          </div>
          <button 
            onClick={() => toggleSetting('shopActive')}
            className={`px-8 py-2.5 rounded-xl font-black transition-all transform active:scale-95 shadow-md ${settings.shopActive ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {settings.shopActive ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* E-Books Store Toggle */}
        <div className="flex items-center justify-between p-5 bg-orange-50/30 rounded-2xl border border-orange-100">
          <div>
            <h4 className="font-bold flex items-center gap-2 text-orange-900"><Book size={20}/> E-Books Store Section</h4>
            <p className="text-xs text-orange-600 font-medium">होमपेज पर बेस्ट बुक्स वाला सेक्शन कंट्रोल करें</p>
          </div>
          <button 
            onClick={() => toggleSetting('ebooksActive')}
            className={`px-8 py-2.5 rounded-xl font-black transition-all transform active:scale-95 shadow-md ${settings.ebooksActive ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {settings.ebooksActive ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;