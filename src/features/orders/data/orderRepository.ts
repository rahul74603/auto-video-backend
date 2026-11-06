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

// FIX (2026-11-06): Asal bikri `purchases` collection me likhi jati hai —
// payment flow (manual UPI approval + payment_checker) wahi istemal karta
// hai. Ye repository pehle khaali `orders` collection padhta tha (usme
// 0 documents hain), isliye admin panel me Orders hamesha 0 dikhte the.
// Ab repository purchases ko padhta hai aur har document ko Order ke
// aakaar me normalize kar deta hai, taaki OrdersTab aur student-side
// views (useOrders / useUserOrders) bina badlav ke chalein.
const ordersCollection = collection(db, 'purchases');

// Order-side field naam -> purchases-side asal field naam.
// Firestore ka orderBy kisi field par lagane se jin documents me woh
// field nahi hai woh result se bahar ho jate hain, isliye 'date' aur
// 'createdAt' ko purchases ke 'timestamp' par bhejna zaroori hai.
const ORDER_FIELD_MAP: Record<string, string> = {
  date: 'timestamp',
  createdAt: 'timestamp',
};

const toOrderField = (field: string): string => ORDER_FIELD_MAP[field] ?? field;

const normalizeOrder = (id: string, data: DocumentData): OrderRecord => {
  const email =
    (data.customerEmail as string) ?? (data.userEmail as string) ?? '';
  return {
    ...data,
    id,
    customerEmail: email,
    customerName:
      (data.customerName as string) ??
      (data.userName as string) ??
      (email ? email.split('@')[0] : ''),
    totalAmount: data.totalAmount ?? data.amount ?? 0,
    date: data.date ?? data.timestamp ?? data.createdAt ?? null,
    createdAt: data.createdAt ?? data.timestamp ?? data.date ?? null,
    items:
      data.items ??
      (data.courseId
        ? [
            {
              product: {
                id: data.courseId as string,
                name:
                  (data.productName as string) ??
                  (data.title as string) ??
                  'Premium Course',
              },
            },
          ]
        : []),
  };
};

const mapOrders = (snapshot: QuerySnapshot<DocumentData>): OrderRecord[] =>
  snapshot.docs.map((order) => normalizeOrder(order.id, order.data()));

export const orderRepository = {
  async createOrder(order: Record<string, unknown>): Promise<string> {
    const now = Timestamp.now();
    const snapshot = await addDoc(ordersCollection, {
      ...order,
      // Purchases ke hisaab se mirror fields, taaki naya record bhi
      // baaki sales ke saath ek hi ledger me sahi dikhe.
      ...(order.customerEmail && !order.userEmail
        ? { userEmail: order.customerEmail }
        : {}),
      ...(order.totalAmount != null && order.amount == null
        ? { amount: order.totalAmount }
        : {}),
      createdAt: now,
      timestamp: now,
    });
    return snapshot.id;
  },

  async getById(id: string): Promise<OrderRecord | null> {
    const snapshot = await getDoc(doc(db, 'purchases', id));
    return snapshot.exists() ? normalizeOrder(snapshot.id, snapshot.data()) : null;
  },

  async listByUser(userId: string, status?: OrderStatus): Promise<OrderRecord[]> {
    const constraints = [
      where('userId', '==', userId),
      ...(status ? [where('status', '==', status)] : []),
      orderBy('timestamp', 'desc'),
    ];
    return mapOrders(await getDocs(query(ordersCollection, ...constraints)));
  },

  async listByCustomerEmail(email: string, status?: OrderStatus): Promise<OrderRecord[]> {
    const constraints = [
      where('userEmail', '==', email),
      ...(status ? [where('status', '==', status)] : []),
    ];
    return mapOrders(await getDocs(query(ordersCollection, ...constraints)));
  },

  async listAll(orderField = 'createdAt', direction: 'asc' | 'desc' = 'desc'): Promise<OrderRecord[]> {
    return mapOrders(
      await getDocs(query(ordersCollection, orderBy(toOrderField(orderField), direction))),
    );
  },

  async listByStatus(status: OrderStatus): Promise<OrderRecord[]> {
    return mapOrders(await getDocs(query(ordersCollection, where('status', '==', status))));
  },

  async updateStatus(id: string, status: OrderStatus): Promise<void> {
    await updateDoc(doc(db, 'purchases', id), { status });
  },

  async deleteOrder(id: string): Promise<void> {
    await deleteDoc(doc(db, 'purchases', id));
  },
};

export default orderRepository;
