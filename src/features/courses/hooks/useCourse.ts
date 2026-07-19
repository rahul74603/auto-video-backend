import { useEffect, useState } from 'react';
import courseRepository, { type CourseRecord } from '@/features/courses/data/courseRepository';

export function useCourse(id?: string) {
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };
    courseRepository.getCourseById(id).then((result) => {
      if (active) setCourse(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]);
  return { course, loading, error };
}
