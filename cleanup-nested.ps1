# =============================================================================
# cleanup-nested.ps1 — galti se bana nested clone folder hatata hai
#
# Problem: Git ke pack files (.idx / .pack) READ-ONLY hote hain, isliye
# "Remove-Item -Recurse -Force" bhi "Access to the path is denied" deta hai.
# Upar se VS Code ka Git extension un files ko khol kar rakhta hai.
#
# Ye script pehle read-only attribute hatata hai, phir delete karta hai.
#
# ISTEMAAL:
#   .\cleanup-nested.ps1
#
# Agar phir bhi fail ho, to VS Code band karke Windows Explorer se
# folder delete kar do — ya bas chhod do, ye kisi cheez me rukavat nahi daalta.
# =============================================================================

param(
    [string]$Target = "auto-video-backend"
)

$ErrorActionPreference = "Continue"

if (-not (Test-Path ".git")) {
    Write-Host "X Repository root se chalao: cd `$HOME\auto-video-backend" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $Target)) {
    Write-Host "OK '$Target' pehle se nahi hai - kuch karne ki zaroorat nahi." -ForegroundColor Green
    exit 0
}

# Safety: sirf nested folder hatao, kabhi asli repo nahi
$full = (Resolve-Path $Target).Path
$here = (Resolve-Path ".").Path
if ($full -eq $here) {
    Write-Host "X Ye to current repo hi hai - delete nahi karunga." -ForegroundColor Red
    exit 1
}
if (-not $full.StartsWith($here)) {
    Write-Host "X '$Target' is repo ke andar nahi hai - delete nahi karunga." -ForegroundColor Red
    exit 1
}
# Us folder me tracked files to nahi?
$tracked = git ls-files $Target 2>$null
if ($tracked) {
    Write-Host "X '$Target' me git-tracked files hain - delete nahi karunga." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Read-only attributes hata rahe hain..." -ForegroundColor Cyan

# Git pack files read-only hoti hain - yahi 'Access denied' ki wajah hai
$count = 0
Get-ChildItem $Target -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.IsReadOnly) { $_.IsReadOnly = $false; $count++ }
}
Write-Host "  $count read-only file(s) unlock ki" -ForegroundColor Green

Write-Host "Deleting..." -ForegroundColor Cyan
Remove-Item $Target -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path $Target) {
    Write-Host ""
    Write-Host "!! Delete nahi ho paya - koi program in files ko use kar raha hai." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Ye karo:" -ForegroundColor White
    Write-Host "     1. VS Code band karo (poora, saari windows)" -ForegroundColor White
    Write-Host "     2. Naya PowerShell kholo aur dobara chalao:" -ForegroundColor White
    Write-Host "          cd `$HOME\auto-video-backend" -ForegroundColor White
    Write-Host "          .\cleanup-nested.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "   Ya bas chhod do - ye folder untracked hai, GitHub par kabhi" -ForegroundColor DarkGray
    Write-Host "   push nahi hoga aur kisi kaam me rukavat nahi daalta." -ForegroundColor DarkGray
    exit 1
}

Write-Host ""
Write-Host "OK '$Target' hat gaya." -ForegroundColor Green
Write-Host ""
