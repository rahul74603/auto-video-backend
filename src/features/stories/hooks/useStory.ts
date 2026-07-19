import { useEffect, useState } from 'react';
import storyRepository, {
  type StoryRecord,
} from '@/features/stories/data/storyRepository';

export function useStory(value?: string) {
  const [story, setStory] = useState<StoryRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(value));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!value) return () => { active = false; };

    storyRepository
      .getBySlugOrId(value)
      .then((result) => {
        if (active) setStory(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [value]);

  return { story, loading, error };
}
