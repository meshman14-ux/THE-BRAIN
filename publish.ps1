# THE BRAIN - one-click publish
# Commits every change in this folder and pushes to GitHub.
# GitHub Pages redeploys automatically within ~30-60 seconds.

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "  THE BRAIN - Publish" -ForegroundColor Cyan
Write-Host "  --------------------" -ForegroundColor Cyan

# Any changes to publish?
$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
    Write-Host "  Nothing to publish - everything is already live." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Live at: https://meshman14-ux.github.io/THE-BRAIN/"
    Read-Host "`n  Press Enter to close"
    exit 0
}

Write-Host "  Changes to publish:" -ForegroundColor Green
git status --short

# Commit message: use the argument if given, otherwise a timestamped default.
$msg = if ($args.Count -gt 0) { $args -join ' ' } else { "Update site ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))" }

git add -A
git commit -m $msg | Out-Null
Write-Host "`n  Committed: $msg" -ForegroundColor Green

Write-Host "  Pushing to GitHub..." -ForegroundColor Cyan
git push

Write-Host "`n  Done. Live in ~30-60 seconds at:" -ForegroundColor Green
Write-Host "  https://meshman14-ux.github.io/THE-BRAIN/"
Read-Host "`n  Press Enter to close"
