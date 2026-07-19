import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  Timestamp,
  updateDoc,
  where,
  query,
} from 'firebase/firestore';

export type CourseRecord = { id: string; [key: string]: unknown };
const coursesCollection = collection(db, 'courses');

export const courseRepository = {
  async listCourses(): Promise<CourseRecord[]> {
    const snapshot = await getDocs(coursesCollection);
    return snapshot.docs.map((course) => ({ id: course.id, ...course.data() }));
  },
  async getCourseById(id: string): Promise<CourseRecord | null> {
    const snapshot = await getDoc(doc(db, 'courses', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },
  async getCourseBySlug(slug: string): Promise<CourseRecord | null> {
    const snapshot = await getDocs(query(coursesCollection, where('slug', '==', slug)));
    if (snapshot.empty) return null;
    const course = snapshot.docs[0];
    return { id: course.id, ...course.data() };
  },
  async createCourse(course: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(coursesCollection, { ...course, createdAt: Timestamp.now() });
    return snapshot.id;
  },
  async updateCourse(id: string, course: Record<string, unknown>): Promise<void> {
    await updateDoc(doc(db, 'courses', id), course);
  },
  async deleteCourse(id: string): Promise<void> {
    await deleteDoc(doc(db, 'courses', id));
  },
  async updateCourseOrder(id: string, orderIndex: number): Promise<void> {
    await updateDoc(doc(db, 'courses', id), { orderIndex });
  },
};

export default courseRepository;
