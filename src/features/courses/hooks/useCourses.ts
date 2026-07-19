import { useEffect, useState } from 'react';
import courseRepository, { type CourseRecord } from '@/features/courses/data/courseRepository';

export function useCourses() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    courseRepository.listCourses().then((result) => {
      if (active) setCourses(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  return { courses, loading, error };
}
