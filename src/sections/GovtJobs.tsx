import React, {
    useState, useEffect, useCallback,
    useMemo, useTransition
} from 'react';
import {
    Briefcase, MapPin, Clock, ArrowRight,
    Search, FileText, ChevronLeft, ChevronRight,
    MessageCircle, ExternalLink
} from 'lucide-react';
import DynamicSidebar from '@/components/DynamicSidebar';
import { JOB_HUBS } from '@/config/jobHubs';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/context/useLanguage';
import { jobRepository } from '@/features/jobs/data/jobRepository';
import SEO from '../components/SEO';
import { siteSettingsRepository } from '@/features/site-settings/data/siteSettingsRepository';
import type { TimestampLike } from '@/types/firestore';
import { ROUTES } from '@/config/routes';

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

// =========================================================
// 🧾 VIEW TYPES
// =========================================================
interface JobCardItem {
    id: string;
    slug: string;
    title: string;
    organization: string;
    vacancies: string;
    location: string;
    lastDate: string;
    salary: string;
    applyLink: string;
    category: string;
    advtNo: string;
    isExpired: boolean;
    createdAt: TimestampLike;
}

interface QuickLink {
    title?: string;
    name?: string;
    url?: string;
}

interface GovtJobSettings {
    jobUpdates?: QuickLink[];
    mrpPrice?: string | number;
    discountPercent?: string | number;
}

/** Raw Firestore snapshot ya pre-processed object — dono ho sakte hain. */
type SettingsResult = (GovtJobSettings & {
    exists?: () => boolean;
    data?: () => Record<string, unknown>;
}) | null;

// =========================================================
// 🛠️ HELPERS
// =========================================================
function checkIsExpired(lastDateStr: string): boolean {
    if (!lastDateStr) return false;

    const lower = String(lastDateStr).trim().toLowerCase();

    if (
        lower === 'soon' ||
        lower === 'not specified' ||
        lower === 'active' ||
        lower === 'ongoing' ||
        lower === 'n/a' ||
        lower === ''
    ) return false;

    try {
        let parsedDate: Date | null = null;

        // Format 1: DD/MM/YYYY ya DD-MM-YYYY
        const indianFormat = lastDateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (indianFormat) {
            const day = parseInt(indianFormat[1], 10);
            const month = parseInt(indianFormat[2], 10) - 1;
            const year = parseInt(indianFormat[3], 10);
            parsedDate = new Date(year, month, day);
        }

        // Format 2: YYYY-MM-DD
        if (!parsedDate) {
            const isoFormat = lastDateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (isoFormat) {
                const year = parseInt(isoFormat[1], 10);
                const month = parseInt(isoFormat[2], 10) - 1;
                const day = parseInt(isoFormat[3], 10);
                parsedDate = new Date(year, month, day);
            }
        }

        // Format 3: "June 30, 2026"
        if (!parsedDate) {
            const textDate = new Date(lastDateStr);
            if (!isNaN(textDate.getTime())) {
                parsedDate = textDate;
            }
        }

        if (!parsedDate || isNaN(parsedDate.getTime())) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        parsedDate.setHours(0, 0, 0, 0);

        return parsedDate < today;

    } catch {
        return false;
    }
}

function safeExternalUrl(url: string): string {
    if (!url || url === '#') return '#';
    if (url.startsWith('http') && !url.includes('studygyaan.in')) {
        return `/redirect?url=${encodeURIComponent(url)}`;
    }
    return url;
}

// =========================================================
// 🃏 JOB CARD COMPONENT
// =========================================================
const JobCard = React.memo(({ job, onWhatsAppShare }: {
    job: JobCardItem;
    onWhatsAppShare: (title: string, jobUrl: string) => void;
}) => {
    const isExpired = job.isExpired;
    const jobUrl = ROUTES.job(job.slug || job.id);

    return (
        <article
            className={`bg-white rounded-md md:rounded-xl p-2 md:p-5 border transition-shadow hover:shadow-md relative overflow-hidden 
                ${isExpired ? 'border-red-100 opacity-75' : 'border-gray-100'}`}
            itemScope
            itemType="https://schema.org/JobPosting"
        >
            <div
                className={`absolute left-0 top-0 bottom-0 w-1 ${isExpired ? 'bg-red-400' : 'bg-blue-600'}`}
                aria-hidden="true"
            />

            <div className="pl-2 md:pl-4 flex flex-col gap-1.5">

                {/* Header Row */}
                <div className="flex items-center gap-1.5 flex-wrap">
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
                        className={`text-[11px] md:text-lg font-black line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors 
                            ${isExpired ? 'text-gray-400' : 'text-gray-900'}`}
                        itemProp="title"
                    >
                        {job.title}
                    </h3>
                </a>

                {/* Meta */}
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
                    <span className={`flex items-center gap-0.5 font-bold ${isExpired ? 'text-red-500' : 'text-orange-600'}`}>
                        <Clock size={8} className="md:w-3.5 md:h-3.5 shrink-0" aria-hidden="true" />
                        {isExpired ? 'Expired: ' : 'Last Date: '}
                        <time itemProp="validThrough">{job.lastDate}</time>
                    </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 mt-1">
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

                    <a
                        href={jobUrl}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 md:px-3 md:py-1.5 rounded-lg flex items-center gap-1 transition-colors text-[8px] md:text-xs font-bold"
                    >
                        Details
                        <ArrowRight size={10} className="md:w-3.5 md:h-3.5" aria-hidden="true" />
                    </a>

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
// 📄 SKELETON
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

    const [jobs, setJobs] = useState<JobCardItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [, setGlobalSettings] = useState<GovtJobSettings | null>(null); // settings ab sirf fetch-compat ke liye
    const [currentPage, setCurrentPage] = useState(1);

    // =========================================================
    // 📡 DATA FETCH
    // =========================================================
    useEffect(() => {
        let cancelled = false;

        Promise.allSettled([
            jobRepository.listLatest({ limitCount: 150 }),
            siteSettingsRepository.getGlobal()
        ])
            .then(([jobsResult, settingsResult]) => {
                if (cancelled) return;

                if (jobsResult.status === 'fulfilled') {
                    const fetchedJobs: JobCardItem[] = jobsResult.value
                        .filter(job => {
                            if (!job) return false;
                            if (!job.type) return true;
                            return String(job.type).toUpperCase() === 'JOB';
                        })
                        .filter(job => job.isLive !== false) // draft skip
                        .map(job => ({
                            id: job.id,
                            slug: job.slug || job.id,
                            title: String(job.title || ''),
                            organization: String(job.organization || ''),
                            vacancies: String(job.vacancies || ''),
                            location: String(job.location || 'All India'),
                            lastDate: String(job.lastDate || ''),
                            salary: String(job.salary || ''),
                            applyLink: String(job.applyLink || ''),
                            category: String(job.category || 'other').toLowerCase(),
                            advtNo: String(job.advtNo || ''),
                            isExpired: checkIsExpired(String(job.lastDate || '')),
                            createdAt: job.createdAt || null
                        }));

                    // Active pehle, expired baad mein
                    fetchedJobs.sort((a, b) => {
                        if (a.isExpired !== b.isExpired) {
                            return a.isExpired ? 1 : -1;
                        }
                        return 0;
                    });

                    setJobs(fetchedJobs);
                    console.log(`✅ ${fetchedJobs.length} jobs loaded`);
                }

                // ✅ Settings - dono cases handle karo
                if (settingsResult.status === 'fulfilled' && settingsResult.value) {
                    const val = settingsResult.value as unknown as SettingsResult;

                    // Case 1: Raw Firebase doc (has .exists() method)
                    if (typeof val?.exists === 'function') {
                        if (val.exists()) {
                            setGlobalSettings((val.data?.() || null) as GovtJobSettings | null);
                        }
                    }
                    // Case 2: Already processed plain object
                    else if (val && typeof val === 'object') {
                        setGlobalSettings(val);
                    }
                }
            })
            .catch(error => {
                console.error("Jobs fetch error:", error);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, []);

    // =========================================================
    // 🔍 SEARCH DEBOUNCE
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
    // 🔢 FILTERED JOBS
    // =========================================================
    const filteredJobs = useMemo(() => {
        return jobs.filter(job => {
            const catMatch =
                selectedCategory === 'all' ||
                job.category === selectedCategory ||
                (selectedCategory === 'state' && job.category === 'state-exams');

            const searchLower = searchQuery.toLowerCase();
            const searchMatch =
                !searchQuery ||
                (job.title || '').toLowerCase().includes(searchLower) ||
                (job.organization || '').toLowerCase().includes(searchLower) ||
                (job.location || '').toLowerCase().includes(searchLower);

            return catMatch && searchMatch;
        });
    }, [jobs, selectedCategory, searchQuery]);

    // =========================================================
    // 📄 PAGINATION
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
    const handleWhatsAppShare = useCallback((title: string, jobUrl: string) => {
        const msg = encodeURIComponent(
            `🔥 *New Job Update!*\n\n📌 *${title}*\n\nपूरी जानकारी 👇\n${jobUrl}\n\n(via StudyGyaan.in)`
        );
        window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener');
    }, []);

    // =========================================================
    // 📄 PAGE CHANGE
    // =========================================================
    const handlePageChange = useCallback((page: number) => {
        startTransition(() => setCurrentPage(page));
        const section = document.getElementById('govt-jobs');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    // =========================================================
    // 💰 SIDEBAR VALUES
    // =========================================================

    const handleCategoryChange = useCallback((catId: string) => {
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

                {/* Header */}
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
                                    className={`px-2 py-1 rounded-lg text-[8px] md:text-sm font-bold transition-all whitespace-nowrap 
                                        ${selectedCategory === cat.id
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </nav>

                        {/* Search */}
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

                {/* 🎯 JOB HUBS — qualification/category/state wise pages */}
                <div className="bg-white p-2.5 md:p-3 rounded-xl shadow-sm border border-gray-100 mb-4 md:mb-6">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        <span className="text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-wider shrink-0">
                            🎯 Category:
                        </span>
                        {JOB_HUBS.map((hub) => (
                            <Link
                                key={hub.slug}
                                to={ROUTES.jobHub(hub.slug)}
                                className="shrink-0 px-2.5 py-1 rounded-full bg-slate-50 hover:bg-blue-600 hover:text-white border border-slate-200 text-[9px] md:text-[11px] font-bold text-slate-600 transition-all whitespace-nowrap"
                            >
                                {hub.emoji} {hub.label}
                            </Link>
                        ))}
                        <Link
                            to={ROUTES.examCalendar}
                            className="shrink-0 px-2.5 py-1 rounded-full bg-amber-50 hover:bg-amber-500 hover:text-white border border-amber-200 text-[9px] md:text-[11px] font-black text-amber-700 transition-all whitespace-nowrap"
                        >
                            📅 Exam Calendar
                        </Link>
                    </div>
                </div>

                {/* Search Count */}
                {!loading && searchQuery && (
                    <p className="text-[9px] md:text-sm text-gray-500 font-bold mb-3">
                        "{searchQuery}" के लिए {filteredJobs.length} results
                    </p>
                )}

                <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">

                    {/* ===== MAIN CONTENT ===== */}
                    <main className="w-full md:w-[65%]">

                        {loading ? (
                            <JobSkeleton />
                        ) : currentJobs.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
                                <Briefcase className="w-10 h-10 text-gray-200 mx-auto mb-3" aria-hidden="true" />
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
                                        <button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1 || isPending}
                                            aria-label="Previous Page"
                                            className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                        >
                                            <ChevronLeft size={14} />
                                        </button>

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
                                                    className={`h-8 w-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all 
                                                        ${currentPage === page
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : 'border border-gray-200 bg-white hover:bg-gray-50 text-gray-600'}`}
                                                >
                                                    {page}
                                                </button>
                                            );
                                        })}

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
                    </main>

                    {/* ===== SIDEBAR ===== */}
                    <aside className="w-full md:w-[35%] space-y-4 sticky top-16">
                        {/* 🔄 Auto-updating sidebar — manual links hata diye */}
                        <DynamicSidebar />
                    </aside>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </section>
    );
};

export default GovtJobs;