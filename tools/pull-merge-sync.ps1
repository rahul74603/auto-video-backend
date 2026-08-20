<#
.SYNOPSIS
    One-command update: merge the Arena bot branch into main, copy any
    workflow fixes into .github/workflows, and push.

.DESCRIPTION
    The Arena bot cannot push files under .github/workflows/ (no GitHub App
    "workflows" permission), so the bot commits workflow fixes to
    ai_backend/github_workflows/ instead. This script - run by YOU, who has
    push permission - finishes the job:

        1. git fetch origin
        2. switch to main and pull
        3. merge the bot branch (fast-forward when possible)
        4. copy changed workflow files from ai_backend/github_workflows/
           into .github/workflows/ (staging wins, only files in both)
        5. commit and push main

    Run from the repository root.

.PARAMETER BotBranch
    The Arena session branch to merge.
    Default: arena/01a02163-auto-video-backend

.PARAMETER DryRun
    Print the plan and stop without changing anything.

.EXAMPLE
    .\tools\pull-merge-sync.ps1

.EXAMPLE
    .\tools\pull-merge-sync.ps1 -BotBranch arena/019fd293-auto-video-backend

.EXAMPLE
    .\tools\pull-merge-sync.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$BotBranch = "arena/01a02163-auto-video-backend",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Strip an optional origin/ prefix, then always merge the remote-tracking ref.
$Branch = $BotBranch -replace "^origin/", ""

if (-not (Test-Path ".git") -or -not (Test-Path "ai_backend\github_workflows")) {
    throw "Run this from the repository root (the folder that contains .git)."
}

Write-Host ""
Write-Host "== StudyGyaan update: origin/$Branch -> main + workflow sync =="

if ($DryRun) {
    Write-Host ""
    Write-Host "DRY RUN - no changes will be made."
    Write-Host "Plan:"
    Write-Host "  1. git fetch origin"
    Write-Host "  2. git checkout main && git pull origin main"
    Write-Host "  3. git merge --no-edit origin/$Branch"
    Write-Host "  4. sync ai_backend/github_workflows -> .github/workflows"
    Write-Host "  5. git add .github/workflows && commit && push origin main"
    Write-Host ""
    exit 0
}

# 1. fetch ---------------------------------------------------------------
Write-Host "[1/5] git fetch origin"
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

# 2. working tree must be clean ------------------------------------------
$dirty = git status --porcelain
if ($dirty) {
    Write-Host ""
    Write-Host "Working tree is not clean. Commit or stash first, then rerun:" -ForegroundColor Yellow
    $dirty | ForEach-Object { Write-Host "  $_" }
    throw "Aborted - uncommitted changes present."
}

# 3. main up to date -----------------------------------------------------
Write-Host "[2/5] git checkout main"
git checkout main
if ($LASTEXITCODE -ne 0) { throw "git checkout main failed" }

Write-Host "[3/5] git pull origin main"
git pull origin main
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

# 4. merge the bot branch ------------------------------------------------
Write-Host "[4/5] git merge --no-edit origin/$Branch"
git merge --no-edit "origin/$Branch"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Merge conflict. Resolve it, then:" -ForegroundColor Yellow
    Write-Host "  git add ."
    Write-Host "  git commit -m 'merge bot branch'"
    Write-Host "  .\tools\pull-merge-sync.ps1   (rerun to finish sync + push)"
    throw "Aborted - merge conflict."
}

# 5. workflow sync (staging -> live) --------------------------------------
Write-Host "[5/5] sync workflow files"
if (Test-Path "tools\sync-workflows.ps1") {
    & powershell -NoProfile -ExecutionPolicy Bypass -File "tools\sync-workflows.ps1"
    if ($LASTEXITCODE -ne 0) { throw "sync-workflows.ps1 failed" }
} else {
    Get-ChildItem -Path "ai_backend\github_workflows" -Filter "*.yml" -File | ForEach-Object {
        $target = Join-Path ".github\workflows" $_.Name
        if (Test-Path $target) {
            $s = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
            $d = (Get-FileHash $target    -Algorithm SHA256).Hash
            if ($s -ne $d) {
                Copy-Item $_.FullName $target -Force
                Write-Host "  SYNC: $($_.Name)"
            }
        }
    }
}

# commit + push -----------------------------------------------------------
$dirty2 = git status --porcelain
if ($dirty2) {
    Write-Host "commit + push"
    git add .github/workflows
    git commit -m "chore(ci): sync workflow fixes from bot branch"
    if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
}

git push origin main
if ($LASTEXITCODE -ne 0) { throw "git push failed" }

Write-Host ""
Write-Host "Done. main is up to date and pushed."
Write-Host "The open PR for this branch will auto-close once GitHub sees the commits in main."
