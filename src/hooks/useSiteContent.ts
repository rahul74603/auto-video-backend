import { useState, useEffect } from 'react';
import { siteSettingsRepository } from '@/features/site-settings/data/siteSettingsRepository';

export interface SiteContent {
  seo: {
    title: string;
    description: string;
    keywords: string;
    author?: string;
    ogImage?: string;
  };
  liveUpdate: {
    text?: string;
    link?: string;
    active?: boolean;
    showPulse?: boolean;
    updates?: { text: string; link: string }[];
  };
  buttons: {
    results: { text: string; link: string }[];
    admitCard: { text: string; link: string }[];
    answerKey: { text: string; link: string }[];
    syllabus: { text: string; link: string }[];
  };
  // ✅ नए Sidebar स्लॉट्स यहाँ भी जोड़ दिए ताकि एरर न आए
  shopUpdates?: { title: string; url: string }[];
  jobUpdates?: { title: string; url: string }[];
  pdfUpdates?: { title: string; url: string }[];
  // ✅ Dynamic text/pricing fields (admin panel se control)
  premiumPrice?: string | number;
  heroDescription?: string;
}

const defaultContent: SiteContent = {
  seo: {
    title: "StudyGyaan - Sarkari Naukri & Free PDF Notes",
    description: "Latest Sarkari Result, Admit Card, Answer Key.",
    keywords: "Sarkari Naukri, Free PDF"
  },
  liveUpdate: { text: "Loading updates...", link: "#", active: true },
  buttons: { results: [], admitCard: [], answerKey: [], syllabus: [] }
};

const CACHE_KEY = 'studygyaan_site_content_cache';

export const useSiteContent = () => {
  const [content, setContent] = useState<SiteContent>(() => {
    try {
      const cachedData = localStorage.getItem(CACHE_KEY);
      return cachedData ? JSON.parse(cachedData) : defaultContent;
    } catch { return defaultContent; }
  });

  const [loading, setLoading] = useState<boolean>(() => {
    return localStorage.getItem(CACHE_KEY) ? false : true;
  });

  useEffect(() => {
    // ✅ site_settings/global doc se live settings subscribe
    const unsubscribe = siteSettingsRepository.subscribeGlobal((settings) => {
      if (settings) {
        const freshData = settings as unknown as SiteContent;
        setContent(freshData);
        localStorage.setItem(CACHE_KEY, JSON.stringify(freshData));
      } else {
        setContent(defaultContent);
      }
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const updateContent = async (newContent: Partial<SiteContent>) => {
    try {
      await siteSettingsRepository.setGlobal(newContent as Record<string, unknown>, true);
      // alert('Website Updated! 🎉'); // इसे यहाँ रहने दें या हटा दें आपकी मर्ज़ी
    } catch (error: unknown) {
      console.error("Error updating: ", error);
    }
  };

  return { content, loading, updateContent };
};