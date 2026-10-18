import { describe, expect, it } from 'vitest';
import { resolveExamHub } from '../src/components/ExamHubNavigation';

describe('resolveExamHub', () => {
  it.each([
    ['Bihar Library Eligibility Test BLET', 'General'],
    ['', 'General'],
    [undefined, 'General'],
    ['BANK OF BARODA', 'BANKING'],
    ['IBPS PO', 'BANKING'],
    ['UP Police Constable', 'POLICE'],
    ['UPSC Civil Services', 'UPSC'],
    ['Teaching Recruitment', 'TEACHING'],
    ['SSC CGL', 'SSC CGL'],
    ['SSC GD', 'SSC GD'],
  ])('always resolves a valid hub for %s', (exam, expectedFamily) => {
    const result = resolveExamHub(exam);

    expect(result.matchedExam).toBe(expectedFamily);
    expect(result.hub).toBeDefined();
    expect(result.hub.color).toEqual(expect.any(String));
    expect(result.hub.links.length).toBeGreaterThan(0);
  });
});
