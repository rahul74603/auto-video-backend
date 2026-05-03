// @ts-nocheck
import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config'; // ✅ रास्ता चेक कर लें

export interface SiteContent {
  seo: {
    title: string;
    description: string;
    keywords: string;
    author?: string;
    ogImage?: string;
  };
  liveUpdate: { text: string; link: string; active: boolean; showPulse?: boolean };
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
    } catch (e) { return defaultContent; }
  });

  const [loading, setLoading] = useState<boolean>(() => {
    return localStorage.getItem(CACHE_KEY) ? false : true;
  });

  useEffect(() => {
    // ✅ संग्रह का नाम 'site_settings' और डॉक्यूमेंट 'global' कर दिया है 
    // ताकि AdminSidebarControl के साथ मैच हो सके
    const docRef = doc(db, 'site_settings', 'global'); 
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const freshData = docSnap.data() as SiteContent;
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
    const docRef = doc(db, 'site_settings', 'global');
    try {
      await setDoc(docRef, newContent, { merge: true });
      // alert('Website Updated! 🎉'); // इसे यहाँ रहने दें या हटा दें आपकी मर्ज़ी
    } catch (error: any) {
      console.error("Error updating: ", error);
    }
  };

  return { content, loading, updateContent };
};