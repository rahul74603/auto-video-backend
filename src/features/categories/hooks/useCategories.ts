import { useEffect, useState } from 'react';
import categoryRepository, { type CategoryRecord } from '@/features/categories/data/categoryRepository';

export function useCategories() {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    categoryRepository.listCategories().then((result) => {
      if (active) setCategories(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return { categories, loading, error };
}
