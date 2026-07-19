import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase/config';
import userRepository, { type UserRecord } from '@/features/users/data/userRepository';

export function useCurrentUser() {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        if (active) { setUser(null); setLoading(false); }
        return;
      }
      userRepository.getUser(currentUser.uid).then((result) => {
        if (active) setUser(result);
      }).catch((reason) => {
        if (active) setError(reason);
      }).finally(() => {
        if (active) setLoading(false);
      });
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  return { user, loading, error };
}
