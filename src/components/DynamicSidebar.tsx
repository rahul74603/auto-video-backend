/**
 * DynamicSidebar v2 — 🔄 COMPACT + PAGE-AWARE + AUTO-ROTATING
 * ==================================================================
 * - Har PAGE pe ALAG links (URL-seeded shuffle — /blog pe alag, /job pe alag)
 * - Roz apne aap rotate hota hai (seed me din ka number)
 * - Naya content aate hi pool me aa jata hai (Firestore latest 12-20)
 * - Compact: 3 sections × 3 links, chhota padding — kam space
 * - Section-mix bhi route ke hisaab se: blog page pe blogs nahi repeat,
 *   test page pe tests nahi repeat, etc.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Briefcase, Zap, FileText, Newspaper, ArrowRight } from 'lucide-react';
import { checkIsExpired } from '@/utils/jobExpiry';

type Item = { id: string; title: string; slug: string; extra?: string };

type SidebarData = {
    jobs: Item[];
    fastTrack: Item[];
    tests: Item[];
    blogs: Item[];
};

/* ---------------- Module-level cache (5 min) ---------------- */
let cache: { data: SidebarData; at: number } | null = null;
let inflight: Promise<SidebarData> | null = null;
const CACHE_MS = 5 * 60 * 1000;

const asStr = (v: unknown) => (typeof v === 'string' ? v : '');

type RawDoc = { id: string } & Record<string, unknown>;

async function fetchSidebarData(): Promise<SidebarData> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
    if (inflight) return inflight;

    inflight = (async () => {
        const grab = async (coll: string, n: number): Promise<RawDoc[]> => {
            try {
                const snap = await getDocs(query(collection(db, coll), orderBy('createdAt', 'desc'), limit(n)));
                return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RawDoc));
            } catch {
                return [];
            }
        };

        // Bade pools — inme se har page apna alag random set uthata hai
        const [jobsRaw, ftRaw, testsRaw, blogsRaw] = await Promise.all([
            grab('jobs', 20),
            grab('fast_track', 12),
            grab('mock_tests', 12),
            grab('blogs', 12),
        ]);

        const data: SidebarData = {
            jobs: jobsRaw
                .filter((j) => {
                    const type = asStr(j.type).toUpperCase();
                    if (type && type !== 'JOB') return false;
                    if (j.isLive === false) return false;
                    const status = asStr(j.status).toLowerCase();
                    if (['draft', 'pending', 'archived', 'deleted'].includes(status)) return false;
                    if (!asStr(j.title)) return false;
                    return !checkIsExpired(asStr(j.lastDate)); // sirf ACTIVE jobs
                })
                .map((j) => ({ id: j.id, title: asStr(j.title), slug: asStr(j.slug) || j.id, extra: asStr(j.lastDate) })),
            fastTrack: ftRaw
                .filter((f) => asStr(f.status).toLowerCase() === 'published' && asStr(f.title))
                .map((f) => ({ id: f.id, title: asStr(f.title), slug: asStr(f.slug) || f.id, extra: asStr(f.category) })),
            tests: testsRaw
                .filter((t) => !['draft', 'archived', 'deleted'].includes(asStr(t.status).toLowerCase()) && asStr(t.title))
                .map((t) => ({ id: t.id, title: asStr(t.title), slug: asStr(t.slug) || t.id, extra: asStr(t.subject) })),
            blogs: blogsRaw
                .filter((b) => !['draft', 'pending', 'archived', 'deleted'].includes(asStr(b.status).toLowerCase()) && asStr(b.title))
                .map((b) => ({ id: b.id, title: asStr(b.title), slug: asStr(b.slug) || b.id })),
        };
        cache = { data, at: Date.now() };
        inflight = null;
        return data;
    })();

    return inflight;
}

/* ---------------- Seeded shuffle (page + din ke hisaab se) ---------------- */
function seedFromString(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed: number) {
    let a = seed;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seededPick<T>(arr: T[], n: number, rnd: () => number): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
}

/* ---------------- Route ke hisaab se section mix ---------------- */
type SectionKey = 'jobs' | 'fastTrack' | 'tests' | 'blogs';

function sectionsForPath(path: string): SectionKey[] {
    if (path.startsWith('/blog')) return ['jobs', 'tests', 'fastTrack'];          // blog pe blogs repeat nahi
    if (path.startsWith('/test') || path.startsWith('/mock')) return ['jobs', 'fastTrack', 'blogs']; // test pe tests nahi
    if (path.startsWith('/job') || path.startsWith('/govt-jobs') || path.startsWith('/update') || path.startsWith('/jobs'))
        return ['fastTrack', 'tests', 'blogs'];                                    // job pages pe jobs nahi
    if (path.startsWith('/free-study-material') || path.startsWith('/material') || path.startsWith('/pdf')
        || path.startsWith('/e-books') || path.startsWith('/ebook') || path.startsWith('/course') || path.startsWith('/premium-notes'))
        return ['jobs', 'tests', 'blogs'];
    return ['jobs', 'fastTrack', 'tests'];                                         // default mix
}

const SECTION_META: Record<SectionKey, { icon: React.ReactNode; title: string; accent: string; hrefBase: string; moreLabel: string; moreHref: string }> = {
    jobs:      { icon: <Briefcase size={13} />, title: 'Govt Jobs',   accent: 'text-blue-700',    hrefBase: '/job',    moreLabel: 'Sabhi Jobs',    moreHref: '/govt-jobs' },
    fastTrack: { icon: <Zap size={13} />,       title: 'Fast Updates', accent: 'text-amber-600',   hrefBase: '/update', moreLabel: 'Sabhi Updates', moreHref: '/govt-jobs' },
    tests:     { icon: <FileText size={13} />,  title: 'Mock Tests',  accent: 'text-emerald-600', hrefBase: '/test',   moreLabel: 'Sabhi Tests',   moreHref: '/test' },
    blogs:     { icon: <Newspaper size={13} />, title: 'Blogs',       accent: 'text-purple-600',  hrefBase: '/blog',   moreLabel: 'Sabhi Blogs',   moreHref: '/blog' },
};

/* ---------------- Compact section card ---------------- */
const Section = ({ k, items }: { k: SectionKey; items: Item[] }) => {
    const meta = SECTION_META[k];
    if (!items.length) return null;
    return (
        <section className="bg-white p-3 rounded-xl shadow-sm border border-slate-100">
            <h2 className={`text-[10px] md:text-[11px] font-black mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5 uppercase tracking-wide ${meta.accent}`}>
                <span className="flex items-center gap-1.5">{meta.icon} {meta.title}</span>
                <Link to={meta.moreHref} className="text-[9px] text-slate-400 hover:text-blue-600 flex items-center gap-0.5 normal-case font-bold">
                    {meta.moreLabel} <ArrowRight size={10} />
                </Link>
            </h2>
            <ul className="space-y-1.5" role="list">
                {items.map((item) => (
                    <li key={item.id}>
                        <Link to={`${meta.hrefBase}/${item.slug}`} className="group block">
                            <p className="text-[11px] md:text-[12px] font-bold text-slate-700 group-hover:text-blue-600 line-clamp-2 leading-snug transition-colors">
                                {item.title}
                            </p>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
};

/* ---------------- Main component ---------------- */
const DynamicSidebar = () => {
    const [data, setData] = useState<SidebarData | null>(cache?.data || null);
    const { pathname } = useLocation();

    useEffect(() => {
        let cancelled = false;
        fetchSidebarData()
            .then((d) => { if (!cancelled) setData(d); })
            .catch(() => { /* silent — sidebar optional hai */ });
        return () => { cancelled = true; };
    }, []);

    if (!data) return null;

    // Seed = page URL + din ka number → har page pe alag, roz rotate
    const dayNo = Math.floor(Date.now() / 86400000);
    const rnd = mulberry32(seedFromString(`${pathname}::${dayNo}`));
    const sections = sectionsForPath(pathname);

    return (
        <div className="space-y-3">
            {/* 🛠️ Sarkari Tools — asli tools site (studygyaan.in/tools/) */}
            <a
                href="https://studygyaan.in/tools/"
                className="flex items-center justify-between gap-2 bg-gradient-to-r from-fuchsia-600 to-indigo-700 rounded-xl px-3 py-2.5 text-white shadow hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
                <span className="font-black text-[11px] md:text-xs flex items-center gap-1.5">
                    🛠️ Sarkari Tools
                    <span className="bg-yellow-400 text-slate-900 text-[8px] px-1.5 py-0.5 rounded-full font-black">FREE</span>
                </span>
                <ArrowRight size={13} className="shrink-0" />
            </a>
            {sections.map((k) => (
                <Section key={k} k={k} items={seededPick(data[k], 3, rnd)} />
            ))}
        </div>
    );
};

export default DynamicSidebar;
