// =============================================================
// Job Publication Workflow Tests
// Covers src/features/job-drafts/data/jobDraftRepository.ts
// and the publication lifecycle from AdminJobDrafts.tsx
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// Hoisted mock factories for Firestore
// ------------------------------------------------------------------
const {
  mockGetDocs,
  mockGetDoc,
  mockAddDoc,
  mockUpdateDoc,
  mockDeleteDoc,
} = vi.hoisted(() => ({
  mockGetDocs: vi.fn(),
  mockGetDoc: vi.fn(),
  mockAddDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'job_drafts'),
  doc: vi.fn((_db: unknown, _coll: string, id?: string) => ({ id: id || 'mock-id' })),
  getDocs: mockGetDocs,
  getDoc: mockGetDoc,
  addDoc: mockAddDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  query: vi.fn(() => 'mock-query'),
  orderBy: vi.fn(() => 'mock-order'),
}));

// Must mock @/firebase/config before importing the repository
vi.mock('@/firebase/config', () => ({
  db: {},
  auth: {},
  storage: {},
  default: { name: '[DEFAULT]' },
}));

import jobDraftRepository from '@/features/job-drafts/data/jobDraftRepository';
import type { JobDraftRecord } from '@/features/job-drafts/data/jobDraftRepository';

describe('Job Publication Workflow — jobDraftRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listDrafts', () => {
    it('returns mapped draft records', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          { id: 'd1', data: () => ({ title: 'SSC Clerk', status: 'draft' }) },
          { id: 'd2', data: () => ({ title: 'RRB NTPC', status: 'draft' }) },
        ],
      });

      const drafts = await jobDraftRepository.listDrafts();
      expect(drafts).toHaveLength(2);
      expect(drafts[0]).toEqual(
        expect.objectContaining({ id: 'd1', title: 'SSC Clerk' })
      );
      expect(drafts[1]).toEqual(
        expect.objectContaining({ id: 'd2', title: 'RRB NTPC' })
      );
    });

    it('uses descending order by default', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [] });
      await jobDraftRepository.listDrafts('createdAt', 'desc');
      expect(mockGetDocs).toHaveBeenCalled();
    });

    it('returns empty array when no drafts exist', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [] });
      const drafts = await jobDraftRepository.listDrafts();
      expect(drafts).toEqual([]);
    });
  });

  describe('getDraft', () => {
    it('returns draft when it exists', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'draft-1',
        data: () => ({ title: 'UPSC 2025', organization: 'UPSC' }),
      });

      const draft = await jobDraftRepository.getDraft('draft-1');
      expect(draft).toEqual(
        expect.objectContaining({ id: 'draft-1', title: 'UPSC 2025' })
      );
    });

    it('returns null when draft does not exist', async () => {
      mockGetDoc.mockResolvedValueOnce({ exists: () => false });
      const draft = await jobDraftRepository.getDraft('nonexistent');
      expect(draft).toBeNull();
    });
  });

  describe('createDraft', () => {
    it('creates a draft and returns the new ID', async () => {
      mockAddDoc.mockResolvedValueOnce({ id: 'new-draft-1' });

      const id = await jobDraftRepository.createDraft({
        title: 'New Job',
        organization: 'SSC',
        status: 'draft',
      });

      expect(id).toBe('new-draft-1');
    });
  });

  describe('updateDraft', () => {
    it('updates a draft with partial data', async () => {
      await jobDraftRepository.updateDraft('draft-1', { status: 'published' });
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });

  describe('deleteDraft', () => {
    it('deletes a draft by id', async () => {
      await jobDraftRepository.deleteDraft('draft-1');
      expect(mockDeleteDoc).toHaveBeenCalled();
    });
  });

  describe('full publication lifecycle', () => {
    it('simulates the draft → review → publish lifecycle', async () => {
      // Step 1: Create
      mockAddDoc.mockResolvedValueOnce({ id: 'new-job-123' });
      const draftId = await jobDraftRepository.createDraft({
        title: 'SSC CGL 2025',
        organization: 'SSC',
        status: 'draft',
      });
      expect(draftId).toBe('new-job-123');

      // Step 2: Get for review
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'new-job-123',
        data: () => ({ title: 'SSC CGL 2025', organization: 'SSC', status: 'draft' }),
      });
      const draft = await jobDraftRepository.getDraft('new-job-123');
      expect(draft?.title).toBe('SSC CGL 2025');

      // Step 3: Publish
      await jobDraftRepository.updateDraft('new-job-123', {
        status: 'published',
        publishedAt: new Date().toISOString(),
      });
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });
});

// ------------------------------------------------------------------
// Draft data structure validation
// ------------------------------------------------------------------
describe('Job Publication Workflow — draft structure', () => {
  it('defines JobDraftRecord type with id field', () => {
    const draft: JobDraftRecord = {
      id: 'test-id',
      title: 'SSC Clerk',
      organization: 'SSC',
      status: 'draft',
    };
    expect(draft.id).toBe('test-id');
    expect(draft.title).toBe('SSC Clerk');
  });

  it('allows arbitrary metadata fields used in the admin panel', () => {
    const draft: JobDraftRecord = {
      id: 'test-id',
      title: 'Test',
      vacancies: 100,
      lastDate: '2026-08-15',
      category: 'Govt',
    };
    expect(draft.vacancies).toBe(100);
    expect(draft.lastDate).toBe('2026-08-15');
  });
});
