import { useEffect, useState } from 'react';
import blogRepository, {
  type BlogRecord,
} from '@/features/blogs/data/blogRepository';

export function useBlog(value?: string) {
  const [blog, setBlog] = useState<BlogRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(value));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!value) return () => { active = false; };

    blogRepository
      .getBySlugOrId(value)
      .then((result) => {
        if (active) setBlog(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [value]);

  return { blog, loading, error };
}
