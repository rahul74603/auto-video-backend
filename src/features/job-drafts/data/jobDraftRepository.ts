import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';

export type JobDraftRecord = { id: string; [key: string]: unknown };
const draftsCollection = collection(db, 'job_drafts');

export const jobDraftRepository = {
  async listDrafts(orderField = 'createdAt', direction: 'asc' | 'desc' = 'desc'): Promise<JobDraftRecord[]> {
    const snapshot = await getDocs(query(draftsCollection, orderBy(orderField, direction)));
    return snapshot.docs.map((draft) => ({ id: draft.id, ...draft.data() }));
  },
  async getDraft(id: string): Promise<JobDraftRecord | null> {
    const snapshot = await getDoc(doc(db, 'job_drafts', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },
  async createDraft(draft: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(draftsCollection, draft);
    return snapshot.id;
  },
  async updateDraft(id: string, draft: Record<string, unknown>): Promise<void> {
    await updateDoc(doc(db, 'job_drafts', id), draft);
  },
  async deleteDraft(id: string): Promise<void> {
    await deleteDoc(doc(db, 'job_drafts', id));
  },
};

export default jobDraftRepository;
