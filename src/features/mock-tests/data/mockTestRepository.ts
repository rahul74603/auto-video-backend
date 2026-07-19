import { db } from '@/firebase/config';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
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

  async getById(id: string): Promise<MockTestRecord | null> {
    const snapshot = await getDoc(doc(db, 'mock_tests', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },
};

export default mockTestRepository;
