/**
 * Job-page SEO builders — JobDetails + Admin BROWSE "Fix missing SEO" dono
 * inhi par depend karte hain. Regression guards:
 *  - "…Vacancy 2026 - Latest Vacancies | StudyGyaan" jaisa junk title kabhi nahi
 *  - raw HTML meta description me kabhi nahi jayega
 */
import { describe, it, expect } from 'vitest';
import {
    getContentYear,
    buildJobSeoTitle,
    buildJobMetaDescription,
} from '@/utils/jobSeoFields';

describe('getContentYear', () => {
    it('title me year ho to wahi jeeta hai', () => {
        expect(getContentYear({ title: 'Bihar Police Constable 2024 Online Form' })).toBe('2024');
    });

    it('createdAt.seconds se year nikalta hai (title me year nahi)', () => {
        const ts = { seconds: Math.floor(new Date('2025-03-10T00:00:00Z').getTime() / 1000) };
        expect(getContentYear({ title: 'Some Job', createdAt: ts })).toBe('2025');
    });

    it('kuch na mile to current year', () => {
        expect(getContentYear(null)).toBe(String(new Date().getFullYear()));
    });
});

describe('buildJobSeoTitle', () => {
    it('curated seoTitle as-is jeeta hai', () => {
        expect(buildJobSeoTitle('Custom Job Title', 'X', '2026', '400')).toBe('Custom Job Title');
    });

    it('title me year ho to dobara year NAHI jodta (regression)', () => {
        expect(
            buildJobSeoTitle('', 'UP Police SI Notification 2026 Out', '2026', '953'),
        ).toBe('UP Police SI Notification 2026 Out - 953 Vacancies | StudyGyaan');
    });

    it('title me vacancy-word ho to vacancy-suffix NAHI jodta (regression)', () => {
        expect(
            buildJobSeoTitle('', 'Bihar Police 1500 Vacancy Online Form', '2026', '1500'),
        ).toBe('Bihar Police 1500 Vacancy Online Form 2026 | StudyGyaan');
    });

    it('"Posts" word bhi vacancy-dedup me count hota hai', () => {
        expect(
            buildJobSeoTitle('', 'RRC NR Sports Quota Posts', '2026', '12'),
        ).toBe('RRC NR Sports Quota Posts 2026 | StudyGyaan');
    });

    it('vacancies missing ho to junk placeholder ("Latest Vacancies") nahi banata', () => {
        expect(
            buildJobSeoTitle('', 'Anganwadi Worker Recruitment', '2026', undefined),
        ).toBe('Anganwadi Worker Recruitment 2026 | StudyGyaan');
    });

    it('normal case: year + vacancies dono judte hain', () => {
        expect(
            buildJobSeoTitle('', 'IBPS Clerk Recruitment', '2026', '4000'),
        ).toBe('IBPS Clerk Recruitment 2026 - 4000 Vacancies | StudyGyaan');
    });
});

describe('buildJobMetaDescription', () => {
    it('curated metaDescription as-is jeeta hai', () => {
        expect(
            buildJobMetaDescription('Curated job desc', 'short', '<p>html</p>', { title: 'T' }),
        ).toBe('Curated job desc');
    });

    it('shortInfo dusra preference hai', () => {
        expect(
            buildJobMetaDescription('', 'Short info here', '<p>html</p>', { title: 'T' }),
        ).toBe('Short info here');
    });

    it('description HTML se tags strip hote hain (raw HTML leak regression)', () => {
        const html = '<p>SSC ne notification jari ki hai.</p><table><tr><td>Fee: 100</td></tr></table>';
        expect(buildJobMetaDescription('', '', html, { title: 'T' })).toBe(
            'SSC ne notification jari ki hai. Fee: 100',
        );
    });

    it('sab missing ho to doc-facts wala template fallback', () => {
        const out = buildJobMetaDescription('', '', '', {
            title: 'IBPS Clerk Recruitment',
            contentYear: '2026',
            organization: 'IBPS',
            vacancies: '4000',
            salary: '35,400',
            lastDate: '10 October 2026',
        });
        expect(out).toBe(
            'Apply online for IBPS Clerk Recruitment recruitment 2026. IBPS - 4000 vacancies. Check eligibility, salary ₹35,400, last date 10 October 2026.'.slice(0, 160),
        );
    });

    it('fallback 160 chars par cap hota hai', () => {
        const out = buildJobMetaDescription('', '', '', { title: 'x'.repeat(300) });
        expect(out.length).toBeLessThanOrEqual(160);
    });
});
