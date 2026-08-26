import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetDoc, mockSetDoc, mockDeleteDoc } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'ai_article_drafts'),
  doc: vi.fn((_db: unknown, coll: string, id?: string) => ({ path: `${coll}/${id || 'mock-id'}`, id: id || 'mock-id' })),
  getDocs: vi.fn(),
  getDoc: mockGetDoc,
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: mockDeleteDoc,
  setDoc: mockSetDoc,
  query: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-ts'),
}));

vi.mock('@/firebase/config', () => ({
  db: {},
  auth: {},
  storage: {},
  default: { name: '[DEFAULT]' },
}));

import { classifyJobLifecycle, checkIsExpired, parseJobDate, daysUntilInIndia } from '@/utils/jobExpiry';
import { detectExamFamily, detectContentKind, enrichPublicDocument } from '@/features/seo-intelligence/taxonomy';
import {
  buildJobPublishPayload,
  buildFastTrackPublishPayload,
  publishDraftClientSide,
  EDITORIAL_AUTHOR,
} from '@/features/ai-articles/data/aiArticleRepository';

describe('SEO content workflow — lifecycle', () => {
  it('parses Indian dates and classifies closed vs open jobs', () => {
    expect(parseJobDate('31-08-2026')?.getFullYear()).toBe(2026);
    const closed = classifyJobLifecycle('01-06-2026', undefined, new Date('2026-08-26T00:00:00Z'));
    expect(closed.status).toBe('EXPIRED');
    expect(checkIsExpired('01-06-2026', new Date('2026-08-26T00:00:00Z'))).toBe(true);
    const open = classifyJobLifecycle('31-12-2026', undefined, new Date('2026-08-26T00:00:00Z'));
    expect(open.status).toBe('OPEN');
  });

  it('uses Asia/Kolkata calendar days around midnight UTC', () => {
    const lastDate = '26/08/2026';
    const stillTodayIst = new Date('2026-08-26T18:29:00Z');
    const nextIstDay = new Date('2026-08-26T18:30:00Z');
    expect(daysUntilInIndia(lastDate, stillTodayIst)).toBe(0);
    expect(checkIsExpired(lastDate, stillTodayIst)).toBe(false);
    expect(daysUntilInIndia(lastDate, nextIstDay)).toBe(-1);
    expect(checkIsExpired(lastDate, nextIstDay)).toBe(true);
  });

  it('handles tomorrow, yesterday, month/year boundaries, invalid and missing', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(daysUntilInIndia('02/01/2026', now)).toBe(1);
    expect(daysUntilInIndia('31/12/2025', now)).toBe(-1);
    expect(daysUntilInIndia('01/01/2026', now)).toBe(0);
    expect(daysUntilInIndia('', now)).toBeNull();
    expect(parseJobDate('not a date')).toBeNull();
    expect(parseJobDate('31st August 2026')?.getDate()).toBe(31);
    expect(parseJobDate('14 September 2026')?.getDate()).toBe(14);
    expect(parseJobDate('14 सितंबर 2026')?.getMonth()).toBe(8);
  });
});

describe('SEO content workflow — taxonomy + publish fields', () => {
  it('detects exam family and complementary kinds', () => {
    expect(detectExamFamily({ title: 'SSC CGL 2026' })).toBe('SSC');
    expect(detectContentKind({ type: 'FAST_TRACK', category: 'Result', title: 'CGL Result' })).toBe('RESULT');
  });

  it('adds source citation and cluster fields on job publish payload', () => {
    const payload = buildJobPublishPayload({
      id: 'draft-1',
      type: 'JOB',
      title: 'SSC CGL 2026',
      slug: 'ssc-cgl-2026',
      metaDescription: 'Apply online for SSC CGL.',
      articleHtml: '<h1>SSC CGL 2026</h1>',
      authorName: EDITORIAL_AUTHOR,
      reviewStatus: 'passed',
      reviewReport: { verdict: 'pass' },
      sourceUrl: 'https://ssc.gov.in/notice',
      facts: { organization: 'SSC', lastDate: '31/12/2026', vacancies: '10' },
    });
    expect(payload.examFamily).toBe('SSC');
    expect(payload.contentKind).toBe('JOB');
    expect(payload.searchIntent).toBe('APPLY');
    expect(payload.lastDate).toBe('2026-12-31');
    expect((payload.sourceCitation as { disclosed?: boolean }).disclosed).toBe(true);
    expect(payload.authorName).toBe(EDITORIAL_AUTHOR);
    expect(payload.status).toBe('published');
  });

  it('enriches FAST_TRACK payloads with the same canonical fields', () => {
    const payload = buildFastTrackPublishPayload({
      id: 'draft-ft',
      type: 'FAST_TRACK',
      title: 'SSC CGL Admit Card 2026',
      slug: 'ssc-cgl-admit-2026',
      metaDescription: 'Download hall ticket.',
      articleHtml: '<h1>Admit Card</h1>',
      authorName: EDITORIAL_AUTHOR,
      sourceUrl: 'https://ssc.gov.in/admit',
      facts: { category: 'Admit Card', org: 'SSC', updateDate: '01/08/2026' },
    });
    expect(payload.examFamily).toBe('SSC');
    expect(payload.contentKind).toBe('ADMIT_CARD');
    expect(payload.searchIntent).toBe('LATEST_UPDATE');
    expect((payload.sourceCitation as { disclosed?: boolean }).disclosed).toBe(true);
    expect(payload).not.toHaveProperty('youtubeUrl');
  });

  it('enrich helper never invents a youtube video or extra page', () => {
    const seo = enrichPublicDocument({ type: 'JOB', title: 'IBPS Clerk', organization: 'IBPS' });
    expect(seo.examFamily).toBe('BANKING');
    expect(seo).not.toHaveProperty('youtubeUrl');
    expect(seo).not.toHaveProperty('autoCreate');
  });
});

describe('SEO content workflow — client publish history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteDoc.mockResolvedValue(undefined);
    mockSetDoc.mockResolvedValue(undefined);
  });

  const draft = {
    id: 'draft-1',
    type: 'JOB' as const,
    title: 'SSC CGL 2026',
    slug: 'ssc-cgl-2026',
    articleHtml: '<h1>SSC CGL 2026</h1>',
    authorName: EDITORIAL_AUTHOR,
    reviewStatus: 'passed' as const,
    reviewReport: { verdict: 'pass' as const },
    status: 'draft',
    facts: { organization: 'SSC', lastDate: '31/12/2026' },
  };

  it('preserves createdAt on merge and does not rewrite history no-ops', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ createdAt: 'OLD_CREATED', publishedAt: 'OLD_PUB', title: 'SSC CGL 2026', lastDate: '2026-12-31', updateHistory: [{ at: '2026-01-01', reason: 'published', changes: [] }] }),
    });
    const result = await publishDraftClientSide(draft);
    expect(result.docId).toBe('job-ssc-cgl-2026');
    const written = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.createdAt).toBe('OLD_CREATED');
    expect(written.publishedAt).toBe('OLD_PUB');
    expect(Array.isArray(written.updateHistory)).toBe(true);
  });
});
