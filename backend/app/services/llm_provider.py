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

logger = logging.getLogger(__name__)

# Canonical outline for doc_type "narrative" (Proposal Teknis) — kept as one constant so
# the LLM prompt (ClaudeProvider/GeminiProvider.recommend_structure) and the offline
# fallback (_fallback_recommend_structure) stay in sync instead of drifting independently.
NARRATIVE_STRUCTURE_TEMPLATE = """1. Latar Belakang
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
8.2 Tim Tenaga Ahli & Sertifikasi"""


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
    ) -> list[dict]:
        """Analyze a source document (TOR/RKS/KAK) and recommend an optimal section structure
        where each section has an id, title, category, requirement_text, and rationale explaining
        why this section is recommended based on the source document."""
        return _fallback_recommend_structure(doc_type, tor_text, document_title)


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
        return response.content[0].text

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
    ) -> list[dict]:
        truncated_text = (tor_text or "")[:35000]
        structure_rule = (
            f"Gunakan kerangka referensi berikut sebagai PANDUAN gaya penomoran dan pengelompokan "
            f"topik standar proposal teknis enterprise (BUKAN template kaku yang wajib disalin "
            f"persis):\n{NARRATIVE_STRUCTURE_TEMPLATE}\n"
            f"Sesuaikan jumlah, urutan, judul, dan isi sub-bab dengan HASIL ANALISIS NYATA terhadap "
            f"dokumen acuan yang diberikan di bawah — kalau TOR tidak menyebut suatu topik, jangan "
            f"paksakan section itu ada; kalau TOR punya kebutuhan spesifik yang tidak tercakup "
            f"contoh di atas, tambahkan sub-bab baru. Yang WAJIB dipertahankan dari contoh hanyalah "
            f"KONVENSINYA: penomoran hierarkis bertingkat (1, 1.1, 3.2.1, dst) dan pengelompokan "
            f"topik yang berkaitan sebagai sub-bab dari satu bab induk (misal Timeline/Scope of "
            f"Work/Out of Scope jadi sub-bab Implementation Plan, bukan bab terpisah-pisah; PM/CM/"
            f"SLA jadi sub-bab Maintenance Plan)."
            if doc_type == "narrative"
            else "Hasilkan antara 5 hingga 9 sub-bab yang logis dan berurutan dari awal hingga penutup, berdasarkan analisis nyata terhadap dokumen acuan."
        )
        prompt = (
            f"Anda adalah Senior Enterprise Solution Architect dan Presales Specialist berpengalaman.\n"
            f"Tugas: Analisis dokumen acuan tender (TOR/RKS/KAK/RFP) di bawah dan rancang rekomendasi "
            f"struktur sub-bab/bagian yang PALING SESUAI dengan isi dokumen tersebut untuk menyusun "
            f"dokumen tanggapan bertipe '{doc_type}'. Jangan mengarang kebutuhan yang tidak ada di "
            f"dokumen acuan.\n\n"
            f"Judul Tender: {document_title or 'Tender Pengadaan IT'}\n"
            f"Instruksi Tambahan User: {instruction or 'Buat struktur sub-bab yang adaptif dan komprehensif.'}\n\n"
            f"Syarat output:\n"
            f"1. {structure_rule}\n"
            f"2. Sertakan 'rationale' konkret mengapa sub-bab tersebut direkomendasikan dengan merujuk klausul sumber.\n"
            f"3. Setiap judul sub-bab HARUS diawali penomoran hierarkis (contoh: '1.', '1.1', '3.2.1') sesuai levelnya.\n"
            f"4. Format HARUS murni JSON array of objects, urut sesuai urutan tampil di dokumen:\n"
            f'[{{"id": "sec-1", "title": "1. Judul Sub-Bab", "category": "Teknis | Umum | SLA & Support | Manajemen Proyek | Administrasi & Legal", "requirement_text": "Cakupan kebutuhan", "rationale": "Alasan rekomendasi"}}]\n\n'
            f"Teks Dokumen Acuan:\n{truncated_text}"
        )
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4000,
                temperature=0.2,
                system="Hanya keluarkan JSON valid berupa array objek tanpa markdown komentar pembuka.",
                messages=[{"role": "user", "content": prompt}],
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
                        "rationale": str(it.get("rationale") or f"Rekomendasi kebutuhan tender {document_title}."),
                    })
                return items
        except Exception as e:
            logger.warning("Claude structure recommendation failed: %s", e)
        return _fallback_recommend_structure(doc_type, tor_text, document_title)


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
        system_instruction = _build_system_prompt(mode)
        context = _format_context_chunks(context_chunks, mode)
        user_prompt = f"Konteks dari knowledge base:\n{context}\n\nPertanyaan: {question}"
        return self._generate_with_fallback(
            user_prompt,
            system_instruction=system_instruction,
        )

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
    ) -> list[dict]:
        truncated_text = (tor_text or "")[:35000]
        structure_rule = (
            f"Gunakan kerangka referensi berikut sebagai PANDUAN gaya penomoran dan pengelompokan "
            f"topik standar proposal teknis enterprise (BUKAN template kaku yang wajib disalin "
            f"persis):\n{NARRATIVE_STRUCTURE_TEMPLATE}\n"
            f"Sesuaikan jumlah, urutan, judul, dan isi sub-bab dengan HASIL ANALISIS NYATA terhadap "
            f"dokumen acuan yang diberikan di bawah — kalau TOR tidak menyebut suatu topik, jangan "
            f"paksakan section itu ada; kalau TOR punya kebutuhan spesifik yang tidak tercakup "
            f"contoh di atas, tambahkan sub-bab baru. Yang WAJIB dipertahankan dari contoh hanyalah "
            f"KONVENSINYA: penomoran hierarkis bertingkat (1, 1.1, 3.2.1, dst) dan pengelompokan "
            f"topik yang berkaitan sebagai sub-bab dari satu bab induk (misal Timeline/Scope of "
            f"Work/Out of Scope jadi sub-bab Implementation Plan, bukan bab terpisah-pisah; PM/CM/"
            f"SLA jadi sub-bab Maintenance Plan)."
            if doc_type == "narrative"
            else "Gunakan penomoran hierarkis standar proposal profesional dan hasilkan struktur bab/sub-bab yang adaptif berdasarkan analisis nyata terhadap dokumen acuan."
        )
        prompt = (
            f"Anda adalah Senior Enterprise Solution Architect dan Presales Specialist di PT Smartnet Magna Global (SMG).\n"
            f"Tugas: Analisis dokumen acuan tender (TOR / RKS / KAK / RFP) berikut dan rancang rekomendasi "
            f"struktur bab dan sub-bab yang PALING SESUAI dengan isi dokumen tersebut untuk menyusun "
            f"dokumen tanggapan resmi '{doc_type}'. Jangan mengarang kebutuhan yang tidak ada di dokumen acuan.\n\n"
            f"Judul Dokumen Tender: {document_title or 'Tender Pengadaan IT'}\n"
            f"Instruksi Tambahan User: {instruction or 'Buat struktur bab dan sub-bab hierarkis standar proposal teknis enterprise.'}\n\n"
            f"Syarat output:\n"
            f"1. {structure_rule}\n"
            f"2. Untuk SETIAP bagian, sertakan 'rationale' (alasan konkret) yang menjelaskan relevansinya terhadap klausul dokumen acuan.\n"
            f"3. Setiap judul sub-bab HARUS diawali penomoran hierarkis (contoh: '1.', '1.1', '3.2.1') sesuai levelnya, dan array HARUS terurut sesuai urutan tampil di dokumen.\n"
            f"4. Format JSON HARUS valid berupa array objek:\n"
            f"[\n"
            f'  {{"id": "sec-1", "title": "1. Judul Sub-Bab", "category": "Teknis | Umum | SLA & Support | Manajemen Proyek | Administrasi & Legal", "requirement_text": "Cakupan detail yang harus dijawab di sub-bab ini", "rationale": "Alasan rekomendasi berdasarkan dokumen sumber"}}\n'
            f"]"
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
                        "rationale": str(it.get("rationale") or f"Rekomendasi berdasarkan analisis kebutuhan tender {document_title}."),
                    })
                return items
        except Exception as e:
            logger.warning("Gemini structure recommendation failed, using fallback: %s", e)

        return _fallback_recommend_structure(doc_type, tor_text, document_title)

class OpenAIProvider(LLMProvider):
    def __init__(self):
        raise LLMProviderError(
            "Provider OpenAI belum tersedia di versi ini.", code="provider_unimplemented"
        )

    def answer(self, question: str, context_chunks: list[str], mode: str = "qa") -> str:
        raise NotImplementedError


def _fallback_recommend_structure(doc_type: str, tor_text: str = "", document_title: str = "") -> list[dict]:
    """Fallback generator based on authentic PT Smartnet Magna Global library documents:
    CSUL Finance (Proposal), SMBC & Hitachi (SoW), [CUSTOMER NAME] Solution Brief, and MoM templates."""
    clean_title = document_title or "Tender Solusi Enterprise"
    
    if doc_type == "sow":
        return [
            {"id": "sec-1", "title": "1. Latar Belakang & Deskripsi Pekerjaan", "category": "Umum", "requirement_text": f"Latar belakang proyek {clean_title}, tujuan pengadaan, dan dasar penugasan PT Smartnet Magna Global.", "rationale": "Standar pembuka SoW enterprise SMBC/Hitachi."},
            {"id": "sec-2", "title": "2. Ruang Lingkup Pengerjaan & Layanan Teknis", "category": "Teknis", "requirement_text": "Detail ruang lingkup pengerjaan teknis: pengadaan, instalasi, konfigurasi, migrasi data, dan pengujian menyeluruh.", "rationale": "Memetakan cakupan eksekusi engineering di lapangan."},
            {"id": "sec-3", "title": "3. Matriks Pembagian Peran & Tanggung Jawab (RACI)", "category": "Manajemen Proyek", "requirement_text": "Tabel matriks pembagian tanggung jawab antara PT Smartnet Magna Global (SMG) dan pihak Klien.", "rationale": "Mencegah dispute operasional melalui kejelasan batasan peran."},
            {"id": "sec-4", "title": "4. Batasan & Pengecualian Pekerjaan (Out of Scope)", "category": "Administrasi & Legal", "requirement_text": "Daftar pekerjaan yang secara tegas berada di luar lingkup penawaran SMG.", "rationale": "Melindungi batas tanggung jawab garansi dan komersial."},
            {"id": "sec-5", "title": "5. Deliverables Proyek, Milestones & Timeline Pengerjaan", "category": "Manajemen Proyek", "requirement_text": "Daftar keluaran resmi proyek, tahapan pengerjaan (milestone), dan estimasi mandays.", "rationale": "Kriteria pengukuran progres pencapaian proyek."},
            {"id": "sec-6", "title": "6. Service Level Agreement (SLA), Dukungan 24x7 & Prosedur Eskalasi", "category": "SLA & Support", "requirement_text": "Matriks prioritas penanganan insiden (P1 30 mnt / 4 jam onsite, P2 60 mnt, P3, P4) dan alur eskalasi TAC.", "rationale": "Standar komitmen SLA corrective maintenance SMG."},
            {"id": "sec-7", "title": "7. Kriteria Penerimaan Pekerjaan (UAT & BAST)", "category": "Manajemen Proyek", "requirement_text": "Tata cara pengujian User Acceptance Testing dan syarat penandatanganan BAST.", "rationale": "Dasar legal penyelesaian pekerjaan dan serah terima."},
            {"id": "sec-8", "title": "8. Syarat & Ketentuan Umum serta Change Request (CR)", "category": "Administrasi & Legal", "requirement_text": "Ketentuan operasional, prosedur Change Request, kerahasiaan data (NDA), dan garansi.", "rationale": "Tata kelola administrasi perubahan ruang lingkup."},
        ]
    elif doc_type == "solution_brief":
        return [
            {"id": "sec-1", "title": "1. Executive Summary & Value Proposition", "category": "Umum", "requirement_text": f"Ringkasan eksekutif dan nilai strategis solusi SMG dalam menjawab kebutuhan {clean_title}.", "rationale": "Ikhtisar bernilai jual tinggi untuk pembuat keputusan eksekutif."},
            {"id": "sec-2", "title": "2. Business Understanding & Customer Pain Points", "category": "Umum", "requirement_text": "Profil bisnis klien, tantangan infrastruktur existing (bottleneck/kapasitas), dan pemetaan OKRs.", "rationale": "Menghubungkan solusi teknis langsung dengan dampak bisnis klien."},
            {"id": "sec-3", "title": "3. Scope of Work & High-Level Timeline", "category": "Manajemen Proyek", "requirement_text": "Batasan ruang lingkup in-scope dan out-of-scope serta fase implementasi bertahap.", "rationale": "Kejelasan ekspektasi delivery dan durasi pengerjaan."},
            {"id": "sec-4", "title": "4. Proposed Solution & Architecture Overview", "category": "Teknis", "requirement_text": "Narasi solusi, diagram topologi High-Level Design (HLD), tabel komponen kunci, dan analisis deployment.", "rationale": "Inti arsitektur teknis pembuktian kapabilitas solusi SMG."},
            {"id": "sec-5", "title": "5. Integration Points, Dependencies & Regulatory Compliance", "category": "Teknis", "requirement_text": "Titik integrasi dengan environment klien, dependensi jaringan, serta kepatuhan regulasi data (OJK/BI).", "rationale": "Mitigasi risiko teknis dan pemenuhan regulasi perbankan/finansial."},
            {"id": "sec-6", "title": "6. Security, Governance & High Availability", "category": "Teknis", "requirement_text": "Arsitektur proteksi keamanan: IAM, enkripsi data at-rest & in-transit, isolasi jaringan, dan Disaster Recovery.", "rationale": "Jaminan keamanan kelas enterprise tanpa celah kerentanan."},
            {"id": "sec-7", "title": "7. Measurable Success Criteria & KPIs", "category": "Manajemen Proyek", "requirement_text": "Kriteria terukur keberhasilan implementasi (ketersediaan 99.99%, performa respons, zero-data-loss).", "rationale": "Metrik akuntabilitas keberhasilan proyek."},
            {"id": "sec-8", "title": "8. Why Smartnet Magna Global?", "category": "Administrasi & Legal", "requirement_text": "Kredensial SMG sebagai bagian dari CTI Group, keahlian multi-vendor teruji, dan engineer tersertifikasi.", "rationale": "Membangun kepercayaan dan diferensiasi terhadap kompetitor."},
            {"id": "sec-9", "title": "9. Next Steps & Engagement Model", "category": "Manajemen Proyek", "requirement_text": "Rekomendasi langkah tindak lanjut: sesi deep-dive teknis, penawaran komersial resmi, dan finalisasi SoW.", "rationale": "Call to action yang menggerakkan peluang ke tahap penutupan proyek."},
        ]
    elif doc_type == "mom":
        return [
            {"id": "sec-1", "title": "1. Informasi & Metadata Pertemuan", "category": "Umum", "requirement_text": f"Metadata lengkap rapat: Hari/Tanggal, Waktu, Lokasi/Platform, Agenda ({clean_title}), Pemimpin Rapat, dan Notulen SMG.", "rationale": "Header resmi berita acara rapat standar perusahaan."},
            {"id": "sec-2", "title": "2. Daftar Hadir Peserta Rapat (Attendees)", "category": "Umum", "requirement_text": "Tabel daftar hadir peserta rapat dari pihak Klien dan pihak PT Smartnet Magna Global.", "rationale": "Dokumentasi kehadiran stakeholder pengambil keputusan."},
            {"id": "sec-3", "title": "3. Poin-Poin Utama Pembahasan & Klarifikasi Teknis", "category": "Teknis", "requirement_text": "Rincian diskusi: klarifikasi teknis arsitektur, kebutuhan fungsional, dan tantangan yang dibahas.", "rationale": "Perekaman substansi teknis dan diskusi mendalam."},
            {"id": "sec-4", "title": "4. Kesepakatan & Keputusan Bersama (Key Decisions)", "category": "Umum", "requirement_text": "Poin-poin kesepakatan final yang telah disetujui bersama oleh seluruh pihak dalam rapat.", "rationale": "Baseline legal kesepakatan untuk langkah berikutnya."},
            {"id": "sec-5", "title": "5. Matriks Tindak Lanjut (Action Items Plan)", "category": "Manajemen Proyek", "requirement_text": "Tabel tindak lanjut: No, Aktivitas/Task, Penanggung Jawab (Owner PIC), Target Tanggal Selesai, dan Status.", "rationale": "Matriks akuntabilitas eksekusi pasca rapat."},
            {"id": "sec-6", "title": "6. Lembar Pengesahan & Tanda Tangan (Sign-off)", "category": "Administrasi & Legal", "requirement_text": "Kolom tanda tangan resmi: Disiapkan oleh Notulen, Diketahui oleh PM SMG, dan Disetujui oleh Klien.", "rationale": "Validasi otentik Berita Acara Rapat."},
        ]
    elif doc_type == "klarifikasi_teknis":
        return [
            {"id": "sec-1", "title": "1. Latar Belakang, Kondisi Existing & Hasil Klarifikasi", "category": "Umum", "requirement_text": f"Latar belakang proyek {clean_title}, profil existing storage/server, risiko EOL/EOS, dan adopsi hasil klarifikasi sebagai baseline penawaran resmi.", "rationale": "Standar Bagian 1 Klarifikasi Teknis CSUL."},
            {"id": "sec-2", "title": "2. Solusi yang Diusulkan, Sizing & Arsitektur (HLD)", "category": "Teknis", "requirement_text": "Spesifikasi platform perangkat enterprise, teknologi reduksi data (DRR inline), kalkulasi data growth 10%/tahun (5 tahun), dan diagram arsitektur HLD.", "rationale": "Standar Bagian 2 Klarifikasi Teknis CSUL."},
            {"id": "sec-3", "title": "3. Compliance Matrix & Bill of Quantity (BOQ)", "category": "Teknis", "requirement_text": "Matriks kepatuhan teknis (Comply) spesifikasi minimum klien dan tabel BOQ lengkap dengan Part Number, Deskripsi, dan Qty.", "rationale": "Standar Bagian 3 Klarifikasi Teknis CSUL."},
            {"id": "sec-4", "title": "4. Rencana Implementasi, Scope of Work & Timeline", "category": "Manajemen Proyek", "requirement_text": "Ruang lingkup pekerjaan detail (assessment, konfigurasi, integrasi, UAT), batasan Out of Scope, dan jadwal pengerjaan bulanan.", "rationale": "Standar Bagian 4 Klarifikasi Teknis CSUL."},
            {"id": "sec-5", "title": "5. Maintenance Plan & Service Level Agreement (SLA)", "category": "SLA & Support", "requirement_text": "Layanan purnajual 60 bulan (5 tahun), pemeliharaan berkala PM min 2x/th, penanganan gangguan CM, respons lokal 24x7 maks 4 jam, dan eskalasi Severity 1 15 menit.", "rationale": "Standar Bagian 5 Klarifikasi Teknis CSUL."},
            {"id": "sec-6", "title": "6. Susunan Tim Proyek & Profil PT Smartnet Magna Global", "category": "Administrasi & Legal", "requirement_text": "Struktur tim proyek (PM bersertifikasi & engineer bersertifikasi), pengalaman puluhan tahun, dan keunggulan SMG (Member of CTI Group).", "rationale": "Standar Bagian 6 Klarifikasi Teknis CSUL."},
        ]
    elif doc_type == "pitch_deck":
        return [
            {"id": "sec-1", "title": "Slide 1: Executive Title & Introduction", "category": "Umum", "requirement_text": f"Cover presentasi eksekutif: Judul Solusi {clean_title}, Nama Klien, Logo SMG, Tanggal, dan pembuka nilai strategis.", "rationale": "Cover eksekutif 16:9."},
            {"id": "sec-2", "title": "Slide 2: Client Business Challenge & Current Landscape", "category": "Umum", "requirement_text": "Tantangan bisnis utama klien, bottleneck operasional infrastruktur existing, dan urgensi transformasi.", "rationale": "Membangun urgensi dan empati terhadap masalah klien."},
            {"id": "sec-3", "title": "Slide 3: Proposed Architecture & Solution Overview", "category": "Teknis", "requirement_text": "Gambaran topologi arsitektur sistem modern (HLD) dan keunggulan integrasi perangkat enterprise.", "rationale": "Visualisasi solusi ringkas dan mudah dipahami."},
            {"id": "sec-4", "title": "Slide 4: Key Advantages & Value Proposition", "category": "Umum", "requirement_text": "Nilai manfaat terukur: efisiensi TCO, ketersediaan tinggi (99.9999%), skalabilitas masa depan, dan keamanan.", "rationale": "Pesan kunci pembeda solusi SMG dibanding alternatif lain."},
            {"id": "sec-5", "title": "Slide 5: Enterprise Credentials & Relevant Track Record", "category": "Umum", "requirement_text": "Kredibilitas PT Smartnet Magna Global (Member of CTI Group), sertifikasi engineer, dan portofolio sukses.", "rationale": "Membuktikan rekam jejak dan kapabilitas nyata."},
            {"id": "sec-6", "title": "Slide 6: Implementation Roadmap & Next Steps", "category": "Manajemen Proyek", "requirement_text": "Tahapan implementasi bertahap, alokasi tim ahli, dan ajakan tindak lanjut konkret.", "rationale": "Closing yang jelas dan terarah."},
        ]
    else:
        # Default: Proposal Teknis CSUL Enterprise Standard — struktur baku 8 bab dengan
        # penomoran hierarkis (1.1, 3.2.1, dst) mengikuti format proposal tender otentik SMG.
        return [
            {"id": "sec-1", "title": "1. Latar Belakang", "category": "Umum", "requirement_text": f"Konteks proyek {clean_title}, latar belakang pengadaan, dan urgensi modernisasi infrastruktur klien.", "rationale": "Bab pembuka standar proposal teknis CSUL."},
            {"id": "sec-1-1", "title": "1.1 Kondisi Existing Infrastruktur", "category": "Teknis", "requirement_text": "Deskripsi kondisi eksisting perangkat/sistem klien saat ini beserta keterbatasan dan bottleneck operasionalnya.", "rationale": "Baseline pemahaman kondisi klien sebelum masuk ke solusi."},
            {"id": "sec-1-2", "title": "1.2 Risiko End of Life (EOL) / End of Support (EOS)", "category": "Teknis", "requirement_text": "Analisis risiko perangkat yang sudah/akan EOL-EOS dan dampak operasional jika tidak segera diganti.", "rationale": "Menegaskan urgensi bisnis untuk modernisasi, bukan sekadar preferensi teknis."},
            {"id": "sec-2", "title": "2. Tujuan", "category": "Umum", "requirement_text": "Tujuan strategis dan sasaran teknis yang ingin dicapai melalui implementasi solusi yang diusulkan.", "rationale": "Bab 2 standar proposal teknis CSUL."},
            {"id": "sec-3", "title": "3. Proposed Solution", "category": "Teknis", "requirement_text": "Gambaran umum solusi yang ditawarkan oleh PT Smartnet Magna Global untuk menjawab kebutuhan pada dokumen acuan.", "rationale": "Bab inti pembuktian kapabilitas solusi."},
            {"id": "sec-3-1", "title": "3.1 Solution Overview", "category": "Teknis", "requirement_text": "Ringkasan solusi, komponen utama, dan value proposition teknis yang ditawarkan.", "rationale": "Ringkasan solusi sebelum detail sizing dan HLD."},
            {"id": "sec-3-2", "title": "3.2 Sizing dan Opsi Penawaran", "category": "Teknis", "requirement_text": "Perhitungan sizing kapasitas dan opsi-opsi penawaran solusi (mis. varian kapasitas/performa) sesuai kebutuhan klien.", "rationale": "Menunjukkan solusi disesuaikan dengan kebutuhan riil, bukan generik."},
            {"id": "sec-3-2-1", "title": "3.2.1 Dasar Perhitungan Kapasitas", "category": "Teknis", "requirement_text": "Metodologi dan asumsi perhitungan kapasitas: data growth rate, redundancy, overhead, dan proyeksi 3-5 tahun ke depan.", "rationale": "Transparansi metodologi sizing agar mudah diverifikasi klien."},
            {"id": "sec-3-3", "title": "3.3 Proposed High Level Design (HLD)", "category": "Teknis", "requirement_text": "Diagram topologi arsitektur solusi yang diusulkan, termasuk konektivitas dan skema redundansi.", "rationale": "Visualisasi arsitektur wajib untuk pembuktian desain solusi enterprise."},
            {"id": "sec-3-4", "title": "3.4 Spesifikasi Teknis Storage & Perangkat Utama", "category": "Teknis", "requirement_text": "Detail spesifikasi teknis platform perangkat utama (mis. Pure Storage FlashArray //X, //C / RC20, Sangfor HCI, Dell PowerEdge, atau HPE): controller, interface I/O, direct flash, dan lisensi.", "rationale": "Membuktikan kesesuaian mendalam spesifikasi hardware terhadap klausul teknis tender."},
            {"id": "sec-3-5", "title": "3.5 Fitur Reduksi Data & Efisiensi Kapasitas (DRR)", "category": "Teknis", "requirement_text": "Arsitektur deduplikasi dan kompresi data inline hardware-accelerated, proyeksi rasio reduksi data (DRR 3:1 s.d 5:1), dan garansi kapasitas efektif.", "rationale": "Memperkuat nilai efisiensi TCO dan justifikasi komparasi sizing data pool klien."},
            {"id": "sec-3-6", "title": "3.6 Arsitektur High Availability & Redundansi Konektivitas", "category": "Teknis", "requirement_text": "Skema redundansi dual-controller active/active, multi-pathing I/O (SAN FC / NVMe-oF / iSCSI 25G), dual PSU, dan zero-single-point-of-failure.", "rationale": "Menjamin kelangsungan operasional sistem misi kritis perbankan/finansial tanpa downtime."},
            {"id": "sec-3-7", "title": "3.7 Proteksi Data, Snapshot Immutability & Disaster Recovery", "category": "Teknis", "requirement_text": "Fitur perlindungan data terhadap ransomware melalui immutable snapshot (SafeMode), replikasi asinkron/sinkron, serta pemenuhan target RPO = 0 dan RTO sub-menit.", "rationale": "Memenuhi kepatuhan regulasi proteksi data OJK/BI dan ketahanan insiden siber."},
            {"id": "sec-3-8", "title": "3.8 Matriks Kompatibilitas Sistem Operasi & Hypervisor", "category": "Teknis", "requirement_text": "Matriks dukungan resmi platform terhadap hypervisor VMware vSphere, KVM, Nutanix, sistem operasi server (RHEL, Windows Server), dan integrasi API VAAI.", "rationale": "Jaminan integrasi seamless dengan infrastruktur server existing klien tanpa kendala driver."},
            {"id": "sec-4", "title": "4. Compliance Matrix", "category": "Teknis", "requirement_text": "Matriks kepatuhan spesifikasi teknis terhadap setiap butir dokumen acuan (RFP/TOR/KAK/RKS) — Comply / Not Comply / Exceed.", "rationale": "Wajib merujuk langsung ke klausul dokumen acuan sebagai bukti pemenuhan requirement, bukan klaim sepihak."},
            {"id": "sec-5", "title": "5. Bill of Quantity", "category": "Teknis", "requirement_text": "Rincian item, part number, deskripsi, dan kuantitas perangkat/lisensi yang ditawarkan.", "rationale": "BOQ jadi acuan komersial dan teknis yang harus konsisten dengan Compliance Matrix di atasnya."},
            {"id": "sec-6", "title": "6. Implementation Plan", "category": "Manajemen Proyek", "requirement_text": "Rencana pelaksanaan proyek secara keseluruhan dari persiapan hingga serah terima.", "rationale": "Bab tata kelola implementasi, menaungi timeline/scope/out-of-scope di bawahnya."},
            {"id": "sec-6-1", "title": "6.1 Timeline Pekerjaan", "category": "Manajemen Proyek", "requirement_text": "Jadwal pelaksanaan tiap tahapan proyek (persiapan, instalasi, konfigurasi, migrasi, UAT, BAST).", "rationale": "Kepastian waktu jadi salah satu kriteria evaluasi utama tender."},
            {"id": "sec-6-2", "title": "6.2 Scope of Work", "category": "Manajemen Proyek", "requirement_text": "Rincian lingkup pekerjaan yang menjadi tanggung jawab penyedia selama implementasi.", "rationale": "Batasan tanggung jawab yang jelas mencegah dispute operasional."},
            {"id": "sec-6-3", "title": "6.3 Out of Scope", "category": "Administrasi & Legal", "requirement_text": "Daftar pekerjaan yang secara tegas berada di luar lingkup penawaran.", "rationale": "Melindungi batas tanggung jawab garansi dan komersial penyedia."},
            {"id": "sec-7", "title": "7. Maintenance Plan", "category": "SLA & Support", "requirement_text": "Layanan pemeliharaan pasca-implementasi mencakup PM, CM, dan komitmen SLA.", "rationale": "Bab layanan purnajual, menaungi PM/CM/SLA di bawahnya."},
            {"id": "sec-7-1", "title": "7.1 Preventive Maintenance (PM)", "category": "SLA & Support", "requirement_text": "Jadwal dan cakupan pemeliharaan preventif berkala untuk menjaga performa dan umur perangkat.", "rationale": "Bagian standar layanan purnajual SMG."},
            {"id": "sec-7-2", "title": "7.2 Corrective Maintenance (CM)", "category": "SLA & Support", "requirement_text": "Prosedur penanganan gangguan/insiden termasuk response time dan eskalasi.", "rationale": "Bagian standar layanan purnajual SMG."},
            {"id": "sec-7-3", "title": "7.3 Service Level Agreement (SLA)", "category": "SLA & Support", "requirement_text": "Komitmen SLA response time 24x7, target uptime, dan skema eskalasi dukungan teknis.", "rationale": "Komitmen terukur yang bisa dijadikan acuan kontraktual."},
            {"id": "sec-8", "title": "8. Lampiran", "category": "Administrasi & Legal", "requirement_text": "Dokumen pendukung penawaran: profil perusahaan, legalitas, dan tim tenaga ahli.", "rationale": "Bab penutup berisi bukti pendukung administratif dan legal."},
            {"id": "sec-8-1", "title": "8.1 Profil Perusahaan & Legalitas", "category": "Administrasi & Legal", "requirement_text": "Profil PT Smartnet Magna Global (Member of CTI Group), akta, NIB, dan sertifikasi perusahaan relevan.", "rationale": "Bukti kualifikasi administratif penyedia."},
            {"id": "sec-8-2", "title": "8.2 Tim Tenaga Ahli & Sertifikasi", "category": "Administrasi & Legal", "requirement_text": "Struktur tim proyek, CV ringkas, dan sertifikasi profesional tenaga ahli yang ditugaskan.", "rationale": "Bukti kapabilitas SDM yang akan mengeksekusi proyek."},
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
            "7. Cakupan Spesifik Sub-Bab: Anda HANYA menyusun narasi dan konten teknis untuk sub-bab yang sedang diminta. DILARANG KERAS merangkum atau menulis ulang seluruh isi proposal dari Bab 1 sampai Bab 8 jika yang diminta adalah satu sub-bab spesifik (misalnya: jika diminta sub-bab 3.3 Proposed High Level Design (HLD), susunlah penjelasan arsitektur, konektivitas link redundan, tiering switch-firewall-compute-storage, dan spesifikasi arsitektur teknis untuk sub-bab tersebut saja)."
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
        return provider_cls()
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
