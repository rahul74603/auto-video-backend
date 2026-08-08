import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ArrowRight, Sparkles, BookOpen, Briefcase, FileText } from 'lucide-react';
import { fetchRelatedContent, type ContentCategory } from '@/features/internal-linking/data/internalLinkingRepository';

interface RelatedContentProps {
  currentId: string;
  exam?: string;
  category?: ContentCategory;
  subject?: string;
  topic?: string;
  title: string;
  className?: string;
  limit?: number;
  showTitle?: boolean;
}

const iconMap: Record<string, any> = {
  JOB: Briefcase,
  FAST_TRACK: FileText,
  MOCK_TEST: BookOpen,
  STUDY_MATERIAL: BookOpen,
  BLOG: FileText,
  WEB_STORY: Sparkles,
};

const RelatedContent = ({
  currentId,
  exam,
  category,
  subject,
  topic,
  title,
  className = '',
  limit = 6,
  showTitle = true,
}: RelatedContentProps) => {
  const [related, setRelated] = useState<Awaited<ReturnType<typeof fetchRelatedContent>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchRelatedContent({
          exam,
          category,
          subject,
          topic,
          excludeId: currentId,
          limitCount: limit,
        });
        if (!cancelled) setRelated(data);
      } catch (e) {
        console.warn('Related content fetch failed:', e);
        if (!cancelled) setRelated([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [currentId, exam, category, subject, topic, limit]);

  if (loading) {
    return (
      <div className={`bg-white border rounded-2xl p-5 ${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-100 rounded w-1/3"></div>
          <div className="h-3 bg-gray-100 rounded"></div>
          <div className="h-3 bg-gray-100 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (!related.length) return null;

  return (
    <div className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${className}`}>
      {showTitle && (
        <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
          <h3 className="font-black text-xs uppercase tracking-widest text-gray-700 flex items-center gap-2">
            <Sparkles size={14} className="text-blue-600" />
            Related {category ? category.replace('_', ' ') : exam ? `${exam}` : ''} Content
          </h3>
          <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold">
            {related.length} found
          </span>
        </div>
      )}
      <div className="divide-y divide-gray-50">
        {related.map((item) => {
          const Icon = iconMap[item.type] || FileText;
          return (
            <Link
              key={item.id}
              to={item.url}
              className="flex items-start gap-3 p-4 hover:bg-blue-50/50 transition-colors group"
            >
              <div className="p-2 bg-gray-100 group-hover:bg-blue-100 rounded-lg shrink-0 mt-0.5">
                <Icon size={14} className="text-gray-500 group-hover:text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-800 group-hover:text-blue-700 line-clamp-2 leading-snug">
                  {item.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase tracking-wider">
                    {item.exam}
                  </span>
                  <span className="text-[9px] font-bold text-gray-400 flex items-center gap-1">
                    <Clock size={10} /> {item.category.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <ArrowRight size={14} className="shrink-0 text-gray-300 group-hover:text-blue-600 mt-1" />
            </Link>
          );
        })}
      </div>
      <div className="p-3 bg-gray-50/30 border-t text-center">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          💡 Auto-generated • Relevance scored • No random links
        </p>
      </div>
    </div>
  );
};

export default RelatedContent;
