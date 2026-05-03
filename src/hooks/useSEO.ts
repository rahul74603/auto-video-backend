// @ts-nocheck
import { useEffect, useRef } from 'react';

// ✅ 1. GLOBAL CONSTANTS (जरूरी हैं, इन्हें रहने दें)
const SITE_URL = 'https://studygyaan.in';
const SITE_NAME = 'StudyGyaan';
const DEFAULT_IMAGE = `${SITE_URL}/images/og-default.jpg`;

// --- TYPES (इन्हें रखा गया है ताकि आपकी कोडिंग में रेड लाइन्स न आएं) ---
interface SEOProps {
  title: string;
  description: string;
  keywords?: string[];
  ogImage?: string;
  ogUrl?: string;
  canonical?: string;
  schema?: object;
}

interface JobData {
  id: string; 
  title: string; 
  description: string; 
  organization: string;
  location: string; 
  salary: string; 
  postedDate: string; 
  lastDate: string;
}

interface ProductData {
  id: string; 
  name: string; 
  imageUrl: string; 
  description: string;
  price: number; 
  stock: number; 
  rating?: number; 
  reviewCount?: number;
}

/**
 * 🛠️ useSEO Hook (Updated for Universal SEO Compatibility)
 * यह हुक अब document.title या meta tags को अपडेट नहीं करेगा।
 * यह काम अब src/components/SEO.tsx (Universal Helmet) द्वारा किया जा रहा है।
 * हमने यहाँ सिर्फ Schema (JSON-LD) इंजेक्शन को चालू रखा है।
 */
export const useSEO = ({
  schema
}: SEOProps) => {
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    // ❌ यहाँ से document.title और Meta Tags का सारा पुराना कोड हटा दिया गया है।
    // इससे आपके नए SEO कॉम्पोनेंट के साथ होने वाला 'Title Conflict' खत्म हो जाएगा।

    // ✅ सिर्फ Schema (JSON-LD) को चालू रखा गया है, ताकि गूगल को डेटा मिलता रहे।
    if (schema) {
      // अगर पहले से कोई स्कीमा स्क्रिप्ट है, तो उसे हटा दें (Cleanup)
      if (scriptRef.current) {
        try {
          if (document.head.contains(scriptRef.current)) {
            document.head.removeChild(scriptRef.current);
          }
        } catch (e) {
          console.warn("Schema cleanup failed:", e);
        }
      }

      // नई स्कीमा स्क्रिप्ट बनाएँ
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.text = JSON.stringify(schema);
      document.head.appendChild(script);
      scriptRef.current = script;
    }

    // CLEANUP: जब कंपोनेंट हटेगा, तो स्कीमा भी हट जाएगा
    return () => {
      if (scriptRef.current) {
        try {
          if (document.head.contains(scriptRef.current)) {
            document.head.removeChild(scriptRef.current);
            scriptRef.current = null;
          }
        } catch (e) {
          // Element might be already removed by React
        }
      }
    };
  }, [JSON.stringify(schema)]); 
};

// --- PREDEFINED CONFIGS (इन्हें रखा गया है ताकि पुराने इम्पोट्स काम करते रहें) ---
export const seoConfig = {
  home: {
    title: 'Free Study Materials & Government Jobs 2026',
    description: 'Get free study materials, handwritten notes and latest job updates.',
    keywords: ['study material', 'government jobs', 'SSC', 'UPSC', 'banking'],
  },
  jobs: {
    title: 'Latest Government Jobs 2026 - Sarkari Naukri',
    description: 'Find latest government jobs 2026 recruitment notifications.',
    keywords: ['sarkari naukri', 'govt jobs 2026', 'latest jobs'],
  },
  studyMaterials: {
    title: 'Free Study Materials - Notes, Papers & Mock Tests',
    description: 'Download free study materials for competitive exams.',
    keywords: ['free notes', 'PDF download', 'exam material'],
  },
  shop: {
    title: 'Buy Study Materials Online - Books & Test Series',
    description: 'Buy premium study materials at affordable prices.',
    keywords: ['buy notes', 'test series', 'study books'],
  },
};

// --- SCHEMA GENERATORS (सबसे जरूरी हिस्सा - पूरी तरह सुरक्षित) ---
export const generateSchemas = {
  // संस्था की जानकारी (Organization)
  organization: () => ({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    sameAs: [
      'https://facebook.com/studygyaan',
      'https://twitter.com/studygyaan',
      'hhttps://www.youtube.com/@StudyGyaan_Official',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+91-6263396446',
      contactType: 'customer service',
    },
  }),
  
  // वेबसाइट सर्च बॉक्स जानकारी
  website: () => ({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }),
  
  // जॉब पोस्टिंग स्कीमा
  jobPosting: (job: JobData) => ({
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    identifier: {
      '@type': 'PropertyValue',
      name: job.organization,
      value: job.id,
    },
    hiringOrganization: {
      '@type': 'Organization',
      name: job.organization,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'IN',
        addressRegion: job.location,
      },
    },
    datePosted: job.postedDate,
    validThrough: job.lastDate,
    employmentType: 'FULL_TIME',
  }),
  
  // ई-बुक या प्रोडक्ट स्कीमा
  product: (product: ProductData) => ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.imageUrl,
    description: product.description,
    brand: {
      '@type': 'Brand',
      name: SITE_NAME,
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: product.price,
      availability: 'https://schema.org/InStock',
    },
  }),
  
  // ब्रेडक्रंब (Breadcrumb) स्कीमा
  breadcrumb: (items: { name: string; url: string }[]) => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
    })),
  }),
};