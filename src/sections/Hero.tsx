/**
 * Hero — 🎨 BRAND NEW (clean + lit)
 * ==================================
 * Kya hata: bhaari Tools banner, bade khali min-heights, duplicate clutter
 * Kya sudhra: E-Books link (/e-books), ticker garbage-filter, compact spacing
 */
import { ExternalLink, Sparkles, BookOpen, Target, Award, Bell, FileText, ArrowRight } from 'lucide-react';
import { useSiteContent } from "@/hooks/useSiteContent";
import GlobalSearch from './GlobalSearch';

const ACTION_BUTTONS = [
    { id: 'jobs',    href: '/govt-jobs',           label: 'Govt Jobs',   subLabel: 'Daily Updates',  icon: Bell,     accent: 'text-sky-400',     ring: 'border-sky-500/30',     glow: 'group-hover:bg-sky-500' },
    { id: 'tests',   href: '/test',                label: 'Mock Tests',  subLabel: 'Exam Level',     icon: Target,   accent: 'text-emerald-400', ring: 'border-emerald-500/30', glow: 'group-hover:bg-emerald-500' },
    { id: 'library', href: '/free-study-material', label: 'Free Notes',  subLabel: '4000+ PDFs',     icon: BookOpen, accent: 'text-blue-400',    ring: 'border-blue-500/30',    glow: 'group-hover:bg-blue-500' },
    { id: 'ebooks',  href: '/e-books',             label: 'E-Books',     subLabel: 'Free Download',  icon: FileText, accent: 'text-purple-400',  ring: 'border-purple-500/30',  glow: 'group-hover:bg-purple-500' },
];

const STATS = [
    { label: '50K+ Students', emoji: '👨‍🎓' },
    { label: '4000+ Notes', emoji: '📚' },
    { label: '500+ Tests', emoji: '📝' },
    { label: 'Daily Updates', emoji: '🔔' },
];

const DEFAULT_HERO_DESCRIPTION =
    "Latest Govt Jobs, Free Mock Tests, PDF Notes & Exam Updates — sab kuch ek jagah.";

const DEFAULT_LIVE_UPDATES = [
    { text: 'Aaj ki nayi sarkari bhartiyan dekhein', link: '/govt-jobs' },
    { text: 'Is hafte ki Last Dates — Exam Calendar', link: '/exam-calendar' },
    { text: 'Free Mock Tests — abhi practice karein', link: '/test' },
    { text: 'Free PDF Notes download karein', link: '/free-study-material' },
];

const Hero = () => {
    const { content } = useSiteContent();

    const premiumPrice = content?.premiumPrice || '150';
    const heroDescription = content?.heroDescription || DEFAULT_HERO_DESCRIPTION;

    // 🧹 Ticker: chhota/garbage text filter (jaise "Hai 🔥")
    const rawUpdates =
        Array.isArray(content?.liveUpdate?.updates) && content.liveUpdate.updates.length > 0
            ? content.liveUpdate.updates
            : DEFAULT_LIVE_UPDATES;
    const liveUpdates = rawUpdates.filter((u) => (u?.text || '').trim().length >= 10);
    const tickerItems = liveUpdates.length > 0 ? liveUpdates : DEFAULT_LIVE_UPDATES;

    return (
        <header
            className="relative isolate overflow-hidden bg-slate-950 pt-10 md:pt-20 pb-[72px] md:pb-[80px] px-4 font-hindi"
            role="banner"
        >
            {/* Glows */}
            <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
                <div
                    className="absolute -top-24 left-1/2 -translate-x-1/2 w-[700px] h-[380px] rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)' }}
                />
                <div
                    className="absolute bottom-0 right-0 w-[420px] h-[240px] rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(250,204,21,0.07) 0%, transparent 70%)' }}
                />
            </div>

            <div className="max-w-4xl mx-auto relative z-10 text-center">
                {/* Trust badge */}
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-4 md:mb-6">
                    <Sparkles className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-400" aria-hidden="true" />
                    <span className="text-slate-300 text-[9px] md:text-xs font-bold tracking-widest uppercase">
                        Trusted by 50,000+ Aspirants
                    </span>
                </div>

                {/* H1 */}
                <h1 className="text-2xl sm:text-4xl md:text-6xl font-black text-white mb-3 md:mb-4 tracking-tight leading-tight">
                    Crack Your Dream Job with{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-yellow-400">
                        StudyGyaan
                    </span>
                </h1>

                {/* Tagline */}
                <p className="text-slate-400 text-[11px] sm:text-sm md:text-lg font-medium mb-6 md:mb-8 max-w-xl mx-auto leading-relaxed">
                    {heroDescription}
                </p>

                {/* Search */}
                <div className="max-w-xl mx-auto mb-7 md:mb-10 relative group z-[100]">
                    <div
                        className="absolute -inset-[2px] bg-gradient-to-r from-blue-500 via-yellow-400 to-blue-500 rounded-2xl blur-sm opacity-40 group-focus-within:opacity-80 transition duration-500 pointer-events-none"
                        aria-hidden="true"
                    />
                    <div className="relative bg-slate-900 rounded-2xl p-1.5 md:p-2 border border-slate-700/60">
                        <GlobalSearch />
                    </div>
                </div>

                {/* Action cards — 4 kaam ki cheezein */}
                <nav className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-4 mb-4 md:mb-6" aria-label="Quick Navigation">
                    {ACTION_BUTTONS.map((btn) => {
                        const Icon = btn.icon;
                        return (
                            <a
                                key={btn.id}
                                href={btn.href}
                                aria-label={btn.label}
                                className={`group flex flex-col items-center gap-2 p-3.5 md:p-5 bg-slate-900/70 border ${btn.ring} rounded-2xl backdrop-blur-md hover:-translate-y-1 hover:bg-slate-900 active:scale-95 transition-all`}
                            >
                                <div className={`bg-white/5 border border-white/10 p-2.5 md:p-3 rounded-xl ${btn.accent} ${btn.glow} group-hover:text-white group-hover:scale-110 transition-all`}>
                                    <Icon size={20} className="md:w-6 md:h-6" aria-hidden="true" />
                                </div>
                                <div className="text-center">
                                    <p className="text-white font-black text-xs md:text-base leading-tight">{btn.label}</p>
                                    <p className="text-slate-500 text-[8px] md:text-[10px] font-bold uppercase tracking-wider mt-0.5">{btn.subLabel}</p>
                                </div>
                            </a>
                        );
                    })}
                </nav>

                {/* Premium strip — ek compact line */}
                <a
                    href="/premium-notes"
                    className="group flex items-center justify-center gap-2.5 max-w-xl mx-auto px-4 py-3 md:py-3.5 mb-6 md:mb-8 rounded-2xl bg-gradient-to-r from-yellow-500/10 via-amber-500/15 to-yellow-500/10 border border-yellow-500/30 hover:border-yellow-400/60 hover:-translate-y-0.5 transition-all"
                >
                    <Award size={16} className="text-yellow-400 shrink-0" aria-hidden="true" />
                    <span className="text-yellow-300 font-black text-[11px] md:text-sm">
                        Premium Notes — 10 saal ke repeated sawalon ka nichod
                    </span>
                    <span className="bg-yellow-400 text-slate-900 text-[9px] md:text-[11px] font-black px-2 py-0.5 rounded-full shrink-0">
                        ₹{premiumPrice}
                    </span>
                    <ArrowRight size={14} className="text-yellow-400/70 group-hover:translate-x-1 transition-transform shrink-0" aria-hidden="true" />
                </a>

                {/* Stats */}
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-slate-500 text-[10px] md:text-xs font-bold" role="list" aria-label="Platform Statistics">
                    {STATS.map((stat) => (
                        <div key={stat.label} className="flex items-center gap-1.5" role="listitem">
                            <span aria-hidden="true">{stat.emoji}</span>
                            <span>{stat.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Live ticker */}
            <div
                className="absolute bottom-0 left-0 right-0 bg-blue-600 z-20 h-11 md:h-12"
                role="region"
                aria-label="Live Updates Ticker"
                aria-live="off"
            >
                <div className="max-w-7xl mx-auto flex items-center h-full">
                    <div className="bg-red-600 h-full flex items-center px-3.5 md:px-6 relative z-10 shrink-0">
                        <span className="text-white text-[10px] md:text-sm font-black uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" aria-hidden="true" />
                            Live
                        </span>
                        <div
                            className="absolute right-[-10px] top-0 border-l-[10px] border-l-red-600 border-y-[22px] md:border-y-[24px] border-y-transparent"
                            aria-hidden="true"
                        />
                    </div>

                    <div className="flex-1 relative overflow-hidden ml-4 md:ml-6 h-full">
                        <div className="whitespace-nowrap animate-marquee flex gap-12 md:gap-24 items-center h-full text-white">
                            {[...tickerItems, ...tickerItems].map((u, i) => {
                                const isExternal = u.link?.startsWith('http') && !u.link?.includes('studygyaan.in');
                                const hidden = i >= tickerItems.length;
                                return (
                                    <a
                                        key={i}
                                        href={u.link || '/govt-jobs'}
                                        target={isExternal ? '_blank' : '_self'}
                                        rel={isExternal ? 'noopener noreferrer' : undefined}
                                        className="text-white/90 hover:text-white font-semibold text-xs md:text-sm flex items-center gap-2 transition-colors shrink-0"
                                        aria-hidden={hidden || undefined}
                                        tabIndex={hidden ? -1 : undefined}
                                    >
                                        <Bell size={12} className="text-yellow-300 shrink-0" aria-hidden="true" />
                                        {u.text}
                                        {isExternal && <ExternalLink size={12} className="opacity-70 shrink-0" aria-hidden="true" />}
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee {
                    animation: marquee 30s linear infinite;
                    will-change: transform;
                }
                .animate-marquee:hover { animation-play-state: paused; }
                @media (prefers-reduced-motion: reduce) {
                    .animate-marquee { animation: none; }
                }
            `}</style>
        </header>
    );
};

export default Hero;
