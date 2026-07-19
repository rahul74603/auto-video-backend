import { useEffect, useState } from 'react';
import courseContentRepository, {
  type CourseContentRecord,
} from '@/features/course-content/data/courseContentRepository';

export function useCourseContentItem(courseId?: string, contentId?: string) {
  const [content, setContent] = useState<CourseContentRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(courseId && contentId));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!courseId || !contentId) return () => { active = false; };
    courseContentRepository.getContentItem(courseId, contentId)
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
  }, [courseId, contentId]);

  return { content, loading, error };
}
