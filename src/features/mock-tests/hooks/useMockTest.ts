import { useEffect, useState } from 'react';
import mockTestRepository, {
  type MockTestRecord,
} from '@/features/mock-tests/data/mockTestRepository';

export function useMockTest(id?: string) {
  const [test, setTest] = useState<MockTestRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };

    mockTestRepository
      .getById(id)
      .then((result) => {
        if (active) setTest(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  return { test, loading, error };
}
