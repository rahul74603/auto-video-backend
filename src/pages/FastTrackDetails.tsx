/* eslint-disable */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useFastTrack } from '@/features/fast-track/hooks/useFastTrack';
import { fastTrackRepository } from '@/features/fast-track/data/fastTrackRepository';
import type { FastTrackItem, TimestampLike } from '@/types/firestore';
import {
    Calendar, Building2, ArrowLeft,
    Download, FileText, ChevronRight, Loader2
} from 'lucide-react';
import SEO from '../components/SEO';
import Breadcrumbs from '../components/Breadcrumbs';
import RelatedContent from '../components/RelatedContent';
import ExamHubNavigation from '../components/ExamHubNavigation';
import { buildBreadcrumbPath } from '@/features/internal-linking/data/internalLinkingRepository';

// =========================================================
// 🛠️ HELPERS
// =========================================================
function getIsoDate(dateField: TimestampLike): string {
    if (!dateField) return new Date().toISOString();
    try {
        const ts = dateField as { seconds?: number; toDate?: () => Date };
        if (ts?.seconds) return new Date(ts.seconds * 1000).toISOString();
        if (ts?.toDate) return ts.toDate().toISOString();
        return new Date(dateField as string | number | Date).toISOString();
    } catch {
        return new Date().toISOString();
    }
}

interface CategoryColors {
    bg: string;
    text: string;
    card: string;
    border: string;
    heading: string;
    icon: string;
}

function getCategoryColors(category?: string): CategoryColors {
    const map: Record<string, CategoryColors> = {
        'Result': {
            bg: 'bg-green-600',
            text: 'text-green-700',
            card: 'bg-green-50 border-green-200',
            border: 'border-green-100',
            heading: 'border-green-100',
            icon: '🏆'
        },
        'Admit Card': {
            bg: 'bg-red-600',
            text: 'text-red-700',
            card: 'bg-red-50 border-red-200',
            border: 'border-red-100',
            heading: 'border-red-100',
            icon: '🎫'
        },
        'Answer Key': {
            bg: 'bg-blue-600',
            text: 'text-blue-700',
            card: 'bg-blue-50 border-blue-200',
            border: 'border-blue-100',
            heading: 'border-blue-100',
            icon: '🔑'
        },
        'Syllabus': {
            bg: 'bg-purple-600',
            text: 'text-purple-700',
            card: 'bg-purple-50 border-purple-200',
            border: 'border-purple-100',
            heading: 'border-purple-100',
            icon: '📚'
        }
    };
    return (category && map[category]) || {
        bg: 'bg-purple-600',
        text: 'text-purple-700',
        card: 'bg-purple-50 border-purple-200',
        border: 'border-purple-100',
        heading: 'border-purple-100',
        icon: '📌'
    };
}

// =========================================================
// 🃏 LIST CARD COMPONENT
// =========================================================
const ListCard = ({ item, currentId }: { item: FastTrackItem; currentId?: string | null }) => {
    const isActive = item.id === currentId;
    const colors = getCategoryColors(item.category);

    return (
        <Link
            to={`/update/${item.slug || item.id}`}
            className={`block p-3 rounded-2xl border transition-all ${isActive
                ? `${colors.card} shadow-md ring-2 ring-opacity-40`
                : 'bg-white border-slate-100 hover:shadow-md hover:border-slate-200'
            }`}
        >
            <div className="flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-bold text-slate-400 mb-1 block">
                        {item.updateDate || item.category}
                    </span>
                    <p className={`font-bold text-sm leading-tight line-clamp-2 ${isActive ? colors.text : 'text-slate-700'}`}>
                        {item.title}
                    </p>
                </div>
                <ChevronRight
                    size={15}
                    className={`shrink-0 ${isActive ? colors.text : 'text-slate-300'}`}
                    aria-hidden="true"
                />
            </div>
        </Link>
    );
};

// =========================================================
// 📋 CATEGORY SECTION
// =========================================================
const CategorySection = ({ title, items, currentId, colors }: { title: string; items: FastTrackItem[]; currentId?: string | null; colors: CategoryColors }) => {
    if (!items || items.length === 0) return null;

    return (
        <section className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
            <h2 className={`text-xs font-black ${colors.text} uppercase tracking-tight mb-3 flex items-center border-b-2 ${colors.heading} pb-2`}>
                {colors.icon} {title}
            </h2>
            <div className="space-y-2">
                {items.map(item => (
                    <ListCard
                        key={item.id}
                        item={item}
                        currentId={currentId}
                    />
                ))}
            </div>
        </section>
    );
};

// =========================================================
// 👇 INLINE RELATED STRIP — content ke bich/baad 2-3 cards + "Click for More"
// =========================================================
const InlineRelatedStrip = ({ title, items, currentId, moreLink }: { title: string; items: FastTrackItem[]; currentId?: string | null; moreLink: string }) => {
    if (!items || items.length === 0) return null;

    return (
        <section className="bg-white border border-slate-100 rounded-2xl p-4 md:p-5 shadow-sm mt-4">
            <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-xs md:text-sm font-black text-slate-700 uppercase tracking-tight flex items-center gap-1.5">
                    👇 {title}
                </h2>
                <Link
                    to={moreLink}
                    className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow transition-all active:scale-95"
                >
                    Click for More →
                </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {items.map(item => (
                    <ListCard
                        key={item.id}
                        item={item}
                        currentId={currentId}
                    />
                ))}
            </div>
        </section>
    );
};

// =========================================================
// 🚀 MAIN COMPONENT
// =========================================================
const FastTrackDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [updatesList, setUpdatesList] = useState<FastTrackItem[]>([]);

    // =========================================================
    const { update: data, loading, error: updateError } = useFastTrack(id);
    // Derived values — no syncing effects needed.
    const docId = data?.id ?? null;
    const notFound = Boolean(updateError) || !id;

    useEffect(() => {
        if (data?.id) window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [data?.id]);

    useEffect(() => {
        let cancelled = false;
        fastTrackRepository.listLatest(50)
            .then((items) => {
                if (!cancelled) setUpdatesList(items.filter(item => item.status !== 'draft'));
            })
            .catch((err) => console.error("List fetch error:", err));
        return () => {
            cancelled = true;
        };
    }, []);

    // =========================================================
    // 📊 CATEGORIZED LISTS (Memoized) — slim sidebar (4 each)
    // =========================================================
    const { results, admitCards, answerKeys, syllabuses } = useMemo(() => ({
        results: updatesList.filter(u => u.category === 'Result').slice(0, 4),
        admitCards: updatesList.filter(u => u.category === 'Admit Card').slice(0, 4),
        answerKeys: updatesList.filter(u => u.category === 'Answer Key').slice(0, 4),
        syllabuses: updatesList.filter(u => u.category === 'Syllabus').slice(0, 4)
    }), [updatesList]);

    // 👇 Inline strips — current item hata kar, 2-3 cards ek saath
    const { inlineFresh, inlineSameCat } = useMemo(() => {
        const isCurrent = (u: FastTrackItem) => u.id === docId || (id && (u.slug === id || u.id === id));
        const others = updatesList.filter(u => !isCurrent(u));
        return {
            inlineFresh: others.slice(0, 3),
            inlineSameCat: (data
                ? others.filter(u => u.category === data.category).slice(0, 3)
                : others.slice(0, 3))
        };
    }, [updatesList, docId, id, data]);

    // =========================================================
    // 🔄 LOADING
    // =========================================================
    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3">
                <Loader2 size={32} className="animate-spin text-blue-600" />
                <p className="font-bold text-slate-400 text-sm">Loading...</p>
            </div>
        );
    }

    // =========================================================
    // ❌ 404
    // =========================================================
    if (notFound || !data) {
        return (
            <>
                <SEO
                    customTitle="Update Not Found | StudyGyaan"
                    noIndex={true}
                />
                <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
                    <div className="text-5xl">😔</div>
                    <h1 className="text-xl font-black text-slate-800">Update नहीं मिला!</h1>
                    <p className="text-slate-500 text-sm text-center">
                        यह update expire हो गया है या link गलत है।
                    </p>
                    <a
                        href="/govt-jobs"
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-blue-700 transition-all"
                    >
                        सभी Updates देखें →
                    </a>
                </div>
            </>
        );
    }

    // =========================================================
    // 📊 SEO & Colors
    // =========================================================
    const colors = getCategoryColors(data.category);
    const canonicalSlug = data.slug || docId || id;
    const canonicalUrl = `https://studygyaan.in/update/${canonicalSlug}`;
    const publishedIso = getIsoDate(data.createdAt);

    const seoTitle = String(data.seoTitle || '').trim()
        || `${data.title} - ${data.category} ${new Date().getFullYear()} | StudyGyaan`;
    const seoDesc = data.description || data.shortInfo
        || `Check latest ${data.category} for ${data.title}. Get direct links and official updates on StudyGyaan.in`;

    // =========================================================
    // 🎨 RENDER
    // =========================================================
    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen">

            {/* 🍞 Breadcrumbs — fixes orphan pages */}
            <Breadcrumbs
              crumbs={buildBreadcrumbPath({
                title: data?.title || 'Update Details',
                exam: (data?.category as string) || 'GENERAL',
                category: ((data?.category === 'Admit Card' ? 'ADMIT_CARD' : data?.category === 'Result' ? 'RESULT' : data?.category === 'Syllabus' ? 'SYLLABUS' : 'UPDATE') as any),
              })}
              className="mb-4 bg-white px-3 py-2 rounded-xl border shadow-sm"
            />

            {/* ✅ SEO - Article type */}
            <SEO
                customTitle={seoTitle}
                customDescription={seoDesc}
                customUrl={canonicalUrl}
                customImage="https://studygyaan.in/og-image.jpg"
                customKeywords={`${data.title}, ${data.category}, ${data.org || ''}, StudyGyaan, Sarkari Result`}
                ogType="article"
                publishedDate={publishedIso}
                modifiedDate={getIsoDate(data.updatedAt || data.publishedAt || data.createdAt)}
                author={data.authorName || "StudyGyaan Editorial Team"}
                category={data.category}
            />

            {/* FAQ schema — only when AI-reviewed article FAQs exist */}
            {Array.isArray(data.faqs) && data.faqs.length > 0 && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            "@context": "https://schema.org",
                            "@type": "FAQPage",
                            "mainEntity": data.faqs.map((faq) => ({
                                "@type": "Question",
                                "name": faq.question,
                                "acceptedAnswer": { "@type": "Answer", "text": faq.answer }
                            }))
                        })
                    }}
                />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">

                {/* 📰 MAIN COLUMN — article full wide (pehle yahi kone me daba tha) */}
                <div className="lg:col-span-8 min-w-0 space-y-4 order-1">

                    {/* Back Button */}
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center text-slate-500 hover:text-blue-600 transition-colors font-black text-sm"
                        aria-label="वापस जाएँ"
                    >
                        <ArrowLeft size={18} className="mr-1.5" aria-hidden="true" />
                        Back
                    </button>

                    {/* Main Card */}
                    <article itemScope itemType="https://schema.org/NewsArticle">

                        {/* Header */}
                        <div className={`${colors.bg} text-white p-5 md:p-6 lg:p-8 rounded-t-3xl shadow-lg`}>
                            <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/30">
                                {colors.icon} {data.category}
                            </span>
                            <h1
                                className="text-xl md:text-3xl font-black mt-4 leading-tight"
                                itemProp="headline"
                            >
                                {data.title}
                            </h1>
                        </div>

                        {/* Body */}
                        <div className="bg-white border-x border-b border-slate-200 rounded-b-3xl shadow-xl p-5 space-y-4">

                            {/* Meta Info */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1 flex items-center gap-1">
                                        <Building2 size={10} aria-hidden="true" />
                                        Organization
                                    </p>
                                    <p
                                        className="font-bold text-xs text-slate-800 line-clamp-2"
                                        itemProp="author"
                                    >
                                        {data.org || "Govt. Dept."}
                                    </p>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1 flex items-center gap-1">
                                        <Calendar size={10} aria-hidden="true" />
                                        Update Date
                                    </p>
                                    <p className="font-bold text-xs text-slate-800">
                                        {data.updateDate || "Check Link"}
                                    </p>
                                </div>
                            </div>

                            <hr className="border-slate-100" />

                            {/* Description */}
                            {(data.shortInfo || data.description) && (
                                <div
                                    className="text-slate-600 text-sm leading-relaxed bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 whitespace-pre-wrap font-medium"
                                    itemProp="description"
                                >
                                    {data.shortInfo || data.description}
                                </div>
                            )}

                            {/* CTA Buttons */}
                            <div className="flex flex-col gap-3 pt-1">

                                {/* Official Link */}
                                {data.directLink && (
                                    <a
                                        href={data.directLink.startsWith('http')
                                            ? `/redirect?url=${encodeURIComponent(data.directLink)}`
                                            : data.directLink
                                        }
                                        target="_blank"
                                        rel="nofollow noopener noreferrer"
                                        className={`flex items-center justify-center w-full py-3.5 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] ${colors.bg}`}
                                    >
                                        <Download className="mr-2" size={16} aria-hidden="true" />
                                        Official {data.category} Link
                                    </a>
                                )}

                                {/* PDF Download */}
                                {data.syllabusPDF && (
                                    <div className="p-4 bg-purple-50 border-2 border-dashed border-purple-200 rounded-2xl text-center">
                                        <p className="text-xs font-black text-purple-900 mb-1">
                                            📥 Download Official Pattern PDF
                                        </p>
                                        <a
                                            href={data.syllabusPDF}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-black px-4 py-2 rounded-xl shadow-md active:scale-95 transition-all w-full text-xs uppercase"
                                        >
                                            <FileText size={14} aria-hidden="true" />
                                            Download PDF
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>

                    </article>

                    {/* 👇 Inline strip 1 — quick card ke baad, full article se pehle */}
                    <InlineRelatedStrip
                        title="Aur Fresh Updates"
                        items={inlineFresh}
                        currentId={docId || id}
                        moreLink="/fasttrack"
                    />

                    <article itemScope itemType="https://schema.org/NewsArticle">
                        {/* ✅ AI-reviewed full article (source-grounded pipeline only) */}
                        {data.articleHtml && (
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 md:p-8 shadow-sm mt-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                                    <FileText size={13} className="text-emerald-500" aria-hidden="true" />
                                    Fact-checked by {data.authorName || "StudyGyaan Editorial Team"}
                                </p>
                                <div
                                    className="prose prose-sm md:prose max-w-none text-slate-700 ai-article-content [&_.table-responsive]:overflow-x-auto [&_table]:w-full [&_table]:text-sm"
                                    dangerouslySetInnerHTML={{ __html: data.articleHtml }}
                                />
                            </div>
                        )}

                        {/* 👇 Inline strip 2 — article ke beech content flow me break */}
                        {data.articleHtml && (
                            <InlineRelatedStrip
                                title="Isi Category Ke Aur Updates"
                                items={inlineSameCat}
                                currentId={docId || id}
                                moreLink="/fasttrack"
                            />
                        )}

                        {/* ✅ Verified FAQs from the reviewed article */}
                        {Array.isArray(data.faqs) && data.faqs.length > 0 && (
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 md:p-8 shadow-sm mt-4">
                                <h2 className="text-sm md:text-lg font-black text-slate-800 mb-4 uppercase tracking-tight">
                                    अक्सर पूछे जाने वाले प्रश्न (FAQs)
                                </h2>
                                <div className="space-y-3">
                                    {data.faqs.map((faq, index) => (
                                        <div key={index} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                                            <h3 className="font-black text-slate-800 text-xs md:text-sm leading-snug">{faq.question}</h3>
                                            <p className="text-slate-600 text-xs md:text-sm font-medium mt-1.5 leading-relaxed">{faq.answer}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </article>

                    {/* 🧭 Exam Hub + Related Content — fixes orphan */}
                    {data.sourceCitation?.url && (
                        <p className="text-xs text-slate-500 font-medium mt-4">
                            Official source:{' '}
                            <a className="text-blue-700 underline" href={`/redirect?url=${encodeURIComponent(data.sourceCitation.url)}`} target="_blank" rel="nofollow noopener noreferrer">
                                {data.sourceCitation.label || 'Notification'}
                            </a>
                        </p>
                    )}
                    {Array.isArray(data.updateHistory) && data.updateHistory.length > 0 && (
                        <div className="bg-white border rounded-2xl p-4 mt-4">
                            <h2 className="text-xs font-black uppercase mb-2">Update history</h2>
                            {data.updateHistory.slice().reverse().slice(0, 6).map((entry, idx) => (
                                <p key={idx} className="text-[11px] text-slate-600">{entry.reason} {entry.at?.slice(0, 10)}</p>
                            ))}
                        </div>
                    )}
                    <ExamHubNavigation exam={(data?.examFamily as string) || (data?.category as string) || 'GENERAL'} className="mt-6" />
                    <RelatedContent
                      currentId={data?.id || ''}
                      exam={data?.category}
                      examFamily={data?.examFamily}
                      contentKind={data?.contentKind}
                      category={((data?.category === 'Admit Card' ? 'ADMIT_CARD' : data?.category === 'Result' ? 'RESULT' : 'UPDATE') as any)}
                      title={data?.title || ''}
                      limit={6}
                      className="mt-6"
                    />

                    {/* ✅ Internal Links - Fixed /mock-tests → /test */}
                    <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                        <h2 className="text-sm font-black text-slate-800 mb-4 uppercase flex items-center gap-2">
                            <FileText size={16} className="text-blue-600" aria-hidden="true" />
                            Explore StudyGyaan
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { href: "/govt-jobs", label: "Latest Jobs" },
                                { href: "/free-study-material", label: "Free Notes" },
                                { href: "/test", label: "Mock Tests" }, // ✅ Fixed!
                                { href: "/blog", label: "Blogs" },
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
                </div>

                {/* 🧭 SLIM SIDEBAR — chhote clickable cards, hamesha side me chipke */}
                <aside className="lg:col-span-4 lg:sticky lg:top-6 h-fit space-y-4 order-2">
                    {updatesList.length === 0 ? (
                        <div className="text-center text-slate-400 font-bold p-10 bg-white rounded-3xl border border-slate-100">
                            <Loader2 size={24} className="animate-spin mx-auto mb-3 text-blue-400" />
                            Loading updates...
                        </div>
                    ) : (
                        <>
                            <CategorySection
                                title="Latest Results"
                                items={results}
                                currentId={docId || id}
                                colors={getCategoryColors('Result')}
                            />
                            <CategorySection
                                title="Admit Cards"
                                items={admitCards}
                                currentId={docId || id}
                                colors={getCategoryColors('Admit Card')}
                            />
                            <CategorySection
                                title="Answer Keys"
                                items={answerKeys}
                                currentId={docId || id}
                                colors={getCategoryColors('Answer Key')}
                            />
                            <CategorySection
                                title="Syllabus & Patterns"
                                items={syllabuses}
                                currentId={docId || id}
                                colors={getCategoryColors('Syllabus')}
                            />
                            {/* Sab kuch ek jagah */}
                            <Link
                                to="/fasttrack"
                                className="block text-center bg-slate-800 hover:bg-black text-white font-black text-xs uppercase tracking-widest py-3.5 rounded-2xl shadow-lg transition-all active:scale-95"
                            >
                                👉 Sabhi Updates Ek Saath — Click for More
                            </Link>
                        </>
                    )}
                </aside>
            </div>
        </div>
    );
};

export default FastTrackDetails;
