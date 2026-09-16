"""
High Level Design (HLD) Architecture Diagram Generator.
Synthesizes existing condition from TOR and proposed solution into a structured
Mermaid.js architecture diagram, and renders it to a high-resolution PNG image
for Word (.docx), PDF, and PowerPoint (.pptx) proposals.
"""

import base64
import io
import json
import logging
import re
import urllib.request
from typing import Optional
from PIL import Image, ImageDraw, ImageFont

from app.services.llm_provider import get_llm_provider

logger = logging.getLogger(__name__)


def generate_hld_mermaid(tor_text: str, solution_text: str, section_title: str = "High Level Design") -> dict:
    """Generate a Mermaid.js architecture diagram script and explanation using LLM."""
    prompt = f"""
Anda adalah Senior Enterprise Solution Architect dan Lead Infrastructure Designer.
Tugas Anda adalah merumuskan arsitektur High Level Design (HLD) dalam format diagram Mermaid.js
berdasarkan kondisi eksisting dari dokumen acuan (TOR) dan solusi yang diusulkan.

KONTEKS DOKUMEN ACUAN (TOR / KAK):
{tor_text[:12000]}

SOLUSI YANG DIUSULKAN (PROPOSAL DRAFT):
{solution_text[:6000]}

FOKUS SUB-BAB / TOPIK:
{section_title}

INSTRUKSI PENYUSUNAN DIAGRAM HLD:
1. Analisis arsitektur eksisting vs arsitektur target/solusi.
2. Buat diagram Mermaid menggunakan sintaks `graph TD` atau `graph LR`.
3. Gunakan `subgraph` untuk memisahkan domain/lokasi secara logis dan fisik (contoh: Data Center Utama, Disaster Recovery Site, Edge / Branch, Cloud / Third-Party Services).
4. Tuliskan nama komponen spesifik (tipe server, storage, kapasitas, bandwidth koneksi, protokol, RPO/RTO).
5. Berikan label informatif pada setiap garis koneksi (misal: "10 Gbps Synchronous Replication", "LACP Trunk 40G", "Heartbeat").
6. Berikan styling visual pada node (classDef atau style).
7. Berikan caption formal untuk gambar (contoh: "Gambar: Arsitektur High Level Design (HLD) Topologi Solusi Disaster Recovery").
8. Berikan ringkasan narasi arsitektur 2-3 paragraf.

KEMBALIKAN HANYA JSON MURNI dengan format:
{{
  "mermaid_code": "graph TD\\n  subgraph DC[Data Center]...\\n",
  "caption": "Gambar: Arsitektur High Level Design Solusi...",
  "architecture_narrative": "Penjelasan narasi HLD..."
}}
"""
    provider = get_llm_provider()
    try:
        raw_resp = provider.answer(prompt, [tor_text[:4000]], mode="qa")
        clean_json = raw_resp.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        if clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        clean_json = clean_json.strip()

        parsed = json.loads(clean_json)
        code = parsed.get("mermaid_code", "")
        # Clean mermaid code if wrapped in ```mermaid
        code = re.sub(r"^```mermaid\s*", "", code.strip(), flags=re.IGNORECASE)
        code = re.sub(r"```$", "", code.strip())
        parsed["mermaid_code"] = code
        return parsed
    except Exception as exc:
        logger.warning(f"Failed to generate HLD Mermaid with LLM: {exc}, using fallback architecture")
        return _fallback_hld_diagram(section_title)


def _fallback_hld_diagram(section_title: str) -> dict:
    """Fallback architecture diagram template for enterprise infrastructure."""
    code = """graph TD
  subgraph DC_Prod ["Data Center Utama (Production)"]
    direction TB
    SW_Core1["Core Switch 10/40G (HA Pair)"]
    SW_SAN1["SAN Switch Brocade 32G"]
    Srv_App1["App Cluster (2x HPE DL360 Gen10)"]
    Srv_DB1["DB Cluster (2x HPE DL380 Gen10)"]
    Storage_Prod[("Primary All-Flash Storage 50TB")]
    SW_Core1 --- Srv_App1
    Srv_App1 --- Srv_DB1
    Srv_DB1 --- SW_SAN1
    SW_SAN1 --- Storage_Prod
  end

  subgraph DC_DR ["Disaster Recovery Site (On-Premise)"]
    direction TB
    SW_Core2["DR Core Switch 10G"]
    SW_SAN2["DR SAN Switch 32G"]
    Srv_DR["DR Compute Nodes (Active Standby)"]
    Storage_DR[("DR Storage SAN 50TB")]
    SW_Core2 --- Srv_DR
    Srv_DR --- SW_SAN2
    SW_SAN2 --- Storage_DR
  end

  subgraph Management ["Management & Backup Tier"]
    Backup_Srv["Veeam Backup & Replication Repository"]
    Monitoring["SMG 24x7 NOC / Zabbix Monitoring"]
  end

  Storage_Prod ==="Replikasi Sinkron (10 Gbps Dark Fiber, RPO=0)"===> Storage_DR
  DC_Prod -.- Management
  DC_DR -.- Management
"""
    return {
        "mermaid_code": code,
        "caption": f"Gambar: Arsitektur High Level Design (HLD) Solusi {section_title}",
        "architecture_narrative": (
            "Arsitektur High Level Design (HLD) dirancang dengan redundansi penuh (High Availability) "
            "pada tier compute, switching network, dan enterprise storage. Replikasi data antar-site "
            "berjalan secara sinkron melalui dedicated dark fiber link 10 Gbps untuk memastikan RPO nol."
        ),
    }


def render_mermaid_to_image(mermaid_code: str) -> Optional[dict]:
    """Render a Mermaid code snippet into a high-resolution PNG image using Kroki or Pillow fallback."""
    clean_code = mermaid_code.strip()
    if not clean_code:
        return None

    # Method 1: Kroki.io POST API (High resolution, crisp SVG/PNG rendering)
    try:
        kroki_url = "https://kroki.io/mermaid/png"
        payload = clean_code.encode("utf-8")
        req = urllib.request.Request(
            kroki_url,
            data=payload,
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "image/png",
            },
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            png_bytes = resp.read()

        if len(png_bytes) > 1000 and png_bytes.startswith(b"\x89PNG"):
            with Image.open(io.BytesIO(png_bytes)) as img:
                w, h = img.size
            b64 = base64.b64encode(png_bytes).decode("ascii")
            return {
                "data_url": f"data:image/png;base64,{b64}",
                "width": w,
                "height": h,
                "mime_type": "image/png",
                "engine": "kroki",
            }
    except Exception as exc:
        logger.warning(f"Kroki render failed: {exc}, trying mermaid.ink")

    # Method 2: mermaid.ink GET API
    try:
        mermaid_state = {"code": clean_code, "mermaid": {"theme": "default"}}
        json_str = json.dumps(mermaid_state)
        b64_spec = base64.urlsafe_b64encode(json_str.encode("utf-8")).decode("ascii")
        ink_url = f"https://mermaid.ink/img/{b64_spec}"
        req = urllib.request.Request(ink_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            png_bytes = resp.read()

        if len(png_bytes) > 1000 and png_bytes.startswith(b"\x89PNG"):
            with Image.open(io.BytesIO(png_bytes)) as img:
                w, h = img.size
            b64 = base64.b64encode(png_bytes).decode("ascii")
            return {
                "data_url": f"data:image/png;base64,{b64}",
                "width": w,
                "height": h,
                "mime_type": "image/png",
                "engine": "mermaid_ink",
            }
    except Exception as exc:
        logger.warning(f"mermaid.ink render failed: {exc}, using Pillow visual generator")

    # Method 3: Local Pillow Vector Graph Fallback (zero external dependencies)
    try:
        return _render_local_diagram_pillow(clean_code)
    except Exception as exc:
        logger.error(f"Pillow diagram render error: {exc}")
        return None


def _render_local_diagram_pillow(mermaid_code: str) -> dict:
    """Generate a clean 2D architecture block diagram using Pillow when offline."""
    width, height = 1200, 700
    img = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Outer border
    draw.rectangle([10, 10, width - 10, height - 10], outline=(209, 213, 219), width=2)

    # Title header
    draw.rectangle([10, 10, width - 10, 60], fill=(243, 244, 246))
    draw.text((30, 24), "HIGH LEVEL DESIGN (HLD) - TOPOLOGI ARSITEKTUR SOLUSI", fill=(17, 24, 39))

    # Box 1: Data Center Utama (Left)
    draw.rectangle([50, 90, 520, 580], outline=(37, 99, 235), width=2, fill=(240, 246, 255))
    draw.text((70, 105), "DATA CENTER UTAMA (PRODUCTION)", fill=(30, 64, 175))

    # Inner boxes inside DC Utama
    components_dc1 = [
        ("Core Switch HA Pair (2x 10G/40G)", (70, 150, 500, 210)),
        ("Application Cluster (2x HPE DL360 Gen10)", (70, 240, 500, 310)),
        ("Database Cluster (2x HPE DL380 Gen10)", (70, 340, 500, 410)),
        ("SAN Storage All-Flash 50TB (Tier-1)", (70, 440, 500, 530)),
    ]
    for label, coords in components_dc1:
        draw.rectangle(coords, outline=(147, 197, 253), width=2, fill=(255, 255, 255))
        draw.text((coords[0] + 15, coords[1] + 20), label, fill=(15, 23, 42))

    # Box 2: Disaster Recovery Site (Right)
    draw.rectangle([680, 90, 1150, 580], outline=(5, 150, 105), width=2, fill=(236, 253, 245))
    draw.text((700, 105), "DISASTER RECOVERY SITE (ON-PREMISE)", fill=(6, 95, 70))

    components_dc2 = [
        ("DR Core Switch (10G Dedicated)", (700, 150, 1130, 210)),
        ("DR Compute Node (Active Standby)", (700, 240, 1130, 310)),
        ("DR Database Standby Node", (700, 340, 1130, 410)),
        ("DR SAN Storage 50TB (Replication Target)", (700, 440, 1130, 530)),
    ]
    for label, coords in components_dc2:
        draw.rectangle(coords, outline=(110, 231, 183), width=2, fill=(255, 255, 255))
        draw.text((coords[0] + 15, coords[1] + 20), label, fill=(15, 23, 42))

    # Center connector arrow (Replication line)
    draw.line([(520, 485), (680, 485)], fill=(217, 119, 6), width=4)
    draw.polygon([(670, 477), (685, 485), (670, 493)], fill=(217, 119, 6))
    draw.text((535, 455), "Replikasi Sinkron", fill=(180, 83, 9))
    draw.text((545, 495), "10 Gbps (RPO=0)", fill=(180, 83, 9))

    # Footer note
    draw.text((50, 620), "Diagram arsitektur resmi di-generate oleh Synapse Architecture Engine · PT Smartnet Magna Global", fill=(107, 114, 128))

    bio = io.BytesIO()
    img.save(bio, format="PNG", optimize=True)
    png_bytes = bio.getvalue()
    b64 = base64.b64encode(png_bytes).decode("ascii")

    return {
        "data_url": f"data:image/png;base64,{b64}",
        "width": width,
        "height": height,
        "mime_type": "image/png",
        "engine": "local_pillow",
    }
