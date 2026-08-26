# Phase 45 — SEO / Content Intelligence Report

StudyGyaan SEO work for P1 items 8–17, P2 18–22, P3 23–27, with Phases 42–44 constraints.

Highest priority remains: **human-first, original, factual, source-grounded, useful** pages. Nothing here auto-publishes, invents facts, creates thin pages, or tries to hide AI usage.

---

## 1. Current architecture

- React/Vite frontend + Firestore + Firebase Functions (`ai_backend/`).
- Spark-safe SEO HTTP entry: `seo_export.js` (`package.json` `"main"`).
- Full automation (articles, video, growth, SEO Master) lives in `index.js` (Blaze).
- Article pipeline is still draft-first: generate → Fact & Quality review → human/Telegram publish.
- Existing systems unchanged: Job / Fast Track / Mock Test publishing, Video Dispatcher, Growth Engine, AI Visual, YouTube, Facebook, Telegram, GitHub Actions, sitemap, RSS, admin tools.

## 2. Existing SEO features (kept)

- Canonical URLs, robots, Open Graph, Twitter cards (`SEO.tsx`, `server_seo_renderer.js`).
- Sitemaps + RSS + IndexNow + optional Google Indexing API.
- JobPosting / FAQ / Article / Breadcrumb JSON-LD.
- Source-grounded writers + hallucination / duplicate / stuffing review.
- Frontend related content + breadcrumbs + exam hubs.
- SEO Master Agent (6h + daily) for audit, freshness, connections.

## 3. Missing SEO features (before this work)

- Human editorial usefulness gate (beyond facts).
- Job lifecycle fields (open / closing / closed / expired) on documents.
- Append-only update history.
- Backend exam-aware internal linking stored on publish.
- Topic clusters + search intent on documents.
- Article FAQ usefulness (vs video FAQ engine).
- Image alt / Discover title quality checks.
- Search Console CTR ingest + content-gap recommendations.
- SEO admin dashboard.

## 4. What was implemented

| # | Feature | Behaviour |
|---|---|---|
| 8 | Human editorial quality gate | Extra review issues: clickbait, hedging titles, placeholders, repeated boilerplate, generic FAQs. **Not** an AI detector. |
| 9 | Source-first | Existing source adequacy + grounding kept. Publish stores `sourceCitation`. |
| 10 | Job lifecycle | `OPEN` / `CLOSING_SOON` / `CLOSED` / `EXPIRED`. Never deletes. Expired jobs stay indexable; JobPosting schema omitted. |
| 11 | Update history | Append-only `updateHistory[]` on republish. |
| 12 | Internal linking engine | Exam-family + complementary-type scoring at publish + scheduled refresh. No random links. |
| 13 | Topic clusters | `examFamily` + `topicCluster` + expanded exam hubs. |
| 14 | Search intent | `APPLY` / `LATEST_UPDATE` / `INFORMATIONAL` / `PRACTICE`. |
| 15 | FAQ engine (articles) | Placeholder FAQ answers fail review. FAQPage schema in SSR. |
| 16 | Image SEO | Deterministic alt text; missing `alt` warning; `og:image:alt` in SSR. |
| 17 | Discover | Clickbait / ALL-CAPS blocked; max-image-preview already present. |
| 18 | Search Console intelligence | Admin ingest of GSC rows (studygyaan.in only). No invented metrics. |
| 19 | CTR opportunities | Low-CTR / high-impression suggestions only. Never auto-rewrites titles. |
| 20 | Content gap engine | Missing admit/result/syllabus/mock-test **recommendations**. Never auto-creates pages. |
| 21 | SEO admin dashboard | Admin tab `SEO`. |
| 22 | Content recommendation engine | Ranked recs in `seo_recommendations`. `autoCreate: false`. |
| 23 | Website ↔️ YouTube loop | Embed existing `youtubeUrl` / `youtubeVideoId` only. |
| 24 | Mock-test ecosystem | Related published tests by exam family. |
| 25 | Advanced analytics | Dashboard snapshot from freshness + lifecycle + GSC rows. |
| 26 | Automated recommendations | Written by SEO Master / Run scan. Not executed. |
| 27 | Continuous optimization | Lifecycle + relatedLinks refresh inside SEO Master. Never rewrites article HTML. |

## 5. Files changed

**New**

- `ai_backend/agents/seo_intelligence/*` (taxonomy, lifecycle, history, intent, FAQ, image, discover, editorial gate, linking, intelligence, ecosystem, enrich, orchestrator, routes)
- `ai_backend/tests/seo_intelligence.test.js`
- `src/features/seo-intelligence/taxonomy.ts`
- `src/features/seo-intelligence/data/seoIntelligenceRepository.ts`
- `src/pages/Admin/Tabs/AdminSeoDashboard.tsx`
- `tests/seoContentWorkflow.test.ts`
- `docs/PHASE45_SEO_CONTENT_REPORT.md`

**Modified**

- `fact_quality_reviewer.js` — editorial gate
- `article_pipeline.js` — enrich + history + related links; preserve `createdAt` on republish
- `article_routes.js` / `index.js` — article auth + SEO intelligence routes
- `seo_master_agent.js` — piggybacks intelligence (non-fatal)
- `server_seo_renderer.js` — FAQ schema, og:image:alt, Article schema for expired jobs
- Frontend: `AdminPage.tsx`, `JobDetails.tsx`, `FastTrackDetails.tsx`, `ExamHubNavigation.tsx`, `jobExpiry.ts`, `firestore.ts`, `aiArticleRepository.ts`, `automationRepository.ts`
- `ai_backend/package.json` check script, `.env.example`

## 6. Database changes

No destructive migrations. New/optional fields on existing docs; new collections created on first run.

Collections:

- `seo_intelligence_runs`
- `seo_recommendations`
- `system_settings/seo_intelligence`
- `system_settings/seo_search_console`

## 7. New fields (optional on `jobs` / `fast_track`)

`examFamily`, `contentKind`, `topicCluster`, `searchIntent`, `lifecycleStatus`, `lifecycleDays`, `includeJobPostingSchema`, `sitemapPriority`, `imageAlt`, `discoverScore`, `sourceCitation`, `updateHistory`, `relatedLinks`, `seoIntelligenceVersion`, `youtubeUrl` / `youtubeVideoId` (only if already known).

## 8. New APIs (admin-auth: Firebase ID token or `AGENT_ADMIN_TOKEN`)

- `POST /seo/intelligence/dashboard`
- `POST /seo/intelligence/recommendations`
- `POST /seo/intelligence/run`
- `POST /seo/intelligence/search-console/ingest`

Existing `/articles/*` now use the same auth middleware (already required by design).

## 9. New admin features

- Tab **SEO**: lifecycle counts, freshness, recommendations, GSC JSON ingest, manual scan.
- Automation flag `seo_intelligence` (default ON; Pause All still wins).

## 10. Content quality system

Fact & Quality review **plus** editorial usefulness. Failed review still blocks HTTP publish. Client-side publish still requires passed review unless admin override (existing).

## 11. Human-editorial safeguards

- Draft-first; no auto-publish.
- Author must remain `StudyGyaan Editorial Team`.
- Clickbait / hedging titles / placeholders fail review.
- Recommendations are advice only.

## 12. Duplicate protection

Unchanged: slug/title/content similarity + source-copy shingles.

## 13. Internal linking

Frontend related content kept. Backend now stores exam-aware `relatedLinks` and SSR still injects recent/hub links.

## 14. Topic clusters

`examFamily:contentKind` plus expanded hubs (SSC, Railway, Banking, Police, UPSC, Teaching).

## 15. Search Console integration

Optional JSON ingest. Existing Indexing Agent inspection unchanged. Missing credentials → skip, no crash.

## 16. Discover improvements

Clickbait blocked; large image preview already on; `dateModified` from `updatedAt`; original-content review kept.

## 17. Structured data

JobPosting only while apply window is open/upcoming. Expired jobs → Article. FAQPage when FAQs exist.

## 18. Image system

Alt from title; no fake people photos generated. Existing OG image pipeline unchanged.

## 19. Analytics

No new third-party pixels. Uses existing views + optional GSC rows.

## 20. Tests

- Backend: `seo_intelligence.test.js` (17) + existing article/growth/video suites.
- Frontend: `seoContentWorkflow.test.ts` (4) — 128 frontend tests pass.
- `npm run check` syntax pass.
- `tsc -b` pass.
- Two pre-existing video-dispatcher workflow cron tests still fail (unrelated).

## 21. Security audit

- No secrets in source, HTML, or dashboard payloads (`redactSecrets`).
- GSC ingest accepts only `studygyaan.in` URLs.
- Admin SEO routes require article auth.
- Origin delete whitelist unchanged.
- `.env` / service-account files remain gitignored.

## 22. Performance impact

Intelligence scan is Firestore reads (capped ~120 jobs) inside existing SEO Master. Related-link writes capped. No extra Cloud Function (avoids Spark breakage).

## 23. Deployment requirements

1. Deploy `api` function (Blaze) for new `/seo/intelligence/*` routes.
2. Spark sitemap/RSS deploy unchanged (`seo_export.js`).
3. Frontend `dist/` upload as usual.
4. No Firestore index required for default `orderBy(createdAt)` already used.

## 24. Environment variables

**No new secrets.** Reuses `ARTICLE_ADMIN_EMAILS`, `AGENT_ADMIN_TOKEN`, optional `SERVICE_ACCOUNT_JSON`.

## 25. Git commit SHA

See the commit created on `arena/01a03bb4-auto-video-backend`.

## 26. Remaining manual steps

1. Open Admin → **SEO** → Run scan after deploy.
2. Optionally paste Search Console Search Analytics JSON (query/page/clicks/impressions/ctr/position).
3. Treat recommendations as an editorial backlog — do not auto-generate gap pages.
4. Link YouTube URLs on a job only when a real video exists.
5. Confirm `ARTICLE_ADMIN_EMAILS` is set so `/articles/*` and SEO APIs accept the admin Gmail session.
