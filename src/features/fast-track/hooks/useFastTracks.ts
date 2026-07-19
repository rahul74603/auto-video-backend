import { useEffect, useState } from 'react';
import fastTrackRepository, {
  type FastTrackRecord,
} from '@/features/fast-track/data/fastTrackRepository';

export function useFastTracks(limitCount = 50) {
  const [updates, setUpdates] = useState<FastTrackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const unsubscribe = fastTrackRepository.subscribeLatest(
      limitCount,
      (items) => {
        setUpdates(items);
        setLoading(false);
      },
      (reason) => {
        setError(reason);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [limitCount]);

  return { updates, loading, error };
}
