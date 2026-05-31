// @ts-nocheck
import React, { Suspense, lazy, memo } from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate,
    useParams
} from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { LanguageProvider } from '@/context/LanguageContext';
import { Toaster } from 'react-hot-toast';
import SEO from './components/SEO';

// =========================================================
// 🚀 CRITICAL PATH - Direct Imports
// =========================================================
import Navigation from '@/sections/Navigation';
import { SiteSettingsProvider, PromoBanner } from './sections/Ads';

// =========================================================
// 🛑 LAZY IMPORTS
// =========================================================

// Core
const Home = lazy(() => import('./pages/Home'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Jobs
const GovtJobs = lazy(() => import('@/sections/GovtJobs'));
const JobDetails = lazy(() => import('./pages/JobDetails'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));

// Blog
const BlogList = lazy(() => import('./pages/BlogList'));
const BlogPost = lazy(() => import('./pages/BlogPost'));

// Tests
const MockTestLibrary = lazy(() => import('./pages/MockTestLibrary'));
const PlayMockTest = lazy(() => import('./pages/PlayMockTest'));

// Materials
const MaterialPage = lazy(() => import('./pages/MaterialPage'));
const MaterialDetails = lazy(() => import('./pages/MaterialDetails'));
const FileViewer = lazy(() => import('./pages/FileViewer'));
const Notes = lazy(() => import('@/sections/Notes'));
const EbookDetails = lazy(() => import('./pages/EbookDetails'));
const Shop = lazy(() => import('@/sections/Shop'));
const HandwrittenNotes = lazy(() => import('./pages/handwritten'));

// Courses
const MyCourses = lazy(() => import('./pages/MyCourses'));
const CourseView = lazy(() => import('./pages/CourseView'));

// Stories
const WebStoryViewer = lazy(() => import('./pages/WebStoryViewer'));
const AllStories = lazy(() => import('./pages/AllStories'));

// Other
const FastTrackDetails = lazy(() => import('./pages/FastTrackDetails'));
const Redirect = lazy(() => import('./pages/Redirect'));
const Success = lazy(() => import('./pages/Success'));
const ManualPayment = lazy(() => import('./pages/ManualPayment'));

// Legal
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));
const TermsConditions = lazy(() => import('./pages/TermsConditions'));
const ContactUs = lazy(() => import('./pages/ContactUs'));
const AboutUs = lazy(() => import('./pages/AboutUs'));
const Disclaimer = lazy(() => import('./pages/Disclaimer'));
const ShippingPolicy = lazy(() => import('./pages/ShippingPolicy'));

// Admin (NO GUARD - Direct access)
const AdminPanel = lazy(() => import('./pages/AdminPage'));
const AdminBlogWriter = lazy(() => import('./pages/AdminBlogWriter'));
const AdminSidebarControl = lazy(() => import('./pages/admin/AdminSidebarControl'));
const AdminJobDrafts = lazy(() => import('./pages/admin/Tabs/AdminJobDrafts'));
const AdminWebStories = lazy(() => import('./pages/Admin/Tabs/AdminWebStories'));
const AdminBrowseTab = lazy(() => import('./pages/Admin/Tabs/AdminBrowseTab'));

// Layout (Lazy)
const Footer = lazy(() => import('@/sections/Footer'));
const FloatingSocials = lazy(() => import('./components/FloatingSocials'));
const HeaderAd = lazy(() =>
    import('@/sections/Ads').then(m => ({ default: m.HeaderAd }))
);
const PopupAd = lazy(() =>
    import('@/sections/Ads').then(m => ({ default: m.PopupAd }))
);

// =========================================================
// 📦 PAGE WRAPPER
// =========================================================
const PageWrapper = memo(({ children, className = "" }) => (
    <div className={`pt-14 md:pt-20 ${className}`}>
        {children}
    </div>
));
PageWrapper.displayName = 'PageWrapper';

// =========================================================
// ⏳ LOADING STATES
// =========================================================
const PageLoader = () => (
    <div 
        className="flex justify-center items-center bg-gray-50"
        style={{ minHeight: '70vh' }}  // ✅ CLS Fix
    >
        <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
            <p className="text-sm text-gray-500 font-hindi">लोड हो रहा है...</p>
        </div>
    </div>
);

const SilentLoader = () => null;

// =========================================================
// 📋 CATEGORY ROUTE HELPER
// =========================================================
const CategoryRoute = ({ category, pageTitle, description }) => (
    <PageWrapper>
        <CategoryPage
            category={category}
            pageTitle={pageTitle}
            description={description}
        />
    </PageWrapper>
);

// =========================================================
// 🔄 FASTTRACK REDIRECT
// =========================================================
const FastTrackRedirect = () => {
    const { id } = useParams();
    return <Navigate to={`/update/${id}`} replace />;
};

// =========================================================
// 🌐 MAIN APP
// =========================================================
function App() {
    return (
        <HelmetProvider>
            <Router>
                <SiteSettingsProvider>
                    <LanguageProvider>

                        <Toaster
                            position="top-right"
                            reverseOrder={false}
                            toastOptions={{
                                duration: 3000,
                                style: { fontSize: '14px' }
                            }}
                        />

                        <SEO />

                        <div className="min-h-screen bg-white">

                            {/* ✅ Promo Banner - Fixed height (CLS Fix) */}
                            <div 
                                style={{ 
                                    minHeight: '32px',
                                    contain: 'layout',
                                    background: '#1e40af'  // Banner bg color
                                }}
                            >
                                <PromoBanner />
                            </div>

                            {/* ✅ Header Ad - Fixed height (CLS Fix) */}
                            <div 
                                style={{ 
                                    minHeight: '36px',
                                    contain: 'layout',
                                    background: '#f97316'  // Orange (same as ad)
                                }}
                            >
                                <Suspense fallback={<div style={{ height: '36px' }} />}>
                                    <HeaderAd />
                                </Suspense>
                            </div>

                            {/* ✅ Navigation - Fixed height (CLS Fix) */}
                            <div 
                                style={{ 
                                    minHeight: '56px',
                                    contain: 'layout'
                                }}
                            >
                                <Navigation />
                            </div>

                            {/* ✅ Main Content - Min height (CLS Fix) */}
                            <main style={{ minHeight: '70vh' }}>
                                <Suspense fallback={<PageLoader />}>
                                    <Routes>

                                        {/* 🏠 HOME */}
                                        <Route path="/" element={<Home />} />

                                        {/* 🔄 UTILITY */}
                                        <Route path="/redirect" element={<Redirect />} />
                                        <Route path="/success" element={<Success />} />

                                        {/* 💼 GOVT JOBS */}
                                        <Route
                                            path="/govt-jobs"
                                            element={
                                                <PageWrapper>
                                                    <GovtJobs />
                                                </PageWrapper>
                                            }
                                        />
                                        <Route
                                            path="/job/:id"
                                            element={
                                                <PageWrapper>
                                                    <JobDetails />
                                                </PageWrapper>
                                            }
                                        />

                                        {/* 📂 CATEGORY PAGES */}
                                        <Route
                                            path="/admit-card"
                                            element={
                                                <CategoryRoute
                                                    category="Admit Card"
                                                    pageTitle="Latest Admit Cards 2025"
                                                    description="सभी सरकारी परीक्षाओं के एडमिट कार्ड सबसे पहले यहाँ से डाउनलोड करें।"
                                                />
                                            }
                                        />
                                        <Route
                                            path="/results"
                                            element={
                                                <CategoryRoute
                                                    category="Result"
                                                    pageTitle="Exam Results 2025"
                                                    description="अपने परीक्षा परिणाम और मेरिट लिस्ट की सबसे तेज़ अपडेट।"
                                                />
                                            }
                                        />
                                        <Route
                                            path="/answer-key"
                                            element={
                                                <CategoryRoute
                                                    category="Answer Key"
                                                    pageTitle="Official Answer Keys 2025"
                                                    description="परीक्षा के तुरंत बाद सटीक Answer Key PDF डाउनलोड करें।"
                                                />
                                            }
                                        />
                                        <Route
                                            path="/jobs"
                                            element={
                                                <CategoryRoute
                                                    category="Jobs"
                                                    pageTitle="Latest Govt Jobs 2025"
                                                    description="10वीं, 12वीं और ग्रेजुएट्स के लिए नई सरकारी नौकरियों की जानकारी।"
                                                />
                                            }
                                        />
                                        <Route
                                            path="/syllabus"
                                            element={
                                                <CategoryRoute
                                                    category="Syllabus"
                                                    pageTitle="Syllabus & Exam Pattern 2025"
                                                    description="सभी परीक्षाओं का लेटेस्ट सिलेबस और एग्जाम पैटर्न यहाँ देखें।"
                                                />
                                            }
                                        />

                                        {/* 📝 BLOG */}
                                        <Route
                                            path="/blog"
                                            element={
                                                <PageWrapper>
                                                    <BlogList />
                                                </PageWrapper>
                                            }
                                        />
                                        <Route
                                            path="/blog/:id"
                                            element={
                                                <PageWrapper>
                                                    <BlogPost />
                                                </PageWrapper>
                                            }
                                        />

                                        {/* 🧪 MOCK TESTS */}
                                        <Route
                                            path="/test"
                                            element={
                                                <PageWrapper>
                                                    <MockTestLibrary />
                                                </PageWrapper>
                                            }
                                        />
                                        <Route
                                            path="/mock-tests"
                                            element={<Navigate to="/test" replace />}
                                        />
                                        <Route
                                            path="/test/:id"
                                            element={<PlayMockTest />}
                                        />

                                        {/* 📚 STUDY MATERIAL */}
                                        <Route
                                            path="/free-study-material"
                                            element={
                                                <PageWrapper>
                                                    <MaterialPage />
                                                </PageWrapper>
                                            }
                                        />
                                        <Route
                                            path="/material/:id"
                                            element={<MaterialDetails />}
                                        />
                                        <Route
                                            path="/pdf/:id"
                                            element={<FileViewer />}
                                        />

                                        {/* 📖 E-BOOKS */}
                                        <Route
                                            path="/e-books"
                                            element={
                                                <PageWrapper>
                                                    <Notes />
                                                </PageWrapper>
                                            }
                                        />
                                        <Route
                                            path="/ebook/:id"
                                            element={<EbookDetails />}
                                        />

                                        {/* 💎 PREMIUM */}
                                        <Route
                                            path="/premium-notes"
                                            element={
                                                <PageWrapper>
                                                    <Shop />
                                                </PageWrapper>
                                            }
                                        />
                                        <Route
                                            path="/handwritten-premium"
                                            element={<HandwrittenNotes />}
                                        />

                                        {/* 🎓 COURSES */}
                                        <Route
                                            path="/my-courses"
                                            element={<MyCourses />}
                                        />
                                        <Route
                                            path="/course/:id"
                                            element={<CourseView />}
                                        />

                                        {/* 💳 PAYMENT */}
                                        <Route
                                            path="/manual-payment"
                                            element={
                                                <PageWrapper>
                                                    <ManualPayment />
                                                </PageWrapper>
                                            }
                                        />

                                        {/* 📱 WEB STORIES */}
                                        <Route
                                            path="/web-stories"
                                            element={
                                                <PageWrapper>
                                                    <AllStories />
                                                </PageWrapper>
                                            }
                                        />
                                        <Route
                                            path="/web-stories/:id"
                                            element={<WebStoryViewer />}
                                        />
                                        <Route
                                            path="/all-stories"
                                            element={<Navigate to="/web-stories" replace />}
                                        />

                                        {/* ⚡ FAST TRACK */}
                                        <Route
                                            path="/update/:id"
                                            element={
                                                <PageWrapper>
                                                    <FastTrackDetails />
                                                </PageWrapper>
                                            }
                                        />
                                        <Route
                                            path="/fasttrack"
                                            element={<Navigate to="/govt-jobs" replace />}
                                        />
                                        <Route
                                            path="/fasttrack/:id"
                                            element={<FastTrackRedirect />}
                                        />

                                        {/* 📄 LEGAL */}
                                        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                                        <Route path="/terms-conditions" element={<TermsConditions />} />
                                        <Route path="/refund-cancellation-policy" element={<RefundPolicy />} />
                                        <Route path="/shipping-policy" element={<ShippingPolicy />} />
                                        <Route path="/contact-us" element={<ContactUs />} />
                                        <Route path="/about-us" element={<AboutUs />} />
                                        <Route path="/disclaimer" element={<Disclaimer />} />

                                        {/* 🔓 ADMIN ROUTES (Direct Access) */}
                                        <Route path="/secret-admin" element={<AdminPanel />} />
                                        <Route path="/write-blog-secret" element={<AdminBlogWriter />} />
                                        <Route path="/admin/sidebar" element={<AdminSidebarControl />} />
                                        <Route path="/admin/job-drafts" element={<AdminJobDrafts />} />
                                        <Route path="/admin-stories-secret" element={<AdminWebStories />} />
                                        <Route path="/admin/browse" element={<AdminBrowseTab />} />

                                        {/* 🚫 404 */}
                                        <Route path="*" element={<NotFound />} />

                                    </Routes>
                                </Suspense>
                            </main>

                            {/* ✅ Footer Layout - Min height (CLS Fix) */}
                            <div style={{ minHeight: '200px' }}>
                                <Suspense fallback={<SilentLoader />}>
                                    <FloatingSocials />
                                    <Footer />
                                    <PopupAd />
                                </Suspense>
                            </div>

                        </div>

                    </LanguageProvider>
                </SiteSettingsProvider>
            </Router>
        </HelmetProvider>
    );
}

export default App;
