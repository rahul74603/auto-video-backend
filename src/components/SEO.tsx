// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

const SEO = ({ customTitle, customDescription, customImage, customUrl, ogType = "website" }) => {
  const location = useLocation();
  const baseUrl = "https://studygyaan.in";
  
  // ✅ 1. URL Cleanup: Trailing slash (/) और Query Params को हटा रहे हैं ताकि GSC में Duplicate Error न आए
  const cleanPathname = location.pathname.endsWith('/') && location.pathname.length > 1 
                        ? location.pathname.slice(0, -1) 
                        : location.pathname;
  
  const siteName = "StudyGyaan";
  const defaultImage = `${baseUrl}/og-image.jpg`;
  const defaultUrl = `${baseUrl}${cleanPathname}`;

  // ✅ 2. Bulletproof Canonical URL: अगर customUrl में भी गलती से '/' आ गया, तो उसे भी साफ करेगा
  let finalUrl = customUrl || defaultUrl;
  if (finalUrl !== baseUrl && finalUrl.endsWith('/')) {
      finalUrl = finalUrl.slice(0, -1);
  }

  const [dynamicTitle, setDynamicTitle] = useState('StudyGyaan 2026');
  const [dynamicDesc, setDynamicDesc] = useState("StudyGyaan provides free study materials, latest govt jobs, mock tests and premium notes for all competitive exams 2026.");

  useEffect(() => {
    // 🛑 अगर किसी डायनामिक पेज (जैसे Job या Blog) ने खुद का टाइटल भेजा है, तो ऑटोमैटिक काम रोक दो
    if (customTitle) return;

    // 🏠 सबसे पहले होम पेज को चेक करो (Strict Check)
    if (cleanPathname === '/' || cleanPathname === '/home') {
      setDynamicTitle("Free Study Materials & Govt Jobs 2026 | StudyGyaan");
      return;
    }

    const pathParts = cleanPathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];

    // 🚀 डायनामिक पेजों के लिए (Jobs, Courses, etc.)
    const isDynamicPage = pathParts.includes('job') || 
                          pathParts.includes('course') || 
                          pathParts.includes('material') || 
                          pathParts.includes('blog') || 
                          pathParts.includes('pdf') || 
                          pathParts.includes('test');

    if (isDynamicPage) {
      // डायनामिक पेज पर SEO शांत रहेगा ताकि Page Component अपना असली नाम दिखा सके
      return; 
    }

    // 📚 बाकी बचे हुए Static Pages के लिए
    const cleanName = lastPart 
      ? lastPart.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') 
      : "StudyGyaan";
      
    setDynamicTitle(`${cleanName} - StudyGyaan 2026`);

  }, [cleanPathname, customTitle]);

  // फाइनल वैल्यू
  const finalTitle = customTitle || dynamicTitle;
  const finalDesc = customDescription || dynamicDesc;
  const finalImage = customImage || defaultImage;

  return (
    <>
      <Helmet>
        {/* Standard Meta Tags */}
        <title>{finalTitle}</title>
        <meta name="description" content={finalDesc} />
        
        {/* 🔥 THE ULTIMATE CANONICAL FIX FOR GSC */}
        <link rel="canonical" href={finalUrl} />

        {/* 🚀 Open Graph / Facebook / WhatsApp Tags */}
        <meta property="og:locale" content="en_US" />
        <meta property="og:type" content={ogType} />
        <meta property="og:title" content={finalTitle} />
        <meta property="og:description" content={finalDesc} />
        <meta property="og:image" content={finalImage} />
        <meta property="og:image:alt" content={finalTitle} />
        <meta property="og:url" content={finalUrl} />
        <meta property="og:site_name" content={siteName} />

        {/* 🐦 Twitter Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={finalTitle} />
        <meta name="twitter:description" content={finalDesc} />
        <meta name="twitter:image" content={finalImage} />
        <meta name="twitter:image:alt" content={finalTitle} />
      </Helmet>

      {/* ✅ H1 Missing Error Fix */}
      <h1 style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
        {finalTitle}
      </h1>
    </>
  );
};

export default SEO;
