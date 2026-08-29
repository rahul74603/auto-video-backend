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
  buildSeoChangeEvent,
  buildSeoEventGscJoinKey,
  classifySeoEventLifecycle,
  isLifecycleEligibleForAutomaticOptimization,
  recordSeoChangeEvent,
  rollbackOptimizationProposal,
  fetchSeoChangeHistorySummary,
  type SeoChangeEvent,
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
  createdAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

const CREATED_AT = '2026-06-01T00:00:00.000Z';
const FRESH_SECONDS = 1700000000; // 2023-11-14 — before the proposal (staleness guard passes)

function setup({ pages, events }: { pages: Record<string, Record<string, unknown>>; events?: Map<string, Record<string, unknown>> }) {
  const eventStoreMap = events || new Map<string, Record<string, unknown>>();
  const snapshotStore = new Map<string, Record<string, unknown>>();
  const writes: Array<{ collectionName: string; id: string; data: Record<string, unknown> }> = [];
  let proposals: SeoOptimizationProposal[] = [];

  const setProposals = (list: SeoOptimizationProposal[]) => {
    proposals = list;
  };

  mockGetDoc.mockImplementation((ref: { id: string; collectionName: string }) => {
    if (ref.collectionName === 'seo_change_events') {
      return Promise.resolve({
        exists: () => eventStoreMap.has(ref.id),
        data: () => eventStoreMap.get(ref.id) || {},
      });
    }
    if (ref.collectionName === 'seo_apply_snapshots') {
      return Promise.resolve({
        exists: () => snapshotStore.has(ref.id),
        data: () => snapshotStore.get(ref.id) || {},
      });
    }
    if (ref.id === 'seo_intelligence') {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ optimizationProposals: proposals, applyHistory: [] }),
      });
    }
    const page = pages[ref.id];
    if (page) return Promise.resolve({ exists: () => true, data: () => ({ ...page }) });
    return Promise.resolve({ exists: () => false, data: () => ({}) });
  });

  mockSetDoc.mockImplementation((ref: { id: string; collectionName: string }, payload: Record<string, unknown>) => {
    writes.push({ collectionName: ref.collectionName, id: ref.id, data: payload });
    if (ref.collectionName === 'seo_change_events') {
      eventStoreMap.set(ref.id, { ...(eventStoreMap.get(ref.id) || {}), ...payload });
    } else if (ref.collectionName === 'seo_apply_snapshots') {
      snapshotStore.set(ref.id, { ...(snapshotStore.get(ref.id) || {}), ...payload });
    } else if (ref.id === 'seo_intelligence' && Array.isArray(payload.optimizationProposals)) {
      proposals = payload.optimizationProposals as SeoOptimizationProposal[];
    }
    return Promise.resolve(undefined);
  });

  return { writes, setProposals, eventStoreMap, snapshotStore, getProposals: () => proposals };
}

const JOB_PAGE = { metaDescription: 'old', lastDate: '2099-12-31', contentUpdatedAt: { seconds: FRESH_SECONDS } };

describe('SEO Change Events Ledger (Phase 2 — dashboard path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('an applied proposal creates exactly one ledger event with values, refs, lifecycle and GSC join key', async () => {
    const harness = setup({ pages: { 'job-1': JOB_PAGE } });
    harness.setProposals([base({ id: 'evt-1' })]);

    await applyOptimizationProposal('evt-1');

    const eventWrites = harness.writes.filter((write) => write.collectionName === 'seo_change_events');
    expect(eventWrites).toHaveLength(1);
    const event = eventWrites[0].data as unknown as SeoChangeEvent;

    expect(event.kind).toBe('applied');
    expect(event.eventType).toBe('seo-change-applied');
    expect(event.schemaVersion).toBe(1);
    expect(event.contentId).toBe('job-1');
    expect(event.collection).toBe('jobs');
    expect(event.contentType).toBe('JOB');
    expect(event.field).toBe('metaDescription');
    expect(event.fieldGroup).toBe('metadata');
    expect(event.oldValue).toEqual({ kind: 'inline', value: 'old' });
    expect(event.newValue).toEqual({ kind: 'inline', value: 'SSC CGL 2026 apply online. Last date 31/12/2026.' });
    expect(event.proposalId).toBe('evt-1');
    expect(event.proposalCreatedAt).toBe(CREATED_AT);
    expect(event.proposalLevel).toBe('A');
    expect(event.snapshotId).toContain('evt-1');
    expect(event.source).toBe('admin-dashboard');
    expect(event.autoApplied).toBe(false);
    expect(event.manualApproved).toBe(true);
    expect(event.status).toBe('applied');
    expect(event.gscJoinKey).toBe('https://studygyaan.in/job/ssc-cgl-2026');
    expect(event.lifecycle.status).toBe('OPEN');
    expect(event.eligibleForAutomaticOptimization).toBe(true);
    // No credentials anywhere on the event
    expect(JSON.stringify(event)).not.toMatch(/private_key|Bearer |client_email|access_token/i);
  });

  it('CHECK / preview paths never write an applied-change event', async () => {
    const harness = setup({ pages: { 'job-1': JOB_PAGE } });
    harness.setProposals([base({ id: 'chk-1', status: 'pending' })]);

    // previewOptimizationProposal is pure — no writes at all
    // (covered by existing tests); a pending proposal apply is refused.
    await expect(applyOptimizationProposal('chk-1')).rejects.toThrow(/approved/i);
    const eventWrites = harness.writes.filter((write) => write.collectionName === 'seo_change_events');
    expect(eventWrites).toHaveLength(0);
  });

  it('a rejected proposal is never recorded as applied', async () => {
    const harness = setup({ pages: { 'job-1': JOB_PAGE } });
    harness.setProposals([base({ id: 'rej-1', status: 'rejected' })]);

    await expect(applyOptimizationProposal('rej-1')).rejects.toThrow(/approved/i);
    expect(harness.writes).toHaveLength(0);
  });

  it('rollback creates a NEW event that references the original, and preserves history', async () => {
    const harness = setup({ pages: { 'job-1': JOB_PAGE } });
    harness.setProposals([base({ id: 'rb-1' })]);
    await applyOptimizationProposal('rb-1');

    const appliedEvent = harness.eventStoreMap.size
      ? [...harness.eventStoreMap.values()][0] as unknown as SeoChangeEvent
      : null;
    expect(appliedEvent?.kind).toBe('applied');

    await rollbackOptimizationProposal('rb-1');

    const events = [...harness.eventStoreMap.values()] as unknown as SeoChangeEvent[];
    expect(events).toHaveLength(2);
    const rollbackEvent = events.find((event) => event.kind === 'rolled_back');
    const stillApplied = events.find((event) => event.kind === 'applied');
    expect(rollbackEvent).toBeDefined();
    expect(stillApplied).toBeDefined();
    // Original event preserved + referenced
    expect(rollbackEvent?.rollbackOfEventId).toBe(stillApplied?.eventId);
    // Rollback values: undone value → restored value
    expect(rollbackEvent?.oldValue).toEqual({ kind: 'inline', value: 'SSC CGL 2026 apply online. Last date 31/12/2026.' });
    expect(rollbackEvent?.newValue).toEqual({ kind: 'inline', value: 'old' });
    expect(rollbackEvent?.status).toBe('rolled_back');
  });

  it('retrying the exact same change is idempotent; a same-key different-core event appends with a suffix', async () => {
    const harness = setup({ pages: {} });
    const event = buildSeoChangeEvent({
      kind: 'applied',
      proposal: base({ id: 'idem-1' }),
      collectionName: 'jobs',
      contentId: 'job-1',
      contentType: 'JOB',
      pageUrl: '/job/x',
      page: JOB_PAGE,
      field: 'metaDescription',
      oldValue: 'a',
      newValue: 'b',
      snapshotId: 'snap-1',
      at: '2026-08-26T00:00:00.000Z',
    });
    const first = await recordSeoChangeEvent(event);
    expect(first.written).toBe(true);

    // Identical re-execution (retry) → skipped, no duplicate
    const retry = await recordSeoChangeEvent(event);
    expect(retry.written).toBe(false);
    expect(retry.eventId).toBe(first.eventId);
    expect(harness.eventStoreMap.size).toBe(1);

    // Same key, different content (rollback linkage present) → suffixed
    // append; original untouched. Built from the same raw inputs so the
    // idempotency key matches; only the core identity differs.
    const altered = buildSeoChangeEvent({
      kind: 'applied',
      proposal: base({ id: 'idem-1' }),
      collectionName: 'jobs',
      contentId: 'job-1',
      contentType: 'JOB',
      pageUrl: '/job/x',
      page: JOB_PAGE,
      field: 'metaDescription',
      oldValue: 'a',
      newValue: 'b',
      snapshotId: 'snap-1',
      at: '2026-08-26T00:00:00.000Z',
      rolledBackFrom: { eventId: 'other' },
    });
    expect(altered.eventId).toBe(first.eventId);
    const second = await recordSeoChangeEvent(altered);
    expect(second.written).toBe(true);
    expect(second.eventId).toBe(`${first.eventId}-2`);
    expect(harness.eventStoreMap.size).toBe(2);
  });

  it('large articleHtml uses the compact representation with a snapshot reference', () => {
    const html = `<p>${'SSC CGL preparation content. '.repeat(120)}</p>`;
    const event = buildSeoChangeEvent({
      kind: 'applied',
      proposal: base({ id: 'html-1', field: 'articleHtml' }),
      collectionName: 'blogs',
      contentId: 'blog-1',
      contentType: 'BLOG',
      pageUrl: '/blog/prep',
      page: {},
      field: 'articleHtml',
      oldValue: null,
      newValue: html,
      snapshotId: 'snap-html',
      at: '2026-08-26T00:00:00.000Z',
    });
    expect(event.newValue.kind).toBe('compact');
    if (event.newValue.kind === 'compact') {
      expect(event.newValue.length).toBe(html.length);
      expect(event.newValue.snapshotId).toBe('snap-html');
      expect(event.newValue.preview.length).toBeLessThanOrEqual(200);
    }
    // Full HTML must NOT be duplicated into the event
    expect(JSON.stringify(event)).not.toContain(html.slice(0, 300));
    // Deterministic
    const again = buildSeoChangeEvent({
      kind: 'applied',
      proposal: base({ id: 'html-1', field: 'articleHtml' }),
      collectionName: 'blogs',
      contentId: 'blog-1',
      contentType: 'BLOG',
      pageUrl: '/blog/prep',
      page: {},
      field: 'articleHtml',
      oldValue: null,
      newValue: html,
      snapshotId: 'snap-html',
      at: '2026-08-26T00:00:00.000Z',
    });
    expect(again.eventId).toBe(event.eventId);
  });

  it('JOB lifecycle is captured; EXPIRED jobs are never automatic-optimization targets', () => {
    const open = classifySeoEventLifecycle({ lastDate: '2099-12-31' }, 'JOB');
    expect(['OPEN', 'UPCOMING']).toContain(open.status);
    expect(open.source).toBe('job_lifecycle');

    const expired = classifySeoEventLifecycle({ lastDate: '2026-01-01' }, 'JOB', new Date('2026-08-26T00:00:00Z'));
    expect(expired.status).toBe('EXPIRED');
    expect(isLifecycleEligibleForAutomaticOptimization(expired.status)).toBe(false);

    const event = buildSeoChangeEvent({
      kind: 'applied',
      proposal: base({ id: 'exp-1' }),
      collectionName: 'jobs',
      contentId: 'job-exp',
      contentType: 'JOB',
      pageUrl: '/job/expired',
      page: { lastDate: '2026-01-01' },
      field: 'metaDescription',
      oldValue: 'a',
      newValue: 'b',
      at: '2026-08-26T00:00:00.000Z',
    });
    expect(event.lifecycle.status).toBe('EXPIRED');
    expect(event.eligibleForAutomaticOptimization).toBe(false);
  });

  it('FAST_TRACK lifecycle via facts.lastDate is captured; expired is a hard boundary', () => {
    const expiredFt = classifySeoEventLifecycle({ facts: { lastDate: '2026-01-01' } }, 'FAST_TRACK', new Date('2026-08-26T00:00:00Z'));
    expect(expiredFt.status).toBe('EXPIRED');
    expect(expiredFt.source).toBe('fast-track-last-date');
    expect(isLifecycleEligibleForAutomaticOptimization(expiredFt.status)).toBe(false);

    const noDateFt = classifySeoEventLifecycle({}, 'FAST_TRACK');
    expect(noDateFt.status).toBe('UNKNOWN');
    expect(isLifecycleEligibleForAutomaticOptimization(noDateFt.status)).toBe(false);
  });

  it('blog events are represented with NOT_APPLICABLE lifecycle', () => {
    const event = buildSeoChangeEvent({
      kind: 'applied',
      proposal: base({ id: 'blog-evt', contentType: 'BLOG', contentId: 'blog-9' }),
      collectionName: 'blogs',
      contentId: 'blog-9',
      contentType: 'BLOG',
      pageUrl: '/blog/tips',
      page: {},
      field: 'seoTitle',
      oldValue: 'x',
      newValue: 'y',
      at: '2026-08-26T00:00:00.000Z',
    });
    expect(event.contentType).toBe('BLOG');
    expect(event.lifecycle.status).toBe('NOT_APPLICABLE');
    expect(event.eligibleForAutomaticOptimization).toBe(true);
  });

  it('GSC join key matches Phase 1 normalization and never merges query strings', () => {
    expect(buildSeoEventGscJoinKey('/job/ssc-cgl-2026')).toBe('https://studygyaan.in/job/ssc-cgl-2026');
    expect(buildSeoEventGscJoinKey('HTTPS://StudyGyaan.IN/job/a/#top')).toBe('https://studygyaan.in/job/a');
    expect(buildSeoEventGscJoinKey('/job/a?x=1')).not.toBe(buildSeoEventGscJoinKey('/job/a?x=2'));
    expect(buildSeoEventGscJoinKey('/job/a')).not.toBe(buildSeoEventGscJoinKey('/job/b'));
    expect(buildSeoEventGscJoinKey('')).toBe('');
  });

  it('legacy proposals without new fields still produce valid events', () => {
    const event = buildSeoChangeEvent({
      kind: 'applied',
      proposal: { id: 'legacy-1', url: '/blog/old', contentType: 'BLOG', contentId: 'blog-old', field: 'seoTitle' } as unknown as Partial<SeoOptimizationProposal>,
      collectionName: 'blogs',
      contentId: 'blog-old',
      contentType: 'BLOG',
      pageUrl: '/blog/old',
      page: {},
      field: 'seoTitle',
      oldValue: 'a',
      newValue: 'b',
      at: '2026-08-26T00:00:00.000Z',
    });
    expect(event.proposalId).toBe('legacy-1');
    expect(event.proposalCreatedAt).toBeNull();
    expect(event.proposalLevel).toBeNull();
    expect(event.snapshotId).toBeNull();
    expect(event.proposalRequiresReview).toBeNull();
  });

  it('change history summary aggregates counts honestly (no ranking claims)', async () => {
    const now = '2026-08-26T00:00:00.000Z';
    const appliedMeta = buildSeoChangeEvent({
      kind: 'applied',
      proposal: base({ id: 's-1' }),
      collectionName: 'jobs',
      contentId: 'job-1',
      contentType: 'JOB',
      pageUrl: '/job/a',
      page: { lastDate: '2099-12-31' },
      field: 'metaDescription',
      oldValue: 'a',
      newValue: 'b',
      source: 'admin-dashboard',
      at: now,
    });
    const appliedAuto = buildSeoChangeEvent({
      kind: 'applied',
      proposal: base({ id: 's-2', contentType: 'BLOG', contentId: 'blog-1' }),
      collectionName: 'blogs',
      contentId: 'blog-1',
      contentType: 'BLOG',
      pageUrl: '/blog/a',
      page: {},
      field: 'seoTitle',
      oldValue: 'a',
      newValue: 'b',
      source: 'publish-hook',
      at: now,
    });
    const rolledBack = buildSeoChangeEvent({
      kind: 'rolled_back',
      proposal: base({ id: 's-3' }),
      collectionName: 'jobs',
      contentId: 'job-1',
      contentType: 'JOB',
      pageUrl: '/job/a',
      page: {},
      field: 'metaDescription',
      oldValue: 'b',
      newValue: 'a',
      at: now,
    });

    mockGetDocs.mockResolvedValue({
      docs: [rolledBack, appliedAuto, appliedMeta].map((event) => ({ id: event.eventId, data: () => ({ ...event }) })),
    });
    mockGetDoc.mockImplementation((ref: { id: string }) => {
      if (ref.id === 'seo_intelligence') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ optimizationProposals: [base({ id: 'p-pending', status: 'pending' }), appliedMetaEvent()] }),
        });
      }
      return Promise.resolve({ exists: () => false, data: () => ({}) });
    });

    const summary = await fetchSeoChangeHistorySummary();
    expect(summary).not.toBeNull();
    expect(summary!.totalApplied).toBe(2);
    expect(summary!.totalRolledBack).toBe(1);
    expect(summary!.byContentType).toEqual({ JOB: 1, BLOG: 1 });
    expect(summary!.byField).toEqual({ metaDescription: 1, seoTitle: 1 });
    expect(summary!.byLifecycle).toEqual({ OPEN: 1, NOT_APPLICABLE: 1 });
    expect(summary!.bySource).toEqual({ 'admin-dashboard': 1, 'publish-hook': 1 });
    expect(summary!.manualCount).toBe(1);
    expect(summary!.automaticCount).toBe(1);
    expect(summary!.pendingProposalCount).toBe(1);
  });

  it('change history summary returns null when no events exist yet', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
    const summary = await fetchSeoChangeHistorySummary();
    expect(summary).toBeNull();
  });
});

function appliedMetaEvent(): SeoOptimizationProposal {
  return base({ id: 's-1', status: 'applied' });
}
