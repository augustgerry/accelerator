# watchdog.ps1
# Auto-healer & keep-alive monitor for Knowledge Accelerator (Frontend + Backend)
# Cek setiap interval; jika ada service yang mati/tidak merespon, otomatis nyalakan kembali.
# Zero AI tokens - berjalan 100% lokal di Windows.

param (
    [int]$IntervalSeconds = 60  # Cek setiap 60 detik (1 menit)
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $projectRoot "watchdog.log"

function Write-WatchdogLog($message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $message"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

Write-WatchdogLog "=== Watchdog Monitor Aktif (Interval: ${IntervalSeconds}s / $([math]::Round($IntervalSeconds/60, 1))m) ==="

while ($true) {
    # 1. Cek Backend FastAPI (Port 8000)
    $backendAlive = $false
    try {
        $res = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 4 -UseBasicParsing -ErrorAction Stop
        if ($res.StatusCode -eq 200) {
            $backendAlive = $true
        }
    } catch {
        $backendAlive = $false
    }

    if (-not $backendAlive) {
        Write-WatchdogLog "[ALERT] Backend (Port 8000) MATI / tidak merespon. Menyalakan uvicorn..."
        $backendDir = Join-Path $projectRoot "backend"
        $pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
        if (-not (Test-Path $pythonExe)) {
            $pythonExe = "python"
        }
        Start-Process -FilePath $pythonExe -ArgumentList "-m uvicorn main:app --port 8000" -WorkingDirectory $backendDir -WindowStyle Hidden
        Start-Sleep -Seconds 12
        Write-WatchdogLog "[OK] Perintah start backend telah dikirim."
    } else {
        Write-WatchdogLog "[OK] Backend (Port 8000) AKTIF (200 OK)."
    }

    # 2. Cek Frontend Next.js (Port 3000)
    $frontendAlive = $false
    try {
        $res = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -TimeoutSec 4 -UseBasicParsing -ErrorAction Stop
        if ($res.StatusCode -eq 200) {
            $frontendAlive = $true
        }
    } catch {
        try {
            $res2 = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 4 -UseBasicParsing -ErrorAction Stop
            if ($res2.StatusCode -eq 200) { $frontendAlive = $true }
        } catch {
            $frontendAlive = $false
        }
    }

    if (-not $frontendAlive) {
        Write-WatchdogLog "[ALERT] Frontend (Port 3000) MATI / tidak merespon. Menyalakan npm run dev..."
        $frontendDir = Join-Path $projectRoot "frontend"
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $frontendDir -WindowStyle Hidden
        Start-Sleep -Seconds 8
        Write-WatchdogLog "[OK] Perintah start frontend telah dikirim."
    } else {
        Write-WatchdogLog "[OK] Frontend (Port 3000) AKTIF (200 OK)."
    }

    Start-Sleep -Seconds $IntervalSeconds
}
