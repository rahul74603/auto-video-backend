import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetDoc, mockGetDocs, mockSetDoc } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockSetDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ type: 'collection', name })),
  doc: vi.fn((_db: unknown, collectionName: string, id: string) => ({ collectionName, id })),
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
  setDoc: mockSetDoc,
  query: vi.fn((...args: unknown[]) => ({ type: 'query', args })),
  orderBy: vi.fn((field: string, direction?: string) => ({ field, direction })),
  limit: vi.fn((count: number) => ({ count })),
}));

vi.mock('@/firebase/config', () => ({
  db: {},
  auth: {},
  storage: {},
  default: { name: '[DEFAULT]' },
}));

import { fetchGscSearchAnalyticsOverview } from '@/features/seo-intelligence/data/seoIntelligenceRepository';

function dayDoc(date: string, data: Record<string, unknown>) {
  return { id: date, data: () => ({ date, ...data }) };
}

describe('GSC Search Analytics overview (Phase 1, read-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
    mockSetDoc.mockResolvedValue(undefined);
  });

  it('returns null when nothing has been collected — no fake zeros', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const overview = await fetchGscSearchAnalyticsOverview();
    expect(overview).toBeNull();
  });

  it('summarizes collected days honestly: latest day, coverage, weighted averages, latest run', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        dayDoc('2026-08-27', {
          status: 'zero-rows', // most recent date — Google returned no finalized rows yet
          rowCount: 0,
          aggregates: null,
          lastCollectedAt: '2026-08-29T03:00:00.000Z',
          lastRun: {
            at: '2026-08-29T03:00:00.000Z',
            status: 'zero-rows',
            requestedWindow: { startDate: '2026-08-27', endDate: '2026-08-27' },
            apiCalls: 1,
            rowsFetched: 0,
          },
        }),
        dayDoc('2026-08-26', {
          status: 'success',
          rowCount: 2,
          aggregates: { clicks: 30, impressions: 1000, positionImpressionSum: 15000, pages: 2, queries: 2 },
          lastCollectedAt: '2026-08-28T03:00:00.000Z',
          lastRun: {
            at: '2026-08-28T03:00:00.000Z',
            status: 'success',
            requestedWindow: { startDate: '2026-08-26', endDate: '2026-08-26' },
            apiCalls: 1,
            rowsFetched: 2,
          },
        }),
        dayDoc('2026-08-25', {
          status: 'success',
          rowCount: 3,
          aggregates: { clicks: 10, impressions: 500, positionImpressionSum: 5000, pages: 3, queries: 3 },
          lastCollectedAt: '2026-08-27T03:00:00.000Z',
          lastRun: {
            at: '2026-08-27T03:00:00.000Z',
            status: 'success',
            requestedWindow: { startDate: '2026-08-25', endDate: '2026-08-25' },
            apiCalls: 1,
            rowsFetched: 3,
          },
        }),
      ],
    });

    const overview = await fetchGscSearchAnalyticsOverview();
    expect(overview).not.toBeNull();

    // Newest-first day list; latest day is the most recent DATE.
    expect(overview!.days.map((day) => day.date)).toEqual(['2026-08-27', '2026-08-26', '2026-08-25']);
    expect(overview!.latestDay!.date).toBe('2026-08-27');
    expect(overview!.latestDay!.status).toBe('zero-rows');

    // Coverage counts only days with data.
    expect(overview!.coverage).toEqual({ daysWithData: 2, firstDate: '2026-08-25', lastDate: '2026-08-27' });

    // Recent totals over the 2 successful days: impression-weighted math only.
    expect(overview!.recentTotals).toEqual({
      days: 2,
      rows: 5,
      clicks: 40,
      impressions: 1500,
      avgCtr: 40 / 1500,
      avgPosition: (15000 + 5000) / 1500,
    });

    // Latest run = run with the newest timestamp (not the newest date).
    expect(overview!.latestRun!.at).toBe('2026-08-29T03:00:00.000Z');
    expect(overview!.latestRun!.status).toBe('zero-rows');
    expect(overview!.latestRun!.window).toEqual({ startDate: '2026-08-27', endDate: '2026-08-27' });
  });

  it('reports error days as errors and keeps them out of the averages', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        dayDoc('2026-08-27', {
          status: 'error',
          rowCount: 0,
          aggregates: null,
          lastCollectedAt: null,
          lastRun: {
            at: '2026-08-29T03:00:00.000Z',
            status: 'error',
            errorType: 'permission',
            error: 'User does not have access',
            requestedWindow: { startDate: '2026-08-27', endDate: '2026-08-27' },
            apiCalls: 0,
            rowsFetched: 0,
          },
        }),
      ],
    });

    const overview = await fetchGscSearchAnalyticsOverview();
    expect(overview).not.toBeNull();
    expect(overview!.latestDay!.status).toBe('error');
    expect(overview!.latestDay!.lastRun!.errorType).toBe('permission');
    expect(overview!.latestRun!.error).toBe('User does not have access');
    expect(overview!.coverage.daysWithData).toBe(0);
    expect(overview!.recentTotals).toBeNull();
  });
});
