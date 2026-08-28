import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dashboardSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/pages/Admin/Tabs/AdminSeoDashboard.tsx'),
  'utf8',
);

const proposalSelectionKey = (proposal?: {
  id?: string;
  contentId?: string;
  field?: string;
  url?: string;
} | null) => {
  if (!proposal) return '';
  if (proposal.id) return String(proposal.id);
  return [proposal.contentId, proposal.field, proposal.url].filter(Boolean).join(':');
};

describe('Admin SEO Optimization Proposal row selection', () => {
  it('keeps a stable selection key when proposal.id is missing', () => {
    expect(proposalSelectionKey({ id: 'p1', contentId: 'c1' })).toBe('p1');
    expect(proposalSelectionKey({ contentId: 'c1', field: 'title', url: '/a' })).toBe('c1:title:/a');
    expect(proposalSelectionKey(null)).toBe('');
    expect(dashboardSource).toContain('const proposalSelectionKey =');
    expect(dashboardSource).toContain('selectProposal(proposal)');
  });

  it('opens existing details above the table via row click and View details', () => {
    const sectionIndex = dashboardSource.indexOf('Optimization Proposals');
    const section = dashboardSource.slice(sectionIndex);
    const detailsIndex = section.indexOf('id="seo-proposal-details"');
    const tableIndex = section.indexOf('<table className="w-full text-left text-sm">');
    const viewIndex = section.lastIndexOf('View details');
    const rowClickIndex = section.indexOf('onClick={() => selectProposal(proposal)}');

    expect(sectionIndex).toBeGreaterThan(-1);
    expect(detailsIndex).toBeGreaterThan(-1);
    expect(tableIndex).toBeGreaterThan(detailsIndex);
    expect(viewIndex).toBeGreaterThan(tableIndex);
    expect(rowClickIndex).toBeGreaterThan(-1);
    expect(dashboardSource).toContain('Proposal details');
    expect(dashboardSource).toContain('Old value:');
    expect(dashboardSource).toContain('Proposed value:');
    expect(dashboardSource).toContain('Reason:');
    expect(dashboardSource).toContain('Evidence:');
    expect(dashboardSource).toContain('Source:');
    expect(dashboardSource).toContain('Requires review:');
    expect(dashboardSource).toContain('ProposalArticleHtmlPreview');
    expect(dashboardSource).toContain('Approve (status only)');
    expect(dashboardSource).toContain('Reject');
    expect(dashboardSource).toContain('Apply (snapshot first)');
    expect(dashboardSource).not.toContain('onClick={() => setSelectedProposal(proposal)}');
  });
});
