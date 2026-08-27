import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetDoc, mockGetDocs, mockFetch } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ type: 'collection', name })),
  doc: vi.fn((_db: unknown, collectionName: string, id: string) => ({ collectionName, id })),
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
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

import {
  fetchSeoDashboard,
  getSeoIntelligenceWorkflowUrl,
  ingestSearchConsoleRows,
  normalizeSearchConsoleRows,
  prepareSearchConsoleImport,
} from '@/features/seo-intelligence/data/seoIntelligenceRepository';

describe('SEO dashboard Firestore repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('reads persisted dashboard data from Firestore without Cloud Run fetch', async () => {
    mockGetDoc.mockImplementation((ref: { id: string }) => {
      if (ref.id === 'seo_intelligence') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            runner: 'github-actions',
            lastStatus: 'success',
            lastSuccessAt: '2026-08-26T01:45:00.000Z',
            scanDurationMs: 1234,
            recommendationCount: 1,
            lifecycleSummary: { OPEN: 2, CLOSED: 1 },
            freshness: { ok: true, stats: { recentJobs24h: 2 }, issues: [] },
            lastRun: { generatedAt: '2026-08-26T01:45:00.000Z', searchConsole: { enabled: true, rowCount: 1 } },
            pageAudits: [{
              url: '/job/ssc-cgl-2026',
              contentType: 'JOB',
              contentId: 'job-1',
              health: { score: 82, label: 'fair', note: 'Page SEO Health is a StudyGyaan diagnostic score, not a Google ranking score.' },
              priority: 45,
              mainOpportunity: 'Add contextual internal links',
              criticalCount: 0,
              highCount: 0,
              findings: [{ id: 'internalLinks:none-in-source', dimension: 'internalLinks', severity: 'medium' }],
            }],
            pageAuditSummary: {
              count: 1,
              max: 40,
              storage: 'system_settings/seo_intelligence.pageAudits',
              preferredCollectionBlocked: 'seo_page_audits requires admin-only Firestore rules before use',
            },
          }),
        });
      }
      if (ref.id === 'seo_search_console') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ rows: [{ page: 'https://studygyaan.in/job/a' }], source: 'github-actions-manual-json-import' }),
        });
      }
      return Promise.resolve({ exists: () => false, data: () => ({}) });
    });
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'rec-1', data: () => ({ kind: 'CONTENT_GAP', title: 'Missing mock test', priority: 50, autoCreate: false }) },
      ],
    });

    const dashboard = await fetchSeoDashboard();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(getSeoIntelligenceWorkflowUrl()).toContain('actions/workflows/seo_intelligence.yml');
    expect(dashboard.scan?.runner).toBe('github-actions');
    expect(dashboard.lifecycle?.OPEN).toBe(2);
    expect(dashboard.recommendations).toHaveLength(1);
    expect(dashboard.pageAudits).toHaveLength(1);
    expect(dashboard.pageAudits?.[0].contentType).toBe('JOB');
    expect(dashboard.pageAuditSummary?.storage).toContain('system_settings');
    expect(dashboard.searchConsole?.rowCount).toBe(1);
    expect(dashboard.policy?.autoPublish).toBe(false);
    expect(dashboard.policy?.autoCreatePages).toBe(false);
    expect(dashboard.policy?.inventFacts).toBe(false);
    expect(dashboard.policy?.pageAuditApply).toBe(false);
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('validates manual GSC rows and rejects foreign URLs', () => {
    const rows = normalizeSearchConsoleRows([
      { query: 'ssc', page: 'https://studygyaan.in/job/ssc', clicks: 1, impressions: 100, ctr: 2, position: 7 },
      { query: 'evil', page: 'https://example.com/job/ssc', clicks: 1, impressions: 100, ctr: 0.1, position: 7 },
    ]);
    expect(rows).toEqual([
      { query: 'ssc', page: 'https://studygyaan.in/job/ssc', clicks: 1, impressions: 100, ctr: 0.02, position: 7 },
    ]);
    expect(prepareSearchConsoleImport(rows).json).toContain('studygyaan.in');
  });

  it('does not allow direct browser GSC writes when rules are not available in repo', async () => {
    await expect(ingestSearchConsoleRows([
      { query: 'ssc', page: 'https://studygyaan.in/job/ssc', clicks: 1, impressions: 100, ctr: 0.02, position: 7 },
    ])).rejects.toThrow(/Direct browser GSC writes are disabled/);
  });
});
