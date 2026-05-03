import { db, storage } from './config';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  Timestamp,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Types
export interface Job {
  id?: string;
  title: string;
  organization: string;
  vacancies: number;
  lastDate: string;
  applyLink: string;
  category: string;
  description: string;
  eligibility: string;
  salary: string;
  location: string;
  postedDate: string;
  status: 'active' | 'closed' | 'upcoming';
  tags: string[];
}

export interface StudyMaterial {
  id?: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  language: 'hindi' | 'english' | 'both';
  fileUrl: string;
  fileType: string;
  fileSize: string;
  downloadCount: number;
  examType: string;
  isPremium: boolean;
  price?: number;
  createdAt: Timestamp;
}

export interface Product {
  id?: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  imageUrl: string;
  category: string;
  stock: number;
  rating: number;
  reviewCount: number;
  features: string[];
  isActive: boolean;
  createdAt: Timestamp;
}

export interface Order {
  id?: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  shippingAddress: Address;
  paymentStatus: 'pending' | 'completed' | 'failed';
  createdAt: Timestamp;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
}

export interface Address {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
}

// Jobs Services
export const jobServices = {
  async addJob(job: Omit<Job, 'id'>): Promise<string> {
    const docRef = await addDoc(collection(db, 'jobs'), {
      ...job,
      postedDate: new Date().toISOString()
    });
    return docRef.id;
  },

  async getJobs(category?: string): Promise<Job[]> {
    let q = query(collection(db, 'jobs'), orderBy('postedDate', 'desc'));
    if (category) {
      q = query(q, where('category', '==', category));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
  },

  async getJobById(id: string): Promise<Job | null> {
    const docRef = doc(db, 'jobs', id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Job : null;
  },

  async updateJob(id: string, job: Partial<Job>): Promise<void> {
    await updateDoc(doc(db, 'jobs', id), job);
  },

  async deleteJob(id: string): Promise<void> {
    await deleteDoc(doc(db, 'jobs', id));
  }
};

// Study Materials Services
export const studyMaterialServices = {
  async addMaterial(material: Omit<StudyMaterial, 'id' | 'createdAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, 'studyMaterials'), {
      ...material,
      createdAt: Timestamp.now()
    });
    return docRef.id;
  },

  async getMaterials(filters?: { category?: string; language?: string; examType?: string }): Promise<StudyMaterial[]> {
    let q = query(collection(db, 'studyMaterials'), orderBy('createdAt', 'desc'));
    
    if (filters?.category) {
      q = query(q, where('category', '==', filters.category));
    }
    if (filters?.language) {
      q = query(q, where('language', 'in', [filters.language, 'both']));
    }
    if (filters?.examType) {
      q = query(q, where('examType', '==', filters.examType));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudyMaterial));
  },

  async getMaterialsByFolder(folderPath: string): Promise<StudyMaterial[]> {
    const q = query(
      collection(db, 'studyMaterials'),
      where('folderPath', '==', folderPath),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudyMaterial));
  },

  async incrementDownload(id: string): Promise<void> {
    const docRef = doc(db, 'studyMaterials', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      await updateDoc(docRef, {
        downloadCount: (docSnap.data().downloadCount || 0) + 1
      });
    }
  },

  async uploadFile(file: File, path: string): Promise<string> {
    const storageRef = ref(storage, `studyMaterials/${path}/${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }
};

// Product/E-commerce Services
export const productServices = {
  async addProduct(product: Omit<Product, 'id' | 'createdAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, 'products'), {
      ...product,
      createdAt: Timestamp.now()
    });
    return docRef.id;
  },

  async getProducts(category?: string): Promise<Product[]> {
    let q = query(collection(db, 'products'), where('isActive', '==', true));
    if (category) {
      q = query(q, where('category', '==', category));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
  },

  async getProductById(id: string): Promise<Product | null> {
    const docRef = doc(db, 'products', id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Product : null;
  },

  async updateProduct(id: string, product: Partial<Product>): Promise<void> {
    await updateDoc(doc(db, 'products', id), product);
  },

  async uploadProductImage(file: File, productId: string): Promise<string> {
    const storageRef = ref(storage, `products/${productId}/${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }
};

// Order Services
export const orderServices = {
  async createOrder(order: Omit<Order, 'id' | 'createdAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, 'orders'), {
      ...order,
      createdAt: Timestamp.now()
    });
    return docRef.id;
  },

  async getUserOrders(userId: string): Promise<Order[]> {
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
  },

  async updateOrderStatus(orderId: string, status: Order['status']): Promise<void> {
    await updateDoc(doc(db, 'orders', orderId), { status });
  }
};

// Ads Services
export const adServices = {
  async getActiveAds(position: string): Promise<any[]> {
    const q = query(
      collection(db, 'ads'),
      where('isActive', '==', true),
      where('position', '==', position)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async trackAdClick(adId: string): Promise<void> {
    const docRef = doc(db, 'ads', adId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      await updateDoc(docRef, {
        clicks: (docSnap.data().clicks || 0) + 1
      });
    }
  },

  async trackAdImpression(adId: string): Promise<void> {
    const docRef = doc(db, 'ads', adId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      await updateDoc(docRef, {
        impressions: (docSnap.data().impressions || 0) + 1
      });
    }
  }
};

// SEO Services
export const seoServices = {
  async getSEOMeta(page: string): Promise<any> {
    const docRef = doc(db, 'seo', page);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  },

  async updateSEOMeta(page: string, meta: any): Promise<void> {
    await setDoc(doc(db, 'seo', page), meta, { merge: true });
  }
};
