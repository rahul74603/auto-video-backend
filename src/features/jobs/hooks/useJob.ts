import { useEffect, useState } from 'react';
import jobRepository, {
  type JobRecord,
} from '@/features/jobs/data/jobRepository';

export function useJob(value?: string) {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(value));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;

    if (!value) {
      return () => {
        active = false;
      };
    }

    jobRepository
      .getBySlugOrId(value)
      .then((result) => {
        if (active) setJob(result);
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

  return { job, loading, error };
}
