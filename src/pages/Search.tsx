import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Search as SearchIcon, Loader2, Briefcase, Newspaper, Zap } from 'lucide-react';
import SEO from '../components/SEO';
import { db } from '../firebase/config';

interface SearchHit {
  id: string;
  kind: 'job' | 'blog' | 'update';
  title: string;
  subtitle: string;
  href: string;
}

const KIND_META: Record<SearchHit['kind'], { label: string; icon: React.ReactNode; badge: string }> = {
  job: { label: 'Govt Job', icon: <Briefcase className="w-3.5 h-3.5" />, badge: 'bg-blue-100 text-blue-800' },
  blog: { label: 'Blog', icon: <Newspaper className="w-3.5 h-3.5" />, badge: 'bg-green-100 text-green-800' },
  update: { label: 'Update', icon: <Zap className="w-3.5 h-3.5" />, badge: 'bg-amber-100 text-amber-800' },
};

function matches(text: string, tokens: string[]): boolean {
  const hay = text.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

/**
 * P1-7: Real /search route (noindex) — recent published jobs/blogs/updates
 * Firestore se ek baar load karke in-memory filter. Koi composite index nahi chahiye.
 */
const Search: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get('q') || '');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SearchHit[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [jobsSnap, blogsSnap, updatesSnap] = await Promise.all([
          getDocs(query(collection(db, 'jobs'), orderBy('createdAt', 'desc'), limit(100))),
          getDocs(query(collection(db, 'blogs'), orderBy('createdAt', 'desc'), limit(50))),
          getDocs(query(collection(db, 'fast_track'), orderBy('createdAt', 'desc'), limit(50))),
        ]);
        if (!alive) return;
        const hits: SearchHit[] = [];
        jobsSnap.forEach((d) => {
          const v = d.data() as Record<string, unknown>;
          if (String(v.status || 'published').toLowerCase() !== 'published') return;
          const title = String(v.title || '');
          if (title.trim().length < 3) return;
          hits.push({
            id: `job-${d.id}`,
            kind: 'job',
            title,
            subtitle: [v.organization, v.lastDate ? `Last Date: ${v.lastDate}` : ''].filter(Boolean).join(' · '),
            href: `/job/${String(v.slug || d.id)}`,
          });
        });
        blogsSnap.forEach((d) => {
          const v = d.data() as Record<string, unknown>;
          if (String(v.status || 'published').toLowerCase() !== 'published') return;
          const title = String(v.title || v.post_name || '');
          if (title.trim().length < 3) return;
          hits.push({
            id: `blog-${d.id}`,
            kind: 'blog',
            title,
            subtitle: String(v.category || 'Blog'),
            href: `/blog/${String(v.slug || d.id)}`,
          });
        });
        updatesSnap.forEach((d) => {
          const v = d.data() as Record<string, unknown>;
          if (String(v.status || 'published').toLowerCase() !== 'published') return;
          const title = String(v.title || '');
          if (title.trim().length < 3) return;
          hits.push({
            id: `update-${d.id}`,
            kind: 'update',
            title,
            subtitle: String(v.category || 'Fast Track Update'),
            href: `/update/${String(v.slug || d.id)}`,
          });
        });
        setItems(hits);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const q = (params.get('q') || '').trim();
  const tokens = useMemo(() => q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2), [q]);

  const results = useMemo(() => {
    if (!tokens.length) return [];
    return items
      .filter((h) => matches(`${h.title} ${h.subtitle}`, tokens))
      .slice(0, 60);
  }, [items, tokens]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(input.trim() ? { q: input.trim() } : {});
  };

  return (
    <div className="bg-[#F8FAFC] min-h-screen font-hindi antialiased">
      <SEO customTitle="Search StudyGyaan" noIndex={true} noFollow={true} />

      <div className="max-w-4xl mx-auto px-3 md:px-6 py-6 md:py-12">
        <h1 className="text-xl md:text-3xl font-black text-gray-900 mb-1">StudyGyaan Search</h1>
        <p className="text-sm md:text-base text-gray-500 mb-4">Jobs, blogs aur fast-track updates me khojo</p>

        <form onSubmit={submit} className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. railway, SSC GD, police bharti…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="px-4 md:px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm md:text-base font-bold hover:bg-blue-700"
          >
            Search
          </button>
        </form>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Index load ho raha hai…
          </div>
        ) : !tokens.length ? (
          <p className="text-gray-500 text-sm">Upar search box me kuch likho — jaise “railway”, “admit card”, “answer key”.</p>
        ) : results.length === 0 ? (
          <p className="text-gray-500 text-sm">“{q}” ke liye kuch nahi mila. Spelling badal ke try karo.</p>
        ) : (
          <div>
            <p className="text-xs md:text-sm text-gray-500 mb-3">{results.length} results</p>
            <ul className="space-y-2">
              {results.map((h) => {
                const meta = KIND_META[h.kind];
                return (
                  <li key={h.id} className="bg-white rounded-xl border border-slate-100 p-3 hover:border-blue-200 transition">
                    <Link to={h.href} className="flex items-start gap-2">
                      <span className={`mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${meta.badge}`}>
                        {meta.icon}{meta.label}
                      </span>
                      <span>
                        <span className="block text-sm md:text-base font-bold text-gray-900 leading-snug">{h.title}</span>
                        {h.subtitle && <span className="block text-xs text-gray-500 mt-0.5">{h.subtitle}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;
