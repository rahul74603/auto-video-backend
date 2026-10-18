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

  it('decodes entities once rather than recursively unescaping nested entities', () => {
    const summary = buildDraftDescription({
      kind: 'job',
      articleHtml: '<p>Result &amp;lt;script&amp;gt; remains encoded and is safely displayed in this useful summary.</p>',
    });

    expect(summary).toContain('&lt;script&gt;');
    expect(summary).not.toMatch(/<script>/i);
  });

  it('strips script/style blocks with whitespace before closing angle brackets', () => {
    const summary = buildDraftDescription({
      kind: 'job',
      articleHtml: '<script>alert(1)</script \t\n bar> <style>hidden</style \t\n bar> The official result details are available on the board website for candidates today.',
    });

    expect(summary).toMatch(/official result details are available/i);
    expect(summary).not.toMatch(/alert\(1\)|hidden/i);
  });
});
