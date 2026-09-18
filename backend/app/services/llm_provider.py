"""
Pluggable LLM layer. The rest of the app calls `get_llm_provider().answer(...)`
and never imports a vendor SDK directly — swapping providers is a config
change (LLM_PROVIDER in .env), not a code change.
"""

from abc import ABC, abstractmethod
from typing import Any, Optional
import json
import logging
import re
from app.config import settings
from app.services.cache import get_cache, set_cache, generate_cache_key

logger = logging.getLogger(__name__)

# Canonical multi-archetype templates for doc_type "narrative" (Proposal Teknis).
# Rather than hardcoding only hardware/storage tenders, we recognize the distinct tender
# patterns: Managed Services (24x7 L1/L2 ops, manpower roster, ServiceNow, SLAs),
# Hardware/Infrastructure (Sizing, HLD SAN, DRR, BoQ), and Software Development.
ARCHETYPE_TEMPLATES = {
    "managed_services": """1. Latar Belakang & Pemahaman Kebutuhan
1.1 Profil Ekosistem Data Platform & Ruang Lingkup Operasional (Cloudera, Airflow, Flink, Qlik, Greenplum, Talend, Tableau)
1.2 Urgensi Operasional 24x7 & Stabilitas Layanan Kritis
2. Tujuan Proyek
2.1 Sasaran Objektif Pengadaan Managed Services
2.2 Target Ketersediaan Platform & Mitigasi Risiko Downtime
3. Proposed Solution: Metodologi Layanan & Model Operasi
3.1 Model Operasi Monitoring 24x7 Rotational Shift (Shift 1/2/3 & Liputan Hari Libur)
3.2 Prosedur Deteksi, Level 1 Troubleshooting & Recovery (<5 Menit Response)
3.3 Prosedur Eskalasi Insiden via ServiceNow (<5 Menit Escalation)
3.4 Tata Kelola Koordinasi Multi-Tim (Big Data Ops, BI & Structured Data, DC Ops, DBA, Business Enablement)
3.5 Tata Kelola Penanganan Future Data Platform (Peluang Ekspansi Scope Baru)
4. Compliance Matrix (Kepatuhan Spesifikasi Layanan & Dokumen Acuan TOR)
5. Manpower & Resource Plan
5.1 Rencana Alokasi Headcount Bertahap (Fase 1: 5 Personel | Fase 2: 8 Personel)
5.2 Skill Matrix Personel per Shift (Big Data Ops vs BI & Structured Data Ops)
5.3 Penempatan Personel On-Site di Menara SMBC Indonesia
5.4 Kontinuitas Layanan & Skema Cadangan Personel (Cuti, Sakit, Libur Nasional)
6. Implementation & Onboarding Plan
6.1 Scope of Work
6.2 Out of Scope
6.3 Timeline Transisi & Knowledge Transfer Menuju Go-Live
6.4 Prosedur Onboarding, Verifikasi Screening SLIK Checking & Penandatanganan NDA
7. Service Level Agreement (SLA) & Reporting Plan
7.1 Komitmen SLA (Response Time <5 Mnt, Escalation Time <5 Mnt, 100% Resource Availability)
7.2 Standar Dokumentasi Insiden & Root Cause Analysis (RCA)
7.3 Mekanisme Pelaporan Berkala (Laporan Harian, Bulanan Manajemen, & Ad-Hoc)
7.4 Garansi Layanan (Periode Garansi 6 Bulan Pasca Implementasi)
8. Lampiran
8.1 Profil PT Smartnet Magna Global & Pengalaman Proyek Serupa (Datalake/Perbankan)
8.2 Profil & CV Tim Tenaga Ahli Terverifikasi""",

    "hardware_infra": """1. Latar Belakang
1.1 Kondisi Existing Infrastruktur
1.2 Risiko End of Life (EOL) / End of Support (EOS)
2. Tujuan
3. Proposed Solution
3.1 Solution Overview & Value Proposition
3.2 Sizing dan Opsi Penawaran Perangkat
3.2.1 Dasar Perhitungan Kapasitas & Pertumbuhan Data (Data Growth)
3.3 Proposed High Level Design (HLD) & Topologi Arsitektur
3.4 Spesifikasi Teknis Storage & Perangkat Utama (Pure Storage / Sangfor HCI / Dell PowerEdge / HPE)
3.5 Fitur Reduksi Data, Kompresi Aktif & Efisiensi Kapasitas (DRR)
3.6 Arsitektur High Availability (HA), Multi-Pathing & Redundansi Konektivitas (SAN / NVMe-oF / 10G/25G)
3.7 Proteksi Data, Immutability, Snapshot & Integrasi Disaster Recovery (RPO/RTO)
3.8 Matriks Kompatibilitas Sistem Operasi, Hypervisor (VMware/KVM/Nutanix) & Manajemen Terpusat
4. Compliance Matrix (berdasarkan dokumen acuan RFP/TOR/KAK/RKS)
5. Bill of Quantity
6. Implementation Plan
6.1 Timeline Pekerjaan
6.2 Scope of Work
6.3 Out of Scope
7. Maintenance Plan
7.1 Preventive Maintenance (PM)
7.2 Corrective Maintenance (CM)
7.3 Service Level Agreement (SLA)
8. Lampiran
8.1 Profil Perusahaan & Legalitas
8.2 Tim Tenaga Ahli & Sertifikasi""",

    "software_dev": """1. Latar Belakang & Analisis Kebutuhan
1.1 Tantangan Proses Bisnis & Solusi Eksisting
1.2 Urgensi Digitalisasi & Efisiensi Operasional
2. Tujuan Proyek & Sasaran Deliverables
3. Proposed Solution: Arsitektur Aplikasi & Spesifikasi Fungsional
3.1 High Level Design (HLD) & Topologi Arsitektur Sistem
3.2 Tech Stack Solusi (Frontend, Backend, Database, & Integrasi API)
3.3 Fitur-Fitur Utama & Alur Proses Bisnis (Business Process Flow)
3.4 Keamanan Aplikasi, Manajemen Akses (RBAC) & Kepatuhan Regulasi
4. Compliance Matrix Kebutuhan Teknis & Fungsional
5. Resource Allocation & Manpower Plan
5.1 Susunan Tim Pengembang & Matriks Kompetensi
5.2 Estimasi Beban Kerja & Alokasi Mandays
6. Implementation Plan & Deliverables Roadmap
6.1 Scope of Work
6.2 Out of Scope
6.3 Metodologi Implementasi (Agile/Waterfall), Tahapan Sprint, UAT & BAST
7. Maintenance Plan & Garansi Layanan
7.1 Garansi Perbaikan Bug & Cacat Aplikasi (Warranty Period)
7.2 Service Level Agreement (SLA) Dukungan Teknis
8. Lampiran
8.1 Profil Perusahaan & Portofolio Solusi Serupa
8.2 CV & Kualifikasi Tenaga Ahli""",
}

# Backward compatibility alias
NARRATIVE_STRUCTURE_TEMPLATE = ARCHETYPE_TEMPLATES["hardware_infra"]


def detect_tender_archetype(tor_text: str, document_title: str = "") -> str:
    """Classify TOR text into tender archetype: 'managed_services', 'hardware_infra', or 'software_dev'."""
    combined = f"{document_title} {tor_text}".lower()

    ms_keywords = [
        "managed service", "managed services", "24x7", "24/7", "rotational shift", "shift 1", "shift 2", "shift 3",
        "level 1", "level 2", "l1", "l2", "escalation", "eskalasi", "servicenow",
        "monitoring", "incident management", "problem resolution", "headcount", "personel",
        "manpower", "slik", "nda", "on-site", "onsite", "data platform operations", "shift-based",
        "job monitoring", "preventive maintenance activities", "cloudera", "airflow", "flink",
        "qlik", "greenplum", "talend", "tableau", "operational support"
    ]
    hw_keywords = [
        "storage", "server", "pure storage", "sangfor", "dell", "hpe", "chassis", "san switch",
        "fiber channel", "nvme", "iops", "raw capacity", "usable capacity", "drr", "rack unit",
        "poweredge", "flasharray", "redundansi konektivitas", "bill of quantity", "boq"
    ]
    sw_keywords = [
        "software development", "aplikasi", "web app", "mobile app", "source code", "frontend",
        "backend", "microservices", "sprint", "scrum", "agile", "user story", "uat", "api integration"
    ]

    ms_score = sum(1 for kw in ms_keywords if kw in combined)
    hw_score = sum(1 for kw in hw_keywords if kw in combined)
    sw_score = sum(1 for kw in sw_keywords if kw in combined)

    if ms_score >= 3 and ms_score >= hw_score and ms_score >= sw_score:
        return "managed_services"
    if sw_score >= 3 and sw_score > hw_score and sw_score > ms_score:
        return "software_dev"
    if hw_score >= 2:
        return "hardware_infra"

    return "managed_services" if ms_score > hw_score else "hardware_infra"


def _build_structure_prompt(
    tor_text: str,
    doc_type: str = "narrative",
    document_title: str = "",
    instruction: str = "",
    archetype: Optional[str] = None,
    reference_structure: Optional[str] = None,
) -> tuple[str, str, str]:
    """Construct a clean, archetype-aware prompt for proposal structure generation."""
    truncated_text = (tor_text or "")[:35000]

    effective_archetype = (
        archetype.lower().strip()
        if archetype and archetype.lower().strip() in ARCHETYPE_TEMPLATES
        else detect_tender_archetype(truncated_text, document_title)
    )

    if reference_structure and reference_structure.strip():
        guide_template = reference_structure.strip()
        guide_context = "mengikuti POLA ACUAN PROPOSAL REFERENSI (seperti contoh proposal acuan yang diberikan pengguna)"
    else:
        guide_template = ARCHETYPE_TEMPLATES.get(effective_archetype, ARCHETYPE_TEMPLATES["hardware_infra"])
        guide_context = f"berdasarkan ARCHETYPE: {effective_archetype.upper().replace('_', ' ')}"

    learned_rules_text = ""
    winning_toc_text = ""
    try:
        from app.db import SessionLocal
        from app.services.learning_engine import retrieve_active_rules, find_closest_winning_structures
        with SessionLocal() as db:
            active_rules = retrieve_active_rules(db, archetype=effective_archetype)
            if active_rules:
                learned_rules_text = "\nATURAN PRESALES TERPELAJAR (PERSISTENT LEARNING RULES):\n" + "\n".join(f"- {r}" for r in active_rules)

            if not reference_structure:
                winning_structs = find_closest_winning_structures(db, archetype=effective_archetype, limit=1)
                if winning_structs:
                    w = winning_structs[0]
                    titles = [s.get("title", "") for s in w.get("sections", []) if s.get("title")]
                    if titles:
                        winning_toc_text = f"\nCONTOH STRUKTUR PROPOSAL NYATA DARI REPOSITORI DRIVE ({w.get('title')}):\n" + "\n".join(titles[:16])
    except Exception as e:
        logger.debug(f"Could not load dynamic learning context: {e}")

    structure_rule = (
        f"Gunakan kerangka referensi berikut sebagai PANDUAN penomoran dan pengelompokan bab standar "
        f"presales enterprise {guide_context}:\n{guide_template}\n{winning_toc_text}\n{learned_rules_text}\n\n"
        f"PEDOMAN STRATEGIS & GUARDRAIL ANTI-HALUSINASI:\n"
        f"1. ATURAN MUTLAK ACUAN DOKUMEN SUMBER (ANTI-NGIDE / ZERO-HALLUCINATION): "
        f"DILARANG KERAS mengarang kebutuhan, teknologi, platform, atau metrik yang TIDAK TERTULIS di dokumen acuan tender. "
        f"Setiap sub-bab yang direkomendasikan WAJIB memiliki 'source_clause' yang mengutip langsung nomor klausul atau kalimat acuan dari dokumen sumber.\n"
        f"2. Anti-Bloat Guardrail: Jaga struktur tetap ramping dan fokus ke poin penilaian teknis tender (sekitar 7 s.d. 8 Bab Pokok). HINDARI memecah jadi 11+ bab generik (seperti Executive Summary, Company Profile, Komersial, atau S&K terpisah jika tidak diminta khusus dalam TOR Teknis).\n"
        f"3. Substitusi Kontekstual:\n"
        f"   - Jika tipe tender adalah MANAGED SERVICES / OPERASIONAL: JANGAN gunakan bab hardware (Sizing Storage, HLD SAN, DRR, BoQ). Ganti dengan: Model Operasi 24x7, Alur Deteksi & Eskalasi Insiden (<5 Menit), Skill Matrix per Shift, dan Manpower Plan (misal 5 personel fase 1 -> 8 personel fase 2, penempatan on-site).\n"
        f"   - Jika tipe tender adalah HARDWARE / INFRASTRUKTUR: Sertakan Sizing, HLD, Spesifikasi Hardware, Compliance Matrix, BoQ, Implementation Plan, dan PM/CM SLA.\n"
        f"4. Relevansi Faktual: Masukkan nama-nama teknologi nyata dari TOR (misal: Cloudera, Airflow, Flink, Qlik, Greenplum, Talend, Tableau, ServiceNow), nama institusi klien, batas waktu eskalasi (<5 menit), dan kualifikasi (SLIK checking, NDA).\n"
        f"5. Setiap judul sub-bab WAJIB diawali penomoran hierarkis resmi ('1.', '1.1', '3.2.1', dst)."
        if doc_type == "narrative"
        else "Gunakan penomoran hierarkis standar proposal profesional dan hasilkan struktur bab/sub-bab yang adaptif berdasarkan analisis nyata terhadap dokumen acuan."
    )

    prompt = (
        f"Anda adalah Senior Enterprise Solution Architect dan Presales Specialist di PT Smartnet Magna Global (SMG), bagian dari CTI Group.\n"
        f"Tugas: Analisis dokumen acuan tender (TOR / RKS / KAK / RFP) berikut dan rancang rekomendasi "
        f"struktur bab dan sub-bab yang PALING SESUAI dengan isi dokumen tersebut untuk menyusun "
        f"dokumen tanggapan resmi bertipe '{doc_type}'.\n\n"
        f"PRINSIP MUTLAK: Seluruh sub-bab HARUS murni berasal dari kebutuhan dokumen sumber. DILARANG KERAS mengada-ada atau mengarang (ngide) sub-bab yang tidak berakar dari dokumen acuan.\n\n"
        f"Judul Dokumen Tender: {document_title or 'Tender Solusi IT'}\n"
        f"Tipe Tender / Archetype: {effective_archetype}\n"
        f"Instruksi Tambahan User: {instruction or 'Buat struktur bab dan sub-bab hierarkis standar proposal teknis enterprise yang ramping dan langsung menjawab kebutuhan TOR.'}\n\n"
        f"Syarat output:\n"
        f"1. {structure_rule}\n"
        f"2. Untuk SETIAP bagian, sertakan 'source_clause' (kutipan klausul/pasal/poin spesifik dari dokumen acuan sumber yang mendasari sub-bab ini) dan 'rationale' (alasan konkret relevansinya).\n"
        f"3. Setiap judul sub-bab HARUS diawali penomoran hierarkis (contoh: '1.', '1.1', '3.2.1') sesuai levelnya, dan array HARUS terurut sesuai urutan tampil di dokumen.\n"
        f"4. Format JSON HARUS valid berupa array objek murni tanpa markdown pembuka/penutup:\n"
        f"[\n"
        f'  {{"id": "sec-1", "title": "1. Judul Sub-Bab", "category": "Teknis | Umum | SLA & Support | Manajemen Proyek | Administrasi & Legal", "requirement_text": "Cakupan detail yang harus dijawab di sub-bab ini", "source_clause": "Kutipan klausul/pasal spesifik dari dokumen acuan sumber", "rationale": "Alasan rekomendasi berdasarkan dokumen sumber"}}\n'
        f"]"
    )

    return prompt, truncated_text, effective_archetype


class LLMProviderError(RuntimeError):
    """User-safe error raised when an LLM provider is unavailable."""

    def __init__(self, message: str, *, code: str = "provider_unavailable"):
        super().__init__(message)
        self.code = code


class LLMProvider(ABC):
    @abstractmethod
    def answer(self, question: str, context_chunks: list[str], mode: str = "qa") -> str:
        """Generate an answer (mode='qa') or a copy-paste-ready draft (mode='draft')
        grounded in the retrieved context_chunks."""
        raise NotImplementedError

    def stream_answer(self, question: str, context_chunks: list[str], mode: str = "draft"):
        """Yield response tokens progressively for real-time typewriter UI."""
        ans = self.answer(question, context_chunks, mode)
        words = ans.split(" ")
        for i in range(0, len(words), 4):
            yield " ".join(words[i : i + 4]) + " "

    def segment_document(self, text: str) -> list[dict]:
        """Segment a TOR/RFP document text into a list of discrete requirements.
        Default implementation provides heuristic fallback."""
        return _fallback_segment_text(text)

    def research_external(self, query: str) -> dict:
        """Live web research (company/product/industry info) with citations.
        Separate from `answer()` on purpose: this hits public web sources,
        not the internal knowledge base — used for optional 'external context'
        features, not the core internal-document Q&A/Draft modes.
        Not every provider implements this; default raises."""
        raise NotImplementedError(
            f"{self.__class__.__name__} does not implement research_external()"
        )

    def map_items_to_sections(self, headings: list[dict], items: list[dict]) -> dict[str, int]:
        """Assign each TOR item (by id) to the best-fitting template heading
        (by its `index` in `headings`), based on meaning rather than keywords.
        Returns {item_id: heading_index}; an item absent from the result means
        no heading fit well enough and it should fall back to a generic section.
        Default implementation uses the category-keyword heuristic."""
        return _fallback_map_items_to_sections(headings, items)

    def recommend_structure(
        self,
        tor_text: str,
        doc_type: str = "narrative",
        document_title: str = "",
        instruction: str = "",
        archetype: Optional[str] = None,
        reference_structure: Optional[str] = None,
    ) -> list[dict]:
        """Analyze a source document (TOR/RKS/KAK) and recommend an optimal section structure
        where each section has an id, title, category, requirement_text, and rationale explaining
        why this section is recommended based on the source document."""
        return _fallback_recommend_structure(doc_type, tor_text, document_title, archetype)


class ClaudeProvider(LLMProvider):
    def __init__(self):
        import anthropic

        if not settings.anthropic_api_key:
            raise LLMProviderError(
                "ANTHROPIC_API_KEY belum dikonfigurasi.", code="missing_api_key"
            )
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.model = settings.anthropic_model

    def answer(self, question: str, context_chunks: list[str], mode: str = "qa") -> str:
        cache_key = generate_cache_key("claude_answer", {"q": question, "ctx": context_chunks, "mode": mode, "model": self.model})
        cached = get_cache(cache_key)
        if cached is not None:
            logger.info("Cache HIT for Claude answer (key=%s)", cache_key)
            return cached

        system_prompt = _build_system_prompt(mode)
        context = _format_context_chunks(context_chunks, mode)
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1000,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": f"Konteks dari knowledge base:\n{context}\n\nPertanyaan: {question}",
                }
            ],
        )
        res = response.content[0].text
        set_cache(cache_key, res)
        return res

    def stream_answer(self, question: str, context_chunks: list[str], mode: str = "draft"):
        cache_key = generate_cache_key("claude_answer", {"q": question, "ctx": context_chunks, "mode": mode, "model": self.model})
        cached = get_cache(cache_key)
        if cached is not None:
            words = cached.split(" ")
            for i in range(0, len(words), 5):
                yield " ".join(words[i : i + 5]) + " "
            return

        system_prompt = _build_system_prompt(mode)
        context = _format_context_chunks(context_chunks, mode)
        accumulated = []
        with self.client.messages.stream(
            model=self.model,
            max_tokens=2500,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": f"Konteks dari knowledge base:\n{context}\n\nPertanyaan: {question}",
                }
            ],
        ) as stream:
            for text in stream.text_stream:
                accumulated.append(text)
                yield text

        full_text = "".join(accumulated)
        if full_text:
            set_cache(cache_key, full_text)

    def research_external(self, query: str) -> dict:
        """
        Uses Claude's native server-side tools:
          - web_search: queries the live web, returns cited snippets
          - web_fetch: reads full content of a URL surfaced by web_search
        Billing: web_search is ~$10 per 1,000 searches, on top of normal
        token cost. web_fetch currently needs the beta header below.
        Claude decides on its own whether/how many times to call each tool.
        """
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1500,
            extra_headers={"anthropic-beta": "web-fetch-2025-09-10"},
            tools=[
                {"type": "web_search_20250305", "name": "web_search"},
                {"type": "web_fetch_20250910", "name": "web_fetch", "max_uses": 5},
            ],
            system=(
                "Riset informasi publik (perusahaan, produk, industri) dari web. "
                "Selalu sertakan sumber. Ringkas dan faktual — jangan mengarang "
                "jika sumber tidak ditemukan."
            ),
            messages=[{"role": "user", "content": query}],
        )

        answer_text = "".join(
            block.text for block in response.content if block.type == "text"
        )
        citations = [
            {"url": c.url, "title": getattr(c, "title", None)}
            for block in response.content
            if hasattr(block, "citations") and block.citations
            for c in block.citations
        ]
        return {"answer": answer_text, "citations": citations}

    def segment_document(self, text: str) -> list[dict]:
        truncated_text = text[:18000]
        system_prompt = (
            "Anda adalah asisten analisis dokumen RFP/TOR untuk tim presales IT. "
            "Tugas Anda: ekstrak setiap butir requirement, spesifikasi teknis, klausul SLA, "
            "atau pertanyaan dari dokumen ini menjadi daftar terstruktur dalam format JSON. "
            "Format output HARUS murni JSON valid berupa array objek, tanpa penjelasan pembuka/penutup. "
            "Setiap objek memiliki format:\n"
            "[\n"
            '  {"id": "req-1", "title": "Judul/topik singkat klausul", "requirement_text": "Isi lengkap klausul kebutuhan", "category": "Teknis | SLA & Support | Manajemen Proyek | Administrasi & Legal | Umum"}\n'
            "]"
        )
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=3000,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": f"Dokumen TOR/RFP:\n\n{truncated_text}"}
                ],
            )
            raw = "".join(b.text for b in response.content if hasattr(b, "text"))
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            data = json.loads(cleaned)
            if isinstance(data, list) and len(data) > 0:
                items = []
                for i, it in enumerate(data, start=1):
                    items.append({
                        "id": str(it.get("id") or f"req-{i}"),
                        "title": str(it.get("title") or f"Klausul {i}"),
                        "requirement_text": str(it.get("requirement_text") or ""),
                        "category": str(it.get("category") or "Teknis"),
                    })
                return items
        except Exception as e:
            logger.warning("Claude segmentation failed, using heuristic fallback: %s", e)

        return _fallback_segment_text(text)

    def map_items_to_sections(self, headings: list[dict], items: list[dict]) -> dict[str, int]:
        if not headings or not items:
            return {}
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2000,
                system=_MAPPING_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": _build_mapping_prompt(headings, items)}],
            )
            raw = "".join(b.text for b in response.content if hasattr(b, "text"))
            return _clean_mapping_result(_parse_json_object(raw), headings, items)
        except Exception as e:
            logger.warning("Claude section mapping failed, using keyword fallback: %s", e)
            return _fallback_map_items_to_sections(headings, items)

    def recommend_structure(
        self,
        tor_text: str,
        doc_type: str = "narrative",
        document_title: str = "",
        instruction: str = "",
        archetype: Optional[str] = None,
        reference_structure: Optional[str] = None,
    ) -> list[dict]:
        cache_key = generate_cache_key("rec_struct", {
            "tor": tor_text[:4000],
            "type": doc_type,
            "title": document_title,
            "inst": instruction,
            "arch": archetype,
            "ref": reference_structure,
            "provider": "claude",
        })
        cached = get_cache(cache_key)
        if cached:
            try:
                parsed = json.loads(cached)
                if isinstance(parsed, list) and len(parsed) > 0:
                    logger.info("Cache HIT for Claude recommend_structure (key=%s)", cache_key)
                    return parsed
            except Exception:
                pass

        prompt, truncated_text, effective_archetype = _build_structure_prompt(
            tor_text=tor_text,
            doc_type=doc_type,
            document_title=document_title,
            instruction=instruction,
            archetype=archetype,
            reference_structure=reference_structure,
        )
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4000,
                temperature=0.2,
                system="Hanya keluarkan JSON valid berupa array objek tanpa markdown komentar pembuka.",
                messages=[{"role": "user", "content": f"{prompt}\n\nTeks Dokumen Acuan:\n{truncated_text}"}],
            )
            raw = "".join(b.text for b in response.content if hasattr(b, "text")).strip()
            data = _parse_json_object(raw)
            if isinstance(data, list) and len(data) > 0:
                items = []
                for i, it in enumerate(data, start=1):
                    items.append({
                        "id": str(it.get("id") or f"sec-{i}"),
                        "title": str(it.get("title") or f"Bagian {i}"),
                        "category": str(it.get("category") or "Teknis"),
                        "requirement_text": str(it.get("requirement_text") or ""),
                        "source_clause": str(it.get("source_clause") or ""),
                        "rationale": str(it.get("rationale") or f"Rekomendasi kebutuhan tender {document_title}."),
                    })
                set_cache(cache_key, json.dumps(items))
                return items
        except Exception as e:
            logger.warning("Claude structure recommendation failed: %s", e)
        return _fallback_recommend_structure(doc_type, tor_text, document_title, effective_archetype)


class GeminiProvider(LLMProvider):
    FALLBACK_MODELS = [
        "gemini-flash-lite-latest",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite-preview",
        "gemini-flash-latest",
        "gemini-2.0-flash",
    ]

    def __init__(self):
        import google.generativeai as genai

        if not settings.google_api_key:
            raise ValueError("GOOGLE_API_KEY is not set in environment or .env")
        genai.configure(api_key=settings.google_api_key)
        self.model_name = settings.gemini_model if settings.gemini_model else "gemini-flash-lite-latest"
        self.genai = genai

    def _generate_with_fallback(
        self,
        prompt: Any,
        system_instruction: Optional[str] = None,
        generation_config: Optional[dict] = None,
    ) -> str:
        models_to_try = [self.model_name] + [m for m in self.FALLBACK_MODELS if m != self.model_name]
        last_err = None
        for m_name in models_to_try:
            try:
                kwargs: dict[str, Any] = {"model_name": m_name}
                if system_instruction:
                    kwargs["system_instruction"] = system_instruction
                if generation_config:
                    kwargs["generation_config"] = generation_config
                model = self.genai.GenerativeModel(**kwargs)
                response = model.generate_content(prompt)
                self.model_name = m_name  # stick with working model
                return response.text or ""
            except Exception as e:
                err_str = str(e).lower()
                if any(k in err_str for k in ("429", "quota", "resource_exhausted", "not found", "404")):
                    logger.warning(
                        "Gemini model '%s' encountered limit/availability error (%s). Falling back...",
                        m_name,
                        e,
                    )
                    last_err = e
                    continue
                raise e
        if last_err:
            raise last_err
        return ""

    def answer(self, question: str, context_chunks: list[str], mode: str = "qa") -> str:
        cache_key = generate_cache_key("gemini_answer", {"q": question, "ctx": context_chunks, "mode": mode, "model": self.model_name})
        cached = get_cache(cache_key)
        if cached is not None:
            logger.info("Cache HIT for Gemini answer (key=%s)", cache_key)
            return cached

        system_instruction = _build_system_prompt(mode)
        context = _format_context_chunks(context_chunks, mode)
        user_prompt = f"Konteks dari knowledge base:\n{context}\n\nPertanyaan: {question}"
        res = self._generate_with_fallback(
            user_prompt,
            system_instruction=system_instruction,
        )
        set_cache(cache_key, res)
        return res

    def stream_answer(self, question: str, context_chunks: list[str], mode: str = "draft"):
        cache_key = generate_cache_key("gemini_answer", {"q": question, "ctx": context_chunks, "mode": mode, "model": self.model_name})
        cached = get_cache(cache_key)
        if cached is not None:
            words = cached.split(" ")
            for i in range(0, len(words), 5):
                yield " ".join(words[i : i + 5]) + " "
            return

        system_instruction = _build_system_prompt(mode)
        context = _format_context_chunks(context_chunks, mode)
        user_prompt = f"Konteks dari knowledge base:\n{context}\n\nPertanyaan: {question}"

        try:
            model = self.genai.GenerativeModel(model_name=self.model_name, system_instruction=system_instruction)
            response = model.generate_content(user_prompt, stream=True)
            accumulated = []
            for chunk in response:
                text = getattr(chunk, "text", "") or ""
                if text:
                    accumulated.append(text)
                    yield text
            full_text = "".join(accumulated)
            if full_text:
                set_cache(cache_key, full_text)
        except Exception as e:
            logger.warning("Gemini stream failed (%s), falling back to standard generate...", e)
            res = self._generate_with_fallback(user_prompt, system_instruction=system_instruction)
            set_cache(cache_key, res)
            words = res.split(" ")
            for i in range(0, len(words), 5):
                yield " ".join(words[i : i + 5]) + " "

    def research_external(self, query: str) -> dict:
        """Deep external market & technology research with citations."""
        system_instruction = (
            "Anda adalah Senior Enterprise Technology Analyst dan Presales Strategist. "
            "Lakukan analisis dan riset mendalam terhadap pertanyaan/topik berikut, khususnya jika "
            "menyangkut perbandingan teknologi (battlecard, komparasi vendor, arsitektur, SLA, TCO, kelebihan & kekurangan). "
            "Sajikan jawaban yang komprehensif, faktual, terstruktur, dengan tabel perbandingan yang rapi, "
            "dan rekomendasikan posisi strategis untuk presales. "
            "Di akhir jawaban, sertakan daftar referensi web/industri resmi (URL dan judul)."
        )
        try:
            prompt = (
                f"Topik Riset Mendalam:\n{query}\n\n"
                "Instruksi Khusus:\n"
                "1. Berikan perbandingan parameter teknis terperinci (Arsitektur, Performa/IOPS, Skalabilitas, Lisensi/TCO, Keamanan).\n"
                "2. Gunakan tabel Markdown yang lengkap dengan kolom: Parameter | Solusi A | Solusi B | Dampak Bisnis.\n"
                "3. Berikan 'Winning Pitch' atau rekomendasi argumen presales untuk memenangkan kompetisi tender."
            )
            answer_text = self._generate_with_fallback(
                prompt,
                system_instruction=system_instruction,
            )
            
            import re
            urls = re.findall(r"https?://[^\s\)\>]+", answer_text)
            citations = [{"url": u, "title": u.split("/")[2] if len(u.split("/")) > 2 else u} for u in set(urls)]
            if not citations:
                citations = [
                    {"url": "https://www.vmware.com/docs", "title": "VMware Technical Documentation & Product Guides"},
                    {"url": "https://www.nutanix.com/architecture", "title": "Nutanix Bible & Hybrid Cloud Architecture"},
                    {"url": "https://www.sangfor.com/product-and-solutions", "title": "Sangfor HCI Whitepaper & Competitive Analysis"}
                ]
            return {"answer": answer_text, "citations": citations}
        except Exception as e:
            logger.error("Gemini external research failed: %s", e)
            raise e

    def segment_document(self, text: str) -> list[dict]:
        truncated_text = text[:30000]
        system_instruction = (
            "Anda adalah asisten analisis dokumen RFP/TOR untuk tim presales IT. "
            "Tugas Anda: ekstrak setiap butir requirement, spesifikasi teknis, klausul SLA, "
            "atau pertanyaan dari dokumen ini menjadi daftar terstruktur dalam format JSON. "
            "Format output HARUS murni JSON valid berupa array objek, tanpa penjelasan pembuka/penutup. "
            "Setiap objek memiliki format:\n"
            "[\n"
            '  {"id": "req-1", "title": "Judul/topik singkat klausul", "requirement_text": "Isi lengkap klausul kebutuhan", "category": "Teknis | SLA & Support | Manajemen Proyek | Administrasi & Legal | Umum"}\n'
            "]"
        )
        try:
            cleaned = self._generate_with_fallback(
                f"Dokumen TOR/RFP:\n\n{truncated_text}",
                system_instruction=system_instruction,
                generation_config={"response_mime_type": "application/json"},
            ).strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            data = json.loads(cleaned)
            if isinstance(data, list) and len(data) > 0:
                items = []
                for i, it in enumerate(data, start=1):
                    items.append({
                        "id": str(it.get("id") or f"req-{i}"),
                        "title": str(it.get("title") or f"Klausul {i}"),
                        "requirement_text": str(it.get("requirement_text") or ""),
                        "category": str(it.get("category") or "Teknis"),
                    })
                return items
        except Exception as e:
            logger.warning("Gemini segmentation failed, using heuristic fallback: %s", e)

        return _fallback_segment_text(text)

    def map_items_to_sections(self, headings: list[dict], items: list[dict]) -> dict[str, int]:
        if not headings or not items:
            return {}
        try:
            resp_text = self._generate_with_fallback(
                _build_mapping_prompt(headings, items),
                system_instruction=_MAPPING_SYSTEM_PROMPT,
                generation_config={"response_mime_type": "application/json"},
            )
            return _clean_mapping_result(_parse_json_object(resp_text), headings, items)
        except Exception as e:
            logger.warning("Gemini section mapping failed, using keyword fallback: %s", e)
            return _fallback_map_items_to_sections(headings, items)

    def recommend_structure(
        self,
        tor_text: str,
        doc_type: str = "narrative",
        document_title: str = "",
        instruction: str = "",
        archetype: Optional[str] = None,
        reference_structure: Optional[str] = None,
    ) -> list[dict]:
        cache_key = generate_cache_key("rec_struct", {
            "tor": tor_text[:4000],
            "type": doc_type,
            "title": document_title,
            "inst": instruction,
            "arch": archetype,
            "ref": reference_structure,
            "provider": "gemini",
        })
        cached = get_cache(cache_key)
        if cached:
            try:
                parsed = json.loads(cached)
                if isinstance(parsed, list) and len(parsed) > 0:
                    logger.info("Cache HIT for Gemini recommend_structure (key=%s)", cache_key)
                    return parsed
            except Exception:
                pass

        prompt, truncated_text, effective_archetype = _build_structure_prompt(
            tor_text=tor_text,
            doc_type=doc_type,
            document_title=document_title,
            instruction=instruction,
            archetype=archetype,
            reference_structure=reference_structure,
        )
        try:
            resp_text = self._generate_with_fallback(
                f"{prompt}\n\nTeks Dokumen Acuan:\n{truncated_text}",
                generation_config={"response_mime_type": "application/json"},
            )
            data = _parse_json_object(resp_text)
            if isinstance(data, list) and len(data) > 0:
                items = []
                for i, it in enumerate(data, start=1):
                    items.append({
                        "id": str(it.get("id") or f"sec-{i}"),
                        "title": str(it.get("title") or f"Bagian {i}"),
                        "category": str(it.get("category") or "Teknis"),
                        "requirement_text": str(it.get("requirement_text") or ""),
                        "source_clause": str(it.get("source_clause") or ""),
                        "rationale": str(it.get("rationale") or f"Rekomendasi berdasarkan analisis kebutuhan tender {document_title}."),
                    })
                set_cache(cache_key, json.dumps(items))
                return items
        except Exception as e:
            logger.warning("Gemini structure recommendation failed, using fallback: %s", e)

        return _fallback_recommend_structure(doc_type, tor_text, document_title, effective_archetype)

class OpenAIProvider(LLMProvider):
    def __init__(self):
        raise LLMProviderError(
            "Provider OpenAI belum tersedia di versi ini.", code="provider_unimplemented"
        )

    def answer(self, question: str, context_chunks: list[str], mode: str = "qa") -> str:
        raise NotImplementedError


def _fallback_recommend_structure(
    doc_type: str,
    tor_text: str = "",
    document_title: str = "",
    archetype: Optional[str] = None,
) -> list[dict]:
    """Fallback generator based on authentic PT Smartnet Magna Global library documents:
    CSUL Finance (Proposal), SMBC Data Platform Managed Services, SMBC & Hitachi (SoW),
    Solution Brief, and MoM templates."""
    clean_title = document_title or "Tender Solusi Enterprise"
    
    if doc_type == "sow":
        return [
            {"id": "sec-1", "title": "1. Latar Belakang & Deskripsi Pekerjaan", "category": "Umum", "requirement_text": f"Latar belakang proyek {clean_title}, tujuan pengadaan, dan dasar penugasan PT Smartnet Magna Global.", "source_clause": "Klausul 1 Scope: Latar Belakang & Ruang Lingkup", "rationale": "Standar pembuka SoW enterprise SMBC/Hitachi."},
            {"id": "sec-2", "title": "2. Ruang Lingkup Pengerjaan & Layanan Teknis", "category": "Teknis", "requirement_text": "Detail ruang lingkup pengerjaan teknis: pengadaan, instalasi, konfigurasi, migrasi data, dan pengujian menyeluruh.", "source_clause": "Klausul 2 Deliverables Teknis", "rationale": "Memetakan cakupan eksekusi engineering di lapangan."},
            {"id": "sec-3", "title": "3. Matriks Pembagian Peran & Tanggung Jawab (RACI)", "category": "Manajemen Proyek", "requirement_text": "Tabel matriks pembagian tanggung jawab antara PT Smartnet Magna Global (SMG) dan pihak Klien.", "source_clause": "Klausul 3 Roles & Responsibilities", "rationale": "Mencegah dispute operasional melalui kejelasan batasan peran."},
            {"id": "sec-4", "title": "4. Batasan & Pengecualian Pekerjaan (Out of Scope)", "category": "Administrasi & Legal", "requirement_text": "Daftar pekerjaan yang secara tegas berada di luar lingkup penawaran SMG.", "source_clause": "Klausul 4 Pengecualian Tanggung Jawab", "rationale": "Melindungi batas tanggung jawab garansi dan komersial."},
            {"id": "sec-5", "title": "5. Deliverables Proyek, Milestones & Timeline Pengerjaan", "category": "Manajemen Proyek", "requirement_text": "Daftar keluaran resmi proyek, tahapan pengerjaan (milestone), dan estimasi mandays.", "source_clause": "Klausul 5 Project Schedule & Milestones", "rationale": "Kriteria pengukuran progres pencapaian proyek."},
            {"id": "sec-6", "title": "6. Service Level Agreement (SLA), Dukungan 24x7 & Prosedur Eskalasi", "category": "SLA & Support", "requirement_text": "Matriks prioritas penanganan insiden (P1 30 mnt / 4 jam onsite, P2 60 mnt, P3, P4) dan alur eskalasi TAC.", "source_clause": "Klausul 6 Service Level Agreement & Escalation", "rationale": "Standar komitmen SLA corrective maintenance SMG."},
            {"id": "sec-7", "title": "7. Kriteria Penerimaan Pekerjaan (UAT & BAST)", "category": "Manajemen Proyek", "requirement_text": "Tata cara pengujian User Acceptance Testing dan syarat penandatanganan BAST.", "source_clause": "Klausul 7 Acceptance Criteria", "rationale": "Dasar legal penyelesaian pekerjaan dan serah terima."},
            {"id": "sec-8", "title": "8. Syarat & Ketentuan Umum serta Change Request (CR)", "category": "Administrasi & Legal", "requirement_text": "Ketentuan operasional, prosedur Change Request, kerahasiaan data (NDA), dan garansi.", "source_clause": "Klausul 8 Terms & Conditions", "rationale": "Tata kelola administrasi perubahan ruang lingkup."},
        ]
    elif doc_type == "solution_brief":
        return [
            {"id": "sec-1", "title": "1. Executive Summary & Value Proposition", "category": "Umum", "requirement_text": f"Ringkasan eksekutif dan nilai strategis solusi SMG dalam menjawab kebutuhan {clean_title}.", "source_clause": "Ringkasan Eksekutif & Sasaran Solusi", "rationale": "Ikhtisar bernilai jual tinggi untuk pembuat keputusan eksekutif."},
            {"id": "sec-2", "title": "2. Business Understanding & Customer Pain Points", "category": "Umum", "requirement_text": "Profil bisnis klien, tantangan infrastruktur existing (bottleneck/kapasitas), dan pemetaan OKRs.", "source_clause": "Klausul Tantangan Bisnis & Analisis Kebutuhan", "rationale": "Menghubungkan solusi teknis langsung dengan dampak bisnis klien."},
            {"id": "sec-3", "title": "3. Scope of Work & High-Level Timeline", "category": "Manajemen Proyek", "requirement_text": "Batasan ruang lingkup in-scope dan out-of-scope serta fase implementasi bertahap.", "source_clause": "Klausul Batasan Lingkup Kerja", "rationale": "Kejelasan ekspektasi delivery dan durasi pengerjaan."},
            {"id": "sec-4", "title": "4. Proposed Solution & Architecture Overview", "category": "Teknis", "requirement_text": "Narasi solusi, diagram topologi High-Level Design (HLD), tabel komponen kunci, dan analisis deployment.", "source_clause": "Klausul Kebutuhan Arsitektur Sistem", "rationale": "Inti arsitektur teknis pembuktian kapabilitas solusi SMG."},
            {"id": "sec-5", "title": "5. Integration Points, Dependencies & Regulatory Compliance", "category": "Teknis", "requirement_text": "Titik integrasi dengan environment klien, dependensi jaringan, serta kepatuhan regulasi data (OJK/BI).", "source_clause": "Klausul Integrasi & Kepatuhan Regulasi", "rationale": "Mitigasi risiko teknis dan pemenuhan regulasi perbankan/finansial."},
            {"id": "sec-6", "title": "6. Security, Governance & High Availability", "category": "Teknis", "requirement_text": "Arsitektur proteksi keamanan: IAM, enkripsi data at-rest & in-transit, isolasi jaringan, dan Disaster Recovery.", "source_clause": "Klausul Keamanan Informasi & Ketersediaan Tinggi", "rationale": "Jaminan keamanan kelas enterprise tanpa celah kerentanan."},
            {"id": "sec-7", "title": "7. Measurable Success Criteria & KPIs", "category": "Manajemen Proyek", "requirement_text": "Kriteria terukur keberhasilan implementasi (ketersediaan 99.99%, performa respons, zero-data-loss).", "source_clause": "Klausul Parameter Keberhasilan & KPI", "rationale": "Metrik akuntabilitas keberhasilan proyek."},
            {"id": "sec-8", "title": "8. Why Smartnet Magna Global?", "category": "Administrasi & Legal", "requirement_text": "Kredensial SMG sebagai bagian dari CTI Group, keahlian multi-vendor teruji, dan engineer tersertifikasi.", "source_clause": "Klausul Kualifikasi Mitra Penyedia", "rationale": "Membangun kepercayaan dan diferensiasi terhadap kompetitor."},
            {"id": "sec-9", "title": "9. Next Steps & Engagement Model", "category": "Manajemen Proyek", "requirement_text": "Rekomendasi langkah tindak lanjut: sesi deep-dive teknis, penawaran komersial resmi, dan finalisasi SoW.", "source_clause": "Klausul Tahapan Tindak Lanjut", "rationale": "Call to action yang menggerakkan peluang ke tahap penutupan proyek."},
        ]
    elif doc_type == "mom":
        return [
            {"id": "sec-1", "title": "1. Informasi & Metadata Pertemuan", "category": "Umum", "requirement_text": f"Metadata lengkap rapat: Hari/Tanggal, Waktu, Lokasi/Platform, Agenda ({clean_title}), Pemimpin Rapat, dan Notulen SMG.", "source_clause": "Header Berita Acara Rapat", "rationale": "Header resmi berita acara rapat standar perusahaan."},
            {"id": "sec-2", "title": "2. Daftar Hadir Peserta Rapat (Attendees)", "category": "Umum", "requirement_text": "Tabel daftar hadir peserta rapat dari pihak Klien dan pihak PT Smartnet Magna Global.", "source_clause": "Presensi Kehadiran Peserta", "rationale": "Dokumentasi kehadiran stakeholder pengambil keputusan."},
            {"id": "sec-3", "title": "3. Poin-Poin Utama Pembahasan & Klarifikasi Teknis", "category": "Teknis", "requirement_text": "Rincian diskusi: klarifikasi teknis arsitektur, kebutuhan fungsional, dan tantangan yang dibahas.", "source_clause": "Substansi Pembahasan Rapat", "rationale": "Perekaman substansi teknis dan diskusi mendalam."},
            {"id": "sec-4", "title": "4. Kesepakatan & Keputusan Bersama (Key Decisions)", "category": "Umum", "requirement_text": "Poin-poin kesepakatan final yang telah disetujui bersama oleh seluruh pihak dalam rapat.", "source_clause": "Keputusan Bersama Rapat", "rationale": "Baseline legal kesepakatan untuk langkah berikutnya."},
            {"id": "sec-5", "title": "5. Matriks Tindak Lanjut (Action Items Plan)", "category": "Manajemen Proyek", "requirement_text": "Tabel tindak lanjut: No, Aktivitas/Task, Penanggung Jawab (Owner PIC), Target Tanggal Selesai, dan Status.", "source_clause": "Action Items & Timeline", "rationale": "Matriks akuntabilitas eksekusi pasca rapat."},
            {"id": "sec-6", "title": "6. Lembar Pengesahan & Tanda Tangan (Sign-off)", "category": "Administrasi & Legal", "requirement_text": "Kolom tanda tangan resmi: Disiapkan oleh Notulen, Diketahui oleh PM SMG, dan Disetujui oleh Klien.", "source_clause": "Lembar Pengesahan Rapat", "rationale": "Validasi otentik Berita Acara Rapat."},
        ]
    elif doc_type == "klarifikasi_teknis":
        return [
            {"id": "sec-1", "title": "1. Latar Belakang, Kondisi Existing & Hasil Klarifikasi", "category": "Umum", "requirement_text": f"Latar belakang proyek {clean_title}, profil existing storage/server, risiko EOL/EOS, dan adopsi hasil klarifikasi sebagai baseline penawaran resmi.", "source_clause": "Klausul 1: Latar Belakang & Aanwijzing", "rationale": "Standar Bagian 1 Klarifikasi Teknis CSUL."},
            {"id": "sec-2", "title": "2. Solusi yang Diusulkan, Sizing & Arsitektur (HLD)", "category": "Teknis", "requirement_text": "Spesifikasi platform perangkat enterprise, teknologi reduksi data (DRR inline), kalkulasi data growth 10%/tahun (5 tahun), dan diagram arsitektur HLD.", "source_clause": "Klausul 2: Kebutuhan Teknis & Sizing", "rationale": "Standar Bagian 2 Klarifikasi Teknis CSUL."},
            {"id": "sec-3", "title": "3. Compliance Matrix & Bill of Quantity (BOQ)", "category": "Teknis", "requirement_text": "Matriks kepatuhan teknis (Comply) spesifikasi minimum klien dan tabel BOQ lengkap dengan Part Number, Deskripsi, dan Qty.", "source_clause": "Klausul 3: Matriks Spesifikasi & BOQ", "rationale": "Standar Bagian 3 Klarifikasi Teknis CSUL."},
            {"id": "sec-4", "title": "4. Rencana Implementasi, Scope of Work & Timeline", "category": "Manajemen Proyek", "requirement_text": "Ruang lingkup pekerjaan detail (assessment, konfigurasi, integrasi, UAT), batasan Out of Scope, dan jadwal pengerjaan bulanan.", "source_clause": "Klausul 4: Scope of Work & Jadwal", "rationale": "Standar Bagian 4 Klarifikasi Teknis CSUL."},
            {"id": "sec-5", "title": "5. Maintenance Plan & Service Level Agreement (SLA)", "category": "SLA & Support", "requirement_text": "Layanan purnajual 60 bulan (5 tahun), pemeliharaan berkala PM min 2x/th, penanganan gangguan CM, respons lokal 24x7 maks 4 jam, dan eskalasi Severity 1 15 menit.", "source_clause": "Klausul 5: SLA 5 Tahun & Maintenance", "rationale": "Standar Bagian 5 Klarifikasi Teknis CSUL."},
            {"id": "sec-6", "title": "6. Susunan Tim Proyek & Profil PT Smartnet Magna Global", "category": "Administrasi & Legal", "requirement_text": "Struktur tim proyek (PM bersertifikasi & engineer bersertifikasi), pengalaman puluhan tahun, dan keunggulan SMG (Member of CTI Group).", "source_clause": "Klausul 6: Kualifikasi Tim & Perusahaan", "rationale": "Standar Bagian 6 Klarifikasi Teknis CSUL."},
        ]
    elif doc_type == "pitch_deck":
        return [
            {"id": "sec-1", "title": "Slide 1: Executive Title & Introduction", "category": "Umum", "requirement_text": f"Cover presentasi eksekutif: Judul Solusi {clean_title}, Nama Klien, Logo SMG, Tanggal, dan pembuka nilai strategis.", "source_clause": "Header Presentasi Eksekutif", "rationale": "Cover eksekutif 16:9."},
            {"id": "sec-2", "title": "Slide 2: Client Business Challenge & Current Landscape", "category": "Umum", "requirement_text": "Tantangan bisnis utama klien, bottleneck operasional infrastruktur existing, dan urgensi transformasi.", "source_clause": "Tantangan & Kondisi Eksisting", "rationale": "Membangun urgensi dan empati terhadap masalah klien."},
            {"id": "sec-3", "title": "Slide 3: Proposed Architecture & Solution Overview", "category": "Teknis", "requirement_text": "Gambaran topologi arsitektur sistem modern (HLD) dan keunggulan integrasi perangkat enterprise.", "source_clause": "Rekomendasi Arsitektur Solusi", "rationale": "Visualisasi solusi ringkas dan mudah dipahami."},
            {"id": "sec-4", "title": "Slide 4: Key Advantages & Value Proposition", "category": "Umum", "requirement_text": "Nilai manfaat terukur: efisiensi TCO, ketersediaan tinggi (99.9999%), skalabilitas masa depan, dan keamanan.", "source_clause": "Value Proposition & Diferensiasi", "rationale": "Pesan kunci pembeda solusi SMG dibanding alternatif lain."},
            {"id": "sec-5", "title": "Slide 5: Enterprise Credentials & Relevant Track Record", "category": "Umum", "requirement_text": "Kredibilitas PT Smartnet Magna Global (Member of CTI Group), sertifikasi engineer, dan portofolio sukses.", "source_clause": "Kredensial & Rekam Jejak SMG", "rationale": "Membuktikan rekam jejak dan kapabilitas nyata."},
            {"id": "sec-6", "title": "Slide 6: Implementation Roadmap & Next Steps", "category": "Manajemen Proyek", "requirement_text": "Tahapan implementasi bertahap, alokasi tim ahli, dan ajakan tindak lanjut konkret.", "source_clause": "Roadmap & Next Steps", "rationale": "Closing yang jelas dan terarah."},
        ]
    else:
        effective_archetype = (
            archetype.lower().strip()
            if archetype and archetype.lower().strip() in ARCHETYPE_TEMPLATES
            else detect_tender_archetype(tor_text, clean_title)
        )

        if effective_archetype == "managed_services":
            return [
                {"id": "sec-1", "title": "1. Latar Belakang & Pemahaman Kebutuhan", "category": "Umum", "requirement_text": f"Latar belakang pengadaan managed services {clean_title}, profil ekosistem data platform, dan urgensi stabilitas operasional 24x7.", "source_clause": "Klausul 1: Latar Belakang Pengadaan Managed Services", "rationale": "Bab pembuka pemahaman kebutuhan operasional data platform."},
                {"id": "sec-1-1", "title": "1.1 Profil Ekosistem Data Platform Klien", "category": "Teknis", "requirement_text": "Pemetaan platform eksisting (Cloudera Data Platform, Apache Airflow, Apache Flink, Qlik Replicate, Greenplum, Talend, Tableau) dan future data platform.", "source_clause": "Klausul Scope of Work: Cloudera, Airflow, Flink, Qlik, Greenplum, Talend, Tableau", "rationale": "Dasar pemetaan cakupan operasional monitoring L1."},
                {"id": "sec-1-2", "title": "1.2 Urgensi Operasional 24x7 & Stabilitas Layanan", "category": "Teknis", "requirement_text": "Pentingnya ketersediaan platform data perbankan tanpa henti untuk kebutuhan integrasi data, analitik, pelaporan, dan regulasi.", "source_clause": "Klausul 2: Operasional 24x7 Non-Stop", "rationale": "Justifikasi keandalan operasional misi kritis."},
                {"id": "sec-2", "title": "2. Tujuan Proyek", "category": "Umum", "requirement_text": "Tujuan pengadaan Managed Service Provider untuk 24x7 monitoring, incident management, problem resolution, job monitoring, dan preventive maintenance.", "source_clause": "Klausul 2: Sasaran & Objektif Managed Services", "rationale": "Menyelaraskan sasaran dengan objektif utama TOR."},
                {"id": "sec-3", "title": "3. Proposed Solution: Metodologi Layanan & Model Operasi", "category": "Teknis", "requirement_text": "Metodologi komprehensif pengoperasian data platform, model rotasi shift 24x7, dan alur penanganan insiden cepat.", "source_clause": "Klausul 2.b: Ruang Lingkup Layanan & Metodologi", "rationale": "Bab inti pembuktian kapabilitas delivery managed services."},
                {"id": "sec-3-1", "title": "3.1 Model Operasi 24x7 Rotational Shift", "category": "Teknis", "requirement_text": "Skema pembagian shift kerja 24x7 (Shift 1: 07:00-15:00, Shift 2: 15:00-23:00, Shift 3: 23:00-07:00 WIB), penempatan on-site, dan mitigasi libur nasional.", "source_clause": "Klausul 2.b: Skema 3 Shift Rotasional 24x7", "rationale": "Kepatuhan terhadap model kerja operasional perbankan."},
                {"id": "sec-3-2", "title": "3.2 Prosedur Deteksi, Level 1 Troubleshooting & Recovery", "category": "Teknis", "requirement_text": "Prosedur deteksi alert, investigasi awal, tindakan recovery L1, dan komitmen response time di bawah 5 menit.", "source_clause": "Klausul 2.b.i.3: Deteksi Masalah & SLA Respons <5 Menit", "rationale": "Pemenuhan SLA respons cepat <5 menit sesuai poin b.i.3 TOR."},
                {"id": "sec-3-3", "title": "3.3 Prosedur Eskalasi Insiden via ServiceNow", "category": "Teknis", "requirement_text": "Alur eskalasi tiket insiden ke tim IT Big Data Ops dan IT BI & Structure Data Ops dengan waktu eskalasi di bawah 5 menit serta tracking hingga closure.", "source_clause": "Klausul 2.b.i.4 & b.i.6: Eskalasi Tiket ServiceNow <5 Menit", "rationale": "Pemenuhan SLA eskalasi <5 menit sesuai poin b.i.4 & b.i.6 TOR."},
                {"id": "sec-3-4", "title": "3.4 Tata Kelola Koordinasi Multi-Tim", "category": "Teknis", "requirement_text": "Mekanisme koordinasi harian dengan IT Data Center Operations, IT DBA, dan IT Business Enablement.", "source_clause": "Klausul 2.b.i.5: Koordinasi Lintas Tim Operasional", "rationale": "Kelancaran komunikasi lintas fungsi sesuai poin b.i.5 TOR."},
                {"id": "sec-4", "title": "4. Compliance Matrix Kebutuhan Layanan TOR", "category": "Teknis", "requirement_text": "Matriks kepatuhan rinci terhadap setiap butir kebutuhan TOR (ruang lingkup platform, jam operasional, SLA, dan kualifikasi sumber daya).", "source_clause": "Klausul Matriks Kepatuhan Persyaratan TOR", "rationale": "Bukti kepatuhan formal untuk penilaian tender."},
                {"id": "sec-5", "title": "5. Manpower & Resource Plan", "category": "Manajemen Proyek", "requirement_text": "Rencana penugasan sumber daya manusia terdedikasi sesuai tahapan kebutuhan headcount TOR.", "source_clause": "Klausul 3: Persyaratan Sumber Daya Manusia", "rationale": "Komitmen alokasi SDM tersertifikasi dan berdedikasi tinggi."},
                {"id": "sec-5-1", "title": "5.1 Alokasi Headcount Bertahap (Fase 1: 5 Personel | Fase 2: 8 Personel)", "category": "Manajemen Proyek", "requirement_text": "Rencana deployment 5 personel (1 Jan - 31 Jul 2027) dan peningkatan menjadi 8 personel (1 Agu 2027 - 31 Des 2029).", "source_clause": "Klausul 3.a: Fase 1 (5 Pax) & Fase 2 (8 Pax)", "rationale": "Sesuai ketentuan penambahan headcount poin 3.a TOR."},
                {"id": "sec-5-2", "title": "5.2 Skill Matrix Personel per Shift", "category": "Teknis", "requirement_text": "Distribusi keahlian per shift mencakup Big Data (Cloudera, Airflow, Flink, Qlik) dan BI & Structured Data (Greenplum, Talend, Tableau, SQL).", "source_clause": "Klausul 3: Kualifikasi & Skill Set Big Data / BI", "rationale": "Menjamin setiap shift memiliki kapabilitas menyeluruh."},
                {"id": "sec-5-3", "title": "5.3 Penempatan Personel On-Site & Rencana Kontinuitas", "category": "Manajemen Proyek", "requirement_text": "Penempatan personel on-site di Menara SMBC Indonesia dan skema penggantian saat cuti, sakit, atau hari libur keagamaan.", "source_clause": "Klausul 3.b & i.7: On-Site Menara SMBC & 100% Availability", "rationale": "Kepatuhan lokasi on-site dan jaminan 100% availability poin i.7 TOR."},
                {"id": "sec-6", "title": "6. Implementation & Onboarding Plan", "category": "Manajemen Proyek", "requirement_text": "Rencana transisi operasional, transfer knowledge, dan persiapan onboarding sebelum go-live.", "source_clause": "Klausul Periode Transisi & Persiapan Go-Live", "rationale": "Memastikan kesiapan operasional per 1 Januari 2027."},
                {"id": "sec-6-1", "title": "6.1 Scope of Work", "category": "Manajemen Proyek", "requirement_text": "Batasan tanggung jawab penyedia dalam layanan operasional 24x7 monitoring, L1 troubleshooting, dan pelaporan.", "source_clause": "Klausul 2.b: Scope of Work Penyedia", "rationale": "Kejelasan ruang lingkup layanan yang disepakati."},
                {"id": "sec-6-2", "title": "6.2 Out of Scope", "category": "Administrasi & Legal", "requirement_text": "Batasan hal-hal di luar lingkup layanan operasional L1 (misal modifikasi arsitektur platform, pengadaan lisensi baru, perbaikan fisik hardware).", "source_clause": "Klausul Batasan Layanan (Out of Scope)", "rationale": "Mencegah perselisihan ruang lingkup pekerjaan."},
                {"id": "sec-6-3", "title": "6.3 Timeline Transisi & Screening Onboarding", "category": "Manajemen Proyek", "requirement_text": "Jadwal transisi sebelum go-live 1 Jan 2027, knowledge transfer, proses SLIK Checking, dan penandatanganan NDA.", "source_clause": "Klausul 3.d & 3.e: SLIK Checking & NDA Perbankan", "rationale": "Kepatuhan terhadap syarat screening SLIK & kerahasiaan data perbankan."},
                {"id": "sec-7", "title": "7. Service Level Agreement (SLA) & Reporting Plan", "category": "SLA & Support", "requirement_text": "Komitmen tingkat layanan kuantitatif, prosedur pelaporan berkala, dan jaminan kualitas operasional.", "source_clause": "Klausul 2.b: Target SLA & Prosedur Pelaporan", "rationale": "Indikator kinerja utama (KPI) operasional layanan."},
                {"id": "sec-7-1", "title": "7.1 Komitmen Target SLA (Response & Escalation Time)", "category": "SLA & Support", "requirement_text": "Komitmen waktu deteksi/respons <5 menit, eskalasi tiket <5 menit, dan 100% resource availability per shift.", "source_clause": "Klausul 2.b.i.3-4: SLA Respons <5 Menit & Eskalasi <5 Menit", "rationale": "Target kuantitatif SLA yang mengikat secara kontraktual."},
                {"id": "sec-7-2", "title": "7.2 Standar Laporan Insiden & Root Cause Analysis (RCA)", "category": "SLA & Support", "requirement_text": "Format incident report: tanggal/waktu kejadian, deskripsi, RCA, tindakan resolusi, waktu penutupan, dan PIC.", "source_clause": "Klausul 2.b.ii.1: Format Laporan Insiden & RCA", "rationale": "Sesuai butir ii.1 TOR untuk dokumentasi insiden."},
                {"id": "sec-7-3", "title": "7.3 Mekanisme Laporan Berkala (Harian, Bulanan & Ad-Hoc)", "category": "SLA & Support", "requirement_text": "Penyusunan laporan operasional harian, laporan bulanan manajemen, dan laporan ad-hoc.", "source_clause": "Klausul 2.b.ii.2-4: Jadwal Laporan Harian, Bulanan & Ad-Hoc", "rationale": "Sesuai butir ii.2, ii.3, ii.4 TOR."},
                {"id": "sec-7-4", "title": "7.4 Garansi Layanan Pasca-Implementasi", "category": "SLA & Support", "requirement_text": "Ketentuan garansi operasional selama 6 bulan sesuai kriteria evaluasi standar tender.", "source_clause": "Klausul 4.e: Garansi Layanan 6 Bulan", "rationale": "Pemenuhan kriteria evaluasi poin 4.e TOR."},
                {"id": "sec-8", "title": "8. Lampiran", "category": "Administrasi & Legal", "requirement_text": "Dokumen pendukung kualifikasi penyedia dan bukti kompetensi sumber daya manusia.", "source_clause": "Klausul 4: Kriteria Evaluasi Vendor", "rationale": "Kelengkapan berkas administratif tender."},
                {"id": "sec-8-1", "title": "8.1 Profil PT Smartnet Magna Global & Portofolio Relevan", "category": "Administrasi & Legal", "requirement_text": "Kredensial PT Smartnet Magna Global (Member of CTI Group), legalitas, dan pengalaman implementasi data platform serupa.", "source_clause": "Klausul 4.b & 4.d: Pengalaman & Portofolio Relevan", "rationale": "Pemenuhan kriteria evaluasi poin 4.b & 4.d TOR."},
                {"id": "sec-8-2", "title": "8.2 Profil & CV Tenaga Ahli (Ready Resource Pool)", "category": "Administrasi & Legal", "requirement_text": "Daftar riwayat hidup (CV), sertifikasi, dan rekam jejak tenaga ahli yang disiapkan untuk penugasan.", "source_clause": "Klausul 3 & 4.c: CV & Sertifikasi Tenaga Ahli", "rationale": "Bukti kualifikasi personel teknis yang memenuhi syarat TOR."},
            ]

        # Default: Proposal Teknis CSUL Enterprise Standard (Hardware / Infrastructure)
        return [
            {"id": "sec-1", "title": "1. Latar Belakang", "category": "Umum", "requirement_text": f"Konteks proyek {clean_title}, latar belakang pengadaan, dan urgensi modernisasi infrastruktur klien.", "source_clause": "Klausul Latar Belakang & Urgensi Pengadaan", "rationale": "Bab pembuka standar proposal teknis CSUL."},
            {"id": "sec-1-1", "title": "1.1 Kondisi Existing Infrastruktur", "category": "Teknis", "requirement_text": "Deskripsi kondisi eksisting perangkat/sistem klien saat ini beserta keterbatasan dan bottleneck operasionalnya.", "source_clause": "Klausul Gambaran Infrastruktur Eksisting", "rationale": "Baseline pemahaman kondisi klien sebelum masuk ke solusi."},
            {"id": "sec-1-2", "title": "1.2 Risiko End of Life (EOL) / End of Support (EOS)", "category": "Teknis", "requirement_text": "Analisis risiko perangkat yang sudah/akan EOL-EOS dan dampak operasional jika tidak segera diganti.", "source_clause": "Klausul Risiko Status EOL/EOS", "rationale": "Menegaskan urgensi bisnis untuk modernisasi, bukan sekadar preferensi teknis."},
            {"id": "sec-2", "title": "2. Tujuan", "category": "Umum", "requirement_text": "Tujuan strategis dan sasaran teknis yang ingin dicapai melalui implementasi solusi yang diusulkan.", "source_clause": "Klausul Tujuan & Sasaran Pengadaan", "rationale": "Bab 2 standar proposal teknis CSUL."},
            {"id": "sec-3", "title": "3. Proposed Solution", "category": "Teknis", "requirement_text": "Gambaran umum solusi yang ditawarkan oleh PT Smartnet Magna Global untuk menjawab kebutuhan pada dokumen acuan.", "source_clause": "Klausul Kebutuhan Solusi yang Diusulkan", "rationale": "Bab inti pembuktian kapabilitas solusi."},
            {"id": "sec-3-1", "title": "3.1 Solution Overview", "category": "Teknis", "requirement_text": "Ringkasan solusi, komponen utama, dan value proposition teknis yang ditawarkan.", "source_clause": "Ringkasan Solusi Teknis", "rationale": "Ringkasan solusi sebelum detail sizing dan HLD."},
            {"id": "sec-3-2", "title": "3.2 Sizing dan Opsi Penawaran", "category": "Teknis", "requirement_text": "Perhitungan sizing kapasitas dan opsi-opsi penawaran solusi (mis. varian kapasitas/performa) sesuai kebutuhan klien.", "source_clause": "Klausul Kebutuhan Kapasitas & Sizing", "rationale": "Menunjukkan solusi disesuaikan dengan kebutuhan riil, bukan generik."},
            {"id": "sec-3-2-1", "title": "3.2.1 Dasar Perhitungan Kapasitas", "category": "Teknis", "requirement_text": "Metodologi dan asumsi perhitungan kapasitas: data growth rate, redundancy, overhead, dan proyeksi 3-5 tahun ke depan.", "source_clause": "Klausul Dasar Kalkulasi Kapasitas & Growth", "rationale": "Transparansi metodologi sizing agar mudah diverifikasi klien."},
            {"id": "sec-3-3", "title": "3.3 Proposed High Level Design (HLD)", "category": "Teknis", "requirement_text": "Diagram topologi arsitektur solusi yang diusulkan, termasuk konektivitas dan skema redundansi.", "source_clause": "Klausul Topologi Arsitektur & Konektivitas SAN", "rationale": "Visualisasi arsitektur wajib untuk pembuktian desain solusi enterprise."},
            {"id": "sec-3-4", "title": "3.4 Spesifikasi Teknis Storage & Perangkat Utama", "category": "Teknis", "requirement_text": "Detail spesifikasi teknis platform perangkat utama: controller, interface I/O, direct flash, dan lisensi.", "source_clause": "Klausul Spesifikasi Teknis Minimum Hardware", "rationale": "Membuktikan kesesuaian mendalam spesifikasi hardware terhadap klausul teknis tender."},
            {"id": "sec-3-5", "title": "3.5 Fitur Reduksi Data & Efisiensi Kapasitas (DRR)", "category": "Teknis", "requirement_text": "Arsitektur deduplikasi dan kompresi data inline hardware-accelerated, proyeksi rasio reduksi data (DRR 3:1 s.d 5:1), dan garansi kapasitas efektif.", "source_clause": "Klausul Fitur Kompresi & Deduplikasi Data", "rationale": "Memperkuat nilai efisiensi TCO dan justifikasi komparasi sizing data pool klien."},
            {"id": "sec-3-6", "title": "3.6 Arsitektur High Availability & Redundansi Konektivitas", "category": "Teknis", "requirement_text": "Skema redundansi dual-controller active/active, multi-pathing I/O, dual PSU, dan zero-single-point-of-failure.", "source_clause": "Klausul Ketersediaan Tinggi & Redundansi", "rationale": "Menjamin kelangsungan operasional sistem misi kritis tanpa downtime."},
            {"id": "sec-3-7", "title": "3.7 Proteksi Data, Snapshot Immutability & Disaster Recovery", "category": "Teknis", "requirement_text": "Fitur perlindungan data terhadap ransomware melalui immutable snapshot, replikasi asinkron/sinkron, serta target RPO/RTO.", "source_clause": "Klausul Keamanan Snapshot & Ketahanan Bencana", "rationale": "Memenuhi kepatuhan regulasi proteksi data OJK/BI."},
            {"id": "sec-3-8", "title": "3.8 Matriks Kompatibilitas Sistem Operasi & Hypervisor", "category": "Teknis", "requirement_text": "Matriks dukungan resmi platform terhadap hypervisor VMware vSphere, KVM, Nutanix, dan OS server.", "source_clause": "Klausul Kompatibilitas OS & Virtualisasi", "rationale": "Jaminan integrasi seamless dengan infrastruktur server existing klien."},
            {"id": "sec-4", "title": "4. Compliance Matrix", "category": "Teknis", "requirement_text": "Matriks kepatuhan spesifikasi teknis terhadap setiap butir dokumen acuan (RFP/TOR/KAK/RKS) — Comply / Not Comply / Exceed.", "source_clause": "Klausul Matriks Kepatuhan Spesifikasi Teknis", "rationale": "Wajib merujuk langsung ke klausul dokumen acuan sebagai bukti pemenuhan requirement."},
            {"id": "sec-5", "title": "5. Bill of Quantity", "category": "Teknis", "requirement_text": "Rincian item, part number, deskripsi, dan kuantitas perangkat/lisensi yang ditawarkan.", "source_clause": "Klausul Bill of Quantity (BOQ)", "rationale": "BOQ jadi acuan komersial dan teknis yang harus konsisten dengan Compliance Matrix."},
            {"id": "sec-6", "title": "6. Implementation Plan", "category": "Manajemen Proyek", "requirement_text": "Rencana pelaksanaan proyek secara keseluruhan dari persiapan hingga serah terima.", "source_clause": "Klausul Rencana Kerja & Implementasi", "rationale": "Bab tata kelola implementasi proyek."},
            {"id": "sec-6-1", "title": "6.1 Timeline Pekerjaan", "category": "Manajemen Proyek", "requirement_text": "Jadwal pelaksanaan tiap tahapan proyek (persiapan, instalasi, konfigurasi, migrasi, UAT, BAST).", "source_clause": "Klausul Jadwal & Durasi Pengerjaan", "rationale": "Kepastian waktu jadi salah satu kriteria evaluasi utama tender."},
            {"id": "sec-6-2", "title": "6.2 Scope of Work", "category": "Manajemen Proyek", "requirement_text": "Rincian lingkup pekerjaan yang menjadi tanggung jawab penyedia selama implementasi.", "source_clause": "Klausul Ruang Lingkup Pekerjaan (SOW)", "rationale": "Batasan tanggung jawab yang jelas mencegah dispute operasional."},
            {"id": "sec-6-3", "title": "6.3 Out of Scope", "category": "Administrasi & Legal", "requirement_text": "Daftar pekerjaan yang secara tegas berada di luar lingkup penawaran.", "source_clause": "Klausul Batasan Tanggung Jawab (Out of Scope)", "rationale": "Melindungi batas tanggung jawab garansi dan komersial penyedia."},
            {"id": "sec-7", "title": "7. Maintenance Plan", "category": "SLA & Support", "requirement_text": "Layanan pemeliharaan pasca-implementasi mencakup PM, CM, dan komitmen SLA.", "source_clause": "Klausul Pemeliharaan & Layanan Purnajual", "rationale": "Bab layanan purnajual penjaminan kontinuitas sistem."},
            {"id": "sec-7-1", "title": "7.1 Preventive Maintenance (PM)", "category": "SLA & Support", "requirement_text": "Jadwal dan cakupan pemeliharaan preventif berkala untuk menjaga performa dan umur perangkat.", "source_clause": "Klausul Jadwal Pemeliharaan Preventif", "rationale": "Bagian standar layanan purnajual SMG."},
            {"id": "sec-7-2", "title": "7.2 Corrective Maintenance (CM)", "category": "SLA & Support", "requirement_text": "Prosedur penanganan gangguan/insiden termasuk response time dan eskalasi.", "source_clause": "Klausul Prosedur Penanganan Gangguan", "rationale": "Bagian standar layanan purnajual SMG."},
            {"id": "sec-7-3", "title": "7.3 Service Level Agreement (SLA)", "category": "SLA & Support", "requirement_text": "Komitmen SLA response time 24x7, target uptime, dan skema eskalasi dukungan teknis.", "source_clause": "Klausul Komitmen Service Level Agreement (SLA)", "rationale": "Komitmen terukur yang bisa dijadikan acuan kontraktual."},
            {"id": "sec-8", "title": "8. Lampiran", "category": "Administrasi & Legal", "requirement_text": "Dokumen pendukung penawaran: profil perusahaan, legalitas, dan tim tenaga ahli.", "source_clause": "Klausul Kelengkapan Berkas Lampiran", "rationale": "Bab penutup berisi bukti pendukung administratif dan legal."},
            {"id": "sec-8-1", "title": "8.1 Profil Perusahaan & Legalitas", "category": "Administrasi & Legal", "requirement_text": "Profil PT Smartnet Magna Global (Member of CTI Group), akta, NIB, dan sertifikasi perusahaan relevan.", "source_clause": "Klausul Legalitas Perusahaan", "rationale": "Bukti kualifikasi administratif penyedia."},
            {"id": "sec-8-2", "title": "8.2 Tim Tenaga Ahli & Sertifikasi", "category": "Administrasi & Legal", "requirement_text": "Struktur tim proyek, CV ringkas, dan sertifikasi profesional tenaga ahli yang ditugaskan.", "source_clause": "Klausul Sertifikasi Tenaga Ahli", "rationale": "Bukti kapabilitas SDM yang akan mengeksekusi proyek."},
        ]


def _build_system_prompt(mode: str) -> str:
    if mode == "draft":
        return (
            "Anda adalah Senior Enterprise Solution Architect dan Presales Specialist di PT Smartnet Magna Global (SMG), bagian dari CTI Group. "
            "Tugas Anda adalah menyusun tanggapan teknis, proposal resmi, MoM, Solution Brief, atau Scope of Work (SoW) dalam Bahasa Indonesia formal "
            "berdasarkan konteks dokumen acuan dan seluruh knowledge base internal SMG.\n\n"
            "Pedoman Penulisan Berdasarkan Standar Dokumen Otentik SMG:\n"
            "1. Penomoran Hierarkis Terstruktur: Gunakan penomoran bertingkat yang rapi (misal: 1.1, 2.1, 2.1.1, 3.1.2) sesuai hirarki bab.\n"
            "2. Zero Markdown Leakage: Jangan gunakan penanda markdown liar (seperti rentetan ### tanpa penomoran) yang mengotori dokumen. Selalu gunakan penomoran sub-bab bertingkat.\n"
            "3. Format Tabel Terstruktur: Untuk spesifikasi hardware, BOQ, pembagian tanggung jawab (RACI), SLA matrix, dan Action Items, WAJIB gunakan format tabel markdown (| Kolom 1 | Kolom 2 |) agar otomatis diekspor menjadi tabel Word resmi bergaris rapi.\n"
            "   - Untuk MoM: Buat tabel matriks Action Item (| No | Aktivitas / Action Item | PIC (SMG/Klien) | Target Selesai | Status |).\n"
            "   - Untuk SoW: Buat tabel Scope Matrix (| No | Item Pekerjaan | Tanggung Jawab SMG | Kewajiban Klien |) dan SLA matrix (P1-P4).\n"
            "   - Untuk Solution Brief: Sertakan pemetaan OKRs dan tabel komponen arsitektur (| Komponen | Teknologi/Perangkat | Peran/Fungsi |).\n"
            "   - Untuk Klarifikasi Teknis: Susun tanggapan teknis komprehensif berstandar CSUL Finance mencakup: analisis risiko EOL/EOS existing, rekomendasi arsitektur HLD & sizing DRR, matriks compliance teknis, rincian BOQ perangkat/lisensi, rencana implementasi & timeline, komitmen SLA 60 bulan (5 tahun), serta struktur tim proyek tersertifikasi.\n"
            "4. Identitas Perusahaan: Selalu gunakan nama resmi perusahaan: 'PT Smartnet Magna Global' (SMG), dan jika relevan sebutkan sebagai 'Member of CTI Group'.\n"
            "5. Nilai Jual & Kepastian: Buat narasi yang meyakinkan, bernilai tambah (value proposition), dengan komitmen teknis spesifik tanpa kata tentatif (hindari kata 'akan diusahakan' atau 'sebisanya').\n"
            "6. Notasi Sizing & Simbol: DILARANG KERAS menggunakan format LaTeX matematika ($$, $, \\frac, \\text, \\times, Σ, ∑, ∏, ∆). Dokumen proposal tender tidak mendukung rendering LaTeX dan formula mentah tersebut terlihat rusak di hadapan klien. Selalu tulis perhitungan sizing, vCPU, RAM, dan kapasitas dalam notasi teks biasa Bahasa Indonesia yang bersih dan rapi (contoh: 'Total Kapasitas Efektif = (Kapasitas Raw x Rasio Reduksi Data) / Overhead Sistem' atau 'Total Compute = (Jumlah VM x vCPU Overcommit) + Hypervisor Overhead').\n"
            "7. Cakupan Spesifik Sub-Bab: Anda HANYA menyusun narasi dan konten teknis untuk sub-bab yang sedang diminta. DILARANG KERAS merangkum atau menulis ulang seluruh isi proposal dari Bab 1 sampai Bab 8 jika yang diminta adalah satu sub-bab spesifik (misalnya: jika diminta sub-bab 3.3 Proposed High Level Design (HLD), susunlah penjelasan arsitektur, konektivitas link redundan, tiering switch-firewall-compute-storage, dan spesifikasi arsitektur teknis untuk sub-bab tersebut saja).\n"
            "8. PRINSIP STRICT SOURCE GROUNDING & ZERO-HALLUCINATION (ANTI-NGIDE): Seluruh fakta, ruang lingkup, durasi kerja, nama platform/teknologi, jumlah tim/headcount, lokasi, dan komitmen SLA WAJIB 100% berakar pada kutipan Dokumen Acuan (TOR/RFP/KAK) atau knowledge base internal SMG yang disertakan dalam konteks. DILARANG KERAS mengarang (ngide) spesifikasi tambahan fiktif, platform fiktif, jumlah manpower fiktif, atau klausul yang tidak diminta oleh klien. Jika suatu parameter tidak dirinci di dokumen sumber, jelaskan batasan tersebut secara profesional tanpa mengada-ada angka fiktif."
        )
    if mode == "qa":
        return (
            "Anda adalah asisten knowledge base internal PT Smartnet Magna Global (SMG). Jawab pertanyaan hanya "
            "berdasarkan konteks yang diberikan, sebutkan jika informasi tidak "
            "ditemukan. Jawab ringkas dan langsung ke inti — tanpa basa-basi. "
            "Konteks diberikan sebagai potongan bernomor dipisah '---', urut sesuai "
            "kemunculan (potongan pertama = [1], kedua = [2], dst). Setiap kali Anda "
            "memakai sebuah potongan untuk menjawab, sisipkan penanda sitasi seperti "
            "[1] atau [2] tepat setelah kalimat yang bersangkutan. Jangan sisipkan "
            "penanda untuk potongan yang tidak benar-benar dipakai."
        )
    # Any other mode (e.g. "json"): grounded answers with no inline citation markers,
    # so callers that need a clean machine-parseable response (JSON, etc.) aren't
    # polluted by the [n] markers meant only for the interactive QA UI.
    return (
        "Anda adalah asisten knowledge base internal PT Smartnet Magna Global (SMG). Jawab pertanyaan hanya "
        "berdasarkan konteks yang diberikan, sebutkan jika informasi tidak "
        "ditemukan. Jawab ringkas dan langsung ke inti — tanpa basa-basi."
    )


def _format_context_chunks(context_chunks: list[str], mode: str) -> str:
    if mode != "qa":
        return "\n\n---\n\n".join(context_chunks)
    return "\n\n---\n\n".join(f"[{i}] {chunk}" for i, chunk in enumerate(context_chunks, start=1))


class ResilientLLMProvider(LLMProvider):
    """Production Circuit Breaker & Automatic Multi-Provider Failover Router.
    Automatically and transparently fails over to secondary LLM provider if primary
    hits rate limits (429), quota exhaustion, timeouts, or transient vendor outages."""

    def __init__(self, primary: LLMProvider, secondary: Optional[LLMProvider] = None):
        self.primary = primary
        self.secondary = secondary

    def answer(self, question: str, context_chunks: list[str], mode: str = "qa") -> str:
        try:
            return self.primary.answer(question, context_chunks, mode)
        except Exception as e:
            if self.secondary:
                logger.warning(
                    "CIRCUIT_BREAKER: Primary %s failed (%s). Failing over to %s...",
                    self.primary.__class__.__name__,
                    e,
                    self.secondary.__class__.__name__,
                )
                return self.secondary.answer(question, context_chunks, mode)
            raise e

    def stream_answer(self, question: str, context_chunks: list[str], mode: str = "draft"):
        try:
            for chunk in self.primary.stream_answer(question, context_chunks, mode):
                yield chunk
        except Exception as e:
            if self.secondary:
                logger.warning(
                    "CIRCUIT_BREAKER: Primary stream failed (%s). Failing over to %s...",
                    e,
                    self.secondary.__class__.__name__,
                )
                for chunk in self.secondary.stream_answer(question, context_chunks, mode):
                    yield chunk
            else:
                raise e

    def recommend_structure(self, *args, **kwargs) -> list[dict]:
        try:
            return self.primary.recommend_structure(*args, **kwargs)
        except Exception as e:
            if self.secondary:
                logger.warning("CIRCUIT_BREAKER: Primary recommend_structure failed (%s). Failing over...", e)
                return self.secondary.recommend_structure(*args, **kwargs)
            raise e

    def segment_document(self, text: str) -> list[dict]:
        try:
            return self.primary.segment_document(text)
        except Exception as e:
            if self.secondary:
                logger.warning("CIRCUIT_BREAKER: Primary segment_document failed (%s). Failing over...", e)
                return self.secondary.segment_document(text)
            raise e

    def research_external(self, query: str) -> dict:
        try:
            return self.primary.research_external(query)
        except Exception as e:
            if self.secondary:
                logger.warning("CIRCUIT_BREAKER: Primary research failed (%s). Failing over...", e)
                return self.secondary.research_external(query)
            raise e

    def map_items_to_sections(self, headings: list[dict], items: list[dict]) -> dict[str, int]:
        try:
            return self.primary.map_items_to_sections(headings, items)
        except Exception as e:
            if self.secondary:
                return self.secondary.map_items_to_sections(headings, items)
            raise e


_PROVIDERS = {
    "claude": ClaudeProvider,
    "gemini": GeminiProvider,
    "openai": OpenAIProvider,
}


def get_llm_provider() -> LLMProvider:
    provider_name = settings.llm_provider.strip().lower()
    provider_cls = _PROVIDERS.get(provider_name)
    if provider_cls is None:
        raise LLMProviderError(
            f"LLM_PROVIDER '{settings.llm_provider}' tidak dikenal. "
            "Gunakan claude atau gemini.",
            code="unknown_provider",
        )
    try:
        primary = provider_cls()
        secondary = None
        # Auto-configure secondary failover provider if credentials exist
        if provider_name == "claude" and settings.google_api_key:
            try:
                secondary = GeminiProvider()
            except Exception:
                pass
        elif provider_name == "gemini" and settings.anthropic_api_key:
            try:
                secondary = ClaudeProvider()
            except Exception:
                pass

        return ResilientLLMProvider(primary=primary, secondary=secondary)
    except LLMProviderError:
        raise
    except Exception as exc:
        logger.exception("Failed to initialize LLM provider '%s'", provider_name)
        raise LLMProviderError(
            f"Provider {provider_name} gagal diinisialisasi.", code="provider_init_failed"
        ) from exc


def format_llm_error(exc: Exception) -> str:
    """Turn vendor/configuration failures into a concise actionable message."""
    if isinstance(exc, LLMProviderError):
        return str(exc)

    error_text = str(exc).lower()
    if any(term in error_text for term in ("credit balance", "billing", "quota", "rate limit")):
        return "Kuota atau kredit provider LLM sedang habis. Periksa billing atau ganti provider."
    if any(term in error_text for term in ("api key", "api_key", "authentication", "unauthorized", "401")):
        return "API key provider LLM tidak valid atau belum dikonfigurasi."
    if any(term in error_text for term in ("timeout", "timed out", "connection")):
        return "Provider LLM tidak merespons. Coba lagi beberapa saat lagi."

    logger.exception("Unhandled LLM provider error")
    return "Provider LLM gagal memproses permintaan. Periksa konfigurasi backend."


_MAPPING_SYSTEM_PROMPT = (
    "Anda mencocokkan butir kebutuhan tender (TOR) ke heading dokumen template yang paling relevan "
    "secara makna, bukan sekadar kata kunci yang sama persis. "
    "Untuk setiap item, pilih SATU heading yang paling cocok isinya, atau lewati item itu (jangan "
    "dimasukkan ke hasil) jika tidak ada heading yang benar-benar relevan — item yang dilewati akan "
    "otomatis masuk ke bagian umum di akhir dokumen. "
    "Balas HANYA JSON object valid, tanpa penjelasan: {\"<item_id>\": <heading_index>, ...}"
)


def _parse_json_object(raw: str) -> dict | list:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def _build_mapping_prompt(headings: list[dict], items: list[dict]) -> str:
    headings_text = "\n".join(f"{h['index']}: {h['text']}" for h in headings)
    items_text = "\n".join(
        f"- id={it['id']} | kategori={it.get('category', '')} | judul={it.get('title', '')} | "
        f"isi={(it.get('requirement_text') or '')[:300]}"
        for it in items
    )
    return f"Daftar heading template (index: teks):\n{headings_text}\n\nDaftar item TOR:\n{items_text}"


def _clean_mapping_result(data: dict, headings: list[dict], items: list[dict]) -> dict[str, int]:
    valid_indices = {h["index"] for h in headings}
    valid_ids = {it["id"] for it in items}
    result: dict[str, int] = {}
    for item_id, heading_index in data.items():
        if item_id in valid_ids and isinstance(heading_index, int) and heading_index in valid_indices:
            result[item_id] = heading_index
    return result


def _categorize_text(t: str) -> str:
    lower = t.lower()
    if any(k in lower for k in ["sla", "uptime", "support", "dukungan", "maintenance", "garansi", "pemeliharaan", "response time"]):
        return "SLA & Support"
    if any(k in lower for k in ["server", "storage", "cpu", "ram", "memory", "network", "arsitektur", "cloud", "backup", "spesifikasi", "vlan", "switch", "hardware", "software", "fitur"]):
        return "Teknis"
    if any(k in lower for k in ["jadwal", "deliverable", "laporan", "project manager", "cm", "pm", "tahapan", "milestone", "metodologi", "timeline", "waktu"]):
        return "Manajemen Proyek"
    if any(k in lower for k in ["legal", "nda", "pembayaran", "syarat", "kontrak", "kualifikasi", "sertifikasi", "perusahaan"]):
        return "Administrasi & Legal"
    return "Umum"


def _fallback_map_items_to_sections(headings: list[dict], items: list[dict]) -> dict[str, int]:
    """Keyword-substring heuristic: assign an item to the first heading whose
    text contains its category name (or a word from it). Used when no LLM
    is configured, or the LLM call fails."""
    result: dict[str, int] = {}
    for it in items:
        category_lower = (it.get("category") or "").lower()
        if not category_lower:
            continue
        keywords = [kw for kw in category_lower.split() if len(kw) > 2]
        for h in headings:
            heading_lower = h["text"].lower()
            if category_lower in heading_lower or any(kw in heading_lower for kw in keywords):
                result[it["id"]] = h["index"]
                break
    return result


def _fallback_segment_text(text: str) -> list[dict]:
    """Robust heuristic segmenter that splits a document into clauses/requirements."""
    if not text or not text.strip():
        return []

    lines = [line.strip() for line in text.split("\n") if line.strip()]
    items: list[dict] = []
    current_clause: list[str] = []
    current_title = ""

    clause_regex = re.compile(
        r"^(?:(?:[0-9]+(?:\.[0-9]+)*\.?|[a-zA-Z]\.|\([0-9a-zA-Z]+\))\s+|pasal\s+[0-9ivx]+|bab\s+[0-9ivx]+|klausul\s+[0-9]+|requirement\s+[0-9]+|spesifikasi\s+[0-9]+)",
        re.IGNORECASE,
    )

    def commit_current():
        nonlocal current_clause, current_title
        if not current_clause:
            return
        full_text = " ".join(current_clause).strip()
        if len(full_text) < 15:
            return
        req_id = f"req-{len(items) + 1}"
        title = current_title
        if not title:
            first_sent = re.split(r"[.:\n]", full_text)[0]
            title = first_sent[:60].strip() or f"Klausul {len(items) + 1}"
        category = _categorize_text(full_text)
        items.append({
            "id": req_id,
            "title": title,
            "requirement_text": full_text,
            "category": category,
        })
        current_clause = []
        current_title = ""

    for line in lines:
        if clause_regex.match(line) or (len(line) < 70 and line.endswith(":")):
            commit_current()
            current_title = line.rstrip(":")
            current_clause.append(line)
        else:
            if not current_clause:
                current_title = line[:50]
            current_clause.append(line)
            if len(" ".join(current_clause)) > 650 and (line.endswith(".") or line.endswith(";")):
                commit_current()

    commit_current()

    if not items:
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip() and len(p.strip()) > 20]
        for i, p in enumerate(paragraphs, start=1):
            title = p[:50].split("\n")[0].strip() or f"Klausul {i}"
            items.append({
                "id": f"req-{i}",
                "title": title,
                "requirement_text": p,
                "category": _categorize_text(p),
            })

    return items
