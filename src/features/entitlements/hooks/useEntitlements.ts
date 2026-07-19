import { useEffect, useState } from 'react';
import entitlementRepository, {
  type PurchasedFlags,
} from '@/features/entitlements/data/entitlementRepository';

export function useEntitlements(uid?: string) {
  const [flags, setFlags] = useState<PurchasedFlags>({});
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!uid) return () => { active = false; };
    entitlementRepository.getPurchasedFlags(uid).then((result) => {
      if (active) setFlags(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [uid]);

  return { flags, loading, error };
}
