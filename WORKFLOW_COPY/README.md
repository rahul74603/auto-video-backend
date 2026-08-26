# WORKFLOW_COPY — Manual Workflow Backup (Owner Only)

## What this folder is

`WORKFLOW_COPY/` is a **manual backup / copy folder for the repository owner**.
It is NOT an active GitHub Actions location. GitHub completely ignores it.

## The one active workflow location

```
.github/workflows/          ← ACTIVE GitHub Actions workflows (only this folder runs)
WORKFLOW_COPY/              ← manual copy/backup for the owner ONLY (never runs)
ai_backend/github_workflows/ ← old mirror, NOT active. Do not create new files there.
```

**There is only ONE active workflow folder: `.github/workflows/`**
Never create another active workflow folder, and never duplicate a workflow
inside `ai_backend/.github/workflows/`, `ai_backend/github_workflows/`, or
anywhere else.

## Why this folder exists (GitHub App permission)

The GitHub App used for automated PRs does **not** have permission to modify
files under `.github/workflows/*` on `main`. So when an automated PR needs a
workflow change, it cannot directly update the production workflow.

The workaround is this folder: the complete, final workflow is stored here as
a ready-to-paste `.txt` file, and the repository owner copies it into place
manually.

## How to apply a workflow change (owner manual step)

1. Open `WORKFLOW_COPY/video_dispatcher.yml.txt`
2. Select ALL content (Ctrl+A) and copy it
3. Open `.github/workflows/video_dispatcher.yml` in the repository
4. Select ALL old content and replace it with the copied content
5. Commit the change to `main` (owner account has workflow permission)
6. After committing, verify the file
   `.github/workflows/video_dispatcher.yml` and
   `WORKFLOW_COPY/video_dispatcher.yml.txt` are identical

## Current status

| File | Purpose |
|------|---------|
| `video_dispatcher.yml.txt` | Complete ready-to-paste copy of the production video dispatcher workflow (with the fixed Hindi font packages: `fonts-noto-core`, `fonts-noto-extra`, `fonts-noto-cjk`, `fonts-noto-color-emoji`) |

## Permanent rule

Whenever a GitHub workflow permission problem appears in ANY future task:

1. NEVER create a second active workflow.
2. NEVER pretend the workflow was pushed.
3. ALWAYS maintain `WORKFLOW_COPY/<workflow-name>.yml.txt` with the COMPLETE
   ready-to-paste workflow (no snippets, no `...`, no placeholders).
4. Clearly report: **"ACTIVE WORKFLOW REQUIRES MANUAL COPY"** until the owner
   has copied it into `.github/workflows/` on `main`.
