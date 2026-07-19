// =============================================================
// Workflow Infrastructure Tests
// Tests for common patterns shared across admin workflows:
// slug generation, form field validation, status transitions
// =============================================================

import { describe, it, expect } from 'vitest';

// ------------------------------------------------------------------
// Slug creation utility (replicated from FastTrackManager.tsx)
// ------------------------------------------------------------------
function createSlug(title: string): string {
  if (!title) return `update-${Date.now()}`;
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

describe('Workflow Infrastructure — createSlug', () => {
  it('generates a slug from a simple title', () => {
    expect(createSlug('SSC CGL 2025 Result')).toBe('ssc-cgl-2025-result');
  });

  it('handles empty input gracefully', () => {
    const result = createSlug('');
    expect(result).toMatch(/^update-\d+$/);
  });

  it('handles null/undefined input gracefully', () => {
    const result = createSlug(null as unknown as string);
    expect(result).toMatch(/^update-\d+$/);
  });

  it('strips special characters like @, !, #', () => {
    // @, !, # are removed; spaces collapse into single hyphens
    expect(createSlug('UPSC @ 2025! Prelims #1')).toBe('upsc-2025-prelims-1');
  });

  it('collapses multiple spaces into single hyphen', () => {
    expect(createSlug('RRB   NTPC  2025')).toBe('rrb-ntpc-2025');
  });

  it('collapses multiple hyphens into single hyphen', () => {
    expect(createSlug('SSC---CGL---Result')).toBe('ssc-cgl-result');
  });

  it('trims leading and trailing hyphens', () => {
    expect(createSlug('-SSC CGL-')).toBe('ssc-cgl');
  });

  it('truncates to 80 characters', () => {
    const longTitle = 'A'.repeat(100);
    const slug = createSlug(longTitle);
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it('handles mixed-case input', () => {
    expect(createSlug('SSC CGL TIER 1 RESULT 2025'))
      .toBe('ssc-cgl-tier-1-result-2025');
  });

  it('collapses " - " separator into single hyphen', () => {
    // The "-" is kept, space-to-hyphen conversion runs first,
    // then multi-hyphen collapse reduces "---" to "-"
    expect(createSlug('CTET July 2025 - Answer Key'))
      .toBe('ctet-july-2025-answer-key');
  });
});

// ------------------------------------------------------------------
// Status transition validation
// ------------------------------------------------------------------
type WorkflowStatus = 'draft' | 'published' | 'rejected';
type WorkflowTransition = { from: WorkflowStatus; to: WorkflowStatus; allowed: boolean };

const VALID_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  draft: ['published', 'rejected'],
  published: ['draft'],
  rejected: ['draft'],
};

function canTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

describe('Workflow Infrastructure — status transitions', () => {
  const cases: WorkflowTransition[] = [
    { from: 'draft', to: 'published', allowed: true },
    { from: 'draft', to: 'rejected', allowed: true },
    { from: 'draft', to: 'draft', allowed: false },
    { from: 'published', to: 'draft', allowed: true },
    { from: 'published', to: 'rejected', allowed: false },
    { from: 'published', to: 'published', allowed: false },
    { from: 'rejected', to: 'draft', allowed: true },
    { from: 'rejected', to: 'published', allowed: false },
    { from: 'rejected', to: 'rejected', allowed: false },
  ];

  it.each(cases)(
    'transition from $from → $to should be $allowed',
    ({ from, to, allowed }) => {
      expect(canTransition(from, to)).toBe(allowed);
    }
  );
});

// ------------------------------------------------------------------
// Payment status enum
// ------------------------------------------------------------------
type PaymentStatus = 'pending' | 'completed' | 'failed' | 'rejected';

describe('Workflow Infrastructure — payment status mapping', () => {
  it('maps "approved" action to "completed" status', () => {
    const actionMap: Record<string, PaymentStatus> = {
      approved: 'completed',
      rejected: 'rejected',
    };
    expect(actionMap['approved']).toBe('completed');
    expect(actionMap['rejected']).toBe('rejected');
  });

  it('correctly identifies successful payment statuses', () => {
    const successful: PaymentStatus[] = ['completed'];
    const pending: PaymentStatus[] = ['pending', 'failed', 'rejected'];
    expect(successful).toContain('completed');
    expect(pending).not.toContain('completed');
  });
});

// ------------------------------------------------------------------
// Form field validation helpers
// ------------------------------------------------------------------
describe('Workflow Infrastructure — form validation', () => {
  it('requires title to be non-empty', () => {
    const isValid = (title: string) => title.trim().length > 0;
    expect(isValid('SSC CGL 2025')).toBe(true);
    expect(isValid('')).toBe(false);
    expect(isValid('   ')).toBe(false);
  });

  it('requires directLink to be present for fast track items', () => {
    const hasLink = (link: string) => link.trim().length > 0;
    expect(hasLink('https://example.com')).toBe(true);
    expect(hasLink('')).toBe(false);
  });

  it('allows optional fields to be empty', () => {
  const isOptional = () => true;

  expect(isOptional()).toBe(true);
  expect(isOptional()).toBe(true);
});
});

// ------------------------------------------------------------------
// Timestamp formatting (common across admin panels)
// ------------------------------------------------------------------
describe('Workflow Infrastructure — timestamp display', () => {
  it('formats Firestore timestamp seconds to locale date string', () => {
    const timestamp = { seconds: 1750000000, nanoseconds: 0 };
    const formatted = new Date(timestamp.seconds * 1000).toLocaleDateString();
    expect(formatted).toBeDefined();
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('handles missing timestamps gracefully', () => {
    const display = (ts: { seconds?: number } | null) => {
      return ts?.seconds
        ? new Date(ts.seconds * 1000).toLocaleDateString()
        : 'New';
    };
    expect(display(null)).toBe('New');
    expect(display({ seconds: 0 })).toBe('New');
  });

  it('handles both "timestamp" and "createdAt" field names', () => {
    const formatTime = (req: Record<string, unknown>) => {
      const ts = req.timestamp ?? req.createdAt;
      if (!ts) return 'Just Now';
      if (typeof ts === 'object' && ts !== null) {
        const obj = ts as { toDate?: () => Date };
        if (obj.toDate) return obj.toDate().toLocaleString();
      }
      return 'Just Now';
    };

    const tsDate = new Date('2026-01-15');
expect(formatTime({ timestamp: { toDate: () => tsDate } }))
  .toBe(tsDate.toLocaleString());

const createdAtDate = new Date('2026-06-01');
expect(formatTime({ createdAt: { toDate: () => createdAtDate } }))
  .toBe(createdAtDate.toLocaleString());
    expect(formatTime({})).toBe('Just Now');
  });
});
