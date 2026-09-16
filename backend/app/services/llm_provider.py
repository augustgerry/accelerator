"""
Pluggable LLM layer. The rest of the app calls `get_llm_provider().answer(...)`
and never imports a vendor SDK directly — swapping providers is a config
change (LLM_PROVIDER in .env), not a code change.
"""

from abc import ABC, abstractmethod
import json
import logging
import re
from app.config import settings

logger = logging.getLogger(__name__)


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
        prompt = (
            f"Anda adalah Senior Enterprise Solution Architect dan Presales Specialist berpengalaman.\n"
            f"Tugas: Analisis dokumen acuan tender (TOR/RKS/KAK/RFP) dan rancang rekomendasi "
            f"struktur sub-bab/bagian terbaik untuk menyusun dokumen tanggapan bertipe '{doc_type}'.\n\n"
            f"Judul Tender: {document_title or 'Tender Pengadaan IT'}\n"
            f"Instruksi Tambahan User: {instruction or 'Buat struktur sub-bab yang adaptif dan komprehensif.'}\n\n"
            f"Syarat output:\n"
            f"1. Hasilkan antara 5 hingga 9 sub-bab yang logis dan berurutan dari awal hingga penutup.\n"
            f"2. Sertakan 'rationale' konkret mengapa sub-bab tersebut direkomendasikan dengan merujuk klausul sumber.\n"
            f"3. Format HARUS murni JSON array of objects:\n"
            f'[{{"id": "sec-1", "title": "Judul Sub-Bab", "category": "Teknis | Umum | SLA & Support | Manajemen Proyek | Administrasi & Legal", "requirement_text": "Cakupan kebutuhan", "rationale": "Alasan rekomendasi"}}]\n\n'
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
            if raw.startswith("```"):
                raw = re.sub(r"^```(?:json)?\s*", "", raw)
                raw = re.sub(r"\s*```$", "", raw)
            data = json.loads(raw)
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
    def __init__(self):
        import google.generativeai as genai

        if not settings.google_api_key:
            raise ValueError("GOOGLE_API_KEY is not set in environment or .env")
        genai.configure(api_key=settings.google_api_key)
        self.model_name = settings.gemini_model
        self.genai = genai

    def answer(self, question: str, context_chunks: list[str], mode: str = "qa") -> str:
        system_instruction = _build_system_prompt(mode)
        model = self.genai.GenerativeModel(
            model_name=self.model_name,
            system_instruction=system_instruction,
        )
        context = _format_context_chunks(context_chunks, mode)
        user_prompt = f"Konteks dari knowledge base:\n{context}\n\nPertanyaan: {question}"
        response = model.generate_content(user_prompt)
        return response.text or ""

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
            model = self.genai.GenerativeModel(
                model_name=self.model_name,
                system_instruction=system_instruction,
                generation_config={"response_mime_type": "application/json"},
            )
            response = model.generate_content(f"Dokumen TOR/RFP:\n\n{truncated_text}")
            cleaned = (response.text or "").strip()
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
            model = self.genai.GenerativeModel(
                model_name=self.model_name,
                system_instruction=_MAPPING_SYSTEM_PROMPT,
                generation_config={"response_mime_type": "application/json"},
            )
            response = model.generate_content(_build_mapping_prompt(headings, items))
            return _clean_mapping_result(_parse_json_object(response.text or ""), headings, items)
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
        prompt = (
            f"Anda adalah Senior Enterprise Solution Architect dan Presales Specialist di PT Smartnet Magna Global (SMG).\n"
            f"Tugas: Analisis dokumen acuan tender (TOR / RKS / KAK / RFP) berikut dan rancang rekomendasi "
            f"struktur bab dan sub-bab terbaik untuk menyusun dokumen tanggapan resmi '{doc_type}'.\n\n"
            f"Judul Dokumen Tender: {document_title or 'Tender Pengadaan IT'}\n"
            f"Instruksi Tambahan User: {instruction or 'Buat struktur bab dan sub-bab hierarkis standar proposal teknis enterprise (seperti format CSUL: Latar Belakang, Tujuan, Proposed Solution dengan HLD & Sizing, Compliance Matrix, Implementation Plan, Maintenance Plan & SLA, Penutup).'}\n\n"
            f"Syarat output:\n"
            f"1. Gunakan penomoran hierarkis standar proposal profesional: misalnya '1. Latar Belakang', '1.1 Kondisi Existing & Analisis Kebutuhan', '2. Tujuan & Sasaran Solusi', '3. Proposed Solution & Arsitektur Sistem', '3.1 Solution Overview & Rekomendasi Hardware', '3.2 High Level Design (HLD) Topologi Sistem', '4. Compliance Matrix', '5. Implementation Plan & Scope of Work', '6. Maintenance Plan & SLA Dukungan 24x7', '7. Penutup & Tim Tenaga Ahli'.\n"
            f"2. Untuk SETIAP bagian, sertakan 'rationale' (alasan konkret) yang menjelaskan relevansinya terhadap klausul dokumen acuan.\n"
            f"3. Format JSON HARUS valid berupa array objek:\n"
            f"[\n"
            f'  {{"id": "sec-1", "title": "1.1 Judul Sub-Bab", "category": "Teknis | Umum | SLA & Support | Manajemen Proyek | Administrasi & Legal", "requirement_text": "Cakupan detail yang harus dijawab di sub-bab ini", "rationale": "Alasan rekomendasi berdasarkan dokumen sumber"}}\n'
            f"]"
        )
        try:
            model = self.genai.GenerativeModel(
                model_name=self.model_name,
                generation_config={"response_mime_type": "application/json"},
            )
            response = model.generate_content(f"{prompt}\n\nTeks Dokumen Acuan:\n{truncated_text}")
            cleaned = (response.text or "").strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            data = json.loads(cleaned)
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
        # Default: Proposal Teknis CSUL Enterprise Standard
        return [
            {"id": "sec-1", "title": "1. Latar Belakang & Analisis Kebutuhan", "category": "Umum", "requirement_text": f"Latar belakang proyek {clean_title}, kondisi existing infrastruktur klien, serta urgensi modernisasi perangkat.", "rationale": "Format Bab 1 standar proposal teknis CSUL."},
            {"id": "sec-2", "title": "2. Tujuan & Sasaran Implementasi", "category": "Umum", "requirement_text": "Tujuan strategis dan sasaran teknis yang ingin dicapai melalui implementasi solusi yang diusulkan.", "rationale": "Format Bab 2 standar proposal teknis CSUL."},
            {"id": "sec-3", "title": "3. Proposed Solution & Arsitektur Solusi", "category": "Teknis", "requirement_text": "Gambaran umum solusi yang ditawarkan oleh PT Smartnet Magna Global, arsitektur High Level Design (HLD), sizing kapasitas, dan spesifikasi hardware.", "rationale": "Format Bab 3 standar proposal teknis CSUL."},
            {"id": "sec-4", "title": "4. Compliance Matrix Spesifikasi Teknis", "category": "Teknis", "requirement_text": "Tabel matriks kepatuhan spesifikasi teknis terhadap butir kebutuhan TOR (Comply / Not Comply / Exceed) beserta rincian komitmen pemenuhan teknis SMG.", "rationale": "Format Bab 4 standar proposal teknis CSUL."},
            {"id": "sec-5", "title": "5. Implementation Plan, Scope of Work & Deliverables", "category": "Manajemen Proyek", "requirement_text": "Rencana implementasi, tahapan pelaksanaan, batasan ruang lingkup (in-scope / out-of-scope), deliverables, dan prosedur UAT.", "rationale": "Format Bab 5 standar proposal teknis CSUL."},
            {"id": "sec-6", "title": "6. Maintenance Plan (PM/CM) & Service Level Agreement (SLA)", "category": "SLA & Support", "requirement_text": "Layanan pemeliharaan berkala Preventive Maintenance (PM), penanganan gangguan Corrective Maintenance (CM), komitmen SLA response time 24x7, dan dukungan prinsipal.", "rationale": "Format Bab 6 standar proposal teknis CSUL."},
            {"id": "sec-7", "title": "7. Penutup, Tim Tenaga Ahli & Profil PT Smartnet Magna Global", "category": "Administrasi & Legal", "requirement_text": "Kesimpulan proposal, struktur tim tenaga ahli bersertifikasi, rekam jejak pengalaman PT Smartnet Magna Global, dan surat dukungan prinsipal resmi.", "rationale": "Format Bab 7 standar proposal teknis CSUL."},
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
            "5. Nilai Jual & Kepastian: Buat narasi yang meyakinkan, bernilai tambah (value proposition), dengan komitmen teknis spesifik tanpa kata tentatif (hindari kata 'akan diusahakan' atau 'sebisanya')."
        )
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


def _parse_json_object(raw: str) -> dict:
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


def _fallback_recommend_structure(doc_type: str, text: str = "", document_title: str = "") -> list[dict]:
    doc_label = document_title or "Tender Acuan"
    base_skeletons = {
        "narrative": [
            {
                "id": "sec-exec-summary",
                "title": "Executive Summary & Pemahaman Kebutuhan",
                "category": "Umum",
                "requirement_text": "Ringkasan eksekutif pemahaman terhadap latar belakang, sasaran pengadaan, dan value proposition solusi.",
                "rationale": f"Penting sebagai pengantar strategis untuk merangkum keselarasan solusi dengan sasaran {doc_label}.",
            },
            {
                "id": "sec-arsitektur-teknis",
                "title": "Solusi Teknis & Arsitektur Sistem",
                "category": "Teknis",
                "requirement_text": "Rancangan arsitektur, topologi, spesifikasi perangkat keras/lunak, dan kapabilitas sistem.",
                "rationale": "Menjawab spesifikasi teknis utama, standar arsitektur, dan kompatibilitas yang disyaratkan dalam dokumen pengadaan.",
            },
            {
                "id": "sec-metodologi-implementasi",
                "title": "Metodologi & Rencana Implementasi",
                "category": "Manajemen Proyek",
                "requirement_text": "Tahapan pelaksanaan instalasi, konfigurasi, migrasi, dan pengujian sistem (UAT).",
                "rationale": "Memberikan kepastian tata kelola implementasi terstruktur dari fase persiapan hingga serah terima.",
            },
            {
                "id": "sec-maintenance-sla",
                "title": "Service Level Agreement (SLA) & Maintenance Plan",
                "category": "SLA & Support",
                "requirement_text": "Layanan pemeliharaan Preventif (PM), Korektif (CM), SLA response time 24x7, dan skema eskalasi dukungan teknis.",
                "rationale": "Memenuhi kepatuhan layanan purnajual dan ketersediaan suku cadang sesuai butir pemeliharaan operasional.",
            },
            {
                "id": "sec-tim-ahli",
                "title": "Kualifikasi Tim Ahli & Struktur Proyek",
                "category": "Manajemen Proyek",
                "requirement_text": "Susunan tim pelaksana, sertifikasi profesional, dan rekam jejak tenaga ahli terkait.",
                "rationale": "Menjamin pemenuhan syarat administratif personel ahli yang disyaratkan dalam dokumen tender.",
            },
            {
                "id": "sec-jadwal-milestone",
                "title": "Jadwal Pelaksanaan & Deliverables",
                "category": "Manajemen Proyek",
                "requirement_text": "Timeline kerja, milestone pekerjaan, dan daftar deliverable serah terima (BAST).",
                "rationale": "Menetapkan target waktu penyelesaian dan transparansi pelaporan kemajuan proyek.",
            },
            {
                "id": "sec-penutup-komitmen",
                "title": "Kesimpulan & Komitmen Kepatuhan",
                "category": "Administrasi & Legal",
                "requirement_text": "Pernyataan komitmen penyedia terhadap keberhasilan implementasi dan kepatuhan terhadap seluruh klausul pengadaan.",
                "rationale": "Penutup formal yang menegaskan kesiapan dan kepatuhan penuh penyedia.",
            },
        ],
        "sow": [
            {
                "id": "sec-ruang-lingkup",
                "title": "Ruang Lingkup Pekerjaan (Scope of Work)",
                "category": "Teknis",
                "requirement_text": "Batasan dan rincian pekerjaan implementasi yang akan dilaksanakan.",
                "rationale": f"Menetapkan batas tanggung jawab eksekusi proyek {doc_label} secara jelas dan mengikat.",
            },
            {
                "id": "sec-deliverables",
                "title": "Deliverables & Output Serah Terima",
                "category": "Manajemen Proyek",
                "requirement_text": "Daftar output konkret, dokumentasi teknis, dan laporan pengujian yang diserahkan.",
                "rationale": "Menjadi acuan verifikasi pekerjaan saat penerbitan Berita Acara Serah Terima (BAST).",
            },
            {
                "id": "sec-jadwal",
                "title": "Jadwal Pelaksanaan & Milestone",
                "category": "Manajemen Proyek",
                "requirement_text": "Timeline tahapan kerja dan milestone utama.",
                "rationale": "Memberikan estimasi waktu terukur bagi kedua belah pihak.",
            },
            {
                "id": "sec-sla",
                "title": "Service Level Agreement (SLA) & Dukungan Operasional",
                "category": "SLA & Support",
                "requirement_text": "Standar respon insiden, waktu perbaikan, dan ketersediaan layanan teknis.",
                "rationale": "Memastikan standar kualitas operasional pasca-implementasi.",
            },
            {
                "id": "sec-tanggung-jawab",
                "title": "Tanggung Jawab & Asumsi Kerja Para Pihak",
                "category": "Administrasi & Legal",
                "requirement_text": "Hak, kewajiban, dan prasyarat lingkungan kerja antara penyedia dan klien.",
                "rationale": "Mencegah terjadinya perselisihan lingkup operasional di luar kesepakatan.",
            },
        ],
        "solution_brief": [
            {
                "id": "sec-challenge",
                "title": "Tantangan Klien & Latar Belakang",
                "category": "Umum",
                "requirement_text": "Permasalahan operasional/bisnis yang dihadapi klien berdasarkan dokumen acuan.",
                "rationale": "Menunjukkan pemahaman mendalam terhadap pain points klien.",
            },
            {
                "id": "sec-solution",
                "title": "Solusi yang Diusulkan & Value Proposition",
                "category": "Teknis",
                "requirement_text": "Konsep solusi, manfaat utama, dan nilai pembeda yang ditawarkan penyedia.",
                "rationale": "Memberikan gambaran ringkas keunggulan solusi kepada pengambil keputusan.",
            },
            {
                "id": "sec-arch",
                "title": "Ringkasan Arsitektur & Spesifikasi",
                "category": "Teknis",
                "requirement_text": "Gambaran arsitektur sistem, integrasi, dan keamanan data.",
                "rationale": "Memberikan kepastian kesesuaian teknis secara efisien.",
            },
            {
                "id": "sec-implementation",
                "title": "Pendekatan Implementasi & Roadmap",
                "category": "Manajemen Proyek",
                "requirement_text": "Tahapan implementasi cepat dan roadmap penyelesaian proyek.",
                "rationale": "Memperlihatkan strategi eksekusi yang realistis dan terukur.",
            },
        ],
        "mom": [
            {
                "id": "sec-agenda",
                "title": "Agenda Pertemuan & Maksud Klarifikasi",
                "category": "Umum",
                "requirement_text": "Agenda dan tujuan pertemuan teknis pengadaan.",
                "rationale": "Mencatat latar belakang diadakannya sesi klarifikasi teknis.",
            },
            {
                "id": "sec-diskusi",
                "title": "Poin Pembahasan & Klarifikasi Teknis",
                "category": "Teknis",
                "requirement_text": "Rincian tanya jawab dan kesepakatan teknis yang dibahas.",
                "rationale": "Dokumentasi tertulis atas interpretasi butir-butir dalam dokumen acuan.",
            },
            {
                "id": "sec-action-items",
                "title": "Tindak Lanjut (Action Items) & PIC",
                "category": "Manajemen Proyek",
                "requirement_text": "Daftar tindak lanjut, pihak penanggung jawab (PIC), dan target waktu penyelesaian.",
                "rationale": "Memastikan langkah konkret berikutnya terikat timeline.",
            },
        ],
        "klarifikasi_teknis": [
            {
                "id": "sec-pertanyaan-teknis",
                "title": "Daftar Pertanyaan & Klarifikasi Teknis",
                "category": "Teknis",
                "requirement_text": "Daftar klausul spesifikasi yang membutuhkan penegasan atau alternatif.",
                "rationale": "Menghilangkan ambiguitas dalam dokumen pengadaan sebelum penawaran final.",
            },
            {
                "id": "sec-usulan-alternatif",
                "title": "Usulan Pendekatan Solusi SMG",
                "category": "Teknis",
                "requirement_text": "Alternatif teknologi dan pendekatan spesifikasi yang direkomendasikan.",
                "rationale": "Memberikan opsi teknis yang lebih optimal atau hemat biaya bagi klien.",
            },
            {
                "id": "sec-dampak-lingkup",
                "title": "Dampak terhadap Jadwal & Ruang Lingkup",
                "category": "Administrasi & Legal",
                "requirement_text": "Dampak klarifikasi terhadap waktu pelaksanaan dan komitmen deliverables.",
                "rationale": "Memastikan transparansi dampak kesepakatan teknis terhadap perjanjian.",
            },
        ],
        "pitch_deck": [
            {
                "id": "sec-intro",
                "title": "Executive Summary & Business Context",
                "category": "Umum",
                "requirement_text": "Latar belakang inisiatif proyek dan tujuan strategis klien.",
                "rationale": "Membuka presentasi dengan menyelaraskan visi proyek dengan manajemen klien.",
            },
            {
                "id": "sec-pain-points",
                "title": "Tantangan Utama & Kebutuhan Kritis",
                "category": "Umum",
                "requirement_text": "Identifikasi kendala eksisting dan sasaran yang ingin dicapai melalui pengadaan ini.",
                "rationale": "Menyoroti urgensi kebutuhan berdasarkan rincian dokumen pengadaan.",
            },
            {
                "id": "sec-solution-overview",
                "title": "Solusi Unggulan & Arsitektur Utama",
                "category": "Teknis",
                "requirement_text": "Arsitektur solusi, teknologi kunci, dan diferensiasi penawaran SMG.",
                "rationale": "Menjadi inti presentasi yang membuktikan keunggulan kompetitif penawaran.",
            },
            {
                "id": "sec-maintenance-support",
                "title": "Komitmen SLA, Garansi & Dukungan Lokal",
                "category": "SLA & Support",
                "requirement_text": "Dukungan teknis 24/7, kesiapan suku cadang, dan SLA penanganan insiden.",
                "rationale": "Memberikan rasa aman (peace of mind) bagi stakeholder operasional klien.",
            },
            {
                "id": "sec-next-steps",
                "title": "Rencana Implementasi & Next Steps",
                "category": "Manajemen Proyek",
                "requirement_text": "Timeline implementasi, alur PoC/demo, dan tindak lanjut kolaborasi.",
                "rationale": "Call to action yang jelas untuk menggerakkan keputusan stakeholder.",
            },
        ],
    }
    return base_skeletons.get(doc_type, base_skeletons["narrative"])
