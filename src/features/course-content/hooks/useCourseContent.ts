import { useEffect, useState } from 'react';
import courseContentRepository, {
  type ContentListOptions,
  type CourseContentRecord,
} from '@/features/course-content/data/courseContentRepository';

export function useCourseContent(courseId?: string, options: ContentListOptions = {}) {
  const [content, setContent] = useState<CourseContentRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(courseId));
  const [error, setError] = useState<unknown>(null);
  const orderByCreatedAt = options.orderByCreatedAt;
  const limitCount = options.limitCount;

  useEffect(() => {
    let active = true;
    if (!courseId) return () => { active = false; };
    courseContentRepository.listContent(courseId, { orderByCreatedAt, limitCount })
      .then((result) => {
        if (active) setContent(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [courseId, orderByCreatedAt, limitCount]);

  return { content, loading, error };
}
