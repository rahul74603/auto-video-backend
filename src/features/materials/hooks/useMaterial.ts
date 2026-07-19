import { useEffect, useState } from 'react';
import materialRepository, {
  type MaterialRecord,
} from '@/features/materials/data/materialRepository';

export function useMaterial(id?: string) {
  const [material, setMaterial] = useState<MaterialRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };

    materialRepository
      .getById(id)
      .then((result) => {
        if (active) setMaterial(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  return { material, loading, error };
}
