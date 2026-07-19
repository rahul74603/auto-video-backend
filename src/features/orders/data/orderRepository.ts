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
  Timestamp,
  updateDoc,
  where,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';

export type OrderRecord = {
  id: string;
  [key: string]: unknown;
};

export type OrderStatus = string;
const ordersCollection = collection(db, 'orders');

const mapOrders = (snapshot: QuerySnapshot<DocumentData>): OrderRecord[] =>
  snapshot.docs.map((order) => ({ id: order.id, ...order.data() }));

export const orderRepository = {
  async createOrder(order: Record<string, unknown>): Promise<string> {
    const snapshot = await addDoc(ordersCollection, {
      ...order,
      createdAt: Timestamp.now(),
    });
    return snapshot.id;
  },

  async getById(id: string): Promise<OrderRecord | null> {
    const snapshot = await getDoc(doc(db, 'orders', id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async listByUser(userId: string, status?: OrderStatus): Promise<OrderRecord[]> {
    const constraints = [
      where('userId', '==', userId),
      ...(status ? [where('status', '==', status)] : []),
      orderBy('createdAt', 'desc'),
    ];
    return mapOrders(await getDocs(query(ordersCollection, ...constraints)));
  },

  async listByCustomerEmail(email: string, status?: OrderStatus): Promise<OrderRecord[]> {
    const constraints = [
      where('customerEmail', '==', email),
      ...(status ? [where('status', '==', status)] : []),
    ];
    return mapOrders(await getDocs(query(ordersCollection, ...constraints)));
  },

  async listAll(orderField = 'createdAt', direction: 'asc' | 'desc' = 'desc'): Promise<OrderRecord[]> {
    return mapOrders(await getDocs(query(ordersCollection, orderBy(orderField, direction))));
  },

  async listByStatus(status: OrderStatus): Promise<OrderRecord[]> {
    return mapOrders(await getDocs(query(ordersCollection, where('status', '==', status))));
  },

  async updateStatus(id: string, status: OrderStatus): Promise<void> {
    await updateDoc(doc(db, 'orders', id), { status });
  },

  async deleteOrder(id: string): Promise<void> {
    await deleteDoc(doc(db, 'orders', id));
  },
};

export default orderRepository;
