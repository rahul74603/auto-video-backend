import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
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

export type BlogRecord = {
  id: string;
  [key: string]: unknown;
};

export type BlogListOptions = {
  limitCount?: number;
};

const blogsCollection = collection(db, 'blogs');

export const blogRepository = {
  async getBySlug(slug: string): Promise<BlogRecord | null> {
    const snapshot = await getDocs(
      query(blogsCollection, where('slug', '==', slug), limit(1))
    );
    if (snapshot.empty) return null;
    const blog = snapshot.docs[0];
    return { id: blog.id, ...blog.data() };
  },

  async getById(id: string): Promise<BlogRecord | null> {
    const snapshot = await getDoc(doc(db, 'blogs', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async getBySlugOrId(value: string): Promise<BlogRecord | null> {
    return (await this.getBySlug(value)) || this.getById(value);
  },

  async listLatest(options: BlogListOptions = {}): Promise<BlogRecord[]> {
    const constraints = [
      orderBy('date', 'desc'),
      ...(options.limitCount ? [limit(options.limitCount)] : []),
    ];
    const snapshot = await getDocs(query(blogsCollection, ...constraints));
    return snapshot.docs.map((blog) => ({ id: blog.id, ...blog.data() }));
  },

  async incrementViews(id: string): Promise<void> {
    await updateDoc(doc(db, 'blogs', id), { views: increment(1) });
  },

  async recordFeedback(id: string, type: 'yes' | 'no'): Promise<void> {
    await updateDoc(doc(db, 'blogs', id), {
      [type === 'yes' ? 'real_likes' : 'real_dislikes']: increment(1),
    });
  },

  async create(blog: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(blogsCollection, blog);
    return snapshot.id;
  },

  async update(id: string, blog: Record<string, unknown>): Promise<void> {
    await updateDoc(doc(db, 'blogs', id), blog);
  },

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, 'blogs', id));
  },
};

export default blogRepository;
