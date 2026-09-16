import argparse
import sys
import json
import time
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(AGENT_DIR))

import task_bus


def dispatch(assignee: str, task_type: str, title: str, payload_str: str = "{}"):
    try:
        payload = json.loads(payload_str)
    except Exception:
        payload = {"prompt": payload_str}
        
    task = task_bus.create_task(
        assignee=assignee,
        task_type=task_type,
        title=title,
        payload=payload,
        created_by="agent-1-leader"
    )
    print(f"[LEADER] Dispatched Task [{task['id']}] to {assignee}: '{title}'")
    return task


def list_all():
    tasks = task_bus.list_tasks()
    print(f"\n--- TOTAL TASKS IN QUEUE: {len(tasks)} ---")
    for t in tasks:
        print(f"[{t['id']}] | {t['status']:<11} | Assignee: {t['assignee']:<20} | Type: {t['task_type']} | Title: {t['title']}")
        if t['status'] == "COMPLETED" and t.get('result'):
            verdict = t['result'].get('agent_verdict') or "Done"
            print(f"       -> Result: {verdict}")
        elif t['status'] == "FAILED":
            print(f"       -> Error: {t.get('error')}")


def inspect(task_id: str):
    task = task_bus.get_task(task_id)
    if not task:
        print(f"Task {task_id} not found.")
        return
    print(json.dumps(task, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Antigravity Team Leader Task Bus CLI")
    subparsers = parser.add_subparsers(dest="subcommand")
    
    dispatch_parser = subparsers.add_parser("dispatch")
    dispatch_parser.add_argument("--assignee", default="agent-2-data-ops", help="Target agent ID")
    dispatch_parser.add_argument("--type", required=True, help="Task type")
    dispatch_parser.add_argument("--title", required=True, help="Short title")
    dispatch_parser.add_argument("--payload", default="{}", help="JSON string or prompt")
    
    list_parser = subparsers.add_parser("list")
    
    inspect_parser = subparsers.add_parser("inspect")
    inspect_parser.add_argument("task_id", help="ID of task to inspect")
    
    args = parser.parse_args()
    if args.subcommand == "dispatch":
        dispatch(args.assignee, args.type, args.title, args.payload)
    elif args.subcommand == "list":
        list_all()
    elif args.subcommand == "inspect":
        inspect(args.task_id)
    else:
        parser.print_help()
