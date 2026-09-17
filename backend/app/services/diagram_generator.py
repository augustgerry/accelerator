import base64
import io
import json
import logging
import os
import re
import urllib.request
from typing import Optional
from PIL import Image, ImageDraw, ImageFont

from app.services.llm_provider import get_llm_provider

logger = logging.getLogger(__name__)


def _get_diag_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    """Load system font for crisp diagram typography."""
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def generate_hld_mermaid(
    tor_text: str,
    solution_text: str,
    section_title: str = "High Level Design Topology",
    custom_instruction: str = "",
    diagram_style: str = "topology",
) -> dict:
    """Generate an authentic Presales Network & Infrastructure Topology Mermaid.js diagram and 2D visual graphic."""
    user_directive_block = ""
    if custom_instruction and custom_instruction.strip():
        user_directive_block = f"""
========================================================================
*** INSTRUKSI KHUSUS & MANDATORI DARI PRESALES ENGINEER (PRIORITAS UTAMA): ***
"{custom_instruction.strip()}"

PETUNJUK TEKNIS:
1. Anda WAJIB mengikuti alur koneksi, penamaan perangkat, dan topologi di atas secara persis!
   (Contoh: jika diarahkan dari Core Switch ke Server via dual link, atau Firewall HA ke Core Switch, ikuti persis perangkat dan koneksinya).
2. Terapkan nama port / media koneksi sesuai arahan engineer (misal: 25G RoCE, 100G MLAG, 10G LACP, dsb).
========================================================================
"""

    prompt = f"""
Anda adalah Principal Presales Infrastructure & Enterprise Network Architect.
Tugas Anda: Hasilkan DIAGRAM TOPOLOGI INFRASTRUKTUR & JARINGAN (Presales Physical/Logical HLD Topology)
berdasarkan dokumen kebutuhan (TOR), solusi yang ditawarkan, dan instruksi khusus engineer.

PENTING: DIAGRAM HARUS BERBENTUK TOPOLOGI JARINGAN & INFRASTRUKTUR TEKNIS ASLI, BUKAN FLOWCHART ATAU DIAGRAM PROSES ABSTRAK!

{user_directive_block}

KONTEKS TEKNIS DOKUMEN:
{tor_text[:12000]}

SOLUSI & PERANGKAT YANG DITAWARKAN:
{solution_text[:6000]}

SUB-BAB: {section_title}

PEDOMAN STRUKTUR TOPOLOGI INFRASTRUKTUR TEKNIS (PRESALES HLD):
1. Gunakan orientasi vertikal hierarkis topologi: `graph TD`.
2. Selalu gunakan `%%{{init: {{'theme': 'base', 'themeVariables': {{ 'primaryColor': '#F1F5F9', 'primaryTextColor': '#0F172A', 'primaryBorderColor': '#3B82F6', 'lineColor': '#475569', 'secondaryColor': '#EFF6FF', 'tertiaryColor': '#F8FAFC', 'clusterBkg': '#F8FAFC', 'clusterBorder': '#94A3B8', 'fontFamily': 'Inter, system-ui, sans-serif' }}}}%%` di baris pertama.
3. Struktur wajib memiliki layer-layer topologi berikut (dalam `subgraph`):
   - Layer 1: [WAN & Perimeter Security] -> Dual ISP, Next-Generation Firewall HA (Active/Standby dengan HA Sync Link)
   - Layer 2: [Core & ToR Switching Fabric] -> Dual Core/ToR Switches dengan MLAG / vPC / Stack Interconnect
   - Layer 3: [Server & HCI Compute Cluster] -> Node Server HCI (Node 1, Node 2, Node 3) dengan Dual 10G/25G Bonded Uplink
   - Layer 4: [Storage & Workload Tier] -> Software-Defined Storage (aSAN / Nutanix DSF / SAN Array) & Production VMs (ERP, Database, AD)
   - Layer 5: [Out-of-Band & Backup Tier] -> IPMI/OOB Switch, Backup Appliance (e.g. Veeam), Central Management (e.g. SCP / Prism)
4. Koneksi antar perangkat harus mencantumkan interface / media teknis:
   - Contoh: `===|"2x 10G LACP Bond"|===`, `---| "Sync Heartbeat" |---`, `===|"25G RoCE / SFP28"|===`
5. Berikan classDef warna modern:
   classDef firewall fill:#FEE2E2,stroke:#DC2626,stroke-width:2px,color:#991B1B;
   classDef network fill:#E0E7FF,stroke:#4F46E5,stroke-width:2px,color:#312E81;
   classDef compute fill:#EFF6FF,stroke:#2563EB,stroke-width:2px,color:#1E40AF;
   classDef storage fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#92400E;
   classDef mgmt fill:#F3F4F6,stroke:#4B5563,stroke-width:2px,color:#1F2937;
6. Berikan caption formal: "Gambar: Topologi Jaringan & Arsitektur High Level Design (HLD) Solusi Infrastruktur".
7. Berikan narasi teknis 2-3 paragraf mendetail tentang redundansi link (N+1/2N), throughput, no single point of failure (no SPOF).

KEMBALIKAN HANYA JSON MURNI:
{{
  "mermaid_code": "%%{{init: ...}}%%\\ngraph TD\\n...",
  "caption": "Gambar: Topologi Jaringan & Arsitektur High Level Design...",
  "architecture_narrative": "Topologi solusi infrastruktur dirancang tanpa Single Point of Failure (no SPOF)..."
}}
"""
    provider = get_llm_provider()
    parsed = {}
    try:
        raw_resp = provider.answer(prompt, [tor_text[:4000]], mode="json")
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
        code = re.sub(r"^```mermaid\s*", "", code.strip(), flags=re.IGNORECASE)
        code = re.sub(r"```$", "", code.strip())
        parsed["mermaid_code"] = code
    except Exception as exc:
        logger.warning(f"Failed to generate HLD Mermaid with LLM: {exc}, using authentic topology template")
        parsed = _fallback_hld_diagram(section_title, custom_instruction)

    # Always generate the 2D Datacenter Topology graphic as well
    diag_2d_result = render_2d_datacenter_topology(section_title, custom_instruction, solution_text)
    parsed["diagram_2d_url"] = diag_2d_result.get("data_url")

    return parsed


def _fallback_hld_diagram(section_title: str, custom_instruction: str = "") -> dict:
    """Fallback authentic Presales Network & Infrastructure Topology template."""
    code = """%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#F1F5F9', 'primaryTextColor': '#0F172A', 'primaryBorderColor': '#3B82F6', 'lineColor': '#475569', 'secondaryColor': '#EFF6FF', 'tertiaryColor': '#F8FAFC', 'clusterBkg': '#F8FAFC', 'clusterBorder': '#94A3B8', 'fontFamily': 'Inter, system-ui, sans-serif' }}}%%
graph TD
  subgraph WAN ["🌐 1. WAN & PERIMETER SECURITY"]
    direction TB
    ISP1["ISP 1 (Fiber Leased Line 1 Gbps)"]
    ISP2["ISP 2 (Backup Fiber 500 Mbps)"]
    FW1["NGFW-01 (Active) Sangfor NGAF / FortiGate"]:::firewall
    FW2["NGFW-02 (Standby) Sangfor NGAF / FortiGate"]:::firewall

    ISP1 --- FW1
    ISP2 --- FW2
    FW1 <--->|"Heartbeat & Session Sync (10G Direct)"| FW2
  end

  subgraph CoreSwitching ["⚡ 2. CORE / TOR SWITCHING FABRIC"]
    direction TB
    SW_Core1["ToR Switch 01 (32x 10G/25G + 4x 100G)"]:::network
    SW_Core2["ToR Switch 02 (32x 10G/25G + 4x 100G)"]:::network

    SW_Core1 <===>|"MLAG / vPC Peer-Link (100G DAC)"| SW_Core2
  end

  subgraph HCICluster ["🖥️ 3. HYPERCONVERGED COMPUTE CLUSTER"]
    direction TB
    Node1["Node-01: HCI Compute & Storage (2x Intel Xeon, 512GB RAM)"]:::compute
    Node2["Node-02: HCI Compute & Storage (2x Intel Xeon, 512GB RAM)"]:::compute
    Node3["Node-03: HCI Compute & Storage (2x Intel Xeon, 512GB RAM)"]:::compute
  end

  subgraph StorageAndVMs ["💾 4. DISTRIBUTED STORAGE & WORKLOAD TIER"]
    direction TB
    aSAN[("Distributed All-Flash Storage Fabric (aSAN/vSAN NVMe)")]:::storage
    VM_DB["Critical DB Cluster (Oracle / MS SQL AlwaysOn)"]:::compute
    VM_App["Core Banking / ERP Application Tier"]:::compute
  end

  subgraph ManagementOOB ["🛡️ 5. OOB MANAGEMENT & BACKUP"]
    direction TB
    OOB_SW["OOB Management Switch (1GbE RJ45 IPMI/iDRAC)"]:::mgmt
    Mgmt_SCP["Central Management Platform (Sangfor SCP / Nutanix Prism)"]:::mgmt
    Backup_App["Dedicated Immutable Backup Appliance (Veeam / Sangfor aBkup)"]:::mgmt
  end

  %% Inter-tier Cabling
  FW1 ===|"10G LACP Trunk"| SW_Core1
  FW2 ===|"10G LACP Trunk"| SW_Core2

  SW_Core1 ===|"Dual 25G RoCE SFP28"| Node1
  SW_Core2 ===|"Dual 25G RoCE SFP28"| Node1
  SW_Core1 ===|"Dual 25G RoCE SFP28"| Node2
  SW_Core2 ===|"Dual 25G RoCE SFP28"| Node2
  SW_Core1 ===|"Dual 25G RoCE SFP28"| Node3
  SW_Core2 ===|"Dual 25G RoCE SFP28"| Node3

  Node1 -.-> aSAN
  Node2 -.-> aSAN
  Node3 -.-> aSAN
  aSAN --- VM_DB
  aSAN --- VM_App

  OOB_SW -.->|"IPMI"| Node1 & Node2 & Node3
  Mgmt_SCP -.->|"Cluster Control"| SW_Core1 & Node1
  Backup_App ===|"10G Backup Network"| SW_Core2

  classDef firewall fill:#FEE2E2,stroke:#DC2626,stroke-width:2px,color:#991B1B;
  classDef network fill:#E0E7FF,stroke:#4F46E5,stroke-width:2px,color:#312E81;
  classDef compute fill:#EFF6FF,stroke:#2563EB,stroke-width:2px,color:#1E40AF;
  classDef storage fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#92400E;
  classDef mgmt fill:#F3F4F6,stroke:#4B5563,stroke-width:2px,color:#1F2937;
"""
    return {
        "mermaid_code": code,
        "caption": f"Gambar: Arsitektur High Level Design (HLD) Solusi {section_title}",
        "architecture_narrative": (
            "Topologi solusi infrastruktur dirancang berprinsip High Availability (HA) tanpa Single Point of Failure (no SPOF) "
            "pada seluruh layer: Perimeter Security HA, Dual Core/ToR Switches dengan MLAG Peer-Link, Clustered Compute Nodes dengan "
            "redundansi dual uplink 25G RoCE, serta distributed storage tier yang menjamin kesinambungan operasional bisnis 99.99%."
        ),
    }


def render_2d_datacenter_topology(
    section_title: str = "High Level Design",
    custom_instruction: str = "",
    solution_text: str = "",
) -> dict:
    """Render an ultra-crisp 2D Enterprise Datacenter Rack & Cabling Topology graphic."""
    width, height = 1400, 960
    img = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Technical blueprint background grid
    for x in range(30, width - 30, 24):
        for y in range(80, height - 50, 24):
            draw.point((x, y), fill=(226, 232, 240))

    # Outer border
    draw.rectangle([16, 16, width - 16, height - 16], outline=(203, 213, 225), width=2)

    # 1. Header Block
    draw.rectangle([18, 18, width - 18, 78], fill=(15, 23, 42))
    draw.line([(18, 78), (width - 18, 78)], fill=(37, 99, 235), width=3)
    header_font = _get_diag_font(16, bold=True)
    sub_font = _get_diag_font(10, bold=False)
    tag_font = _get_diag_font(9, bold=True)

    draw.text((36, 28), "HIGH LEVEL DESIGN (HLD) · 2D ENTERPRISE DATACENTER TOPOLOGY", fill=(255, 255, 255), font=header_font)
    draw.text((36, 52), f"Arsitektur Solusi & Topologi Fisik/Logikal: {section_title}", fill=(148, 163, 184), font=sub_font)

    # Top Status Badge
    draw.rounded_rectangle([width - 360, 28, width - 36, 64], radius=4, fill=(30, 41, 59), outline=(16, 185, 129), width=1)
    draw.ellipse([width - 346, 42, width - 336, 52], fill=(16, 185, 129))
    draw.text((width - 328, 40), "REDUNDANT HA FABRIC (NO SPOF) · ACTIVE/ACTIVE", fill=(226, 232, 240), font=tag_font)

    # Helper: Draw a realistic 2D rack chassis
    def draw_rack_chassis(x1, y1, x2, y2, dev_name, role_badge, badge_color, is_1u=False):
        # Drop shadow
        draw.rounded_rectangle([x1 + 2, y1 + 3, x2 + 2, y2 + 4], radius=4, fill=(226, 232, 240))
        # Body
        draw.rounded_rectangle([x1, y1, x2, y2], radius=4, fill=(30, 41, 59), outline=(51, 65, 85), width=2)
        # Specular upper line
        draw.line([(x1 + 4, y1 + 2), (x2 - 4, y1 + 2)], fill=(100, 116, 139), width=1)

        # Rack ears
        ear_w = 12
        draw.rounded_rectangle([x1 - ear_w, y1, x1, y2], radius=2, fill=(71, 85, 105), outline=(100, 116, 139), width=1)
        draw.rounded_rectangle([x2, y1, x2 + ear_w, y2], radius=2, fill=(71, 85, 105), outline=(100, 116, 139), width=1)
        # Screw dots
        draw.ellipse([x1 - ear_w + 3, y1 + 6, x1 - ear_w + 9, y1 + 12], fill=(15, 23, 42))
        draw.ellipse([x2 + 3, y1 + 6, x2 + 9, y1 + 12], fill=(15, 23, 42))

        # Role badge
        bw = 105
        draw.rounded_rectangle([x1 + 10, y1 + 6, x1 + 10 + bw, y2 - 6], radius=3, fill=badge_color)
        draw.text((x1 + 16, y1 + (10 if not is_1u else 8)), role_badge, fill=(255, 255, 255), font=_get_diag_font(8, bold=True))

        # Device Title
        draw.text((x1 + 10 + bw + 12, y1 + (10 if not is_1u else 8)), dev_name, fill=(241, 245, 249), font=_get_diag_font(9, bold=True))

        # LEDs on right side
        for idx, col in enumerate([(34, 197, 94), (59, 130, 246), (245, 158, 11)]):
            lx = x2 - 50 + idx * 14
            draw.ellipse([lx, y1 + (y2 - y1) // 2 - 4, lx + 8, y1 + (y2 - y1) // 2 + 4], fill=col)

    # 2. Layer 1: Perimeter Security & WAN Edge (y: 100 to 220)
    layer1_y1, layer1_y2 = 96, 220
    draw.rounded_rectangle([40, layer1_y1, 980, layer1_y2], radius=6, fill=(254, 242, 242), outline=(252, 165, 165), width=1)
    draw.text((54, layer1_y1 + 8), "LAYER 1: PERIMETER SECURITY & WAN EDGE (NEXT-GEN FIREWALL HA)", fill=(153, 27, 27), font=_get_diag_font(10, bold=True))

    # ISP Callouts
    draw.rounded_rectangle([70, layer1_y1 + 32, 260, layer1_y1 + 58], radius=4, fill=(255, 255, 255), outline=(239, 68, 68), width=1)
    draw.text((82, layer1_y1 + 38), "ISP 1: Primary Fiber 1 Gbps", fill=(185, 28, 28), font=_get_diag_font(9, bold=True))

    draw.rounded_rectangle([290, layer1_y1 + 32, 480, layer1_y1 + 58], radius=4, fill=(255, 255, 255), outline=(239, 68, 68), width=1)
    draw.text((302, layer1_y1 + 38), "ISP 2: Backup Fiber 500 Mbps", fill=(185, 28, 28), font=_get_diag_font(9, bold=True))

    # Firewalls (1U each)
    draw_rack_chassis(70, layer1_y1 + 72, 480, layer1_y1 + 104, "NGFW-01 (Active Master) Sangfor NGAF / FortiGate", "FIREWALL 01", (220, 38, 38), is_1u=True)
    draw_rack_chassis(530, layer1_y1 + 72, 940, layer1_y1 + 104, "NGFW-02 (Standby Hot) Sangfor NGAF / FortiGate", "FIREWALL 02", (185, 28, 28), is_1u=True)

    # HA Heartbeat line between Firewalls
    draw.line([(480, layer1_y1 + 88), (530, layer1_y1 + 88)], fill=(168, 85, 247), width=3)
    draw.rounded_rectangle([470, layer1_y1 + 108, 550, layer1_y1 + 124], radius=3, fill=(243, 232, 255), outline=(192, 132, 252))
    draw.text((476, layer1_y1 + 110), "HA Sync 10G", fill=(107, 33, 168), font=_get_diag_font(7, bold=True))

    # 3. Layer 2: Core & ToR Switching Fabric (y: 240 to 380)
    layer2_y1, layer2_y2 = 236, 375
    draw.rounded_rectangle([40, layer2_y1, 980, layer2_y2], radius=6, fill=(238, 242, 255), outline=(199, 210, 254), width=1)
    draw.text((54, layer2_y1 + 8), "LAYER 2: CORE / TOR SWITCHING FABRIC (MLAG / vPC NON-BLOCKING)", fill=(49, 46, 129), font=_get_diag_font(10, bold=True))

    # ToR Switches (1U each)
    draw_rack_chassis(70, layer2_y1 + 36, 480, layer2_y1 + 70, "ToR Switch 01 (32x 25G SFP28 + 4x 100G QSFP28)", "TOR-01 [MLAG]", (79, 70, 229), is_1u=True)
    draw_rack_chassis(530, layer2_y1 + 36, 940, layer2_y1 + 70, "ToR Switch 02 (32x 25G SFP28 + 4x 100G QSFP28)", "TOR-02 [MLAG]", (79, 70, 229), is_1u=True)

    # 100G MLAG Peer Link line
    draw.line([(480, layer2_y1 + 53), (530, layer2_y1 + 53)], fill=(59, 130, 246), width=4)
    draw.rounded_rectangle([460, layer2_y1 + 76, 560, layer2_y1 + 94], radius=3, fill=(219, 234, 254), outline=(96, 165, 250))
    draw.text((468, layer2_y1 + 78), "100G DAC Peer-Link", fill=(30, 64, 175), font=_get_diag_font(7, bold=True))

    # Trunk from Firewalls to Switches
    draw.line([(275, layer1_y2), (275, layer2_y1 + 36)], fill=(239, 68, 68), width=2)
    draw.line([(735, layer1_y2), (735, layer2_y1 + 36)], fill=(239, 68, 68), width=2)
    draw.text((285, layer2_y1 - 14), "10G LACP Trunk", fill=(185, 28, 28), font=_get_diag_font(8, bold=True))

    # 4. Layer 3: Clustered Compute & HCI Nodes (y: 395 to 665)
    layer3_y1, layer3_y2 = 390, 665
    draw.rounded_rectangle([40, layer3_y1, 980, layer3_y2], radius=6, fill=(239, 246, 255), outline=(191, 219, 254), width=1)
    draw.text((54, layer3_y1 + 8), "LAYER 3: CLUSTERED COMPUTE & HYPERCONVERGED NODES (N+1 HIGH AVAILABILITY)", fill=(30, 64, 175), font=_get_diag_font(10, bold=True))

    # HCI Nodes (2U each)
    nodes = [
        ("Node-01: HCI Compute & Storage (2x Intel Xeon Gold, 512GB RAM, 8x NVMe)", "HCI NODE 01", 432),
        ("Node-02: HCI Compute & Storage (2x Intel Xeon Gold, 512GB RAM, 8x NVMe)", "HCI NODE 02", 508),
        ("Node-03: HCI Compute & Storage (2x Intel Xeon Gold, 512GB RAM, 8x NVMe)", "HCI NODE 03", 584),
    ]
    for name, tag, ny in nodes:
        draw_rack_chassis(70, ny, 940, ny + 48, name, tag, (37, 99, 235), is_1u=False)

        # Dual uplinks from each node to ToR-01 & ToR-02
        draw.line([(55, ny + 24), (30, ny + 24), (30, layer2_y2 - 20), (70, layer2_y2 - 20)], fill=(16, 185, 129), width=2)
        draw.line([(955, ny + 24), (975, ny + 24), (975, layer2_y2 - 20), (940, layer2_y2 - 20)], fill=(16, 185, 129), width=2)

    draw.text((55, layer3_y2 - 22), "⚡ Dual Bonded 25G RoCE (RDMA over Converged Ethernet) Uplink per Node (Active/Active)", fill=(5, 150, 105), font=_get_diag_font(8, bold=True))

    # 5. Layer 4: Storage Fabric & Enterprise Workloads (y: 680 to 890)
    layer4_y1, layer4_y2 = 680, 895
    draw.rounded_rectangle([40, layer4_y1, 980, layer4_y2], radius=6, fill=(254, 243, 199, 120), outline=(252, 211, 77), width=1)
    draw.text((54, layer4_y1 + 8), "LAYER 4: DISTRIBUTED STORAGE & MISSION-CRITICAL WORKLOAD SERVICES", fill=(180, 83, 9), font=_get_diag_font(10, bold=True))

    # aSAN / Storage Fabric
    draw.rounded_rectangle([70, layer4_y1 + 34, 380, layer4_y1 + 104], radius=5, fill=(255, 255, 255), outline=(217, 119, 6), width=2)
    draw.text((86, layer4_y1 + 44), "💾 Distributed All-Flash Fabric", fill=(180, 83, 9), font=_get_diag_font(10, bold=True))
    draw.text((86, layer4_y1 + 62), "Sangfor aSAN / Nutanix DSF NVMe Tier", fill=(100, 116, 139), font=_get_diag_font(8))
    draw.text((86, layer4_y1 + 78), "IOPS: 120,000+ | Latensi < 0.5ms | 2-Copy", fill=(5, 150, 105), font=_get_diag_font(8, bold=True))

    # Workload VMs
    workloads = [
        ("🗄️ Critical Database Cluster", "Oracle RAC / MS SQL AlwaysOn", 405),
        ("🏢 Enterprise ERP & Core Apps", "Production Application Tier", 685),
    ]
    for wtitle, wsub, wx in workloads:
        draw.rounded_rectangle([wx, layer4_y1 + 34, wx + 260, layer4_y1 + 104], radius=5, fill=(255, 255, 255), outline=(59, 130, 246), width=2)
        draw.text((wx + 14, layer4_y1 + 44), wtitle, fill=(30, 58, 138), font=_get_diag_font(9, bold=True))
        draw.text((wx + 14, layer4_y1 + 64), wsub, fill=(100, 116, 139), font=_get_diag_font(8))
        draw.text((wx + 14, layer4_y1 + 80), "High Availability & VM Live Migration", fill=(59, 130, 246), font=_get_diag_font(8, bold=True))

    # 6. Right Column: Out-of-Band Management & Backup Tier (x: 1010 to 1360)
    col_x1, col_x2 = 1005, 1360
    draw.rounded_rectangle([col_x1, layer1_y1, col_x2, layer4_y2], radius=6, fill=(248, 250, 252), outline=(203, 213, 225), width=1)
    draw.text((col_x1 + 16, layer1_y1 + 10), "🛡️ OOB MANAGEMENT & BACKUP", fill=(30, 41, 59), font=_get_diag_font(10, bold=True))

    # OOB Switch
    draw_rack_chassis(col_x1 + 20, layer1_y1 + 45, col_x2 - 20, layer1_y1 + 85, "1GbE OOB Mgmt Switch (IPMI / iLO)", "OOB SW", (71, 85, 105), is_1u=True)

    # Management Platform
    draw.rounded_rectangle([col_x1 + 20, layer1_y1 + 110, col_x2 - 20, layer1_y1 + 230], radius=5, fill=(255, 255, 255), outline=(59, 130, 246), width=1)
    draw.text((col_x1 + 32, layer1_y1 + 125), "🖥️ Central Management Platform", fill=(30, 64, 175), font=_get_diag_font(9, bold=True))
    draw.text((col_x1 + 32, layer1_y1 + 146), "• Sangfor SCP / Nutanix Prism Central", fill=(71, 85, 105), font=_get_diag_font(8))
    draw.text((col_x1 + 32, layer1_y1 + 166), "• Single Pane of Glass Operations", fill=(71, 85, 105), font=_get_diag_font(8))
    draw.text((col_x1 + 32, layer1_y1 + 186), "• Automated Health & Alert Telemetry", fill=(71, 85, 105), font=_get_diag_font(8))
    draw.text((col_x1 + 32, layer1_y1 + 206), "• Zero-Downtime Firmware Upgrade", fill=(5, 150, 105), font=_get_diag_font(8, bold=True))

    # Backup & DR Appliance
    draw_rack_chassis(col_x1 + 20, layer1_y1 + 260, col_x2 - 20, layer1_y1 + 305, "Dedicated Backup Repository Appliance", "BACKUP", (5, 150, 105), is_1u=True)
    draw.rounded_rectangle([col_x1 + 20, layer1_y1 + 320, col_x2 - 20, layer1_y1 + 430], radius=5, fill=(255, 255, 255), outline=(16, 185, 129), width=1)
    draw.text((col_x1 + 32, layer1_y1 + 335), "📦 Immutable Backup & Data Protection", fill=(6, 95, 70), font=_get_diag_font(9, bold=True))
    draw.text((col_x1 + 32, layer1_y1 + 356), "• Daily Incremental Backup & RPO < 15m", fill=(71, 85, 105), font=_get_diag_font(8))
    draw.text((col_x1 + 32, layer1_y1 + 376), "• Ransomware-Proof WORM Storage", fill=(71, 85, 105), font=_get_diag_font(8))
    draw.text((col_x1 + 32, layer1_y1 + 396), "• Instant VM Recovery (RTO < 5 min)", fill=(5, 150, 105), font=_get_diag_font(8, bold=True))

    # SLA & Architecture Specs Card
    draw.rounded_rectangle([col_x1 + 20, layer1_y1 + 455, col_x2 - 20, layer4_y2 - 20], radius=5, fill=(241, 245, 249), outline=(203, 213, 225), width=1)
    draw.text((col_x1 + 32, layer1_y1 + 470), "📊 Ringkasan Parameter Teknis:", fill=(15, 23, 42), font=_get_diag_font(9, bold=True))
    specs = [
        ("Arsitektur", "Hyperconverged (HCI) + ToR"),
        ("Tingkat HA", "N+1 Compute / 2N Switch"),
        ("SPOF", "Nol (Zero Single Point of Failure)"),
        ("Uplink Bandwidth", "100 Gbps Fabric Core"),
        ("Compute Interconnect", "Dual 25G RoCE per Node"),
        ("Storage Redundansi", "2-Way Distributed Replica"),
        ("SLA Ketersediaan", "99.99% Availability"),
    ]
    for idx, (k, v) in enumerate(specs):
        sy = layer1_y1 + 494 + idx * 24
        draw.text((col_x1 + 32, sy), f"• {k}:", fill=(100, 116, 139), font=_get_diag_font(8))
        draw.text((col_x1 + 175, sy), v, fill=(15, 23, 42), font=_get_diag_font(8, bold=True))

    # 7. Cabling Legend & Footer
    legend_y = height - 42
    draw.text((40, legend_y), "KETERANGAN KABEL / INTERFACE:", fill=(100, 116, 139), font=_get_diag_font(8, bold=True))

    legend_items = [
        ("WAN / Internet (Fiber 1G)", (239, 68, 68), 240),
        ("HA Heartbeat (10G Direct)", (168, 85, 247), 430),
        ("MLAG Peer-Link (100G DAC)", (59, 130, 246), 620),
        ("RoCE Uplink (Dual 25G)", (16, 185, 129), 820),
        ("OOB Management (1GbE RJ45)", (100, 116, 139), 1020),
    ]
    for ltext, lcol, lx in legend_items:
        draw.line([(lx, legend_y + 6), (lx + 20, legend_y + 6)], fill=lcol, width=3)
        draw.text((lx + 26, legend_y), ltext, fill=(71, 85, 105), font=_get_diag_font(8))

    bio = io.BytesIO()
    img.save(bio, format="PNG", optimize=True)
    png_bytes = bio.getvalue()
    b64 = base64.b64encode(png_bytes).decode("ascii")
    data_url = f"data:image/png;base64,{b64}"

    return {
        "data_url": data_url,
        "width": width,
        "height": height,
        "mime_type": "image/png",
        "engine": "synapse_2d_datacenter_visual",
    }


def render_schematic_vector_visual(
    title: str = "High Level Design Topology",
    custom_instruction: str = "",
) -> dict:
    """Generate an authentic vector-style logical/schematic topology diagram (distinct from 2D rack elevation)."""
    width, height = 1100, 720
    img = Image.new("RGB", (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)

    # Technical grid
    for x in range(20, width - 20, 20):
        for y in range(60, height - 30, 20):
            draw.point((x, y), fill=(226, 232, 240))

    # Header Bar
    draw.rectangle([0, 0, width, 52], fill=(15, 23, 42))
    draw.text((24, 16), f"TOPOLOGI ARSITEKTUR SKEMATIK (HLD) · {title.upper()}", fill=(255, 255, 255), font=_get_diag_font(13, bold=True))
    draw.text((width - 240, 18), "HIGH AVAILABILITY LOGICAL FABRIC", fill=(148, 163, 184), font=_get_diag_font(9, bold=True))

    # Helper for vector node boxes
    def draw_node(x, y, w, h, label, sublabel, fill_col, stroke_col, text_col):
        draw.rounded_rectangle([x + 2, y + 3, x + w + 2, y + h + 3], radius=6, fill=(226, 232, 240))
        draw.rounded_rectangle([x, y, x + w, y + h], radius=6, fill=fill_col, outline=stroke_col, width=2)
        draw.text((x + 14, y + 10), label, fill=text_col, font=_get_diag_font(10, bold=True))
        draw.text((x + 14, y + 26), sublabel, fill=(100, 116, 139), font=_get_diag_font(8))

    # Tier 1: Dual ISP / WAN
    draw_node(240, 80, 260, 48, "ISP 1: Leased Line (1 Gbps)", "Primary Internet Fiber Link", (255, 255, 255), (239, 68, 68), (185, 28, 28))
    draw_node(600, 80, 260, 48, "ISP 2: Backup Fiber (500 Mbps)", "Secondary Redundant Link", (255, 255, 255), (239, 68, 68), (185, 28, 28))

    # Tier 2: Next-Gen Firewalls (Active/Passive HA)
    draw_node(240, 180, 260, 52, "NGFW-01: Fortinet FortiGate 100F", "Perimeter Security (Active Master)", (254, 242, 242), (220, 38, 38), (153, 27, 27))
    draw_node(600, 180, 260, 52, "NGFW-02: Fortinet FortiGate 100F", "Perimeter Security (Standby Hot)", (254, 242, 242), (220, 38, 38), (153, 27, 27))

    # HA Heartbeat link
    draw.line([(500, 206), (600, 206)], fill=(168, 85, 247), width=3)
    draw.rounded_rectangle([520, 196, 580, 216], radius=3, fill=(243, 232, 255), outline=(192, 132, 252))
    draw.text((526, 200), "HA Sync", fill=(107, 33, 168), font=_get_diag_font(7, bold=True))

    # WAN to FW lines
    draw.line([(370, 128), (370, 180)], fill=(239, 68, 68), width=2)
    draw.line([(730, 128), (730, 180)], fill=(239, 68, 68), width=2)

    # Tier 3: Core / ToR Switches with MLAG
    draw_node(220, 290, 280, 54, "SW-CORE-01: 32x 25G + 4x 100G", "Spine/Leaf ToR Fabric [MLAG]", (238, 242, 255), (79, 70, 229), (49, 46, 129))
    draw_node(600, 290, 280, 54, "SW-CORE-02: 32x 25G + 4x 100G", "Spine/Leaf ToR Fabric [MLAG]", (238, 242, 255), (79, 70, 229), (49, 46, 129))

    # MLAG Peer Link
    draw.line([(500, 317), (600, 317)], fill=(59, 130, 246), width=4)
    draw.rounded_rectangle([515, 307, 585, 327], radius=3, fill=(239, 246, 255), outline=(147, 197, 253))
    draw.text((520, 311), "100G MLAG", fill=(30, 64, 175), font=_get_diag_font(7, bold=True))

    # FW to Core lines (Crossed redundant trunks)
    draw.line([(370, 232), (360, 290)], fill=(79, 70, 229), width=2)
    draw.line([(370, 232), (680, 290)], fill=(147, 197, 253), width=1)
    draw.line([(730, 232), (420, 290)], fill=(147, 197, 253), width=1)
    draw.line([(730, 232), (740, 290)], fill=(79, 70, 229), width=2)

    # Tier 4: Clustered Enterprise Compute Nodes
    nodes = [
        ("NODE-01: Compute & Storage", "2x Xeon Gold, 512GB, NVMe", 100),
        ("NODE-02: Compute & Storage", "2x Xeon Gold, 512GB, NVMe", 440),
        ("NODE-03: Compute & Storage", "2x Xeon Gold, 512GB, NVMe", 780),
    ]
    for nlabel, nsub, nx in nodes:
        draw_node(nx, 410, 220, 52, nlabel, nsub, (240, 253, 244), (22, 163, 74), (20, 83, 45))
        # Dual 25G uplinks from each node to SW-01 and SW-02
        draw.line([(nx + 70, 410), (360, 344)], fill=(16, 185, 129), width=2)
        draw.line([(nx + 150, 410), (740, 344)], fill=(16, 185, 129), width=2)

    # Tier 5: Shared / Distributed Storage Tier
    draw_node(180, 520, 340, 56, "Distributed All-Flash NVMe Fabric", "Software-Defined Storage Tier (aSAN / vSAN)", (254, 243, 199), (217, 119, 6), (120, 53, 15))
    draw_node(580, 520, 340, 56, "Out-of-Band & Backup Appliance Tier", "Dedicated Immutable Backup & IPMI Mgt", (243, 244, 246), (107, 114, 128), (31, 41, 55))

    for nx in [210, 550, 890]:
        draw.line([(nx, 462), (350, 520)], fill=(217, 119, 6), width=2)
        draw.line([(nx, 462), (750, 520)], fill=(107, 114, 128), width=1)

    # Legend / Key
    draw.rounded_rectangle([40, 640, width - 40, 695], radius=5, fill=(255, 255, 255), outline=(203, 213, 225), width=1)
    draw.text((54, 656), "KETERANGAN KONEKSI:", fill=(71, 85, 105), font=_get_diag_font(8, bold=True))
    legend_entries = [
        ("WAN / ISP Fiber (Redundant)", (239, 68, 68), 210),
        ("HA Heartbeat Link", (168, 85, 247), 410),
        ("100G MLAG Fabric Peer-Link", (59, 130, 246), 570),
        ("Dual 25G SFP28 Bonded Uplink", (16, 185, 129), 770),
    ]
    for label, col, lx in legend_entries:
        draw.line([(lx, 662), (lx + 20, 662)], fill=col, width=3)
        draw.text((lx + 26, 656), label, fill=(51, 65, 85), font=_get_diag_font(8))

    bio = io.BytesIO()
    img.save(bio, format="PNG", optimize=True)
    png_bytes = bio.getvalue()
    b64 = base64.b64encode(png_bytes).decode("ascii")
    return {
        "data_url": f"data:image/png;base64,{b64}",
        "width": width,
        "height": height,
        "mime_type": "image/png",
        "engine": "synapse_schematic_vector",
    }


def render_mermaid_to_image(mermaid_code: str, style: str = "topology") -> Optional[dict]:
    """Render a Mermaid code snippet into a high-resolution PNG image using Kroki, pako mermaid.ink, or vector schematic generator fallback."""
    clean_code = mermaid_code.strip()
    if not clean_code:
        return None

    # Method 1: Kroki.io POST API
    try:
        with httpx.Client(timeout=10, headers={"User-Agent": "Mozilla/5.0", "Accept": "image/png"}) as client:
            resp = client.post("https://kroki.io/mermaid/png", content=clean_code.encode("utf-8"), headers={"Content-Type": "text/plain; charset=utf-8"})
            if resp.status_code == 200 and resp.content.startswith(b"\x89PNG"):
                with Image.open(io.BytesIO(resp.content)) as img:
                    w, h = img.size
                b64 = base64.b64encode(resp.content).decode("ascii")
                return {
                    "data_url": f"data:image/png;base64,{b64}",
                    "width": w,
                    "height": h,
                    "mime_type": "image/png",
                    "engine": "kroki",
                }
    except Exception as exc:
        logger.warning(f"Kroki render failed: {exc}, trying pako mermaid.ink")

    # Method 2: mermaid.ink GET API with pako deflate
    try:
        import zlib
        # Pako deflate standard for mermaid.ink
        deflated = zlib.compress(clean_code.encode("utf-8"), 9)
        pako_b64 = base64.urlsafe_b64encode(deflated).decode("ascii")
        ink_url = f"https://mermaid.ink/img/pako:{pako_b64}"
        with httpx.Client(timeout=8, headers={"User-Agent": "Mozilla/5.0"}) as client:
            resp = client.get(ink_url)
            if resp.status_code == 200 and resp.content.startswith(b"\x89PNG"):
                with Image.open(io.BytesIO(resp.content)) as img:
                    w, h = img.size
                b64 = base64.b64encode(resp.content).decode("ascii")
                return {
                    "data_url": f"data:image/png;base64,{b64}",
                    "width": w,
                    "height": h,
                    "mime_type": "image/png",
                    "engine": "mermaid_ink",
                }
    except Exception as exc:
        logger.warning(f"mermaid.ink render failed: {exc}, using vector schematic fallback")

    # Method 3: High-fidelity Vector Schematic Topology Generator (100% offline, distinct from 2D rack)
    try:
        return render_schematic_vector_visual("High Level Design Topology", "")
    except Exception as exc:
        logger.error(f"Schematic vector topology render error: {exc}")
        return None

