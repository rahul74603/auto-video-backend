import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'ai_article_drafts'),
  doc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
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

import { classifyJobLifecycle, checkIsExpired, parseJobDate } from '@/utils/jobExpiry';
import { detectExamFamily, detectContentKind, enrichPublicDocument } from '@/features/seo-intelligence/taxonomy';
import { buildJobPublishPayload, EDITORIAL_AUTHOR } from '@/features/ai-articles/data/aiArticleRepository';

describe('SEO content workflow — lifecycle', () => {
  it('parses Indian dates and classifies closed vs open jobs', () => {
    expect(parseJobDate('31-08-2026')?.getFullYear()).toBe(2026);
    const closed = classifyJobLifecycle('01-06-2026', undefined, new Date('2026-08-26'));
    expect(closed.status).toBe('EXPIRED');
    expect(checkIsExpired('01-06-2026')).toBe(true);
    const open = classifyJobLifecycle('31-12-2026', undefined, new Date('2026-08-26'));
    expect(open.status).toBe('OPEN');
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
    expect((payload.sourceCitation as { disclosed?: boolean }).disclosed).toBe(true);
    expect(payload.authorName).toBe(EDITORIAL_AUTHOR);
    expect(payload.status).toBe('published');
  });

  it('enrich helper never invents a youtube video or extra page', () => {
    const seo = enrichPublicDocument({ type: 'JOB', title: 'IBPS Clerk', organization: 'IBPS' });
    expect(seo.examFamily).toBe('BANKING');
    expect(seo).not.toHaveProperty('youtubeUrl');
    expect(seo).not.toHaveProperty('autoCreate');
  });
});
