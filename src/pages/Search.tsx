import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, Loader2, Briefcase, Newspaper, Zap, FileText, BookOpen, PlayCircle, GraduationCap } from 'lucide-react';
import SEO from '../components/SEO';
import { loadSearchIndex, searchIndexItems, type SearchIndexItem, type SearchKind } from '../lib/searchIndex';

// =========================================================
// 🔎 /search page — /search-index.json se saari published
// cheezein (jobs, updates, blogs, mock tests, materials,
// stories, courses) khojti hai. Purani Firestore-wali seema
// (sirf taaza 100 jobs / 50 blogs / 50 updates) ab nahi hai.
// =========================================================

const KIND_META: Record<SearchKind, { label: string; icon: React.ReactNode; badge: string }> = {
  job: { label: 'Govt Job', icon: <Briefcase className="w-3.5 h-3.5" />, badge: 'bg-blue-100 text-blue-800' },
  update: { label: 'Update', icon: <Zap className="w-3.5 h-3.5" />, badge: 'bg-amber-100 text-amber-800' },
  blog: { label: 'Blog', icon: <Newspaper className="w-3.5 h-3.5" />, badge: 'bg-green-100 text-green-800' },
  test: { label: 'Mock Test', icon: <FileText className="w-3.5 h-3.5" />, badge: 'bg-purple-100 text-purple-800' },
  material: { label: 'Study Material', icon: <BookOpen className="w-3.5 h-3.5" />, badge: 'bg-rose-100 text-rose-800' },
  story: { label: 'Web Story', icon: <PlayCircle className="w-3.5 h-3.5" />, badge: 'bg-pink-100 text-pink-800' },
  course: { label: 'Course', icon: <GraduationCap className="w-3.5 h-3.5" />, badge: 'bg-indigo-100 text-indigo-800' },
};

const Search: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get('q') || '');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SearchIndexItem[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const loaded = await loadSearchIndex();
      if (!alive) return;
      setItems(loaded);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const q = (params.get('q') || '').trim();
  const hasQuery = q
    .toLowerCase()
    .split(/\s+/)
    .some((t) => t.trim().length >= 2);

  const results = useMemo(() => {
    if (!hasQuery) return [];
    return searchIndexItems(items, q, 60);
  }, [items, q, hasQuery]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(input.trim() ? { q: input.trim() } : {});
  };

  return (
    <div className="bg-[#F8FAFC] min-h-screen font-hindi antialiased">
      <SEO customTitle="Search StudyGyaan" noIndex={true} noFollow={true} />

      <div className="max-w-4xl mx-auto px-3 md:px-6 py-6 md:py-12">
        <h1 className="text-xl md:text-3xl font-black text-gray-900 mb-1">StudyGyaan Search</h1>
        <p className="text-sm md:text-base text-gray-500 mb-4">Jobs, updates, blogs, mock tests aur study material me khojo</p>

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
        ) : !hasQuery ? (
          <p className="text-gray-500 text-sm">Upar search box me kuch likho — jaise “railway”, “admit card”, “answer key”.</p>
        ) : results.length === 0 ? (
          <p className="text-gray-500 text-sm">“{q}” ke liye kuch nahi mila. Spelling badal ke try karo.</p>
        ) : (
          <div>
            <p className="text-xs md:text-sm text-gray-500 mb-3">{results.length} results</p>
            <ul className="space-y-2">
              {results.map((h) => {
                const meta = KIND_META[h.k];
                return (
                  <li key={h.u} className="bg-white rounded-xl border border-slate-100 p-3 hover:border-blue-200 transition">
                    <Link to={h.u} className="flex items-start gap-2">
                      <span className={`mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${meta.badge}`}>
                        {meta.icon}{meta.label}
                      </span>
                      <span>
                        <span className="block text-sm md:text-base font-bold text-gray-900 leading-snug">{h.t}</span>
                        {h.s && <span className="block text-xs text-gray-500 mt-0.5">{h.s}</span>}
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
