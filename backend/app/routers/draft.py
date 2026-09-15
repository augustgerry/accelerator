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

    elif payload.template_type == "sow":
        # Format Dokumen Statement of Work (SoW)
        doc.add_heading("1. Latar Belakang & Tujuan Pekerjaan", level=1)
        doc.add_paragraph(
            f"Dokumen Statement of Work (SoW) ini merinci ruang lingkup implementasi, deliverables, "
            f"serta tanggung jawab operasional {payload.company_name} dalam pelaksanaan proyek {payload.document_title}."
        )

        doc.add_heading("2. Ruang Lingkup Pekerjaan (Scope of Work)", level=1)
        doc.add_paragraph(
            "Ruang lingkup pekerjaan mencakup implementasi dan pemenuhan seluruh klausul teknis berikut:"
        )
        for idx, item in enumerate(payload.items, start=1):
            doc.add_heading(f"2.{idx} Scope: {item.title} [{item.category}]", level=2)
            req_p = doc.add_paragraph()
            req_p.add_run(f"Klausul Acuan: {item.requirement_text}\n").italic = True
            req_p.add_run("Rincian Lingkup Eksekusi:\n").bold = True
            req_p.add_run(item.draft_text.strip() if item.draft_text.strip() else "[Rincian belum ditentukan]")
            req_p.paragraph_format.space_after = Pt(10)

        doc.add_heading("3. Deliverables & Serah Terima", level=1)
        doc.add_paragraph(
            "Deliverables proyek mencakup dokumen arsitektur solusi, konfigurasi sistem, laporan pengujian "
            "(UAT), materi pelatihan (transfer of knowledge), dan Berita Acara Serah Terima (BAST)."
        )

        doc.add_heading("4. Tanggung Jawab & Asumsi", level=1)
        doc.add_paragraph(
            "1. Pihak Klien menyediakan akses lingkungan teknis, data uji, dan narahubung teknis yang berwenang.\n"
            f"2. {payload.company_name} menyediakan tenaga ahli bersertifikasi dan metodologi implementasi standar.\n"
            "3. Perubahan ruang lingkup di luar butir di atas akan disepakati melalui prosedur Change Request (CR)."
        )

    elif payload.template_type == "solution_brief":
        # Format Solution Brief Ringkas & Tajam
        doc.add_heading("1. Ringkasan Eksekutif & Value Proposition", level=1)
        doc.add_paragraph(
            f"Solution Brief ini menyajikan gambaran arsitektur dan keunggulan teknis penawaran {payload.company_name} "
            f"dalam menjawab kebutuhan {payload.document_title} secara efektif, skalabel, dan efisien."
        )

        doc.add_heading("2. Tantangan Klien & Pendekatan Solusi", level=1)
        for idx, item in enumerate(payload.items, start=1):
            doc.add_heading(f"{idx}. {item.title}", level=2)
            p = doc.add_paragraph()
            p.add_run("Tantangan Kebutuhan: ").bold = True
            p.add_run(f"{item.requirement_text}\n")
            p.add_run("Solusi & Keunggulan SMG: ").bold = True
            p.add_run(item.draft_text.strip() if item.draft_text.strip() else "[Solusi belum diisi]")
            p.paragraph_format.space_after = Pt(10)

        doc.add_heading("3. Keunggulan Kompetitif & Mengapa SMG", level=1)
        doc.add_paragraph(
            f"1. Tim Solution Architect berpengalaman dan bersertifikasi prinsipal terkemuka.\n"
            f"2. Rekam jejak keberhasilan implementasi serupa dengan SLA tinggi.\n"
            f"3. Dukungan purnajual lokal 24/7 dan asistensi kepatuhan regulasi."
        )

    elif payload.template_type == "mom":
        # Format Minutes of Meeting (MoM) / Berita Acara
        doc.add_heading("1. Informasi Pertemuan & Agenda", level=1)
        doc.add_paragraph(
            f"Agenda Pertemuan: Klarifikasi Teknis & Pembahasan Klausul {payload.document_title}\n"
            f"Waktu Pelaksanaan: {datetime.now().strftime('%d %B %Y')}\n"
            f"Penyelenggara: Tim Solution Architect {payload.company_name}"
        )

        doc.add_heading("2. Poin Pembahasan & Klarifikasi Klausul", level=1)
        for idx, item in enumerate(payload.items, start=1):
            doc.add_heading(f"Topik {idx}: {item.title}", level=2)
            p = doc.add_paragraph()
            p.add_run("Poin Diskusi / Pertanyaan Klien:\n").bold = True
            p.add_run(f"\"{item.requirement_text}\"\n")
            p.add_run("Tanggapan & Klarifikasi SMG:\n").bold = True
            p.add_run(item.draft_text.strip() if item.draft_text.strip() else "[Belum ada catatan]")
            p.paragraph_format.space_after = Pt(10)

        doc.add_heading("3. Tindak Lanjut (Action Items)", level=1)
        doc.add_paragraph(
            "1. SMG melengkapi dokumen teknis dan penawaran harga sesuai hasil klarifikasi.\n"
            "2. Klien melakukan review internal atas alternatif solusi yang telah disepakati."
        )

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
        clean_name = "Dokumen"

    type_labels = {
        "matrix": "Matriks-Tender",
        "narrative": "Proposal-Teknis",
        "sow": "Statement-of-Work",
        "solution_brief": "Solution-Brief",
        "mom": "Minutes-of-Meeting",
    }
    file_prefix = type_labels.get(payload.template_type, "Proposal")

    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{file_prefix}-{clean_name}.docx"'},
    )


class ExportPptxRequest(BaseModel):
    document_title: str
    company_name: str = "PT Solusi Mitra Gemilang (SMG)"
    items: list[ExportDocxItem]


@router.post("/export-pptx")
def export_proposal_pptx(payload: ExportPptxRequest):
    """Generate a high-impact presentation slide deck (.pptx) from drafted items."""
    import io
    from datetime import datetime
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    from fastapi.responses import StreamingResponse

    prs = Presentation()
    # 16:9 widescreen
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    blank_slide_layout = prs.slide_layouts[6]

    # Slide 1: Cover
    cover_slide = prs.slides.add_slide(blank_slide_layout)
    # Background card
    cover_box = cover_slide.shapes.add_textbox(Inches(1.0), Inches(1.5), Inches(11.333), Inches(4.5))
    tf = cover_box.text_frame
    tf.word_wrap = True

    p_badge = tf.paragraphs[0]
    p_badge.text = "SOLUTION PRESENTATION & TECHNICAL PITCH"
    p_badge.font.size = Pt(14)
    p_badge.font.bold = True
    p_badge.font.color.rgb = RGBColor(0xD9, 0x77, 0x06)  # Amber accent

    p_title = tf.add_paragraph()
    p_title.text = payload.document_title
    p_title.font.size = Pt(36)
    p_title.font.bold = True
    p_title.font.color.rgb = RGBColor(0x11, 0x18, 0x27)
    p_title.space_before = Pt(14)

    p_sub = tf.add_paragraph()
    p_sub.text = f"Dipersiapkan oleh: {payload.company_name} · {datetime.now().strftime('%d %B %Y')}"
    p_sub.font.size = Pt(16)
    p_sub.font.color.rgb = RGBColor(0x4B, 0x55, 0x63)
    p_sub.space_before = Pt(12)

    # Slide 2: Agenda / Executive Summary
    agenda_slide = prs.slides.add_slide(blank_slide_layout)
    ag_box = agenda_slide.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.333), Inches(1.2))
    tf_ag = ag_box.text_frame
    p_h = tf_ag.paragraphs[0]
    p_h.text = "Ringkasan Eksekutif & Agenda Pemaparan"
    p_h.font.size = Pt(24)
    p_h.font.bold = True
    p_h.font.color.rgb = RGBColor(0x11, 0x18, 0x27)

    ag_body = agenda_slide.shapes.add_textbox(Inches(1.0), Inches(2.2), Inches(11.333), Inches(4.5))
    tf_body = ag_body.text_frame
    tf_body.word_wrap = True

    p_intro = tf_body.paragraphs[0]
    p_intro.text = (
        f"Presentasi ini menyajikan usulan solusi menyeluruh untuk {payload.document_title}. "
        f"Kami telah menganalisis {len(payload.items)} butir kebutuhan spesifikasi teknis dan "
        "merumuskan pendekatan arsitektur terbaik."
    )
    p_intro.font.size = Pt(14)
    p_intro.font.color.rgb = RGBColor(0x37, 0x41, 0x51)

    points = [
        f"Analisis Kebutuhan Teknis ({len(payload.items)} Klausul Utama)",
        "Pendekatan Arsitektur Solusi Teruji & Praktik Terbaik SMG",
        "Komitmen Deliverables, Tata Kelola Proyek, dan SLA Implementasi",
        "Keunggulan Kompetitif & Nilai Tambah Kemitraan SMG",
    ]
    for pt in points:
        p_pt = tf_body.add_paragraph()
        p_pt.text = f"• {pt}"
        p_pt.font.size = Pt(14)
        p_pt.font.bold = True
        p_pt.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
        p_pt.space_before = Pt(8)

    # Slides 3..N: Content Slides (Max 10 per deck to keep concise)
    for idx, item in enumerate(payload.items[:12], start=1):
        slide = prs.slides.add_slide(blank_slide_layout)

        # Header Title
        hdr_box = slide.shapes.add_textbox(Inches(1.0), Inches(0.6), Inches(11.333), Inches(1.0))
        tf_hdr = hdr_box.text_frame
        p_cat = tf_hdr.paragraphs[0]
        p_cat.text = f"KLAUSUL #{idx} · {item.category.upper()}"
        p_cat.font.size = Pt(11)
        p_cat.font.bold = True
        p_cat.font.color.rgb = RGBColor(0xD9, 0x77, 0x06)

        p_t = tf_hdr.add_paragraph()
        p_t.text = item.title
        p_t.font.size = Pt(22)
        p_t.font.bold = True
        p_t.font.color.rgb = RGBColor(0x11, 0x18, 0x27)

        # Left Box: Kebutuhan Klien
        left_box = slide.shapes.add_textbox(Inches(1.0), Inches(1.8), Inches(5.3), Inches(4.8))
        tf_l = left_box.text_frame
        tf_l.word_wrap = True
        p_lh = tf_l.paragraphs[0]
        p_lh.text = "📋 Kebutuhan Dokumen Tender"
        p_lh.font.size = Pt(14)
        p_lh.font.bold = True
        p_lh.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

        p_lb = tf_l.add_paragraph()
        p_lb.text = item.requirement_text
        p_lb.font.size = Pt(12)
        p_lb.font.color.rgb = RGBColor(0x4B, 0x55, 0x63)
        p_lb.space_before = Pt(8)

        # Right Box: Solusi SMG
        right_box = slide.shapes.add_textbox(Inches(6.8), Inches(1.8), Inches(5.5), Inches(4.8))
        tf_r = right_box.text_frame
        tf_r.word_wrap = True
        p_rh = tf_r.paragraphs[0]
        p_rh.text = f"⚡ Tanggapan & Komitmen {payload.company_name}"
        p_rh.font.size = Pt(14)
        p_rh.font.bold = True
        p_rh.font.color.rgb = RGBColor(0x05, 0x96, 0x69)

        p_rb = tf_r.add_paragraph()
        p_rb.text = item.draft_text.strip() if item.draft_text.strip() else "[Tanggapan belum disusun]"
        p_rb.font.size = Pt(12)
        p_rb.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
        p_rb.space_before = Pt(8)

    # Closing Slide: Q&A / Terima Kasih
    close_slide = prs.slides.add_slide(blank_slide_layout)
    close_box = close_slide.shapes.add_textbox(Inches(1.0), Inches(2.2), Inches(11.333), Inches(3.5))
    tf_c = close_box.text_frame
    tf_c.word_wrap = True

    p_c1 = tf_c.paragraphs[0]
    p_c1.text = "Terima Kasih"
    p_c1.font.size = Pt(40)
    p_c1.font.bold = True
    p_c1.font.color.rgb = RGBColor(0x11, 0x18, 0x27)
    p_c1.alignment = PP_ALIGN.CENTER

    p_c2 = tf_c.add_paragraph()
    p_c2.text = f"Diskusi Solusi Teknis & Tanya Jawab · {payload.company_name}"
    p_c2.font.size = Pt(16)
    p_c2.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
    p_c2.space_before = Pt(12)
    p_c2.alignment = PP_ALIGN.CENTER

    bio_ppt = io.BytesIO()
    prs.save(bio_ppt)
    bio_ppt.seek(0)

    clean_name = "".join(c for c in payload.document_title if c.isalnum() or c in ("-", "_")).strip()
    if not clean_name:
        clean_name = "PitchDeck"

    return StreamingResponse(
        bio_ppt,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="PitchDeck-{clean_name}.pptx"'},
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

    from collections import defaultdict

    # ── AI section mapping: match each item to the most fitting template heading ──
    headings = [
        {"index": idx, "text": sec.text.strip()}
        for idx, sec in enumerate(payload.template_sections)
        if sec.text.strip() and (sec.level > 0 or "heading" in sec.style_name.lower())
    ]
    items_for_mapping = [
        {
            "id": it.id,
            "title": it.title,
            "category": it.category,
            "requirement_text": it.requirement_text,
        }
        for it in payload.items
    ]
    item_to_heading_index = get_llm_provider().map_items_to_sections(headings, items_for_mapping)
    items_by_id = {it.id: it for it in payload.items}
    items_by_heading_index: dict[int, list[ExportFromTemplateItem]] = defaultdict(list)
    for item_id, heading_index in item_to_heading_index.items():
        items_by_heading_index[heading_index].append(items_by_id[item_id])

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


# ─────────────────────────────────────────────────────────────────────────────
# IN-PLACE TEMPLATE CLONING
# Upload actual .docx template + items → replace placeholders → return filled .docx
# Preserves ALL original formatting: styles, headers, footers, tables, margins.
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/clone-template")
async def clone_template(
    template: UploadFile,
    items_json: str = "",
    document_title: str = "",
    company_name: str = "PT Solusi Mitra Gemilang (SMG)",
):
    """
    In-place template cloning endpoint.

    Form fields:
      - template: the .docx template file binary (multipart file upload)
      - items_json: JSON string of [{id, title, requirement_text, category, draft_text, status}]
      - document_title: title of the TOR/RFP document
      - company_name: name of the responding company

    Supported placeholders in the template (case-insensitive):
      {{COMPILED_RESPONSES}}  or  [TANGGAPAN_SEMUA]  — replaced with all items formatted
      {{DOCUMENT_TITLE}}                              — TOR/RFP document name
      {{COMPANY_NAME}}                               — company name
      {{TOTAL_ITEMS}}                                — total count
      {{DATE}}                                       — today's date

    The template structure (headings, fonts, page layout, headers/footers, tables)
    is preserved exactly. Only placeholder text is substituted.
    """
    import json
    import re
    from datetime import datetime
    from fastapi import Form
    from fastapi.responses import StreamingResponse
    from docx import Document as DocxDocument
    from docx.shared import Pt, RGBColor, Inches

    # Read template bytes
    data = await template.read()
    name = (template.filename or "template.docx").lower()
    if not (name.endswith(".docx") or template.content_type == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )):
        raise HTTPException(status_code=400, detail="Template harus berformat .docx")

    # Parse items
    try:
        raw_items = json.loads(items_json) if items_json.strip() else []
    except Exception:
        raw_items = []

    # Build replacement values
    today = datetime.now().strftime("%d %B %Y")
    final_items = [it for it in raw_items if it.get("status") in ("final", "draft") and it.get("draft_text", "").strip()]

    # Build the compiled responses block
    compiled_lines = []
    for idx, it in enumerate(final_items, start=1):
        compiled_lines.append(
            f"{idx}. {it.get('title', '')} [{it.get('category', '')}]\n"
            f"Klausul Tender: {it.get('requirement_text', '')}\n"
            f"Tanggapan {company_name}:\n{it.get('draft_text', '')}\n"
            f"{'─' * 60}"
        )
    compiled_text = "\n\n".join(compiled_lines) if compiled_lines else "[Belum ada tanggapan yang berstatus Draf atau Final]"

    REPLACEMENTS = {
        r"\{\{COMPILED_RESPONSES\}\}": compiled_text,
        r"\[TANGGAPAN_SEMUA\]": compiled_text,
        r"\[ISI_KONTEN\]": compiled_text,
        r"\{\{DOCUMENT_TITLE\}\}": document_title or "—",
        r"\[JUDUL_DOKUMEN\]": document_title or "—",
        r"\{\{COMPANY_NAME\}\}": company_name,
        r"\[NAMA_PERUSAHAAN\]": company_name,
        r"\{\{TOTAL_ITEMS\}\}": str(len(final_items)),
        r"\{\{DATE\}\}": today,
        r"\[TANGGAL\]": today,
    }

    def _replace_in_paragraph(para) -> bool:
        """Replace placeholder tokens in a paragraph's runs, preserving run formatting."""
        # Merge all run text for detection
        full_text = "".join(r.text for r in para.runs)
        new_text = full_text
        for pattern, replacement in REPLACEMENTS.items():
            new_text = re.sub(pattern, replacement, new_text, flags=re.IGNORECASE)
        if new_text == full_text:
            return False
        # Clear all runs and put replacement in first run
        if para.runs:
            para.runs[0].text = new_text
            for r in para.runs[1:]:
                r.text = ""
        else:
            para.add_run(new_text)
        return True

    # Open template and replace placeholders throughout
    doc = DocxDocument(io.BytesIO(data))

    for para in doc.paragraphs:
        _replace_in_paragraph(para)

    # Also process tables
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    _replace_in_paragraph(para)

    # Also process headers and footers
    for section in doc.sections:
        for header_para in (section.header.paragraphs if section.header else []):
            _replace_in_paragraph(header_para)
        for footer_para in (section.footer.paragraphs if section.footer else []):
            _replace_in_paragraph(footer_para)

    bio = io.BytesIO()
    doc.save(bio)
    bio.seek(0)

    clean_name = "".join(c for c in (document_title or "Proposal") if c.isalnum() or c in ("-", "_")).strip() or "Proposal"
    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="Proposal-Cloned-{clean_name}.docx"'},
    )

