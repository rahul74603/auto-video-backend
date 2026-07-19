import { useEffect, useState } from 'react';
import mockTestRepository, {
  type MockTestListOptions,
  type MockTestRecord,
} from '@/features/mock-tests/data/mockTestRepository';

export function useMockTests(options: MockTestListOptions = {}) {
  const [tests, setTests] = useState<MockTestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const limitCount = options.limitCount;

  useEffect(() => {
    let active = true;
    mockTestRepository
      .listLatest({ limitCount })
      .then((result) => {
        if (active) setTests(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [limitCount]);

  return { tests, loading, error };
}
