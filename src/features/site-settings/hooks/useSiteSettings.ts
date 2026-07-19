import { useEffect, useState } from 'react';
import siteSettingsRepository, {
  type SiteSettings,
} from '@/features/site-settings/data/siteSettingsRepository';

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    siteSettingsRepository
      .getGlobal()
      .then((result) => {
        if (active) setSettings(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return { settings, loading, error };
}
