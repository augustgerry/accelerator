"""
Tests for Proposal Intelligence & Compliance Service
Verifies:
1. Red-Flag & Critical Clause Scanner
2. Requirement Coverage & Gap Analysis Checker
3. HTTP Endpoints (/draft/scan-critical-clauses, /draft/check-coverage)
"""

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.services.proposal_intelligence import scan_critical_clauses, audit_requirement_coverage
from main import app


SAMPLE_TOR_TEXT = """
KERANGKA ACUAN KERJA (KAK)
PENGADAAN INFRASTRUKTUR DATA CENTER & STORAGE CONVERGED

1. KETENTUAN UMUM
Peserta tender wajib memiliki sertifikasi ISO 27001 dan surat dukungan resmi (authorized partner) dari principal perangkat keras.
Penyedia yang tidak dapat melampirkan dokumen ini dinyatakan gugur teknis.

2. SPESIFIKASI TEKNIS MINIMAL
Perangkat storage yang ditawarkan harus memiliki kapasitas usable minimal 100 TB dengan teknologi all-flash NVMe.
Konektivitas host wajib mendukung 32Gb Fibre Channel (FC) redundant controller.

3. SERVICE LEVEL AGREEMENT & PEMELIHARAAN
Target Service Level Agreement (SLA) ketersediaan sistem adalah 99.99%.
Waktu respon (response time) teknisi on-site maksimal 2 jam untuk insiden kategori kritis (Severity 1) selama periode 24x7.
Penyedia wajib menyediakan layanan garansi dan pemeliharaan selama minimal 3 (tiga) tahun.

4. SANKSI DAN DENDA KETERLAMBATAN
Apabila terjadi keterlambatan penyerahan barang atau wanprestasi pekerjaan, maka penyedia dikenakan denda sebesar 1 permil (0,1%) per hari keterlambatan dari total nilai kontrak, hingga batas maksimal pemutusan kontrak sepihak.
"""


class TestProposalIntelligence(unittest.TestCase):

    def test_scan_critical_clauses(self):
        result = scan_critical_clauses(SAMPLE_TOR_TEXT)
        self.assertIn(result["risk_level"], ["Medium", "High"])
        self.assertGreaterEqual(result["total_critical_found"], 4)
        self.assertGreaterEqual(len(result["mandatory_requirements"]), 1)
        self.assertGreaterEqual(len(result["penalties_and_risks"]), 1)
        self.assertGreaterEqual(len(result["sla_and_maintenance"]), 1)
        self.assertGreaterEqual(len(result["certifications_and_legal"]), 1)
        print(">> test_scan_critical_clauses PASS: Total critical found =", result["total_critical_found"])

    def test_audit_requirement_coverage(self):
        sample_items = [
            {
                "id": "sec-1",
                "title": "3. Proposed Solution",
                "requirement_text": "Spesifikasi minimal storage 100 TB NVMe dan 32Gb Fibre Channel",
                "draft_text": "Kami mengusulkan storage all-flash NVMe dengan kapasitas usable 100 TB dan konektivitas 32Gb Fibre Channel redundant.",
            },
            {
                "id": "sec-2",
                "title": "7. Maintenance Plan",
                "requirement_text": "SLA ketersediaan 99.99% dan response time 2 jam on-site 24x7",
                "draft_text": "Tim technical support siap memberikan garansi pemeliharaan 3 tahun dengan SLA 99.99% dan respon teknisi on-site 2 jam 24x7.",
            },
        ]
        result = audit_requirement_coverage(SAMPLE_TOR_TEXT, sample_items)
        self.assertGreaterEqual(result["overall_coverage_pct"], 50)
        self.assertGreaterEqual(result["covered_count"], 1)
        self.assertTrue(len(result["recommendations"]) > 0)
        print(">> test_audit_requirement_coverage PASS: Coverage =", result["overall_coverage_pct"], "%")

    def test_http_endpoints(self):
        client = TestClient(app)

        # Test scan critical clauses
        resp = client.post("/draft/scan-critical-clauses", json={"tor_text": SAMPLE_TOR_TEXT})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("risk_level", data)
        self.assertGreaterEqual(data["total_critical_found"], 3)

        # Test check coverage
        cov_resp = client.post("/draft/check-coverage", json={
            "tor_text": SAMPLE_TOR_TEXT,
            "items": [
                {
                    "id": "1",
                    "title": "Solusi Teknis",
                    "requirement_text": "Storage kapasitas 100 TB NVMe",
                    "draft_text": "Storage berkapasitas 100 TB NVMe.",
                }
            ]
        })
        self.assertEqual(cov_resp.status_code, 200)
        cov_data = cov_resp.json()
        self.assertIn("overall_coverage_pct", cov_data)
        print(">> test_http_endpoints PASS: Both /draft endpoints returned 200 OK")


if __name__ == "__main__":
    unittest.main()
