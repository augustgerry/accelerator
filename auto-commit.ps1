# auto-commit.ps1
# Jalankan di root project: .\auto-commit.ps1
# Script ini akan auto-commit + push ke GitHub setiap 15 detik
# Stop dengan Ctrl+C

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$interval = 15  # detik

Write-Host "=== Synapse Auto-Commit Started ===" -ForegroundColor Cyan
Write-Host "Project: $projectRoot" -ForegroundColor Gray
Write-Host "Interval: ${interval}s | Stop: Ctrl+C" -ForegroundColor Gray
Write-Host ""

$commitCount = 0

while ($true) {
    Set-Location $projectRoot

    # Cek apakah ada perubahan
    $status = git status --porcelain 2>&1
    if ($status) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $changedFiles = ($status -split "`n").Count

        # Stage semua
        git add -A 2>&1 | Out-Null

        # Commit
        $commitMsg = "auto-save: $timestamp ($changedFiles file changes)"
        git commit -m $commitMsg 2>&1 | Out-Null

        # Push
        $pushResult = git push origin main 2>&1
        $commitCount++

        Write-Host "[$timestamp] OK Commit #$commitCount pushed ($changedFiles files)" -ForegroundColor Green
    } else {
        $timestamp = Get-Date -Format "HH:mm:ss"
        Write-Host "[$timestamp] - No changes" -ForegroundColor DarkGray
    }

    Start-Sleep -Seconds $interval
}
