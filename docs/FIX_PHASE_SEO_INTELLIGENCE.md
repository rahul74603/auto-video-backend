# Fix phase — SEO intelligence (post-audit)

Do **not** merge or deploy until review. This commit only fixes audit issues.

## Verdict

**FIXED BUT NEEDS REVIEW**

## Canonical paths

- **Enrichment:** `ai_backend/agents/seo_intelligence/enrich.js` → `enrichContentDocument`. Used by JOB and FAST_TRACK `build*PublishPayload` (HTTP + Telegram) and mirrored by frontend `enrichPublicDocument`.
- **Date parser:** `ai_backend/agents/growth/date_normalizer.js` (India calendar). Reviewer + job lifecycle reuse it. Frontend `src/utils/jobExpiry.ts` uses the same Asia/Kolkata rules.
- **Internal linking:** existing `internalLinkingRepository` + RelatedContent / relatedJobs / ExamHub / SSR booster. Linking scorer integrated into the existing widget. **No new related-links section.** Stored `relatedLinks` writes removed from publish + SEO scan.
- **Publish:** server `publishDraftRecord`; JOBS AI `publishDraftClientSide` now preserves `createdAt` / `publishedAt` and appends `updateHistory` on merge (no second create).

## Cost (scheduled SEO intelligence scan, typical)

- Reads: ~jobs 80–120 + FT 40–80 + tests 40 + blogs 20 + GSC/settings ≈ 180–260
- Writes: lifecycle **only when status/schema/priority change** (usually few) + ≤40 recs + 2 run docs. Related-link job writes: **0**
- Invocations: piggybacks existing SEO Master (no new Cloud Function / schedule)

## API auth

`/articles/*` and `/seo/intelligence/*` stay authenticated (Firebase ID token or `AGENT_ADMIN_TOKEN`). JOBS AI publish is Firestore client-side. Telegram uses in-process `publishDraftRecord`.

## GSC

Manual **Search Console Data Import** only. StudyGyaan URLs + numeric validation. No live API, no new credentials.

## Tests

- Backend: 504 total, **502 pass**, 2 fail (pre-existing video dispatcher cron tests)
- Frontend: **132 pass / 0 fail**
- `tsc -b`: PASS
- `npm run check`: PASS
- Vite production build: PASS (env guard skipped in this sandbox)
