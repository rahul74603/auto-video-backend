# StudyGyaan — News & Content Engine: PHASE 1 COMPLETE AUDIT

Date: 2026-09-26 · Branch audited: `arena/01a093f0-auto-video-backend` (code ≈ main) · **No code changed in this phase.**

Method: codebase inspection only (routes, collections, workflows, agents, admin UI, rules, sitemaps).
Every claim below cites the file that proves it.

---

## 1. Executive summary

**StudyGyaan already HAS a working news/content engine** — it is just not branded "news".
The pipeline `RSS/source fetch → draft → AI article → Telegram/admin review → publish → indexing → stories → social`
exists today, spread across `govt_jobs.js`, `fast_track_updates.js`, `auto_drafts.js`, `agents/article_agents/*`,
`telegram_draft_bot.js`, `auto_indexer.js`, `article_to_story.js`, GitHub-Actions crons and social workflows.

Verdict per master-plan rule: **IMPROVE/REPAIR the existing engine; do NOT build a parallel one.**
Genuinely missing pieces (small, cheap, high-value):

1. **Source registry** (Firestore) + admin source-health UI — sources are currently **hardcoded arrays** in `govt_jobs.js` (lines ~416-419) with no per-source status/lastChecked history.
2. **News Hub page** (`/news`) — no public aggregate "latest updates" page exists (routes in `src/App.tsx` lines 205-434 have no `/news`).
3. **Official-first (Tier-1) monitoring** — discovery currently leans on **Tier-2 aggregators** (FreeJobAlert, SarkariExam, IndGovtJobs RSS). Official-site verification happens only per-article (`source_fetcher.js`, `web_searcher.js`), not per-source monitoring.
4. **Unified news-desk dashboard** — review exists (Telegram cards + `AdminAIArticleStudio`/`AdminBrowseAIDrafts`) but no single screen with source health + duplicate scores + validation results.

Everything else in the master prompt maps to existing, working subsystems (table in §4).

---

## 2. Architecture map (as-is)

### Frontend (Vite + React, `src/`)
- Content routes: `/govt-jobs`, `/job/:id`, `/fasttrack(+/:id)`, `/update/:id`, `/blog(+/:id)`, `/admit-card`, `/results`, `/answer-key`, `/syllabus`, `/exam-calendar`, `/mock-tests`, `/free-study-material`, `/e-books`, `/premium-notes`, `/course/:id`, `/web-stories(+/:id)` — `src/App.tsx` lines 205-434.
- **No `/news` route.** Nearest aggregates: Home, `/fasttrack`, `/blog`.
- Admin: 22 tabs incl. `AdminAIArticleStudio`, `AdminBrowseAIDrafts`, `AdminDraftEditor`, `AdminSeoDashboard`, `AdminAutomationControl`, `AdminWebStories`, `FastTrackManager`, `NotificationsTab`, `PremiumTab` (`src/pages/Admin/Tabs/`).
- SEO/SSR: `src/components/SEO.tsx` (has **NewsArticle schema**), `server_seo_renderer.js` (backend prerender).

### Backend (Firebase Functions, `ai_backend/`)
- Entrypoint `seo_export.js` (package.json main) + `index.js` (`exports.api` Express app, `invoker:"public"`).
- Detection: `govt_jobs.js` (RSS via `rss-parser` + cheerio + Gemini; source list hardcoded ~line 416), `fast_track_updates.js`, `processed_links` collection for link-level dedupe.
- Drafting: `auto_drafts.js` (daily candidates → AI draft → Telegram approve card; dup-guard via `title_utils.overlapsAny`, `aiDrafted`, `aiDraftTries`).
- Article agents: `agents/article_agents/` — `source_fetcher`, `web_searcher`, `smart_facts_harvester`, `facts_date_harvester`, `source_adequacy_gate`, `fact_quality_reviewer`, `job_article_writer`, `fast_track_article_writer`, `article_pipeline`, `article_repairer`, `model_client` (Gemini free-tier, retries/backoff).
- Review/publish: `article_routes.js` (token/email-guarded), `telegram_draft_bot.js` (✅/❌ approve buttons), publish transitions trigger side-effects.
- Indexing/SEO: `auto_indexer.js` (IndexNow + Google Indexing API on publish), `bulk_indexing.js`, `google_indexing.js`, `seo_export.js` sitemaps (incl. **news sitemap = last-2-days `blogs`**, `seo_functions.js` line 466+), `rssFeed`/`generateRss` (`newsFeed.js` — jobs+fast_track+blogs), `og_image.js`, `seo_master_agent.js`, `agents/seo_intelligence/`.
- Stories: `web_stories.js`, `article_to_story.js` (auto-story on publish transition), `auto_stories.js`.
- Social: `fb_poster.js`, workflows `auto_post_linkedin/twitter/social_all.yml`, `fb_post.yml`, `telegram_alert.yml`, `daily_alert.js`.
- Growth/analytics: `agents/growth/*` (`content_fingerprint`, `content_mutation`, learner), `run_gsc_ingest.js` (GSC Search Analytics), `run_seo_outcomes.js`, collections `content_performance`, `growth_insights`, `cost_tracking`.
- Guardrails: `agents/automation_guard.js` (`system_settings/automation`: global kill-switch + per-feature flags, admin tab `AdminAutomationControl`), `cost_tracking` collection.

### Firestore collections in use (backend refs, desc)
`jobs`(22) `blogs`(18) `fast_track`(15) `web_stories`(9) `job_drafts`(8) `system_configs`(7) `content_performance`(6) `mock_tests` `courses` `purchases` `processed_links`(5) `cost_tracking`(5) `system_settings`(4) `content_opportunities`(4) `ai_article_drafts`(4) …
**No `news*` collection exists — and per master-plan RULE, none is needed** (jobs/fast_track/blogs ARE the news corpus).

### Scheduling (GitHub Actions crons — free)
`govt_jobs_scraper` 9:30 AM IST · `ai_drafts` 11:00/16:30/22:00 IST · `fast_track` 2:00 AM · `daily_job_alert` 8:30 AM · `auto_blog` 6x/day · `mock_test_maker` 2x/day · `google_indexing` 9 PM · `growth_learner` 6-hourly · `seo-daily`, `seo_intelligence`, `auto_content_optimizer` 9:15 PM etc.

### Security
- `firestore.rules`: `isAdmin()` = `request.auth.token.email == rahulkumar74603@gmail.com`; 25 allow-rules; user-owned reads/writes elsewhere.
- HTTP admin routes: `article_auth.js` (Firebase ID-token + `ARTICLE_ADMIN_EMAILS` allowlist or `x-agent-token` = `AGENT_ADMIN_TOKEN`).
- Secrets: GitHub Secrets → `ai_backend/.env` via `scripts/write-functions-env.cjs` (Firebase Secret Manager intentionally EMPTY — standing user rule).

---

## 3. What works / partially / broken / missing

| Subsystem | Status | Evidence |
|---|---|---|
| Source discovery (RSS) | **Works**, but Tier-2-aggregator-first, hardcoded list | `govt_jobs.js:416-419` |
| Link dedupe | Works | `processed_links` (5 refs) |
| Title/duplicate guard | Works | `auto_drafts.js` header, `title_utils.overlapsAny`, `growth/content_fingerprint.js` |
| AI draft generation | Works (draft-only by design) | `auto_drafts.js`, `job_article_writer.js` |
| Fact/quality validation | Works | `source_adequacy_gate.js`, `fact_quality_reviewer.js`, `article_repairer.js` |
| Human review | Works (Telegram cards + admin studio) | `telegram_draft_bot.js`, `AdminBrowseAIDrafts.tsx` |
| Publish + side-effects | Works | `article_routes.js`, `auto_indexer.js`, `article_to_story.js` |
| Kill-switch / cost guard | Works | `automation_guard.js`, `cost_tracking` |
| Sitemaps + news sitemap | Works; news sitemap = last-2-days **blogs only** (jobs/fast_track NOT in it) | `seo_functions.js:466-488` |
| RSS feed | Works (jobs+fast_track+blogs) | `newsFeed.js:70-72` |
| NewsArticle schema | Exists on blog + fast-track pages | `SEO.tsx`, `FastTrackDetails.tsx` |
| Web stories auto-gen | Works | `article_to_story.js`, `web_stories.yml` |
| Social distribution | Works (FB/X/LinkedIn/IG/Telegram) | `auto_post_social_all.yml`, `fb_poster.js` |
| Analytics loop | Works (GSC ingest + growth learner) | `run_gsc_ingest.js`, `agents/growth/*` |
| **Source registry + health UI** | **MISSING** (hardcoded arrays) | no `sources` collection anywhere |
| **Public News Hub `/news`** | **MISSING** | `src/App.tsx` routes |
| **News-desk dashboard (single screen)** | **MISSING** (pieces exist in 3 tabs) | admin tabs list |
| **Unified classification/priority engine** | **Partial** (per-pipeline heuristics; no shared taxonomy/priority score) | writers |
| News sitemap coverage | **Gap**: excludes jobs/fast_track (the freshest content) | `seo_functions.js:478` (blogs only) |

Broken/known-debt (from prior sessions, still true): 3 pre-existing `article_agents.test.js` failures on clean HEAD; video-pipeline canvas requires node20 workflows (untouched by design).

---

## 4. Master-prompt requirement → existing asset → verdict

| Requirement | Existing | Verdict |
|---|---|---|
| Source monitoring | `govt_jobs.js` RSS loop + cron | **IMPROVE** → move list into `sources` registry w/ lastChecked/lastError |
| News validation | `source_adequacy_gate`, `fact_quality_reviewer` | KEEP |
| Article generation | `job_article_writer`, `fast_track_article_writer`, `auto_drafts` | KEEP |
| Quality checks | `article_repairer` + review issues | KEEP |
| Human review | Telegram cards + Studio tabs | **IMPROVE** → unify into news-desk view |
| Auto-publish config | `automation_guard` per-feature flags | KEEP (already SAFE-mode default: draft-only) |
| SEO engine | `seo_export`, `server_seo_renderer`, `og_image` | KEEP; **REPAIR** news-sitemap coverage |
| Google News foundations | pubDate/updated/author/canonical/NewsArticle schema | KEEP; add author/org consistency check |
| Web stories | full system | KEEP |
| Social distribution | 4 workflows + fb_poster + telegram | KEEP |
| Internal linking | partial (writers embed related links; growth engine) | **IMPROVE** small: related-content block on publish |
| News hub page | none | **NEW** (thin page over existing collections) |
| News archive/lifecycle | status fields on jobs/blogs/fast_track | KEEP |
| Admin dashboard | SeoDashboard + AutomationControl + Drafts | **IMPROVE** → health counters widget |
| Source admin UI | none | **NEW** (small tab over registry) |
| Failure handling | retries/backoff in model_client; `aiDraftTries` | KEEP; add per-source error log |
| Rate limiting / cost protection | automation_guard + cost_tracking + free-tier cron pacing | KEEP |
| Security | rules + article_auth + secrets-via-CI | KEEP |
| Analytics | GSC ingest + growth | KEEP |

---

## 5. Free-first / cost posture (verified)

- Spark plan everywhere: v1 triggers where EventArc would cost (`govt_jobs.js` header comment), GitHub-Actions crons instead of Cloud Scheduler for heavy jobs, Gemini free tier with retry/backoff, daily caps in `auto_drafts` (limit 2+1 per cycle).
- **No paid API introduced by any proposed change below.** New work is Firestore reads (capped queries) + one static route + admin UI.
- Cost risk flags: (a) raising cron frequency, (b) adding per-source page fetches without caching — both must reuse `processed_links`-style caching + per-run caps.

## 6. Do-NOT-touch list

- Mock-test video pipeline (`autoVideo.js`, `long_video.js`, `mock_test_video.js`, their node20 workflows).
- Secrets architecture (no `secrets:` in function exports; no Secret Manager).
- Entrypoint/invoker rules (`seo_export.js` lazy getters; `invoker:"public"` on new Gen-2 HTTP fns + yaml regen).
- Working SEO surfaces (sitemaps, canonical, SSR) — test before change (standing rule).

## 7. PHASE 2 design proposal (smallest safe delta — pending your approval)

1. **`sources` registry collection** + `source_registry.js` (read/add/disable/test; reuse hardcoded list as seed). Scraper reads registry; writes `lastChecked/lastSuccess/lastError/status`. (~1 backend file + 1 admin tab section)
2. **`/news` hub page** — server-friendly listing over `fast_track` + recent `jobs` + `blogs` (existing queries, capped, indexed) with category chips (Jobs/Result/Admit Card/Exam/Education). Reuses `SEO.tsx` + NewsArticle-ish list markup; **no new collection**.
3. **News-sitemap coverage repair** — include fresh indexable `jobs`+`fast_track` URLs (last 2 days), keep blogs; add tests.
4. **Priority/classify helper** — shared `classifyUpdate(title,url)` (regex taxonomy → HIGH/MEDIUM/LOW) used by `auto_drafts` + social posts; no new infra.
5. **News-desk widget** on `AdminSeoDashboard` (counts: detected today, drafts, pending review, source failures from registry).

Sequencing per rules: each item = separate small commit + its own test file + regression run (`node --test` suites, tsc, build) before next.

## 8. Test/regression plan (PHASE 4-6 preview)

- New unit tests: registry CRUD guard, classifier cases, news-sitemap composition (mock Firestore).
- Existing gates: `tests/pdf_set_builder.test.js` (15), `agents.test.js` (67), vitest 244, `tsc --noEmit`, eslint, vite build.
- Regression checklist = master-prompt §REGRESSION (Jobs/Results/AdmitCard/Syllabus/MockTests/Material/Blogs/Stories/Admin/Auth/SEO) — mapped to existing suites + manual smoke list.

---

*Audit complete. No code changed. Awaiting approval to proceed to PHASE 2 (design freeze) then incremental implementation on `arena/01a093f0-auto-video-backend`.*
