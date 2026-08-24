# disable_workflows.ps1
# StudyGyaan — Disable unused workflows via GitHub API
#
# Use: PowerShell me run karo
#   cd C:\Users\Rahul\auto-video-backend
#   .\scripts\disable_workflows.ps1
#
# Requirements:
#   - GitHub CLI (gh) installed and logged in
#   - Ya GitHub Personal Access Token with 'repo' scope

param(
    [switch]$Enable,  # -Enable flag se workflows wapas enable honge
    [switch]$DryRun   # -DryRun se sirf dikhayega, koi change nahi
)

$REPO = "rahul74603/auto-video-backend"

# Ye workflows disable honge (0 runs ya duplicate)
$WORKFLOWS_TO_TOGGLE = @(
    "video_maker.yml",
    "video_dispatcher_branch_test.yml",
    "auto_post_linkedin.yml",
    "auto_post_twitter.yml",
    "auto_post_social_all.yml",
    "fb_post.yml",
    "telegram_alert.yml",
    "fast_track.yml",
    "long_video_maker.yml"
)

function Get-WorkflowId($fileName) {
    # GitHub API se workflow ID nikalo
    $url = "https://api.github.com/repos/$REPO/actions/workflows/$fileName"
    $response = Invoke-RestMethod -Uri $url -Headers @{
        "Authorization" = "token $env:GH_TOKEN"
        "Accept" = "application/vnd.github.v3+json"
    } -Method Get
    return $response.id
}

function Toggle-Workflow($workflowId, $fileName, $enable) {
    $action = if ($enable) { "ENABLE" } else { "DISABLE" }

    if ($DryRun) {
        Write-Host "  [DRY-RUN] Would $action $fileName (ID: $workflowId)" -ForegroundColor Yellow
        return
    }

    $url = "https://api.github.com/repos/$REPO/actions/workflows/$workflowId/$($enable ? 'enable' : 'disable')"
    try {
        Invoke-RestMethod -Uri $url -Headers @{
            "Authorization" = "token $env:GH_TOKEN"
            "Accept" = "application/vnd.github.v3+json"
        } -Method Put | Out-Null
        $color = if ($enable) { "Green" } else { "Red" }
        Write-Host "  [$action] $fileName" -ForegroundColor $color
    } catch {
        Write-Host "  [ERROR] $fileName : $_" -ForegroundColor Red
    }
}

# Main
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($Enable) {
    Write-Host "  ENABLING workflows in $REPO" -ForegroundColor Green
} else {
    Write-Host "  DISABLING workflows in $REPO" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if gh CLI is available
if (Get-Command gh -ErrorAction SilentlyContinue) {
    # gh CLI use karo
    $token = gh auth token 2>$null
    if ($token) {
        $env:GH_TOKEN = $token
        Write-Host "Using gh CLI auth" -ForegroundColor Gray
    }
}

if (-not $env:GH_TOKEN) {
    Write-Host "ERROR: GH_TOKEN set nahi hai!" -ForegroundColor Red
    Write-Host "Solution 1: gh auth login karo" -ForegroundColor Yellow
    Write-Host "Solution 2: `$env:GH_TOKEN = 'your_pat_here' set karo" -ForegroundColor Yellow
    exit 1
}

foreach ($wf in $WORKFLOWS_TO_TOGGLE) {
    try {
        $id = Get-WorkflowId $wf
        Toggle-Workflow $id $wf $Enable
    } catch {
        Write-Host "  [SKIP] $wf : $_" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Done! Check: https://github.com/$REPO/actions" -ForegroundColor Cyan
Write-Host ""
