export interface Job {
  id: string;
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
  id: string;
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
  folderPath?: string;
  createdAt: Date;
}

export interface Product {
  id: string;
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
  createdAt: Date;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  shippingAddress: Address;
  paymentStatus: 'pending' | 'completed' | 'failed';
  createdAt: Date;
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

export interface ExamCategory {
  id: string;
  name: string;
  nameHi: string;
  description: string;
  descriptionHi: string;
  icon: string;
  color: string;
  jobCount: number;
}

export interface Testimonial {
  id: string;
  name: string;
  avatar: string;
  text: string;
  textHi: string;
  exam: string;
  rating: number;
}

export interface Ad {
  id: string;
  title: string;
  imageUrl: string;
  link: string;
  position: 'header' | 'sidebar' | 'footer' | 'inline';
  isActive: boolean;
  clicks: number;
  impressions: number;
}

export interface FolderStructure {
  id: string;
  name: string;
  nameHi: string;
  type: 'folder' | 'file';
  parentId?: string;
  path: string;
  children?: FolderStructure[];
  materialId?: string;
}
