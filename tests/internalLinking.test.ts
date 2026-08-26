// =============================================================
// Internal Linking / Orphan-page fix guard
// =============================================================
// Every detail page (job, update, test, material, ebook, course,
// web story) must produce a correct, non-broken breadcrumb trail
// via buildBreadcrumbPath. A regression here silently reintroduces
// orphan/weak-internal-linking pages.
// =============================================================

import { describe, it, expect } from 'vitest';
import { buildBreadcrumbPath } from '@/features/internal-linking/data/internalLinkingRepository';

describe('buildBreadcrumbPath (orphan-page internal linking)', () => {
  it('builds Home → Government Jobs → exam → title for jobs', () => {
    const crumbs = buildBreadcrumbPath({ title: 'SSC GD Recruitment 2026', exam: 'SSC GD', category: 'RECRUITMENT' });
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Government Jobs', 'SSC GD', 'SSC GD Recruitment 2026']);
    expect(crumbs[1].url).toBe('/govt-jobs');
  });

  it('builds Home → Study Material → subject → title for materials', () => {
    const crumbs = buildBreadcrumbPath({
      title: 'Percentage Notes',
      exam: 'GENERAL',
      category: 'STUDY_MATERIAL',
      subject: 'Mathematics',
    });
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Study Material', 'Mathematics', 'Percentage Notes']);
    expect(crumbs[1].url).toBe('/free-study-material');
    expect(crumbs[2].url).toContain('/free-study-material?subject=');
  });

  it('builds Home → Mock Tests → exam → title for mock tests', () => {
    const crumbs = buildBreadcrumbPath({ title: 'SSC GD Mock Test 2026', exam: 'SSC GD', category: 'MOCK_TEST' });
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Mock Tests', 'SSC GD', 'SSC GD Mock Test 2026']);
    expect(crumbs[1].url).toBe('/test');
  });

  it('builds Home → E-Books → title for ebooks', () => {
    const crumbs = buildBreadcrumbPath({ title: 'SSC GD Notes PDF', exam: 'GENERAL', category: 'EBOOK' });
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'E-Books', 'SSC GD Notes PDF']);
    expect(crumbs[1].url).toBe('/e-books');
  });

  it('builds Home → Premium Courses → title for courses', () => {
    const crumbs = buildBreadcrumbPath({ title: 'SSC GD Complete Course', exam: 'GENERAL', category: 'COURSE' });
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Premium Courses', 'SSC GD Complete Course']);
    expect(crumbs[1].url).toBe('/premium-notes');
  });

  it('builds Home → Web Stories → title for web stories', () => {
    const crumbs = buildBreadcrumbPath({ title: 'SSC GD Admit Card Story', exam: 'GENERAL', category: 'WEB_STORY' });
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Web Stories', 'SSC GD Admit Card Story']);
    expect(crumbs[1].url).toBe('/web-stories');
  });

  it('never emits a broken "undefined" crumb when exam is missing', () => {
    const crumbs = buildBreadcrumbPath({ title: 'Percentage Notes', category: 'STUDY_MATERIAL', subject: 'Maths' });
    expect(crumbs.some((c) => c.name === undefined || String(c.name).includes('undefined'))).toBe(false);
    expect(crumbs[0].name).toBe('Home');
  });

  it('every crumb except the current page carries a URL', () => {
    const crumbs = buildBreadcrumbPath({ title: 'SSC CGL Result 2026', exam: 'SSC CGL', category: 'RESULT' });
    crumbs.slice(0, -1).forEach((c) => expect(c.url).toBeTruthy());
    expect(crumbs[crumbs.length - 1].url).toBe('');
    expect(crumbs[crumbs.length - 1].name).toBe('SSC CGL Result 2026');
  });

  it('keeps the trail short for generic content (no fake exam crumb)', () => {
    const crumbs = buildBreadcrumbPath({ title: 'General Notes', exam: 'GENERAL', category: 'STUDY_MATERIAL' });
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Study Material', 'General Notes']);
  });
});
