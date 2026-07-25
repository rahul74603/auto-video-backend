import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';

export type MockTestRecord = {
  id: string;
  [key: string]: unknown;
};

export type MockTestListOptions = {
  limitCount?: number;
};

const testsCollection = collection(db, 'mock_tests');

export const mockTestRepository = {
  async listLatest(options: MockTestListOptions = {}): Promise<MockTestRecord[]> {
    const constraints = [
      orderBy('createdAt', 'desc'),
      ...(options.limitCount ? [limit(options.limitCount)] : []),
    ];
    let snapshot;
    try {
      snapshot = await getDocs(query(testsCollection, ...constraints));
    } catch {
      snapshot = await getDocs(testsCollection);
    }

    if (snapshot.empty) {
      const fallbackQuery = options.limitCount
        ? query(testsCollection, limit(options.limitCount))
        : testsCollection;
      snapshot = await getDocs(fallbackQuery);
    }

    return snapshot.docs.map((test) => ({ id: test.id, ...test.data() }));
  },

  async createMockTest(test: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(testsCollection, test);
    return snapshot.id;
  },

  async updateMockTest(id: string, test: Record<string, unknown>): Promise<void> {
    await updateDoc(doc(db, 'mock_tests', id), test);
  },

  async deleteMockTest(id: string): Promise<void> {
    await deleteDoc(doc(db, 'mock_tests', id));
  },

  async getById(id: string): Promise<MockTestRecord | null> {
    const snapshot = await getDoc(doc(db, 'mock_tests', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async getBySlug(slug: string): Promise<MockTestRecord | null> {
    const snapshot = await getDocs(
      query(testsCollection, where('slug', '==', slug), limit(1))
    );
    if (snapshot.empty) return null;
    const test = snapshot.docs[0];
    return { id: test.id, ...test.data() };
  },

  async getBySlugOrId(value: string): Promise<MockTestRecord | null> {
    return (await this.getBySlug(value)) || this.getById(value);
  },
};

export default mockTestRepository;
