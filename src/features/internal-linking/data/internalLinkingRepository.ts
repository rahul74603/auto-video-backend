/* eslint-disable */
import { db } from '@/firebase/config';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import {
  complementaryKinds,
  detectContentKind,
  detectExamFamily,
  type ContentKind,
  type ExamFamily,
} from '@/features/seo-intelligence/taxonomy';

/**
 * Internal Linking Repository — scalable related content system for 1,170+ orphan pages fix
 * Uses Firestore metadata (exam, category, subject, topic, contentType) to find related content
 * Cost-conscious: limits queries, uses cache, prefers same exam + same category
 */

export type ContentType = 'JOB' | 'FAST_TRACK' | 'MOCK_TEST' | 'STUDY_MATERIAL' | 'BLOG' | 'WEB_STORY' | 'COURSE' | 'EBOOK' | 'STATIC';
export type ContentCategory = 'RECRUITMENT' | 'ADMIT_CARD' | 'RESULT' | 'SYLLABUS' | 'ANSWER_KEY' | 'MOCK_TEST' | 'STUDY_MATERIAL' | 'JOB' | 'UPDATE' | 'WEB_STORY' | 'EBOOK' | 'COURSE' | 'PREMIUM' | 'STATIC';

export interface RelatedContent {
  id: string;
  title: string;
  slug?: string;
  type: ContentType;
  category: ContentCategory;
  exam: string;
  subject?: string;
  topic?: string;
  url: string;
  priority: number; // 0-100, higher = more relevant
}

interface FetchOptions {
  exam?: string;
  category?: ContentCategory;
  subject?: string;
  topic?: string;
  contentType?: ContentType;
  excludeId?: string;
  excludeUrl?: string;
  title?: string;
  examFamily?: string;
  contentKind?: string;
  limitCount?: number;
}

// Simple in-memory cache to avoid Firestore read storm (5 min TTL)
const cache = new Map<string, { data: RelatedContent[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function cacheKey(opts: FetchOptions): string {
  return `${opts.exam || ''}|${opts.category || ''}|${opts.subject || ''}|${opts.topic || ''}|${opts.contentType || ''}|${opts.excludeId || ''}`;
}

function getCached(key: string): RelatedContent[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: RelatedContent[]) {
  cache.set(key, { data, ts: Date.now() });
  // Keep cache small
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

// Map Firestore collection to URL
function buildUrl(collection: string, doc: any): string {
  const id = doc.id;
  const slug = doc.data().slug || id;
  switch (collection) {
    case 'jobs': return `/job/${slug}`;
    case 'fast_track': return `/update/${slug}`;
    case 'blogs': return `/blog/${slug}`;
    case 'mock_tests': return `/test/${slug}`;
    case 'web_stories': return `/web-stories/${slug}`;
    case 'courses': return `/course/${id}`;
    case 'study_materials': return `/material/${slug}`;
    default: return `/${collection}/${slug}`;
  }
}

function determineCategoryFromDoc(data: any, collection: string): ContentCategory {
  const title = (data.title || '').toLowerCase();
  if (title.includes('admit card') || title.includes('hall ticket')) return 'ADMIT_CARD';
  if (title.includes('result') || title.includes('merit list') || title.includes('cut off')) return 'RESULT';
  if (title.includes('syllabus') || title.includes('exam pattern')) return 'SYLLABUS';
  if (title.includes('answer key')) return 'ANSWER_KEY';
  if (collection === 'mock_tests' || title.includes('mock test')) return 'MOCK_TEST';
  if (collection === 'study_materials' || title.includes('notes') || title.includes('study material')) return 'STUDY_MATERIAL';
  if (collection === 'web_stories') return 'WEB_STORY';
  if (collection === 'courses') return 'COURSE';
  if (collection === 'blogs') return 'UPDATE';
  if (data.type === 'EBOOK' || title.includes('ebook') || title.includes('e-book')) return 'EBOOK';
  return 'RECRUITMENT';
}

function determineExamFromDoc(data: any): string {
  const title = (data.title || '').toUpperCase();
  const exams = ['SSC GD', 'SSC CGL', 'SSC CHSL', 'SSC MTS', 'RRB GROUP D', 'RRB NTPC', 'RAILWAY', 'SSC', 'BANKING', 'IBPS', 'SBI', 'POLICE', 'MP POLICE', 'UP POLICE', 'UPSC', 'NEET', 'CUET', 'CTET', 'RAJASTHAN', 'BIHAR', 'HSSC', 'JEE', 'NDA', 'CDS', 'AFCAT'];
  for (const exam of exams) {
    if (title.includes(exam)) return exam;
  }
  // Check category field
  const cat = (data.category || '').toUpperCase();
  if (cat) return cat;
  return 'GENERAL';
}

/**
 * Fetch related content using Firestore queries
 * Priority:
 * 1. Same exam + same category
 * 2. Same exam
 * 3. Same category
 * 4. Same subject
 * 5. Popular / recent
 */
export async function fetchRelatedContent(opts: FetchOptions): Promise<RelatedContent[]> {
  const key = cacheKey(opts);
  const cached = getCached(key);
  if (cached) return cached;

  const results: RelatedContent[] = [];
  const seenIds = new Set<string>();
  if (opts.excludeId) seenIds.add(opts.excludeId);

  // Helper to query a collection
  async function queryCollection(colName: string, type: ContentType, limitCount: number, filter?: (data: any) => boolean) {
    try {
      const colRef = collection(db, colName);
      let q = query(colRef, orderBy('createdAt', 'desc'), limit(limitCount * 2));
      // We'll filter in memory for flexibility (since Firestore composite indexes limited)
      const snap = await getDocs(q);
      snap.forEach(doc => {
        if (results.length >= (opts.limitCount || 8)) return;
        if (seenIds.has(doc.id)) return;
        const data = doc.data();
        if (data.status && String(data.status).toLowerCase() !== 'published' && colName !== 'web_stories') return;
        if (filter && !filter(data)) return;

        const title = String(data.title || '');
        if (title.trim().length < 5) return;
        const category = determineCategoryFromDoc(data, colName);
        const exam = determineExamFromDoc(data);
        const url = buildUrl(colName, doc);
        if (opts.excludeUrl && url === opts.excludeUrl) return;
        if (results.some((row) => row.url === url)) return;

        const candFamily = (data.examFamily as ExamFamily) || detectExamFamily({
          title,
          category: data.category,
          organization: data.organization || data.org,
        });
        const candKind = (data.contentKind as ContentKind) || detectContentKind({
          type: colName === 'jobs' ? 'JOB' : colName === 'mock_tests' ? 'MOCK_TEST' : colName === 'blogs' ? 'BLOG' : 'FAST_TRACK',
          title,
          category: data.category,
        });
        const sourceFamily = (opts.examFamily as ExamFamily) || detectExamFamily({
          title: opts.title,
          category: opts.exam,
          exam: opts.exam,
        });
        const sourceKind = (opts.contentKind as ContentKind) || (opts.category as unknown as ContentKind) || 'OTHER';

        let priority = 0;
        if (sourceFamily && sourceFamily !== 'GENERAL' && candFamily === sourceFamily) priority += 40;
        else if (opts.exam && exam === opts.exam) priority += 24;
        const complements = complementaryKinds(sourceKind);
        if (complements.includes(candKind)) priority += 30;
        else if (opts.category && category === opts.category) priority += 12;
        if (opts.subject && data.subject === opts.subject) priority += 20;
        if (opts.topic && data.topic === opts.topic) priority += 15;
        if (opts.contentType && type === opts.contentType) priority -= 8;
        if (priority < 12) return;

        results.push({
          id: doc.id,
          title: data.title || doc.id,
          slug: data.slug,
          type,
          category,
          exam,
          subject: data.subject,
          topic: data.topic,
          url,
          priority
        });
        seenIds.add(doc.id);
      });
    } catch (e) {
      console.warn(`Related content query failed for ${colName}:`, e);
    }
  }

  // Priority 1: Same exam + same category (most relevant)
  if (opts.exam && opts.category) {
    await queryCollection('jobs', 'JOB', 10, (d) => determineExamFromDoc(d) === opts.exam && determineCategoryFromDoc(d, 'jobs') === opts.category);
    await queryCollection('fast_track', 'FAST_TRACK', 10, (d) => determineExamFromDoc(d) === opts.exam);
  }

  // Priority 2: Same exam
  if (opts.exam && results.length < (opts.limitCount || 8)) {
    await queryCollection('jobs', 'JOB', 15, (d) => determineExamFromDoc(d) === opts.exam);
    await queryCollection('mock_tests', 'MOCK_TEST', 10, (d) => determineExamFromDoc(d) === opts.exam || (d.category || '').toUpperCase().includes(opts.exam!.toUpperCase()));
  }

  // Priority 3: Same category
  if (opts.category && results.length < (opts.limitCount || 8)) {
    if (opts.category === 'MOCK_TEST') {
      await queryCollection('mock_tests', 'MOCK_TEST', 15);
    } else if (opts.category === 'ADMIT_CARD' || opts.category === 'RESULT') {
      await queryCollection('fast_track', 'FAST_TRACK', 15, (d) => determineCategoryFromDoc(d, 'fast_track') === opts.category);
    } else if (opts.category === 'COURSE') {
      await queryCollection('courses', 'COURSE', 15);
    } else if (opts.category === 'EBOOK') {
      // E-books live in the jobs collection but must link to /ebook/:id, so
      // surface complementary study material + mock tests instead of wrong /job/ URLs.
      await queryCollection('study_materials', 'STUDY_MATERIAL', 10);
      await queryCollection('mock_tests', 'MOCK_TEST', 10);
    } else if (opts.category === 'WEB_STORY') {
      await queryCollection('web_stories', 'WEB_STORY', 15);
    } else if (opts.category === 'STUDY_MATERIAL') {
      await queryCollection('study_materials', 'STUDY_MATERIAL', 15);
    } else {
      await queryCollection('jobs', 'JOB', 15, (d) => determineCategoryFromDoc(d, 'jobs') === opts.category);
    }
  }

  // Priority 4: Same subject
  if (opts.subject && results.length < (opts.limitCount || 8)) {
    await queryCollection('study_materials', 'STUDY_MATERIAL', 10, (d) => d.subject === opts.subject);
    await queryCollection('mock_tests', 'MOCK_TEST', 10, (d) => d.subject === opts.subject);
  }

  // Priority 5: Fallback to recent popular
  if (results.length < (opts.limitCount || 8)) {
    await queryCollection('jobs', 'JOB', 10);
    await queryCollection('blogs', 'BLOG', 5);
  }

  // Sort by priority and limit
  results.sort((a, b) => b.priority - a.priority);
  const finalResults = results.slice(0, opts.limitCount || 8);

  setCached(key, finalResults);
  return finalResults;
}

/**
 * Get breadcrumb path for a content
 * Example: Home → Government Jobs → SSC → SSC GD → SSC GD Admit Card 2026
 */
export function buildBreadcrumbPath(current: { title: string; exam?: string; category?: ContentCategory; subject?: string }): Array<{ name: string; url: string }> {
  const crumbs: Array<{ name: string; url: string }> = [
    { name: 'Home', url: '/' }
  ];

  if (current.category) {
    const categoryMap: Record<string, { name: string; url: string }> = {
      'RECRUITMENT': { name: 'Government Jobs', url: '/govt-jobs' },
      'ADMIT_CARD': { name: 'Admit Cards', url: '/admit-card' },
      'RESULT': { name: 'Results', url: '/results' },
      'SYLLABUS': { name: 'Syllabus', url: '/syllabus' },
      'ANSWER_KEY': { name: 'Answer Keys', url: '/answer-key' },
      'MOCK_TEST': { name: 'Mock Tests', url: '/test' },
      'STUDY_MATERIAL': { name: 'Study Material', url: '/free-study-material' },
      'JOB': { name: 'Government Jobs', url: '/govt-jobs' },
      'UPDATE': { name: 'Latest Updates', url: '/govt-jobs' },
      'COURSE': { name: 'Premium Courses', url: '/premium-notes' },
      'EBOOK': { name: 'E-Books', url: '/e-books' },
      'WEB_STORY': { name: 'Web Stories', url: '/web-stories' },
    };
    const cat = categoryMap[current.category];
    if (cat) crumbs.push(cat);
  }

  if (current.exam && current.exam !== 'GENERAL') {
    void current.exam; // TS6133 fix
    crumbs.push({
      name: current.exam,
      url: `/govt-jobs?exam=${encodeURIComponent(current.exam)}`
    });
  }

  if (current.subject) {
    crumbs.push({
      name: current.subject,
      url: `/free-study-material?subject=${encodeURIComponent(current.subject)}`
    });
  }

  crumbs.push({
    name: current.title,
    url: '' // Current page, no link
  });

  return crumbs;
}

/**
 * Clear cache (call after publishing new content)
 */
export function clearRelatedContentCache() {
  cache.clear();
}
