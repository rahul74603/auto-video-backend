# =============================================================================
# install.ps1 — Windows PowerShell version of install.sh
#
# Copies the four video workflow files from ai_backend\github_workflows\
# into .github\workflows\ and stages them.
#
# Why this exists: the Arena bot lacks the GitHub App `workflows` permission,
# so it could not push files under .github/workflows/. Your own GitHub account
# can, so you install them locally and push.
#
# Usage (repository root se chalao):
#   powershell -ExecutionPolicy Bypass -File ai_backend\github_workflows\install.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

$Files = @(
    "video_dispatcher.yml",
    "video_maker.yml",
    "mock_test_maker.yml",
    "fast_track.yml"
)

$Src = "ai_backend\github_workflows"
$Dst = ".github\workflows"

# --- sanity: repo root se hi chalna chahiye ----------------------------------
if (-not (Test-Path ".git")) {
    Write-Host "X Repository root se chalao (jahan .git folder hai)." -ForegroundColor Red
    Write-Host "  cd `$HOME\auto-video-backend" -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Path $Src)) {
    Write-Host "X '$Src' nahi mila. Pehle branch pull karo:" -ForegroundColor Red
    Write-Host "  git checkout arena/01a01b18-auto-video-backend" -ForegroundColor Yellow
    Write-Host "  git pull origin arena/01a01b18-auto-video-backend" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $Dst)) { New-Item -ItemType Directory -Path $Dst -Force | Out-Null }

Write-Host ""
Write-Host "Installing video workflow files..." -ForegroundColor Cyan
foreach ($f in $Files) {
    $from = Join-Path $Src $f
    if (-not (Test-Path $from)) {
        Write-Host "  X Missing source file: $from" -ForegroundColor Red
        exit 1
    }
    Copy-Item $from (Join-Path $Dst $f) -Force
    Write-Host "  OK  $Dst\$f" -ForegroundColor Green
}

# --- verify the copies are byte-identical ------------------------------------
Write-Host ""
Write-Host "Verifying..." -ForegroundColor Cyan
foreach ($f in $Files) {
    $a = (Get-FileHash (Join-Path $Src $f) -Algorithm SHA256).Hash
    $b = (Get-FileHash (Join-Path $Dst $f) -Algorithm SHA256).Hash
    if ($a -eq $b) {
        Write-Host "  OK  $f identical" -ForegroundColor Green
    } else {
        Write-Host "  X   $f differs - aborting" -ForegroundColor Red
        exit 1
    }
}

# --- safety check: dispatcher should ship disabled ---------------------------
Write-Host ""
$dispatcher = Get-Content (Join-Path $Dst "video_dispatcher.yml")
$activeCron = $dispatcher | Where-Object { $_ -match "^\s*-\s*cron:" }
if ($activeCron) {
    Write-Host "  !! video_dispatcher.yml ka schedule ACTIVE hai." -ForegroundColor Yellow
    Write-Host "     Pehle unlisted test karo, tabhi live rakho." -ForegroundColor Yellow
} else {
    Write-Host "  OK  dispatcher schedule disabled (manual-only) - safe to install" -ForegroundColor Green
}

Write-Host ""
Write-Host "Staging..." -ForegroundColor Cyan
git add $Dst

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Kuch change nahi - files pehle se installed hain." -ForegroundColor Yellow
    exit 0
}

git diff --cached --stat

$branch = (git rev-parse --abbrev-ref HEAD).Trim()

Write-Host ""
Write-Host "Ho gaya. Ab commit + push karo:" -ForegroundColor Green
Write-Host ""
Write-Host "    git commit -m `"Install billing-independent video dispatcher workflows`"" -ForegroundColor White
Write-Host "    git push origin $branch" -ForegroundColor White
Write-Host ""
