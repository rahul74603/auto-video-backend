/**
 * MobileBottomNav — 📱 App-style bottom navigation (SIRF mobile)
 * ===============================================================
 * Mobile UX ka sabse bada fix: hamburger me chhupe links ki jagah
 * hamesha-visible app-jaisa bottom bar. Desktop pe nahi dikhta.
 */
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Home, Briefcase, CalendarDays, FileText, Newspaper } from 'lucide-react';

const NAV_ITEMS = [
    { path: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
    { path: '/govt-jobs', label: 'Jobs', icon: Briefcase, match: (p: string) => p.startsWith('/govt-jobs') || p.startsWith('/job') },
    { path: '/exam-calendar', label: 'Calendar', icon: CalendarDays, match: (p: string) => p.startsWith('/exam-calendar') },
    { path: '/test', label: 'Tests', icon: FileText, match: (p: string) => p.startsWith('/test') || p.startsWith('/mock-tests') },
    { path: '/blog', label: 'Blog', icon: Newspaper, match: (p: string) => p.startsWith('/blog') || p.startsWith('/update') || p.startsWith('/web-stories') },
];

// In routes pe bottom nav NAHI (admin/test-play me distraction nahi chahiye)
const HIDDEN_PREFIXES = ['/secret-admin', '/admin', '/write-blog-secret', '/admin-stories-secret', '/manual-payment'];

const MobileBottomNav = () => {
    const { pathname } = useLocation();
    if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

    // 🛡️ Portal → document.body: kisi parent ke transform/filter se
    // `fixed` positioning nahi tootegi (pehle nav TOP pe chipak gaya tha!)
    return createPortal(
        <nav
            className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            aria-label="Mobile navigation"
        >
            <div className="grid grid-cols-5">
                {NAV_ITEMS.map(({ path, label, icon: Icon, match }) => {
                    const active = match(pathname);
                    return (
                        <Link
                            key={path}
                            to={path}
                            className={`flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                                active ? 'text-blue-600' : 'text-slate-400 active:text-blue-500'
                            }`}
                        >
                            <div className={`p-1 rounded-xl transition-all ${active ? 'bg-blue-50 scale-110' : ''}`}>
                                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                            </div>
                            <span className={`text-[9px] tracking-wide ${active ? 'font-black' : 'font-bold'}`}>{label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>,
        document.body
    );
};

export default MobileBottomNav;
