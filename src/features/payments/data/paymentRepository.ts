import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  type Unsubscribe,
  serverTimestamp,
  where,
} from 'firebase/firestore';

export type PaymentRequest = {
  id: string;
  [key: string]: unknown;
};

const purchasesCollection = collection(db, 'purchases');
const mapRequests = (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) =>
  snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

export const paymentRepository = {
  async createPaymentRequest(payment: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(purchasesCollection, {
      ...payment,
      timestamp: payment.timestamp ?? serverTimestamp(),
    });
    return snapshot.id;
  },

  async getPaymentRequest(id: string): Promise<PaymentRequest | null> {
    const snapshot = await getDoc(doc(db, 'purchases', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async listUserPaymentRequests(userId: string): Promise<PaymentRequest[]> {
    return mapRequests(await getDocs(query(
      purchasesCollection,
      where('userId', '==', userId)
    )));
  },

  async listPendingPayments(courseId?: string): Promise<PaymentRequest[]> {
    const constraints = [
      where('status', '==', 'pending'),
      ...(courseId ? [where('courseId', '==', courseId)] : []),
    ];
    return mapRequests(await getDocs(query(purchasesCollection, ...constraints)));
  },

  async updatePaymentStatus(
    id: string,
    status: string,
    processedAt?: unknown
  ): Promise<void> {
    await updateDoc(doc(db, 'purchases', id), {
      status,
      ...(processedAt === undefined ? {} : { processedAt }),
    });
  },

  subscribePendingPayments(
    callback: (payments: PaymentRequest[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const pendingQuery = query(purchasesCollection, where('status', '==', 'pending'));
    return onSnapshot(pendingQuery, (snapshot) => {
      callback(mapRequests(snapshot));
    }, onError);
  },
};

export default paymentRepository;
