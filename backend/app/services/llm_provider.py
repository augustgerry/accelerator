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
        context = "\n\n---\n\n".join(context_chunks)
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
        context = "\n\n---\n\n".join(context_chunks)
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


def _build_system_prompt(mode: str) -> str:
    if mode == "draft":
        return (
            "Anda adalah Senior Enterprise Solution Architect di PT Smartnet Magna Global (SMG). "
            "Tugas Anda adalah menyusun tanggapan teknis dan proposal solusi resmi dalam Bahasa Indonesia formal "
            "berdasarkan konteks dokumen tender (TOR) dan knowledge base internal SMG.\n\n"
            "Aturan Penulisan Proposal Standar Enterprise:\n"
            "1. Format penomoran sub-bab terstruktur (misal: 1.1, 2.1, 2.1.1, 3.1.2) sesuai hirarki topik.\n"
            "2. Jangan gunakan simbol markdown liar yang mengotori dokumen; jika menggunakan sub-judul, sertakan nomor sub-bab bertingkat (misal: '3.1.1 Spesifikasi Server DL360').\n"
            "3. Untuk rincian spesifikasi, komparasi fitur, konfigurasi hardware, atau SLA, WAJIB gunakan format tabel markdown (| Parameter | Spesifikasi | Komitmen SMG |) agar otomatis diekspor menjadi tabel Word resmi bergaris rapi.\n"
            "4. Gunakan poin peluru bertanda '- ' untuk rincian fitur atau deliverables.\n"
            "5. Selalu gunakan nama resmi perusahaan: 'PT Smartnet Magna Global' atau 'SMG'.\n"
            "6. Jawab secara lugas, meyakinkan, bernilai jual tinggi (value proposition), dengan komitmen teknis spesifik tanpa kata tentatif (hindari kata 'akan diusahakan')."
        )
    return (
        "Anda adalah asisten knowledge base internal PT Smartnet Magna Global (SMG). Jawab pertanyaan hanya "
        "berdasarkan konteks yang diberikan, sebutkan jika informasi tidak "
        "ditemukan. Jawab ringkas dan langsung ke inti — tanpa basa-basi."
    )


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
