// @ts-nocheck
import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from '@/context/LanguageContext';
import { Toaster } from 'react-hot-toast';

// ✅ SEO और Schema हुक्स
import { generateSchemas } from '@/hooks/useSEO';
import SEO from './components/SEO'; 

// 🚀 सिर्फ वो चीजें जो हल्की हैं और सबसे पहले दिखनी चाहिए (Direct Import)
import Home from './pages/Home';
import Navigation from '@/sections/Navigation';
import PromoBanner from './components/PromoBanner';

// 🛑 भारी चीजें (Firebase/Framer Motion वाली) Lazy Load होंगी ताकि मोबाइल फ्रीज़ न हो!
const Footer = lazy(() => import('@/sections/Footer'));
const FloatingSocials = lazy(() => import('./components/FloatingSocials'));
const HeaderAd = lazy(() => import('@/sections/Ads').then(m => ({ default: m.HeaderAd })));
const PopupAd = lazy(() => import('@/sections/Ads').then(m => ({ default: m.PopupAd })));

// --- बाकी पेजेस Lazy Load ही रहेंगे ---
const MockTestLibrary = lazy(() => import('./pages/MockTestLibrary')); 
const PlayMockTest = lazy(() => import('./pages/PlayMockTest')); 
const Success = lazy(() => import('./pages/Success')); 
const AdminBlogWriter = lazy(() => import('./pages/AdminBlogWriter'));
const AdminPanel = lazy(() => import('./pages/AdminPage'));
const AdminSidebarControl = lazy(() => import('./pages/admin/AdminSidebarControl'));
const AdminJobDrafts = lazy(() => import('./pages/admin/Tabs/AdminJobDrafts')); 
const AdminWebStories = lazy(() => import('./pages/Admin/Tabs/AdminWebStories'));
const MaterialPage = lazy(() => import('./pages/MaterialPage'));
const MyCourses = lazy(() => import('./pages/MyCourses'));
const FileViewer = lazy(() => import('./pages/FileViewer'));
const CourseView = lazy(() => import('./pages/CourseView'));
const BlogList = lazy(() => import('./pages/BlogList')); 
const BlogPost = lazy(() => import('./pages/BlogPost'));
const JobDetails = lazy(() => import('./pages/JobDetails')); 
const EbookDetails = lazy(() => import('./pages/EbookDetails'));
const MaterialDetails = lazy(() => import('./pages/MaterialDetails'));
const AdminBrowseTab = lazy(() => import('./pages/Admin/Tabs/AdminBrowseTab'));
const Redirect = lazy(() => import('./pages/Redirect')); 
const FastTrackDetails = lazy(() => import('./pages/FastTrackDetails'));
const WebStoryViewer = lazy(() => import('./pages/WebStoryViewer'));
const AllStories = lazy(() => import('./pages/AllStories'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));

const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));
const TermsConditions = lazy(() => import('./pages/TermsConditions'));
const ContactUs = lazy(() => import('./pages/ContactUs'));
const AboutUs = lazy(() => import('./pages/AboutUs')); 
const Disclaimer = lazy(() => import('./pages/Disclaimer')); 
const ShippingPolicy = lazy(() => import('./pages/ShippingPolicy')); 
const ManualPayment = lazy(() => import('./pages/ManualPayment'));

const GovtJobs = lazy(() => import('@/sections/GovtJobs')); 
const Notes = lazy(() => import('@/sections/Notes')); 
const Shop = lazy(() => import('@/sections/Shop')); 

const SchemaWrapper: React.FC = () => {
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(generateSchemas.website());
    document.head.appendChild(script);
    return () => { 
      const existingScript = document.querySelector('script[type="application/ld+json"]');
      if (existingScript && document.head.contains(existingScript)) {
        document.head.removeChild(existingScript); 
      }
    };
  }, []);
  return null;
};

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="pt-14 md:pt-20">{children}</div>
);

const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-screen bg-gray-50">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
  </div>
);


function App() {
  return (
    <Router>
      <LanguageProvider>
        <Toaster position="top-right" reverseOrder={false} />
        <SEO /> 
        <SchemaWrapper />

        <div className="min-h-screen bg-white">
          
          <PromoBanner />
          
          {/* ✅ CLS FIX: HeaderAd में Firebase है, इसलिए इसे Lazy रखा है लेकिन जगह फिक्स कर दी है (40px) */}
          <div style={{ minHeight: '36px' }}>
            <Suspense fallback={null}>
              <HeaderAd />
            </Suspense>
          </div>

          <Navigation />
          
          <main>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/redirect" element={<Redirect />} />
                <Route path="/secret-admin" element={<AdminPanel />} />
                <Route path="/write-blog-secret" element={<AdminBlogWriter />} />
                <Route path="/admin/sidebar" element={<AdminSidebarControl />} />
                <Route path="/admin/job-drafts" element={<AdminJobDrafts />} />
                <Route path="/admin-stories-secret" element={<AdminWebStories />} />

                <Route path="/free-study-material" element={<PageWrapper><MaterialPage /></PageWrapper>} />
                <Route path="/material/:id" element={<MaterialDetails />} />
                <Route path="/pdf/:id" element={<FileViewer />} />
                <Route path="/my-courses" element={<MyCourses />} />
                <Route path="/course/:id" element={<CourseView />} />
                <Route path="/manual-payment" element={<PageWrapper><ManualPayment /></PageWrapper>} />                
                
                <Route path="/govt-jobs" element={<PageWrapper><GovtJobs /></PageWrapper>} />
                <Route path="/job/:id" element={<PageWrapper><JobDetails /></PageWrapper>} />
                
                <Route path="/admit-card" element={<CategoryPage category="Admit Card" pageTitle="Latest Admit Cards 2026" description="सभी सरकारी परीक्षाओं के एडमिट कार्ड सबसे पहले यहाँ से डाउनलोड करें।" />} />
                <Route path="/results" element={<CategoryPage category="Result" pageTitle="Exam Results 2026" description="अपने परीक्षा परिणाम (Results) और मेरिट लिस्ट की सबसे तेज़ अपडेट।" />} />
                <Route path="/answer-key" element={<CategoryPage category="Answer Key" pageTitle="Official Answer Keys" description="परीक्षा के तुरंत बाद सटीक Answer Key PDF डाउनलोड करें।" />} />
                <Route path="/jobs" element={<CategoryPage category="Jobs" pageTitle="Latest Govt Jobs" description="10वीं, 12वीं और ग्रेजुएट्स के लिए नई सरकारी नौकरियों की जानकारी।" />} />
                <Route path="/syllabus" element={<CategoryPage category="Syllabus" pageTitle="Syllabus & Exam Pattern" description="सभी परीक्षाओं का लेटेस्ट सिलेबस और एग्जाम पैटर्न यहाँ देखें।" />} />
                <Route path="/web-stories/:id" element={<WebStoryViewer />} />
                <Route path="/all-stories" element={<AllStories />} />
                <Route path="/update/:id" element={<PageWrapper><FastTrackDetails /></PageWrapper>} />

                <Route path="/e-books" element={<PageWrapper><Notes /></PageWrapper>} />
                <Route path="/ebook/:id" element={<EbookDetails />} />
                <Route path="/premium-notes" element={<PageWrapper><Shop /></PageWrapper>} />

                <Route path="/blog" element={<PageWrapper><BlogList /></PageWrapper>} />
                <Route path="/blog/:id" element={<PageWrapper><BlogPost /></PageWrapper>} />

                <Route path="/mock-tests" element={<PageWrapper><MockTestLibrary /></PageWrapper>} />
                <Route path="/test/:id" element={<PlayMockTest />} />
                <Route path="/success" element={<Success />} /> 

                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-conditions" element={<TermsConditions />} />
                <Route path="/refund-cancellation-policy" element={<RefundPolicy />} />
                <Route path="/shipping-policy" element={<ShippingPolicy />} />
                <Route path="/contact-us" element={<ContactUs />} />
                <Route path="/about-us" element={<AboutUs />} />
                <Route path="/disclaimer" element={<Disclaimer />} />
              </Routes>
            </Suspense>
          </main>
          
          <Suspense fallback={null}>
            <FloatingSocials />
            <Footer />
            <PopupAd />
          </Suspense>

        </div>
      </LanguageProvider>
    </Router>
  );
}

export default App;