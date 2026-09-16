"""
Proposal Intelligence & Compliance Service
Enterprise capabilities inspired by Responsive (RFPIO), Loopio, and AutoRFP.ai:
1. Red-Flag & Critical Clause Scanner: Detects mandatory clauses, penalties, and strict SLAs.
2. Requirement Coverage & Gap Analysis Checker: Audits draft completeness against original TOR.
3. Win Themes & Strategic Angle Injection: Shapes narrative around winning value propositions.
"""

import logging
import re
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

# Mandatory keywords
MANDATORY_PATTERNS = [
    r"(?i)\b(?:wajib|harus|mutlak|syarat mutlak|shall|must|mandatory|diwajibkan|diharuskan)\b",
]

# Penalty & Risk keywords
PENALTY_PATTERNS = [
    r"(?i)\b(?:denda|penalti|penalty|ganti rugi|wanprestasi|pemutusan kontrak|sanksi|keterlambatan|likuidasi)\b",
]

# SLA & Maintenance keywords
SLA_PATTERNS = [
    r"(?i)\b(?:sla|service level agreement|response time|resolusi|resolution time|mttr|mtbf|24x7|8x5|garansi|on-site|preventive maintenance|corrective maintenance)\b",
]

# Certification & Legal keywords
CERT_PATTERNS = [
    r"(?i)\b(?:iso\s*\d+|sertifikasi|sertifikat|authorized partner|surat dukungan|distributor resmi|principal|tenaga ahli|skkni|ccna|ccnp|cisa|cissp)\b",
]

DEFAULT_WIN_THEMES = [
    "TCO & Biaya Investasi Optimal (ROI Maksimal)",
    "Arsitektur Enterprise Resilien & High Availability (Zero Downtime)",
    "Tim Engineer Lokal Tersertifikasi Resmi & SLA Respon Cepat",
    "Proven Track Record Implementasi pada Sektor Industri Serupa",
]


def scan_critical_clauses(tor_text: str) -> Dict[str, Any]:
    """Scan TOR/RFP text for mandatory requirements, financial penalties, SLAs, and certification requirements."""
    if not tor_text or not tor_text.strip():
        return {
            "risk_level": "Low",
            "total_critical_found": 0,
            "mandatory_requirements": [],
            "penalties_and_risks": [],
            "sla_and_maintenance": [],
            "certifications_and_legal": [],
            "executive_summary_alerts": ["Dokumen acuan kosong atau belum diunggah."],
        }

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", tor_text) if len(p.strip()) > 25]

    mandatory = []
    penalties = []
    slas = []
    certs = []

    for p in paragraphs:
        clean_p = p.replace("\n", " ").strip()
        # Cap paragraph snippet for readability
        snippet = clean_p[:280] + ("..." if len(clean_p) > 280 else "")

        if any(re.search(pat, clean_p) for pat in PENALTY_PATTERNS):
            penalties.append({
                "clause_snippet": snippet,
                "category": "Penalti & Sanksi Finansial",
                "severity": "High",
            })

        if any(re.search(pat, clean_p) for pat in SLA_PATTERNS):
            slas.append({
                "clause_snippet": snippet,
                "category": "SLA & Pemeliharaan",
                "severity": "Medium",
            })

        if any(re.search(pat, clean_p) for pat in MANDATORY_PATTERNS):
            mandatory.append({
                "clause_snippet": snippet,
                "category": "Kebutuhan Mandatori (Gugur Tender)",
                "severity": "High",
            })

        if any(re.search(pat, clean_p) for pat in CERT_PATTERNS):
            certs.append({
                "clause_snippet": snippet,
                "category": "Sertifikasi & Kualifikasi Legal",
                "severity": "Medium",
            })

    total_critical = len(mandatory) + len(penalties) + len(slas) + len(certs)

    # Calculate overall risk score
    if len(penalties) >= 2 or (len(penalties) >= 1 and len(slas) >= 3):
        risk_level = "High"
    elif len(mandatory) >= 3 or len(slas) >= 2 or len(certs) >= 2:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    alerts = []
    if penalties:
        alerts.append(f"Ditemukan {len(penalties)} klausul terkait denda atau sanksi keterlambatan penyerahan.")
    if mandatory:
        alerts.append(f"Terdapat {len(mandatory)} butir klausul dengan kata kunci mandatori ('wajib'/'harus').")
    if slas:
        alerts.append(f"Target SLA & respon pemeliharaan terdeteksi pada {len(slas)} bagian dokumen.")
    if certs:
        alerts.append(f"Persyaratan surat dukungan principal / sertifikasi terdeteksi pada {len(certs)} bagian.")

    if not alerts:
        alerts.append("Tidak terdeteksi klausul penalti berat atau risiko kontraktual ekstrem pada teks.")

    return {
        "risk_level": risk_level,
        "total_critical_found": total_critical,
        "mandatory_requirements": mandatory[:8],
        "penalties_and_risks": penalties[:6],
        "sla_and_maintenance": slas[:8],
        "certifications_and_legal": certs[:6],
        "executive_summary_alerts": alerts,
    }


def audit_requirement_coverage(tor_text: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Audit requirement coverage: checks if core technical and commercial points in TOR are addressed in drafts."""
    if not items:
        return {
            "overall_coverage_pct": 0,
            "total_requirements": 0,
            "covered_count": 0,
            "uncovered_count": 0,
            "covered_items": [],
            "uncovered_items": [],
            "recommendations": ["Belum ada draf bagian yang disusun."],
        }

    # Extract requirement points from TOR or items
    extracted_reqs = []
    tor_paras = [p.strip() for p in re.split(r"\n\s*\n", tor_text or "") if len(p.strip()) > 35]

    for p in tor_paras[:40]:
        first_line = p.split("\n")[0].strip()
        # Look for sentences containing technical keywords or specifications
        if any(k in p.lower() for k in ("spesifikasi", "kapasitas", "server", "storage", "switch", "network", "sla", "garansi", "lisensi", "implementasi", "backup", "disaster")):
            core_text = first_line[:100]
            extracted_reqs.append({
                "requirement": core_text,
                "full_text": p[:200],
            })

    # If TOR didn't yield enough extracted specs, use items requirement_text
    if len(extracted_reqs) < 3:
        for it in items:
            req_text = (it.get("requirement_text") or "").strip()
            if req_text:
                extracted_reqs.append({
                    "requirement": it.get("title", "Kebutuhan") + ": " + req_text[:80],
                    "full_text": req_text,
                })

    # Combine all drafted content
    all_drafts = " ".join((it.get("draft_text") or "") for it in items).lower()

    covered = []
    uncovered = []

    for req in extracted_reqs:
        stopwords = {
            "kebutuhan", "dokumen", "adalah", "dengan", "untuk", "dalam", "secara",
            "sebagai", "dapat", "harus", "wajib", "yang", "memiliki", "ditawarkan",
            "minimal", "perangkat", "pada", "oleh", "serta", "atau", "dari", "ini",
            "itu", "tersebut", "apabila", "terjadi", "maka", "terkait", "selama",
            "ketentuan", "umum", "peserta", "tender", "penyedia", "tidak", "dinyatakan"
        }
        tokens = [t.lower() for t in re.findall(r"[a-zA-Z0-9_-]{3,}", req["full_text"]) if t.lower() not in stopwords]
        if not tokens:
            continue

        match_count = sum(1 for t in tokens if t in all_drafts)
        ratio = match_count / max(1, len(tokens))

        if ratio >= 0.20 or match_count >= 2:
            covered.append({
                "requirement": req["requirement"],
                "matched_tokens_count": match_count,
                "coverage_rate": f"{int(ratio * 100)}%",
            })
        else:
            uncovered.append({
                "requirement": req["requirement"],
                "missing_tokens": tokens[:4],
                "tip": "Pertimbangkan menambahkan poin spesifik ini pada draf solusi teknis atau SLA.",
            })

    total_checked = len(covered) + len(uncovered)
    coverage_pct = round((len(covered) / max(1, total_checked)) * 100) if total_checked > 0 else 0

    recommendations = []
    if coverage_pct >= 85:
        recommendations.append("Draf proposal memiliki tingkat kelengkapan sangat tinggi (>85%) terhadap spesifikasi acuan.")
    elif coverage_pct >= 60:
        recommendations.append("Cakupan draf proposal baik (~60-85%). Tinjau butir kebutuhan di bawah yang belum disebutkan.")
    else:
        recommendations.append("Tingkat cakupan masih di bawah 60%. Lengkapi sub-bab Solusi Teknis dan SLA sebelum finalisasi.")

    if uncovered:
        sample_missing = uncovered[0]["requirement"]
        recommendations.append(f"Prioritas kelengkapan berikutnya: {sample_missing[:70]}...")

    return {
        "overall_coverage_pct": coverage_pct,
        "total_requirements": total_checked,
        "covered_count": len(covered),
        "uncovered_count": len(uncovered),
        "covered_items": covered[:12],
        "uncovered_items": uncovered[:8],
        "recommendations": recommendations,
    }
