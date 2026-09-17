import sys
from pathlib import Path
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from main import app


class TestBattlecardQuery(unittest.TestCase):

    def test_battlecard_query(self):
        client = TestClient(app)
        payload = {
            "question": "battle card vmware vs nutanix komparasi fitur utama dan TCO"
        }
        resp = client.post("/query", json=payload)
        self.assertEqual(resp.status_code, 200)
        res = resp.json()
        self.assertIn("answer", res)
        self.assertGreater(len(res["answer"]), 50)
        self.assertIn("sources", res)
        print("[PASS] Battlecard Query Success! Sources Used:", res.get("sources_used"))


if __name__ == "__main__":
    unittest.main()

