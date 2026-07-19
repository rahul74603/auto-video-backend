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

export type CategoryRecord = {
  id: string;
  [key: string]: unknown;
};

const categoriesCollection = collection(db, 'categories');

export const categoryRepository = {
  async listCategories(): Promise<CategoryRecord[]> {
    const snapshot = await getDocs(categoriesCollection);
    return snapshot.docs.map((category) => ({ id: category.id, ...category.data() }));
  },

  async getCategory(id: string): Promise<CategoryRecord | null> {
    const snapshot = await getDoc(doc(db, 'categories', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async createCategory(category: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(categoriesCollection, category);
    return snapshot.id;
  },

  async updateCategory(id: string, category: Record<string, unknown>): Promise<void> {
    await updateDoc(doc(db, 'categories', id), category);
  },

  async deleteCategory(id: string): Promise<void> {
    await deleteDoc(doc(db, 'categories', id));
  },
};

export default categoryRepository;
