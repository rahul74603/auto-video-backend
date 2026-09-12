import { useEffect, useState } from 'react';

/**
 * SmartImage — 🖼️ 3-LEVEL FALLBACK IMAGE (kabhi khali/tutta nahi dikhega)
 * ========================================================================
 * Level 1: asli image (Firestore ka imageUrl) — jo blogs me missing hai
 * Level 2: local branded thumb (/fallback/<type>.png — Daily SEO workflow
 *          generate karke cPanel pe upload karta hai, public/ me bhi bundled)
 * Level 3: deterministic CSS gradient + title text — ZERO network, kabhi
 *          fail nahi hota (offline/offline-cache/dead CDN sab handle)
 *
 * Blog cards, related content, web stories — sab jagah use karo.
 */

export type FallbackType =
  | 'blog'
  | 'job'
  | 'update'
  | 'test'
  | 'material'
  | 'course'
  | 'story'
  | 'generic';

const FALLBACK_SRC: Record<FallbackType, string> = {
  blog: '/fallback/blog.png',
  job: '/fallback/job.png',
  update: '/fallback/update.png',
  test: '/fallback/test.png',
  material: '/fallback/material.png',
  course: '/fallback/course.png',
  story: '/fallback/story.png',
  generic: '/fallback/default.png',
};

// Level-3 gradient themes — type-wise branding (Ahrefs/cards dono ke liye saaf)
const GRADIENT: Record<FallbackType, string> = {
  blog: 'from-violet-900 via-purple-700 to-violet-500',
  job: 'from-blue-900 via-blue-700 to-blue-500',
  update: 'from-green-900 via-green-600 to-emerald-500',
  test: 'from-orange-900 via-orange-600 to-amber-500',
  material: 'from-teal-900 via-teal-600 to-cyan-500',
  course: 'from-indigo-900 via-indigo-600 to-indigo-400',
  story: 'from-pink-900 via-pink-600 to-fuchsia-500',
  generic: 'from-slate-900 via-slate-700 to-slate-500',
};

export const looksLikeBrokenUrl = (url?: string | null): boolean => {
  const s = String(url || '').trim();
  if (!s) return true;
  // Mare hue placeholder services ya localStorage-junk URLs jo DB me save ho gaye the
  if (/via\.placeholder\.com|placehold\.co|picsum\.photos/i.test(s)) return true;
  return false;
};

interface SmartImageProps {
  src?: string | null;
  alt: string;
  fallbackType?: FallbackType;
  title?: string;
  className?: string;
  eager?: boolean;
}

export default function SmartImage({
  src,
  alt,
  fallbackType = 'blog',
  title = '',
  className = '',
  eager = false,
}: SmartImageProps) {
  // broken/known-dead URL pe seedha fallback (ek network 404 bhi nahi khayenge)
  const startStage = looksLikeBrokenUrl(src) ? 1 : 0;
  const [stage, setStage] = useState(startStage);

  useEffect(() => {
    setStage(looksLikeBrokenUrl(src) ? 1 : 0);
  }, [src]);

  if (stage >= 2) {
    return (
      <div
        className={`w-full h-full bg-gradient-to-br ${GRADIENT[fallbackType] || GRADIENT.generic} flex items-center justify-center p-2 md:p-3`}
        role="img"
        aria-label={alt}
      >
        <span className="text-white font-black text-center text-[11px] md:text-sm leading-tight line-clamp-3 drop-shadow-md">
          {title || alt || 'StudyGyaan'}
        </span>
      </div>
    );
  }

  const currentSrc = stage === 0 ? String(src).trim() : FALLBACK_SRC[fallbackType] || FALLBACK_SRC.generic;

  return (
    <img
      src={currentSrc}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={className}
      onError={() => setStage((s) => s + 1)}
    />
  );
}
