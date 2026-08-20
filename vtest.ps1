# =============================================================================
# vtest.ps1 — video dispatcher test ek command me chalao
#
# Ye script ai_backend\.videotest file update karta hai, run number khud badhata
# hai, commit karta hai aur push kar deta hai — jisse GitHub par
# "🧪 Video Dispatcher — Branch Test" workflow chal jata hai.
#
# ISTEMAAL:
#   .\vtest.ps1                        # dry run, saare pipelines
#   .\vtest.ps1 job                    # JOB ki asli video (unlisted)
#   .\vtest.ps1 fast_track             # FAST TRACK
#   .\vtest.ps1 mock_test              # MOCK TEST
#   .\vtest.ps1 job -DryRun            # JOB, sirf report (kuch banega nahi)
#   .\vtest.ps1 job -Doc abc123        # sirf ek Firestore document
#
# Agar "running scripts is disabled" error aaye to:
#   powershell -ExecutionPolicy Bypass -File .\vtest.ps1 job
# =============================================================================

param(
    [ValidateSet("all", "job", "fast_track", "mock_test")]
    [string]$Kind = "all",

    [switch]$DryRun,

    [string]$Doc = "",

    [int]$Limit = 1
)

# NOTE: 'Stop' nahi use karna. git apna normal progress stderr par likhta hai
# ("From https://github.com/..."), aur ErrorActionPreference=Stop uske saath
# milkar NativeCommandError phenk deta hai — chahe git safal hi kyun na ho.
# Isliye har git call ke baad $LASTEXITCODE khud check karte hain.
$ErrorActionPreference = "Continue"

function Test-GitOk {
    param([string]$What)
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "X $What fail (exit $LASTEXITCODE)" -ForegroundColor Red
        return $false
    }
    return $true
}

# --- sanity ------------------------------------------------------------------
if (-not (Test-Path ".git")) {
    Write-Host "X Repository root se chalao:  cd `$HOME\auto-video-backend" -ForegroundColor Red
    exit 1
}
$File = "ai_backend\.videotest"
if (-not (Test-Path $File)) {
    Write-Host "X $File nahi mila. Pehle pull karo:" -ForegroundColor Red
    Write-Host "    git pull --rebase origin arena/01a01b18-auto-video-backend" -ForegroundColor Yellow
    exit 1
}

# --- 'all' ke saath asli video banana theek nahi (teeno ek saath) ------------
# Default: 'all' => dry run, ek specific pipeline => asli video.
$isDry = if ($PSBoundParameters.ContainsKey('DryRun')) { [bool]$DryRun } else { $Kind -eq "all" }

$branch = (& git rev-parse --abbrev-ref HEAD)
if (-not (Test-GitOk "branch detect")) { exit 1 }
$branch = $branch.Trim()

# --- pehle remote se sync karo -----------------------------------------------
# Warna push 'non-fast-forward' se reject ho jata hai (jab is chat se koi commit
# push hua ho), aur run number bhi purana reh jata hai.
Write-Host ""
Write-Host "Syncing with remote..." -ForegroundColor Cyan

& git pull --rebase --quiet origin $branch
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "X Sync fail. Ye chalao:" -ForegroundColor Red
    Write-Host "    git pull --rebase origin $branch" -ForegroundColor Yellow
    Write-Host "  (agar conflict ho to: git rebase --abort, phir batao)" -ForegroundColor Yellow
    exit 1
}
Write-Host "  up to date" -ForegroundColor Green

# --- run number badhao (taaki file badle aur GitHub naya run trigger kare) ---
$old = Get-Content $File
$runLine = $old | Where-Object { $_ -match "^\s*run\s*=" } | Select-Object -Last 1
$runNum = 1
if ($runLine -and ($runLine -match "=\s*(\d+)")) { $runNum = [int]$Matches[1] + 1 }

# --- nayi file banao (comments waise hi rehne do) ----------------------------
$new = @()
foreach ($line in $old) {
    switch -regex ($line) {
        "^\s*run\s*="      { $new += "run=$runNum";                            continue }
        "^\s*kind\s*="     { $new += "kind=$Kind";                             continue }
        "^\s*limit\s*="    { $new += "limit=$Limit";                           continue }
        "^\s*dry_run\s*="  { $new += "dry_run=$($isDry.ToString().ToLower())"; continue }
        "^\s*privacy\s*="  { $new += "privacy=unlisted";                       continue }
        "^\s*doc\s*="      { $new += "doc=$Doc";                               continue }
        default            { $new += $line }
    }
}

# LF endings — Git aur bash dono ke liye safe
[IO.File]::WriteAllText((Resolve-Path $File), (($new -join "`n") + "`n"))

Write-Host ""
Write-Host "=== Test settings ===" -ForegroundColor Cyan
Write-Host "  run     : $runNum"
Write-Host "  kind    : $Kind"
Write-Host "  limit   : $Limit"
Write-Host "  dry_run : $($isDry.ToString().ToLower())" -ForegroundColor $(if ($isDry) { "Green" } else { "Yellow" })
Write-Host "  privacy : unlisted"
if ($Doc) { Write-Host "  doc     : $Doc" }
Write-Host ""

if ($isDry) {
    Write-Host "  (dry run - koi video nahi banegi, sirf report aayegi)" -ForegroundColor Green
} else {
    Write-Host "  (ASLI video banegi - YouTube par UNLISTED rahegi)" -ForegroundColor Yellow
}
Write-Host ""

# --- commit + push -----------------------------------------------------------
& git add $File
if (-not (Test-GitOk "git add")) { exit 1 }

& git commit --quiet -m "test: $Kind (run $runNum, dry_run=$($isDry.ToString().ToLower()))"
if ($LASTEXITCODE -ne 0) {
    Write-Host "X Commit fail - shayad file me koi change nahi hua." -ForegroundColor Red
    exit 1
}

Write-Host "Pushing..." -ForegroundColor Cyan
& git push --quiet origin $branch
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "X Push fail. Ye chalao phir dobara try karo:" -ForegroundColor Red
    Write-Host "    git pull --rebase origin $branch" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "OK Workflow chal pada!" -ForegroundColor Green
Write-Host ""
Write-Host "Run dekho yahan:" -ForegroundColor White
Write-Host "  https://github.com/rahul74603/auto-video-backend/actions/workflows/video_dispatcher_branch_test.yml" -ForegroundColor Cyan
Write-Host ""
