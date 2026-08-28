import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetDoc, mockSetDoc } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ type: 'collection', name })),
  doc: vi.fn((_db: unknown, collectionName: string, id: string) => ({ collectionName, id })),
  getDoc: mockGetDoc,
  getDocs: vi.fn(),
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

describe('Auto-Optimizer — proposal safety classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Level A proposals are approvable and applyable', () => {
    const check = checkOptimizationProposal(base({
      id: 'level-a', field: 'metaDescription', status: 'pending', level: 'A', requiresReview: false,
    }));
    expect(check.approvable).toBe(true);
    expect(check.category).toBe('needs_approval');
  });

  it('Level B proposals require review', () => {
    const check = checkOptimizationProposal(base({
      id: 'level-b', field: 'metaDescription', status: 'pending', level: 'B', requiresReview: true,
    }));
    expect(check.approvable).toBe(false);
    expect(check.category).toBe('needs_review');
  });

  it('Level C proposals are blocked', () => {
    const check = checkOptimizationProposal(base({
      id: 'level-c', field: 'salary', status: 'pending', level: 'C', requiresReview: true, proposedValue: '₹50000',
    }));
    expect(check.isLevelC).toBe(true);
    expect(check.category).toBe('blocked');
  });

  it('fact fields are always blocked', () => {
    const factFields = [
      'organization', 'vacancies', 'salary', 'qualification', 'eligibility',
      'lastDate', 'startDate', 'fees', 'applyLink', 'directLink', 'questions', 'answers',
    ];
    for (const field of factFields) {
      const check = checkOptimizationProposal(base({
        id: `fact-${field}`, field, status: 'approved', level: 'A', requiresReview: false,
      }));
      expect(check.isFactField).toBe(true);
      expect(check.applyable).toBe(false);
    }
  });

  it('approved Level A proposals are ready to apply', () => {
    const check = checkOptimizationProposal(base({
      id: 'ready', field: 'metaDescription', status: 'approved', level: 'A', requiresReview: false,
    }));
    expect(check.applyable).toBe(true);
    expect(check.category).toBe('ready');
  });

  it('bulk check summarizes correctly', () => {
    const { summary } = checkOptimizationProposals([
      base({ id: 'a1', field: 'metaDescription', status: 'pending', level: 'A', requiresReview: false }),
      base({ id: 'b1', field: 'metaDescription', status: 'pending', level: 'B', requiresReview: true }),
      base({ id: 'c1', field: 'salary', status: 'pending', level: 'C', requiresReview: true, proposedValue: null }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.needsApproval).toBe(1);
    expect(summary.needsReview).toBe(1);
    expect(summary.levelC).toBe(1);
  });
});

describe('Auto-Optimizer — idempotency', () => {
  it('same proposal id produces same check result', () => {
    const c1 = checkOptimizationProposal(base({ id: 'same', field: 'metaDescription', status: 'pending', level: 'A', requiresReview: false }));
    const c2 = checkOptimizationProposal(base({ id: 'same', field: 'metaDescription', status: 'pending', level: 'A', requiresReview: false }));
    expect(c1.proposalId).toBe(c2.proposalId);
    expect(c1.category).toBe(c2.category);
  });

  it('applied proposals are not re-approvable', () => {
    const check = checkOptimizationProposal(base({
      id: 'applied', field: 'metaDescription', status: 'applied', level: 'A', requiresReview: false, applied: true,
    }));
    expect(check.category).toBe('applied');
    expect(check.approvable).toBe(false);
  });

  it('rejected proposals are not re-approvable', () => {
    const check = checkOptimizationProposal(base({
      id: 'rejected', field: 'metaDescription', status: 'rejected', level: 'A', requiresReview: false,
    }));
    expect(check.category).toBe('rejected');
    expect(check.approvable).toBe(false);
  });
});

describe('Auto-Optimizer — content type protection', () => {
  it('articleHtml is blocked for MOCK_TEST', () => {
    const check = checkOptimizationProposal(base({
      id: 'mock-html', field: 'articleHtml', status: 'approved', level: 'B', requiresReview: true,
      contentType: 'MOCK_TEST', proposedValue: { articleHtml: '<p>test</p>' },
    }));
    expect(check.applyable).toBe(false);
  });

  it('articleHtml is blocked for STUDY_MATERIAL', () => {
    const check = checkOptimizationProposal(base({
      id: 'sm-html', field: 'articleHtml', status: 'approved', level: 'B', requiresReview: true,
      contentType: 'STUDY_MATERIAL', proposedValue: { articleHtml: '<p>test</p>' },
    }));
    expect(check.applyable).toBe(false);
  });

  it('articleHtml requires review for JOB (Level B)', () => {
    const check = checkOptimizationProposal(base({
      id: 'job-html', field: 'articleHtml', status: 'approved', level: 'B', requiresReview: true,
      contentType: 'JOB', proposedValue: { articleHtml: '<p>safe content</p>' },
    }));
    expect(check.requiresReview).toBe(true);
  });
});

describe('Auto-Optimizer — failure safety', () => {
  it('missing contentId blocks apply', () => {
    const check = checkOptimizationProposal(base({
      id: 'no-content', field: 'metaDescription', status: 'approved', level: 'A', requiresReview: false, contentId: '',
    }));
    expect(check.hasDocumentMapping).toBe(false);
    expect(check.applyable).toBe(false);
  });

  it('missing contentType blocks apply', () => {
    const check = checkOptimizationProposal(base({
      id: 'no-type', field: 'metaDescription', status: 'approved', level: 'A', requiresReview: false, contentType: '',
    }));
    expect(check.hasDocumentMapping).toBe(false);
    expect(check.applyable).toBe(false);
  });

  it('preview blocks pending proposals', () => {
    const preview = previewOptimizationProposal(base({
      id: 'pending', field: 'metaDescription', status: 'pending', level: 'A', requiresReview: false,
    }));
    expect(preview.applyable).toBe(false);
    expect(preview.reason).toMatch(/approve/i);
  });
});
