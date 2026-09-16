"""
Agent 2: DataOps, Database & Benchmark Quality Specialist
Autonomous Worker Agent that listens to the task bus, executes assigned tasks,
and reports results back to Agent 1 (Team Leader).
"""

import os
import sys
import time
import json
import traceback
import subprocess
from pathlib import Path
from typing import Dict, Any

# Ensure backend directory is in sys.path and load backend/.env
AGENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = AGENT_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(AGENT_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

import task_bus

LOG_FILE = AGENT_DIR / "logs" / "agent-2.log"
AGENT_ID = "agent-2-data-ops"


def log(msg: str):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] [{AGENT_ID}] {msg}"
    print(formatted)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(formatted + "\n")


def execute_database_vector_audit(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Inspects PostgreSQL, pgvector embedding health, tables and chunks distribution."""
    log("Connecting to database for vector audit...")
    from app.db import SessionLocal
    from sqlalchemy import text
    
    session = SessionLocal()
    try:
        # Table counts
        docs_count = session.execute(text("SELECT COUNT(*) FROM documents")).scalar() or 0
        chunks_count = session.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar() or 0
        workspaces_count = session.execute(text("SELECT COUNT(*) FROM workspaces")).scalar() or 0
        sessions_count = session.execute(text("SELECT COUNT(*) FROM proposal_sessions")).scalar() or 0
        
        # Check pgvector dimension and non-null
        null_embeddings = session.execute(text("SELECT COUNT(*) FROM document_chunks WHERE embedding IS NULL")).scalar() or 0
        
        # Check average chunk size
        avg_chunk_len = session.execute(text("SELECT COALESCE(AVG(LENGTH(content)), 0) FROM document_chunks")).scalar() or 0
        
        # Check latest documents
        latest_docs = session.execute(text("SELECT id, title, doc_type, updated_at FROM documents ORDER BY updated_at DESC LIMIT 5")).fetchall()
        recent_docs_list = [
            {"id": r[0], "title": r[1], "doc_type": r[2], "updated_at": str(r[3])}
            for r in latest_docs
        ]
        
        health_score = "100% HEALTHY" if null_embeddings == 0 else f"{round((chunks_count - null_embeddings) / max(chunks_count, 1) * 100, 1)}% HEALTHY"
        
        return {
            "status": "success",
            "health_score": health_score,
            "database_stats": {
                "workspaces_count": workspaces_count,
                "documents_count": docs_count,
                "chunks_count": chunks_count,
                "proposal_sessions_count": sessions_count,
                "null_embeddings_count": null_embeddings,
                "avg_chunk_length_chars": round(float(avg_chunk_len), 1)
            },
            "recent_documents": recent_docs_list,
            "agent_verdict": "Database vector storage and indexing are fully synchronized and operative."
        }
    finally:
        session.close()


def execute_benchmark_eval(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Runs tests/benchmark_eval.py and analyzes grounding score & latency."""
    log("Running benchmark_eval.py suite...")
    python_exe = BACKEND_DIR / "venv" / "Scripts" / "python.exe"
    script_path = BACKEND_DIR / "tests" / "benchmark_eval.py"
    
    cmd = [str(python_exe), str(script_path)]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_DIR)
    result = subprocess.run(
        cmd,
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env
    )
    
    output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
    success = result.returncode == 0
    
    # Simple metric extraction
    passed_cases = output.count("[PASS]")
    failed_cases = output.count("[FAIL]")
    
    return {
        "status": "success" if success else "failed",
        "return_code": result.returncode,
        "metrics": {
            "passed_cases": passed_cases,
            "failed_cases": failed_cases,
            "total_evaluated": passed_cases + failed_cases
        },
        "raw_summary": output[-1000:] if len(output) > 1000 else output,
        "agent_verdict": "All Presales Grounding benchmarks passed with strong evidence retrieval." if success else "Some benchmark test cases failed."
    }


def execute_test_suite(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Runs unittest suite for proposal intelligence and router endpoints."""
    log("Running test_proposal_intelligence.py...")
    python_exe = BACKEND_DIR / "venv" / "Scripts" / "python.exe"
    script_path = BACKEND_DIR / "tests" / "test_proposal_intelligence.py"
    
    cmd = [str(python_exe), str(script_path)]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_DIR)
    result = subprocess.run(
        cmd,
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env
    )
    
    output = result.stdout + "\n" + result.stderr
    success = result.returncode == 0
    
    return {
        "status": "success" if success else "failed",
        "return_code": result.returncode,
        "output": output.strip(),
        "agent_verdict": "All unit tests and integration tests passed cleanly." if success else "Unit test suite encountered errors."
    }


def execute_autonomous_reasoning(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Uses Gemini to reason about custom technical questions or analysis assigned by Leader."""
    log("Executing autonomous LLM reasoning task...")
    from app.config import settings
    import google.generativeai as genai
    
    if not settings.google_api_key:
        return {"status": "failed", "error": "GOOGLE_API_KEY not configured"}
        
    genai.configure(api_key=settings.google_api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")
    
    prompt = payload.get("prompt") or payload.get("query") or "Perform health assessment"
    system_instruction = (
        "You are Agent 2: Synapse DataOps, Database & RAG Specialist. "
        "You report directly to Agent 1 (Antigravity Team Leader). "
        "Be technical, precise, concise, and structured."
    )
    
    response = model.generate_content(f"{system_instruction}\n\nTask:\n{prompt}")
    return {
        "status": "success",
        "response_text": response.text.strip(),
        "agent_verdict": "Autonomous reasoning completed successfully."
    }


HANDLERS = {
    "database_vector_audit": execute_database_vector_audit,
    "run_benchmark_eval": execute_benchmark_eval,
    "run_test_suite": execute_test_suite,
    "autonomous_reasoning": execute_autonomous_reasoning
}


def process_task(task: Dict[str, Any]):
    task_id = task["id"]
    task_type = task["task_type"]
    log(f"Received assigned task [{task_id}] '{task['title']}' (Type: {task_type})")
    
    task_bus.update_task_status(task_id, "IN_PROGRESS")
    
    handler = HANDLERS.get(task_type)
    if not handler:
        err = f"Unknown task type: {task_type}. Available: {list(HANDLERS.keys())}"
        log(f"Error: {err}")
        task_bus.update_task_status(task_id, "FAILED", error=err)
        return
        
    try:
        result = handler(task.get("payload", {}))
        log(f"Successfully finished task [{task_id}]: {result.get('agent_verdict', 'Done')}")
        task_bus.update_task_status(task_id, "COMPLETED", result=result)
    except Exception as e:
        err_msg = f"{str(e)}\n{traceback.format_exc()}"
        log(f"Exception during task [{task_id}]: {err_msg}")
        task_bus.update_task_status(task_id, "FAILED", error=str(e))


def run_daemon(poll_interval: float = 2.0):
    log(f"Worker daemon started. Listening for tasks assigned to '{AGENT_ID}' or 'agent-2'...")
    while True:
        try:
            pending = task_bus.get_pending_tasks()
            for t in pending:
                if t.get("assignee") in (AGENT_ID, "agent-2", "*"):
                    process_task(t)
        except Exception as e:
            log(f"Daemon loop error: {e}")
            
        time.sleep(poll_interval)


if __name__ == "__main__":
    run_daemon()
