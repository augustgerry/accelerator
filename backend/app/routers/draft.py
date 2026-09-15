import io

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.services.retrieval import (
    retrieve_relevant_chunks,
    retrieve_relevant_chunks_with_sources,
)
from app.services.llm_provider import get_llm_provider
from app.db import get_session

router = APIRouter(prefix="/draft", tags=["draft"])


class DraftRequest(BaseModel):
    instruction: str  # e.g. "buatkan draf klausul SLA"
    tor_text: str  # extracted text of the uploaded TOR/RFP
    workspace_id: str = settings.default_workspace_id


class DraftResponse(BaseModel):
    draft_text: str
    sources_used: int


class SegmentRequest(BaseModel):
    tor_text: str
    workspace_id: str = settings.default_workspace_id


class SegmentItem(BaseModel):
    id: str
    title: str
    requirement_text: str
    category: str = "Teknis"


class SegmentResponse(BaseModel):
    items: list[SegmentItem]


class DraftItemRequest(BaseModel):
    item_id: str
    requirement_text: str
    instruction: Optional[str] = None
    tor_context: Optional[str] = None
    workspace_id: str = settings.default_workspace_id


class SourceMeta(BaseModel):
    id: str
    title: str
    docType: str
    division: Optional[str] = None
    source: str = "internal"


class DraftItemResponse(BaseModel):
    item_id: str
    draft_text: str
    sources_used: int
    sources: list[SourceMeta] = []


@router.post("", response_model=DraftResponse)
def generate_draft(payload: DraftRequest, session: Session = Depends(get_session)):
    # Ground the draft in both the uploaded TOR and the knowledge base
    kb_chunks = retrieve_relevant_chunks(session, payload.workspace_id, payload.instruction)
    context = [payload.tor_text] + kb_chunks

    provider = get_llm_provider()
    draft = provider.answer(payload.instruction, context, mode="draft")
    return DraftResponse(draft_text=draft, sources_used=len(context))


@router.post("/segment", response_model=SegmentResponse)
def segment_tor(payload: SegmentRequest):
    """Break down an extracted TOR/RFP document into discrete requirements/clauses."""
    if not payload.tor_text or not payload.tor_text.strip():
        return SegmentResponse(items=[])

    provider = get_llm_provider()
    raw_items = provider.segment_document(payload.tor_text)
    items = [SegmentItem(**it) for it in raw_items]
    return SegmentResponse(items=items)


@router.post("/item", response_model=DraftItemResponse)
def draft_item(payload: DraftItemRequest, session: Session = Depends(get_session)):
    """Generate a grounded draft response for a single requirement item."""
    query = payload.requirement_text
    if payload.instruction:
        query = f"{payload.requirement_text} {payload.instruction}"

    kb_chunks, sources = retrieve_relevant_chunks_with_sources(
        session, payload.workspace_id, query, top_k=5
    )

    context = []
    if payload.tor_context and payload.tor_context.strip():
        context.append(f"Konteks TOR/RFP Tambahan:\n{payload.tor_context[:2000]}")
    context.extend(kb_chunks)

    user_prompt = f"Klausul Kebutuhan:\n{payload.requirement_text}"
    if payload.instruction:
        user_prompt += f"\n\nInstruksi Spesifik:\n{payload.instruction}"

    provider = get_llm_provider()
    try:
        draft = provider.answer(user_prompt, context, mode="draft")
    except Exception as e:
        # Gracefully handle API/billing errors (e.g. Anthropic credits) so UI remains smooth
        err_msg = str(e)
        if "credit balance" in err_msg.lower() or "billing" in err_msg.lower():
            draft = (
                f"[Catatan: Akun LLM belum memiliki kredit/kuota aktif. Detail: {err_msg}]\n\n"
                f"Referensi klausul: {payload.requirement_text}\n\n"
                f"Silakan tulis atau sesuaikan draf manual di sini."
            )
        else:
            draft = f"[Gagal menghubungi LLM: {err_msg}]\n\nSilakan tulis atau perbaiki draf secara manual."

    source_models = [SourceMeta(**s) for s in sources]
    return DraftItemResponse(
        item_id=payload.item_id,
        draft_text=draft,
        sources_used=len(kb_chunks),
        sources=source_models,
    )


@router.post("/upload")
async def upload_tor(file: UploadFile):
    """Accepts a TOR/RFP file, extracts text, returns it for use in /draft."""
    data = await file.read()
    name = (file.filename or "").lower()

    if file.content_type == "application/pdf" or name.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    elif name.endswith(".docx") or file.content_type == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ):
        from docx import Document as DocxDocument

        doc = DocxDocument(io.BytesIO(data))
        text = "\n".join(p.text for p in doc.paragraphs)
    else:
        raise HTTPException(status_code=400, detail="Only PDF or DOCX files are supported")

    return {"text": text}


class ExportDocxItem(BaseModel):
    id: str
    title: str
    requirement_text: str
    category: str
    draft_text: str
    status: str


class ExportDocxRequest(BaseModel):
    document_title: str
    template_type: str = "matrix"  # "matrix" | "narrative"
    font_name: str = "Calibri"
    company_name: str = "PT Solusi Mitra Gemilang (SMG)"
    items: list[ExportDocxItem]


@router.post("/export-docx")
def export_proposal_docx(payload: ExportDocxRequest):
    """Generate a formatted Microsoft Word (.docx) proposal from drafted requirements."""
    from datetime import datetime
    from fastapi.responses import StreamingResponse
    from docx import Document as DocxDocument
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml import parse_xml
    from docx.oxml.ns import nsdecls

    doc = DocxDocument()

    # Configure margins
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    # Configure base font
    style = doc.styles["Normal"]
    font = style.font
    font.name = payload.font_name
    font.size = Pt(10)
    font.color.rgb = RGBColor(0x1F, 0x24, 0x30)

    # Header title block
    title_p = doc.add_paragraph()
    title_run = title_p.add_run("TANGGAPAN TEKNIS & PROPOSAL SOLUSI")
    title_run.bold = True
    title_run.font.size = Pt(16)
    title_run.font.color.rgb = RGBColor(0x11, 0x18, 0x27)
    title_p.paragraph_format.space_after = Pt(2)

    sub_p = doc.add_paragraph()
    sub_run = sub_p.add_run(f"Dokumen Acuan: {payload.document_title}\n")
    sub_run.font.size = Pt(11)
    sub_run.bold = True
    sub_run.font.color.rgb = RGBColor(0x2F, 0x5F, 0xE0)

    meta_run = sub_p.add_run(
        f"Penyusun: {payload.company_name} · Tanggal: {datetime.now().strftime('%d %B %Y')}\n"
        f"Total Klausul Ditanggapi: {len(payload.items)} butir"
    )
    meta_run.font.size = Pt(9.5)
    meta_run.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
    sub_p.paragraph_format.space_after = Pt(16)

    if payload.template_type == "matrix":
        # Format Matriks Tender Resmi (Table)
        table = doc.add_table(rows=1, cols=5)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False

        headers = ["No", "Butir Kebutuhan / Klausul Tender", "Kategori", "Usulan Solusi & Komitmen SMG", "Status"]
        hdr_cells = table.rows[0].cells
        for idx, text in enumerate(headers):
            cell = hdr_cells[idx]
            cell.text = text
            shading = parse_xml(r'<w:shd {} w:fill="111827"/>'.format(nsdecls('w')))
            cell._tc.get_or_add_tcPr().append(shading)
            for p in cell.paragraphs:
                for r in p.runs:
                    r.bold = True
                    r.font.size = Pt(9)
                    r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

        col_widths = [Inches(0.4), Inches(2.2), Inches(1.0), Inches(2.7), Inches(0.7)]

        for item_idx, item in enumerate(payload.items, start=1):
            row_cells = table.add_row().cells
            row_cells[0].text = str(item_idx)
            row_cells[1].text = f"{item.title}\n\n{item.requirement_text}"
            row_cells[2].text = item.category
            row_cells[3].text = item.draft_text if item.draft_text.strip() else "[Belum ada tanggapan]"
            row_cells[4].text = item.status.upper()

            for c_idx, c in enumerate(row_cells):
                c.width = col_widths[c_idx]
                for p in c.paragraphs:
                    for r in p.runs:
                        r.font.size = Pt(9)

    else:
        # Format Proposal Naratif Bertingkat (Bab & Sub-bab)
        doc.add_heading("1. Ringkasan Eksekutif & Metodologi", level=1)
        doc.add_paragraph(
            f"Dokumen ini menyajikan tanggapan teknis dan penawaran solusi resmi dari {payload.company_name} "
            f"atas dokumen tender {payload.document_title}. Seluruh usulan spesifikasi telah diselaraskan dengan "
            "standar arsitektur dan praktik terbaik industri presales."
        )

        doc.add_heading("2. Rincian Tanggapan Teknis & Spesifikasi", level=1)
        for idx, item in enumerate(payload.items, start=1):
            doc.add_heading(f"2.{idx} {item.title} [{item.category}]", level=2)

            req_p = doc.add_paragraph()
            req_run = req_p.add_run(f"Kebutuhan Dokumen Tender:\n\"{item.requirement_text}\"")
            req_run.italic = True
            req_run.font.color.rgb = RGBColor(0x4B, 0x55, 0x63)
            req_p.paragraph_format.left_indent = Inches(0.25)

            resp_p = doc.add_paragraph()
            resp_p.add_run("Tanggapan Solusi SMG:\n").bold = True
            resp_text = item.draft_text if item.draft_text.strip() else "[Tanggapan belum disusun]"
            resp_p.add_run(resp_text)
            resp_p.paragraph_format.space_after = Pt(12)

        doc.add_heading("3. Status Kepatuhan & Penutup", level=1)
        doc.add_paragraph(
            f"Demikian tanggapan teknis ini kami sampaikan dengan penuh komitmen untuk mendukung "
            f"keberhasilan implementasi proyek pada pihak pemberi kerja."
        )

    bio = io.BytesIO()
    doc.save(bio)
    bio.seek(0)

    clean_name = "".join(c for c in payload.document_title if c.isalnum() or c in ("-", "_")).strip()
    if not clean_name:
        clean_name = "Proposal"

    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="Proposal-{clean_name}.docx"'},
    )


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE-BASED PROPOSAL GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

class TemplateSectionInfo(BaseModel):
    index: int
    style_name: str        # e.g. "Heading 1", "Heading 2", "Normal"
    level: int             # 0=normal body, 1=h1, 2=h2, 3=h3 …
    text: str              # raw text of the paragraph in the template
    font_name: Optional[str] = None
    font_size_pt: Optional[float] = None
    is_bold: Optional[bool] = None
    is_italic: Optional[bool] = None
    alignment: Optional[str] = None   # "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY"


class TemplateInfoResponse(BaseModel):
    template_name: str
    default_font_name: str
    default_font_size_pt: float
    section_count: int
    sections: list[TemplateSectionInfo]


@router.post("/upload-template", response_model=TemplateInfoResponse)
async def upload_template(file: UploadFile):
    """
    Parse a .docx proposal template and return its structural metadata:
    - All paragraphs with style, heading level, font, size, and alignment.
    - Used by the frontend to preview the template and by /export-from-template
      to clone the exact formatting into the generated output.
    """
    data = await file.read()
    name = (file.filename or "template.docx").lower()
    if not (name.endswith(".docx") or file.content_type == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )):
        raise HTTPException(status_code=400, detail="Only .docx template files are supported")

    from docx import Document as DocxDocument
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = DocxDocument(io.BytesIO(data))

    # Derive default document font from Normal style
    normal_style = doc.styles.get("Normal") if hasattr(doc.styles, "get") else None
    try:
        normal_style = doc.styles["Normal"]
        def_font_name = normal_style.font.name or "Calibri"
        def_font_size = normal_style.font.size.pt if normal_style.font.size else 11.0
    except Exception:
        def_font_name = "Calibri"
        def_font_size = 11.0

    _align_map = {
        WD_ALIGN_PARAGRAPH.LEFT: "LEFT",
        WD_ALIGN_PARAGRAPH.CENTER: "CENTER",
        WD_ALIGN_PARAGRAPH.RIGHT: "RIGHT",
        WD_ALIGN_PARAGRAPH.JUSTIFY: "JUSTIFY",
    }

    def _heading_level(style_name: str) -> int:
        sn = (style_name or "").lower()
        if "heading 1" in sn: return 1
        if "heading 2" in sn: return 2
        if "heading 3" in sn: return 3
        if "heading 4" in sn: return 4
        if "title" in sn: return 0
        return 0

    sections_out: list[TemplateSectionInfo] = []
    for i, para in enumerate(doc.paragraphs):
        style_name = para.style.name if para.style else "Normal"
        level = _heading_level(style_name)

        # Resolve font info: paragraph-level run properties take precedence
        p_font_name: Optional[str] = None
        p_font_size: Optional[float] = None
        p_bold: Optional[bool] = None
        p_italic: Optional[bool] = None
        for run in para.runs:
            if run.font.name and not p_font_name:
                p_font_name = run.font.name
            if run.font.size and not p_font_size:
                p_font_size = run.font.size.pt
            if run.bold is not None and p_bold is None:
                p_bold = run.bold
            if run.italic is not None and p_italic is None:
                p_italic = run.italic

        alignment_str = _align_map.get(para.alignment) if para.alignment else None

        sections_out.append(TemplateSectionInfo(
            index=i,
            style_name=style_name,
            level=level,
            text=para.text,
            font_name=p_font_name,
            font_size_pt=p_font_size,
            is_bold=p_bold,
            is_italic=p_italic,
            alignment=alignment_str,
        ))

    return TemplateInfoResponse(
        template_name=file.filename or "template.docx",
        default_font_name=def_font_name,
        default_font_size_pt=def_font_size,
        section_count=len(sections_out),
        sections=sections_out,
    )


class ExportFromTemplateItem(BaseModel):
    id: str
    title: str
    requirement_text: str
    category: str
    draft_text: str
    status: str


class ExportFromTemplateRequest(BaseModel):
    document_title: str
    company_name: str = "PT Solusi Mitra Gemilang (SMG)"
    items: list[ExportFromTemplateItem]
    # Template metadata returned by /upload-template
    template_default_font: str = "Calibri"
    template_default_font_size: float = 11.0
    # Serialized template sections (only headings + major body paragraphs)
    template_sections: list[TemplateSectionInfo]


@router.post("/export-from-template")
def export_from_template(payload: ExportFromTemplateRequest):
    """
    Generate a proposal .docx that mirrors the uploaded template structure.
    - Headings are reproduced verbatim from the template with original font/style.
    - Body/placeholder paragraphs from the template are used as section scaffolding.
    - For each draft item, the AI-generated content is inserted under the matching
      heading section in the template structure.
    - Any template paragraph containing placeholder tokens like {{CONTENT}},
      [ISI_KONTEN], or [TANGGAPAN] is replaced with the compiled AI draft text.
    """
    from datetime import datetime
    from fastapi.responses import StreamingResponse
    from docx import Document as DocxDocument
    from docx.shared import Pt, RGBColor
    from docx.oxml.ns import qn
    import copy

    doc = DocxDocument()

    # ── Apply document-level default font ──────────────────────────────────────
    try:
        normal_style = doc.styles["Normal"]
        normal_style.font.name = payload.template_default_font
        normal_style.font.size = Pt(payload.template_default_font_size)
    except Exception:
        pass

    # Set page margins (standard)
    from docx.shared import Inches
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.2)
        section.right_margin = Inches(1.0)

    # ── Cover metadata block ───────────────────────────────────────────────────
    cover_para = doc.add_paragraph()
    cover_run = cover_para.add_run(payload.company_name.upper())
    cover_run.bold = True
    cover_run.font.size = Pt(14)
    cover_run.font.name = payload.template_default_font

    sub_para = doc.add_paragraph()
    sub_para.add_run(f"Tanggapan Teknis atas: {payload.document_title}").bold = True
    sub_para.runs[0].font.size = Pt(12)
    sub_para.runs[0].font.name = payload.template_default_font

    meta_para = doc.add_paragraph()
    meta_run = meta_para.add_run(
        f"Tanggal: {datetime.now().strftime('%d %B %Y')}  ·  "
        f"Total Klausul: {len(payload.items)} butir"
    )
    meta_run.font.size = Pt(9.5)
    meta_run.font.name = payload.template_default_font
    meta_run.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)

    doc.add_paragraph()  # spacer

    # ── Compile items categorically ────────────────────────────────────────────
    # Group items by category so they can be placed under template headings
    from collections import defaultdict
    items_by_category: dict[str, list[ExportFromTemplateItem]] = defaultdict(list)
    for it in payload.items:
        items_by_category[it.category].append(it)

    # ── Replay template structure ──────────────────────────────────────────────
    PLACEHOLDER_RE = r"\{\{.*?\}\}|\[ISI_KONTEN\]|\[TANGGAPAN\]|\[CONTENT\]|\[FILL\]"
    import re

    placed_item_ids: set[str] = set()

    for sec in payload.template_sections:
        style_name = sec.style_name
        text = sec.text.strip()

        # Skip completely blank lines (preserve one spacer max)
        if not text:
            doc.add_paragraph()
            continue

        # Determine if this is a heading
        is_heading = sec.level > 0 or "heading" in style_name.lower()

        # Resolve font overrides
        font_name = sec.font_name or payload.template_default_font
        font_size = sec.font_size_pt or (
            16 - (sec.level - 1) * 2 if is_heading else payload.template_default_font_size
        )

        if is_heading:
            # Add heading and mirror its formatting
            h_level = max(1, min(sec.level, 4))
            heading_para = doc.add_heading(text, level=h_level)
            for run in heading_para.runs:
                run.font.name = font_name
                run.font.size = Pt(font_size)
                if sec.is_bold is not None:
                    run.bold = sec.is_bold
                if sec.is_italic is not None:
                    run.italic = sec.is_italic

            # After a heading, insert matching draft items (by keyword match or category)
            matched_items = []
            heading_lower = text.lower()
            for cat, cat_items in items_by_category.items():
                cat_lower = cat.lower()
                if (
                    cat_lower in heading_lower
                    or any(kw in heading_lower for kw in cat_lower.split())
                ):
                    matched_items.extend(cat_items)

            for item in matched_items:
                if item.id in placed_item_ids:
                    continue
                placed_item_ids.add(item.id)
                _insert_item_block(doc, item, font_name, payload.template_default_font_size)

        elif re.search(PLACEHOLDER_RE, text, re.IGNORECASE):
            # This is a placeholder paragraph — replace with all compiled content
            unplaced = [it for it in payload.items if it.id not in placed_item_ids]
            for item in unplaced:
                placed_item_ids.add(item.id)
                _insert_item_block(doc, item, font_name, payload.template_default_font_size)
        else:
            # Regular body paragraph — reproduce verbatim
            body_para = doc.add_paragraph(text, style="Normal")
            for run in body_para.runs:
                run.font.name = font_name
                run.font.size = Pt(font_size)
                if sec.is_bold:
                    run.bold = True
                if sec.is_italic:
                    run.italic = True

    # ── Fallback: append any items not yet placed ──────────────────────────────
    unplaced_remaining = [it for it in payload.items if it.id not in placed_item_ids]
    if unplaced_remaining:
        fallback_heading = doc.add_heading("Tanggapan Teknis Tambahan", level=1)
        for run in fallback_heading.runs:
            run.font.name = payload.template_default_font
        for item in unplaced_remaining:
            _insert_item_block(doc, item, payload.template_default_font, payload.template_default_font_size)

    bio = io.BytesIO()
    doc.save(bio)
    bio.seek(0)

    clean_name = "".join(c for c in payload.document_title if c.isalnum() or c in ("-", "_")).strip() or "Proposal"
    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="Proposal-Template-{clean_name}.docx"'},
    )


def _insert_item_block(doc, item: "ExportFromTemplateItem", font_name: str, font_size: float):
    """Insert a single requirement + response block into the document."""
    from docx.shared import Pt, RGBColor, Inches

    # Sub-heading for the item
    item_heading = doc.add_heading(f"{item.title}  [{item.category}]", level=2)
    for run in item_heading.runs:
        run.font.name = font_name

    # Requirement blockquote
    req_para = doc.add_paragraph()
    req_run = req_para.add_run(f"Klausul / Kebutuhan Tender:\n\"{item.requirement_text}\"")
    req_run.italic = True
    req_run.font.size = Pt(font_size - 0.5)
    req_run.font.name = font_name
    req_run.font.color.rgb = RGBColor(0x4B, 0x55, 0x63)
    req_para.paragraph_format.left_indent = Inches(0.3)
    req_para.paragraph_format.space_after = Pt(4)

    # Draft response
    resp_para = doc.add_paragraph()
    resp_para.add_run("Tanggapan SMG:\n").bold = True
    resp_para.runs[0].font.name = font_name
    resp_para.runs[0].font.size = Pt(font_size)
    resp_text = item.draft_text.strip() if item.draft_text.strip() else "[Tanggapan belum disusun]"
    resp_run = resp_para.add_run(resp_text)
    resp_run.font.name = font_name
    resp_run.font.size = Pt(font_size)
    resp_para.paragraph_format.space_after = Pt(10)
