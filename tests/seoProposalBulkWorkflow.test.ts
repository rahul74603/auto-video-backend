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

import {
  applyOptimizationProposals,
  approveOptimizationProposals,
  checkOptimizationProposal,
  checkOptimizationProposals,
  previewOptimizationProposal,
  type SeoOptimizationProposal,
} from '@/features/seo-intelligence/data/seoIntelligenceRepository';

const base = (overrides: SeoOptimizationProposal): SeoOptimizationProposal => ({
  url: '/job/ssc-cgl-2026',
  contentType: 'JOB',
  contentId: 'job-1',
  oldValue: 'old',
  proposedValue: 'SSC CGL 2026 apply online. Last date 31/12/2026.',
  confidence: 'observed',
  ...overrides,
});

describe('SEO proposal CHECK / bulk approve / bulk apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CHECK is read-only and classifies pending, fact, Level C, and approved applyable rows', () => {
    const pendingSafe = checkOptimizationProposal(base({
      id: 'a1',
      field: 'metaDescription',
      status: 'pending',
      level: 'A',
      requiresReview: false,
    }));
    expect(pendingSafe.applyable).toBe(false);
    expect(pendingSafe.approvable).toBe(true);
    expect(pendingSafe.category).toBe('needs_approval');

    const needsReview = checkOptimizationProposal(base({
      id: 'b1',
      field: 'metaDescription',
      status: 'pending',
      level: 'B',
      requiresReview: true,
    }));
    expect(needsReview.approvable).toBe(false);
    expect(needsReview.category).toBe('needs_review');

    const fact = checkOptimizationProposal(base({
      id: 'c1',
      field: 'salary',
      status: 'approved',
      level: 'C',
      requiresReview: true,
      proposedValue: '₹1',
    }));
    expect(fact.applyable).toBe(false);
    expect(fact.isFactField).toBe(true);
    expect(fact.isLevelC).toBe(true);
    expect(fact.category).toBe('blocked');

    const approvedProposal = base({
      id: 'd1',
      field: 'metaDescription',
      status: 'approved',
      level: 'A',
      requiresReview: false,
    });
    expect(previewOptimizationProposal(approvedProposal).applyable).toBe(true);
    const ready = checkOptimizationProposal(approvedProposal);
    expect(ready.applyable).toBe(true);
    expect(ready.category).toBe('ready');

    const missingMap = checkOptimizationProposal(base({
      id: 'e1',
      field: 'metaDescription',
      status: 'approved',
      level: 'A',
      contentId: '',
      requiresReview: false,
    }));
    expect(missingMap.hasDocumentMapping).toBe(false);
    expect(missingMap.applyable).toBe(false);

    const report = checkOptimizationProposals([
      base({ id: 'a1', field: 'metaDescription', status: 'pending', level: 'A', requiresReview: false }),
      base({ id: 'c1', field: 'salary', status: 'approved', level: 'C', proposedValue: null }),
    ]);
    expect(report.summary.total).toBe(2);
    expect(report.summary.needsApproval).toBe(1);
    expect(report.summary.levelC).toBe(1);
  });

  it('bulk safe-approve writes status only and skips Level C / review / facts', async () => {
    const current = [
      base({ id: 'a1', field: 'metaDescription', status: 'pending', level: 'A', requiresReview: false }),
      base({ id: 'b1', field: 'metaDescription', status: 'pending', level: 'B', requiresReview: true }),
      base({ id: 'c1', field: 'salary', status: 'pending', level: 'C', proposedValue: null }),
    ];
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ optimizationProposals: current }),
    });
    mockSetDoc.mockResolvedValue(undefined);

    const { proposals, results } = await approveOptimizationProposals(['a1', 'b1', 'c1']);
    expect(results.find((item) => item.id === 'a1')?.outcome).toBe('approved');
    expect(results.find((item) => item.id === 'b1')?.outcome).toBe('skipped');
    expect(results.find((item) => item.id === 'c1')?.outcome).toBe('skipped');
    expect(proposals.find((item) => item.id === 'a1')?.status).toBe('approved');
    expect(proposals.find((item) => item.id === 'a1')?.applied).toBe(false);
    expect(proposals.find((item) => item.id === 'b1')?.status).toBe('pending');
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const payload = mockSetDoc.mock.calls[0][1];
    expect(payload.optimizationApply).toBe(false);
    expect(payload.optimizationProposals.find((item: SeoOptimizationProposal) => item.id === 'a1').applied).toBe(false);
  });

  it('bulk apply skips pending/html, continues after a failure, and snapshots successful writes', async () => {
    let proposals: SeoOptimizationProposal[] = [
      base({ id: 'ok', field: 'metaDescription', status: 'approved', level: 'A', requiresReview: false, contentId: 'job-ok' }),
      base({ id: 'pending', field: 'metaDescription', status: 'pending', level: 'A', requiresReview: false, contentId: 'job-pending' }),
      base({ id: 'html', field: 'articleHtml', status: 'approved', level: 'B', requiresReview: true, proposedValue: { articleHtml: '<p>safe</p>' } }),
      base({ id: 'fail', field: 'h1', status: 'approved', level: 'A', requiresReview: false, contentId: 'job-fail' }),
    ];

    mockGetDoc.mockImplementation((ref: { id: string; collectionName: string }) => {
      if (ref.id === 'seo_intelligence') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ optimizationProposals: proposals, applyHistory: [] }),
        });
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({ metaDescription: 'old', h1: 'old h1' }),
      });
    });
    mockSetDoc.mockImplementation((ref: { id: string; collectionName: string }, payload: Record<string, unknown>) => {
      if (ref.collectionName === 'jobs' && ref.id === 'job-fail') {
        return Promise.reject(new Error('public write failed'));
      }
      if (ref.id === 'seo_intelligence' && Array.isArray(payload.optimizationProposals)) {
        proposals = payload.optimizationProposals as SeoOptimizationProposal[];
      }
      return Promise.resolve(undefined);
    });

    const { results } = await applyOptimizationProposals(['pending', 'html', 'fail', 'ok']);
    expect(results.find((item) => item.id === 'pending')?.outcome).toBe('skipped');
    expect(results.find((item) => item.id === 'html')?.outcome).toBe('skipped');
    expect(results.find((item) => item.id === 'fail')?.outcome).toBe('failed');
    expect(results.find((item) => item.id === 'ok')?.outcome).toBe('applied');
    expect(results.find((item) => item.id === 'ok')?.snapshotId).toBe('snap-ok');
    expect(proposals.find((item) => item.id === 'ok')?.status).toBe('applied');
    expect(proposals.find((item) => item.id === 'pending')?.status).toBe('pending');
    expect(proposals.find((item) => item.id === 'fail')?.status).toBe('approved');
  });
});
