import os
import json
import time
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List

BASE_DIR = Path(__file__).resolve().parent
QUEUE_FILE = BASE_DIR / "task_queue.json"
LOG_DIR = BASE_DIR / "logs"

LOG_DIR.mkdir(parents=True, exist_ok=True)


def _load_queue() -> Dict[str, Any]:
    if not QUEUE_FILE.exists():
        initial = {"tasks": [], "updated_at": time.time()}
        _save_queue(initial)
        return initial
    try:
        with open(QUEUE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"tasks": [], "updated_at": time.time()}


def _save_queue(data: Dict[str, Any]):
    temp_file = QUEUE_FILE.with_suffix(".tmp")
    data["updated_at"] = time.time()
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    temp_file.replace(QUEUE_FILE)


def create_task(
    assignee: str,
    task_type: str,
    title: str,
    payload: Optional[Dict[str, Any]] = None,
    created_by: str = "agent-1-leader"
) -> Dict[str, Any]:
    queue = _load_queue()
    task_id = f"task-{uuid.uuid4().hex[:8]}"
    task = {
        "id": task_id,
        "assignee": assignee,
        "task_type": task_type,
        "title": title,
        "status": "PENDING",  # PENDING -> IN_PROGRESS -> COMPLETED | FAILED
        "created_by": created_by,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "started_at": None,
        "completed_at": None,
        "payload": payload or {},
        "result": None,
        "error": None
    }
    queue["tasks"].append(task)
    _save_queue(queue)
    return task


def get_pending_tasks(assignee: Optional[str] = None) -> List[Dict[str, Any]]:
    queue = _load_queue()
    pending = []
    for t in queue.get("tasks", []):
        if t["status"] == "PENDING":
            if assignee is None or t.get("assignee") == assignee:
                pending.append(t)
    return pending


def update_task_status(
    task_id: str,
    status: str,
    result: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    queue = _load_queue()
    for t in queue.get("tasks", []):
        if t["id"] == task_id:
            t["status"] = status
            now_str = time.strftime("%Y-%m-%d %H:%M:%S")
            if status == "IN_PROGRESS" and not t.get("started_at"):
                t["started_at"] = now_str
            elif status in ("COMPLETED", "FAILED"):
                t["completed_at"] = now_str
            if result is not None:
                t["result"] = result
            if error is not None:
                t["error"] = error
            _save_queue(queue)
            return t
    return None


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    queue = _load_queue()
    for t in queue.get("tasks", []):
        if t["id"] == task_id:
            return t
    return None


def list_tasks(status: Optional[str] = None, assignee: Optional[str] = None) -> List[Dict[str, Any]]:
    queue = _load_queue()
    tasks = queue.get("tasks", [])
    if status:
        tasks = [t for t in tasks if t["status"] == status]
    if assignee:
        tasks = [t for t in tasks if t.get("assignee") == assignee]
    return tasks
