// @ts-nocheck
import React from 'react';
import {
    ExternalLink, Sparkles, BookOpen,
    Target, Award, ChevronRight, Bell, 
    Wrench, Zap, ArrowRight, FileText
} from 'lucide-react';
import { useSiteContent } from "@/hooks/useSiteContent";
import GlobalSearch from './GlobalSearch';

// =========================================================
// 🎯 ACTION BUTTONS CONFIG - Wrench hata ke E-Books lagaya
// =========================================================
const ACTION_BUTTONS = [
    {
        id: 'free-library',
        href: '/free-study-material',
        label: 'Free Library',
        subLabel: '4000+ Notes',
        icon: BookOpen,
        colors: {
            border: 'border-blue-500/20',
            iconBg: 'bg-blue-500/10 border-blue-500/20',
            iconText: 'text-blue-400',
            iconHover: 'group-hover:bg-blue-500',
            subText: 'text-blue-200/60'
        }
    },
    {
        id: 'mock-tests',
        href: '/test',
        label: 'Mock Tests',
        subLabel: 'Exam Level',
        icon: Target,
        colors: {
            border: 'border-emerald-500/20',
            iconBg: 'bg-emerald-500/10 border-emerald-500/20',
            iconText: 'text-emerald-400',
            iconHover: 'group-hover:bg-emerald-500',
            subText: 'text-emerald-200/60'
        }
    },
    // ✅ Wrench hataya - ab E-Books lagaya
    {
        id: 'ebooks',
        href: '/ebooks',
        label: 'E-Books',
        subLabel: 'Free Download',
        icon: FileText,
        colors: {
            border: 'border-purple-500/20',
            iconBg: 'bg-purple-500/10 border-purple-500/20',
            iconText: 'text-purple-400',
            iconHover: 'group-hover:bg-purple-500',
            subText: 'text-purple-200/60'
        }
    }
];

// =========================================================
// 📊 STATS CONFIG
// =========================================================
const STATS = [
    { label: '50K+ Students', emoji: '👨‍🎓' },
    { label: '4000+ Free Notes', emoji: '📚' },
    { label: '500+ Mock Tests', emoji: '📝' },
    { label: 'Daily Job Updates', emoji: '🔔' }
];

const DEFAULT_HERO_DESCRIPTION =
    "India की सबसे Smart Platform for Latest Govt Jobs, Free Mock Tests, PDF Notes & Premium Study Material।";

const DEFAULT_LIVE_UPDATES = [
    { text: '🛠️ Sarkari Tools - Photo, PDF, Resume Maker', link: '/tools' },
    { text: 'SSC CGL 2025 Notification Out!', link: '/govt-jobs' },
    { text: 'RRB NTPC New Vacancy 2025', link: '/govt-jobs' },
    { text: 'Free Mock Tests Available', link: '/test' },
    { text: 'Download Free PDF Notes', link: '/free-study-material' }
];

// =========================================================
// 🚀 HERO COMPONENT
// =========================================================
const Hero = () => {
    const { content } = useSiteContent();

    const premiumPrice = content?.premiumPrice || '150';

    const heroDescription =
        content?.heroDescription || DEFAULT_HERO_DESCRIPTION;

    const liveUpdates =
        Array.isArray(content?.liveUpdate?.updates) && content.liveUpdate.updates.length > 0
            ? content.liveUpdate.updates
            : DEFAULT_LIVE_UPDATES;

    return (
        <header
            className="relative isolate overflow-hidden bg-slate-950 pt-16 md:pt-32 pb-[88px] md:pb-[96px] px-4 font-hindi z-[60] min-h-[700px] md:min-h-[760px]"
            role="banner"
        >
            {/* Background Glows */}
            <div
                className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0"
                aria-hidden="true"
            >
                <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full"
                    style={{
                        background: 'radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 70%)'
                    }}
                />
                <div
                    className="absolute bottom-0 right-0 w-[600px] h-[300px] rounded-full"
                    style={{
                        background: 'radial-gradient(circle, rgba(234,179,8,0.08) 0%, transparent 70%)'
                    }}
                />
            </div>

            {/* ✅✅✅ NEW: SHINY SARKARI TOOLS BANNER - Top Center ✅✅✅ */}
            <div className="max-w-5xl mx-auto relative z-20 mb-6 md:mb-8">
                <a
                    href="/tools"
                    aria-label="Sarkari Tools - 16+ Free Tools"
                    className="group relative flex items-center justify-center gap-2 md:gap-3 
                               mx-auto max-w-xl w-fit px-4 py-2.5 md:px-6 md:py-3
                               rounded-full overflow-hidden
                               bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500
                               shadow-[0_0_40px_rgba(236,72,153,0.5)]
                               hover:shadow-[0_0_60px_rgba(236,72,153,0.8)]
                               hover:scale-105 active:scale-95
                               transition-all duration-300
                               animate-tools-glow
                               border-2 border-white/20"
                >
                    {/* Shining sweep effect */}
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent 
                                     -translate-x-full group-hover:translate-x-full 
                                     transition-transform duration-1000 pointer-events-none" />
                    
                    {/* Sparkle decorations */}
                    <span className="absolute top-0 left-4 text-yellow-200 text-xs animate-ping opacity-70">✨</span>
                    <span className="absolute bottom-0 right-6 text-yellow-200 text-xs animate-ping delay-700 opacity-70">✨</span>
                    
                    {/* Tools Icon */}
                    <div className="relative bg-white/20 backdrop-blur-sm p-1.5 md:p-2 rounded-full 
                                    group-hover:rotate-12 transition-transform">
                        <Wrench 
                            size={16} 
                            className="text-white md:w-5 md:h-5" 
                            aria-hidden="true"
                        />
                    </div>
                    
                    {/* Text */}
                    <div className="relative flex items-center gap-2">
                        <span className="text-white font-black text-xs md:text-base uppercase tracking-wider">
                            🎉 New: Sarkari Tools
                        </span>
                        <span className="hidden sm:inline-flex bg-yellow-400 text-red-700 
                                         text-[8px] md:text-[10px] px-2 py-0.5 rounded-full 
                                         font-black uppercase animate-bounce">
                            16+ Free
                        </span>
                    </div>
                    
                    {/* Arrow */}
                    <ArrowRight 
                        size={14} 
                        className="text-white group-hover:translate-x-1 transition-transform md:w-4 md:h-4" 
                        aria-hidden="true"
                    />
                    
                    {/* NEW badge - top right */}
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white 
                                     text-[8px] px-1.5 py-0.5 rounded-full font-black 
                                     animate-bounce shadow-lg border border-white">
                        NEW
                    </span>
                </a>
            </div>
            {/* ✅✅✅ END OF SHINY BANNER ✅✅✅ */}

            <div className="max-w-5xl mx-auto relative z-10 text-center">

                {/* Trust Badge */}
                <div
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-6 md:mb-8 shadow-lg min-h-[40px]"
                    aria-label="50,000+ Aspirants trusted platform"
                >
                    <Sparkles
                        className="w-3 h-3 md:w-4 md:h-4 text-yellow-400"
                        aria-hidden="true"
                    />
                    <span className="text-slate-300 text-[10px] md:text-sm font-semibold tracking-wider uppercase">
                        Trusted by 50,000+ Aspirants
                    </span>
                </div>

                {/* H1 */}
                <h1 className="text-3xl sm:text-5xl md:text-7xl font-black text-white mb-4 md:mb-6 tracking-tight leading-[1.2] md:leading-[1.1] min-h-[88px] sm:min-h-[140px] md:min-h-[190px]">
                    Crack Your Dream Job with{' '}
                    <br className="hidden md:block" />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-yellow-400">
                        StudyGyaan
                    </span>
                </h1>

                {/* Description */}
                <p className="text-slate-400 text-xs sm:text-base md:text-xl font-medium mb-8 md:mb-10 max-w-2xl mx-auto leading-relaxed px-2 min-h-[44px] sm:min-h-[52px] md:min-h-[64px]">
                    {heroDescription}
                </p>

                {/* Search Bar */}
                <div className="max-w-2xl mx-auto mb-10 md:mb-16 relative group z-[100] w-full min-h-[72px] md:min-h-[84px]">
                    <div
                        className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-yellow-400 to-blue-500 rounded-2xl md:rounded-full blur opacity-30 group-hover:opacity-60 transition duration-500 pointer-events-none"
                        aria-hidden="true"
                    />
                    <div className="relative bg-slate-900 rounded-2xl md:rounded-full p-2 md:p-3 shadow-2xl border border-slate-700/50 flex items-center justify-center group-hover:-translate-y-1 transition-transform duration-300 min-h-[72px] md:min-h-[84px]">
                        <div className="w-full relative z-[101]">
                            <GlobalSearch />
                        </div>
                    </div>
                </div>

                {/* Action Buttons - Ab E-Books lagaya Wrench ki jagah */}
                <nav
                    className="grid grid-cols-2 md:flex md:flex-wrap md:flex-row justify-center gap-3 md:gap-4 mb-16 relative z-10 w-full px-1 sm:px-0 max-w-5xl mx-auto"
                    aria-label="Quick Navigation"
                >
                    {ACTION_BUTTONS.map(btn => {
                        const Icon = btn.icon;
                        return (
                            <a
                                key={btn.id}
                                href={btn.href}
                                aria-label={btn.label}
                                className={`relative flex flex-col items-center justify-center gap-2 p-4 bg-slate-900/60 border ${btn.colors.border} rounded-2xl backdrop-blur-md transition-all group overflow-hidden shadow-lg md:flex-row md:px-5 hover:-translate-y-1 min-h-[88px]`}
                            >
                                <div className={`${btn.colors.iconBg} border p-2 md:p-3 rounded-xl ${btn.colors.iconText} ${btn.colors.iconHover} group-hover:text-white group-hover:scale-110 transition-all`}>
                                    <Icon size={20} className="md:w-6 md:h-6" aria-hidden="true" />
                                </div>
                                <div className="text-center md:text-left">
                                    <p className="text-white font-black text-sm md:text-base leading-tight">
                                        {btn.label}
                                    </p>
                                    <p className={`${btn.colors.subText} text-[8px] md:text-[10px] font-bold uppercase mt-0.5 tracking-tighter md:tracking-widest`}>
                                        {btn.subLabel}
                                    </p>
                                </div>
                            </a>
                        );
                    })}

                    {/* Premium Notes */}
                    <a
                        href="/premium-notes"
                        aria-label={`Premium Notes - ₹${premiumPrice} में`}
                        className="col-span-2 md:col-span-1 relative flex flex-row items-center justify-center gap-4 px-5 py-4 bg-slate-900/80 border border-yellow-500/40 rounded-2xl backdrop-blur-md transition-all group overflow-hidden shadow-[0_0_40px_rgba(234,179,8,0.15)] hover:-translate-y-1 min-h-[88px]"
                    >
                        <div
                            className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 to-transparent pointer-events-none"
                            aria-hidden="true"
                        />
                        <div className="bg-yellow-500/20 border border-yellow-500/40 p-3 rounded-xl text-yellow-400 group-hover:bg-yellow-500 group-hover:text-slate-900 group-hover:scale-110 transition-all shrink-0">
                            <Award size={24} aria-hidden="true" />
                        </div>
                        <div className="text-left">
                            <p className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500 font-black text-base md:text-lg leading-tight">
                                Premium Notes
                            </p>
                            <div className="text-yellow-400/70 text-[10px] font-bold uppercase mt-1 tracking-widest flex items-center gap-2">
                                SPECIAL
                                <span className="bg-yellow-500/20 px-1.5 py-0.5 rounded text-yellow-300 min-w-[56px] text-center inline-block">
                                    ₹{premiumPrice}
                                </span>
                            </div>
                        </div>
                        <ChevronRight
                            size={20}
                            className="text-yellow-400/50 group-hover:translate-x-2 transition-all hidden sm:block"
                            aria-hidden="true"
                        />
                    </a>
                </nav>

                {/* Stats */}
                <div
                    className="flex flex-wrap justify-center gap-4 md:gap-8 text-slate-500 text-xs font-bold mb-4 min-h-[20px]"
                    role="list"
                    aria-label="Platform Statistics"
                >
                    {STATS.map(stat => (
                        <div
                            key={stat.label}
                            className="flex items-center gap-1.5"
                            role="listitem"
                        >
                            <span aria-hidden="true">{stat.emoji}</span>
                            <span>{stat.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Live News Strip */}
            <div
                className="absolute bottom-0 left-0 right-0 bg-blue-600 border-t border-blue-500/50 z-20 h-12"
                role="region"
                aria-label="Live Updates Ticker"
                aria-live="off"
            >
                <div className="max-w-7xl mx-auto flex items-center h-full">

                    {/* Live Badge */}
                    <div className="bg-red-600 h-full flex items-center px-4 md:px-6 relative z-10 shadow-lg shrink-0">
                        <span className="text-white text-[10px] md:text-sm font-black uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" aria-hidden="true" />
                            Live
                        </span>
                        <div
                            className="absolute right-[-10px] top-0 border-l-[10px] border-l-red-600 border-y-[20px] md:border-y-[24px] border-y-transparent"
                            aria-hidden="true"
                        />
                    </div>

                    {/* Marquee */}
                    <div className="flex-1 relative overflow-hidden ml-6 h-full">
                        <div className="whitespace-nowrap animate-marquee flex gap-12 md:gap-24 items-center h-full text-white">
                            {liveUpdates.map((u, i) => {
                                const isExternal = u.link?.startsWith('http')
                                    && !u.link?.includes('studygyaan.in');

                                return (
                                    <a
                                        key={i}
                                        href={u.link || '/govt-jobs'}
                                        target={isExternal ? '_blank' : '_self'}
                                        rel={isExternal ? 'noopener noreferrer' : undefined}
                                        className="text-white/90 hover:text-white font-semibold text-xs md:text-sm flex items-center gap-2 transition-colors shrink-0"
                                    >
                                        <Bell size={12} className="text-yellow-300 shrink-0" aria-hidden="true" />
                                        {u.text}
                                        {isExternal && (
                                            <ExternalLink size={12} className="opacity-70 shrink-0" aria-hidden="true" />
                                        )}
                                    </a>
                                );
                            })}

                            {liveUpdates.map((u, i) => (
                                <a
                                    key={`dup-${i}`}
                                    href={u.link || '/govt-jobs'}
                                    className="text-white/90 font-semibold text-xs md:text-sm flex items-center gap-2 shrink-0"
                                    aria-hidden="true"
                                    tabIndex={-1}
                                >
                                    <Bell size={12} className="text-yellow-300 shrink-0" aria-hidden="true" />
                                    {u.text}
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ✅ Marquee + NEW Tools Glow Animation CSS */}
            <style>{`
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee {
                    animation: marquee 30s linear infinite;
                    will-change: transform;
                }
                .animate-marquee:hover {
                    animation-play-state: paused;
                }
                
                /* ✅ NEW: Tools banner glow animation */
                @keyframes tools-glow {
                    0%, 100% { 
                        box-shadow: 0 0 30px rgba(236, 72, 153, 0.5),
                                    0 0 60px rgba(168, 85, 247, 0.3);
                    }
                    50% { 
                        box-shadow: 0 0 50px rgba(236, 72, 153, 0.8),
                                    0 0 80px rgba(251, 146, 60, 0.5),
                                    0 0 100px rgba(168, 85, 247, 0.4);
                    }
                }
                .animate-tools-glow {
                    animation: tools-glow 2.5s ease-in-out infinite;
                }
                
                @media (prefers-reduced-motion: reduce) {
                    .animate-marquee,
                    .animate-tools-glow { 
                        animation: none; 
                    }
                }
            `}</style>
        </header>
    );
};

export default Hero;