import { useEffect, useState } from 'react';
import materialRepository, {
  type MaterialRecord,
} from '@/features/materials/data/materialRepository';

export function useMaterials(category?: string) {
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    materialRepository
      .listByCategory(category || 'root')
      .then((result) => {
        if (active) setMaterials(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [category]);

  return { materials, loading, error };
}
