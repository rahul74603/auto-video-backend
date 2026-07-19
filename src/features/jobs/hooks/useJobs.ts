import { useEffect, useState } from 'react';
import jobRepository, {
  type JobListOptions,
  type JobRecord,
} from '@/features/jobs/data/jobRepository';

export function useJobs(options: JobListOptions = {}) {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const limitCount = options.limitCount;

  useEffect(() => {
    let active = true;

    jobRepository
      .listLatest({ limitCount })
      .then((result) => {
        if (active) setJobs(result);
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

  return { jobs, loading, error };
}
