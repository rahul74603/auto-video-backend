# =============================================================================
# fix-broken-ref.ps1 — repairs a corrupt remote-tracking ref that blocks fetch
#
# Symptom:
#   fatal: bad object refs/remotes/origin/arena/<id>
#   error: ... did not send all necessary objects
#   error: cannot lock ref ...: reference broken      <- update-ref -d fails too
#
# Cause:
#   A leftover remote-tracking ref from an older session is corrupt (empty or
#   truncated file, and/or a stale entry in .git/packed-refs). Git validates
#   every ref during fetch, so one bad ref aborts the whole operation and the
#   new branch is never downloaded.
#
# This script removes the bad ref from BOTH places Git stores refs:
#   1. .git/refs/remotes/...        (loose ref file)
#   2. .git/packed-refs             (packed ref entry)
#
# Your working files are untouched. .env / credentials.json / service_account.json
# are gitignored and are never affected.
#
# Usage (from the repository root, in PowerShell):
#   powershell -ExecutionPolicy Bypass -File ai_backend\github_workflows\fix-broken-ref.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
    Write-Host "X Repository root se chalao (jahan .git folder hai)." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Step 1: kharab refs dhoond rahe hain ===" -ForegroundColor Cyan

# --- find every ref git itself reports as broken -----------------------------
$broken = @()
$refOutput = & git for-each-ref --format="%(refname)" 2>&1
foreach ($line in $refOutput) {
    if ($line -match "ignoring broken ref (.+?)\s*$") { $broken += $Matches[1] }
}

# git fsck also names them
$fsck = & git fsck --no-progress 2>&1 | Out-String
foreach ($m in [regex]::Matches($fsck, "bad ref (\S+)"))      { $broken += $m.Groups[1].Value }
foreach ($m in [regex]::Matches($fsck, "(\S+): invalid sha1")) { $broken += $m.Groups[1].Value }

# any zero-length loose ref file under refs/remotes is corrupt by definition
if (Test-Path ".git\refs\remotes") {
    Get-ChildItem ".git\refs\remotes" -Recurse -File | ForEach-Object {
        if ($_.Length -eq 0) {
            $rel = $_.FullName.Substring((Resolve-Path ".git").Path.Length + 1)
            $broken += ($rel -replace '\\', '/')
        }
    }
}

$broken = $broken | Sort-Object -Unique

if ($broken.Count -eq 0) {
    Write-Host "  Koi broken ref nahi mila." -ForegroundColor Green
} else {
    foreach ($b in $broken) { Write-Host "  broken: $b" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "=== Step 2: loose ref files delete ===" -ForegroundColor Cyan

foreach ($ref in $broken) {
    $path = ".git\" + ($ref -replace '/', '\')
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  deleted file: $path" -ForegroundColor Green
    }
}

# Clean up any remaining zero-length ref files
if (Test-Path ".git\refs\remotes") {
    Get-ChildItem ".git\refs\remotes" -Recurse -File | Where-Object { $_.Length -eq 0 } | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Host "  deleted empty ref: $($_.FullName)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=== Step 3: packed-refs se stale entries hatana ===" -ForegroundColor Cyan

# A ref can also live in packed-refs; git re-materialises it from there on the
# next fetch, so the bad entry must go too.
if ((Test-Path ".git\packed-refs") -and $broken.Count -gt 0) {
    $lines = Get-Content ".git\packed-refs"
    $kept  = @()
    $dropped = 0
    foreach ($line in $lines) {
        $drop = $false
        foreach ($ref in $broken) {
            if ($line -match [regex]::Escape($ref)) { $drop = $true; break }
        }
        if ($drop) { $dropped++; Write-Host "  removed from packed-refs: $line" -ForegroundColor Green }
        else       { $kept += $line }
    }
    if ($dropped -gt 0) {
        # IMPORTANT: Git needs LF endings. Set-Content would write CRLF, which
        # appends a stray \r to every ref name and breaks fetch/prune on Windows
        # ("cannot lock ref '...?'": Invalid argument).
        [IO.File]::WriteAllText(".git\packed-refs", (($kept -join "`n") + "`n"))
    }
    else { Write-Host "  packed-refs me kuch nahi mila." }
} else {
    Write-Host "  packed-refs check skip." 
}

Write-Host ""
Write-Host "=== Step 3b: packed-refs ke line endings LF me normalise ===" -ForegroundColor Cyan
if (Test-Path ".git\packed-refs") {
    $raw = [IO.File]::ReadAllText(".git\packed-refs")
    if ($raw -match "`r") {
        [IO.File]::WriteAllText(".git\packed-refs", ($raw -replace "`r`n", "`n" -replace "`r", "`n"))
        Write-Host "  CRLF mila -> LF me theek kar diya" -ForegroundColor Green
    } else {
        Write-Host "  line endings pehle se sahi (LF)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=== Step 4: prune + fetch ===" -ForegroundColor Cyan
& git remote prune origin 2>&1 | Out-Null
& git fetch origin --prune
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "X Fetch abhi bhi fail ho raha hai." -ForegroundColor Red
    Write-Host "  Sabse aasan hal: repo dobara clone kar lo (aapka .env bacha kar):" -ForegroundColor Yellow
    Write-Host "    cd .." -ForegroundColor Yellow
    Write-Host "    git clone https://github.com/rahul74603/auto-video-backend.git avb-new" -ForegroundColor Yellow
    Write-Host "    copy auto-video-backend\ai_backend\.env avb-new\ai_backend\.env" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "OK Fetch chal gaya! Ab ye chalao:" -ForegroundColor Green
Write-Host ""
Write-Host "    git checkout arena/01a01b18-auto-video-backend" -ForegroundColor White
Write-Host "    git pull origin arena/01a01b18-auto-video-backend" -ForegroundColor White
Write-Host ""
