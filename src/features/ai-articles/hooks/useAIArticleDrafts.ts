import { useCallback, useEffect, useState } from 'react';
import aiArticleRepository from '../data/aiArticleRepository';
import type { AIArticleDraftRecord } from '../data/aiArticleRepository';

/** Load + refresh the AI article drafts (newest first). */
export function useAIArticleDrafts() {
  const [drafts, setDrafts] = useState<AIArticleDraftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await aiArticleRepository.listDrafts();
      setDrafts(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load AI article drafts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    aiArticleRepository
      .listDrafts()
      .then((list) => {
        if (cancelled) return;
        setDrafts(list);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load AI article drafts');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { drafts, loading, error, refresh };
}

export default useAIArticleDrafts;
