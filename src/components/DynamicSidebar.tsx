/**
 * DynamicSidebar — 🔄 AUTO-UPDATING sidebar (manual links ki jagah)
 * ==================================================================
 * Manual sidebar (admin-managed links) hata diya gaya — ab har page ke
 * sidebar me site ka FRESH content khud dikhta hai:
 *   💼 Latest Govt Jobs (active only)  ⚡ Fast Track Updates
 *   📝 Mock Tests                      📰 Blog Posts
 *
 * - Ek hi fetch, module-level cache (page navigation pe re-fetch nahi)
 * - Expired jobs skip hoti hain
 * - Internal links = SEO + engagement dono
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

        const [jobsRaw, ftRaw, testsRaw, blogsRaw] = await Promise.all([
            grab('jobs', 15),
            grab('fast_track', 8),
            grab('mock_tests', 8),
            grab('blogs', 8),
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
                .slice(0, 5)
                .map((j) => ({ id: j.id, title: asStr(j.title), slug: asStr(j.slug) || j.id, extra: asStr(j.lastDate) })),
            fastTrack: ftRaw
                .filter((f) => asStr(f.status).toLowerCase() === 'published' && asStr(f.title))
                .slice(0, 4)
                .map((f) => ({ id: f.id, title: asStr(f.title), slug: asStr(f.slug) || f.id, extra: asStr(f.category) })),
            tests: testsRaw
                .filter((t) => !['draft', 'archived', 'deleted'].includes(asStr(t.status).toLowerCase()) && asStr(t.title))
                .slice(0, 4)
                .map((t) => ({ id: t.id, title: asStr(t.title), slug: asStr(t.slug) || t.id, extra: asStr(t.subject) })),
            blogs: blogsRaw
                .filter((b) => !['draft', 'pending', 'archived', 'deleted'].includes(asStr(b.status).toLowerCase()) && asStr(b.title))
                .slice(0, 4)
                .map((b) => ({ id: b.id, title: asStr(b.title), slug: asStr(b.slug) || b.id })),
        };
        cache = { data, at: Date.now() };
        inflight = null;
        return data;
    })();

    return inflight;
}

/* ---------------- Section card ---------------- */
const Section = ({
    icon, title, accent, items, hrefBase, moreLabel, moreHref,
}: {
    icon: React.ReactNode; title: string; accent: string;
    items: Item[]; hrefBase: string; moreLabel: string; moreHref: string;
}) => {
    if (!items.length) return null;
    return (
        <section className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
            <h2 className={`text-xs md:text-sm font-black mb-3 flex items-center gap-2 border-b border-slate-100 pb-2.5 uppercase tracking-wide ${accent}`}>
                {icon} {title}
            </h2>
            <ul className="space-y-2.5" role="list">
                {items.map((item) => (
                    <li key={item.id}>
                        <Link to={`${hrefBase}/${item.slug}`} className="group block">
                            <p className="text-[11px] md:text-[13px] font-bold text-slate-700 group-hover:text-blue-600 line-clamp-2 leading-snug transition-colors">
                                {item.title}
                            </p>
                            {item.extra ? (
                                <p className="text-[9px] md:text-[10px] font-bold text-slate-400 mt-0.5">{item.extra}</p>
                            ) : null}
                            <div className="h-[2px] w-0 group-hover:w-full bg-blue-100 transition-all mt-1.5" />
                        </Link>
                    </li>
                ))}
            </ul>
            <Link
                to={moreHref}
                className="mt-3 flex items-center justify-center gap-1 text-[10px] md:text-[11px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-wider bg-blue-50 hover:bg-blue-100 rounded-xl py-2 transition-all"
            >
                {moreLabel} <ArrowRight size={12} />
            </Link>
        </section>
    );
};

/* ---------------- Main component ---------------- */
const DynamicSidebar = () => {
    const [data, setData] = useState<SidebarData | null>(cache?.data || null);

    useEffect(() => {
        let cancelled = false;
        fetchSidebarData()
            .then((d) => { if (!cancelled) setData(d); })
            .catch(() => { /* silent — sidebar optional hai */ });
        return () => { cancelled = true; };
    }, []);

    if (!data) return null;

    return (
        <div className="space-y-4 md:space-y-5">
            <Section
                icon={<Briefcase size={15} />} title="Latest Govt Jobs 💼" accent="text-blue-700"
                items={data.jobs} hrefBase="/job" moreLabel="Sabhi Jobs Dekhein" moreHref="/govt-jobs"
            />
            <Section
                icon={<Zap size={15} />} title="Fast Track Updates ⚡" accent="text-amber-600"
                items={data.fastTrack} hrefBase="/update" moreLabel="Sabhi Updates" moreHref="/govt-jobs"
            />
            <Section
                icon={<FileText size={15} />} title="Free Mock Tests 📝" accent="text-emerald-600"
                items={data.tests} hrefBase="/test" moreLabel="Sabhi Tests" moreHref="/test"
            />
            <Section
                icon={<Newspaper size={15} />} title="Latest Blogs 📰" accent="text-purple-600"
                items={data.blogs} hrefBase="/blog" moreLabel="Sabhi Blogs" moreHref="/blog"
            />
        </div>
    );
};

export default DynamicSidebar;
