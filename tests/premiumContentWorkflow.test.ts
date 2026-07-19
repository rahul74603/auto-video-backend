// =============================================================
// Premium Content Workflow Tests
// Covers src/firebase/premiumService.ts upload/save logic and
// the course/content management from PremiumTab.tsx
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// Hoisted mocks for Firebase Storage & Firestore
// ------------------------------------------------------------------
const { mockRef, mockUploadBytes, mockGetDownloadURL, mockAddDoc } = vi.hoisted(() => ({
  mockRef: vi.fn(),
  mockUploadBytes: vi.fn(),
  mockGetDownloadURL: vi.fn(),
  mockAddDoc: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  ref: mockRef,
  uploadBytes: mockUploadBytes,
  getDownloadURL: mockGetDownloadURL,
  getStorage: vi.fn(() => ({ bucket: 'mock-bucket' })),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'courses/course-123/content'),
  doc: vi.fn((_db: unknown, _path: string, id?: string) => ({ id: id || 'mock-id' })),
  addDoc: mockAddDoc,
  serverTimestamp: vi.fn(() => new Date('2026-01-01T00:00:00Z')),
}));

vi.mock('@/firebase/config', () => ({
  db: {},
  auth: {},
  storage: {},
  default: { name: '[DEFAULT]' },
}));

import { uploadPremiumFile, savePremiumContent } from '@/firebase/premiumService';

describe('Premium Content Workflow — premiumService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadPremiumFile', () => {
    it('uploads a file to the correct storage path', async () => {
      const file = new File(['test'], 'maths-notes.pdf', { type: 'application/pdf' });
      mockRef.mockReturnValueOnce({ fullPath: 'premium_content/course-123/123456_maths-notes.pdf' });
      mockUploadBytes.mockResolvedValueOnce({
        ref: { fullPath: 'premium_content/course-123/123456_maths-notes.pdf' },
      });
      mockGetDownloadURL.mockResolvedValueOnce('https://storage.url/premium_content/file.pdf');

      const url = await uploadPremiumFile('course-123', file);

      expect(mockRef).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^premium_content\/course-123\/\d+_maths-notes\.pdf$/)
      );
      expect(mockUploadBytes).toHaveBeenCalled();
      expect(url).toBe('https://storage.url/premium_content/file.pdf');
    });

    it('throws error when upload fails', async () => {
      const file = new File(['test'], 'notes.pdf', { type: 'application/pdf' });
      mockRef.mockReturnValueOnce({ fullPath: 'premium_content/course-123/file.pdf' });
      mockUploadBytes.mockRejectedValueOnce(new Error('Upload failed'));

      await expect(uploadPremiumFile('course-123', file)).rejects.toThrow('Upload failed');
    });
  });

  describe('savePremiumContent', () => {
    it('saves content metadata to Firestore', async () => {
      mockAddDoc.mockResolvedValueOnce({ id: 'content-1' });

      const result = await savePremiumContent(
        'course-123',
        'Maths Chapter 1',
        'https://storage.url/file.pdf',
        'PDF'
      );

      expect(result).toBe(true);
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: 'Maths Chapter 1',
          link: 'https://storage.url/file.pdf',
          type: 'PDF',
          courseId: 'course-123',
          createdAt: expect.any(Date),
        })
      );
    });

    it('saves content with VIDEO type', async () => {
      mockAddDoc.mockResolvedValueOnce({ id: 'content-2' });

      const result = await savePremiumContent(
        'course-456',
        'Video Lecture 1',
        'https://youtube.com/watch?v=abc',
        'VIDEO'
      );

      expect(result).toBe(true);
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'VIDEO', courseId: 'course-456' })
      );
    });

    it('throws error when save fails', async () => {
      mockAddDoc.mockRejectedValueOnce(new Error('Firestore error'));

      await expect(
        savePremiumContent('course-123', 'Test', 'https://link.com', 'PDF')
      ).rejects.toThrow('Firestore error');
    });
  });
});

// ------------------------------------------------------------------
// Course data structure
// ------------------------------------------------------------------
describe('Premium Content Workflow — course structure', () => {
  interface Course {
    id: string;
    title: string;
    price: string;
    paymentLink?: string;
    description: string;
    type: 'premium';
    orderIndex?: number;
    createdAt: string;
    lockMessage?: string;
    features?: string[];
  }

  it('creates a valid course object', () => {
    const course: Course = {
      id: 'course-1',
      title: 'SSC Dhamaka 2026',
      price: '499',
      paymentLink: 'https://pay.example.com/ssc',
      description: 'Complete SSC preparation notes',
      type: 'premium',
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      features: ['Bilingual', '5000+ Questions', 'Video Solutions'],
    };

    expect(course.title).toBe('SSC Dhamaka 2026');
    expect(course.features).toHaveLength(3);
    expect(course.type).toBe('premium');
  });

  it('handles optional payment link as undefined', () => {
    const freeCourse: Course = {
      id: 'course-2',
      title: 'Free Sample',
      price: '0',
      description: 'Free content',
      type: 'premium',
      createdAt: new Date().toISOString(),
    };

    expect(freeCourse.paymentLink).toBeUndefined();
  });

  it('calculates discounted price using global settings pattern', () => {
    const mrpPrice = 499;
    const discountPercent = 85;
    const discountPrice = Math.round(mrpPrice * (1 - discountPercent / 100));

    expect(discountPrice).toBe(75);
    expect(discountPrice).toBeLessThan(mrpPrice);
  });
});

// ------------------------------------------------------------------
// Content item structure
// ------------------------------------------------------------------
describe('Premium Content Workflow — content structure', () => {
  interface CourseContent {
    id: string;
    title: string;
    seoTitle?: string;
    link?: string;
    type: 'PDF' | 'VIDEO' | 'FOLDER' | 'article';
    courseId: string;
    parentId: string | null;
    setNumber?: number;
  }

  it('creates a valid PDF content item', () => {
    const item: CourseContent = {
      id: 'content-1',
      title: 'Percentage Notes',
      seoTitle: 'SSC CGL 2026: Maths Best Notes - Percentage Notes',
      link: 'https://storage.url/percentage.pdf',
      type: 'PDF',
      courseId: 'course-1',
      parentId: null,
      setNumber: 1,
    };

    expect(item.seoTitle).toContain('SSC CGL 2026');
    expect(item.type).toBe('PDF');
    expect(item.parentId).toBeNull();
  });

  it('supports FOLDER type for organizing content', () => {
    const folder: CourseContent = {
      id: 'folder-1',
      title: 'GK',
      type: 'FOLDER',
      courseId: 'course-1',
      parentId: null,
    };

    expect(folder.type).toBe('FOLDER');
    expect(folder.link).toBeUndefined();
  });

  it('supports article type for AI-generated content', () => {
    const article: CourseContent = {
      id: 'article-1',
      title: 'AI Generated Article',
      type: 'article',
      courseId: 'course-1',
      parentId: 'folder-1',
      link: 'https://storage.url/article.html',
    };

    expect(article.type).toBe('article');
    expect(article.parentId).toBe('folder-1');
  });

  it('extracts set number from SEO title', () => {
    const extractSetNumber = (seoTitle: string): number | null => {
      const match = seoTitle.match(/set\s*(\d+)/i);
      return match ? parseInt(match[1], 10) : null;
    };

    expect(extractSetNumber('SSC GK Notes - Set 5')).toBe(5);
    expect(extractSetNumber('Maths Set12')).toBe(12);
    expect(extractSetNumber('No number here')).toBeNull();
  });

  it('sorts content by set number ascending', () => {
    const items: CourseContent[] = [
      { id: 'c3', title: 'Set 3', type: 'PDF', courseId: 'c1', parentId: null, setNumber: 3 },
      { id: 'c1', title: 'Set 1', type: 'PDF', courseId: 'c1', parentId: null, setNumber: 1 },
      { id: 'c2', title: 'Set 2', type: 'PDF', courseId: 'c1', parentId: null, setNumber: 2 },
    ];

    items.sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0));
    expect(items.map((i) => i.setNumber)).toEqual([1, 2, 3]);
  });

  it('filters content by parent folder', () => {
    const allContent: CourseContent[] = [
      { id: 'c1', title: 'Root Item', type: 'PDF', courseId: 'c1', parentId: null },
      { id: 'c2', title: 'Folder Item', type: 'PDF', courseId: 'c1', parentId: 'folder-1' },
      { id: 'c3', title: 'Another Root', type: 'PDF', courseId: 'c1', parentId: null },
    ];

    const rootItems = allContent.filter((c) => !c.parentId);
    expect(rootItems).toHaveLength(2);

    const folderItems = allContent.filter((c) => c.parentId === 'folder-1');
    expect(folderItems).toHaveLength(1);
    expect(folderItems[0].title).toBe('Folder Item');
  });
});
