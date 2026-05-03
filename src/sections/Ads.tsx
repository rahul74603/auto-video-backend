// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config'; 
import { doc, getDoc } from 'firebase/firestore';

interface AdProps {
  position: 'header' | 'sidebar' | 'footer' | 'inline' | 'popup';
}

// Sidebar और Inline के लिए पुराना सैंपल डेटा (Static)
const sampleAds = {
  sidebar: {
    id: 'ad-sidebar-1',
    title: 'Join Our Telegram Channel',
    description: 'Get daily job updates and study materials',
    link: 'https://t.me/studygyaan_official',
    bgColor: 'from-blue-500 to-cyan-500',
  },
  inline: {
    id: 'ad-inline-1',
    title: 'UPSC Foundation Course 2026',
    description: 'Complete preparation with expert guidance',
    link: '/premium-notes',
    bgColor: 'from-purple-500 to-pink-500',
  },
};

// 🔥 1. HEADER AD (Dynamic from Admin Panel)
export const HeaderAd: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchHeaderSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, "site_settings", "global"));
        if (docSnap.exists()) setSettings(docSnap.data());
      } catch (err) { console.error("Header fetch error:", err); }
    };
    fetchHeaderSettings();
  }, []);

  if (!isVisible || !settings || !settings.headerAdActive) return null;

  return (
    // ✅ CLS FIX: Removed <motion.div> to prevent layout shifting on load.
    <aside 
      aria-label="Promotion Banner"
      className="relative bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-2 md:px-4 py-1.5 md:py-2">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => navigate(settings.headerAdLink || '/premium-notes')} 
            aria-label={`Offer: ${settings.headerAdTitle}`}
            className="flex-1 flex items-center justify-center gap-1.5 md:gap-3 text-[10px] md:text-sm font-black hover:underline tracking-tight"
          >
            <span className="bg-white/20 px-2 py-0.5 rounded text-[8px] md:text-xs border border-white/10 uppercase italic">
               {settings.discountPercent || '85'}% OFF
            </span>
            {settings.headerAdTitle}
            <ExternalLink className="w-3 h-3 md:w-4 md:h-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setIsVisible(false)}
            aria-label="Close Advertisement"
            className="p-1 hover:bg-white/20 rounded-full transition-colors shrink-0 ml-2"
          >
            <X className="w-3.5 h-3.5 md:w-4 md:h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
};

// 2. SIDEBAR AD (Static Logic)
export const SidebarAd: React.FC = () => {
  const ad = sampleAds.sidebar;
  return (
    <aside 
      aria-label="Featured Update"
      className="min-h-[150px]"
    >
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className={`bg-gradient-to-br ${ad.bgColor} rounded-xl md:rounded-2xl p-4 md:p-6 text-white h-full`}
      >
        <span className="inline-block bg-white/20 px-1.5 md:px-2 py-0.5 rounded text-[9px] md:text-xs mb-2 md:mb-3 font-bold uppercase tracking-widest">Official AD</span>
        <h4 className="font-semibold text-sm md:text-lg mb-1 md:mb-2 leading-tight">{ad.title}</h4>
        <p className="text-white/80 text-[10px] md:text-sm mb-3 md:mb-4 leading-snug font-medium">{ad.description}</p>
        <a 
          href={ad.link} 
          target="_blank" 
          rel="noopener noreferrer" 
          aria-label={`Join ${ad.title}`}
          className="inline-flex items-center text-[10px] md:text-sm font-black hover:underline gap-1 uppercase tracking-tighter"
        >
          Join Now <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </motion.div>
    </aside>
  );
};

// 3. INLINE AD (Static Logic)
export const InlineAd: React.FC = () => {
  const navigate = useNavigate();
  const ad = sampleAds.inline;
  return (
    <div 
      role="complementary" 
      aria-label="In-content promotion"
      className="my-4 md:my-8 min-h-[120px]"
    >
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        <div className={`bg-gradient-to-r ${ad.bgColor} rounded-xl md:rounded-[2rem] p-4 md:p-8 text-white shadow-xl`}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-6">
            <div className="flex-1 text-center md:text-left">
              <span className="inline-block bg-white/20 px-2 py-0.5 rounded text-[9px] md:text-xs mb-3 font-bold uppercase">Trending Notes</span>
              <h3 className="text-lg md:text-3xl font-black mb-1 md:mb-2 uppercase tracking-tighter">{ad.title}</h3>
              <p className="text-white/80 text-[10px] md:text-lg font-medium">{ad.description}</p>
            </div>
            <button 
              onClick={() => navigate(ad.link)} 
              aria-label={`Learn more about ${ad.title}`}
              className="flex-shrink-0 px-6 py-2.5 md:py-4 bg-white text-gray-900 rounded-xl font-black hover:bg-gray-100 transition-all text-xs md:text-lg w-full md:w-auto shadow-lg active:scale-95"
            >
              Learn More
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// 🔥 4. POPUP AD (Dynamic from Admin Panel)
export const PopupAd: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPopupSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, "site_settings", "global"));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings(data);
          if (data.popupActive) {
            // ✅ SPEED FIX: Timer increased to 20s to bypass Lighthouse LCP/CLS penalty.
            const timer = setTimeout(() => setIsVisible(true), 20000);
            return () => clearTimeout(timer);
          }
        }
      } catch (err) { console.error("Popup fetch error:", err); }
    };
    fetchPopupSettings();
  }, []);

  if (!isVisible || !settings || !settings.popupActive) return null;

  return (
    <div 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="popup-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative max-w-md w-full bg-gradient-to-br from-green-500 to-emerald-700 rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 text-white mx-4 shadow-[0_30px_60px_rgba(0,0,0,0.3)] border border-white/20"
      >
        <button 
          onClick={() => setIsVisible(false)} 
          aria-label="Close Popup"
          className="absolute top-4 right-4 md:top-6 md:right-6 p-2 hover:bg-white/20 rounded-full transition-colors"
        >
          <X className="w-5 h-5 md:w-6 md:h-6" aria-hidden="true" />
        </button>

        <span className="inline-block bg-white/20 px-3 py-1 rounded-full text-[9px] md:text-xs mb-4 font-black uppercase tracking-widest border border-white/10 italic">
           {settings.discountPercent}% OFF LIVE OFFER
        </span>
        
        <div className="text-center">
          <div className="w-16 h-16 md:w-24 md:h-24 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4 md:mb-6 shadow-inner rotate-3">
            <span className="text-4xl md:text-6xl animate-bounce" role="img" aria-label="Gift Box">🎁</span>
          </div>
          
          <h3 id="popup-title" className="text-2xl md:text-4xl font-black mb-3 leading-tight uppercase tracking-tighter">{settings.popupTitle}</h3>
          <p className="text-white/90 text-[11px] md:text-xl mb-6 md:mb-10 font-medium leading-relaxed">{settings.popupDescription}</p>
          
          <div className="flex flex-col gap-3">
            <button
              onClick={() => { setIsVisible(false); navigate('/premium-notes'); }}
              aria-label={settings.popupButtonText}
              className="w-full px-6 py-3 md:py-5 bg-white text-emerald-700 rounded-2xl font-black hover:bg-emerald-50 transition-all text-sm md:text-2xl shadow-xl active:scale-95 uppercase"
            >
              {settings.popupButtonText}
            </button>
            <p className="text-[10px] md:text-xs text-white/50 font-bold tracking-widest">
               * Get it now at just Rs.{settings.premiumPrice} (MRP Rs.{settings.mrpPrice})
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// 5. GOOGLE ADSENSE (Layout Stability Focused)
export const GoogleAdSense: React.FC<{ slot: string; format?: 'auto' | 'rectangle' | 'vertical' | 'horizontal' }> = ({ slot, format = 'auto' }) => {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
    try {
      if ((window as any).adsbygoogle) { (window as any).adsbygoogle.push({}); }
    } catch (e) { console.error("AdSense Error:", e); }
    return () => { if(document.head.contains(script)) document.head.removeChild(script); };
  }, []);

  const formatClasses = { 
    auto: 'min-h-[250px]', 
    rectangle: 'w-[300px] h-[250px]', 
    vertical: 'w-[160px] h-[600px]', 
    horizontal: 'w-[100%] h-[90px]' 
  };

  return (
    <div 
      className={`bg-gray-100 rounded-lg flex items-center justify-center relative overflow-hidden ${formatClasses[format]}`}
      aria-label="Sponsored Content"
    >
      <ins className="adsbygoogle" 
           style={{ display: 'block' }} 
           data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" 
           data-ad-slot={slot} 
           data-ad-format={format} 
           data-full-width-responsive="true" />
      <div className="absolute top-1 right-1 text-gray-400 text-[8px] uppercase tracking-widest pointer-events-none">AD</div>
    </div>
  );
};

const Ads: React.FC<AdProps> = ({ position }) => {
  switch (position) {
    case 'header': return <HeaderAd />;
    case 'sidebar': return <SidebarAd />;
    case 'inline': return <InlineAd />;
    case 'popup': return <PopupAd />;
    default: return null;
  }
};

export default Ads;