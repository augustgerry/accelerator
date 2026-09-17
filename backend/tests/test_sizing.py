import sys
from pathlib import Path
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from main import app


class TestSizing(unittest.TestCase):

    def test_calculate_sizing(self):
        client = TestClient(app)
        payload = {
            "platform": "pure_storage",
            "usable_capacity_tb": 100,
            "target_workload": "database",
            "growth_buffer_pct": 20,
        }
        resp = client.post("/draft/calculate-sizing", json=payload)
        self.assertEqual(resp.status_code, 200)
        res = resp.json()
        self.assertIn("recommended_model", res)
        self.assertIn("Pure Storage", res["recommended_model"])
        self.assertIn("metrics", res)
        self.assertGreater(res["metrics"]["raw_capacity_provisioned_tb"], 0)
        print("[PASS] Sizing Calculation Test:", res["recommended_model"])


if __name__ == "__main__":
    unittest.main()

