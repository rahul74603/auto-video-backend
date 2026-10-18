import { describe, expect, it } from 'vitest';
import { buildDraftDescription } from '@/utils/articleSummary';

describe('buildDraftDescription', () => {
  it('uses the saved article intro when the generated summary is blank', () => {
    const summary = buildDraftDescription({
      kind: 'fast_track',
      title: 'Board Admit Card 2026',
      articleHtml: '<h2>Update</h2><p>The board has released admit cards for registered candidates. Download from the official website.</p>',
    });
    expect(summary).toContain('The board has released admit cards');
  });

  it('creates a fact-only job summary when article text is unavailable', () => {
    const summary = buildDraftDescription({
      kind: 'job',
      title: 'Railway Recruitment 2026',
      organization: 'Railway Board',
      vacancies: '120',
      lastDate: '30 October 2026',
    });
    expect(summary).toContain('Railway Board');
    expect(summary).toContain('120');
    expect(summary).toContain('30 October 2026');
    expect(summary).toContain('official notification');
  });

  it('keeps a useful AI-generated summary and removes markup/entities', () => {
    const summary = buildDraftDescription({
      kind: 'job',
      preferred: '<p>SSC &amp; board update with application details for candidates.</p>',
      title: 'SSC Recruitment',
    });
    expect(summary).toBe('SSC & board update with application details for candidates.');
  });
});
