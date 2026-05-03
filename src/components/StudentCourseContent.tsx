import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { 
  Briefcase, Search, MapPin, Calendar, ExternalLink 
} from 'lucide-react';
import { motion } from 'framer-motion';

// 👇 1. ShareButtons Import
import ShareButtons from './ShareButtons'; 

interface ContentItem {
  id: string;
  type: string;
  title: string;
  category?: string;
  applyLink: string;
  organization?: string;
  location?: string;
  lastDate?: string;
  createdAt: string;
}

const StudentCourseContent = () => {
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const q = query(
            collection(db, "jobs"), 
            where("type", "!=", "AFFILIATE"),
            orderBy("type"),
            orderBy("createdAt", "desc")
        );
        const s = await getDocs(q);
        const data = s.docs.map(d => ({ id: d.id, ...d.data() } as ContentItem));
        setContent(data);
      } catch (err) {
        console.log("Error fetching content", err);
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, []);

  const filteredContent = content.filter(item => {
    const matchesTab = activeTab === 'ALL' || item.type === activeTab;
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  if (loading) return <div className="p-10 text-center font-bold text-gray-500">Loading Updates...</div>;

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6">
      
      {/* Search & Tabs */}
      <div className="mb-8 space-y-4">
        <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={20}/>
            <input 
                type="text" 
                placeholder="Search jobs, admit cards, results..." 
                className="w-full pl-10 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {['ALL', 'JOB', 'ADMIT_CARD', 'RESULT', 'ANSWER_KEY', 'SYLLABUS'].map(tab => (
                <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                        activeTab === tab ? 'bg-blue-600 text-white shadow-md' : 'bg-white border text-gray-600 hover:bg-gray-50'
                    }`}
                >
                    {tab.replace('_', ' ')}
                </button>
            ))}
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredContent.map((item, index) => (
            <motion.div 
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-lg transition-all flex flex-col h-full group"
            >
                {/* Header Badge */}
                <div className="flex justify-between items-start mb-3">
                    <span className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        item.type === 'JOB' ? 'bg-blue-100 text-blue-700' :
                        item.type === 'RESULT' ? 'bg-green-100 text-green-700' :
                        'bg-orange-100 text-orange-700'
                    }`}>
                        {item.type.replace('_', ' ')}
                    </span>
                    {item.lastDate && (
                        <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                            <Calendar size={10}/> Last: {item.lastDate}
                        </span>
                    )}
                </div>

                {/* ✅ UPDATE: Title ab clickable hai aur Website Page par le jayega */}
                <a href={`/job/${item.id}`} className="block hover:underline decoration-blue-600 decoration-2 underline-offset-4">
                    <h3 className="font-bold text-gray-800 text-lg mb-2 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
                        {item.title}
                    </h3>
                </a>
                
                {item.type === 'JOB' && (
                    <div className="text-xs text-gray-500 space-y-1 mb-4 flex-1">
                        {item.organization && <p className="flex items-center gap-1"><Briefcase size={12}/> {item.organization}</p>}
                        {item.location && <p className="flex items-center gap-1"><MapPin size={12}/> {item.location}</p>}
                    </div>
                )}

                {/* Action Button */}
                <a 
                    href={item.applyLink} 
                    target="_blank" 
                    rel="noreferrer"
                    className="mt-auto w-full py-3 bg-blue-50 text-blue-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-600 hover:text-white transition-all mb-2"
                >
                    {item.type === 'JOB' ? 'Apply Now' : 'View / Download'} <ExternalLink size={16}/>
                </a>

                {/* ✅ DYNAMIC SHARING: Link apki website ka jayega */}
                <ShareButtons 
                    title={item.title} 
                    url={`${window.location.origin}/job/${item.id}`} 
                />

            </motion.div>
        ))}
      </div>

      {filteredContent.length === 0 && (
        <div className="text-center py-20 text-gray-400">
            No updates found for this category.
        </div>
      )}
    </div>
  );
};

export default StudentCourseContent;