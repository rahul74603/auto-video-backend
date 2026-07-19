import { useEffect, useState } from 'react';
import categoryStatusRepository, {
  type CategoryStatusRecord,
} from '@/features/category-status/data/categoryStatusRepository';

export function useCategoryStatus() {
  const [statuses, setStatuses] = useState<CategoryStatusRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    categoryStatusRepository.listStatuses().then((result) => {
      if (active) setStatuses(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return { statuses, loading, error };
}
