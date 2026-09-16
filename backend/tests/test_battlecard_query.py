import json
import urllib.request

payload = {
    "question": "battle card vmware vs nutanix komparasi fitur utama dan TCO"
}

data = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(
    "http://127.0.0.1:8000/query",
    data=data,
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req, timeout=90) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print("[PASS] Battlecard Query Success!")
        print(f"Sources Used: {res.get('sources_used')}")
        for s in res.get("sources", []):
            print(f"  - [{s.get('source')}] {s.get('title')}")
        print("\nAnswer Excerpt:\n", res.get("answer", "")[:400])
except Exception as e:
    print("[FAIL] Request error:", e)
