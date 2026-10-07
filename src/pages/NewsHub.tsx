import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/firebase/config';
import SEO from '@/components/SEO';
import { Newspaper } from 'lucide-react';

/**
 * NewsHub — /news (PHASE-2 item 2)
 * ===================================================
 * Existing collections (jobs / fast_track / blogs) ka fresh, indexable content
 * ek public "Latest News" hub pe — koi nayi collection NAHI.
 * Backend automation taxonomy ai_backend/news_classifier.js me hai; yahan ke
 * chips sirf display-filter hain (regexes intentionally mirror the backend).
 */

type Kind = 'job' | 'update' | 'blog';

interface NewsItem {
    id: string;
    kind: Kind;
    title: string;
    path: string;
    ts: number;
}

const BLOCKED_STATUS = ['draft', 'pending', 'rejected', 'private', 'archived', 'deleted', 'trash'];

const toTs = (raw: unknown): number => {
    if (!raw) return 0;
    const withToDate = raw as { toDate?: () => Date };
    const d = typeof withToDate.toDate === 'function' ? withToDate.toDate() : new Date(String(raw));
    return isNaN(d.getTime()) ? 0 : d.getTime();
};

function mapRows(rows: Array<Record<string, unknown> & { id: string }>, kind: Kind, route: string): NewsItem[] {
    const out: NewsItem[] = [];
    for (const r of rows) {
        const status = String(r.status || '').trim().toLowerCase();
        if (BLOCKED_STATUS.includes(status)) continue;
        if (r.noIndex === true || r.deleted === true || r.isDeleted === true) continue;
        const title = String(r.title || '').trim();
        if (title.length < 5) continue;
        out.push({
            id: `${kind}-${r.id}`,
            kind,
            title,
            path: `/${route}/${String(r.slug || r.id)}`,
            ts: toTs(r.createdAt)
        });
    }
    return out;
}

let newsCache: { items: NewsItem[]; at: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function fetchNewsOnce(): Promise<NewsItem[]> {
    if (newsCache && Date.now() - newsCache.at < CACHE_MS) return newsCache.items;
    const [jobs, updates, blogs] = await Promise.all([
        getDocs(query(collection(db, 'jobs'), orderBy('createdAt', 'desc'), limit(40))),
        getDocs(query(collection(db, 'fast_track'), orderBy('createdAt', 'desc'), limit(40))),
        getDocs(query(collection(db, 'blogs'), orderBy('createdAt', 'desc'), limit(40)))
    ]);
    const rows = (s: typeof jobs) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
    const merged = [
        ...mapRows(rows(jobs), 'job', 'job'),
        ...mapRows(rows(updates), 'update', 'update'),
        ...mapRows(rows(blogs), 'blog', 'blog')
    ];
    // 🧹 Duplicate-content shield (2026-10-07): same title sirf EK baar —
    // jobs vs fast_track vs blogs cross-duplication (user rule: Google
    // duplicate content na maane). Pehli (latest) entry jeet-ti hai.
    const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim();
    const seenTitles = new Set<string>();
    const items = merged
        .filter((i) => {
            const k = normTitle(i.title);
            if (seenTitles.has(k)) return false;
            seenTitles.add(k);
            return true;
        })
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 60);
    newsCache = { items, at: Date.now() };
    return items;
}

const FILTERS: Array<{ id: string; label: string; test: (i: NewsItem) => boolean }> = [
    { id: 'all', label: 'Latest', test: () => true },
    { id: 'jobs', label: 'Jobs', test: (i) => i.kind === 'job' },
    { id: 'results', label: 'Results', test: (i) => /results?|parinaam/i.test(i.title) },
    { id: 'admit', label: 'Admit Card', test: (i) => /admit\s*card|hall\s*ticket/i.test(i.title) },
    { id: 'updates', label: 'Fast Track', test: (i) => i.kind === 'update' },
    { id: 'blog', label: 'Blog', test: (i) => i.kind === 'blog' }
];

const KIND_BADGE: Record<Kind, string> = {
    job: 'bg-blue-100 text-blue-700',
    update: 'bg-amber-100 text-amber-700',
    blog: 'bg-purple-100 text-purple-700'
};
const KIND_LABEL: Record<Kind, string> = { job: 'Job', update: 'Update', blog: 'Blog' };

const NewsHub = () => {
    const [items, setItems] = useState<NewsItem[]>(newsCache?.items || []);
    const [loading, setLoading] = useState(!newsCache);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        let cancelled = false;
        void fetchNewsOnce()
            .then((rows) => {
                if (!cancelled) setItems(rows);
            })
            .catch(() => {
                /* silent — empty hub better than broken hub */
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const visible = useMemo(() => {
        const f = FILTERS.find((x) => x.id === filter) || FILTERS[0];
        return items.filter(f.test);
    }, [items, filter]);

    return (
        <div className="pt-14 md:pt-16 pb-20 bg-[#F8FAFC] min-h-screen font-hindi antialiased">
            <SEO
                customTitle={`Latest News & Sarkari Updates ${new Date().getFullYear()} | StudyGyaan`}
                customDescription="SSC, Railway, Bank, Police aur sabhi sarkari exams ke latest updates — jobs, results, admit card, fast track updates aur blogs, sab ek jagah."
                customUrl="https://studygyaan.in/news"
                ogType="website"
            />
            <div className="max-w-5xl mx-auto px-4">
                <h1 className="text-2xl font-black flex items-center gap-2">
                    <Newspaper className="text-blue-600" size={26} /> Latest News & Updates
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Jobs · Results · Admit Card · Fast Track · Blogs — sabse fresh updates ek jagah.
                </p>

                <div className="flex gap-2 overflow-x-auto no-scrollbar mt-4">
                    {FILTERS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setFilter(f.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-black whitespace-nowrap border ${
                                filter === f.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <div className="mt-4 space-y-2">
                    {loading && <p className="text-sm text-gray-500">Loading…</p>}
                    {!loading && visible.length === 0 && (
                        <p className="text-sm text-gray-500">Is filter me abhi koi update nahi hai.</p>
                    )}
                    {!loading &&
                        visible.map((i) => (
                            <Link
                                key={i.id}
                                to={i.path}
                                className="flex items-center gap-3 bg-white border rounded-xl px-4 py-3 hover:shadow-md transition-shadow"
                            >
                                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${KIND_BADGE[i.kind]}`}>
                                    {KIND_LABEL[i.kind]}
                                </span>
                                <span className="flex-1 text-sm font-bold text-slate-800">{i.title}</span>
                                <span className="text-[11px] text-gray-400 whitespace-nowrap">
                                    {new Date(i.ts).toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' })}
                                </span>
                            </Link>
                        ))}
                </div>
            </div>
        </div>
    );
};

export default NewsHub;
