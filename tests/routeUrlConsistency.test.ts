// =============================================================
// SEO URL Consistency Guard
// =============================================================
// Every URL that backend generators (RSS feed, sitemaps, blog
// resources) emit MUST resolve on the frontend router (src/App.tsx).
// These tests scan the actual sources so a dead route can never be
// silently reintroduced.
// =============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

// Routes the frontend router really serves for content detail pages.
// If one of these is removed from App.tsx, the guard below fails —
// that's intentional: generators pointing at it must be updated too.
const DETAIL_ROUTE_PARAMS = ['/job/:id', '/blog/:id', '/test/:id', '/update/:id', '/material/:id'];

// Dead URL fragments that must never appear in any URL-emitting backend file.
// (Context: these were served to Google via RSS/sitemap but 404ed on the site.)
const DEAD_FRAGMENTS = [
  '/jobs/',
  '/mock-tests/',
  '/fast-track/',
  '/free-study-material/',
  '/result/',
  '/admit-card/',
  '/answer-key/',
  '/blog/category/', // no /blog/category/:slug route exists in App.tsx
];

const URL_EMITTING_FILES = [
  'ai_backend/newsFeed.js',
  'ai_backend/auto_blog.js',
  'ai_backend/daily_alert.js',
  'ai_backend/seo_functions.js',
  'ai_backend/auto_indexer.js',
  'ai_backend/article_to_story.js',
  'ai_backend/telegram_draft_bot.js',
  'src/pages/UpdateCard.tsx',
];

describe('SEO URL consistency guard', () => {
  it('App.tsx still defines every detail route that generators emit', () => {
    const app = read('src/App.tsx');
    for (const route of DETAIL_ROUTE_PARAMS) {
      expect(app).toContain(`path="${route}"`);
    }
  });

  it('URL-emitting backend files contain no dead URL fragments', () => {
    // A line "generates" a URL only if it is an actual URL context, not
    // e.g. an import path ('@/features/fast-track/…') or a comment.
    const isUrlLine = (line: string) =>
      line.includes('https://') ||
      line.includes('navigate(') ||
      line.includes('href=') ||
      line.includes('<loc>') ||
      line.includes('<link>') ||
      line.includes('route:');

    for (const file of URL_EMITTING_FILES) {
      const source = read(file);
      for (const frag of DEAD_FRAGMENTS) {
        const generated = source.split('\n').some(line =>
          line.includes(frag) && !line.trim().startsWith('//') && isUrlLine(line)
        );
        expect(generated, `${file} still generates "${frag}"`).toBe(false);
      }
    }
  });

  it('UpdateCard links updates to the canonical /update/:id route', () => {
    const card = read('src/pages/UpdateCard.tsx');
    expect(card).toContain('navigate(`/update/${item.slug || item.id}`)');
  });

  it('RSS collection config only references routes that exist in App.tsx', () => {
    const app = read('src/App.tsx');
    const feed = read('ai_backend/newsFeed.js');
    const routes = [...feed.matchAll(/route:\s*'([a-z-]+)'/g)].map(m => m[1]);
    expect(routes.length).toBeGreaterThanOrEqual(4);
    for (const r of routes) {
      expect(app).toContain(`path="/${r}/:id"`);
    }
  });

  it('fast_track content is linked via the canonical /update/ route, not /fasttrack/', () => {
    // /fasttrack/:id exists only as a client-side redirect to /update/:id,
    // so generators must emit the final /update/ URL directly.
    for (const file of [
      'ai_backend/auto_indexer.js',
      'ai_backend/article_to_story.js',
      'ai_backend/telegram_draft_bot.js',
    ]) {
      const source = read(file);
      expect(source.includes('/fasttrack/'), `${file} still emits /fasttrack/`).toBe(false);
    }
    expect(read('ai_backend/auto_indexer.js')).toContain('/update/');
    expect(read('ai_backend/article_to_story.js')).toContain('/update/');
    expect(read('ai_backend/telegram_draft_bot.js')).toContain('/update/');
  });

  it('sitemap generators emit canonical routes only', () => {
    const seo = read('ai_backend/seo_functions.js');
    // canonical prefixes present (jobs uses `route = 'job'` + `/${route}/`)
    for (const p of ['/blog/', '/test/', '/update/', '/web-stories/', '/course/']) {
      expect(seo).toContain(p);
    }
    expect(seo).toContain("route = 'job'");
    // dead collection rows absent from daily_alert sitemap
    const alert = read('ai_backend/daily_alert.js');
    expect(alert).not.toContain('{ name: "fasttrack", route: "fasttrack" }');
    expect(alert).toContain('{ name: "fast_track", route: "update" }');
  });
});
