import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';

export type CourseContentRecord = {
  id: string;
  [key: string]: unknown;
};

export type ContentListOptions = {
  orderByCreatedAt?: boolean;
  limitCount?: number;
};

const contentCollection = (courseId: string) =>
  collection(db, `courses/${courseId}/content`);

export const courseContentRepository = {
  async listContent(
    courseId: string,
    options: ContentListOptions = {}
  ): Promise<CourseContentRecord[]> {
    const constraints = [
      ...(options.orderByCreatedAt ? [orderBy('createdAt', 'desc')] : []),
      ...(options.limitCount ? [limit(options.limitCount)] : []),
    ];
    const reference = contentCollection(courseId);
    const snapshot = await getDocs(
      constraints.length ? query(reference, ...constraints) : reference
    );
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  },

  async getContentItem(courseId: string, contentId: string): Promise<CourseContentRecord | null> {
    const snapshot = await getDoc(doc(db, `courses/${courseId}/content`, contentId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async createContent(courseId: string, content: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(contentCollection(courseId), content);
    return snapshot.id;
  },

  async updateContent(
    courseId: string,
    contentId: string,
    content: Record<string, unknown>
  ): Promise<void> {
    await updateDoc(doc(db, `courses/${courseId}/content`, contentId), content);
  },

  async deleteContent(courseId: string, contentId: string): Promise<void> {
    await deleteDoc(doc(db, `courses/${courseId}/content`, contentId));
  },
};

export default courseContentRepository;
