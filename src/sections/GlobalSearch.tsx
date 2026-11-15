import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, ArrowRight, FileText, Briefcase, Zap, Newspaper, BookOpen, PlayCircle, GraduationCap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { loadSearchIndex, searchIndexItems, type SearchIndexItem, type SearchKind } from '@/lib/searchIndex';

// =========================================================
// 🔎 GLOBAL SEARCH (hero search box)
// ---------------------------------------------------------
// Purana tareeka: har khoj par Firestore ki 11 collections ka
// collectionGroup download — live par har search 0 results deti thi.
// Naya tareeka: /search-index.json (roz ke SEO run se banta hai) ek
// baar load hota hai, khoj browser me hi hoti hai — turant results.
// =========================================================

const KIND_LABEL: Record<SearchKind, string> = {
  job: 'Govt Job',
  update: 'Update',
  blog: 'Blog',
  test: 'Mock Test',
  material: 'Study Material',
  story: 'Web Story',
  course: 'Course',
};

const KIND_ICON: Record<SearchKind, typeof FileText> = {
  job: Briefcase,
  update: Zap,
  blog: Newspaper,
  test: FileText,
  material: BookOpen,
  story: PlayCircle,
  course: GraduationCap,
};

const GlobalSearch = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchIndexItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let alive = true;
    const delayDebounceFn = setTimeout(async () => {
      const term = searchTerm.trim();
      if (term.length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      setShowDropdown(true);
      const items = await loadSearchIndex();
      if (!alive) return;
      setResults(searchIndexItems(items, term, 12));
      setIsSearching(false);
    }, 250);

    return () => {
      alive = false;
      clearTimeout(delayDebounceFn);
    };
  }, [searchTerm]);

  const handleResultClick = (result: SearchIndexItem) => {
    setShowDropdown(false);
    setSearchTerm('');
    navigate(result.u);
  };

  const goToSearchPage = () => {
    const term = searchTerm.trim();
    if (term.length >= 2) {
      setShowDropdown(false);
      navigate(`/search?q=${encodeURIComponent(term)}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    goToSearchPage();
  };

  return (
    <div className="w-full relative" ref={searchRef} role="search">
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <label htmlFor="global-search-input" className="sr-only">Search courses, jobs, and materials</label>

        <input
          id="global-search-input"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => { if (searchTerm.trim().length >= 2) setShowDropdown(true); }}
          placeholder="Search courses, jobs, materials..."
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls="search-results-dropdown"
          aria-expanded={showDropdown}
          className="w-full bg-white/10 border-2 border-white/20 text-white placeholder-blue-200 px-6 py-4 md:py-5 rounded-full text-sm md:text-lg focus:outline-none focus:bg-white/20 focus:border-yellow-400 transition-all shadow-xl backdrop-blur-md font-bold"
        />

        <button
          type="submit"
          aria-label="Search"
          className="absolute right-3 bg-yellow-400 p-3 rounded-full text-blue-900 shadow-lg cursor-pointer hover:bg-yellow-300 transition-colors"
        >
          {isSearching ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <Search className="w-5 h-5 md:w-6 md:h-6" />}
        </button>
      </form>

      {showDropdown && (searchTerm.trim().length >= 2) && (
        <div
          id="search-results-dropdown"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-3 bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-slate-100 max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain touch-pan-y z-50"
        >
          {isSearching ? (
            <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-600" aria-hidden="true" />
              <p className="font-bold">Fast Searching...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {results.map((result) => {
                const Icon = KIND_ICON[result.k] || FileText;
                return (
                  <div
                    key={result.u}
                    role="option"
                    aria-selected="false"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleResultClick(result);
                    }}
                    className="p-4 hover:bg-blue-50 cursor-pointer flex items-center justify-between group transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg flex-shrink-0 bg-blue-100 text-blue-600" aria-hidden="true">
                        <Icon size={20} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 line-clamp-1 group-hover:text-blue-700 transition-colors">
                          {result.t}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {KIND_LABEL[result.k]}
                          </span>
                          {result.s && (
                            <span className="text-[10px] text-slate-400 line-clamp-1">
                              {result.s}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-600 transition-colors flex-shrink-0" aria-hidden="true" />
                  </div>
                );
              })}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  goToSearchPage();
                }}
                className="w-full p-3 text-center text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                Saare results dekho →
              </button>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500">
              <p className="font-bold">No results found for "{searchTerm}"</p>
              <p className="text-sm mt-1">Try a different keyword.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
