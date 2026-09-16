"""
Agent 3: Sentinel Health & Auto-Healer Daemon
Continuously monitors system health, port collisions, backend/frontend availability,
and auto-recovers failed or zombie processes every 60 seconds.
"""

import os
import sys
import time
import subprocess
import urllib.request
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = AGENT_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"

LOG_FILE = AGENT_DIR / "logs" / "agent-3.log"
AGENT_ID = "agent-3-sentinel"


def log(msg: str):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] [{AGENT_ID}] {msg}"
    print(formatted)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(formatted + "\n")


def check_backend_health() -> bool:
    try:
        req = urllib.request.Request("http://127.0.0.1:8000/health", headers={"User-Agent": "Agent3-Sentinel"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False


def check_frontend_health() -> bool:
    try:
        req = urllib.request.Request("http://localhost:3000", headers={"User-Agent": "Agent3-Sentinel"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            return resp.status in (200, 304)
    except Exception:
        return False


def heal_frontend():
    log("[ALERT] Frontend on port 3000 is unresponsive or zombie! Auto-healing...")
    # Kill any zombie node processes
    subprocess.run(["powershell", "-Command", "Stop-Process -Name 'node' -Force -ErrorAction SilentlyContinue"], capture_output=True)
    time.sleep(2)
    # Restart frontend dev server
    subprocess.Popen(["npm", "run", "dev"], cwd=str(FRONTEND_DIR), shell=True)
    log("[RECOVERED] Frontend restarted on port 3000.")


def heal_backend():
    log("[ALERT] Backend on port 8000 is unresponsive! Auto-healing...")
    python_exe = BACKEND_DIR / "venv" / "Scripts" / "python.exe"
    subprocess.run(["powershell", "-Command", "Stop-Process -Name 'python' -Force -ErrorAction SilentlyContinue"], capture_output=True)
    time.sleep(1)
    subprocess.Popen([str(python_exe), "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"], cwd=str(BACKEND_DIR))
    log("[RECOVERED] Backend restarted on port 8000.")


def run_sentinel_loop(interval_seconds: int = 60):
    log(f"Sentinel Agent 3 started. Active watch on Backend (8000) & Frontend (3000) every {interval_seconds}s...")
    while True:
        try:
            backend_ok = check_backend_health()
            frontend_ok = check_frontend_health()
            
            if not backend_ok:
                heal_backend()
            if not frontend_ok:
                heal_frontend()
                
            if backend_ok and frontend_ok:
                log("Heartbeat OK: Backend (8000) & Frontend (3000) operating normally.")
        except Exception as e:
            log(f"Sentinel error during check: {e}")
            
        time.sleep(interval_seconds)


if __name__ == "__main__":
    run_sentinel_loop(60)
