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
  applyOptimizationProposal,
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

  it('bulk apply skips Level B / Level C / pending / articleHtml and still applies approved Level A after snapshot', async () => {
    const writes: Array<{ collectionName: string; id: string }> = [];
    let proposals: SeoOptimizationProposal[] = [
      base({ id: 'a-ok', field: 'metaDescription', status: 'approved', level: 'A', requiresReview: false, contentId: 'job-a' }),
      base({ id: 'b-skip', field: 'metaDescription', status: 'approved', level: 'B', requiresReview: true, contentId: 'job-b' }),
      base({ id: 'c-skip', field: 'salary', status: 'approved', level: 'C', requiresReview: true, proposedValue: '₹1', contentId: 'job-c' }),
      base({ id: 'pending-skip', field: 'metaDescription', status: 'pending', level: 'A', requiresReview: false, contentId: 'job-pending' }),
      base({ id: 'html-skip', field: 'articleHtml', status: 'approved', level: 'A', requiresReview: false, proposedValue: { articleHtml: '<p>safe</p>' }, contentId: 'job-html' }),
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
        data: () => ({ metaDescription: 'old' }),
      });
    });
    mockSetDoc.mockImplementation((ref: { id: string; collectionName: string }, payload: Record<string, unknown>) => {
      writes.push({ collectionName: ref.collectionName, id: ref.id });
      if (ref.id === 'seo_intelligence' && Array.isArray(payload.optimizationProposals)) {
        proposals = payload.optimizationProposals as SeoOptimizationProposal[];
      }
      return Promise.resolve(undefined);
    });

    const { results } = await applyOptimizationProposals(['b-skip', 'c-skip', 'pending-skip', 'html-skip', 'a-ok']);
    expect(results.find((item) => item.id === 'b-skip')?.outcome).toBe('skipped');
    expect(results.find((item) => item.id === 'b-skip')?.reason).toMatch(/level-B-not-batched/);
    expect(results.find((item) => item.id === 'c-skip')?.outcome).toBe('skipped');
    expect(results.find((item) => item.id === 'pending-skip')?.outcome).toBe('skipped');
    expect(results.find((item) => item.id === 'html-skip')?.outcome).toBe('skipped');
    expect(results.find((item) => item.id === 'a-ok')?.outcome).toBe('applied');
    expect(results.find((item) => item.id === 'a-ok')?.snapshotId).toBe('snap-a-ok');

    expect(writes.some((item) => item.collectionName === 'jobs' && item.id === 'job-b')).toBe(false);
    expect(writes.some((item) => item.collectionName === 'jobs' && item.id === 'job-c')).toBe(false);
    expect(writes.some((item) => item.collectionName === 'jobs' && item.id === 'job-pending')).toBe(false);
    expect(writes.some((item) => item.collectionName === 'jobs' && item.id === 'job-html')).toBe(false);

    const snapIdx = writes.findIndex((item) => item.collectionName === 'seo_apply_snapshots' && item.id === 'snap-a-ok');
    const pageIdx = writes.findIndex((item) => item.collectionName === 'jobs' && item.id === 'job-a');
    expect(snapIdx).toBeGreaterThan(-1);
    expect(pageIdx).toBeGreaterThan(snapIdx);
    expect(proposals.find((item) => item.id === 'b-skip')?.status).toBe('approved');
    expect(proposals.find((item) => item.id === 'a-ok')?.status).toBe('applied');
  });

  it('individual Apply still allows approved Level B after snapshot and does not use the bulk skip', async () => {
    let proposals: SeoOptimizationProposal[] = [
      base({ id: 'b-ok', field: 'metaDescription', status: 'approved', level: 'B', requiresReview: true, contentId: 'job-b-ok' }),
    ];
    const writes: Array<{ collectionName: string; id: string }> = [];
    mockGetDoc.mockImplementation((ref: { id: string; collectionName: string }) => {
      if (ref.id === 'seo_intelligence') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ optimizationProposals: proposals, applyHistory: [] }),
        });
      }
      return Promise.resolve({ exists: () => true, data: () => ({ metaDescription: 'old B' }) });
    });
    mockSetDoc.mockImplementation((ref: { id: string; collectionName: string }, payload: Record<string, unknown>) => {
      writes.push({ collectionName: ref.collectionName, id: ref.id });
      if (ref.id === 'seo_intelligence' && Array.isArray(payload.optimizationProposals)) {
        proposals = payload.optimizationProposals as SeoOptimizationProposal[];
      }
      return Promise.resolve(undefined);
    });

    expect(previewOptimizationProposal(proposals[0]).applyable).toBe(true);
    const next = await applyOptimizationProposal('b-ok');
    expect(next[0].status).toBe('applied');
    expect(next[0].snapshotId).toBe('snap-b-ok');
    const snapIdx = writes.findIndex((item) => item.collectionName === 'seo_apply_snapshots');
    const pageIdx = writes.findIndex((item) => item.collectionName === 'jobs' && item.id === 'job-b-ok');
    expect(snapIdx).toBeGreaterThan(-1);
    expect(pageIdx).toBeGreaterThan(snapIdx);
  });
});
