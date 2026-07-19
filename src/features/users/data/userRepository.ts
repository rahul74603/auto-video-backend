import { db } from '@/firebase/config';
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export type UserRecord = {
  id: string;
  [key: string]: unknown;
};

const userRef = (uid: string) => doc(db, 'users', uid);

export const userRepository = {
  async getUser(uid: string): Promise<UserRecord | null> {
    const snapshot = await getDoc(userRef(uid));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async createUser(uid: string, user: Record<string, unknown>): Promise<void> {
    await setDoc(userRef(uid), user);
  },

  async updateUser(uid: string, user: Record<string, unknown>): Promise<void> {
    await updateDoc(userRef(uid), user);
  },

  async updateProfile(uid: string, profile: Record<string, unknown>): Promise<void> {
    await updateDoc(userRef(uid), profile);
  },

  async getPurchasedFlags(uid: string): Promise<Record<string, unknown>> {
    const user = await this.getUser(uid);
    if (!user) return {};
    return Object.fromEntries(
      Object.entries(user).filter(([key]) => key.startsWith('purchased_'))
    );
  },

  subscribeUser(
    uid: string,
    onData: (user: UserRecord | null) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    return onSnapshot(userRef(uid), (snapshot) => {
      onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    }, onError);
  },
};

export default userRepository;
