import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetDoc, mockGetDocs } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ type: 'collection', name })),
  doc: vi.fn((_db: unknown, collectionName: string, id: string) => ({ collectionName, id })),
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
  setDoc: vi.fn(),
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
  fetchSeoChangeOutcomesSummary,
  formatOutcomeCtr,
  formatOutcomePct,
  formatOutcomePosition,
  outcomeEvidenceLabel,
  outcomeLifecycleStatus,
} from '@/features/seo-intelligence/data/seoIntelligenceRepository';

/** A realistic backend outcome document (measurement-only, Phase 3 schema). */
function outcomeDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    outcomeId: 'oc_ev-main',
    eventId: 'ev-main',
    eventKind: 'applied',
    changeAt: '2026-08-15T10:30:00.000Z',
    changeDate: '2026-08-15',
    contentId: 'job-1',
    collection: 'jobs',
    contentType: 'JOB',
    pageUrl: 'https://studygyaan.in/job/ssc-cgl-2026/',
    gscJoinKey: 'https://studygyaan.in/job/ssc-cgl-2026',
    field: 'metaDescription',
    fieldGroup: 'meta',
    proposalId: 'p-1',
    source: 'apply-engine',
    lifecycle: { state: 'ACTIVE', context: 'lastDate 2026-12-31', asOf: '2026-08-15T10:30:00.000Z' },
    oldValue: { kind: 'inline', value: '' },
    newValue: { kind: 'inline', value: 'SSC CGL 2026 apply online — last date 31/12/2026.' },
    preWindow: { start: '2026-08-08', end: '2026-08-14', expectedDays: 7 },
    postWindow: { start: '2026-08-16', end: '2026-08-22', expectedDays: 7 },
    dataCoverage: {
      pre: { availableCount: 7, expectedCount: 7, missingDays: [], notYetAvailableDays: [] },
      post: { availableCount: 7, expectedCount: 7, missingDays: [], notYetAvailableDays: [] },
      availableThrough: '2026-08-22',
      expectedThrough: '2026-08-22',
      lastCompletedDate: '2026-08-27',
    },
    preMetrics: { clicks: 105, impressions: 5600, ctr: 0.01875, avgPosition: 9.5, queryCount: 2, rowCount: 14 },
    postMetrics: { clicks: 175, impressions: 6300, ctr: 175 / 6300, avgPosition: 8, queryCount: 2, rowCount: 14 },
    deltas: {
      clicks: 70,
      clicksPct: 66.66666666666666,
      impressions: 700,
      impressionsPct: 12.5,
      ctr: 0.009027777777777777,
      ctrPct: 48.148148148148145,
      avgPosition: -1.5,
      queryCount: 0,
      note: 'Observed before/after differences (correlation, not causation).',
    },
    querySummary: { sharedCount: 2, appearedCount: 0, disappearedCount: 0 },
    overlappingChangeCount: 0,
    sameFieldOverlapCount: 0,
    overlappingEventIds: [],
    confounded: false,
    evidenceState: 'measured',
    evidenceStateReason: 'Measured from available final GSC days. Observed before/after difference (correlation, not causation).',
    measuredAt: '2026-08-29T05:35:00.000Z',
    firstMeasuredAt: '2026-08-29T05:35:00.000Z',
    revisionCount: 0,
    ...overrides,
  };
}

function setup({ outcomes, runner }: { outcomes: Array<Record<string, unknown>>; runner?: Record<string, unknown> }) {
  mockGetDocs.mockImplementation((q: { type: string; args: unknown[] }) => {
    const collectionRef = (q.args || [])[0] as { type: string; name: string };
    if (collectionRef && collectionRef.name === 'seo_change_outcomes') {
      return Promise.resolve({ docs: outcomes.map((data) => ({ id: String(data.outcomeId || ''), data: () => data })) });
    }
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockImplementation((ref: { collectionName: string; id: string }) => {
    if (ref.collectionName === 'system_settings' && ref.id === 'seo_intelligence') {
      return Promise.resolve({
        exists: () => Boolean(runner),
        data: () => ({ outcomeRunner: runner || null }),
      });
    }
    return Promise.resolve({ exists: () => false, data: () => ({}) });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchSeoChangeOutcomesSummary (Phase 3, read-only measurement)', () => {
  it('aggregates outcomes by evidence state with honest measurement totals', async () => {
    setup({
      outcomes: [
        outcomeDoc(),
        outcomeDoc({
          outcomeId: 'oc_ev-2',
          eventId: 'ev-2',
          evidenceState: 'no_change_observed',
        }),
        outcomeDoc({
          outcomeId: 'oc_ev-3',
          eventId: 'ev-3',
          evidenceState: 'confounded',
          confounded: true,
          overlappingChangeCount: 1,
          overlappingEventIds: ['ev-4'],
        }),
        outcomeDoc({
          outcomeId: 'oc_ev-4',
          eventId: 'ev-4',
          evidenceState: 'insufficient_data',
          deltas: { clicks: null, clicksPct: null, impressions: null, impressionsPct: null, ctr: null, ctrPct: null, avgPosition: null, queryCount: null, note: 'Deltas withheld' },
        }),
        outcomeDoc({
          outcomeId: 'oc_ev-5',
          eventId: 'ev-5',
          evidenceState: 'incomplete_data',
        }),
        outcomeDoc({
          outcomeId: 'oc_ev-6',
          eventId: 'ev-6',
          evidenceState: 'no_data',
        }),
      ],
      runner: { lastStatus: 'success', lastRunAt: '2026-08-29T05:30:00.000Z', created: 6 },
    });

    const summary = await fetchSeoChangeOutcomesSummary();
    expect(summary).not.toBeNull();
    expect(summary!.outcomes).toHaveLength(6);
    expect(summary!.measuredCount).toBe(1);
    expect(summary!.noChangeCount).toBe(1);
    expect(summary!.confoundedCount).toBe(1);
    // insufficient_data + incomplete_data + no_data all count as insufficient evidence
    expect(summary!.insufficientDataCount).toBe(3);
    expect(summary!.byEvidenceState).toEqual({
      measured: 1,
      no_change_observed: 1,
      confounded: 1,
      insufficient_data: 1,
      incomplete_data: 1,
      no_data: 1,
    });
    expect(summary!.runnerLastStatus).toBe('success');
    expect(summary!.runnerLastRunAt).toBe('2026-08-29T05:30:00.000Z');
  });

  it('coerces one outcome document defensively (nulls preserved, never fake numbers)', async () => {
    setup({
      outcomes: [
        outcomeDoc({
          outcomeId: 'oc_ev-zero',
          eventId: 'ev-zero',
          evidenceState: 'measured',
          postMetrics: { clicks: 0, impressions: 0, ctr: null, avgPosition: null, queryCount: 0, rowCount: 0 },
          deltas: {
            clicks: -105,
            clicksPct: -100,
            impressions: -5600,
            impressionsPct: -100,
            ctr: null,
            ctrPct: null,
            avgPosition: null,
            queryCount: -2,
            note: 'Observed before/after differences (correlation, not causation).',
          },
        }),
      ],
    });

    const summary = await fetchSeoChangeOutcomesSummary();
    expect(summary).not.toBeNull();
    const outcome = summary!.outcomes[0];
    // Zero impressions stay null — the UI must never render a fake 0% CTR / position.
    expect(outcome.postMetrics.ctr).toBeNull();
    expect(outcome.postMetrics.avgPosition).toBeNull();
    expect(outcome.deltas.ctr).toBeNull();
    expect(outcome.deltas.ctrPct).toBeNull();
    // But real-zero drops with a positive pre value are honest percentages:
    expect(outcome.deltas.impressionsPct).toBe(-100);
    expect(outcome.preMetrics.ctr).toBeCloseTo(0.01875, 10);
    expect(outcome.dataCoverage.availableThrough).toBe('2026-08-22');
    expect(outcome.dataCoverage.postMissingDays).toEqual([]);
    expect(outcome.lifecycle).toEqual({ state: 'ACTIVE', context: 'lastDate 2026-12-31', asOf: '2026-08-15T10:30:00.000Z' });
    expect(outcome.oldValue).toEqual({ kind: 'inline', value: '' });
    expect(outcome.confounded).toBe(false);
    expect(outcome.revisionCount).toBe(0);
  });

  it('returns null when no outcomes exist yet (no fabricated measurements)', async () => {
    setup({ outcomes: [] });
    const summary = await fetchSeoChangeOutcomesSummary();
    expect(summary).toBeNull();
  });

  it('keeps coverage gaps explicit — missing days are surfaced, never zeroed', async () => {
    setup({
      outcomes: [
        outcomeDoc({
          outcomeId: 'oc_ev-gap',
          eventId: 'ev-gap',
          evidenceState: 'insufficient_data',
          dataCoverage: {
            pre: { availableCount: 2, expectedCount: 7, missingDays: ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'], notYetAvailableDays: [] },
            post: { availableCount: 7, expectedCount: 7, missingDays: [], notYetAvailableDays: [] },
            availableThrough: '2026-08-22',
            expectedThrough: '2026-08-22',
            lastCompletedDate: '2026-08-27',
          },
          deltas: { clicks: null, clicksPct: null, impressions: null, impressionsPct: null, ctr: null, ctrPct: null, avgPosition: null, queryCount: null, note: 'Deltas withheld: fewer than the minimum available GSC days in at least one window.' },
        }),
      ],
    });
    const summary = await fetchSeoChangeOutcomesSummary();
    const outcome = summary!.outcomes[0];
    expect(outcome.dataCoverage.preAvailableDays).toBe(2);
    expect(outcome.dataCoverage.preExpectedDays).toBe(7);
    expect(outcome.dataCoverage.preMissingDays).toHaveLength(5);
    expect(outcome.evidenceState).toBe('insufficient_data');
    expect(outcome.deltas.impressionsPct).toBeNull(); // withheld — never a fabricated difference
  });

  it('carries lifecycle context and confounding flags from the backend measurement', async () => {
    setup({
      outcomes: [
        outcomeDoc({
          outcomeId: 'oc_ev-expired',
          eventId: 'ev-expired',
          contentType: 'FAST_TRACK',
          lifecycle: { state: 'EXPIRED', context: 'examDate 2026-01-10' },
          evidenceState: 'confounded',
          confounded: true,
          overlappingChangeCount: 2,
          sameFieldOverlapCount: 1,
          overlappingEventIds: ['ev-a', 'ev-b'],
        }),
      ],
    });
    const summary = await fetchSeoChangeOutcomesSummary();
    const outcome = summary!.outcomes[0];
    expect(outcomeLifecycleStatus(outcome)).toBe('EXPIRED'); // context only — never a trigger
    expect(outcome.confounded).toBe(true);
    expect(outcome.overlappingChangeCount).toBe(2);
    expect(outcome.overlappingEventIds).toEqual(['ev-a', 'ev-b']);
    expect(summary!.confoundedCount).toBe(1);
  });
});

describe('outcome display helpers (honest labels, never causal)', () => {
  it('labels evidence states in measurement language', () => {
    expect(outcomeEvidenceLabel('measured')).toContain('correlation, not causation');
    expect(outcomeEvidenceLabel('no_change_observed')).toBe('No change observed');
    expect(outcomeEvidenceLabel('confounded')).toContain('Confounded');
    expect(outcomeEvidenceLabel('insufficient_data')).toBe('Insufficient data');
    expect(outcomeEvidenceLabel('incomplete_data')).toContain('awaiting final GSC data');
    expect(outcomeEvidenceLabel('no_data')).toBe('No data');
    expect(outcomeEvidenceLabel('')).toBe('Unknown');
  });

  it('formats percentages with an explicit sign, and "—" for withheld values', () => {
    expect(formatOutcomePct(12.5)).toBe('+12.5%');
    expect(formatOutcomePct(-3.25)).toBe('-3.3%');
    expect(formatOutcomePct(0)).toBe('0.0%');
    expect(formatOutcomePct(null)).toBe('—');
  });

  it('formats CTR as a percentage and never fakes it for zero-impression windows', () => {
    expect(formatOutcomeCtr(0.01875)).toBe('1.88%');
    expect(formatOutcomeCtr(0)).toBe('0.00%');
    expect(formatOutcomeCtr(null)).toBe('—');
  });

  it('formats average position with "—" when unknown (lower = generally better)', () => {
    expect(formatOutcomePosition(9.5)).toBe('9.5');
    expect(formatOutcomePosition(8)).toBe('8.0');
    expect(formatOutcomePosition(null)).toBe('—');
  });
});
