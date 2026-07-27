import {
    lazy, Suspense, useEffect,
    useRef, useState, type ReactNode
} from 'react';
import SEO from '@/components/SEO';

// =========================================================
// 🚀 CRITICAL PATH - Direct Import (LCP के लिए)
// =========================================================
import Hero from '@/sections/Hero';

// =========================================================
// 🛑 LAZY IMPORTS - Below the fold
// =========================================================
const FastTrackGrid = lazy(() => import('@/pages/FastTrackGrid'));
const HomeWebStories = lazy(() => import('@/components/HomeWebStories'));
const GovtJobs = lazy(() => import('@/sections/GovtJobs'));
const Shop = lazy(() => import('@/sections/Shop'));
const MaterialPage = lazy(() => import('./MaterialPage'));
const MockTestHomeSection = lazy(() => import('@/components/MockTestHomeSection'));
const EBooks = lazy(() => import('@/sections/Notes'));
const BlogHomeSection = lazy(() => import('@/components/BlogHomeSection'));
const Anthem = lazy(() => import('@/sections/Anthem'));

// =========================================================
// ⏳ LOADING FALLBACKS
// =========================================================

// Minimal skeleton - CLS नहीं होगा
const SectionSkeleton = ({ height = "h-48" }) => (
    <div className={`w-full ${height} bg-gray-50 animate-pulse rounded-xl mx-auto max-w-7xl px-4`}>
        <div className="h-full flex flex-col justify-center items-center gap-3">
            <div className="h-4 w-48 bg-gray-200 rounded" />
            <div className="h-3 w-32 bg-gray-100 rounded" />
        </div>
    </div>
);

// Section-specific skeletons
const JobsSkeleton = () => (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-pulse">
        <div className="h-6 w-48 bg-gray-200 rounded mb-4 mx-auto" />
        <div className="space-y-3">
            {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-gray-100 rounded-xl" />
            ))}
        </div>
    </div>
);

const GridSkeleton = () => (
    <div className="max-w-7xl mx-auto px-4 py-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl" />
            ))}
        </div>
    </div>
);

// =========================================================
// 👁️ INTERSECTION OBSERVER HOOK
// (Section सिर्फ तब load हो जब viewport में आए)
// =========================================================
function useLazySection(options = {}) {
    const ref = useRef<HTMLElement | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect(); // एक बार दिखने के बाद disconnect
                }
            },
            {
                rootMargin: '200px 0px', // 200px पहले से load शुरू
                threshold: 0.01,
                ...options
            }
        );

        if (ref.current) observer.observe(ref.current);

        return () => observer.disconnect();
    }, []);

    return { ref, isVisible };
}

// =========================================================
// 📦 LAZY SECTION WRAPPER
// =========================================================
const LazySection = ({
    id,
    children,
    fallback,
    className = "",
    minHeight = "200px"
}: {
    id?: string;
    children: ReactNode;
    fallback?: ReactNode;
    className?: string;
    minHeight?: string;
}) => {
    const { ref, isVisible } = useLazySection();

    return (
        <section
            id={id}
            ref={ref}
            className={`relative ${className}`}
            style={{ minHeight: isVisible ? 'auto' : minHeight }}
            aria-label={id ? id.replace(/-/g, ' ') : undefined}
        >
            {isVisible ? (
                <Suspense fallback={fallback || <SectionSkeleton />}>
                    {children}
                </Suspense>
            ) : (
                // Placeholder - CLS रोकता है
                fallback || <div style={{ minHeight }} className="bg-gray-50" aria-hidden="true" />
            )}
        </section>
    );
};

// =========================================================
// 🏠 MAIN HOME COMPONENT
// =========================================================
const Home = () => {

    // =========================================================
    // 🎨 RENDER
    // =========================================================
    return (
        <main className="min-h-screen">

            {/* ✅ Homepage SEO */}
            <SEO
                customTitle="StudyGyaan - Latest Govt Jobs Alert & Free Study Material 2025"
                customDescription="StudyGyaan पर पाएं Latest Sarkari Naukri, Free PDF Notes, Online Mock Tests और Premium Study Material। SSC, Railway, Bank, Police की सबसे बेहतर तैयारी करें।"
                customUrl="https://studygyaan.in"
                customImage="https://studygyaan.in/og-image.jpg"
                customKeywords="studygyaan, sarkari naukri 2025, govt jobs, free study material, mock test, SSC CGL, RRB NTPC, bank jobs"
                ogType="website"
                schemaType="all"
            />

            {/* =========================================================
                🦸 1. HERO - Critical (Direct, No Lazy - LCP!)
            ========================================================= */}
            <section id="hero-section" aria-label="Hero Section">
                <Hero />
            </section>

            {/* =========================================================
                ⚡ 2. FAST TRACK - Lazy (Just below fold)
            ========================================================= */}
            <LazySection
                id="fast-track-section"
                fallback={<GridSkeleton />}
                minHeight="150px"
                className="py-2"
            >
                <FastTrackGrid />
            </LazySection>

            {/* =========================================================
                📱 3. WEB STORIES - Lazy
            ========================================================= */}
            <LazySection
                id="web-stories-section"
                fallback={<SectionSkeleton height="h-40" />}
                minHeight="150px"
                className="py-2"
            >
                <HomeWebStories />
            </LazySection>

            {/* =========================================================
                💼 4. GOVT JOBS - Lazy (Heavy component)
            ========================================================= */}
            <LazySection
                id="govt-jobs"
                fallback={<JobsSkeleton />}
                minHeight="400px"
                className="py-2"
            >
                <GovtJobs />
            </LazySection>

            {/* =========================================================
                💎 5. PREMIUM NOTES - Lazy
            ========================================================= */}
            <LazySection
                id="premium-notes"
                fallback={<SectionSkeleton height="h-64" />}
                minHeight="300px"
                className="py-2"
            >
                <Shop />
            </LazySection>

            {/* =========================================================
                📚 6. FREE STUDY MATERIAL - Lazy
            ========================================================= */}
            <LazySection
                id="free-study-material"
                fallback={<GridSkeleton />}
                minHeight="300px"
                className="py-2"
            >
                <MaterialPage />
            </LazySection>

            {/* =========================================================
                📝 7. MOCK TESTS - Lazy
            ========================================================= */}
            <LazySection
                id="mock-tests"
                fallback={<GridSkeleton />}
                minHeight="250px"
                className="py-2"
            >
                <MockTestHomeSection />
            </LazySection>

            {/* =========================================================
                📖 8. E-BOOKS - Lazy
            ========================================================= */}
            <LazySection
                id="e-books"
                fallback={<GridSkeleton />}
                minHeight="250px"
                className="py-2"
            >
                <EBooks />
            </LazySection>

            {/* =========================================================
                ✍️ 9. BLOG SECTION - Lazy
            ========================================================= */}
            <LazySection
                id="blog"
                fallback={<JobsSkeleton />}
                minHeight="300px"
                className="py-2"
            >
                <BlogHomeSection />
            </LazySection>

            {/* =========================================================
                🎵 10. ANTHEM - Lazy (Least important)
            ========================================================= */}
            <LazySection
                id="anthem-section"
                fallback={<SectionSkeleton height="h-32" />}
                minHeight="100px"
                className="py-4"
            >
                <Anthem />
            </LazySection>

        </main>
    );
};

export default Home;
