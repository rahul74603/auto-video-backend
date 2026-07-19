import { db, storage } from '@/firebase/config';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

export type ProductRecord = {
  id: string;
  [key: string]: unknown;
};

export type ProductListOptions = {
  category?: string;
};

const productsCollection = collection(db, 'products');

export const productRepository = {
  async add(product: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(productsCollection, {
      ...product,
      createdAt: Timestamp.now(),
    });
    return snapshot.id;
  },

  async list(options: ProductListOptions = {}): Promise<ProductRecord[]> {
    let productsQuery = query(productsCollection, where('isActive', '==', true));
    if (options.category) {
      productsQuery = query(productsQuery, where('category', '==', options.category));
    }
    const snapshot = await getDocs(productsQuery);
    return snapshot.docs.map((product) => ({ id: product.id, ...product.data() }));
  },

  async getById(id: string): Promise<ProductRecord | null> {
    const snapshot = await getDoc(doc(db, 'products', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async update(id: string, product: Record<string, unknown>): Promise<void> {
    await updateDoc(doc(db, 'products', id), product);
  },

  async uploadImage(file: File, productId: string): Promise<string> {
    const storageRef = ref(storage, `products/${productId}/${file.name}`);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  },
};

export default productRepository;
