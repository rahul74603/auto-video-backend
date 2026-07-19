import { db, storage } from '@/firebase/config';
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
  where,
  Timestamp,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

export type MaterialRecord = {
  id: string;
  [key: string]: unknown;
};

const materialsCollection = collection(db, 'study_materials');
const serviceMaterialsCollection = collection(db, 'studyMaterials');

export const materialRepository = {
  async listByCategory(category: string): Promise<MaterialRecord[]> {
    const snapshot = await getDocs(
      query(materialsCollection, where('category', '==', category))
    );
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  },

  async getById(id: string): Promise<MaterialRecord | null> {
    const snapshot = await getDoc(doc(db, 'study_materials', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async add(material: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(serviceMaterialsCollection, {
      ...material,
      createdAt: Timestamp.now(),
    });
    return snapshot.id;
  },

  async list(options: { category?: string; language?: string; examType?: string } = {}) {
    let materialsQuery = query(serviceMaterialsCollection, orderBy('createdAt', 'desc'));
    if (options.category) {
      materialsQuery = query(materialsQuery, where('category', '==', options.category));
    }
    if (options.language) {
      materialsQuery = query(materialsQuery, where('language', 'in', [options.language, 'both']));
    }
    if (options.examType) {
      materialsQuery = query(materialsQuery, where('examType', '==', options.examType));
    }
    const snapshot = await getDocs(materialsQuery);
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  },

  async listByFolder(folderPath: string) {
    const snapshot = await getDocs(query(
      serviceMaterialsCollection,
      where('folderPath', '==', folderPath),
      orderBy('createdAt', 'desc')
    ));
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  },

  async getServiceMaterialById(id: string) {
    const snapshot = await getDoc(doc(db, 'studyMaterials', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async update(id: string, material: Record<string, unknown>): Promise<void> {
    await updateDoc(doc(db, 'studyMaterials', id), material);
  },

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, 'studyMaterials', id));
  },

  async incrementDownload(id: string): Promise<void> {
    const material = await this.getServiceMaterialById(id) as MaterialRecord | null;
    if (material) {
      await updateDoc(doc(db, 'studyMaterials', id), {
        downloadCount: ((material.downloadCount as number) || 0) + 1,
      });
    }
  },

  async uploadFile(file: File, path: string): Promise<string> {
    const storageRef = ref(storage, `studyMaterials/${path}/${file.name}`);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  },
};

export default materialRepository;
