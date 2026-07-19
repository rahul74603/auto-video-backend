import { useEffect, useState } from 'react';
import blogRepository, {
  type BlogListOptions,
  type BlogRecord,
} from '@/features/blogs/data/blogRepository';

export function useBlogs(options: BlogListOptions = {}) {
  const [blogs, setBlogs] = useState<BlogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const limitCount = options.limitCount;

  useEffect(() => {
    let active = true;
    blogRepository
      .listLatest({ limitCount })
      .then((result) => {
        if (active) setBlogs(result);
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
  }, [limitCount]);

  return { blogs, loading, error };
}
