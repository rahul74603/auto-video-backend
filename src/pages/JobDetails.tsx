// @ts-nocheck
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    collection, doc, getDoc, getDocs,
    query, where, limit, updateDoc, increment
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
    Briefcase, Calendar, MapPin, Banknote, Clock,
    Download, ExternalLink, ArrowLeft, Share2,
    CheckCircle, FileText, Smartphone, Sparkles,
    Tag, ShoppingCart, Flame, ArrowRight, Zap,
    Trophy, GraduationCap, Users, Search,
    Globe, ShieldCheck, Eye, Check, Copy
} from 'lucide-react';
import SEO from '../components/SEO';

// =========================================================
// 🛠️ HELPERS
// =========================================================
function formatDate(d) {
    if (!d) return "New Update";
    try {
        if (d?.seconds) return new Date(d.seconds * 1000).toLocaleDateString('hi-IN');
        if (d?.toDate) return d.toDate().toLocaleDateString('hi-IN');
        return new Date(d).toLocaleDateString('hi-IN');
    } catch {
        return "New Update";
    }
}

function getIsoDate(d) {
    if (!d) return new Date().toISOString();
    try {
        if (d?.seconds) return new Date(d.seconds * 1000).toISOString();
        if (d?.toDate) return d.toDate().toISOString();
        return new Date(d).toISOString();
    } catch {
        return new Date().toISOString();
    }
}

// Safe redirect URL
function safeRedirect(url) {
    if (!url || url === '#' || url === 'undefined') return null;
    if (url.startsWith('http')) {
        return `/redirect?url=${encodeURIComponent(url)}`;
    }
    return url;
}

// =========================================================
// 🎨 INTERNAL ICON
// =========================================================
const FileSearch = ({ className, size = 24 }) => (
    <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        width={size} height={size}
        viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round"
        className={className}
    >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
        <path d="M15 8l-4 4 4 4" />
    </svg>
);

// =========================================================
// 🚀 MAIN COMPONENT
// =========================================================
const JobDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [job, setJob] = useState(null);
    const [globalSettings, setGlobalSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [docId, setDocId] = useState(null);
    const [copied, setCopied] = useState(false);

    // =========================================================
    // 📡 FETCH - Slug + ID दोनों handle
    // =========================================================
    useEffect(() => {
        const loadData = async () => {
            if (!id) { setNotFound(true); setLoading(false); return; }

            try {
                setLoading(true);
                let jobData = null;
                let foundDocId = null;

                // ✅ Step 1: Slug से ढूंढो
                try {
                    const slugQuery = query(
                        collection(db, "jobs"),
                        where("slug", "==", id),
                        limit(1)
                    );
                    const slugSnap = await getDocs(slugQuery);
                    if (!slugSnap.empty) {
                        jobData = { id: slugSnap.docs[0].id, ...slugSnap.docs[0].data() };
                        foundDocId = slugSnap.docs[0].id;
                    }
                } catch (e) {
                    console.warn("Slug query:", e.message);
                }

                // ✅ Step 2: Doc ID fallback
                if (!jobData) {
                    const snap = await getDoc(doc(db, "jobs", id));
                    if (snap.exists()) {
                        jobData = { id: snap.id, ...snap.data() };
                        foundDocId = snap.id;
                    }
                }

                if (!jobData) {
                    setNotFound(true);
                    return;
                }

                setJob(jobData);
                setDocId(foundDocId);

                // ✅ View Count
                try {
                    await updateDoc(doc(db, "jobs", foundDocId), {
                        views: increment(1)
                    });
                } catch { /* Silent fail */ }

                // ✅ Global Settings
                const settingsSnap = await getDoc(
                    doc(db, "site_settings", "global")
                );
                setGlobalSettings(
                    settingsSnap.exists()
                        ? settingsSnap.data()
                        : getDefaultSettings()
                );

            } catch (err) {
                console.error("Error:", err);
                setNotFound(true);
            } finally {
                setLoading(false);
                window.scrollTo(0, 0);
            }
        };

        loadData();
    }, [id]);

    function getDefaultSettings() {
        return {
            jobUpdates: [],
            relatedBlogs: [],
            premiumBoxTitle: "Premium Study Notes",
            premiumBoxDesc: "100% सफलता के लिए Expert Notes।",
            bottomBarText: "📢 Premium Notes: पिछले 10 साल के रिपीटेड सवाल",
            premiumPrice: "69",
            mrpPrice: "499",
            discountPercent: "85"
        };
    }

    // =========================================================
    // 📤 SHARE
    // =========================================================
    const handleShare = useCallback(async () => {
        const url = window.location.href;
        const title = job?.title || 'StudyGyaan Job Update';

        if (navigator.share) {
            try {
                await navigator.share({ title, url });
                return;
            } catch { /* cancelled */ }
        }

        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        } catch { /* silent */ }
    }, [job]);

    // =========================================================
    // 💰 PRICE
    // =========================================================
    const sellingPrice = Math.round(
        Number(globalSettings?.mrpPrice || 499) *
        (1 - Number(globalSettings?.discountPercent || 85) / 100)
    );

    const trendingLinks = globalSettings?.jobUpdates
        || globalSettings?.relatedBlogs
        || [];

    // =========================================================
    // 🔄 LOADING
    // =========================================================
    if (loading) {
        return (
            <div className="min-h-screen flex flex-col justify-center items-center gap-3 bg-white">
                <div className="animate-spin h-10 w-10 border-4 border-blue-600 rounded-full border-t-transparent" />
                <p className="text-sm font-hindi text-blue-600 font-bold">लोड हो रहा है...</p>
            </div>
        );
    }

    // =========================================================
    // ❌ 404
    // =========================================================
    if (notFound || !job) {
        return (
            <>
                <SEO
                    customTitle="Job Not Found | StudyGyaan"
                    noIndex={true}
                />
                <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
                    <div className="text-6xl">😔</div>
                    <h1 className="text-xl font-black text-slate-800 font-hindi">
                        Job नहीं मिली!
                    </h1>
                    <p className="text-slate-500 text-sm font-hindi text-center">
                        यह vacancy expire हो गई है या link गलत है।
                    </p>
                    <a
                        href="/govt-jobs"
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-blue-700 transition-all"
                    >
                        सभी Jobs देखें →
                    </a>
                </div>
            </>
        );
    }

    // =========================================================
    // 📊 SEO DATA
    // =========================================================
    const jobSlug = job.slug || docId || id;
    const canonicalUrl = `https://studygyaan.in/job/${jobSlug}`;
    const publishedIso = getIsoDate(job.createdAt);

    const seoTitle = `${job.title} Online Form 2025 - ${job.vacancies || ''} Vacancies | StudyGyaan`;
    const seoDesc = job.description
        ? job.description.substring(0, 160)
        : `Apply online for ${job.title} recruitment 2025. ${job.organization || ''} - ${job.vacancies || 'Various'} vacancies. Check eligibility, salary ₹${job.salary || 'as per rules'}, last date ${job.lastDate || 'check notification'}.`;

    const seoImage = job.imageUrl
        || job.image
        || `https://studygyaan.in/og-image.jpg`;

    const seoKeywords = [
        job.title,
        job.organization,
        `${job.title} 2025`,
        `${job.title} online form`,
        `${job.organization} vacancy`,
        job.location || 'India',
        'Sarkari Naukri 2025',
        'StudyGyaan'
    ].filter(Boolean).join(', ');

    // =========================================================
    // 🎨 RENDER
    // =========================================================
    return (
        <div className="pt-14 md:pt-16 pb-20 bg-[#F8FAFC] min-h-screen font-hindi antialiased">

            {/* ✅ SEO - Article type, all props */}
            <SEO
                customTitle={seoTitle}
                customDescription={seoDesc}
                customUrl={canonicalUrl}
                customImage={seoImage}
                customKeywords={seoKeywords}
                ogType="article"
                publishedDate={publishedIso}
                modifiedDate={publishedIso}
                author={job.author || "Rahul Sir"}
                category={job.category || "Govt Jobs"}
            />

            <div className="max-w-7xl mx-auto px-2 md:px-6">

                {/* Back + Share Bar */}
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 font-bold transition-all text-[11px] md:text-sm bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100"
                        aria-label="वापस जाएँ"
                    >
                        <ArrowLeft size={14} aria-hidden="true" />
                        वापस जाएँ
                    </button>

                    {/* ✅ Share Button */}
                    <button
                        onClick={handleShare}
                        className="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 font-bold text-[11px] md:text-sm bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100 transition-all"
                        aria-label="Share करें"
                    >
                        {copied
                            ? <Check size={14} className="text-green-500" />
                            : <Share2 size={14} aria-hidden="true" />
                        }
                        {copied ? 'Copied!' : 'Share'}
                    </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-4 md:gap-6 items-start">

                    {/* Main Content */}
                    <div className="w-full lg:w-[70%] min-w-0 space-y-4">

                        <article
                            className="bg-white rounded-2xl md:rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden"
                            itemScope
                            itemType="https://schema.org/JobPosting"
                        >
                            {/* Header */}
                            <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 p-4 md:p-8 text-white relative">
                                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                    <Briefcase size={120} aria-hidden="true" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex gap-2 mb-2 flex-wrap">
                                        <span className="bg-yellow-400 text-blue-900 font-black text-[7px] md:text-[10px] px-2 py-0.5 rounded-full uppercase">
                                            Latest Update
                                        </span>
                                        {job.organization && (
                                            <span className="bg-white/10 text-white font-bold text-[7px] md:text-[10px] px-2 py-0.5 rounded-full border border-white/20 uppercase truncate"
                                                itemProp="hiringOrganization">
                                                {job.organization}
                                            </span>
                                        )}
                                    </div>

                                    {/* ✅ H1 - Proper */}
                                    <h1
                                        className="text-lg md:text-3xl font-black mb-3 leading-tight uppercase tracking-tight"
                                        itemProp="title"
                                    >
                                        {job.title} Online Form 2025
                                    </h1>

                                    <div className="flex flex-wrap gap-3 md:gap-6 text-blue-100 font-bold text-[9px] md:text-xs pt-3 border-t border-white/10">
                                        <span className="flex items-center gap-1.5">
                                            <Calendar size={14} className="text-yellow-400" aria-hidden="true" />
                                            <time itemProp="datePosted" dateTime={publishedIso}>
                                                {formatDate(job.createdAt)}
                                            </time>
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <MapPin size={14} className="text-yellow-400" aria-hidden="true" />
                                            <span itemProp="jobLocation">{job.location || "All India"}</span>
                                        </span>
                                        {job.advtNo && (
                                            <span className="flex items-center gap-1.5">
                                                <FileText size={14} className="text-yellow-400" aria-hidden="true" />
                                                Advt: {job.advtNo}
                                            </span>
                                        )}
                                        {/* ✅ View count */}
                                        {job.views && (
                                            <span className="flex items-center gap-1.5">
                                                <Eye size={14} className="text-yellow-400" aria-hidden="true" />
                                                {job.views.toLocaleString('hi-IN')} views
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-3 md:p-8 space-y-6 md:space-y-8">

                                {/* 4 Info Bars */}
                                <div className="grid grid-cols-1 gap-3">
                                    {[
                                        {
                                            bg: "blue", icon: <Users size={24} aria-hidden="true" />,
                                            label: "Total Vacancies / कुल पद",
                                            value: job.vacancies || 'Notification के अनुसार',
                                            prop: "totalJobOpenings"
                                        },
                                        {
                                            bg: "emerald", icon: <Banknote size={24} aria-hidden="true" />,
                                            label: "Monthly Salary / वेतन",
                                            value: job.salary || 'नियमों के अनुसार',
                                            prop: "baseSalary"
                                        },
                                        {
                                            bg: "purple", icon: <GraduationCap size={24} aria-hidden="true" />,
                                            label: "Eligibility / पात्रता",
                                            value: job.qualification || job.eligibility || 'विवरण नीचे देखें',
                                            prop: "qualifications"
                                        },
                                        {
                                            bg: "orange", icon: <Trophy size={24} aria-hidden="true" />,
                                            label: "Selection Mode / चयन",
                                            value: job.selectionProcess || 'लिखित परीक्षा / मेरिट',
                                            prop: null
                                        }
                                    ].map((item, idx) => (
                                        <div
                                            key={idx}
                                            className={`bg-${item.bg}-50/40 border-l-[6px] border-${item.bg}-600 p-4 md:p-6 rounded-xl flex items-center gap-4 shadow-sm hover:bg-${item.bg}-50 transition-all`}
                                        >
                                            <div className={`bg-${item.bg}-600 text-white p-3 rounded-xl shrink-0 shadow-md`}>
                                                {item.icon}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-[10px] font-black text-${item.bg}-500 uppercase tracking-widest mb-0.5`}>
                                                    {item.label}
                                                </p>
                                                <div
                                                    className={`text-[14px] md:text-xl font-black text-${item.bg}-900 leading-tight break-words`}
                                                    {...(item.prop ? { itemProp: item.prop } : {})}
                                                >
                                                    {item.value}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Dates & Fees */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-white border border-slate-100 p-5 md:p-8 rounded-3xl shadow-sm">
                                        <h2 className="text-blue-800 font-black text-[12px] md:text-lg mb-5 flex items-center gap-2 border-b border-blue-50 pb-3 uppercase italic">
                                            <Clock size={20} className="text-blue-600" aria-hidden="true" />
                                            Important Dates
                                        </h2>
                                        <ul className="space-y-4 text-[11px] md:text-base font-bold text-slate-600">
                                            <li className="flex justify-between border-b border-slate-50 pb-2">
                                                <span>Application Begin:</span>
                                                <span className="text-blue-600">{job.startDate || "Active"}</span>
                                            </li>
                                            <li className="flex justify-between p-2 bg-red-50 text-red-600 rounded-xl">
                                                <span>Last Date Apply:</span>
                                                <span
                                                    className="font-black animate-pulse"
                                                    itemProp="validThrough"
                                                >
                                                    {job.lastDate || "Soon"}
                                                </span>
                                            </li>
                                            <li className="flex justify-between opacity-60">
                                                <span>Exam Date:</span>
                                                <span>{job.examDate || "नियमों के अनुसार"}</span>
                                            </li>
                                        </ul>
                                    </div>

                                    <div className="bg-white border border-slate-100 p-5 md:p-8 rounded-3xl shadow-sm">
                                        <h2 className="text-emerald-800 font-black text-[12px] md:text-lg mb-5 flex items-center gap-2 border-b border-emerald-50 pb-3 uppercase italic">
                                            <Banknote size={20} className="text-emerald-600" aria-hidden="true" />
                                            Application Fee
                                        </h2>
                                        <div className="text-[11px] md:text-base font-bold">
                                            {job.feeGen ? (
                                                <ul className="space-y-3">
                                                    <li className="flex justify-between border-b border-slate-50 pb-2">
                                                        <span>Gen / OBC:</span>
                                                        <span className="text-emerald-700">₹{job.feeGen}</span>
                                                    </li>
                                                    <li className="flex justify-between border-b border-slate-50 pb-2">
                                                        <span>SC / ST / PH:</span>
                                                        <span className="text-emerald-700">₹{job.feeSCST || '0'}</span>
                                                    </li>
                                                    <li className="flex justify-between">
                                                        <span>Female All Cat:</span>
                                                        <span className="text-emerald-700">₹{job.feeFemale || '0'}</span>
                                                    </li>
                                                </ul>
                                            ) : (
                                                <p className="text-slate-500 italic leading-relaxed">
                                                    {job.applicationFee || "Official Notification देखें"}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Age Limit */}
                                <div className="bg-slate-900 rounded-3xl p-6 md:p-10 text-white relative overflow-hidden shadow-xl">
                                    <h2 className="text-[12px] md:text-xl font-black mb-8 flex items-center gap-3 uppercase tracking-widest border-l-4 border-blue-500 pl-4 italic">
                                        Age Limit Details
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-white/10 p-5 rounded-2xl text-center border border-white/5">
                                            <p className="text-blue-300 text-[10px] font-black uppercase mb-1">Minimum Age</p>
                                            <p className="text-2xl md:text-4xl font-black">{job.minAge || "18"} Yrs</p>
                                        </div>
                                        <div className="bg-white/10 p-5 rounded-2xl text-center border border-white/5">
                                            <p className="text-blue-300 text-[10px] font-black uppercase mb-1">Maximum Age</p>
                                            <p className="text-2xl md:text-4xl font-black"
                                                itemProp="experienceRequirements">
                                                {job.ageLimit || "30"} Yrs
                                            </p>
                                        </div>
                                        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-5 rounded-2xl flex items-center justify-center">
                                            <p className="text-xs md:text-sm font-black text-center leading-snug">
                                                Age relaxation extra as per Govt rules.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Eligibility & Description */}
                                <div className="space-y-5">
                                    <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                                        <h2 className="bg-slate-50 px-5 py-4 border-b font-black text-slate-800 uppercase text-xs flex items-center gap-2">
                                            <CheckCircle size={16} className="text-blue-600" aria-hidden="true" />
                                            Post Eligibility & Selection
                                        </h2>
                                        <div className="p-5 md:p-10">
                                            <p className="text-blue-800 font-black text-sm md:text-2xl mb-4">
                                                {job.title}
                                            </p>
                                            <div
                                                className="text-slate-600 font-bold text-xs md:text-lg leading-relaxed whitespace-pre-line border-l-4 border-blue-50 pl-6"
                                                itemProp="qualifications"
                                            >
                                                {job.qualification || job.eligibility || "विस्तृत विवरण के लिए नोटिफिकेशन देखें।"}
                                            </div>
                                        </div>
                                    </div>

                                    {job.description && (
                                        <div className="bg-blue-50/20 border border-blue-50 rounded-3xl p-6 md:p-10">
                                            <h2 className="text-blue-900 font-black text-xs md:text-2xl mb-6 border-b border-blue-100 pb-4 uppercase tracking-tighter italic flex items-center gap-2">
                                                <FileSearch size={24} className="inline" aria-hidden="true" />
                                                Detailed Overview
                                            </h2>
                                            <div
                                                className="text-slate-700 font-medium text-xs md:text-lg leading-relaxed whitespace-pre-line"
                                                itemProp="description"
                                            >
                                                {job.description}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Toolkit Promo */}
                                <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-[2rem] p-6 md:p-8 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-6 border-b-8 border-red-700 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                        <Sparkles size={120} aria-hidden="true" />
                                    </div>
                                    <div className="relative z-10 text-center md:text-left">
                                        <div className="bg-yellow-400 text-red-900 font-black text-[10px] px-3 py-1 rounded-full uppercase mb-3 inline-block">
                                            100% Free Tool
                                        </div>
                                        <p className="text-lg md:text-2xl font-black mb-2 leading-tight">
                                            फॉर्म भरने से पहले Photo/Sign Resize करें!
                                        </p>
                                        <p className="text-xs text-red-100 font-bold">
                                            Age Calculator, PDF Converter & Resume Maker - मोबाइल से करें
                                        </p>
                                    </div>
                                    <a
                                        href="/tools"
                                        className="shrink-0 bg-white text-red-600 hover:bg-yellow-400 hover:text-red-900 h-14 px-8 rounded-2xl flex items-center gap-2 font-black text-sm transition-all shadow-xl z-10"
                                    >
                                        Free Toolkit खोलें 🚀
                                    </a>
                                </div>

                                {/* ✅ Important Links */}
                                <div className="bg-slate-50 p-6 md:p-12 rounded-[3rem] border border-slate-100 shadow-inner">
                                    <h2 className="text-sm md:text-2xl font-black text-center mb-8 text-slate-900 uppercase underline decoration-blue-500 decoration-4 underline-offset-8 italic">
                                        All Important Links
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">

                                        {/* Apply */}
                                        {job.applyLink && (
                                            <a
                                                href={safeRedirect(job.applyLink)}
                                                target="_blank"
                                                rel="nofollow noopener noreferrer"
                                                className="h-14 md:h-20 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl flex justify-between px-6 items-center shadow-lg transition-all active:scale-95"
                                            >
                                                <span className="flex items-center gap-2 text-[11px] md:text-lg font-black uppercase">
                                                    <Zap size={22} className="fill-white" aria-hidden="true" />
                                                    Apply Online
                                                </span>
                                                <ExternalLink size={20} aria-hidden="true" />
                                            </a>
                                        )}

                                        {/* Notification */}
                                        {job.notificationLink && (
                                            <a
                                                href={job.notificationLink.includes('firebasestorage')
                                                    ? job.notificationLink
                                                    : safeRedirect(job.notificationLink)
                                                }
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="h-14 md:h-20 border-2 border-red-200 bg-white text-red-600 hover:bg-red-50 rounded-2xl flex justify-between px-6 items-center transition-all active:scale-95"
                                            >
                                                <span className="text-[11px] md:text-sm font-black uppercase flex items-center gap-2">
                                                    <Download size={20} aria-hidden="true" />
                                                    Notification PDF
                                                </span>
                                                <ArrowRight size={20} aria-hidden="true" />
                                            </a>
                                        )}

                                        {/* Official Website */}
                                        {job.officialSiteLink && (
                                            <a
                                                href={safeRedirect(job.officialSiteLink)}
                                                target="_blank"
                                                rel="nofollow noopener noreferrer"
                                                className="h-14 md:h-20 bg-slate-800 hover:bg-black text-white rounded-2xl flex justify-between px-6 items-center shadow-lg transition-all active:scale-95"
                                            >
                                                <span className="flex items-center gap-2 text-[11px] md:text-sm font-black uppercase">
                                                    <Globe size={20} aria-hidden="true" />
                                                    Official Website
                                                </span>
                                                <ExternalLink size={20} aria-hidden="true" />
                                            </a>
                                        )}

                                        {/* Syllabus */}
                                        {job.syllabusPdfLink && (
                                            <a
                                                href={job.syllabusPdfLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="h-14 md:h-20 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl flex justify-between px-6 items-center shadow-lg transition-all active:scale-95"
                                            >
                                                <span className="flex items-center gap-2 text-[11px] md:text-sm font-black uppercase">
                                                    <Download size={20} aria-hidden="true" />
                                                    Syllabus PDF
                                                </span>
                                                <FileText size={20} aria-hidden="true" />
                                            </a>
                                        )}
                                    </div>
                                </div>

                                {/* ✅ Internal Links - /mock-tests FIX */}
                                <div className="bg-blue-50/50 p-6 md:p-8 rounded-[2rem] border border-blue-100 mt-4">
                                    <h2 className="text-sm md:text-xl font-black text-slate-800 mb-5 uppercase flex items-center gap-2">
                                        <Search size={20} className="text-blue-600" aria-hidden="true" />
                                        Explore More on StudyGyaan
                                    </h2>
                                    <div className="flex flex-wrap gap-3">
                                        {[
                                            { href: "/govt-jobs", label: "Latest Govt Jobs" },
                                            { href: "/free-study-material", label: "Free Study Material" },
                                            { href: "/test", label: "Free Mock Tests" }, // ✅ Fixed
                                            { href: "/blog", label: "Blogs & Updates" },
                                            { href: "/web-stories", label: "Web Stories" }
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
                    <aside className="w-full lg:w-[30%] space-y-5 sticky top-20">

                        {/* Toolkit */}
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-3xl shadow-xl text-white relative overflow-hidden border-b-4 border-indigo-900">
                            <p className="text-sm font-black mb-2 uppercase relative z-10">
                                Sarkari Toolkit 🛠️
                            </p>
                            <p className="text-[11px] text-blue-100 font-medium mb-4 leading-relaxed">
                                Resize Photo, Signature & Make Resume FREE
                            </p>
                            <a
                                href="/tools"
                                className="bg-white text-blue-700 hover:bg-yellow-400 hover:text-blue-900 font-black px-4 py-3 rounded-xl text-xs w-full flex justify-center items-center gap-2 transition-all shadow-md"
                            >
                                Open Tools <ArrowRight size={16} aria-hidden="true" />
                            </a>
                        </div>

                        {/* Trending */}
                        {trendingLinks.length > 0 && (
                            <div className="bg-white p-5 md:p-8 rounded-3xl shadow-sm border border-slate-100">
                                <h2 className="text-xs md:text-base font-black text-slate-900 mb-6 flex items-center gap-2 border-b pb-3 uppercase">
                                    <Sparkles size={18} className="text-blue-600" aria-hidden="true" />
                                    Latest Updates 🔥
                                </h2>
                                <ul className="space-y-4" role="list">
                                    {trendingLinks.slice(0, 5).map((item, i) => (
                                        <li key={i}>
                                            <a
                                                href={item.url?.startsWith('http')
                                                    ? safeRedirect(item.url)
                                                    : item.url || '/govt-jobs'
                                                }
                                                target={item.url?.startsWith('http') ? '_blank' : '_self'}
                                                rel={item.url?.startsWith('http') ? 'nofollow noopener noreferrer' : undefined}
                                                className="group block"
                                            >
                                                <p className="text-[12px] md:text-[14px] font-black text-slate-700 group-hover:text-blue-600 line-clamp-2 leading-tight transition-colors">
                                                    {item.title}
                                                </p>
                                                <div className="h-[2px] w-0 group-hover:w-full bg-blue-100 transition-all mt-2" />
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Premium */}
                        <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 p-6 md:p-10 rounded-[3rem] text-white shadow-2xl border-b-8 border-blue-500">
                            <div className="text-center">
                                <span className="bg-yellow-400 text-blue-900 font-black px-4 py-1.5 rounded-full text-[9px] mb-4 uppercase inline-block">
                                    Premium
                                </span>
                                <p className="text-lg font-black mb-1 uppercase leading-tight">
                                    Master Study Notes
                                </p>
                                <p className="text-[10px] opacity-70 mb-5 font-bold uppercase italic">
                                    Selected by Experts
                                </p>
                                <div className="bg-white/10 p-4 rounded-2xl border border-white/10 mb-6 flex justify-between items-center">
                                    <span className="line-through opacity-40 text-sm font-bold">
                                        ₹{globalSettings?.mrpPrice || '499'}
                                    </span>
                                    <span className="text-2xl font-black text-yellow-400">
                                        ₹{sellingPrice}
                                    </span>
                                </div>
                                <a
                                    href="/premium-notes"
                                    className="block w-full bg-yellow-400 text-blue-900 hover:bg-white font-black h-14 rounded-2xl text-xs uppercase transition-all shadow-xl flex items-center justify-center"
                                >
                                    Get Access Now →
                                </a>
                            </div>
                        </div>

                        {/* Support */}
                        <div className="bg-emerald-50 border-2 border-dashed border-emerald-200 p-8 rounded-[2rem] text-center">
                            <p className="text-[10px] font-black text-emerald-800 uppercase mb-3 flex items-center justify-center gap-2">
                                <ShieldCheck size={18} className="text-emerald-600" aria-hidden="true" />
                                Facing Any Issues?
                            </p>
                            <a
                                href="https://wa.me/916263396446"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-white text-emerald-600 font-black px-5 py-3 rounded-2xl text-[10px] hover:bg-emerald-600 hover:text-white transition-all shadow-md flex items-center justify-center gap-2 border border-emerald-100"
                            >
                                WhatsApp Support
                                <Smartphone size={16} aria-hidden="true" />
                            </a>
                        </div>

                    </aside>
                </div>
            </div>

            {/* ✅ Bottom Bar */}
            <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 py-2 px-3 z-[100] shadow-[0_-10px_30px_rgba(0,0,0,0.08)]">
                <div className="max-w-5xl mx-auto flex justify-between items-center gap-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-red-600 flex items-center gap-1 uppercase">
                            <Flame className="w-3 h-3 text-orange-500 animate-pulse" aria-hidden="true" />
                            {globalSettings?.discountPercent}% OFF
                        </span>
                        <span className="hidden md:inline text-[13px] font-bold text-slate-600 mt-1">
                            {globalSettings?.bottomBarText}
                        </span>
                        <span className="md:hidden text-[12px] font-black text-slate-900 mt-0.5">
                            Premium: ₹{sellingPrice}
                        </span>
                    </div>
                    <a
                        href="/premium-notes"
                        className="bg-blue-700 text-white font-black py-2 px-6 rounded-xl hover:bg-blue-800 transition-all shadow-lg active:scale-95 flex items-center gap-1.5 text-[12px] md:text-sm"
                    >
                        <span className="hidden md:inline">₹{sellingPrice} में अनलॉक करें</span>
                        <span className="md:hidden">अनलॉक करें</span>
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </a>
                </div>
            </div>
        </div>
    );
};

export default JobDetails;
