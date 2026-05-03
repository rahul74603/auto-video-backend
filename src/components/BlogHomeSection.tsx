// @ts-nocheck
import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, limit } from 'firebase/firestore'; 
import { useNavigate, Link } from 'react-router-dom';
import { Calendar, ChevronRight, Flame, Newspaper } from 'lucide-react';

const BlogHomeSection = () => {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBlogs = async () => {
      try {
        const q = query(collection(db, "blogs"), limit(8)); 
        const snap = await getDocs(q);
        setBlogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetchBlogs();
  }, []);

  const formatDate = (d) => d?.seconds ? new Date(d.seconds * 1000).toLocaleDateString('hi-IN') : "Update";

  if (loading && blogs.length === 0) return null;

  return (
    <section className="py-10 bg-[#f8fafc] font-hindi border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8 border-l-4 border-blue-600 pl-4">
          <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase">Latest Headlines</h2>
          <Link to="/blog" className="text-blue-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all">
            Browse All <ChevronRight size={14}/>
          </Link>
        </div>

        {/* Compact Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {blogs.map((blog, index) => (
            <div 
              key={blog.id} 
              onClick={() => navigate(`/blog/${blog.id}`)}
              className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer flex items-center gap-4 group"
            >
              {/* छोटी इमेज */}
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden shrink-0 bg-slate-100">
                <img 
                  src={blog.imageUrl || blog.image || '/logo.png'} 
                  alt={blog.title || 'StudyGyaan Blog Headline'} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" 
                  onError={(e) => { e.target.src = '/logo.png'; }} // ✅ कनेक्शन फेल होने पर बैकअप इमेज
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {index < 2 && <span className="text-[8px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-black animate-pulse uppercase">HOT</span>}
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1">
                    <Calendar size={10}/> {formatDate(blog.createdAt)}
                  </span>
                </div>
                <h3 className="text-sm md:text-base font-black text-slate-800 line-clamp-2 leading-tight group-hover:text-blue-600">
                  {blog.title}
                </h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BlogHomeSection;