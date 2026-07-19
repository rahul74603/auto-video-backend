import { useEffect, useState } from 'react';
import jobDraftRepository, { type JobDraftRecord } from '@/features/job-drafts/data/jobDraftRepository';

export function useJobDrafts() {
  const [drafts, setDrafts] = useState<JobDraftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    jobDraftRepository.listDrafts().then((result) => {
      if (active) setDrafts(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  return { drafts, loading, error };
}
