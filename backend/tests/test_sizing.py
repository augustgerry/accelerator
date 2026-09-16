import json
import urllib.request

payload = {
    "platform": "pure_storage",
    "usable_capacity_tb": 100,
    "target_workload": "database",
    "growth_buffer_pct": 20
}

data = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(
    "http://127.0.0.1:8000/draft/calculate-sizing",
    data=data,
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print("[PASS] Sizing Calculation Success!")
        print("Recommended Model:", res.get("recommended_model"))
        print("Metrics:", json.dumps(res.get("metrics"), indent=2))
except Exception as e:
    print("[FAIL] Request error:", e)
