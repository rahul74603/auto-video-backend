<#
.SYNOPSIS
    Sync fixed workflow files from ai_backend/github_workflows/ (staging)
    into .github/workflows/ (live) on your machine.

.DESCRIPTION
    The arena-ai-coding-agent GitHub App token has no "workflows" permission,
    so pushes touching .github/workflows/* are rejected on the remote.
    Bot-authored workflow fixes are committed to the staging directory
    ai_backend/github_workflows/ instead. Run this script locally to copy
    them into the real .github/workflows/ directory, then commit and push.

    Only files that exist in BOTH directories are copied (staging wins).
    Files that exist only in staging or only in live are reported, not touched.

    NOTE: this file is plain ASCII on purpose. Windows PowerShell 5.1 reads
    scripts without a BOM as ANSI, and non-ASCII text (em dashes, arrows,
    curly quotes) can silently break parsing. Do not add non-ASCII here.

.PARAMETER DryRun
    Show what would be copied without writing anything.

.EXAMPLE
    .\tools\sync-workflows.ps1
    .\tools\sync-workflows.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$repoRoot   = Split-Path -Parent $PSScriptRoot
$stagingDir = Join-Path $repoRoot 'ai_backend\github_workflows'
$liveDir    = Join-Path $repoRoot '.github\workflows'

if (-not (Test-Path $stagingDir)) { throw "Staging dir not found: $stagingDir" }
if (-not (Test-Path $liveDir)) { throw "Live workflows dir not found: $liveDir" }

$stagingFiles = Get-ChildItem -Path $stagingDir -Filter '*.yml' -File
$copied = @()
$same   = @()

foreach ($file in $stagingFiles) {
    $target = Join-Path $liveDir $file.Name
    if (-not (Test-Path $target)) {
        Write-Host ("SKIP (not present in live): " + $file.Name) -ForegroundColor Yellow
        continue
    }
    $sourceHash = (Get-FileHash $file.FullName -Algorithm SHA256).Hash
    $targetHash = (Get-FileHash $target -Algorithm SHA256).Hash
    if ($sourceHash -eq $targetHash) {
        $same += $file.Name
        continue
    }
    $copied += $file.Name
    if (-not $DryRun) {
        Copy-Item -Path $file.FullName -Destination $target -Force
        Write-Host ("SYNCED: " + $file.Name + "  (staging -> .github/workflows)") -ForegroundColor Green
    } else {
        Write-Host ("WOULD SYNC: " + $file.Name) -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host ("Already in sync (no change): " + $same.Count)
if ($DryRun) {
    Write-Host ("Dry run - nothing was written. " + $copied.Count + " file(s) would be synced.")
    Write-Host "To apply, run: .\tools\sync-workflows.ps1"
} else {
    Write-Host ("Done. " + $copied.Count + " file(s) copied.")
    Write-Host "Now commit and push:"
    Write-Host "  git add .github/workflows"
    Write-Host "  git commit -m ""chore(ci): sync workflow fixes"""
    Write-Host "  git push"
}
