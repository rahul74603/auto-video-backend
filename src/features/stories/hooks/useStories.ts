import { useEffect, useState } from 'react';
import storyRepository, {
  type StoryListOptions,
  type StoryRecord,
} from '@/features/stories/data/storyRepository';

export function useStories(options: StoryListOptions = {}) {
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const limitCount = options.limitCount;

  useEffect(() => {
    let active = true;
    storyRepository
      .listLatest({ limitCount })
      .then((result) => {
        if (active) setStories(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [limitCount]);

  return { stories, loading, error };
}
