// =============================================================
// AI Article Agent Workflow Tests
// Covers src/features/ai-articles/data/aiArticleRepository.ts
//  - draft repository CRUD
//  - publish gate (failed review blocks publishing)
//  - publish payload mapping into jobs / fast_track shapes
//  - backend API client behavior
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// Hoisted mock factories for Firestore
// ------------------------------------------------------------------
const {
  mockGetDocs,
  mockGetDoc,
  mockAddDoc,
  mockSetDoc,
  mockUpdateDoc,
  mockDeleteDoc,
} = vi.hoisted(() => ({
  mockGetDocs: vi.fn(),
  mockGetDoc: vi.fn(),
  mockAddDoc: vi.fn(),
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'ai_article_drafts'),
  doc: vi.fn((_db: unknown, _coll: string, id?: string) => ({ id: id || 'mock-id' })),
  getDocs: mockGetDocs,
  getDoc: mockGetDoc,
  addDoc: mockAddDoc,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  query: vi.fn(() => 'mock-query'),
  orderBy: vi.fn(() => 'mock-order'),
  serverTimestamp: vi.fn(() => 'server-ts'),
}));

vi.mock('@/firebase/config', () => ({
  db: {},
  auth: {},
  storage: {},
  default: { name: '[DEFAULT]' },
}));

import aiArticleRepository, {
  canPublishDraft,
  assertDraftPublishable,
  buildJobPublishPayload,
  buildFastTrackPublishPayload,
  buildPublishPayloadFromDraft,
  callArticleApi,
  EDITORIAL_AUTHOR,
  type AIArticleDraftRecord,
} from '@/features/ai-articles/data/aiArticleRepository';

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------

function passedDraft(overrides: Partial<AIArticleDraftRecord> = {}): AIArticleDraftRecord {
  return {
    id: 'draft-1',
    type: 'JOB',
    articleType: 'job',
    status: 'draft',
    reviewStatus: 'passed',
    publishBlocked: false,
    reviewStale: false,
    reviewReport: { verdict: 'pass', score: 96, issues: [], warnings: [] },
    title: 'SSC CGL 2026',
    h1: 'SSC CGL 2026 Recruitment',
    slug: 'ssc-cgl-2026-recruitment',
    seoTitle: 'SSC CGL 2026 Recruitment 5432 Posts - Apply Online',
    metaDescription: 'SSC CGL 2026 भर्ती — 5432 पद, apply online before 31/07/2026.',
    shortDescription: 'SSC ने CGL 2026 notification जारी किया।',
    articleHtml: '<h1>SSC CGL 2026 Recruitment</h1><p>details…</p>',
    faqs: [
      { question: 'अंतिम तिथि?', answer: '31/07/2026' },
      { question: 'शुल्क?', answer: 'Rs. 100' },
      { question: 'पद?', answer: '5432' },
      { question: 'योग्यता?', answer: 'Bachelor Degree' },
    ],
    facts: {
      title: 'SSC CGL 2026',
      organization: 'Staff Selection Commission (SSC)',
      vacancies: '5432',
      startDate: '01/07/2026',
      lastDate: '31/07/2026',
      salary: 'Level 4-8',
      qualification: 'Bachelor Degree',
      feeGen: '100',
      feeSCST: '0',
      applyLink: 'https://ssc.gov.in/apply-cgl-2026',
      notificationLink: '',
      officialSiteLink: '',
      category: 'ssc',
    },
    officialLinks: [{ label: 'Apply Online', url: 'https://ssc.gov.in/apply-cgl-2026' }],
    keywords: ['ssc cgl 2026'],
    structuredData: '[{"@type":"JobPosting"}]',
    authorName: EDITORIAL_AUTHOR,
    wordCount: 1980,
    sourceUrl: 'https://ssc.gov.in/portal/cgl-notification-2026',
    publishedDocId: null,
    ...overrides,
  };
}

// ------------------------------------------------------------------

describe('AI Article Workflow — repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists drafts newest-first', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'd1', data: () => ({ title: 'Job A', reviewStatus: 'passed' }) },
        { id: 'd2', data: () => ({ title: 'Job B', reviewStatus: 'failed' }) },
      ],
    });
    const list = await aiArticleRepository.listDrafts();
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual(expect.objectContaining({ id: 'd1', title: 'Job A' }));
  });

  it('getDraft returns record or null', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'd1',
      data: () => ({ title: 'X' }),
    });
    expect(await aiArticleRepository.getDraft('d1')).toEqual(expect.objectContaining({ id: 'd1', title: 'X' }));

    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    expect(await aiArticleRepository.getDraft('missing')).toBeNull();
  });

  it('updateDraft and deleteDraft call Firestore', async () => {
    await aiArticleRepository.updateDraft('d1', { title: 'New', reviewStale: true });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    await aiArticleRepository.deleteDraft('d1');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });
});

describe('AI Article Workflow — publish gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('allows publishing only a passed, fresh, unpublished draft', () => {
    const gate = canPublishDraft(passedDraft());
    expect(gate.ok).toBe(true);
    expect(() => assertDraftPublishable(passedDraft())).not.toThrow();
  });

  it('blocks publishing when the fact review failed', () => {
    const failed = passedDraft({ reviewStatus: 'failed', reviewReport: { verdict: 'fail', issues: ['hallucination:date:"15/09/2026"'] } });
    const gate = canPublishDraft(failed);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('hallucination');
    expect(() => assertDraftPublishable(failed)).toThrowError(/review/i);
  });

  it('blocks publishing after unreviewed edits (reviewStale)', () => {
    const stale = passedDraft({ reviewStale: true });
    expect(canPublishDraft(stale).ok).toBe(false);
    expect(() => assertDraftPublishable(stale)).toThrow();
  });

  it('blocks double publishing', () => {
    const published = passedDraft({ status: 'published' });
    expect(canPublishDraft(published).ok).toBe(false);
    expect(() => assertDraftPublishable(published)).toThrow();
  });

  it('blocks fake/individual authorship labels', () => {
    const fakeAuthor = passedDraft({ authorName: 'Rahul Kumar' });
    expect(canPublishDraft(fakeAuthor).ok).toBe(false);
  });

  it('blocks drafts missing a review entirely', () => {
    const noReview = passedDraft({ reviewStatus: undefined, reviewReport: null });
    expect(canPublishDraft(noReview).ok).toBe(false);
  });
});

describe('AI Article Workflow — publish payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('maps job drafts into the existing jobs document shape', () => {
    const payload = buildJobPublishPayload(passedDraft());
    expect(payload.type).toBe('JOB');
    expect(payload.status).toBe('published');
    expect(payload.authorName).toBe(EDITORIAL_AUTHOR);
    expect(payload.organization).toBe('Staff Selection Commission (SSC)');
    expect(payload.vacancies).toBe('5432');
    expect(payload.lastDate).toBe('31/07/2026');
    expect(payload.applyLink).toBe('https://ssc.gov.in/apply-cgl-2026');
    expect(payload.notificationLink).toBeUndefined(); // empty facts are stripped
    expect(payload.faqs).toHaveLength(4);
    expect(payload.schemaMarkup).toContain('JobPosting');
    expect(payload.publishedFromDraftId).toBe('draft-1');
  });

  it('maps fast-track drafts into the existing fast_track document shape', () => {
    const ft = passedDraft({
      type: 'FAST_TRACK',
      facts: { title: 'SSC CGL Result 2026', category: 'Result', org: 'SSC', updateDate: '27/07/2026', directLink: 'https://ssc.gov.in/result' },
    });
    const payload = buildFastTrackPublishPayload(ft);
    expect(payload.status).toBe('published');
    expect(payload.category).toBe('Result');
    expect(payload.directLink).toBe('https://ssc.gov.in/result');
    expect(payload.authorName).toBe(EDITORIAL_AUTHOR);
  });

  it('routes JOB → jobs and FAST_TRACK → fast_track', () => {
    expect(buildPublishPayloadFromDraft(passedDraft()).collection).toBe('jobs');
    expect(buildPublishPayloadFromDraft(passedDraft({ type: 'FAST_TRACK' })).collection).toBe('fast_track');
  });

  it('client-side publish writes with merged setDoc and marks the draft published', async () => {
    const result = await aiArticleRepository.publishDraftClientSide(passedDraft());
    expect(result.collection).toBe('jobs');
    expect(result.docId).toBe('job-ssc-cgl-2026-recruitment');
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const setDocArgs = mockSetDoc.mock.calls[0];
    expect(setDocArgs[1]).toEqual(expect.objectContaining({ type: 'JOB', status: 'published', authorName: EDITORIAL_AUTHOR }));
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
  });

  it('client-side publish refuses failed reviews (same gate as backend)', async () => {
    const failed = passedDraft({ reviewStatus: 'failed', reviewReport: { verdict: 'fail', issues: ['x'] } });
    await expect(aiArticleRepository.publishDraftClientSide(failed)).rejects.toThrow();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

describe('AI Article Workflow — backend API client', () => {
  it('sends token header and parses JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, draftId: 'abc' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await callArticleApi('/articles/generate', { type: 'job', sourceUrl: 'https://ssc.gov.in/x' }, { token: 'secret-token', baseUrl: 'https://api.example.com' });

    expect(res.success).toBe(true);
    expect(res.draftId).toBe('abc');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/articles/generate');
    expect(options.method).toBe('POST');
    expect(options.headers['x-agent-token']).toBe('secret-token');
    vi.unstubAllGlobals();
  });

  it('surfaces backend publish-block (409) as an error with status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: 'Publish blocked: Fact & Quality review FAILED', publishBlocked: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(callArticleApi('/articles/publish', { draftId: 'd1' }, { token: 't', baseUrl: 'https://api.example.com' }))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('Publish blocked') });
    vi.unstubAllGlobals();
  });
});
