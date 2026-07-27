import { db } from '@/firebase/config';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import type { FastTrackItem } from '@/types/firestore';

export type FastTrackRecord = FastTrackItem;

const fastTrackCollection = collection(db, 'fast_track');

export const fastTrackRepository = {
  subscribeLatest(
    limitCount: number,
    onData: (items: FastTrackRecord[]) => void,
    onError?: (error: Error) => void
  ) {
    const fastTrackQuery = query(
      fastTrackCollection,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    return onSnapshot(
      fastTrackQuery,
      (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      onError
    );
  },

  async listLatest(limitCount = 50): Promise<FastTrackRecord[]> {
    const snapshot = await getDocs(query(
      fastTrackCollection,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    ));
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  },

  async listByCategory(category: string): Promise<FastTrackRecord[]> {
    const snapshot = await getDocs(query(
      fastTrackCollection,
      where('category', '==', category)
    ));
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  },

  async getBySlug(slug: string): Promise<FastTrackRecord | null> {
    const snapshot = await getDocs(query(
      fastTrackCollection,
      where('slug', '==', slug),
      limit(1)
    ));
    if (snapshot.empty) return null;
    const item = snapshot.docs[0];
    return { id: item.id, ...item.data() };
  },

  async getById(id: string): Promise<FastTrackRecord | null> {
    const snapshot = await getDoc(doc(db, 'fast_track', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async getBySlugOrId(value: string): Promise<FastTrackRecord | null> {
    return (await this.getBySlug(value)) || this.getById(value);
  },
};

export default fastTrackRepository;
