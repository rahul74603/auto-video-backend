import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';

export type CategoryStatusRecord = {
  id: string;
  [key: string]: unknown;
};

const statusesCollection = collection(db, 'category_status');

export const categoryStatusRepository = {
  async listStatuses(): Promise<CategoryStatusRecord[]> {
    const snapshot = await getDocs(statusesCollection);
    return snapshot.docs.map((status) => ({ id: status.id, ...status.data() }));
  },

  async getStatus(id: string): Promise<CategoryStatusRecord | null> {
    const snapshot = await getDoc(doc(db, 'category_status', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async createStatus(status: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(statusesCollection, status);
    return snapshot.id;
  },

  async updateStatus(id: string, status: Record<string, unknown>): Promise<void> {
    await updateDoc(doc(db, 'category_status', id), status);
  },

  async deleteStatus(id: string): Promise<void> {
    await deleteDoc(doc(db, 'category_status', id));
  },
};

export default categoryStatusRepository;
