// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, ArrowRight, FileText, Crown } from 'lucide-react';
import { db } from '@/firebase/config';
import { collectionGroup, getDocs, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

const GlobalSearch = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim().length > 2) {
        performSearch(searchTerm);
      } else {
        setResults([]);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const performSearch = async (term) => {
    setIsSearching(true);
    setShowDropdown(true);
    try {
      const lowerTerm = term.toLowerCase();
      const searchResults = [];

      const collectionsToSearch = [
        'jobs', 
        'study_materials', 
        'fast_track', 
        'content', 
        'blogs', 
        'mock_tests', 
        'posts', 
        'articles',
        'courses',
        'ebooks',
        'premium_notes' 
      ];
      
      const fetchPromises = collectionsToSearch.map(colName => getDocs(query(collectionGroup(db, colName))));
      const snapshots = await Promise.all(fetchPromises);

      snapshots.forEach((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const colOrigin = doc.ref.parent.id;

          if (data.secret === true || data.secret === "true" || data.role === 'admin') {
            return; 
          }

          let derivedCourseId = null;
          const pathSegments = doc.ref.path.split('/');
          const coursesIndex = pathSegments.indexOf('courses');
          
          if (coursesIndex !== -1 && pathSegments.length > coursesIndex + 1) {
            derivedCourseId = pathSegments[coursesIndex + 1];
          }
          const finalCourseId = derivedCourseId || data.courseId || null;

          const isPremiumItem = 
            data.isPremium === true || 
            data.isPremium === "true" || 
            String(data.type).toLowerCase().includes('premium') ||
            String(data.category).toLowerCase().includes('premium') ||
            (data.price && Number(data.price) > 0) ||
            (data.mrpPrice && Number(data.mrpPrice) > 0) ||
            !!data.buyLink || 
            !!data.paymentLink ||
            !!data.cosmofeedLink || 
            colOrigin === 'courses' || 
            colOrigin === 'premium_notes' ||
            colOrigin === 'ebooks';

          const isPdf = String(data.type).toLowerCase() === 'pdf' || 
                        (data.downloadUrl && String(data.downloadUrl).toLowerCase().includes('.pdf')) ||
                        (data.link && String(data.link).toLowerCase().includes('.pdf'));
                        
          if (isPdf && !isPremiumItem) {
            return; 
          }

          const titleMatch = data.title && String(data.title).toLowerCase().includes(lowerTerm);
          const descMatch = data.description && String(data.description).toLowerCase().includes(lowerTerm);
          
          if (titleMatch || descMatch) {
            if (!searchResults.some(item => item.id === doc.id)) {
              searchResults.push({ 
                id: doc.id, 
                collectionOrigin: colOrigin, 
                isPremiumFlag: isPremiumItem, 
                resolvedCourseId: finalCourseId, 
                ...data 
              });
            }
          }
        });
      });

      setResults(searchResults.slice(0, 12)); 
    } catch (error) {
      console.error("Search Error:", error);
    }
    setIsSearching(false);
  };

  const handleResultClick = (result) => {
    setShowDropdown(false);
    setSearchTerm('');
    
    if (result.resolvedCourseId && result.collectionOrigin !== 'courses') {
      navigate(`/course/${result.resolvedCourseId}`);
      return;
    }

    if (result.collectionOrigin === 'courses') {
      navigate(`/course/${result.id}`);
      return;
    }

    if (result.isPremiumFlag || result.collectionOrigin === 'ebooks' || result.collectionOrigin === 'premium_notes') {
      navigate(`/ebook/${result.id}`);
      return;
    }

    const routeMap = {
      jobs: '/job',
      study_materials: '/material',
      fast_track: '/update',
      blogs: '/blog',
      posts: '/blog',            
      articles: '/blog',         
      mock_tests: '/test',
      content: '/pdf'
    };

    const basePath = routeMap[result.collectionOrigin] || '/pdf'; 
    navigate(`${basePath}/${result.id}`);
  };

  return (
    <div className="w-full max-w-3xl mx-auto relative z-[60] mb-8" ref={searchRef} role="search">
      <div className="relative flex items-center">
        <label htmlFor="global-search-input" className="sr-only">Search courses, jobs, and materials</label>
        
        {/* ✅ ACCESSIBILITY FIX: Added role="combobox" and aria-haspopup */}
        <input
          id="global-search-input"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => { if (searchTerm.trim().length > 2) setShowDropdown(true); }}
          placeholder="Search courses, jobs, materials..."
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls="search-results-dropdown"
          aria-expanded={showDropdown}
          className="w-full bg-white/10 border-2 border-white/20 text-white placeholder-blue-200 px-6 py-4 md:py-5 rounded-full text-sm md:text-lg focus:outline-none focus:bg-white/20 focus:border-yellow-400 transition-all shadow-xl backdrop-blur-md font-bold"
        />
        
        <div className="absolute right-3 bg-yellow-400 p-3 rounded-full text-blue-900 shadow-lg cursor-pointer hover:bg-yellow-300 transition-colors" aria-hidden="true">
          {isSearching ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <Search className="w-5 h-5 md:w-6 md:h-6" />}
        </div>
      </div>

      {showDropdown && (searchTerm.trim().length > 2) && (
        <div 
          id="search-results-dropdown"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-3 bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-slate-100 max-h-[60vh] overflow-y-auto"
        >
          {isSearching ? (
            <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-600" aria-hidden="true" />
              <p className="font-bold">Fast Searching...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {results.map((result) => (
                <div 
                  key={result.id} 
                  role="option"
                  aria-selected="false"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleResultClick(result);
                  }}
                  className="p-4 hover:bg-blue-50 cursor-pointer flex items-center justify-between group transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${result.isPremiumFlag ? 'bg-yellow-100 text-yellow-600' : 'bg-blue-100 text-blue-600'}`} aria-hidden="true">
                      {result.isPremiumFlag ? <Crown size={20} /> : <FileText size={20} />}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800 line-clamp-1 group-hover:text-blue-700 transition-colors">
                        {result.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {result.collectionOrigin ? result.collectionOrigin.replace('_', ' ') : 'General'}
                        </span>
                        {result.isPremiumFlag && (
                          <span className="text-[9px] font-black bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded uppercase tracking-widest">
                            Premium
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-600 transition-colors flex-shrink-0" aria-hidden="true" />
                </div>
              ))}
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