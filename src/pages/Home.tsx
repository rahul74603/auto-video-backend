// @ts-nocheck
import React, { useEffect, lazy, Suspense } from 'react';
import SEO from '@/components/SEO'; 
import Hero from '@/sections/Hero'; 
import FastTrackGrid from '@/pages/FastTrackGrid';

// 🚀 Lazy Loading Components (Speed Optimization - Below the Fold)
const HomeWebStories = lazy(() => import('@/components/HomeWebStories'));
const GovtJobs = lazy(() => import('@/sections/GovtJobs'));
const Shop = lazy(() => import('@/sections/Shop'));
const MaterialPage = lazy(() => import('./MaterialPage'));
const MockTestHomeSection = lazy(() => import('@/components/MockTestHomeSection'));
const EBooks = lazy(() => import('@/sections/Notes'));
const BlogHomeSection = lazy(() => import('@/components/BlogHomeSection'));
const Anthem = lazy(() => import('@/sections/Anthem'));

// Loading Fallback Component
const SectionLoader = () => (
  <div className="flex justify-center items-center h-32 w-full">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
  </div>
);

const Home = () => {
  
  useEffect(() => {
    // पेज लोड होने पर टॉप पर जाने के लिए
    window.scrollTo(0, 0);
  }, []);

  // 🔥 Organization Schema for Google Brand SEO
  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "StudyGyaan",
    "url": "https://studygyaan.in",
    "logo": "https://studygyaan.in/logo.png",
    "description": "StudyGyaan provides instant Govt Jobs Alert and high-quality Free Study Materials.",
    "sameAs": [
      "https://www.youtube.com/@studygyaan",
      "https://t.me/studygyaan"
    ]
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-4">
      
      {/* 🔥 डायनामिक SEO: होमपेज के लिए पक्का और प्रोफेशनल सेटअप */}
      <SEO 
        customTitle="StudyGyaan: Latest Govt Jobs Alert & Free Study Material"
        customDescription="StudyGyaan provides instant Govt Jobs Alert and high-quality Free Study Materials. Download PDF notes, check latest job notifications, and prepare for competitive exams 2026."
        customUrl="https://studygyaan.in"
        customImage="https://studygyaan.in/og-image.jpg"
      />

      {/* JSON-LD Schema Injection */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />

      {/* 🦸‍♂️ 1. Hero Section (Loaded Immediately for Best LCP) */}
      <section id="hero-section">
        <Hero />
      </section>

      {/* 🔥 2. FAST TRACK UPDATES (Loaded Immediately) */}
      <section id="fast-track-section" className="py-2">
        <FastTrackGrid />
      </section>

      {/* 👇 यहाँ से नीचे का सारा हिस्सा Lazy Load होगा (Speed बूस्ट) */}
      <Suspense fallback={<SectionLoader />}>
        {/* 📱 3. WEB STORIES SECTION */}
        <section id="web-stories-section" className="py-2">
          <HomeWebStories />
        </section>

        {/* 🚀 4. Govt Jobs */}
        <section id="govt-jobs" className="py-2">
          <GovtJobs />
        </section>

        {/* 💎 5. Premium Notes */}
        <section id="premium-notes" className="py-2 mt-2">
          <Shop />
        </section>

        {/* 📚 6. Free Material */}
        <section id="free-study-material" className="py-2">
          <MaterialPage />
        </section>

        {/* 📝 7. Mock Tests */}
        <section id="mock-tests" className="py-2">
          <MockTestHomeSection />
        </section>

        {/* 📖 8. E-Books */}
        <section id="e-books" className="py-2">
          <EBooks />
        </section>

        {/* ✍️ 9. Blog Section */}
        <section id="blog" className="py-2">
          <BlogHomeSection />
        </section>

        {/* 🎵 10. Anthem */}
        <section className="py-4">
          <Anthem /> 
        </section>
      </Suspense>
      
    </div>
  );
};

export default Home;