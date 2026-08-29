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
  isProposalStale,
  type SeoOptimizationProposal,
} from '@/features/seo-intelligence/data/seoIntelligenceRepository';

const base = (overrides: Partial<SeoOptimizationProposal>): SeoOptimizationProposal => ({
  url: '/job/ssc-cgl-2026',
  contentType: 'JOB',
  contentId: 'job-1',
  field: 'metaDescription',
  oldValue: 'old',
  proposedValue: 'SSC CGL 2026 apply online. Last date 31/12/2026.',
  confidence: 'observed',
  status: 'approved',
  level: 'A',
  requiresReview: false,
  ...overrides,
});

// 1780272000s = 2026-06-01 (proposal createdAt);
// 1800000000s = 2027-01-15 (clearly AFTER the proposal);
// 1700000000s = 2023-11-14 (clearly BEFORE the proposal).
const CREATED_AT = '2026-06-01T00:00:00.000Z';
const STALE_SECONDS = 1800000000;
const FRESH_SECONDS = 1700000000;

function setup({ pages }: { pages: Record<string, Record<string, unknown>> }) {
  let proposals: SeoOptimizationProposal[] = [];
  const writes: Array<{ collectionName: string; id: string }> = [];

  const setProposals = (list: SeoOptimizationProposal[]) => {
    proposals = list;
  };

  mockGetDoc.mockImplementation((ref: { id: string; collectionName: string }) => {
    if (ref.id === 'seo_intelligence') {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ optimizationProposals: proposals, applyHistory: [] }),
      });
    }
    const page = pages[ref.id];
    if (page) {
      return Promise.resolve({ exists: () => true, data: () => ({ ...page }) });
    }
    return Promise.resolve({ exists: () => false, data: () => ({}) });
  });
  mockSetDoc.mockImplementation((ref: { id: string; collectionName: string }, payload: Record<string, unknown>) => {
    writes.push({ collectionName: ref.collectionName, id: ref.id });
    if (ref.id === 'seo_intelligence' && Array.isArray(payload.optimizationProposals)) {
      proposals = payload.optimizationProposals as SeoOptimizationProposal[];
    }
    return Promise.resolve(undefined);
  });

  return { writes, setProposals, getProposals: () => proposals };
}

describe('SEO proposal staleness guard (Phase 0 hygiene)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isProposalStale compares the page content-change markers against proposal createdAt', () => {
    const proposal = base({ createdAt: CREATED_AT });
    // No page change markers at all → nothing to compare → not stale.
    expect(isProposalStale(proposal, {})).toBe(false);
    // contentUpdatedAt AFTER createdAt → stale.
    expect(isProposalStale(proposal, { contentUpdatedAt: { seconds: STALE_SECONDS } })).toBe(true);
    // contentUpdatedAt BEFORE createdAt → fresh.
    expect(isProposalStale(proposal, { contentUpdatedAt: { seconds: FRESH_SECONDS } })).toBe(false);
    // seoAppliedAt AFTER createdAt → stale.
    expect(isProposalStale(proposal, { seoAppliedAt: new Date('2027-01-15T00:00:00.000Z') })).toBe(true);
    // updatedAt (ISO string) AFTER createdAt → stale.
    expect(isProposalStale(proposal, { updatedAt: '2027-01-15T00:00:00.000Z' })).toBe(true);
    // Max of several markers decides.
    expect(
      isProposalStale(proposal, {
        contentUpdatedAt: { seconds: FRESH_SECONDS },
        updatedAt: '2027-01-15T00:00:00.000Z',
      }),
    ).toBe(true);
    // Legacy proposal without createdAt → allowed (snapshot + rollback still protect).
    expect(isProposalStale(base({ createdAt: undefined }), { updatedAt: '2027-01-15T00:00:00.000Z' })).toBe(false);
  });

  it('individual Apply REFUSES a stale proposal and writes nothing', async () => {
    const { writes, setProposals } = setup({
      pages: {
        'job-stale': { metaDescription: 'old', contentUpdatedAt: { seconds: STALE_SECONDS } },
      },
    });
    setProposals([
      base({ id: 'stale-1', contentId: 'job-stale', createdAt: CREATED_AT }),
    ]);

    await expect(applyOptimizationProposal('stale-1')).rejects.toThrow(
      /modified after this proposal was generated/i,
    );
    // No snapshot, no page write, no settings update — the apply must be fully blocked.
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it('individual Apply succeeds when the page was last changed BEFORE the proposal', async () => {
    const { writes, setProposals, getProposals } = setup({
      pages: {
        'job-fresh': { metaDescription: 'old', contentUpdatedAt: { seconds: FRESH_SECONDS } },
      },
    });
    setProposals([
      base({ id: 'fresh-1', contentId: 'job-fresh', createdAt: CREATED_AT }),
    ]);

    const next = await applyOptimizationProposal('fresh-1');
    expect(next.find((item) => item.id === 'fresh-1')?.status).toBe('applied');

    const snapIdx = writes.findIndex((item) => item.collectionName === 'seo_apply_snapshots');
    const pageIdx = writes.findIndex((item) => item.collectionName === 'jobs' && item.id === 'job-fresh');
    expect(snapIdx).toBeGreaterThan(-1);
    expect(pageIdx).toBeGreaterThan(snapIdx);
    expect(getProposals().find((item) => item.id === 'fresh-1')?.status).toBe('applied');
  });

  it('individual Apply still succeeds for legacy proposals without createdAt', async () => {
    const { writes, setProposals } = setup({
      pages: {
        'job-legacy': { metaDescription: 'old', updatedAt: '2027-01-15T00:00:00.000Z' },
      },
    });
    setProposals([
      base({ id: 'legacy-1', contentId: 'job-legacy', createdAt: undefined }),
    ]);

    const next = await applyOptimizationProposal('legacy-1');
    expect(next.find((item) => item.id === 'legacy-1')?.status).toBe('applied');
    expect(writes.some((item) => item.collectionName === 'jobs' && item.id === 'job-legacy')).toBe(true);
  });

  it('bulk apply records a stale proposal as skipped-with-reason and still applies the fresh one', async () => {
    const { writes, setProposals, getProposals } = setup({
      pages: {
        'job-stale': { metaDescription: 'old', contentUpdatedAt: { seconds: STALE_SECONDS } },
        'job-fresh': { metaDescription: 'old', contentUpdatedAt: { seconds: FRESH_SECONDS } },
      },
    });
    setProposals([
      base({ id: 'bulk-stale', contentId: 'job-stale', createdAt: CREATED_AT }),
      base({ id: 'bulk-fresh', contentId: 'job-fresh', createdAt: CREATED_AT }),
    ]);

    const { results } = await applyOptimizationProposals(['bulk-stale', 'bulk-fresh']);
    const stale = results.find((item) => item.id === 'bulk-stale');
    const fresh = results.find((item) => item.id === 'bulk-fresh');

    expect(stale?.outcome).toBe('skipped');
    expect(stale?.reason).toMatch(/modified after this proposal was generated/i);
    expect(fresh?.outcome).toBe('applied');

    // The stale page must not be written; the fresh page must be.
    expect(writes.some((item) => item.collectionName === 'jobs' && item.id === 'job-stale')).toBe(false);
    expect(writes.some((item) => item.collectionName === 'jobs' && item.id === 'job-fresh')).toBe(true);
    expect(getProposals().find((item) => item.id === 'bulk-stale')?.status).toBe('approved');
    expect(getProposals().find((item) => item.id === 'bulk-fresh')?.status).toBe('applied');
  });
});
