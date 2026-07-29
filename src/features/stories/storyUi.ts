import { toDateSafe } from '@/types/firestore';
import type { TimestampLike } from '@/types/firestore';

// =========================================================
// 🎨 Story type meta — chips/colors ke liye
// =========================================================
export type StoryTypeKey = 'job' | 'fasttrack' | 'blog' | 'mocktest' | 'other';

export function storyTypeKey(rawType: unknown): StoryTypeKey {
  const t = String(rawType || '').toLowerCase();
  if (t === 'job' || t === 'jobs' || t === 'sarkari') return 'job';
  if (t === 'fasttrack' || t === 'fast_track' || t === 'fast-track' || t.includes('update')) return 'fasttrack';
  if (t === 'blog' || t === 'article') return 'blog';
  if (t === 'mocktest' || t === 'mock' || t === 'test') return 'mocktest';
  return 'other';
}

export const STORY_TYPE_META: Record<StoryTypeKey, { label: string; chipClass: string }> = {
  job: { label: '🏛️ JOB', chipClass: 'bg-blue-600' },
  fasttrack: { label: '⚡ UPDATE', chipClass: 'bg-orange-600' },
  blog: { label: '📝 BLOG', chipClass: 'bg-emerald-600' },
  mocktest: { label: '🎯 MOCK TEST', chipClass: 'bg-purple-600' },
  other: { label: '📚 STUDYGYAAN', chipClass: 'bg-slate-700' },
};

// =========================================================
// 📅 Date/relative labels
// =========================================================
const MONTHS_HI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "29 Jul 2026" — invalid pe empty string */
export function storyDateLabel(createdAt: unknown): string {
  const d = toDateSafe(createdAt as TimestampLike);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS_HI[d.getMonth()]} ${d.getFullYear()}`;
}

/** "aaj" / "kal" / "X din pehle" / "X hafte pehle" / "X mahine pehle" */
export function storyRelativeLabel(createdAt: unknown, now: Date = new Date()): string {
  const d = toDateSafe(createdAt as TimestampLike);
  if (!d) return '';
  const msDay = 24 * 60 * 60 * 1000;
  // Dono ko midnight pe normalize karo taaki "din" sahi nikle
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((a - b) / msDay);
  if (days <= 0) return 'aaj';
  if (days === 1) return 'kal';
  if (days < 7) return `${days} din pehle`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} ${weeks === 1 ? 'hafta' : 'hafte'} pehle`;
  const months = Math.floor(days / 30);
  return `${months} ${months === 1 ? 'mahina' : 'mahine'} pehle`;
}

// =========================================================
// 🔀 Sort + filter (client-side, pure)
// =========================================================
export interface StoryLike {
  id: string;
  createdAt?: unknown;
  storyType?: unknown;
  [key: string]: unknown;
}

export type SortDir = 'new' | 'old';

export function sortStories<T extends StoryLike>(list: T[], dir: SortDir): T[] {
  const time = (s: T): number => (toDateSafe(s.createdAt as TimestampLike) || new Date(0)).getTime();
  return [...list].sort((x, y) => (dir === 'new' ? time(y) - time(x) : time(x) - time(y)));
}

export type TypeFilter = StoryTypeKey | 'all';

export function filterStoriesByType<T extends StoryLike>(list: T[], filter: TypeFilter): T[] {
  if (filter === 'all') return list;
  return list.filter((s) => storyTypeKey(s.storyType) === filter);
}
