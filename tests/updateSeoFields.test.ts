/**
 * Shared update-page SEO builders — FastTrackDetails + Admin FastTrackManager
 * dono inhi par depend karte hain. Duplication-bug regression guard:
 * "…Admit Card 2026 - Admit Card 2026 | StudyGyaan" wala title kabhi wapas na bane.
 */
import { describe, it, expect } from 'vitest';
import {
    buildUpdateSeoTitle,
    buildUpdateMetaDescription,
    stripHtmlToText,
} from '@/utils/updateSeoFields';

describe('buildUpdateSeoTitle', () => {
    it('curated seoTitle ko as-is jeeta hai', () => {
        expect(
            buildUpdateSeoTitle('Custom Title', 'Some Update Title', 'Admit Card'),
        ).toBe('Custom Title');
    });

    it('title me category pehle se ho to duplicate suffix NAHI jodta (regression)', () => {
        const title = 'WBPSC Miscellaneous Services Admit Card 2026';
        expect(buildUpdateSeoTitle('', title, 'Admit Card')).toBe(
            'WBPSC Miscellaneous Services Admit Card 2026 | StudyGyaan',
        );
    });

    it('title me category na ho to `- Category | StudyGyaan` banata hai', () => {
        expect(buildUpdateSeoTitle(undefined, 'RRC NR PET Result Out', 'Admit Card')).toBe(
            'RRC NR PET Result Out - Admit Card | StudyGyaan',
        );
    });

    it('category match case-insensitive hai', () => {
        const title = 'UP Police admit card 2026 released';
        expect(buildUpdateSeoTitle(undefined, title, 'Admit Card')).toBe(
            'UP Police admit card 2026 released | StudyGyaan',
        );
    });

    it('empty title par safe fallback deta hai', () => {
        expect(buildUpdateSeoTitle('', '', 'Result')).toBe('Update - Result | StudyGyaan');
        expect(buildUpdateSeoTitle('', '', '')).toBe('Update | StudyGyaan');
    });
});

describe('buildUpdateMetaDescription', () => {
    it('curated metaDescription as-is jeeta hai', () => {
        expect(
            buildUpdateMetaDescription('Curated desc from pipeline', 'short', '<p>html</p>', 'T'),
        ).toBe('Curated desc from pipeline');
    });

    it('shortInfo dusra preference hai (160 par cap)', () => {
        const short = 'a'.repeat(200);
        expect(buildUpdateMetaDescription('', short, '<p>x</p>', 'T')).toHaveLength(160);
    });

    it('description HTML se tags strip hote hain (raw HTML meta me nahi jata)', () => {
        const html = '<h2>Overview</h2><p>WBPSC ne admit card jari kiya.</p>';
        expect(buildUpdateMetaDescription('', '', html, 'T')).toBe(
            'Overview WBPSC ne admit card jari kiya.',
        );
    });

    it('sab kuch missing ho to title-based generic fallback', () => {
        expect(buildUpdateMetaDescription('', '', '', 'WBPSC Admit Card 2026')).toBe(
            'WBPSC Admit Card 2026 — direct link, important dates aur official updates StudyGyaan.in par.',
        );
    });
});

describe('stripHtmlToText', () => {
    it('tags + extra whitespace dono collapse karta hai', () => {
        expect(stripHtmlToText('<div class="t">A</div>   <p>  B </p>\n<p>C</p>')).toBe('A B C');
        expect(stripHtmlToText(null)).toBe('');
    });
});
