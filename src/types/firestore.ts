/**
 * Shared Firestore record shapes used by pages/components after the
 * Strict-type support for Firestore records. All record fields are optional because Firestore
 * documents are schemaless; pages decide how to render missing values.
 *
 * These types are intentionally descriptive (not `any`) so strict mode and
 * `@typescript-eslint/no-explicit-any` both stay satisfied.
 */

/** Firestore Timestamp / Date / ISO-string — anything date-like we render. */
export type TimestampLike =
  | { seconds?: number; nanoseconds?: number; toDate?: () => Date }
  | Date
  | string
  | number
  | null
  | undefined;

export interface FAQItem {
  question: string;
  answer: string;
}

export interface LinkItem {
  label: string;
  url: string;
}

/** Loose key/value map for fully dynamic settings documents. */
export type DynamicSettings = Record<string, string | undefined>;

/** Job document (jobs / job_drafts collections). */
export interface JobPost {
  id: string;
  title?: string;
  slug?: string;
  organization?: string;
  description?: string;
  metaDescription?: string;
  category?: string;
  vacancies?: string | number;
  totalVacancies?: string | number;
  salary?: string;
  payScale?: string;
  qualification?: string;
  educationDetails?: string;
  eligibility?: string;
  location?: string;
  state?: string;
  advtNo?: string;
  startDate?: string;
  lastDate?: string;
  examDate?: string;
  admitCardDate?: string;
  selectionProcess?: string;
  feeGen?: string;
  feeSCST?: string;
  feeFemale?: string;
  feeOBC?: string;
  applicationFee?: string;
  minAge?: string | number;
  maxAge?: string | number;
  ageLimit?: string;
  ageRelaxation?: string;
  applyLink?: string;
  notificationLink?: string;
  officialSiteLink?: string;
  websiteLink?: string;
  syllabusPdfLink?: string;
  jobUpdateLink?: string;
  resultLink?: string;
  imageUrl?: string;
  image?: string;
  photoUrl?: string;
  bannerUrl?: string;
  author?: string;
  authorName?: string;
  employmentType?: string;
  status?: string;
  type?: string;
  views?: number;
  videoTriggered?: boolean;
  schemaMarkup?: string;
  articleHtml?: string;
  faqs?: FAQItem[];
  officialLinks?: LinkItem[];
  keywords?: string[];
  sourceUrl?: string;
  shortInfo?: string;
  highlights?: string[];
  importantDates?: { label: string; value: string }[];
  vacancyDetails?: { postName: string; total: string | number; eligibility?: string }[];
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  publishedAt?: TimestampLike;
  lastUpdated?: string;
  expiryDate?: string;
  isExpired?: boolean;
  seoTitle?: string;
  examFamily?: string;
  contentKind?: string;
  topicCluster?: string;
  searchIntent?: string;
  lifecycleStatus?: string;
  imageAlt?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  relatedLinks?: { title?: string; url?: string; kind?: string }[];
  updateHistory?: { at?: string; reason?: string; changes?: { field: string; from: string; to: string }[] }[];
  sourceCitation?: { url?: string; label?: string; disclosed?: boolean };
  [key: string]: unknown;
}

/** Fast-track update document (fast_track / fast_track_drafts). */
export interface FastTrackItem {
  id: string;
  title?: string;
  slug?: string;
  category?: string;
  org?: string;
  organization?: string;
  updateDate?: string;
  shortInfo?: string;
  description?: string;
  metaDescription?: string;
  directLink?: string;
  syllabusPDF?: string;
  status?: string;
  imageUrl?: string;
  photoUrl?: string;
  authorName?: string;
  articleHtml?: string;
  faqs?: FAQItem[];
  officialLinks?: LinkItem[];
  keywords?: string[];
  sourceUrl?: string;
  schemaMarkup?: string;
  uploadedBy?: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  publishedAt?: TimestampLike;
  seoTitle?: string;
  examFamily?: string;
  contentKind?: string;
  topicCluster?: string;
  youtubeUrl?: string;
  relatedLinks?: { title?: string; url?: string; kind?: string }[];
  updateHistory?: { at?: string; reason?: string; changes?: { field: string; from: string; to: string }[] }[];
  sourceCitation?: { url?: string; label?: string };
  [key: string]: unknown;
}

/** Blog document (blogs). */
export interface BlogPostRecord {
  id: string;
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  description?: string;
  metaDescription?: string;
  metaTitle?: string;
  category?: string;
  tags?: string[];
  tagsString?: string;
  imageUrl?: string;
  image?: string;
  author?: string;
  authorName?: string;
  readTime?: string;
  views?: number;
  likes?: number;
  status?: string;
  featured?: boolean;
  seoScore?: number;
  focusKeyword?: string;
  faqs?: FAQItem[];
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  publishedAt?: TimestampLike;
  date?: string;
  [key: string]: unknown;
}

/** Web story document (web_stories). */
export interface WebStoryRecord {
  id: string;
  title?: string;
  slug?: string;
  status?: string;
  poster?: string;
  posterUrl?: string;
  publisherLogo?: string;
  metaDescription?: string;
  excerpt?: string;
  category?: string;
  pages?: WebStoryPage[];
  slides?: WebStoryPage[];
  videoPoster?: string;
  createdAt?: TimestampLike;
  publishedAt?: TimestampLike;
  [key: string]: unknown;
}

export interface WebStoryPage {
  id?: string;
  type?: string;
  text?: string;
  heading?: string;
  content?: string;
  image?: string;
  imagePrompt?: string;
  bg?: string;
  cta?: string;
  ctaText?: string;
  ctaLink?: string;
  animate?: string;
  duration?: number;
  [key: string]: unknown;
}

/** Mock test question + test document. */
export interface MockQuestion {
  id?: string;
  qText?: string;
  qImage?: string;
  options?: string[];
  correctOption?: number;
  qLogic?: string;
  qLogicImage?: string;
  [key: string]: unknown;
}

export interface MockTestRecord {
  id?: string;
  title?: string;
  category?: string;
  exam?: string;
  duration?: string | number;
  negativeMarking?: string | number;
  questions?: MockQuestion[];
  totalQuestions?: number;
  status?: string;
  premium?: boolean;
  isPremium?: boolean;
  createdAt?: TimestampLike;
  [key: string]: unknown;
}

/** Study material / file documents. */
export interface MaterialFile {
  id: string;
  name?: string;
  title?: string;
  fileName?: string;
  fileUrl?: string;
  downloadURL?: string;
  type?: string;
  fileType?: string;
  category?: string;
  folderId?: string;
  folderPath?: string;
  size?: number | string;
  fileSize?: string | number;
  downloads?: number;
  premium?: boolean;
  isPremium?: boolean;
  price?: number | string;
  createdAt?: TimestampLike;
  [key: string]: unknown;
}

export interface MaterialFolder {
  id: string;
  title?: string;
  name?: string;
  parentId?: string | null;
  type?: string;
  coverImage?: string;
  description?: string;
  premium?: boolean;
  price?: number | string;
  [key: string]: unknown;
}

/** Product (shop) document. */
export interface ProductDoc {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  price?: number | string;
  mrp?: number | string;
  discount?: string;
  imageUrl?: string;
  image?: string;
  category?: string;
  pdfUrl?: string;
  previewUrl?: string;
  status?: string;
  stock?: number;
  createdAt?: TimestampLike;
  [key: string]: unknown;
}

/** Order document. */
export interface OrderDoc {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  items?: { title?: string; name?: string; price?: number | string; qty?: number; quantity?: number }[];
  productTitle?: string;
  amount?: number | string;
  total?: number | string;
  status?: string;
  paymentMethod?: string;
  transactionId?: string;
  createdAt?: TimestampLike;
  [key: string]: unknown;
}

/** Generic site-content / homepage rows. */
export interface SiteContentDoc {
  id: string;
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  link?: string;
  imageUrl?: string;
  order?: number;
  active?: boolean;
  createdAt?: TimestampLike;
  [key: string]: unknown;
}

export interface AdPlacement {
  id: string;
  image?: string;
  link?: string;
  active?: boolean;
  position?: string;
  [key: string]: unknown;
}

/** Payment document (payments collection). */
export interface PaymentDoc {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  amount?: number | string;
  planName?: string;
  plan?: string;
  utr?: string;
  status?: string;
  itemName?: string;
  itemType?: string;
  createdAt?: TimestampLike;
  [key: string]: unknown;
}

export interface UserCourseDoc {
  id: string;
  title?: string;
  courseTitle?: string;
  courseId?: string;
  pdfUrl?: string;
  fileUrl?: string;
  grantedAt?: TimestampLike;
  expiryDate?: string;
  [key: string]: unknown;
}

export interface CourseDoc {
  id: string;
  title?: string;
  description?: string;
  price?: number | string;
  imageUrl?: string;
  chapters?: CourseChapter[];
  [key: string]: unknown;
}

export interface CourseChapter {
  id?: string;
  title?: string;
  name?: string;
  pdfUrl?: string;
  fileUrl?: string;
  size?: string;
  addedAt?: TimestampLike;
  [key: string]: unknown;
}

export interface CategoryDoc {
  id: string;
  name?: string;
  title?: string;
  icon?: string;
  description?: string;
  count?: number;
  [key: string]: unknown;
}

export interface CategoryStatusDoc {
  id: string;
  name?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface NotificationDoc {
  id: string;
  text?: string;
  title?: string;
  message?: string;
  createdAt?: TimestampLike;
  [key: string]: unknown;
}

/** Safe text coercion for rendering dynamic Firestore values in JSX. */
export function asText(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

/** TimestampLike → Date (invalid/missing input par null). */
export function toDateSafe(dateField: TimestampLike): Date | null {
  if (!dateField) return null;
  try {
    if (dateField instanceof Date) return dateField;
    const d = dateField as { seconds?: number; toDate?: () => Date };
    if (typeof d.seconds === 'number') return new Date(d.seconds * 1000);
    if (typeof d.toDate === 'function') return d.toDate();
    const parsed = new Date(dateField as string | number);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}
