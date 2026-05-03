import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'hi';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.studyMaterials': 'Study Materials',
    'nav.govtJobs': 'Govt Jobs',
    'nav.notes': 'Notes',
    'nav.about': 'About',
    'nav.login': 'Login',
    'nav.signup': 'Sign Up',
    'nav.shop': 'Shop',
    
    // Hero
    'hero.title': 'Master Your Exams with Expert Study Materials',
    'hero.subtitle': 'Access comprehensive notes, previous year papers, and mock tests for SSC, Banking, Railway, and UPSC exams.',
    'hero.cta.primary': 'Start Learning Now',
    'hero.cta.secondary': 'View Govt Jobs',
    
    // Exam Categories
    'categories.title': 'Popular Exam Categories',
    'categories.upsc': 'UPSC Civil Services',
    'categories.upsc.desc': 'IAS, IPS, IFS Preparation',
    'categories.ssc': 'SSC Exams',
    'categories.ssc.desc': 'CGL, CHSL, MTS, GD',
    'categories.banking': 'Banking Exams',
    'categories.banking.desc': 'IBPS, SBI, RBI',
    'categories.railway': 'Railway Exams',
    'categories.railway.desc': 'RRB NTPC, Group D',
    'categories.teaching': 'Teaching Exams',
    'categories.teaching.desc': 'CTET, TET, PRT, TGT',
    'categories.defense': 'Defense Exams',
    'categories.defense.desc': 'NDA, CDS, AFCAT',
    
    // Jobs
    'jobs.title': 'Latest Government Jobs 2026',
    'jobs.vacancies': 'Vacancies',
    'jobs.lastDate': 'Last Date',
    'jobs.applyNow': 'Apply Now',
    'jobs.viewAll': 'View All Jobs',
    'jobs.new': 'New',
    'jobs.urgent': 'Urgent',
    'jobs.last3Days': 'Last 3 Days',
    
    // Study Materials
    'materials.title': 'Free Study Materials',
    'materials.hindi': 'Hindi',
    'materials.english': 'English',
    'materials.previousPapers': 'Previous Year Papers',
    'materials.mockTests': 'Mock Test Series',
    'materials.currentAffairs': 'Current Affairs',
    'materials.subjectNotes': 'Subject Notes',
    'materials.ebooks': 'E-Books',
    'materials.videoLectures': 'Video Lectures',
    'materials.download': 'Download',
    'materials.viewAll': 'View All Materials',
    
    // Why Choose Us
    'why.title': 'Why Choose Our Platform?',
    'why.bilingual': 'Bilingual Content',
    'why.bilingual.desc': 'Study materials available in both Hindi and English languages',
    'why.expert': 'Expert Curated Materials',
    'why.expert.desc': 'Content prepared by subject matter experts and toppers',
    'why.updates': 'Regular Updates',
    'why.updates.desc': 'Daily job updates and current affairs',
    'why.free': 'Free Access',
    'why.free.desc': 'Most of our content is completely free for everyone',
    
    // Testimonials
    'testimonials.title': 'Success Stories',
    'testimonials.rahul': 'Cracked SSC CGL in first attempt!',
    'testimonials.priya': 'Best Hindi study materials available online.',
    'testimonials.amit': 'Regular job updates helped me apply on time.',
    
    // Shop
    'shop.title': 'Study Materials Shop',
    'shop.addToCart': 'Add to Cart',
    'shop.buyNow': 'Buy Now',
    'shop.outOfStock': 'Out of Stock',
    'shop.featured': 'Featured Products',
    'shop.bestsellers': 'Bestsellers',
    
    // Footer
    'footer.quickLinks': 'Quick Links',
    'footer.exams': 'Exams',
    'footer.resources': 'Resources',
    'footer.contact': 'Contact Us',
    'footer.copyright': '© 2026 StudyMaterial. All rights reserved.',
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms of Service',
    
    // Common
    'common.loading': 'Loading...',
    'common.readMore': 'Read More',
    'common.download': 'Download',
    'common.share': 'Share',
    'common.save': 'Save',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.sort': 'Sort',
    'common.language': 'Language',
  },
  hi: {
    // Navigation
    'nav.home': 'होम',
    'nav.studyMaterials': 'स्टडी मटेरियल',
    'nav.govtJobs': 'सरकारी नौकरी',
    'nav.notes': 'नोट्स',
    'nav.about': 'हमारे बारे में',
    'nav.login': 'लॉगिन',
    'nav.signup': 'साइन अप',
    'nav.shop': 'दुकान',
    
    // Hero
    'hero.title': 'एक्सपर्ट स्टडी मटेरियल से अपनी परीक्षा में सफलता पाएं',
    'hero.subtitle': 'SSC, बैंकिंग, रेलवे और UPSC परीक्षाओं के लिए व्यापक नोट्स, पिछले वर्ष के पेपर और मॉक टेस्ट एक्सेस करें।',
    'hero.cta.primary': 'अभी सीखना शुरू करें',
    'hero.cta.secondary': 'सरकारी नौकरी देखें',
    
    // Exam Categories
    'categories.title': 'लोकप्रिय परीक्षा श्रेणियां',
    'categories.upsc': 'UPSC सिविल सेवा',
    'categories.upsc.desc': 'IAS, IPS, IFS तैयारी',
    'categories.ssc': 'SSC परीक्षाएं',
    'categories.ssc.desc': 'CGL, CHSL, MTS, GD',
    'categories.banking': 'बैंकिंग परीक्षाएं',
    'categories.banking.desc': 'IBPS, SBI, RBI',
    'categories.railway': 'रेलवे परीक्षाएं',
    'categories.railway.desc': 'RRB NTPC, ग्रुप D',
    'categories.teaching': 'शिक्षण परीक्षाएं',
    'categories.teaching.desc': 'CTET, TET, PRT, TGT',
    'categories.defense': 'रक्षा परीक्षाएं',
    'categories.defense.desc': 'NDA, CDS, AFCAT',
    
    // Jobs
    'jobs.title': 'नवीनतम सरकारी नौकरियां 6',
    'jobs.vacancies': 'रिक्तियां',
    'jobs.lastDate': 'अंतिम तिथि',
    'jobs.applyNow': 'अभी आवेदन करें',
    'jobs.viewAll': 'सभी नौकरियां देखें',
    'jobs.new': 'नया',
    'jobs.urgent': 'अर्जेंट',
    'jobs.last3Days': 'अंतिम 3 दिन',
    
    // Study Materials
    'materials.title': 'मुफ्त स्टडी मटेरियल',
    'materials.hindi': 'हिंदी',
    'materials.english': 'अंग्रेजी',
    'materials.previousPapers': 'पिछले वर्ष के पेपर',
    'materials.mockTests': 'मॉक टेस्ट सीरीज',
    'materials.currentAffairs': 'करंट अफेयर्स',
    'materials.subjectNotes': 'विषय नोट्स',
    'materials.ebooks': 'ई-बुक्स',
    'materials.videoLectures': 'वीडियो लेक्चर्स',
    'materials.download': 'डाउनलोड',
    'materials.viewAll': 'सभी मटेरियल देखें',
    
    // Why Choose Us
    'why.title': 'हमारे प्लेटफॉर्म को क्यों चुनें?',
    'why.bilingual': 'द्विभाषी सामग्री',
    'why.bilingual.desc': 'हिंदी और अंग्रेजी दोनों भाषाओं में स्टडी मटेरियल उपलब्ध',
    'why.expert': 'एक्सपर्ट द्वारा तैयार सामग्री',
    'why.expert.desc': 'विषय विशेषज्ञों और टॉपर्स द्वारा तैयार कंटेंट',
    'why.updates': 'नियमित अपडेट्स',
    'why.updates.desc': 'रोजाना नौकरी अपडेट्स और करंट अफेयर्स',
    'why.free': 'मुफ्त एक्सेस',
    'why.free.desc': 'हमारा अधिकांश कंटेंट सभी के लिए पूरी तरह मुफ्त है',
    
    // Testimonials
    'testimonials.title': 'सफलता की कहानियां',
    'testimonials.rahul': 'पहले प्रयास में SSC CGL क्रैक किया!',
    'testimonials.priya': 'ऑनलाइन सबसे अच्छे हिंदी स्टडी मटेरियल।',
    'testimonials.amit': 'नियमित नौकरी अपडेट्स ने समय पर आवेदन करने में मदद की।',
    
    // Shop
    'shop.title': 'स्टडी मटेरियल शॉप',
    'shop.addToCart': 'कार्ट में डालें',
    'shop.buyNow': 'अभी खरीदें',
    'shop.outOfStock': 'स्टॉक में नहीं',
    'shop.featured': 'फीचर्ड प्रोडक्ट्स',
    'shop.bestsellers': 'बेस्टसेलर्स',
    
    // Footer
    'footer.quickLinks': 'त्वरित लिंक्स',
    'footer.exams': 'परीक्षाएं',
    'footer.resources': 'संसाधन',
    'footer.contact': 'संपर्क करें',
    'footer.copyright': '© 2026 StudyMaterial. सर्वाधिकार सुरक्षित।',
    'footer.privacy': 'प्राइवेसी पॉलिसी',
    'footer.terms': 'सेवा की शर्तें',
    
    // Common
    'common.loading': 'लोड हो रहा है...',
    'common.readMore': 'और पढ़ें',
    'common.download': 'डाउनलोड',
    'common.share': 'शेयर',
    'common.save': 'सेव',
    'common.search': 'खोजें',
    'common.filter': 'फिल्टर',
    'common.sort': 'सॉर्ट',
    'common.language': 'भाषा',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    const savedLang = localStorage.getItem('language') as Language;
    if (savedLang && (savedLang === 'en' || savedLang === 'hi')) {
      setLanguage(savedLang);
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;
  };

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations.en] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
