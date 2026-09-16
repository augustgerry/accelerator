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
