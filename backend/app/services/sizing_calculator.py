"""
Presales Infrastructure Sizing & BoQ Calculation Service
On-demand specialized sizing engine for Enterprise Storage (Pure Storage)
and Hyperconverged Infrastructure (Sangfor HCI).
Only triggered when explicitly requested by presales or TOR sizing clauses.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class SizingRequest(BaseModel):
    platform: str = Field("pure_storage", description="pure_storage | sangfor_hci | generic_compute")
    usable_capacity_tb: float = Field(0.0, description="Target usable capacity in Terabytes")
    target_workload: str = Field("general_virtualization", description="database | vdi | general_virtualization | analytics")
    data_reduction_ratio: Optional[float] = Field(None, description="Expected DRR (dedupe + compression). Defaults by workload.")
    growth_buffer_pct: float = Field(20.0, description="Annual growth buffer percentage (default 20%)")
    requirement_text: Optional[str] = Field("", description="Optional raw TOR requirement text to auto-extract parameters")


def _extract_capacity_from_text(text: str) -> float:
    """Attempt to parse capacity number from text if usable_capacity_tb is 0."""
    import re
    if not text:
        return 50.0
    match = re.search(r"(\d+(?:\.\d+)?)\s*(?:tb|terabyte)", text, re.IGNORECASE)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            pass
    return 50.0


def calculate_pure_storage_sizing(req: SizingRequest) -> Dict[str, Any]:
    """
    Pure Storage FlashArray Sizing (Purity //X, //C, //E series).
    Calculates Raw vs Usable vs Effective capacity, DirectFlash module configuration,
    and recommended controller model.
    """
    target_usable = req.usable_capacity_tb if req.usable_capacity_tb > 0 else _extract_capacity_from_text(req.requirement_text or "")
    
    # Workload Data Reduction Factor (DRR)
    drr_map = {
        "database": 3.0,
        "vdi": 4.5,
        "general_virtualization": 2.5,
        "analytics": 1.8
    }
    drr = req.data_reduction_ratio or drr_map.get(req.target_workload, 2.5)
    
    # Growth buffer
    buffer_multiplier = 1.0 + (max(0.0, req.growth_buffer_pct) / 100.0)
    planned_usable_tb = round(target_usable * buffer_multiplier, 1)
    
    # Effective capacity delivered with DRR
    effective_capacity_tb = round(planned_usable_tb * drr, 1)
    
    # RAID-3D & Purity system overhead is ~22%
    system_overhead_multiplier = 1.25
    raw_capacity_needed_tb = round(planned_usable_tb * system_overhead_multiplier, 1)
    
    # Select Controller Model
    if planned_usable_tb <= 50:
        controller_model = "Pure Storage FlashArray //X10 R4"
        chassis = "3RU All-NVMe Chassis"
        fc_ports = "4x 32Gb/s Fibre Channel or 4x 25GbE iSCSI redundant"
        dfm_size = "4.5 TB DirectFlash Modules (DFM)"
        dfm_qty = max(10, int(raw_capacity_needed_tb / 4.5) + 1)
    elif planned_usable_tb <= 150:
        controller_model = "Pure Storage FlashArray //X20 R4"
        chassis = "3RU All-NVMe Chassis with ActiveCluster ready"
        fc_ports = "8x 32Gb/s Fibre Channel or 8x 25GbE iSCSI redundant"
        dfm_size = "9.1 TB DirectFlash Modules (DFM)"
        dfm_qty = max(10, int(raw_capacity_needed_tb / 9.1) + 1)
    elif planned_usable_tb <= 500:
        controller_model = "Pure Storage FlashArray //X50 R4"
        chassis = "3RU Modular Controller + NVMe Expansion Shelves"
        fc_ports = "8x 32Gb/s Fibre Channel + NVMe-oF RoCEv2"
        dfm_size = "18.2 TB DirectFlash Modules (DFM)"
        dfm_qty = max(10, int(raw_capacity_needed_tb / 18.2) + 1)
    else:
        controller_model = "Pure Storage FlashArray //X70 R4 / //E Series"
        chassis = "High-Density Petabyte-Scale Architecture"
        fc_ports = "16x 32Gb/s Fibre Channel / 100GbE RoCEv2"
        dfm_size = "36.4 TB DirectFlash Modules (DFM)"
        dfm_qty = max(14, int(raw_capacity_needed_tb / 36.4) + 1)

    total_raw_provisioned = round(dfm_qty * float(dfm_size.split()[0]), 1)

    # Markdown BoQ Table
    boq_markdown = f"""### Bill of Quantity (BoQ) & Sizing Spesifikasi: {controller_model}

| Komponen | Spesifikasi Teknis | Qty | Keterangan |
| :--- | :--- | :---: | :--- |
| **Storage Controller** | {controller_model} (Dual Controller, High Availability) | 1 Unit | Redundant 24x7 Hot-Swappable |
| **Enclosure / Chassis** | {chassis} | 1 Unit | Redundant Power Supplies & Fans |
| **Storage Media** | {dfm_size} All-Flash NVMe | {dfm_qty} Unit | Total Raw: {total_raw_provisioned} TB |
| **Host Connectivity** | {fc_ports} | 1 Set | Dual Controller Multi-pathing |
| **Kapasitas Usable** | {planned_usable_tb} TB Usable (setelah proteksi RAID-3D) | - | Buffer pertumbuhan {req.growth_buffer_pct}% |
| **Kapasitas Efektif** | {effective_capacity_tb} TB Efektif (Data Reduction {drr}:1) | - | Workload: {req.target_workload.replace('_', ' ').title()} |
| **Operating Environment** | Purity Operating Environment (Always-On Dedupe & Compression) | Include | Lisensi komprehensif tanpa biaya per fitur |
| **Dukungan & Garansi** | Pure Storage Evergreen//Forever Maintenance 24x7 3-Year | 1 Paket | Garansi penggantian hardware & upgrade non-disruptif |
"""

    return {
        "platform": "pure_storage",
        "recommended_model": controller_model,
        "metrics": {
            "target_usable_tb": target_usable,
            "planned_usable_tb": planned_usable_tb,
            "raw_capacity_provisioned_tb": total_raw_provisioned,
            "effective_capacity_tb": effective_capacity_tb,
            "data_reduction_ratio": f"{drr}:1",
            "growth_buffer_pct": req.growth_buffer_pct,
            "dfm_count": dfm_qty,
            "dfm_type": dfm_size
        },
        "boq_markdown": boq_markdown,
        "executive_summary": (
            f"Untuk kebutuhan kapasitas usable {target_usable} TB dengan pertumbuhan {req.growth_buffer_pct}%, "
            f"direkomendasikan {controller_model} dengan {dfm_qty} unit {dfm_size}. "
            f"Berkat teknologi Pure Storage Always-On Data Reduction ({drr}:1), "
            f"total kapasitas efektif yang dapat ditampung mencapai {effective_capacity_tb} TB "
            f"dengan latency sub-millisecond dan zero performance degradation."
        )
    }


def calculate_sangfor_hci_sizing(req: SizingRequest) -> Dict[str, Any]:
    """
    Sangfor Hyperconverged Infrastructure (HCI) aServer sizing.
    Calculates recommended cluster nodes, caching SSD tier, data capacity, and network switches.
    """
    target_usable = req.usable_capacity_tb if req.usable_capacity_tb > 0 else _extract_capacity_from_text(req.requirement_text or "")
    
    # Sangfor HCI minimum 3 nodes for distributed storage quorum (aSAN 2-copy or 3-copy)
    replica_factor = 2  # 2-copy standard
    raw_storage_needed = target_usable * replica_factor * 1.25  # 25% slack space
    
    if target_usable <= 30:
        node_count = 3
        node_model = "Sangfor aServer-2105 2U Appliance"
        cpu_spec = "Dual Intel Xeon Silver 4410Y (24 Cores / 48 Threads per node)"
        ram_spec = "128 GB DDR5 ECC Registered RAM per node"
        ssd_cache = "2x 960GB NVMe SSD (Write Caching Tier)"
        hdd_capacity = "4x 4TB Enterprise SATA/SAS (Data Tier)"
    elif target_usable <= 100:
        node_count = 3
        node_model = "Sangfor aServer-2205 High-Performance Appliance"
        cpu_spec = "Dual Intel Xeon Gold 5418Y (48 Cores / 96 Threads per node)"
        ram_spec = "256 GB DDR5 ECC Registered RAM per node"
        ssd_cache = "2x 1.92TB Enterprise NVMe SSD (Caching Tier)"
        hdd_capacity = "6x 8TB Enterprise SAS (Data Tier)"
    else:
        node_count = max(4, int(target_usable / 40) + 1)
        node_model = "Sangfor aServer-2405 All-Flash Scalable Appliance"
        cpu_spec = "Dual Intel Xeon Gold 6430 (64 Cores / 128 Threads per node)"
        ram_spec = "512 GB DDR5 ECC Registered RAM per node"
        ssd_cache = "2x 3.84TB All-NVMe (Ultra-Fast Caching)"
        hdd_capacity = "8x 7.68TB Enterprise U.2 NVMe SSD (All-Flash Tier)"

    boq_markdown = f"""### Bill of Quantity (BoQ) & Sizing Spesifikasi: Sangfor HCI ({node_count} Nodes Cluster)

| Komponen | Spesifikasi Teknis | Qty | Keterangan |
| :--- | :--- | :---: | :--- |
| **HCI Compute & Storage Node** | {node_model} | {node_count} Unit | High Availability Cluster (N+1 Failover) |
| **Processor per Node** | {cpu_spec} | {node_count * 2} Unit | Total cluster vCPU siap pakai |
| **Memory per Node** | {ram_spec} | {node_count} Set | Virtualization & aSAN memory caching |
| **Caching Layer per Node** | {ssd_cache} | {node_count * 2} Unit | Distributed I/O acceleration |
| **Storage Capacity per Node** | {hdd_capacity} | {node_count} Set | Total cluster usable {target_usable} TB |
| **Interconnect Networking** | 2x 10GbE / 25GbE SFP28 per node for aSAN Private Traffic | {node_count * 2} Port | Dedicated redundant cluster network |
| **HCI Software Stack** | Sangfor aSV (Server Virtualization) + aSAN (Distributed Storage) | {node_count} Node | Enterprise License (No hidden per-VM fee) |
| **Maintenance & SLA** | Sangfor Gold Support 24x7 3-Year On-site | 1 Paket | SLA Response Time 2 Jam |
"""

    return {
        "platform": "sangfor_hci",
        "recommended_model": f"Sangfor HCI {node_count}-Node Cluster ({node_model})",
        "metrics": {
            "target_usable_tb": target_usable,
            "cluster_nodes": node_count,
            "total_cpu_cores": node_count * int(cpu_spec.split("(")[1].split()[0]),
            "redundancy_policy": "aSAN 2-Copy (N+1 Node Resilience)"
        },
        "boq_markdown": boq_markdown,
        "executive_summary": (
            f"Untuk kebutuhan infrastruktur HCI dengan kapasitas usable {target_usable} TB, "
            f"direkomendasikan {node_count} node {node_model}. "
            f"Arsitektur aSAN memberikan High Availability otomatis tanpa single-point-of-failure, "
            f"lengkap dengan dedicated caching tier untuk menjamin IOPs tinggi."
        )
    }


def perform_sizing_calculation(req: SizingRequest) -> Dict[str, Any]:
    """Main routing dispatcher for sizing calculation."""
    if req.platform.lower() in ("pure_storage", "pure", "storage"):
        return calculate_pure_storage_sizing(req)
    elif req.platform.lower() in ("sangfor", "sangfor_hci", "hci"):
        return calculate_sangfor_hci_sizing(req)
    else:
        # Default to pure storage if unspecified
        return calculate_pure_storage_sizing(req)
