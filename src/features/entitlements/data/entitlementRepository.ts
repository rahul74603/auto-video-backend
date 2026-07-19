import { db } from '@/firebase/config';
import {
  doc,
  getDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

export type PurchasedFlags = Record<string, unknown>;
const userRef = (uid: string) => doc(db, 'users', uid);

const extractPurchasedFlags = (data: Record<string, unknown>): PurchasedFlags =>
  Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith('purchased_')));

export const entitlementRepository = {
  async getPurchasedFlags(uid: string): Promise<PurchasedFlags> {
    const snapshot = await getDoc(userRef(uid));
    return snapshot.exists() ? extractPurchasedFlags(snapshot.data()) : {};
  },

  async hasPurchasedCourse(uid: string, courseId: string): Promise<boolean> {
    const flags = await this.getPurchasedFlags(uid);
    return flags[`purchased_${courseId}`] === true;
  },

  async listPurchasedCourses(uid: string): Promise<string[]> {
    const flags = await this.getPurchasedFlags(uid);
    return Object.entries(flags)
      .filter(([, value]) => value === true)
      .map(([key]) => key.replace('purchased_', ''));
  },

  subscribePurchasedFlags(
    uid: string,
    onData: (flags: PurchasedFlags) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    return onSnapshot(userRef(uid), (snapshot) => {
      onData(snapshot.exists() ? extractPurchasedFlags(snapshot.data()) : {});
    }, onError);
  },
};

export default entitlementRepository;
