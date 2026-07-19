// @ts-nocheck
import React, {
    useState, useEffect, useCallback,
    useMemo, useTransition
} from 'react';
import {
    Briefcase, MapPin, Clock, ArrowRight,
    Search, FileText, ChevronLeft, ChevronRight,
    Share2, MessageCircle, Sparkles, Tag,
    ExternalLink, ShoppingCart, Filter
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { jobRepository } from '@/features/jobs/data/jobRepository';
import SEO from '../components/SEO';

// =========================================================
// 🛠️ CONSTANTS
// =========================================================
const JOBS_PER_PAGE = 8;

const CATEGORY_TABS = [
    { id: 'all', label: 'All Jobs' },
    { id: 'ssc', label: 'SSC' },
    { id: 'banking', label: 'Banking' },
    { id: 'railway', label: 'Railway' },
    { id: 'defense', label: 'Defense' },
    { id: 'upsc', label: 'UPSC' },
    { id: 'teaching', label: 'Teaching' },
    { id: 'state', label: 'State Govt' },
    { id: 'engineering', label: 'Engineering' },
    { id: 'medical', label: 'Medical' },
    { id: 'other', label: 'Other' }
];

const LOOP_COLORS = [
    { bg: "bg-rose-50", border: "border-rose-200 hover:border-rose-400", text: "text-rose-900", iconText: "text-rose-600" },
    { bg: "bg-blue-50", border: "border-blue-200 hover:border-blue-400", text: "text-blue-900", iconText: "text-blue-600" },
    { bg: "bg-emerald-50", border: "border-emerald-200 hover:border-emerald-400", text: "text-emerald-900", iconText: "text-emerald-600" },
    { bg: "bg-amber-50", border: "border-amber-200 hover:border-amber-400", text: "text-amber-900", iconText: "text-amber-600" },
    { bg: "bg-purple-50", border: "border-purple-200 hover:border-purple-400", text: "text-purple-900", iconText: "text-purple-600" }
];

const LINK_GRADIENTS = [
    "bg-gradient-to-r from-blue-600 to-cyan-500",
    "bg-gradient-to-r from-purple-600 to-fuchsia-500",
    "bg-gradient-to-r from-orange-500 to-red-500",
    "bg-gradient-to-r from-emerald-500 to-teal-400",
    "bg-gradient-to-r from-rose-500 to-pink-500"
];

// =========================================================
// 🛠️ HELPERS
// =========================================================

// ✅ FIXED: Sahi date parsing - sabhi formats handle karta hai
function checkIsExpired(lastDateStr) {
    if (!lastDateStr) return false;

    const lower = String(lastDateStr).trim().toLowerCase();

    // Ye words hain to expired nahi
    if (
        lower === 'soon' ||
        lower === 'not specified' ||
        lower === 'active' ||
        lower === 'ongoing' ||
        lower === 'n/a' ||
        lower === ''
    ) return false;

    try {
        let parsedDate = null;

        // Format 1: DD/MM/YYYY ya DD-MM-YYYY (Indian format)
        const indianFormat = lastDateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (indianFormat) {
            const day = parseInt(indianFormat[1], 10);
            const month = parseInt(indianFormat[2], 10) - 1; // 0-indexed
            const year = parseInt(indianFormat[3], 10);
            parsedDate = new Date(year, month, day);
        }

        // Format 2: YYYY-MM-DD (ISO format - admin se aata hai)
        if (!parsedDate) {
            const isoFormat = lastDateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (isoFormat) {
                const year = parseInt(isoFormat[1], 10);
                const month = parseInt(isoFormat[2], 10) - 1;
                const day = parseInt(isoFormat[3], 10);
                parsedDate = new Date(year, month, day);
            }
        }

        // Format 3: "June 30, 2026" ya "30 June 2026" (English text)
        if (!parsedDate) {
            const textDate = new Date(lastDateStr);
            if (!isNaN(textDate.getTime())) {
                parsedDate = textDate;
            }
        }

        // Koi bhi format match nahi hua
        if (!parsedDate || isNaN(parsedDate.getTime())) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        parsedDate.setHours(0, 0, 0, 0);

        return parsedDate < today;

    } catch {
        return false;
    }
}

// ✅ External URLs ko redirect ke through bhejo
function safeExternalUrl(url) {
    if (!url || url === '#') return '#';
    if (url.startsWith('http') && !url.includes('studygyaan.in')) {
        return `/redirect?url=${encodeURIComponent(url)}`;
    }
    return url;
}

// =========================================================
// 🃏 JOB CARD COMPONENT (Memoized)
// =========================================================
const JobCard = React.memo(({ job, onWhatsAppShare }) => {
    const isExpired = job.isExpired;
    const jobUrl = `/job/${job.slug || job.id}`;

    return (
        <article
            className={`bg-white rounded-md md:rounded-xl p-2 md:p-5 border transition-shadow hover:shadow-md relative overflow-hidden ${isExpired
                ? 'border-red-100 opacity-75'
                : 'border-gray-100'
                }`}
            itemScope
            itemType="https://schema.org/JobPosting"
        >
            {/* Left border accent */}
            <div
                className={`absolute left-0 top-0 bottom-0 w-1 ${isExpired ? 'bg-red-400' : 'bg-blue-600'}`}
                aria-hidden="true"
            />

            <div className="pl-2 md:pl-4 flex flex-col gap-1.5">

                {/* Header Row */}
                <div className="flex items-center gap-1.5 flex-wrap">

                    {/* Organization ya Closed badge */}
                    {isExpired ? (
                        <span className="bg-red-50 text-red-700 text-[8px] md:text-[10px] px-2 py-0.5 rounded-full border border-red-200 font-black">
                            CLOSED
                        </span>
                    ) : (
                        <span
                            className="bg-blue-50 text-blue-700 text-[8px] md:text-[10px] px-2 py-0.5 rounded-full font-black truncate max-w-[200px]"
                            itemProp="hiringOrganization"
                        >
                            {job.organization}
                        </span>
                    )}

                    {/* Advt No */}
                    {job.advtNo && (
                        <span className="text-[8px] md:text-xs text-gray-400 hidden sm:flex items-center gap-0.5">
                            <FileText size={8} aria-hidden="true" />
                            {job.advtNo}
                        </span>
                    )}
                </div>

                {/* Title */}
                <a href={jobUrl} className="block group">
                    <h3
                        className={`text-[11px] md:text-lg font-black line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors ${isExpired ? 'text-gray-400' : 'text-gray-900'
                            }`}
                        itemProp="title"
                    >
                        {job.title}
                    </h3>
                </a>

                {/* Meta Info */}
                <div className="flex flex-wrap gap-2 text-[8px] md:text-sm text-gray-500">
                    {job.location && (
                        <span className="flex items-center gap-0.5" itemProp="jobLocation">
                            <MapPin size={8} className="md:w-3.5 md:h-3.5 shrink-0" aria-hidden="true" />
                            {job.location}
                        </span>
                    )}
                    {job.vacancies && (
                        <span className="flex items-center gap-0.5 text-blue-600 font-bold">
                            👥 {job.vacancies} Posts
                        </span>
                    )}
                    <span className={`flex items-center gap-0.5 font-bold ${isExpired ? 'text-red-500' : 'text-orange-600'
                        }`}>
                        <Clock size={8} className="md:w-3.5 md:h-3.5 shrink-0" aria-hidden="true" />
                        {isExpired ? 'Expired: ' : 'Last Date: '}
                        <time itemProp="validThrough">{job.lastDate}</time>
                    </span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5 mt-1">

                    {/* WhatsApp Share */}
                    <button
                        onClick={() => onWhatsAppShare(
                            job.title,
                            `${window.location.origin}${jobUrl}`
                        )}
                        aria-label={`Share ${job.title} on WhatsApp`}
                        className="bg-green-500 hover:bg-green-600 text-white px-2 py-1 md:px-3 md:py-1.5 rounded-lg flex items-center gap-1 transition-colors active:scale-95 text-[8px] md:text-xs font-bold"
                    >
                        <MessageCircle size={10} className="md:w-3.5 md:h-3.5" aria-hidden="true" />
                        Share
                    </button>

                    {/* View Details */}
                    <a
                        href={jobUrl}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 md:px-3 md:py-1.5 rounded-lg flex items-center gap-1 transition-colors text-[8px] md:text-xs font-bold"
                    >
                        Details
                        <ArrowRight size={10} className="md:w-3.5 md:h-3.5" aria-hidden="true" />
                    </a>

                    {/* Apply / Expired button */}
                    {isExpired ? (
                        <span className="ml-auto bg-red-50 text-red-400 border border-red-100 px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-[8px] md:text-xs font-bold cursor-not-allowed">
                            Expired
                        </span>
                    ) : job.applyLink ? (
                        <a
                            href={safeExternalUrl(job.applyLink)}
                            target="_blank"
                            rel="nofollow noopener noreferrer"
                            className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 md:px-4 md:py-1.5 rounded-lg flex items-center gap-1 font-bold active:scale-95 transition-all text-[8px] md:text-xs"
                        >
                            Apply Now
                            <ExternalLink size={10} className="md:w-3.5 md:h-3.5" aria-hidden="true" />
                        </a>
                    ) : null}
                </div>
            </div>
        </article>
    );
});

JobCard.displayName = 'JobCard';

// =========================================================
// 📄 SKELETON LOADER
// =========================================================
const JobSkeleton = () => (
    <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
                <div className="h-3 w-24 bg-gray-100 rounded mb-2" />
                <div className="h-4 w-3/4 bg-gray-100 rounded mb-3" />
                <div className="h-3 w-1/2 bg-gray-100 rounded mb-3" />
                <div className="flex gap-2">
                    <div className="h-7 w-16 bg-gray-100 rounded-lg" />
                    <div className="h-7 w-16 bg-gray-100 rounded-lg" />
                    <div className="h-7 w-20 bg-gray-100 rounded-lg ml-auto" />
                </div>
            </div>
        ))}
    </div>
);

// =========================================================
// 🚀 MAIN COMPONENT
// =========================================================
const GovtJobs = () => {
    const { t } = useLanguage();
    const [isPending, startTransition] = useTransition();

    // State
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [globalSettings, setGlobalSettings] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);

    // =========================================================
    // 📡 DATA FETCH
    // =========================================================
    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);

                // ✅ Parallel fetch - dono ek saath
                const [jobsResult, settingsResult] = await Promise.allSettled([
                    jobRepository.listLatest({ limitCount: 150 }),
                    getDoc(doc(db, "site_settings", "global"))
                ]);

                // Jobs process karo
                if (jobsResult.status === 'fulfilled') {
                    const fetchedJobs = [];

                    jobsResult.value.forEach(docSnap => {
                        const data = docSnap.data();

                        // Sirf JOB type lo, AFFILIATE nahi
                        if (
                            data.type &&
                            data.type !== 'JOB' &&
                            data.type !== 'job'
                        ) return;

                        // Draft jobs skip karo
                        if (data.isLive === false) return;

                        fetchedJobs.push({
                            id: docSnap.id,
                            slug: data.slug || docSnap.id,
                            title: data.title || '',
                            organization: data.organization || '',
                            vacancies: data.vacancies || '',
                            location: data.location || 'All India',
                            lastDate: data.lastDate || '',
                            salary: data.salary || '',
                            applyLink: data.applyLink || '',
                            category: (data.category || 'other').toLowerCase(),
                            advtNo: data.advtNo || '',
                            // ✅ FIXED checkIsExpired use karo
                            isExpired: checkIsExpired(data.lastDate),
                            createdAt: data.createdAt || null
                        });
                    });

                    // ✅ Active pehle, Expired baad mein
                    // Same group mein server order (createdAt desc) maintain karo
                    fetchedJobs.sort((a, b) => {
                        if (a.isExpired !== b.isExpired) {
                            return a.isExpired ? 1 : -1;
                        }
                        return 0;
                    });

                    setJobs(fetchedJobs);
                }

                // Site Settings
                if (
                    settingsResult.status === 'fulfilled' &&
                    settingsResult.value.exists()
                ) {
                    setGlobalSettings(settingsResult.value.data());
                }

            } catch (error) {
                console.error("Jobs fetch error:", error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    // =========================================================
    // 🔍 SEARCH DEBOUNCE - 300ms
    // =========================================================
    useEffect(() => {
        const timer = setTimeout(() => {
            startTransition(() => {
                setSearchQuery(searchInput);
                setCurrentPage(1);
            });
        }, 300);

        return () => clearTimeout(timer);
    }, [searchInput]);

    // =========================================================
    // 🔢 FILTERED JOBS (Memoized)
    // =========================================================
    const filteredJobs = useMemo(() => {
        return jobs.filter(job => {

            // Category match check
            const catMatch =
                selectedCategory === 'all' ||
                job.category === selectedCategory ||
                (selectedCategory === 'state' && job.category === 'state-exams');

            // Search match check
            const searchLower = searchQuery.toLowerCase();
            const searchMatch =
                !searchQuery ||
                job.title.toLowerCase().includes(searchLower) ||
                job.organization.toLowerCase().includes(searchLower) ||
                job.location.toLowerCase().includes(searchLower);

            return catMatch && searchMatch;
        });
    }, [jobs, selectedCategory, searchQuery]);

    // =========================================================
    // 📄 PAGINATION (Memoized)
    // =========================================================
    const { currentJobs, totalPages } = useMemo(() => {
        const start = (currentPage - 1) * JOBS_PER_PAGE;
        const end = start + JOBS_PER_PAGE;
        return {
            currentJobs: filteredJobs.slice(start, end),
            totalPages: Math.ceil(filteredJobs.length / JOBS_PER_PAGE)
        };
    }, [filteredJobs, currentPage]);

    // =========================================================
    // 💬 WHATSAPP SHARE
    // =========================================================
    const handleWhatsAppShare = useCallback((title, jobUrl) => {
        const msg = encodeURIComponent(
            `🔥 *New Job Update!*\n\n📌 *${title}*\n\nपूरी जानकारी 👇\n${jobUrl}\n\n(via StudyGyaan.in)`
        );
        window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener');
    }, []);

    // =========================================================
    // 📄 PAGE CHANGE
    // =========================================================
    const handlePageChange = useCallback((page) => {
        startTransition(() => {
            setCurrentPage(page);
        });
        const section = document.getElementById('govt-jobs');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    // =========================================================
    // 💰 SIDEBAR COMPUTED VALUES
    // =========================================================
    const sellingPrice = useMemo(() => Math.round(
        Number(globalSettings?.mrpPrice || 499) *
        (1 - Number(globalSettings?.discountPercent || 85) / 100)
    ), [globalSettings]);

    const trendingBlogs = useMemo(() =>
        (globalSettings?.relatedBlogs || []).slice(0, 5),
        [globalSettings]
    );

    const pageQuickLinks = useMemo(() =>
        globalSettings?.jobUpdates?.length > 0
            ? globalSettings.jobUpdates
            : (globalSettings?.sidebarLinks || []),
        [globalSettings]
    );

    // =========================================================
    // 📊 CATEGORY CHANGE
    // =========================================================
    const handleCategoryChange = useCallback((catId) => {
        startTransition(() => {
            setSelectedCategory(catId);
            setCurrentPage(1);
        });
    }, []);

    // =========================================================
    // 🎨 RENDER
    // =========================================================
    return (
        <section id="govt-jobs" className="py-4 md:py-16 bg-gray-50 font-hindi">

            <SEO
                customTitle="Latest Govt Jobs 2026 - सरकारी नौकरी Alert | StudyGyaan"
                customDescription="SSC, Railway, Banking, Police और State Exams की Latest Government Jobs। Daily updates, direct apply links और free preparation material।"
                customKeywords="govt jobs 2026, sarkari naukri, SSC jobs, railway jobs, bank jobs, police bharti, latest vacancy"
            />

            <div className="max-w-7xl mx-auto px-2 md:px-8">

                {/* Page Header */}
                <header className="text-center mb-4 md:mb-10">
                    <h2 className="text-lg md:text-4xl font-black text-gray-900 mb-1">
                        {t('jobs.title') || 'Latest Govt Jobs 2026'}
                    </h2>
                    <p className="text-[9px] md:text-base text-gray-500 font-bold">
                        लेटेस्ट सरकारी भर्तियों की जानकारी सबसे पहले •{' '}
                        <span className="text-blue-600">{jobs.length} Jobs Available</span>
                    </p>
                </header>

                {/* Filter Bar */}
                <div className="bg-white p-2 md:p-4 rounded-xl shadow-sm border border-gray-100 mb-4 md:mb-6">
                    <div className="flex flex-col md:flex-row gap-2 items-center justify-between">

                        {/* Category Tabs */}
                        <nav
                            aria-label="Job Categories"
                            className="flex gap-1 overflow-x-auto pb-1 w-full no-scrollbar"
                        >
                            {CATEGORY_TABS.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => handleCategoryChange(cat.id)}
                                    aria-pressed={selectedCategory === cat.id}
                                    className={`px-2 py-1 rounded-lg text-[8px] md:text-sm font-bold transition-all whitespace-nowrap ${selectedCategory === cat.id
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                        }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </nav>

                        {/* Search Input */}
                        <div className="relative w-full md:w-72 shrink-0">
                            <Search
                                className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 text-gray-400"
                                aria-hidden="true"
                            />
                            <input
                                type="search"
                                aria-label="Search Jobs"
                                placeholder="Search jobs..."
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                className="w-full pl-7 md:pl-9 pr-3 py-1.5 md:py-2 text-[9px] md:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* Search Results Count */}
                {!loading && searchQuery && (
                    <p className="text-[9px] md:text-sm text-gray-500 font-bold mb-3">
                        "{searchQuery}" के लिए {filteredJobs.length} results
                    </p>
                )}

                <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">

                    {/* ===================== MAIN CONTENT ===================== */}
                    <main className="w-full md:w-[65%]">

                        {loading ? (
                            <JobSkeleton />
                        ) : currentJobs.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
                                <Briefcase
                                    className="w-10 h-10 text-gray-200 mx-auto mb-3"
                                    aria-hidden="true"
                                />
                                <h3 className="text-sm md:text-lg font-black text-gray-700 mb-1">
                                    कोई Job नहीं मिली
                                </h3>
                                <p className="text-xs text-gray-400">
                                    दूसरी Category या Search try करें
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">

                                {/* Job Cards */}
                                {currentJobs.map(job => (
                                    <JobCard
                                        key={job.id}
                                        job={job}
                                        onWhatsAppShare={handleWhatsAppShare}
                                    />
                                ))}

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <nav
                                        aria-label="Job Listings Pages"
                                        className="mt-6 flex justify-center items-center gap-2"
                                    >
                                        {/* Prev Button */}
                                        <button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1 || isPending}
                                            aria-label="Previous Page"
                                            className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                        >
                                            <ChevronLeft size={14} />
                                        </button>

                                        {/* Page Number Buttons */}
                                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                            let page;
                                            if (totalPages <= 5) {
                                                page = i + 1;
                                            } else if (currentPage <= 3) {
                                                page = i + 1;
                                            } else if (currentPage >= totalPages - 2) {
                                                page = totalPages - 4 + i;
                                            } else {
                                                page = currentPage - 2 + i;
                                            }
                                            return (
                                                <button
                                                    key={page}
                                                    onClick={() => handlePageChange(page)}
                                                    aria-label={`Page ${page}`}
                                                    aria-current={currentPage === page ? 'page' : undefined}
                                                    className={`h-8 w-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${currentPage === page
                                                        ? 'bg-blue-600 text-white shadow-sm'
                                                        : 'border border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
                                                        }`}
                                                >
                                                    {page}
                                                </button>
                                            );
                                        })}

                                        {/* Next Button */}
                                        <button
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages || isPending}
                                            aria-label="Next Page"
                                            className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                        >
                                            <ChevronRight size={14} />
                                        </button>
                                    </nav>
                                )}
                            </div>
                        )}

                        {/* Internal Links Section */}
                        <div className="bg-blue-50/50 p-5 md:p-8 rounded-2xl border border-blue-100 mt-6">
                            <h2 className="text-sm md:text-xl font-black text-slate-800 mb-4 flex items-center gap-2">
                                <Search size={18} className="text-blue-600" aria-hidden="true" />
                                Explore More on StudyGyaan
                            </h2>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { href: "/govt-jobs", label: "Latest Govt Jobs" },
                                    { href: "/free-study-material", label: "Free Study Material" },
                                    { href: "/test", label: "Free Mock Tests" },
                                    { href: "/blog", label: "Blogs & Updates" },
                                    { href: "/web-stories", label: "Web Stories" }
                                ].map(link => (
                                    <a
                                        key={link.href}
                                        href={link.href}
                                        className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-4 py-2 rounded-xl text-[10px] md:text-sm font-black transition-all shadow-sm"
                                    >
                                        {link.label}
                                    </a>
                                ))}
                            </div>
                        </div>
                    </main>

                    {/* ===================== SIDEBAR ===================== */}
                    <aside className="w-full md:w-[35%] space-y-4 sticky top-16">

                        {/* Trending Blogs */}
                        {trendingBlogs.length > 0 && (
                            <section className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100">
                                <h2 className="text-sm md:text-base font-black text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center gap-2">
                                    <Sparkles size={16} className="text-purple-600" aria-hidden="true" />
                                    ट्रेंडिंग ब्लॉग्स 🔥
                                </h2>
                                <ul className="space-y-2" role="list">
                                    {trendingBlogs.map((item, index) => {
                                        const style = LOOP_COLORS[index % LOOP_COLORS.length];
                                        const isInternal =
                                            item.url?.includes('studygyaan.in') ||
                                            item.url?.startsWith('/');
                                        const href = isInternal
                                            ? (item.url?.replace('https://studygyaan.in', '') || '/blog')
                                            : safeExternalUrl(item.url);

                                        return (
                                            <li key={index}>
                                                <a
                                                    href={href}
                                                    target={isInternal ? '_self' : '_blank'}
                                                    rel={isInternal ? undefined : 'noopener noreferrer'}
                                                    className={`group flex items-center justify-between border-2 ${style.border} ${style.bg} p-3 rounded-xl transition-all hover:-translate-y-0.5 shadow-sm`}
                                                >
                                                    <span className={`flex-1 pr-2 text-[12px] font-black ${style.text} line-clamp-2 leading-snug`}>
                                                        {item.title}
                                                    </span>
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center bg-white shadow-sm shrink-0 ${style.iconText}`}>
                                                        <ArrowRight size={14} aria-hidden="true" />
                                                    </div>
                                                </a>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        )}

                        {/* Quick Links */}
                        {pageQuickLinks.length > 0 && (
                            <section className="bg-white p-4 md:p-6 rounded-2xl border border-slate-100 shadow-sm">
                                <h2 className="text-sm md:text-base font-black text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center gap-2">
                                    <Tag size={16} className="text-blue-600" aria-hidden="true" />
                                    महत्वपूर्ण लिंक्स 🔗
                                </h2>
                                <ul className="space-y-2" role="list">
                                    {pageQuickLinks.map((item, index) => (
                                        <li key={index}>
                                            <a
                                                href={safeExternalUrl(item.url)}
                                                target={item.url?.startsWith('http') ? '_blank' : '_self'}
                                                rel={item.url?.startsWith('http')
                                                    ? 'nofollow noopener noreferrer'
                                                    : undefined
                                                }
                                                className={`group flex items-center justify-between p-3 rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 ${LINK_GRADIENTS[index % LINK_GRADIENTS.length]} text-white`}
                                            >
                                                <div className="flex items-center gap-2 flex-1">
                                                    <div className="bg-white/20 p-1 rounded-lg shrink-0">
                                                        <ExternalLink size={12} aria-hidden="true" />
                                                    </div>
                                                    <span className="font-black text-[11px] md:text-sm leading-snug">
                                                        {item.title || item.name}
                                                    </span>
                                                </div>
                                                <ArrowRight
                                                    size={14}
                                                    className="shrink-0 group-hover:translate-x-1 transition-all"
                                                    aria-hidden="true"
                                                />
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {/* Premium Promo Card */}
                        <section className="p-4 md:p-6 bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 rounded-2xl text-white shadow-xl border-b-4 border-black/20">
                            <p className="font-black text-sm md:text-lg mb-1 italic flex items-center gap-2 text-yellow-300">
                                <ShoppingCart size={18} aria-hidden="true" />
                                प्रीमियम नोट्स
                            </p>
                            <p className="text-[10px] md:text-xs opacity-90 mb-4 leading-relaxed">
                                10 साल के रिपीटेड सवालों का पूरा निचोड़।
                            </p>
                            <div className="flex items-center gap-2 mb-4 bg-white/10 p-2 md:p-3 rounded-xl border border-white/10">
                                <span className="line-through text-white/50 text-[10px] font-bold">
                                    ₹{globalSettings?.mrpPrice || '499'}
                                </span>
                                <span className="bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded">
                                    {globalSettings?.discountPercent || '85'}% OFF
                                </span>
                                <span className="text-sm md:text-xl font-black text-yellow-400 ml-auto">
                                    ₹{sellingPrice}
                                </span>
                            </div>
                            <a
                                href="/premium-notes"
                                className="block w-full bg-yellow-400 text-blue-900 font-black py-2.5 rounded-xl text-center text-[12px] md:text-sm hover:bg-yellow-300 active:scale-95 transition-transform shadow-lg"
                            >
                                अभी खरीदें →
                            </a>
                        </section>

                    </aside>
                </div>
            </div>
        </section>
    );
};

export default GovtJobs;
