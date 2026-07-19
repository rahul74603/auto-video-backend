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
  type QueryConstraint,
} from 'firebase/firestore';

export type JobRecord = {
  id: string;
  [key: string]: unknown;
};

export type JobListOptions = {
  limitCount?: number;
  category?: string;
};

const jobsCollection = collection(db, 'jobs');

export const jobRepository = {
  async list(options: {
    limitCount?: number;
    orderField?: string;
    orderFields?: { field: string; direction?: 'asc' | 'desc' }[];
    typeNot?: string;
  } = {}): Promise<JobRecord[]> {
    const constraints: QueryConstraint[] = [];
    if (options.typeNot) constraints.push(where('type', '!=', options.typeNot));
    const fields = options.orderFields || (options.orderField ? [{ field: options.orderField }] : []);
    fields.forEach(({ field, direction = 'desc' }) => constraints.push(orderBy(field, direction)));
    if (options.limitCount) constraints.push(limit(options.limitCount));
    const snapshot = await getDocs(query(jobsCollection, ...constraints));
    return snapshot.docs.map((job) => ({ id: job.id, ...job.data() }));
  },

  async getBySlug(slug: string): Promise<JobRecord | null> {
    const snapshot = await getDocs(
      query(jobsCollection, where('slug', '==', slug), limit(1))
    );

    if (snapshot.empty) return null;

    const job = snapshot.docs[0];
    return { id: job.id, ...job.data() };
  },

  async getById(id: string): Promise<JobRecord | null> {
    const snapshot = await getDoc(doc(db, 'jobs', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async getBySlugOrId(value: string): Promise<JobRecord | null> {
    const bySlug = await this.getBySlug(value);
    return bySlug || this.getById(value);
  },

  async listLatest(options: JobListOptions = {}): Promise<JobRecord[]> {
    const constraints = [
      ...(options.category ? [where('category', '==', options.category)] : []),
      orderBy('createdAt', 'desc'),
      ...(options.limitCount ? [limit(options.limitCount)] : []),
    ];
    const jobsQuery = query(jobsCollection, ...constraints);
    const snapshot = await getDocs(jobsQuery);
    return snapshot.docs.map((job) => ({ id: job.id, ...job.data() }));
  },

  async incrementViews(id: string): Promise<void> {
    await updateDoc(doc(db, 'jobs', id), { views: increment(1) });
  },

  async add(job: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(jobsCollection, job);
    return snapshot.id;
  },

  async update(id: string, job: Record<string, unknown>): Promise<void> {
    await updateDoc(doc(db, 'jobs', id), job);
  },

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, 'jobs', id));
  },
};

export default jobRepository;
