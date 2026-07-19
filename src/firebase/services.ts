import { db } from './config';
import { jobRepository } from '@/features/jobs/data/jobRepository';
import { materialRepository } from '@/features/materials/data/materialRepository';
import { productRepository } from '@/features/products/data/productRepository';
import { orderRepository } from '@/features/orders/data/orderRepository';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  query, 
  where, 
  Timestamp,
  getDoc,
  setDoc
} from 'firebase/firestore';

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
    return jobRepository.add({
      ...job,
      postedDate: new Date().toISOString()
    });
  },

  async getJobs(category?: string): Promise<Job[]> {
    return jobRepository.listLatest({ category }) as unknown as Promise<Job[]>;
  },

  async getJobById(id: string): Promise<Job | null> {
    return jobRepository.getById(id) as Promise<Job | null>;
  },

  async updateJob(id: string, job: Partial<Job>): Promise<void> {
    await jobRepository.update(id, job);
  },

  async deleteJob(id: string): Promise<void> {
    await jobRepository.remove(id);
  }
};

// Study Materials Services
export const studyMaterialServices = {
  async addMaterial(material: Omit<StudyMaterial, 'id' | 'createdAt'>): Promise<string> {
    return materialRepository.add(material as unknown as Record<string, unknown>);
  },

  async getMaterials(filters?: { category?: string; language?: string; examType?: string }): Promise<StudyMaterial[]> {
    return materialRepository.list(filters) as unknown as Promise<StudyMaterial[]>;
  },

  async getMaterialsByFolder(folderPath: string): Promise<StudyMaterial[]> {
    return materialRepository.listByFolder(folderPath) as unknown as Promise<StudyMaterial[]>;
  },

  async incrementDownload(id: string): Promise<void> {
    await materialRepository.incrementDownload(id);
  },

  async uploadFile(file: File, path: string): Promise<string> {
    return materialRepository.uploadFile(file, path);
  }
};

// Product/E-commerce Services
export const productServices = {
  async addProduct(product: Omit<Product, 'id' | 'createdAt'>): Promise<string> {
    return productRepository.add(product as unknown as Record<string, unknown>);
  },

  async getProducts(category?: string): Promise<Product[]> {
    return productRepository.list({ category }) as unknown as Promise<Product[]>;
  },

  async getProductById(id: string): Promise<Product | null> {
    return productRepository.getById(id) as unknown as Promise<Product | null>;
  },

  async updateProduct(id: string, product: Partial<Product>): Promise<void> {
    await productRepository.update(id, product as unknown as Record<string, unknown>);
  },

  async uploadProductImage(file: File, productId: string): Promise<string> {
    return productRepository.uploadImage(file, productId);
  }
};

// Order Services
export const orderServices = {
  async createOrder(order: Omit<Order, 'id' | 'createdAt'>): Promise<string> {
    return orderRepository.createOrder(order as unknown as Record<string, unknown>);
  },

  async getUserOrders(userId: string): Promise<Order[]> {
    return orderRepository.listByUser(userId) as unknown as Promise<Order[]>;
  },

  async updateOrderStatus(orderId: string, status: Order['status']): Promise<void> {
    await orderRepository.updateStatus(orderId, status);
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
