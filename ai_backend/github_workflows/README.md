# GitHub Workflow Files — manual copy required

The automation bot that produced this branch does **not** have the GitHub App
`workflows` permission, so it cannot push files under `.github/workflows/`.
The four workflow files are therefore mirrored here, ready to copy.

They are already applied in this sandbox's working tree — they just could not be
included in the pushed commit.

## Install (one command)

From the repository root.

**Windows PowerShell:**

```powershell
powershell -ExecutionPolicy Bypass -File ai_backend\github_workflows\install.ps1
```

**Git Bash / Linux / Mac:**

```bash
bash ai_backend/github_workflows/install.sh
```

The script copies the four files, verifies each copy is byte-identical, confirms
the dispatcher is still in its safe (schedule-disabled) state, and stages them.
Then commit and push:

```bash
git commit -m "Install billing-independent video dispatcher workflows"
git push origin arena/01a01b18-auto-video-backend
```

Step-by-step Hindi walkthrough: **`ai_backend/DEPLOY_STEPS_HINDI.md`**

## What each file does

| File | Change |
|---|---|
| `video_dispatcher.yml` | **NEW** — scheduled Firestore poller every 15 min. The billing-independent trigger for all three pipelines. |
| `video_maker.yml` | Legacy `repository_dispatch` path kept intact (all three event types). Now uses `npm ci` instead of deleting `package-lock.json`, and the concurrency group no longer collapses to a single group when `slug` is absent. |
| `mock_test_maker.yml` | **Bug fix** — the automation guard step was nested directly under `jobs:`, making the file invalid YAML. `automation_check` never ran, so every step guarded by it was skipped and the workflow silently did nothing. Now a proper two-job workflow with a real output. |
| `fast_track.yml` | No longer depends solely on the Cloud Function endpoint; runs the scraper locally with the endpoint as an optional fallback. The previously hardcoded `x-auth-token` now comes from the `FAST_TRACK_TRIGGER_TOKEN` secret. Video responsibility moved to the dispatcher. |

All four files are valid YAML (verified with a YAML parser).

## ⚠️ The dispatcher ships DISABLED

`video_dispatcher.yml` has its `schedule:` block commented out, and its manual
inputs default to `dry_run=true` / `privacy=unlisted`. Installing it therefore
cannot start production uploads.

To go live after your unlisted tests pass, uncomment these two lines:

```yaml
  # schedule:
  #   - cron: '*/15 * * * *'
```

## Optional new secret

`FAST_TRACK_TRIGGER_TOKEN` — only needed if you still want the legacy Fast Track
Cloud Function fallback. It replaces a token that used to be committed in plain
text inside `fast_track.yml`.

Everything else uses secrets that already exist in the repository.

## 🔄 Sync tooling (2026-08-20)

Ab ek generic sync script hai jo staging (`ai_backend/github_workflows/`) se
live (`.github/workflows/`) me sirf un files ko copy karta hai jo **dono jagah
maujood hain aur alag hain** (staging wins):

```powershell
# dry run — kya copy hoga dikhao
powershell -ExecutionPolicy Bypass -File tools\sync-workflows.ps1 -DryRun

# apply
powershell -ExecutionPolicy Bypass -File tools\sync-workflows.ps1
```

### Is branch me naya kya hai

| File | Change |
|---|---|
| `video_dispatcher.yml` | `VIDEO_MAX_AGE_DAYS: ${{ vars.VIDEO_MAX_AGE_DAYS }}` repo-variable passthrough (freshness guard tunable). |
| `deploy.yml` | Spark-safe SEO deploy. `ai_backend/package.json` `"main"` is `seo_export.js` (HTTP sitemap/RSS/meta-tags only). Listing `functions:api` (secrets) is what made CI fail with **Extensions require the Blaze plan**. |

Sync ke baad commit + push karo, phir GitHub Actions → **"Deploy Firebase
Functions Only"** → Run workflow — `/feed` aur sitemaps Spark plan par deploy
ho jayenge, bina Blaze upgrade ke.

## 🔧 Workflow repairs (2026-08-20) — broken automation guard

Chaaro workflows me automation-guard step `jobs:` ke andar seedha daal diya gaya
tha (invalid YAML), isliye `automation_check` kabhi run nahi hota tha aur har
downstream `if: steps.automation_check...` false ho jaata tha — workflow
silently kuch nahi karta tha. Ab sab proper **two-job** workflows hain
(`check-automation` → main job, real output ke saath).

| File | Fix |
|---|---|
| `autpdf.yml` | Guard ab apne job me hai; `pdf-engine` `needs.check-automation.outputs.enabled == 'true'` par chalta hai. |
| `daily_job_alert.yml` | Same two-job fix; `run-api` guard output par chalta hai. |
| `web_stories.yml` | Same two-job fix; teeno scheduled steps (mocktest / blog noon / blog night) preserve kiye gaye. |
| `long_video_maker.yml` | Poora commented-out tha. Ab valid YAML + two-job guard. **Schedule intentionally commented hai** (manual trigger only) jab tak `long_video.js` TTS path de-risk nahi hota. |

Apply karne ke liye (staging → live, sirf dono jagah maujood files):

```powershell
powershell -ExecutionPolicy Bypass -File tools\sync-workflows.ps1
# ya direct copy:
# cp ai_backend/github_workflows/{autpdf,daily_job_alert,web_stories,long_video_maker}.yml .github/workflows/
```

Chaaron files valid YAML hain (YAML parser se verify).
