import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBlog } from '@/features/blogs/hooks/useBlog';
import { blogRepository } from '@/features/blogs/data/blogRepository';
import {
    Calendar, User, Tag, Clock, ChevronLeft,
    Share2, ExternalLink, Flame, ShoppingCart,
    ArrowRight, Sparkles, FileSearch, Eye,
    Check
} from 'lucide-react';
import { toast } from 'sonner';
import SEO from '../components/SEO';
import { siteSettingsRepository } from '@/features/site-settings/data/siteSettingsRepository';
import type { BlogPostRecord, TimestampLike } from '@/types/firestore';

// =========================================================
// 🛠️ HELPERS
// =========================================================
function toDateObj(dateField: TimestampLike): Date | null {
    if (!dateField) return null;
    try {
        if (dateField instanceof Date) return dateField;
        const d = dateField as { seconds?: number; toDate?: () => Date };
        if (typeof d.seconds === 'number') return new Date(d.seconds * 1000);
        if (typeof d.toDate === 'function') return d.toDate();
        return new Date(dateField as string | number);
    } catch {
        return null;
    }
}

function formatDate(dateField: TimestampLike): string {
    return (toDateObj(dateField) || new Date()).toLocaleDateString('hi-IN');
}

function getIsoDate(dateField: TimestampLike): string {
    return (toDateObj(dateField) || new Date()).toISOString();
}

function estimateReadTime(content?: string): string {
    if (!content) return '5 मिनट';
    const text = content.replace(/<[^>]*>/g, '');
    const words = text.split(/\s+/).length;
    const minutes = Math.ceil(words / 200);
    return `${minutes} मिनट`;
}

// =========================================================
// 🎨 COLORS
// =========================================================
const LOOP_COLORS = [
    { bg: 'bg-rose-50', border: 'border-rose-200 hover:border-rose-400', text: 'text-rose-900', iconText: 'text-rose-600' },
    { bg: 'bg-blue-50', border: 'border-blue-200 hover:border-blue-400', text: 'text-blue-900', iconText: 'text-blue-600' },
    { bg: 'bg-emerald-50', border: 'border-emerald-200 hover:border-emerald-400', text: 'text-emerald-900', iconText: 'text-emerald-600' },
    { bg: 'bg-amber-50', border: 'border-amber-200 hover:border-amber-400', text: 'text-amber-900', iconText: 'text-amber-600' },
    { bg: 'bg-purple-50', border: 'border-purple-200 hover:border-purple-400', text: 'text-purple-900', iconText: 'text-purple-600' }
];

const LINK_GRADIENTS = [
    'bg-gradient-to-r from-blue-600 to-cyan-500 shadow-blue-500/30',
    'bg-gradient-to-r from-purple-600 to-fuchsia-500 shadow-purple-500/30',
    'bg-gradient-to-r from-orange-500 to-red-500 shadow-orange-500/30',
    'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-emerald-500/30',
    'bg-gradient-to-r from-rose-500 to-pink-500 shadow-rose-500/30'
];

// =========================================================
// 🦴 SKELETON — CLS nahi hogi, same layout reserve karta hai
// =========================================================
const BlogPostSkeleton = () => (
    <div className="min-h-screen bg-[#F8FAFC] font-hindi antialiased pb-20">

        {/* Navbar skeleton */}
        <div
            className="sticky top-0 z-50 bg-white/80 border-b border-slate-100 px-3 md:px-6 shadow-sm"
            style={{ height: '48px' }}
        />

        {/* Hero image skeleton */}
        <div
            className="w-full bg-slate-200 animate-pulse"
            style={{ height: 'clamp(180px, 25vh, 40vh)' }}
        />

        <div className="max-w-7xl mx-auto px-2 md:px-4 py-4 md:py-8">
            <div className="flex flex-col md:flex-row gap-4 md:gap-8">

                {/* Article skeleton */}
                <div className="w-full md:w-[65%]">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-8 space-y-4 animate-pulse">
                        {/* meta bar */}
                        <div className="flex gap-2 pb-4 border-b border-slate-100">
                            <div className="h-8 w-24 bg-slate-100 rounded-lg" />
                            <div className="h-8 w-28 bg-slate-100 rounded-lg" />
                            <div className="h-8 w-20 bg-slate-100 rounded-lg" />
                        </div>
                        {/* content lines */}
                        <div className="h-4 bg-slate-100 rounded w-full" />
                        <div className="h-4 bg-slate-100 rounded w-5/6" />
                        <div className="h-4 bg-slate-100 rounded w-4/6" />
                        <div className="h-4 bg-slate-100 rounded w-full" />
                        <div className="h-4 bg-slate-100 rounded w-3/4" />
                        <div className="h-4 bg-slate-100 rounded w-full" />
                        <div className="h-4 bg-slate-100 rounded w-2/3" />
                        <div className="h-4 bg-slate-100 rounded w-5/6" />
                        <div className="h-4 bg-slate-100 rounded w-full" />
                        <div className="h-4 bg-slate-100 rounded w-4/5" />
                    </div>
                </div>

                {/* Sidebar skeleton */}
                <div className="w-full md:w-[35%] space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse space-y-3">
                        <div className="h-5 bg-slate-100 rounded w-2/3" />
                        <div className="h-14 bg-slate-100 rounded-xl" />
                        <div className="h-14 bg-slate-100 rounded-xl" />
                        <div className="h-14 bg-slate-100 rounded-xl" />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse space-y-3">
                        <div className="h-5 bg-slate-100 rounded w-1/2" />
                        <div className="h-12 bg-slate-100 rounded-xl" />
                        <div className="h-12 bg-slate-100 rounded-xl" />
                    </div>
                </div>
            </div>
        </div>

        {/* Bottom bar skeleton */}
        <div
            className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200"
            style={{ height: '56px' }}
        />
    </div>
);

// =========================================================
// 🚀 MAIN COMPONENT
// =========================================================
// =========================================================
// 🔧 DEFAULT SETTINGS
// =========================================================
interface SidebarLink {
    name?: string;
    title?: string;
    url?: string;
}

interface RelatedBlogLink {
    title?: string;
    url?: string;
}

interface SidebarSettings {
    sidebarLinks: SidebarLink[];
    relatedBlogs: RelatedBlogLink[];
    premiumBoxTitle: string;
    premiumBoxDesc: string;
    bottomBarText: string;
    premiumPrice: string;
    mrpPrice: string;
    discountPercent: string;
}

function getDefaultSettings(): SidebarSettings {
    return {
        sidebarLinks: [
            { name: 'New Govt Job Details', url: '/govt-jobs' },
            { name: 'Best Free Study Materials', url: '/free-study-material' }
        ],
        relatedBlogs: [
            { title: 'SSC CGL 2025: पूरी जानकारी और सिलेबस', url: '/blog' },
            { title: 'Railway Group D: Preparation Guide', url: '/blog' }
        ],
        premiumBoxTitle: 'Premium Material Notes',
        premiumBoxDesc: '100% सफलता के लिए श्रेणी-वार महत्वपूर्ण सवालों का असली संग्रह।',
        bottomBarText: '📢 Premium Notes: पिछले 10 साल के रिपीटेड सवालों का पूरा बंडल',
        premiumPrice: '69',
        mrpPrice: '499',
        discountPercent: '85'
    };
}


const BlogPost = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [globalSettings, setGlobalSettings] = useState<SidebarSettings | null>(null);
    const [voted, setVoted] = useState(false);
    const [copied, setCopied] = useState(false);

    const { blog: loadedBlog, loading: blogLoading, error: blogError } = useBlog(id);

    // Derived data (no syncing effect zaroori nahi)
    const blog = loadedBlog as BlogPostRecord | null;
    const docId = loadedBlog?.id ?? null;
    const notFound = Boolean(!id || blogError) || (!blogLoading && !loadedBlog?.id);

    useEffect(() => {
        if (!loadedBlog?.id) return;
        let cancelled = false;
        const loadedId = loadedBlog.id;

        blogRepository.incrementViews(loadedId).catch(() => { /* silent */ });

        siteSettingsRepository.getGlobal()
            .then((settingsSnap) => {
                if (!cancelled) setGlobalSettings((settingsSnap || getDefaultSettings()) as SidebarSettings);
            })
            .catch(() => {
                if (!cancelled) setGlobalSettings(getDefaultSettings());
            });

        window.scrollTo(0, 0);
        return () => { cancelled = true; };
    }, [id, loadedBlog]);

    // =========================================================
    // 💬 FEEDBACK
    // =========================================================
    const handleFeedback = useCallback(async (type: 'yes' | 'no') => {
        if (voted) return toast.info('आप पहले ही अपनी राय दे चुके हैं!');
        if (!docId) return;
        try {
            await blogRepository.recordFeedback(docId, type);
            setVoted(true);
            toast.success('फीडबैक देने के लिए धन्यवाद! 🙏');
        } catch {
            toast.error('फीडबैक सेव नहीं हो सका।');
        }
    }, [voted, docId]);

    // =========================================================
    // 📤 SHARE
    // =========================================================
    const handleShare = useCallback(async () => {
        const shareUrl = window.location.href;
        const shareTitle = blog?.title || 'StudyGyaan Blog';

        if (navigator.share) {
            try {
                await navigator.share({
                    title: shareTitle,
                    text: blog?.description || shareTitle,
                    url: shareUrl
                });
                return;
            } catch {
                // cancelled
            }
        }

        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            toast.success('लिंक कॉपी हो गया! 📋');
            setTimeout(() => setCopied(false), 3000);
        } catch {
            toast.error('Share नहीं हो सका।');
        }
    }, [blog]);

    // =========================================================
    // 💰 PRICE
    // =========================================================
    const sellingPrice = Math.round(
        Number(globalSettings?.mrpPrice || 499) *
        (1 - Number(globalSettings?.discountPercent || 85) / 100)
    );

    // =========================================================
    // 🔄 LOADING
    // =========================================================
    if (blogLoading) return <BlogPostSkeleton />;

    // =========================================================
    // ❌ 404
    // =========================================================
    if (notFound || !blog) {
        return (
            <>
                <SEO
                    customTitle="Blog Not Found | StudyGyaan"
                    customDescription="यह ब्लॉग पोस्ट नहीं मिली।"
                    noIndex={true}
                    noFollow={false}
                />
                <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
                    <div className="text-6xl">🥲</div>
                    <h1 className="text-xl font-black text-slate-800 font-hindi">
                        ब्लॉग नहीं मिला!
                    </h1>
                    <p className="text-slate-500 text-sm font-hindi text-center">
                        यह आर्टिकल delete हो गया है या link गलत है।
                    </p>
                    <button
                        onClick={() => navigate('/blog')}
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-blue-700 transition-all"
                    >
                        सभी Blogs देखें →
                    </button>
                </div>
            </>
        );
    }

    // =========================================================
    // 📊 SEO DATA
    // =========================================================
    const blogSlug = blog.slug || docId || id;
    const canonicalUrl = `https://studygyaan.in/blog/${blogSlug}`;
    const publishedIso = getIsoDate(blog.date || blog.createdAt);
    const readTime = estimateReadTime(blog.content);
    const seoTitle = blog.title
        ? `${blog.title} | StudyGyaan`
        : 'StudyGyaan Blog';
    const seoDesc = blog.description
        || blog.metaDescription
        || `${blog.title} - पूरी जानकारी StudyGyaan पर पढ़ें।`;

    const sidebarUpdates = (globalSettings?.relatedBlogs || []).slice(0, 5);
    const pageQuickLinks = globalSettings?.sidebarLinks || [];

    // =========================================================
    // 🎨 RENDER
    // =========================================================
    return (
        <div className="min-h-screen bg-[#F8FAFC] font-hindi antialiased pb-20">

            <SEO
                customTitle={seoTitle}
                customDescription={seoDesc}
                customUrl={canonicalUrl}
                customImage={blog.imageUrl || 'https://studygyaan.in/og-image.jpg'}
                customKeywords={
                    blog.tags
                        ? blog.tags.join(', ')
                        : `${blog.category || 'Education'}, StudyGyaan, ${blog.title}`
                }
                ogType="article"
                publishedDate={publishedIso}
                modifiedDate={publishedIso}
                author={blog.author || 'StudyGyaan Editorial Team'}
                category={blog.category || 'Education'}
            />

            {/* Navbar — fixed height reserved */}
            <nav
                className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-3 md:px-6 flex items-center justify-between shadow-sm"
                style={{ height: '48px' }}
                aria-label="Blog Navigation"
            >
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center text-slate-600 hover:text-blue-600 font-bold transition-colors text-xs md:text-sm bg-slate-100/50 px-2.5 py-1.5 rounded-lg border border-slate-200"
                    aria-label="वापस जाएँ"
                >
                    <ChevronLeft className="w-4 h-4 mr-1" aria-hidden="true" />
                    वापस जाएँ
                </button>

                <a
                    href="/"
                    className="text-blue-700 font-black text-base md:text-lg tracking-tight"
                    aria-label="StudyGyaan Home"
                >
                    StudyGyaan
                </a>

                <button
                    onClick={handleShare}
                    className="flex items-center gap-1 text-slate-600 hover:text-blue-600 font-bold text-xs bg-slate-100/50 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-colors"
                    aria-label="Share करें"
                >
                    {copied
                        ? <Check className="w-4 h-4 text-green-500" />
                        : <Share2 className="w-4 h-4" aria-hidden="true" />
                    }
                    <span className="hidden md:inline">
                        {copied ? 'Copied!' : 'Share'}
                    </span>
                </button>
            </nav>

            {/* Hero Image — explicit dimensions, no shift */}
            <header
                className="relative w-full bg-slate-900 overflow-hidden"
                style={{ height: 'clamp(180px, 25vh, 40vh)' }}
            >
                <img
                    src={blog.imageUrl || '/og-image.jpg'}
                    className="w-full h-full object-cover opacity-30"
                    alt={blog.title}
                    fetchPriority="high"
                    width="1200"
                    height="630"
                    decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#F8FAFC] via-slate-900/50 to-transparent" />
                <div className="absolute bottom-0 left-0 w-full p-4 md:p-8">
                    <div className="max-w-7xl mx-auto px-2 md:px-4">
                        {blog.category && (
                            <span className="bg-blue-600 text-white text-[9px] md:text-xs font-black px-2 py-1 rounded-md uppercase tracking-tighter mb-2 inline-block">
                                {blog.category}
                            </span>
                        )}
                        <h1 className="text-xl md:text-4xl font-black text-slate-900 leading-[1.2] break-words max-w-4xl drop-shadow-md">
                            {blog.title}
                        </h1>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-2 md:px-4 py-4 md:py-8">
                <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-start">

                    {/* Article */}
                    <div className="w-full md:w-[65%] min-w-0">
                        <article
                            className="bg-white rounded-2xl md:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden"
                            itemScope
                            itemType="https://schema.org/BlogPosting"
                        >
                            {/* Meta Bar */}
                            <div className="flex flex-wrap items-center gap-2 md:gap-3 p-3 md:p-5 border-b border-slate-100 text-slate-600 text-[10px] md:text-sm font-bold bg-slate-50/50">
                                <div className="flex items-center bg-white px-2.5 py-1.5 rounded-lg shadow-sm border border-slate-200">
                                    <User className="w-3.5 h-3.5 mr-1 text-blue-500" aria-hidden="true" />
                                    <span itemProp="author">{blog.author || 'StudyGyaan Editorial Team'}</span>
                                </div>
                                <div className="flex items-center bg-white px-2.5 py-1.5 rounded-lg shadow-sm border border-slate-200">
                                    <Calendar className="w-3.5 h-3.5 mr-1 text-blue-500" aria-hidden="true" />
                                    <time itemProp="datePublished" dateTime={publishedIso}>
                                        {formatDate(blog.date || blog.createdAt)}
                                    </time>
                                </div>
                                <div className="flex items-center bg-orange-50 text-orange-700 px-2.5 py-1.5 rounded-lg shadow-sm border border-orange-200">
                                    <Clock className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                                    {readTime} पढ़ें
                                </div>
                                {blog.views && (
                                    <div className="flex items-center bg-green-50 text-green-700 px-2.5 py-1.5 rounded-lg shadow-sm border border-green-200">
                                        <Eye className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                                        {blog.views.toLocaleString('hi-IN')} views
                                    </div>
                                )}
                            </div>

                            {/* Content */}
                            <div className="p-4 md:p-8">
                                <div
                                    className="prose prose-sm md:prose-base max-w-none text-slate-700 [&_p]:!text-left [word-break:break-word] prose-p:leading-relaxed prose-p:mb-5 prose-strong:text-blue-900 prose-strong:font-black prose-headings:text-slate-900 prose-headings:font-black prose-headings:mb-3 prose-ul:space-y-2 prose-ul:mb-5 prose-li:marker:text-blue-500 prose-img:rounded-xl prose-img:shadow-md"
                                    dangerouslySetInnerHTML={{ __html: blog.content ?? '' }}
                                    itemProp="articleBody"
                                />

                                {/* Feedback */}
                                <section className="mt-8 p-4 md:p-6 bg-blue-50/50 rounded-xl md:rounded-3xl border border-blue-100 text-center">
                                    <h3 className="text-xs md:text-base font-black text-slate-800 mb-3">
                                        क्या यह आर्टिकल आपके लिए फायदेमंद रहा?
                                    </h3>
                                    <div className="flex justify-center gap-3">
                                        <button
                                            onClick={() => handleFeedback('yes')}
                                            disabled={voted}
                                            className={`px-4 py-2 md:px-8 md:py-2.5 rounded-lg text-[10px] md:text-sm font-black transition-all shadow-md ${
                                                voted
                                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                    : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                                            }`}
                                        >
                                            हाँ 👍
                                        </button>
                                        <button
                                            onClick={() => handleFeedback('no')}
                                            disabled={voted}
                                            className={`px-4 py-2 md:px-8 md:py-2.5 rounded-lg text-[10px] md:text-sm font-black transition-all shadow-md ${
                                                voted
                                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                    : 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50 active:scale-95'
                                            }`}
                                        >
                                            नहीं 👎
                                        </button>
                                    </div>
                                    {voted && (
                                        <p className="mt-3 text-[9px] md:text-xs text-blue-600 font-bold">
                                            आपकी राय सेव हो गई। धन्यवाद! 🙏
                                        </p>
                                    )}
                                </section>

                                {/* Internal Links */}
                                <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 mt-8">
                                    <h2 className="text-sm md:text-xl font-black text-slate-800 mb-5 uppercase flex items-center gap-2">
                                        <FileSearch size={20} className="text-blue-600" aria-hidden="true" />
                                        Explore More on StudyGyaan
                                    </h2>
                                    <div className="flex flex-wrap gap-3">
                                        {[
                                            { href: '/govt-jobs', label: 'Latest Govt Jobs' },
                                            { href: '/free-study-material', label: 'Free Study Material' },
                                            { href: '/test', label: 'Free Mock Tests' },
                                            { href: '/blog', label: 'All Blogs' },
                                            { href: '/web-stories', label: 'Web Stories' }
                                        ].map(link => (
                                            <a
                                                key={link.href}
                                                href={link.href}
                                                className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 px-5 py-2.5 rounded-xl text-[11px] md:text-sm font-black transition-all shadow-sm"
                                            >
                                                {link.label}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </article>
                    </div>

                    {/* Sidebar */}
                    <aside className="w-full md:w-[35%] space-y-4 md:space-y-6 md:sticky md:top-16">

                        {sidebarUpdates.length > 0 && (
                            <section className="bg-white/80 backdrop-blur-xl p-4 md:p-6 rounded-2xl border border-white/60 shadow-sm">
                                <h2 className="text-sm md:text-lg font-black text-slate-900 mb-4 flex items-center border-b border-slate-100 pb-3">
                                    <Sparkles className="w-4 h-4 mr-1.5 text-purple-600" aria-hidden="true" />
                                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-700 to-pink-600">
                                        ट्रेंडिंग आर्टिकल्स 🔥
                                    </span>
                                </h2>
                                <ul className="space-y-3" role="list">
                                    {sidebarUpdates.map((blogInfo, index) => {
                                        if (!blogInfo.title) return null;
                                        const style = LOOP_COLORS[index % LOOP_COLORS.length];
                                        return (
                                            <li key={index}>
                                                <a
                                                    href={blogInfo.url || '/blog'}
                                                    target={blogInfo.url?.startsWith('http') ? '_blank' : '_self'}
                                                    rel={blogInfo.url?.startsWith('http') ? 'noopener noreferrer' : undefined}
                                                    className={`group border-2 ${style.border} ${style.bg} p-3 md:p-4 rounded-xl transition-all hover:-translate-y-1 shadow-sm hover:shadow-md flex items-center justify-between`}
                                                >
                                                    <span className={`flex-1 pr-3 text-[13px] font-black ${style.text} line-clamp-2`}>
                                                        {blogInfo.title}
                                                    </span>
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-white shadow-sm shrink-0 group-hover:scale-110 transition-transform ${style.iconText}`}>
                                                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                                                    </div>
                                                </a>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        )}

                        {pageQuickLinks.length > 0 && (
                            <section className="bg-white/80 p-4 md:p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                                <h2 className="text-sm md:text-lg font-black text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center gap-2">
                                    <Tag size={18} className="text-blue-600" aria-hidden="true" />
                                    महत्वपूर्ण लिंक्स 🔗
                                </h2>
                                <ul className="space-y-3" role="list">
                                    {pageQuickLinks.map((item, index) => (
                                        <li key={index}>
                                            <a
                                                href={item.url || '#'}
                                                target={item.url?.startsWith('http') ? '_blank' : '_self'}
                                                rel={item.url?.startsWith('http') ? 'noopener noreferrer' : undefined}
                                                className={`group flex items-center justify-between p-3 md:p-4 rounded-xl transition-all duration-300 shadow-md hover:shadow-xl hover:-translate-y-1 ${LINK_GRADIENTS[index % LINK_GRADIENTS.length]} text-white`}
                                            >
                                                <div className="flex items-center gap-2.5 flex-1">
                                                    <div className="bg-white/20 p-1.5 rounded-lg shrink-0">
                                                        <ExternalLink size={14} className="text-white" aria-hidden="true" />
                                                    </div>
                                                    <span className="font-black text-[12px] md:text-[15px] leading-snug">
                                                        {item.title || item.name}
                                                    </span>
                                                </div>
                                                <ArrowRight size={16} className="text-white/70 group-hover:translate-x-1 transition-all shrink-0 ml-1" aria-hidden="true" />
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {globalSettings && (
                            <section className="p-4 md:p-6 bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 rounded-2xl md:rounded-[2rem] text-white shadow-2xl border-b-4 border-black/20">
                                <p className="font-black text-sm md:text-xl mb-1.5 italic flex items-center gap-2 text-yellow-300">
                                    <ShoppingCart size={18} aria-hidden="true" />
                                    {globalSettings.premiumBoxTitle}
                                </p>
                                <p className="text-[10px] md:text-xs opacity-90 mb-4 leading-relaxed">
                                    {globalSettings.premiumBoxDesc}
                                </p>
                                <div className="flex items-center gap-2 mb-4 bg-white/10 p-2 md:p-3 rounded-xl border border-white/10">
                                    <span className="line-through text-white/50 text-[10px] font-bold">
                                        ₹{globalSettings.mrpPrice}
                                    </span>
                                    <span className="bg-red-500 text-white text-[8px] md:text-[10px] font-black px-2 py-0.5 rounded">
                                        {globalSettings.discountPercent}% OFF
                                    </span>
                                    <span className="text-sm md:text-xl font-black text-yellow-400 ml-auto">
                                        ₹{sellingPrice}
                                    </span>
                                </div>
                                <a
                                    href="/premium-notes"
                                    className="block w-full bg-yellow-400 text-blue-900 font-black py-2.5 md:py-3.5 rounded-xl text-center text-[12px] md:text-sm hover:bg-yellow-300 active:scale-95 shadow-xl transition-transform"
                                >
                                    अभी खरीदें →
                                </a>
                            </section>
                        )}
                    </aside>
                </div>
            </main>

            {/* Bottom Bar — fixed height reserved */}
            <div
                className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 py-2 px-3 md:py-3 md:px-4 z-[100] shadow-[0_-10px_30px_rgba(0,0,0,0.08)]"
                style={{ height: '56px' }}
            >
                <div className="max-w-5xl mx-auto flex justify-between items-center gap-2 h-full">
                    <div className="flex flex-col justify-center">
                        <span className="text-[10px] md:text-xs font-black text-red-600 flex items-center gap-1 uppercase">
                            <Flame className="w-3 h-3 text-orange-500 animate-pulse" aria-hidden="true" />
                            OFFER: {globalSettings?.discountPercent}% OFF
                        </span>
                        <span className="hidden md:inline text-[13px] font-bold text-slate-600 mt-1">
                            {globalSettings?.bottomBarText}
                        </span>
                        <span className="md:hidden text-[12px] font-black text-slate-900 mt-0.5">
                            अनलॉक: ₹{sellingPrice}
                        </span>
                    </div>
                    <a
                        href="/premium-notes"
                        className="bg-blue-700 text-white font-black py-2 px-6 md:py-2.5 md:px-8 rounded-xl hover:bg-blue-800 transition-all shadow-lg active:scale-95 flex items-center gap-1.5 text-[12px] md:text-sm shrink-0"
                    >
                        <span className="hidden md:inline">
                            सिर्फ ₹{sellingPrice} में अनलॉक करें
                        </span>
                        <span className="md:hidden">अनलॉक करें</span>
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </a>
                </div>
            </div>
        </div>
    );
};

export default BlogPost;
