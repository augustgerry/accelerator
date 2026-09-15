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
            f"Anda adalah Senior Enterprise Solution Architect dan Presales Specialist berpengalaman.\n"
            f"Tugas: Analisis dokumen acuan tender (TOR / RKS / KAK / RFP) berikut dan rancang rekomendasi "
            f"struktur sub-bab/bagian terbaik untuk menyusun dokumen tanggapan bertipe '{doc_type}'.\n\n"
            f"Judul Dokumen Tender: {document_title or 'Tender Pengadaan IT'}\n"
            f"Instruksi Tambahan User: {instruction or 'Buat struktur sub-bab yang adaptif, komprehensif, dan tepat sasaran sesuai kebutuhan tender.'}\n\n"
            f"Syarat output:\n"
            f"1. Hasilkan antara 5 hingga 9 sub-bab yang logis dan berurutan dari awal sampai penutup.\n"
            f"2. Untuk SETIAP sub-bab, sertakan 'rationale' (alasan konkret) yang menjelaskan mengapa sub-bab ini "
            f"relevan dan perlu dicantumkan, dengan merujuk langsung ke klausul/kebutuhan pada dokumen sumber.\n"
            f"3. Format JSON HARUS valid berupa array objek:\n"
            f"[\n"
            f'  {{"id": "sec-1", "title": "Judul Sub-Bab", "category": "Teknis | Umum | SLA & Support | Manajemen Proyek | Administrasi & Legal", "requirement_text": "Cakupan/pertanyaan yang harus dijawab di sub-bab ini", "rationale": "Alasan rekomendasi berdasarkan dokumen sumber"}}\n'
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
            "Anda adalah asisten drafting internal presales. Jawab dengan teks "
            "siap-copas dalam Bahasa Indonesia formal, berdasarkan konteks yang "
            "diberikan. Jangan mengarang detail yang tidak ada di konteks. "
            "Jawab ringkas dan langsung ke inti — tanpa basa-basi."
        )
    return (
        "Anda adalah asisten knowledge base internal. Jawab pertanyaan hanya "
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
