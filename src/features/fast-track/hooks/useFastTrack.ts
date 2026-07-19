import { useEffect, useState } from 'react';
import fastTrackRepository, {
  type FastTrackRecord,
} from '@/features/fast-track/data/fastTrackRepository';

export function useFastTrack(value?: string) {
  const [update, setUpdate] = useState<FastTrackRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(value));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!value) return () => { active = false; };

    fastTrackRepository
      .getBySlugOrId(value)
      .then((result) => {
        if (active) setUpdate(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [value]);

  return { update, loading, error };
}
