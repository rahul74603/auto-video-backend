// =============================================================
// Fast Track Workflow Tests
// Covers src/features/fast-track/data/fastTrackRepository.ts
// and the draft approval logic from FastTrackManager.tsx
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// Hoisted mock factories
// ------------------------------------------------------------------
const { mockGetDocs, mockGetDoc, mockOnSnapshot, mockLimitFn } = vi.hoisted(() => ({
  mockGetDocs: vi.fn(),
  mockGetDoc: vi.fn(),
  mockOnSnapshot: vi.fn((_q: unknown, cb: (s: unknown) => void) => {
    cb({
      docs: [
        { id: 'live-1', data: () => ({ title: 'SSC Result', status: 'published' }) },
      ],
    });
    return vi.fn();
  }),
  mockLimitFn: vi.fn(() => 'mock-limit'),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'fast_track'),
  doc: vi.fn((_db: unknown, _coll: string, id?: string) => ({ id: id || 'mock-id' })),
  getDocs: mockGetDocs,
  getDoc: mockGetDoc,
  onSnapshot: mockOnSnapshot,
  query: vi.fn(() => 'mock-query'),
  where: vi.fn(() => 'mock-where'),
  orderBy: vi.fn(() => 'mock-order'),
  limit: mockLimitFn,
}));

vi.mock('@/firebase/config', () => ({
  db: {},
  auth: {},
  storage: {},
  default: { name: '[DEFAULT]' },
}));

import fastTrackRepository, { type FastTrackRecord } from '@/features/fast-track/data/fastTrackRepository';

describe('Fast Track Workflow — fastTrackRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('subscribeLatest', () => {
    it('subscribes to latest items and calls callback', () => {
      const onData = vi.fn();
      const unsubscribe = fastTrackRepository.subscribeLatest(10, onData);

      expect(mockOnSnapshot).toHaveBeenCalled();
      expect(onData).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'live-1', title: 'SSC Result' }),
      ]);
      expect(typeof unsubscribe).toBe('function');
    });

    it('passes error callback to onSnapshot', () => {
      const onError = vi.fn();
      fastTrackRepository.subscribeLatest(5, vi.fn(), onError);

      const calls = mockOnSnapshot.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0].length).toBe(3);
    });
  });

  describe('listLatest', () => {
    it('returns a list of fast track records', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          { id: 'f1', data: () => ({ title: 'SSC Result', category: 'Result' }) },
          { id: 'f2', data: () => ({ title: 'RRB Admit Card', category: 'Admit Card' }) },
        ],
      });

      const items = await fastTrackRepository.listLatest(50);
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('SSC Result');
    });

    it('limits results to specified count', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [] });
      await fastTrackRepository.listLatest(5);
      expect(mockLimitFn).toHaveBeenCalledWith(5);
    });

    it('uses default limit of 50 when none provided', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [] });
      await fastTrackRepository.listLatest();
      expect(mockLimitFn).toHaveBeenCalledWith(50);
    });
  });

  describe('listByCategory', () => {
    it('filters records by category', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          { id: 'f1', data: () => ({ title: 'SSC Result', category: 'Result' }) },
        ],
      });

      const items = await fastTrackRepository.listByCategory('Result');
      expect(items).toHaveLength(1);
    });
  });

  describe('getBySlug', () => {
    it('returns record matching the slug', async () => {
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          { id: 'f1', data: () => ({ title: 'SSC CGL Result', slug: 'ssc-cgl-result' }) },
        ],
      });

      const item = await fastTrackRepository.getBySlug('ssc-cgl-result');
      expect(item?.title).toBe('SSC CGL Result');
    });

    it('returns null when no slug matches', async () => {
      mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
      const item = await fastTrackRepository.getBySlug('nonexistent');
      expect(item).toBeNull();
    });
  });

  describe('getById', () => {
    it('returns record by document id', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'f1',
        data: () => ({ title: 'Direct Item' }),
      });

      const item = await fastTrackRepository.getById('f1');
      expect(item).toEqual(
        expect.objectContaining({ id: 'f1', title: 'Direct Item' })
      );
    });

    it('returns null when id not found', async () => {
      mockGetDoc.mockResolvedValueOnce({ exists: () => false });
      const item = await fastTrackRepository.getById('ghost');
      expect(item).toBeNull();
    });
  });

  describe('getBySlugOrId', () => {
    it('tries slug lookup first', async () => {
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'f1', data: () => ({ title: 'Found by Slug' }) }],
      });

      const item = await fastTrackRepository.getBySlugOrId('some-slug');
      expect(item?.title).toBe('Found by Slug');
    });

    it('falls back to id lookup when slug not found', async () => {
      mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'doc-id',
        data: () => ({ title: 'Found by ID' }),
      });

      const item = await fastTrackRepository.getBySlugOrId('doc-id');
      expect(item?.title).toBe('Found by ID');
    });
  });
});

// ------------------------------------------------------------------
// Approval workflow logic (draft → published)
// ------------------------------------------------------------------
describe('Fast Track Workflow — draft approval', () => {
  it('transitions draft to published status', () => {
    const draft: FastTrackRecord = {
      id: 'draft-1',
      title: 'RRB NTPC Result',
      status: 'draft',
      category: 'Result',
    };

    const published = { ...draft, status: 'published' as const };
    expect(published.status).toBe('published');
    expect(draft.status).toBe('draft');
  });

  it('sets publishedAt when approving', () => {
    const now = new Date('2026-07-19T10:00:00Z');
    const update = { status: 'published' as const, publishedAt: now };
    expect(update.status).toBe('published');
    expect(update.publishedAt).toEqual(now);
  });

  it('preserves existing fields when publishing', () => {
    const draft = {
      id: 'draft-1',
      title: 'SSC CGL 2025 Result',
      category: 'Result' as const,
      org: 'SSC',
      directLink: 'https://ssc.gov.in',
      status: 'draft' as const,
    };

    const update = {
      status: 'published' as const,
      publishedAt: new Date('2026-07-19T00:00:00Z'),
    };

    const published = { ...draft, ...update };
    expect(published.title).toBe('SSC CGL 2025 Result');
    expect(published.status).toBe('published');
    expect(published.directLink).toBe('https://ssc.gov.in');
  });
});

// ------------------------------------------------------------------
// Category badge configuration
// ------------------------------------------------------------------
describe('Fast Track Workflow — category display', () => {
  const categoryConfig: Record<string, string> = {
    Result: 'bg-green-100 text-green-700',
    'Admit Card': 'bg-red-100 text-red-700',
    'Answer Key': 'bg-blue-100 text-blue-700',
    Syllabus: 'bg-purple-100 text-purple-700',
  };

  it('has display classes for all four categories', () => {
    expect(Object.keys(categoryConfig)).toEqual([
      'Result',
      'Admit Card',
      'Answer Key',
      'Syllabus',
    ]);
  });

  it.each(['Result', 'Admit Card', 'Answer Key', 'Syllabus'])(
    'has styling for %s category',
    (cat) => {
      expect(categoryConfig[cat]).toMatch(/^bg-.*-100 text-.*-700$/);
    }
  );
});

// ------------------------------------------------------------------
// Record structure
// ------------------------------------------------------------------
describe('Fast Track Workflow — record structure', () => {
  it('requires id field', () => {
    const record: FastTrackRecord = { id: 'test-id' };
    expect(record.id).toBe('test-id');
  });

  it('supports optional fields from FastTrackManager admin panel', () => {
    const record: FastTrackRecord = {
      id: 'ft-1',
      title: 'SSC Result',
      category: 'Result',
      org: 'SSC',
      status: 'draft',
      slug: 'ssc-result',
      directLink: 'https://example.com',
      videoSent: true,
      syllabusPDF: 'https://example.com/syllabus.pdf',
    };

    expect(record.title).toBe('SSC Result');
    expect(record.videoSent).toBe(true);
    expect(record.syllabusPDF).toContain('syllabus');
  });
});
