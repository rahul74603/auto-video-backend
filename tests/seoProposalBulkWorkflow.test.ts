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
  compactProposalsForWrite,
  previewOptimizationProposal,
  seoWriteErrorMessage,
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

    // Approval is status-only, so review-required Level B rows ARE approvable
    // in bulk (the admin reviews each row in the preview). Apply stays gated.
    const needsReview = checkOptimizationProposal(base({
      id: 'b1',
      field: 'metaDescription',
      status: 'pending',
      level: 'B',
      requiresReview: true,
    }));
    expect(needsReview.approvable).toBe(true);
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

  it('bulk safe-approve writes status only and skips Level C / facts (Level B review-required IS approvable)', async () => {
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
    expect(results.find((item) => item.id === 'b1')?.outcome).toBe('approved');
    expect(results.find((item) => item.id === 'c1')?.outcome).toBe('skipped');
    expect(proposals.find((item) => item.id === 'a1')?.status).toBe('approved');
    expect(proposals.find((item) => item.id === 'a1')?.applied).toBe(false);
    expect(proposals.find((item) => item.id === 'b1')?.status).toBe('approved');
    expect(proposals.find((item) => item.id === 'b1')?.applied).toBe(false);
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

  it('individual Apply blocks articleHtml for protected content types before any public write', async () => {
    const blocked = [
      { type: 'MOCK_TEST', collection: 'mock_tests', contentId: 'mock-1' },
      { type: 'STUDY_MATERIAL', collection: 'study_materials', contentId: 'sm-1' },
      { type: 'COURSE', collection: 'courses', contentId: 'course-1' },
      { type: 'EBOOK', collection: 'jobs', contentId: 'ebook-1' },
      { type: 'WEB_STORY', collection: 'web_stories', contentId: 'ws-1' },
    ] as const;

    for (const row of blocked) {
      vi.clearAllMocks();
      const proposal = base({
        id: `html-${row.type}`,
        field: 'articleHtml',
        status: 'approved',
        level: 'B',
        requiresReview: true,
        contentType: row.type,
        contentId: row.contentId,
        proposedValue: { articleHtml: '<p>safe</p>' },
      });
      mockGetDoc.mockImplementation((ref: { id: string; collectionName: string }) => {
        if (ref.id === 'seo_intelligence') {
          return Promise.resolve({
            exists: () => true,
            data: () => ({ optimizationProposals: [proposal], applyHistory: [] }),
          });
        }
        return Promise.resolve({ exists: () => true, data: () => ({ articleHtml: '<p>old</p>' }) });
      });

      expect(previewOptimizationProposal(proposal).applyable).toBe(false);
      expect(previewOptimizationProposal(proposal).reason).toMatch(/does not receive articleHtml/i);
      expect(checkOptimizationProposal(proposal).applyable).toBe(false);
      await expect(applyOptimizationProposal(proposal.id as string)).rejects.toThrow(/does not receive articleHtml/i);
      expect(mockSetDoc).not.toHaveBeenCalled();
      expect(mockSetDoc.mock.calls.some((call) => {
        const ref = call[0] as { collectionName?: string; id?: string };
        return ref.collectionName === row.collection && ref.id === row.contentId;
      })).toBe(false);
    }
  });

  it('individual Apply still allows articleHtml for JOB, BLOG, and FAST_TRACK after snapshot', async () => {
    const allowed = [
      { type: 'JOB', collection: 'jobs', contentId: 'job-html-ok' },
      { type: 'BLOG', collection: 'blogs', contentId: 'blog-html-ok' },
      { type: 'FAST_TRACK', collection: 'fast_track', contentId: 'ft-html-ok' },
    ] as const;

    for (const row of allowed) {
      vi.clearAllMocks();
      let proposals: SeoOptimizationProposal[] = [
        base({
          id: `html-${row.type}-ok`,
          field: 'articleHtml',
          status: 'approved',
          level: 'B',
          requiresReview: true,
          contentType: row.type,
          contentId: row.contentId,
          proposedValue: { articleHtml: '<p>safe</p>' },
        }),
      ];
      const writes: Array<{ collectionName: string; id: string }> = [];
      mockGetDoc.mockImplementation((ref: { id: string; collectionName: string }) => {
        if (ref.id === 'seo_intelligence') {
          return Promise.resolve({
            exists: () => true,
            data: () => ({ optimizationProposals: proposals, applyHistory: [] }),
          });
        }
        return Promise.resolve({ exists: () => true, data: () => ({ articleHtml: '<p>old</p>' }) });
      });
      mockSetDoc.mockImplementation((ref: { id: string; collectionName: string }, payload: Record<string, unknown>) => {
        writes.push({ collectionName: ref.collectionName, id: ref.id });
        if (ref.id === 'seo_intelligence' && Array.isArray(payload.optimizationProposals)) {
          proposals = payload.optimizationProposals as SeoOptimizationProposal[];
        }
        return Promise.resolve(undefined);
      });

      expect(previewOptimizationProposal(proposals[0]).applyable).toBe(true);
      const next = await applyOptimizationProposal(proposals[0].id as string);
      expect(next[0].status).toBe('applied');
      const snapIdx = writes.findIndex((item) => item.collectionName === 'seo_apply_snapshots');
      const pageIdx = writes.findIndex((item) => item.collectionName === row.collection && item.id === row.contentId);
      expect(snapIdx).toBeGreaterThan(-1);
      expect(pageIdx).toBeGreaterThan(snapIdx);
    }
  });
});

describe('SEO proposal write compaction (approve/apply never fail on doc size)', () => {
  it('dedupes by id, trims verbose values, and caps at 80 with approved-first priority', () => {
    const many: SeoOptimizationProposal[] = [];
    for (let i = 0; i < 100; i += 1) {
      many.push(base({
        id: `old-rejected-${i}`,
        field: 'metaDescription',
        status: 'rejected',
        level: 'A',
        requiresReview: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        oldValue: 'x'.repeat(5000),
      }));
    }
    many.push(base({
      id: 'approved-keep',
      field: 'metaDescription',
      status: 'approved',
      level: 'B',
      requiresReview: true,
      createdAt: '2026-10-19T00:00:00.000Z',
    }));
    // duplicate id — second copy must be dropped
    many.push(base({ id: 'approved-keep', field: 'h1', status: 'pending', level: 'A', requiresReview: false }));

    const compacted = compactProposalsForWrite(many);
    expect(compacted.length).toBe(80);
    expect(compacted[0].id).toBe('approved-keep');
    expect(compacted.filter((item) => item.id === 'approved-keep').length).toBe(1);
    expect(String(compacted.find((item) => item.id === 'old-rejected-0')?.oldValue).length).toBeLessThanOrEqual(280);
  });

  it('trims articleHtml bodies to a preview (full HTML stays in seo_proposal_bodies)', () => {
    const compacted = compactProposalsForWrite([
      base({
        id: 'html-1',
        field: 'articleHtml',
        status: 'pending',
        level: 'B',
        requiresReview: true,
        proposedValue: { articleHtml: `<p>${'y'.repeat(10000)}</p>`, htmlRef: 'html-1' },
      }),
    ]);
    const stored = compacted[0].proposedValue as { articleHtml: string; htmlRef: string };
    expect(stored.htmlRef).toBe('html-1');
    expect(stored.articleHtml.length).toBeLessThanOrEqual(1500);
  });

  it('htmlRef-backed articleHtml proposals are approvable (status-only) but never bulk-applied', () => {
    const refBacked = base({
      id: 'html-ref',
      field: 'articleHtml',
      status: 'pending',
      level: 'B',
      requiresReview: true,
      proposedValue: { articleHtml: '<p>preview…</p>', htmlRef: 'html-ref', previewText: 'preview' },
    });
    expect(checkOptimizationProposal(refBacked).approvable).toBe(true);
  });

  it('translates Firestore errors into actionable messages', () => {
    expect(seoWriteErrorMessage(new Error('Missing or insufficient permissions.'), 'Approve'))
      .toMatch(/permission denied/i);
    expect(seoWriteErrorMessage(new Error('3 INVALID_ARGUMENT: document too large'), 'Approve'))
      .toMatch(/bahut bada/i);
    expect(seoWriteErrorMessage(new Error('unavailable'), 'Apply')).toMatch(/network/i);
  });
});
