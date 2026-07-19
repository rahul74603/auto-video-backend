import { useEffect, useState } from 'react';
import userRepository, { type UserRecord } from '@/features/users/data/userRepository';

export function useUser(uid?: string) {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    if (!uid) return () => { active = false; };
    userRepository.getUser(uid).then((result) => {
      if (active) setUser(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [uid]);
  return { user, loading, error };
}
