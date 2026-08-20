# =============================================================================
# fresh-setup.ps1 — repo dobara clone karke secrets copy karta hai
#
# Kab use karein: jab purane clone ke refs itne kharab ho jaayen ki
# fetch/prune kaam hi na kare ("bad object", "reference broken",
# "Invalid argument" jaise errors).
#
# Ye script:
#   1. naya saaf clone banata hai
#   2. sahi branch checkout karta hai
#   3. purane folder se gitignored secret files copy karta hai
#      (.env, credentials.json, service_account.json, token.json, tts-key.json)
#   4. workflow files install karta hai
#
# Purana folder DELETE nahi hota — backup ke liye waise hi rehta hai.
#
# Usage (kahin se bhi chala sakte ho, PowerShell me):
#   powershell -ExecutionPolicy Bypass -File fresh-setup.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

$Branch  = "arena/01a01b18-auto-video-backend"
$RepoUrl = "https://github.com/rahul74603/auto-video-backend.git"
$OldDir  = "$HOME\auto-video-backend"
$NewDir  = "$HOME\auto-video-backend-new"

Write-Host ""
Write-Host "=== Step 1: naya clone ===" -ForegroundColor Cyan

if (Test-Path $NewDir) {
    Write-Host "  '$NewDir' pehle se hai. Pehle use hata do ya rename kar do." -ForegroundColor Red
    exit 1
}

git clone $RepoUrl $NewDir
if ($LASTEXITCODE -ne 0) { Write-Host "X Clone fail" -ForegroundColor Red; exit 1 }

Set-Location $NewDir

Write-Host ""
Write-Host "=== Step 2: branch checkout ===" -ForegroundColor Cyan
git checkout $Branch
if ($LASTEXITCODE -ne 0) { Write-Host "X Checkout fail" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== Step 3: purane folder se secrets copy ===" -ForegroundColor Cyan

# Ye files gitignored hain, isliye clone me nahi aatin — inhe haath se laana padta hai.
$Secrets = @(
    "ai_backend\.env",
    "ai_backend\credentials.json",
    "ai_backend\service_account.json",
    "ai_backend\token.json",
    "ai_backend\tts-key.json",
    ".env",
    ".env.local"
)

if (-not (Test-Path $OldDir)) {
    Write-Host "  Purana folder nahi mila ($OldDir) — copy skip." -ForegroundColor Yellow
} else {
    $copied = 0
    foreach ($rel in $Secrets) {
        $src = Join-Path $OldDir $rel
        if (Test-Path $src) {
            $dst = Join-Path $NewDir $rel
            $dstDir = Split-Path $dst -Parent
            if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
            Copy-Item $src $dst -Force
            Write-Host "  copied: $rel" -ForegroundColor Green
            $copied++
        }
    }
    if ($copied -eq 0) { Write-Host "  Koi secret file nahi mili (shayad zaroorat na ho)." -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "=== Step 4: workflow files install ===" -ForegroundColor Cyan

$Files = @("video_dispatcher.yml","video_maker.yml","mock_test_maker.yml","fast_track.yml")
if (-not (Test-Path ".github\workflows")) { New-Item -ItemType Directory -Path ".github\workflows" -Force | Out-Null }
foreach ($f in $Files) {
    Copy-Item "ai_backend\github_workflows\$f" ".github\workflows\$f" -Force
    Write-Host "  installed: .github\workflows\$f" -ForegroundColor Green
}
git add .github/workflows

Write-Host ""
Write-Host "OK Sab ho gaya!" -ForegroundColor Green
Write-Host ""
Write-Host "Naya folder: $NewDir" -ForegroundColor White
Write-Host "(purana '$OldDir' backup ke liye waise hi hai)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Ab VS Code me naya folder kholo:" -ForegroundColor White
Write-Host "    code `"$NewDir`"" -ForegroundColor White
Write-Host ""
Write-Host "Aur workflow commit + push karo:" -ForegroundColor White
Write-Host "    git commit -m `"Install billing-independent video dispatcher workflows`"" -ForegroundColor White
Write-Host "    git push origin $Branch" -ForegroundColor White
Write-Host ""
