import { describe, it, expect } from 'vitest';
import {
    storyTypeKey,
    STORY_TYPE_META,
    storyDateLabel,
    storyRelativeLabel,
    sortStories,
    filterStoriesByType,
} from '../src/features/stories/storyUi';

describe('storyUi — type keys + meta', () => {
    it('storyTypeKey har alias pakad leta hai', () => {
        expect(storyTypeKey('job')).toBe('job');
        expect(storyTypeKey('FASTTRACK')).toBe('fasttrack');
        expect(storyTypeKey('fast_track')).toBe('fasttrack');
        expect(storyTypeKey('blog')).toBe('blog');
        expect(storyTypeKey('mocktest')).toBe('mocktest');
        expect(storyTypeKey(undefined)).toBe('other');
        expect(storyTypeKey('')).toBe('other');
    });

    it('har type ke paas label + chip class hai', () => {
        for (const key of ['job', 'fasttrack', 'blog', 'mocktest', 'other'] as const) {
            expect(STORY_TYPE_META[key].label.length).toBeGreaterThan(0);
            expect(STORY_TYPE_META[key].chipClass).toContain('bg-');
        }
    });
});

describe('storyUi — date labels', () => {
    it('storyDateLabel "29 Jul 2026" format', () => {
        expect(storyDateLabel('2026-07-29T10:00:00Z')).toBe('29 Jul 2026');
        expect(storyDateLabel(null)).toBe('');
    });

    it('storyRelativeLabel aaj/kal/din/hafte/mahine', () => {
        const now = new Date(2026, 6, 29, 18, 0, 0); // 29 Jul 2026 shaam
        expect(storyRelativeLabel(new Date(2026, 6, 29, 6, 0, 0), now)).toBe('aaj');
        expect(storyRelativeLabel(new Date(2026, 6, 28, 23, 0, 0), now)).toBe('kal');
        expect(storyRelativeLabel(new Date(2026, 6, 26, 10, 0, 0), now)).toBe('3 din pehle');
        expect(storyRelativeLabel(new Date(2026, 6, 15, 10, 0, 0), now)).toBe('2 hafte pehle');
        expect(storyRelativeLabel(new Date(2026, 4, 1, 10, 0, 0), now)).toContain('mahine pehle');
        expect(storyRelativeLabel(null, now)).toBe('');
    });
});

describe('storyUi — sort + filter', () => {
    const stories = [
        { id: 'a', createdAt: '2026-07-10T00:00:00Z', storyType: 'job' },
        { id: 'b', createdAt: '2026-07-29T00:00:00Z', storyType: 'blog' },
        { id: 'c', createdAt: '2026-07-20T00:00:00Z', storyType: 'fasttrack' },
    ];

    it('sortStories new → latest pehla, purana baad me', () => {
        expect(sortStories(stories, 'new').map(s => s.id)).toEqual(['b', 'c', 'a']);
        expect(sortStories(stories, 'old').map(s => s.id)).toEqual(['a', 'c', 'b']);
        // original array mutate NAHI hona chahiye
        expect(stories.map(s => s.id)).toEqual(['a', 'b', 'c']);
    });

    it('filterStoriesByType sahi chunte', () => {
        expect(filterStoriesByType(stories, 'all')).toHaveLength(3);
        expect(filterStoriesByType(stories, 'job').map(s => s.id)).toEqual(['a']);
        expect(filterStoriesByType(stories, 'fasttrack').map(s => s.id)).toEqual(['c']);
        expect(filterStoriesByType(stories, 'mocktest')).toHaveLength(0);
    });

    it('missing createdAt wale bhi crash nahi karte', () => {
        const withNull = [{ id: 'x', storyType: 'blog' } as const];
        expect(() => sortStories(withNull as never[], 'new')).not.toThrow();
    });
});
