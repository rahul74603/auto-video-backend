/**
 * QuickAccessGrid — 🎯 Homepage quick-access cards (mobile-first)
 * ================================================================
 * Hero ke turant baad: bade tappable cards — user ko 2 second me
 * samajh aa jaye site pe kya-kya hai. Mobile confusion ka ilaaj.
 */
import { Link } from 'react-router-dom';
import { Briefcase, CalendarDays, FileText, GraduationCap, Zap, Train, BookOpen, Newspaper } from 'lucide-react';

const ITEMS = [
    { to: '/govt-jobs', label: 'Govt Jobs', hindi: 'सरकारी नौकरी', icon: Briefcase, bg: 'from-blue-600 to-blue-700', badge: 'HOT' },
    { to: '/test', label: 'Mock Tests', hindi: 'फ्री टेस्ट', icon: FileText, bg: 'from-emerald-600 to-teal-600', badge: 'FREE' },
    { to: '/exam-calendar', label: 'Exam Calendar', hindi: 'लास्ट डेट्स', icon: CalendarDays, bg: 'from-purple-600 to-indigo-600', badge: 'NEW' },
    { to: '/jobs/10th-pass', label: '10th Pass Jobs', hindi: '10वीं पास', icon: GraduationCap, bg: 'from-orange-500 to-red-500' },
    { to: '/jobs/railway', label: 'Railway Jobs', hindi: 'रेलवे भर्ती', icon: Train, bg: 'from-rose-500 to-pink-600' },
    { to: '/govt-jobs', label: 'Fast Track', hindi: 'रिजल्ट/एडमिट कार्ड', icon: Zap, bg: 'from-amber-500 to-orange-500' },
    { to: '/free-study-material', label: 'Study Material', hindi: 'फ्री नोट्स', icon: BookOpen, bg: 'from-cyan-600 to-sky-600' },
    { to: '/blog', label: 'Blog', hindi: 'तैयारी टिप्स', icon: Newspaper, bg: 'from-slate-600 to-slate-700' },
];

const QuickAccessGrid = () => (
    <section className="max-w-6xl mx-auto px-3 md:px-4 -mt-4 md:-mt-6 relative z-10 mb-6 md:mb-10" aria-label="Quick access">
        <div className="grid grid-cols-4 gap-2 md:gap-4">
            {ITEMS.map(({ to, label, hindi, icon: Icon, bg, badge }) => (
                <Link
                    key={label}
                    to={to}
                    className={`group relative flex flex-col items-center justify-center text-center rounded-2xl md:rounded-3xl bg-gradient-to-br ${bg} text-white p-2.5 md:p-5 shadow-lg hover:shadow-2xl hover:-translate-y-1 active:scale-95 transition-all overflow-hidden`}
                >
                    {badge && (
                        <span className="absolute top-1 right-1 md:top-2 md:right-2 bg-yellow-400 text-black text-[6px] md:text-[8px] font-black px-1 md:px-1.5 py-0.5 rounded-full">
                            {badge}
                        </span>
                    )}
                    <div className="bg-white/15 p-1.5 md:p-3 rounded-xl md:rounded-2xl mb-1 md:mb-2 group-hover:scale-110 transition-transform">
                        <Icon size={18} className="md:w-7 md:h-7" />
                    </div>
                    <span className="font-black text-[9px] md:text-sm leading-tight">{label}</span>
                    <span className="text-[7px] md:text-[10px] font-bold text-white/70 leading-tight mt-0.5">{hindi}</span>
                </Link>
            ))}
        </div>
    </section>
);

export default QuickAccessGrid;
