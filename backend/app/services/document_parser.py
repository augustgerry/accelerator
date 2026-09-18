"""
Document Parsing & Ingestion Service
- Signature / Stamp block detection and noise exclusion (prevents polluting vector search).
- Scanned PDF fallback: detects image-only pages and triggers Gemini Vision OCR fallback.
- Sequential text and table parser for DOCX and PDF documents.
"""

import io
import logging
import re
from typing import Tuple

logger = logging.getLogger(__name__)

# Patterns that indicate signature, approval, and official stamp blocks
SIGNATURE_HEADER_PATTERNS = [
    r"(?i)\bdemikian\s+(?:kerangka\s+acuan\s+kerja|kak|tor|berita\s+acara|proposal|perjanjian|spk|surat|dokumen)\s+ini\s+dibuat",
    r"(?i)\b(?:mengetahui|menyetujui|disetujui\s+oleh|disiapkan\s+oleh|diajukan\s+oleh|disahkan\s+oleh)\s*[:,\n]",
    r"(?i)\bpihak\s+pertama\b[\s\S]{1,150}\bpihak\s+kedua\b",
    r"(?i)\b(?:tanda\s*tangan\s*(?:dan\s*stempel)?|stempel\s*perusahaan|meterai|materai)\b",
    r"(?i)\bin\s+witness\s+whereof,\s+the\s+parties\s+hereto\b",
    r"(?i)\b(?:authorized\s+signature|signed\s+for\s+and\s+on\s+behalf\s+of)\b",
]

SIGNATURE_LINE_PATTERN = re.compile(
    r"(?:\(\s*[_\.]{6,}\s*\)|\[\s*materai\s*\]|\bNIP\s*[:\.]|\bJabatan\s*[:\.])",
    re.IGNORECASE,
)


def detect_signature_block(text: str) -> bool:
    """Return True if the text block appears to be a signature/approval block."""
    if not text or len(text.strip()) < 15:
        return False

    matches = 0
    for pattern in SIGNATURE_HEADER_PATTERNS:
        if re.search(pattern, text):
            matches += 1

    if SIGNATURE_LINE_PATTERN.search(text):
        matches += 1

    return matches >= 1


def clean_signature_blocks(full_text: str) -> Tuple[str, bool]:
    """Identify and exclude trailing signature/stamp boilerplate from embedding chunks.
    Preserves document content while eliminating non-retrievable approval noise.
    Returns (cleaned_text, has_signature_page).
    """
    if not full_text:
        return full_text, False

    paragraphs = full_text.split("\n\n")
    if len(paragraphs) <= 1:
        # Check single body text
        has_sig = detect_signature_block(full_text)
        return full_text, has_sig

    cleaned_paras = []
    has_sig = False

    # Signature blocks typically reside in the final 1-5 paragraphs
    cutoff_index = len(paragraphs)
    for idx in range(len(paragraphs) - 1, max(-1, len(paragraphs) - 6), -1):
        para = paragraphs[idx].strip()
        if not para:
            continue
        if detect_signature_block(para):
            has_sig = True
            cutoff_index = idx
        elif has_sig:
            # Reached legitimate content before the signature block
            break

    if has_sig and cutoff_index > 0:
        cleaned_paras = paragraphs[:cutoff_index]
        cleaned_text = "\n\n".join(cleaned_paras).strip()
        logger.info(
            f"Filtered signature/approval section ({len(paragraphs) - cutoff_index} paragraphs removed) from embedding payload."
        )
        return cleaned_text, True

    return full_text, has_sig


def _ocr_image_page(img) -> str:
    """Fallback OCR using Gemini Vision for scanned PDF pages without native text."""
    try:
        from app.config import settings
        import google.generativeai as genai

        if not settings.google_api_key:
            return ""

        genai.configure(api_key=settings.google_api_key)
        # Use configured gemini flash model for multimodal transcription
        model = genai.GenerativeModel(settings.gemini_model)
        prompt = (
            "Transkripsikan seluruh teks, tabel, dan angka yang ada pada dokumen/halaman ini "
            "secara persis dan lengkap. Jika terdapat tabel, format menjadi Markdown table. "
            "Keluarkan hanya hasil transkripsi tanpa teks pembuka atau penutup."
        )
        response = model.generate_content([prompt, img])
        return (response.text or "").strip()
    except Exception as exc:
        logger.warning(f"OCR fallback via Gemini failed: {exc}")
        return ""


def extract_pdf_with_ocr_fallback(file_bytes: bytes, enable_ocr: bool = True) -> Tuple[str, dict]:
    """Extract text from PDF with automatic OCR fallback for scanned pages.
    Detects pages with < 50 chars of text and extracts via Gemini Vision.
    Filters signature noise and returns (clean_text, metadata).
    """
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(file_bytes))
    page_texts = []
    scanned_pages = 0

    for page_idx, page in enumerate(reader.pages):
        try:
            native_text = (page.extract_text(extraction_mode="layout") or "").strip()
        except Exception:
            native_text = (page.extract_text() or "").strip()

        # Check if page is effectively empty but has images (scanned PDF)
        if len(native_text) < 50 and len(page.images) > 0 and enable_ocr:
            logger.info(f"PDF page {page_idx + 1} has sparse text ({len(native_text)} chars) with {len(page.images)} images. Running OCR fallback...")
            page_ocr_chunks = []
            for img_obj in page.images:
                try:
                    ocr_res = _ocr_image_page(img_obj.image)
                    if ocr_res:
                        page_ocr_chunks.append(ocr_res)
                except Exception as e:
                    logger.debug(f"Failed to process image on page {page_idx + 1}: {e}")

            if page_ocr_chunks:
                scanned_pages += 1
                combined_page = "\n\n".join(page_ocr_chunks)
                page_texts.append(combined_page)
                continue

        if native_text:
            page_texts.append(native_text)

    raw_document_text = "\n\n".join(page_texts)
    clean_text, has_sig = clean_signature_blocks(raw_document_text)

    meta = {
        "page_count": len(reader.pages),
        "scanned_pages_count": scanned_pages,
        "has_signature_page": has_sig,
        "is_ocr_extracted": scanned_pages > 0,
    }
    return clean_text, meta


def infer_document_archetype_and_client(title: str, text: str = "") -> dict:
    """Infer tender archetype, industry, and client name from file title and text."""
    combined = f"{title} {text[:8000]}".lower()

    # Archetype detection
    from app.services.llm_provider import detect_tender_archetype
    archetype = detect_tender_archetype(text[:15000], title)

    # Industry detection
    industry = "general"
    if any(k in combined for k in ["bank", "perbankan", "smbc", "btpn", "bca", "mandiri", "bri", "cimb", "bi", "ojk"]):
        industry = "banking"
    elif any(k in combined for k in ["finance", "multifinance", "csul", "leasing", "pembiayaan"]):
        industry = "multifinance"
    elif any(k in combined for k in ["telkom", "telkomsel", "indosat", "xl", "smartfren"]):
        industry = "telco"
    elif any(k in combined for k in ["kementerian", "dinas", "pemerintah", "bumn", "lpse"]):
        industry = "government"

    # Client name extraction
    client_name = ""
    client_patterns = [
        r"(?:pt\s+)?bank\s+smbc\s+indonesia(?:\s+tbk)?",
        r"(?:pt\s+)?smbc\s+indonesia",
        r"(?:pt\s+)?csul\s+finance",
        r"(?:pt\s+)?btpn(?:\s+tbk)?",
        r"(?:pt\s+)?bank\s+[a-z0-9\s]+(?:\s+tbk)?",
        r"(?:pt\s+)?[a-z0-9\s]+finance",
    ]
    for cp in client_patterns:
        m = re.search(cp, combined, re.IGNORECASE)
        if m:
            client_name = m.group(0).strip().title()
            break

    if not client_name:
        # Fallback to title words
        clean_title = re.sub(r"(?i)\b(proposal|sow|mom|kak|tor|rfp|final|draft|teknis|v\d+|\.docx|\.pdf)\b", "", title).strip(" -_")
    # Document category detection
    doc_category = "proposal"
    if any(k in combined for k in ["scope of work", " sow", "_sow", "kak", "kerangka acuan kerja"]):
        doc_category = "sow"
    elif any(k in combined for k in ["mom", "minutes of meeting", "notulen", "berita acara", "klarifikasi teknis", "aanwijzing"]):
        doc_category = "mom"
    elif any(k in combined for k in ["sla", "service level agreement", "pks", "perjanjian kerja sama", "kontrak pemeliharaan"]):
        doc_category = "sla_contract"
    elif any(k in combined for k in ["solution brief", "whitepaper", "arsitektur solusi", "hld", "lld"]):
        doc_category = "solution_brief"
    elif any(k in combined for k in ["tor", "term of reference", "rks", "rfp"]):
        doc_category = "tor"

    return {
        "archetype": archetype,
        "industry": industry,
        "client_name": client_name,
        "doc_category": doc_category,
    }


def extract_document_structure(file_bytes: bytes, file_name: str, raw_text: str = "") -> dict:
    """Extract structural DNA (Table of Contents / Section Hierarchies) from DOCX or text/PDF.
    Detects Heading 1/2/3 styles, numbered clauses (1., 1.1, Bab I), and builds a structured tree.
    """
    sections: list[dict] = []
    lower_name = file_name.lower()

    is_docx = lower_name.endswith(".docx") or (bool(file_bytes) and file_bytes[:4] == b"PK\x03\x04")
    if is_docx:
        try:
            import docx
            doc = docx.Document(io.BytesIO(file_bytes))
            heading_regex = re.compile(r"^(?:(?:bab\s+[ivx0-9]+|[0-9]+(?:\.[0-9]+)*\.?|[a-z]\.)\s+|document\s+release|pengakuan\s+kerahasiaan)", re.IGNORECASE)

            for p in doc.paragraphs:
                txt = p.text.strip()
                if not txt:
                    continue
                style_name = p.style.name.lower() if p.style else ""

                is_heading = (
                    "heading" in style_name
                    or style_name in ["title", "subtitle"]
                    or (len(txt) < 80 and heading_regex.match(txt))
                )

                if is_heading:
                    level = 1
                    if "heading 2" in style_name or re.match(r"^[0-9]+\.[0-9]+\b", txt):
                        level = 2
                    elif "heading 3" in style_name or re.match(r"^[0-9]+\.[0-9]+\.[0-9]+\b", txt):
                        level = 3

                    sections.append({
                        "id": f"sec-{len(sections) + 1}",
                        "title": txt,
                        "level": level,
                        "style": style_name,
                    })
        except Exception as e:
            logger.warning(f"Failed to extract headings from docx {file_name}: {e}")

    # Fallback to scanning raw text for numbered headings
    if not sections and raw_text:
        heading_pat = re.compile(r"^(?:(?:bab\s+[ivx0-9]+|[0-9]+(?:\.[0-9]+)*\.?)\s+[A-Za-z]|document\s+release|pengakuan\s+kerahasiaan|latar\s+belakang|tujuan|proposed\s+solution|compliance\s+matrix|bill\s+of\s+quantity|manpower|implementation\s+plan|maintenance|lampiran)", re.IGNORECASE | re.MULTILINE)
        for line in raw_text.split("\n"):
            line_str = line.strip()
            if len(line_str) > 3 and len(line_str) < 90 and heading_pat.match(line_str):
                level = 1
                if re.match(r"^[0-9]+\.[0-9]+\b", line_str):
                    level = 2
                elif re.match(r"^[0-9]+\.[0-9]+\.[0-9]+\b", line_str):
                    level = 3
                sections.append({
                    "id": f"sec-{len(sections) + 1}",
                    "title": line_str,
                    "level": level,
                    "style": "text_pattern",
                })

    inferred = infer_document_archetype_and_client(file_name, raw_text)
    total_main = sum(1 for s in sections if s.get("level", 1) == 1)

    return {
        "title": file_name,
        "archetype": inferred["archetype"],
        "industry": inferred["industry"],
        "client_name": inferred["client_name"],
        "doc_category": inferred.get("doc_category", "proposal"),
        "sections": sections,
        "total_chapters": max(total_main, 1),
    }
