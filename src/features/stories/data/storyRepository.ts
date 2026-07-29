import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

export type StoryRecord = {
  id: string;
  [key: string]: unknown;
};

export type StoryListOptions = {
  limitCount?: number;
};

const storiesCollection = collection(db, 'web_stories');

export const storyRepository = {
  async listLatest(options: StoryListOptions = {}): Promise<StoryRecord[]> {
    const constraints = [
      orderBy('createdAt', 'desc'),
      ...(options.limitCount ? [limit(options.limitCount)] : []),
    ];
    const snapshot = await getDocs(query(storiesCollection, ...constraints));
    return snapshot.docs.map((story) => ({ id: story.id, ...story.data() }));
  },

  async createStory(story: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(storiesCollection, story);
    return snapshot.id;
  },

  async getBySlug(slug: string): Promise<StoryRecord | null> {
    const snapshot = await getDocs(
      query(storiesCollection, where('slug', '==', slug), limit(1))
    );
    if (snapshot.empty) return null;
    const story = snapshot.docs[0];
    return { id: story.id, ...story.data() };
  },

  async getById(id: string): Promise<StoryRecord | null> {
    const snapshot = await getDoc(doc(db, 'web_stories', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  /** 👁️ Views counter — fail ho to chupchaap ignore (UX kabhi nahi tootega) */
  async incrementViews(id: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'web_stories', id), { views: increment(1) });
    } catch (err) {
      console.warn('story views increment skipped:', err);
    }
  },

  async getBySlugOrId(value: string): Promise<StoryRecord | null> {
    return (await this.getBySlug(value)) || this.getById(value);
  },
};

export default storyRepository;
