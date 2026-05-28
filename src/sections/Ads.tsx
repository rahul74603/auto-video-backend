// @ts-nocheck
import React, {
    useEffect, useState, useCallback,
    useRef, createContext, useContext
} from 'react';
import { X, ExternalLink, Bell, Zap } from 'lucide-react';
import { db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

// =========================================================
// 🔄 GLOBAL SETTINGS CONTEXT
// (एक ही Firestore read, सब components use करें)
// =========================================================
const SiteSettingsContext = createContext(null);

export const SiteSettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const fetchSettings = async () => {
            try {
                const snap = await getDoc(doc(db, "site_settings", "global"));
                if (snap.exists()) {
                    setSettings(snap.data());
                }
            } catch (err) {
                console.error("Settings fetch error:", err);
            } finally {
                setLoaded(true);
            }
        };

        fetchSettings();
    }, []);

    return (
        <SiteSettingsContext.Provider value={{ settings, loaded }}>
            {children}
        </SiteSettingsContext.Provider>
    );
};

// ✅ Hook for consuming settings
function useSiteSettings() {
    const context = useContext(SiteSettingsContext);
    if (!context) {
        // Fallback: standalone fetch if no provider
        return { settings: null, loaded: false };
    }
    return context;
}

// =========================================================
// 🔝 1. HEADER AD (Dynamic - Admin Panel से)
// =========================================================
export const HeaderAd = () => {
    const [isVisible, setIsVisible] = useState(true);
    const [settings, setSettings] = useState(null);

    useEffect(() => {
        // ✅ Session में पहले से dismissed है तो hide करो
        const dismissed = sessionStorage.getItem('headerAdDismissed');
        if (dismissed) {
            setIsVisible(false);
            return;
        }

        const fetchSettings = async () => {
            try {
                const snap = await getDoc(doc(db, "site_settings", "global"));
                if (snap.exists()) setSettings(snap.data());
            } catch (err) {
                console.error("HeaderAd fetch:", err);
            }
        };

        fetchSettings();
    }, []);

    const handleClose = useCallback(() => {
        setIsVisible(false);
        // ✅ Session में save करो ताकि page reload पर फिर न आए
        sessionStorage.setItem('headerAdDismissed', '1');
    }, []);

    if (!isVisible || !settings?.headerAdActive) return null;

    const adLink = settings.headerAdLink || '/premium-notes';
    const isExternal = adLink.startsWith('http');

    return (
        <aside
            role="banner"
            aria-label="Promotional Offer"
            className="relative bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-sm overflow-hidden"
        >
            <div className="max-w-7xl mx-auto px-3 md:px-4 py-1.5 md:py-2">
                <div className="flex items-center justify-between gap-2">

                    {/* ✅ <a> tag for SEO */}
                    <a
                        href={adLink}
                        target={isExternal ? '_blank' : '_self'}
                        rel={isExternal ? 'noopener noreferrer' : undefined}
                        aria-label={`Offer: ${settings.headerAdTitle}`}
                        className="flex-1 flex items-center justify-center gap-1.5 md:gap-3 text-[10px] md:text-sm font-black hover:opacity-90 transition-opacity"
                    >
                        <span className="bg-white/20 px-2 py-0.5 rounded text-[8px] md:text-xs border border-white/20 uppercase font-black shrink-0">
                            {settings.discountPercent || '85'}% OFF
                        </span>
                        <span className="line-clamp-1">
                            {settings.headerAdTitle || 'Special Offer - Limited Time!'}
                        </span>
                        <ExternalLink
                            className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0"
                            aria-hidden="true"
                        />
                    </a>

                    {/* Close Button */}
                    <button
                        onClick={handleClose}
                        aria-label="Close Advertisement"
                        className="p-1 hover:bg-white/20 rounded-full transition-colors shrink-0"
                    >
                        <X className="w-3.5 h-3.5 md:w-4 md:h-4" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </aside>
    );
};

// =========================================================
// 📌 2. SIDEBAR AD (Static - Telegram/Channel Promo)
// =========================================================
export const SidebarAd = () => {
    return (
        <aside
            aria-label="Join Our Community"
            className="min-h-[150px]"
        >
            {/* ✅ CSS animation, Framer Motion हटाया */}
            <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl p-4 md:p-6 text-white h-full animate-in fade-in duration-500">
                <span className="inline-block bg-white/20 px-2 py-0.5 rounded text-[9px] md:text-xs mb-3 font-black uppercase tracking-widest border border-white/10">
                    📢 Free Updates
                </span>
                <h3 className="font-black text-sm md:text-lg mb-2 leading-tight">
                    Join Our Telegram Channel
                </h3>
                <p className="text-white/80 text-[10px] md:text-sm mb-4 leading-snug font-medium">
                    Get daily job updates, mock tests & free study materials
                </p>
                <a
                    href="https://t.me/studygyaan_official"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Join StudyGyaan Telegram Channel"
                    className="inline-flex items-center gap-1.5 text-[10px] md:text-sm font-black hover:underline uppercase tracking-tight bg-white/20 px-3 py-1.5 rounded-lg hover:bg-white/30 transition-all"
                >
                    <Bell size={12} aria-hidden="true" />
                    Join Free
                    <ExternalLink size={11} aria-hidden="true" />
                </a>
            </div>
        </aside>
    );
};

// =========================================================
// 📰 3. INLINE AD (Static - Premium Notes Promo)
// =========================================================
export const InlineAd = () => {
    return (
        <div
            role="complementary"
            aria-label="Premium Notes Promotion"
            className="my-4 md:my-8"
        >
            {/* ✅ CSS animation only */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl md:rounded-[2rem] p-4 md:p-8 text-white shadow-xl animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
                    <div className="flex-1 text-center md:text-left">
                        <span className="inline-block bg-white/20 px-2 py-0.5 rounded text-[9px] md:text-xs mb-3 font-black uppercase border border-white/10">
                            🎯 Trending Notes
                        </span>
                        <h3 className="text-lg md:text-3xl font-black mb-1 md:mb-2 uppercase tracking-tighter leading-tight">
                            UPSC Foundation Course 2025
                        </h3>
                        <p className="text-white/80 text-[10px] md:text-lg font-medium">
                            Complete preparation with expert guidance
                        </p>
                    </div>
                    {/* ✅ <a> tag for SEO */}
                    <a
                        href="/premium-notes"
                        aria-label="Learn more about UPSC Foundation Course"
                        className="shrink-0 px-6 py-2.5 md:py-4 bg-white text-purple-700 rounded-xl font-black hover:bg-purple-50 transition-all text-xs md:text-lg w-full md:w-auto shadow-lg active:scale-95 text-center"
                    >
                        Learn More →
                    </a>
                </div>
            </div>
        </div>
    );
};

// =========================================================
// 🎯 4. POPUP AD (Dynamic - Admin Panel + Session Control)
// =========================================================
export const PopupAd = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [settings, setSettings] = useState(null);

    useEffect(() => {
        // ✅ Session check - एक बार दिखाओ, बार-बार नहीं
        const alreadyShown = sessionStorage.getItem('popupShown');
        if (alreadyShown) return;

        const fetchAndShow = async () => {
            try {
                const snap = await getDoc(doc(db, "site_settings", "global"));
                if (!snap.exists()) return;

                const data = snap.data();
                setSettings(data);

                if (data.popupActive) {
                    // ✅ 15s delay (Lighthouse LCP safe)
                    const timer = setTimeout(() => {
                        setIsVisible(true);
                        sessionStorage.setItem('popupShown', '1');
                    }, 15000);

                    return () => clearTimeout(timer);
                }
            } catch (err) {
                console.error("PopupAd fetch:", err);
            }
        };

        fetchAndShow();
    }, []);

    const handleClose = useCallback(() => {
        setIsVisible(false);
    }, []);

    const handleCTA = useCallback(() => {
        setIsVisible(false);
        // ✅ Direct navigation - no accidental triggers
        window.location.href = '/premium-notes';
    }, []);

    // ✅ ESC key support
    useEffect(() => {
        if (!isVisible) return;
        const handleEsc = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [isVisible, handleClose]);

    if (!isVisible || !settings?.popupActive) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="popup-title"
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
                // ✅ Backdrop click से close
                if (e.target === e.currentTarget) handleClose();
            }}
        >
            <div className="relative max-w-md w-full bg-gradient-to-br from-green-500 to-emerald-700 rounded-[2rem] p-6 md:p-10 text-white shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300">

                {/* Close Button */}
                <button
                    onClick={handleClose}
                    aria-label="Close Popup"
                    className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                    <X className="w-5 h-5" aria-hidden="true" />
                </button>

                {/* Badge */}
                <span className="inline-block bg-white/20 px-3 py-1 rounded-full text-[9px] md:text-xs mb-4 font-black uppercase tracking-widest border border-white/10 italic">
                    🔥 {settings.discountPercent}% OFF Limited Offer
                </span>

                <div className="text-center">
                    {/* Emoji */}
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                        <span className="text-3xl md:text-5xl" role="img" aria-label="Gift">
                            🎁
                        </span>
                    </div>

                    {/* Title */}
                    <h3
                        id="popup-title"
                        className="text-xl md:text-3xl font-black mb-3 leading-tight uppercase tracking-tighter"
                    >
                        {settings.popupTitle || 'Special Offer!'}
                    </h3>

                    {/* Description */}
                    <p className="text-white/90 text-[11px] md:text-base mb-6 font-medium leading-relaxed">
                        {settings.popupDescription || 'Get Premium Notes at Special Price'}
                    </p>

                    {/* CTA Buttons */}
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={handleCTA}
                            aria-label={settings.popupButtonText || 'Get Offer Now'}
                            className="w-full px-6 py-3 md:py-4 bg-white text-emerald-700 rounded-2xl font-black hover:bg-emerald-50 transition-all text-sm md:text-xl shadow-xl active:scale-95 uppercase"
                        >
                            {settings.popupButtonText || 'Get Offer Now →'}
                        </button>

                        <button
                            onClick={handleClose}
                            className="w-full py-2 text-white/60 hover:text-white text-xs font-bold transition-colors"
                        >
                            No thanks, maybe later
                        </button>
                    </div>

                    {/* Price info */}
                    <p className="text-[10px] text-white/50 font-bold mt-3 tracking-widest">
                        Only ₹{settings.premiumPrice || '69'} (MRP ₹{settings.mrpPrice || '499'})
                    </p>
                </div>
            </div>
        </div>
    );
};

// =========================================================
// 📊 5. GOOGLE ADSENSE (Fixed - No Memory Leak)
// =========================================================
export const GoogleAdSense = ({ slot, format = 'auto' }) => {
    const containerRef = useRef(null);
    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        // ✅ Script already exists check करो
        const existingScript = document.querySelector(
            'script[src*="pagead2.googlesyndication.com"]'
        );

        if (!existingScript) {
            const script = document.createElement('script');
            script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX';
            script.async = true;
            script.crossOrigin = 'anonymous';
            document.head.appendChild(script);
        }

        // ✅ AdSense push safely
        try {
            const adsbygoogle = (window).adsbygoogle || [];
            adsbygoogle.push({});
            (window).adsbygoogle = adsbygoogle;
        } catch (e) {
            console.error("AdSense Error:", e);
        }
        // ✅ Script remove नहीं करो! AdSense globally needed है
    }, [slot]);

    const sizeClasses = {
        auto: 'min-h-[250px] w-full',
        rectangle: 'w-[300px] h-[250px]',
        vertical: 'w-[160px] h-[600px]',
        horizontal: 'w-full h-[90px]'
    };

    return (
        <div
            ref={containerRef}
            className={`bg-gray-100 rounded-lg flex items-center justify-center relative overflow-hidden ${sizeClasses[format] || sizeClasses.auto}`}
            aria-label="Sponsored Content"
            role="complementary"
        >
            <ins
                className="adsbygoogle"
                style={{ display: 'block' }}
                data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                data-ad-slot={slot}
                data-ad-format={format}
                data-full-width-responsive="true"
            />
            <span className="absolute top-1 right-1 text-gray-400 text-[8px] uppercase tracking-widest pointer-events-none select-none">
                AD
            </span>
        </div>
    );
};

// =========================================================
// 🎯 6. PROMO BANNER (Internal - SEO Friendly)
// =========================================================
export const PromoBanner = () => {
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const isDismissed = sessionStorage.getItem('promoBannerDismissed');
        if (isDismissed) setDismissed(true);
    }, []);

    if (dismissed) return null;

    return (
        <div
            className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white text-center py-2 px-4 text-[10px] md:text-xs font-black flex items-center justify-center gap-2"
            role="complementary"
            aria-label="Site Announcement"
        >
            <Zap size={12} className="text-yellow-400 shrink-0" aria-hidden="true" />
            <span>
                🚀 Free Mock Tests Available!{' '}
                <a
                    href="/test"
                    className="underline hover:text-yellow-300 transition-colors"
                >
                    Start Now
                </a>
            </span>
            <button
                onClick={() => {
                    setDismissed(true);
                    sessionStorage.setItem('promoBannerDismissed', '1');
                }}
                className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Dismiss Banner"
            >
                <X size={12} />
            </button>
        </div>
    );
};

// =========================================================
// 🔧 DEFAULT EXPORT
// =========================================================
const Ads = ({ position }) => {
    switch (position) {
        case 'header': return <HeaderAd />;
        case 'sidebar': return <SidebarAd />;
        case 'inline': return <InlineAd />;
        case 'popup': return <PopupAd />;
        default: return null;
    }
};

export default Ads;
