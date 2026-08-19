# GitHub Workflow Files — manual copy required

The automation bot that produced this branch does **not** have the GitHub App
`workflows` permission, so it cannot push files under `.github/workflows/`.
The four workflow files are therefore mirrored here, ready to copy.

They are already applied in this sandbox's working tree — they just could not be
included in the pushed commit.

## Install (one command)

```bash
cp ai_backend/github_workflows/video_dispatcher.yml \
   ai_backend/github_workflows/video_maker.yml \
   ai_backend/github_workflows/mock_test_maker.yml \
   ai_backend/github_workflows/fast_track.yml \
   .github/workflows/

git add .github/workflows/
git commit -m "Add billing-independent video dispatcher workflow"
git push
```

## What each file does

| File | Change |
|---|---|
| `video_dispatcher.yml` | **NEW** — scheduled Firestore poller every 15 min. The billing-independent trigger for all three pipelines. |
| `video_maker.yml` | Legacy `repository_dispatch` path kept intact (all three event types). Now uses `npm ci` instead of deleting `package-lock.json`, and the concurrency group no longer collapses to a single group when `slug` is absent. |
| `mock_test_maker.yml` | **Bug fix** — the automation guard step was nested directly under `jobs:`, making the file invalid YAML. `automation_check` never ran, so every step guarded by it was skipped and the workflow silently did nothing. Now a proper two-job workflow with a real output. |
| `fast_track.yml` | No longer depends solely on the Cloud Function endpoint; runs the scraper locally with the endpoint as an optional fallback. The previously hardcoded `x-auth-token` now comes from the `FAST_TRACK_TRIGGER_TOKEN` secret. Video responsibility moved to the dispatcher. |

All four files are valid YAML (verified with a YAML parser).

## Optional new secret

`FAST_TRACK_TRIGGER_TOKEN` — only needed if you still want the legacy Fast Track
Cloud Function fallback. It replaces a token that used to be committed in plain
text inside `fast_track.yml`.

Everything else uses secrets that already exist in the repository.
