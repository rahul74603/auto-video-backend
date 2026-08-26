# GitHub Workflow Staging Mirror

This directory is a **staging mirror**, NOT a production GitHub Actions location.

GitHub only executes workflows from `.github/workflows/`. The automation GitHub
App used to create this branch does not have the `workflows` permission, so it
cannot push files under `.github/workflows/` directly. That is the only reason
this mirror exists: it lets the existing local copy tooling move the files into
the real workflow directory.

## Production source of truth

The authoritative production video workflow is:

```
.github/workflows/video_dispatcher.yml
```

It must be byte-identical to `ai_backend/github_workflows/video_dispatcher.yml`.

Current production behavior (already reflected in both files):

- `repository_dispatch`:
  - `generate_job_video`
  - `generate_fasttrack_video`
  - `generate_mock_test_video`
- fallback schedule: `*/5 * * * *`
- `workflow_dispatch` inputs: `kind`, `limit`, `dry_run`, `doc`, `privacy`
- `concurrency: group: video-dispatcher, cancel-in-progress: false`
- `permissions: contents: read`
- `runs-on: ubuntu-latest`, `timeout-minutes: 55`
- default `working-directory: ai_backend`
- Node.js 20, npm cache on `ai_backend/package-lock.json`
- free/cost-safe runtime: canvas/FFmpeg Linux build deps, `fonts-noto-cjk`,
  `fonts-noto-devanagari`, `fonts-noto-color-emoji`, `fc-cache -f`, and a
  `fc-list` verification step that fails if `Noto Sans Devanagari` is missing.
- `IN_JOBDATA: ${{ toJSON(github.event.client_payload.jobData) }}` so a
  repository_dispatch with `jobData` runs `--kind=all --limit=1 --max-age-days=0`.

## Required copy tooling (existing)

- `install.ps1` / `install.sh` — copy the staged workflow files into
  `.github/workflows/`.
- `tools/sync-workflows.ps1` — sync staged files that already exist in both
  places into `.github/workflows/`.
- `tools/pull-merge-sync.ps1` — same sync flow for pull/merge workflows.

## Important rule

There is only ONE production definition. Never treat this mirror as an
independent workflow. When the active file is changed, update this mirror to be
byte-identical; when this mirror is used to sync, verify the active file
afterwards with:

```bash
diff .github/workflows/video_dispatcher.yml ai_backend/github_workflows/video_dispatcher.yml
```

## Frontend build

No `dist.zip` / frontend-build artifact workflow and no cPanel deployment
workflow exists or is intended here. The frontend build remains the normal
Vite build:

```bash
npm run build
# → dist/
```
