import io
import logging
import re

from typing import Optional
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.services.retrieval import (
    retrieve_relevant_chunks,
    retrieve_relevant_chunks_with_sources,
)
from app.services.llm_provider import (
    _fallback_map_items_to_sections,
    _fallback_segment_text,
    format_llm_error,
    get_llm_provider,
)
from app.services.image_search import search_public_images, download_and_optimize_image
from app.services.diagram_generator import generate_hld_mermaid, render_mermaid_to_image
from app.services.template_extractor import extract_images_from_office_bytes
from app.db import get_session

logger = logging.getLogger(__name__)

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
    reference_doc_ids: list[str] = []
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
    image_data_url: Optional[str] = None
    image_caption: Optional[str] = None


class QualityCheckInput(BaseModel):
    id: str
    title: str
    requirement_text: str
    category: str
    draft_text: str
    status: str


class QualityCheckRequest(BaseModel):
    items: list[QualityCheckInput]


class QualityCheckItem(BaseModel):
    item_id: str
    title: str
    category: str = ""
    status: str
    score: int
    issues: list[str] = []
    missing_values: list[str] = []
    suggestions: list[str] = []


class QualityCheckResponse(BaseModel):
    overall_score: int
    total_items: int
    items_with_issues: int
    results: list[QualityCheckItem]


class RecommendStructureRequest(BaseModel):
    tor_text: str
    doc_type: str = "narrative"
    document_title: str = ""
    instruction: str = ""


class RecommendedSection(BaseModel):
    id: str
    title: str
    category: str
    requirement_text: str
    rationale: str = ""


class RecommendStructureResponse(BaseModel):
    items: list[RecommendedSection]
    summary: str = ""


@router.post("/recommend-structure", response_model=RecommendStructureResponse)
def recommend_document_structure(payload: RecommendStructureRequest):
    """Analyze the uploaded source document (TOR/RKS/KAK) and recommend an adaptive,
    grounded section structure with specific rationales before drafting begins."""
    provider = get_llm_provider()
    raw_sections = provider.recommend_structure(
        tor_text=payload.tor_text,
        doc_type=payload.doc_type,
        document_title=payload.document_title,
        instruction=payload.instruction,
    )
    items: list[RecommendedSection] = []
    for idx, sec in enumerate(raw_sections, start=1):
        items.append(RecommendedSection(
            id=str(sec.get("id") or f"sec-{idx}"),
            title=str(sec.get("title") or f"Bagian {idx}"),
            category=str(sec.get("category") or "Teknis"),
            requirement_text=str(sec.get("requirement_text") or ""),
            rationale=str(sec.get("rationale") or f"Disusun berdasarkan analisis kebutuhan dokumen {payload.document_title or 'tender'}."),
        ))
    summary = (
        f"Berhasil menyusun {len(items)} rekomendasi sub-bab yang diselaraskan dengan kebutuhan "
        f"'{payload.document_title or 'dokumen tender'}' ({payload.doc_type})."
    )
    return RecommendStructureResponse(items=items, summary=summary)


@router.post("/quality-check", response_model=QualityCheckResponse)
def quality_check_draft(payload: QualityCheckRequest):
    """Run intelligent presales preflight checks & compliance scoring before a proposal is exported."""
    placeholder_pattern = re.compile(
        r"\[\s*(?:belum|isi|fill|content|tanggapan|solusi)|\{\{.*?\}\}|\b(?:TBD|TODO|FIXME)\b",
        re.IGNORECASE,
    )
    number_pattern = re.compile(r"\b\d+(?:[.,]\d+)?(?:\s?[xX]\s?\d+)?%?\b")
    vague_pattern = re.compile(
        r"\b(?:akan diusahakan|diupayakan sebisanya|bila memungkinkan|jika ada waktu|sebisanya|belum ditentukan|tentatif|dapat berubah sewaktu-waktu)\b",
        re.IGNORECASE,
    )
    results: list[QualityCheckItem] = []

    for item in payload.items:
        draft = (item.draft_text or "").strip()
        requirement = item.requirement_text or ""
        category = item.category or "Teknis"
        issues: list[str] = []
        missing_values: list[str] = []
        suggestions: list[str] = []

        if not draft:
            issues.append("Draf bagian ini masih kosong.")
            suggestions.append("Gunakan tombol 'Generate dengan AI' untuk membuat draf awal berbasis dokumen acuan.")
        elif len(draft) < 40:
            issues.append("Penjelasan terlalu singkat untuk review teknis tender.")
            suggestions.append("Elaborasi dengan menambahkan detail spesifikasi arsitektur atau metodologi kerja.")

        if placeholder_pattern.search(draft):
            issues.append("Masih terdapat placeholder atau penanda teks sementara (TBD/TODO/[belum]).")
            suggestions.append("Lengkapi nilai yang ditandai tanda kurung atau placeholder sebelum diekspor.")

        if vague_pattern.search(draft):
            issues.append("Ditemukan komitmen ambigu/tentatif yang berisiko melemahkan posisi kepatuhan tender.")
            suggestions.append("Ganti kalimat tentatif dengan komitmen tegas (misalnya: 'SMG menjamin pemenuhan...', 'SLA ditetapkan pasti...').")

        # Specific domain audits
        if category in ("SLA & Support", "Support") or "sla" in requirement.lower() or "pemeliharaan" in requirement.lower():
            if not re.search(r"\b(?:24x7|24/7|response time|menit|jam|preventive|corrective|pm|cm|eskalasi)\b", draft, re.IGNORECASE):
                issues.append("Belum mencantumkan parameter Service Level Agreement (SLA) eksplisit.")
                suggestions.append("Cantumkan response time insiden (misal: 15 menit Sev 1) dan jadwal pemeliharaan berkala (PM/CM).")

        for value in number_pattern.findall(requirement):
            normalized = value.replace(" ", "")
            if normalized not in draft.replace(" ", "") and value not in missing_values:
                missing_values.append(value)
        if missing_values:
            issues.append(f"Target angka dari brief kebutuhan belum tercantum di draf: {', '.join(missing_values[:3])}")
            suggestions.append(f"Tegaskan kembali pemenuhan metrik angka ({', '.join(missing_values[:3])}) agar evaluator mudah memberi skor penuh.")

        if not issues:
            score = 100
            check_status = "pass"
            suggestions.append("Kualitas draf sangat baik dan siap diekspor.")
        elif not draft:
            score = 0
            check_status = "fail"
        else:
            score = max(20, 100 - len(issues) * 20)
            check_status = "warning" if score >= 60 else "fail"

        results.append(QualityCheckItem(
            item_id=item.id,
            title=item.title,
            category=category,
            status=check_status,
            score=score,
            issues=issues,
            missing_values=missing_values,
            suggestions=suggestions,
        ))

    overall_score = round(sum(result.score for result in results) / len(results)) if results else 0
    return QualityCheckResponse(
        overall_score=overall_score,
        total_items=len(results),
        items_with_issues=sum(1 for result in results if result.issues),
        results=results,
    )


@router.post("", response_model=DraftResponse)
def generate_draft(payload: DraftRequest, session: Session = Depends(get_session)):
    # Ground the draft in both the uploaded TOR and the knowledge base
    kb_chunks = retrieve_relevant_chunks(session, payload.workspace_id, payload.instruction)
    context = [payload.tor_text] + kb_chunks

    try:
        provider = get_llm_provider()
        draft = provider.answer(payload.instruction, context, mode="draft")
    except Exception as exc:
        draft = f"[LLM tidak tersedia: {format_llm_error(exc)}]\n\nSilakan tulis draf secara manual."
    return DraftResponse(draft_text=draft, sources_used=len(context))


@router.post("/segment", response_model=SegmentResponse)
def segment_tor(payload: SegmentRequest):
    """Break down an extracted TOR/RFP document into discrete requirements/clauses."""
    if not payload.tor_text or not payload.tor_text.strip():
        return SegmentResponse(items=[])

    try:
        provider = get_llm_provider()
        raw_items = provider.segment_document(payload.tor_text)
    except Exception:
        raw_items = _fallback_segment_text(payload.tor_text)
    items = [SegmentItem(**it) for it in raw_items]
    return SegmentResponse(items=items)


@router.post("/item", response_model=DraftItemResponse)
def draft_item(payload: DraftItemRequest, session: Session = Depends(get_session)):
    """Generate a grounded draft response for a single requirement item."""
    query = payload.requirement_text
    if payload.instruction:
        query = f"{payload.requirement_text} {payload.instruction}"

    kb_chunks, sources = retrieve_relevant_chunks_with_sources(
        session, payload.workspace_id, query, top_k=5,
        doc_ids=payload.reference_doc_ids or None,
    )

    from app.services.embeddings import semantic_select_tor_excerpt

    context = []
    if payload.tor_context and payload.tor_context.strip():
        relevant_tor = semantic_select_tor_excerpt(payload.tor_context, query, top_k=5, max_chars=6000)
        if relevant_tor:
            context.append(f"Konteks TOR/RFP Terkait:\n{relevant_tor}")
    context.extend(kb_chunks)

    user_prompt = f"Brief/Tujuan Bagian Dokumen:\n{payload.requirement_text}"
    if payload.instruction:
        user_prompt += f"\n\nInstruksi Spesifik:\n{payload.instruction}"

    try:
        provider = get_llm_provider()
        draft = provider.answer(user_prompt, context, mode="draft")
    except Exception as e:
        draft = (
            f"[LLM tidak tersedia: {format_llm_error(e)}]\n\n"
            f"Brief bagian: {payload.requirement_text}\n\n"
            "Silakan tulis atau sesuaikan draf manual di sini."
        )

    source_models = [SourceMeta(**s) for s in sources]

    # Auto-detect visual intent if item involves architecture or enterprise hardware
    image_data_url = None
    image_caption = None
    lower_scope = f"{payload.requirement_text} {payload.instruction or ''} {draft[:300]}".lower()

    if any(k in lower_scope for k in ("hld", "high level design", "arsitektur", "topologi", "architecture diagram")):
        try:
            hld_res = generate_hld_mermaid(
                tor_text=payload.tor_context or payload.requirement_text,
                solution_text=draft,
                title=f"Arsitektur Solusi {payload.requirement_text[:40]}"
            )
            code = hld_res.get("mermaid_code", "")
            rendered = render_mermaid_to_image(code)
            if rendered and rendered.get("data_url"):
                image_data_url = rendered.get("data_url")
                image_caption = hld_res.get("caption", f"Gambar: Arsitektur High Level Design (HLD) Solusi {payload.requirement_text[:40]}")
        except Exception as err:
            logger.warning("Auto HLD visual generation failed for item %s: %s", payload.item_id, err)

    elif any(k in lower_scope for k in ("server", "storage", "switch", "firewall", "dl360", "pure storage", "cisco", "fortinet", "san", "nas", "flash array", "poweredge")):
        try:
            hw_query = None
            if "dl360" in lower_scope:
                hw_query = "HPE ProLiant DL360 Server"
            elif "pure storage" in lower_scope or "flasharray" in lower_scope or "rc20" in lower_scope:
                hw_query = "Pure Storage FlashArray"
            elif "cisco" in lower_scope:
                hw_query = "Cisco Catalyst Switch"
            elif "fortinet" in lower_scope or "fortigate" in lower_scope:
                hw_query = "Fortinet FortiGate Firewall"
            elif "poweredge" in lower_scope:
                hw_query = "Dell PowerEdge Server"
            elif "storage" in lower_scope:
                hw_query = "Enterprise Storage SAN NAS"
            elif "server" in lower_scope:
                hw_query = "Rackmount Enterprise Server"

            if hw_query:
                imgs = search_public_images(hw_query, limit=3)
                for img in imgs:
                    opt = download_and_optimize_image(img.get("image_url", ""))
                    if opt and opt.get("data_url"):
                        image_data_url = opt.get("data_url")
                        image_caption = f"Gambar: Ilustrasi Perangkat {hw_query}"
                        break
        except Exception as err:
            logger.warning("Auto hardware visual search failed for item %s: %s", payload.item_id, err)

    return DraftItemResponse(
        item_id=payload.item_id,
        draft_text=draft,
        sources_used=len(kb_chunks),
        sources=source_models,
        image_data_url=image_data_url,
        image_caption=image_caption,
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


@router.post("/convert-office-pdf")
async def convert_office_pdf(file: UploadFile):
    """Convert generated DOCX/PPTX to PDF using native Microsoft Office."""
    from fastapi.responses import StreamingResponse
    from app.services.office_render import convert_office_to_pdf

    filename = file.filename or "document"
    extension = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in {".docx", ".pptx"}:
        raise HTTPException(status_code=400, detail="Only DOCX and PPTX files are supported")
    try:
        data = convert_office_to_pdf(await file.read(), extension)
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="pywin32 belum terpasang di backend") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Microsoft Office gagal merender PDF: {exc}") from exc

    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename.rsplit(".", 1)[0]}.pdf"'},
    )


class ExportDocxItem(BaseModel):
    id: str
    title: str
    requirement_text: str
    category: str
    draft_text: str
    status: str
    image_data_url: Optional[str] = None
    image_caption: Optional[str] = None


class SearchImagesRequest(BaseModel):
    query: str
    limit: int = 8


class SearchImagesResponse(BaseModel):
    items: list[dict]


class DownloadImageRequest(BaseModel):
    image_url: str


class GenerateHldRequest(BaseModel):
    tor_text: str
    solution_text: str = ""
    title: str = "High Level Design"


class GenerateHldResponse(BaseModel):
    mermaid_code: str
    caption: str
    architecture_narrative: str
    image_data_url: Optional[str] = None


class RenderMermaidRequest(BaseModel):
    mermaid_code: str


class RenderMermaidResponse(BaseModel):
    data_url: Optional[str] = None
    engine: str = ""


@router.post("/search-images", response_model=SearchImagesResponse)
def search_images(payload: SearchImagesRequest):
    """Search public enterprise hardware photos and diagrams via DuckDuckGo and Wikimedia Commons."""
    results = search_public_images(payload.query, payload.limit)
    return SearchImagesResponse(items=results)


@router.post("/download-image")
def download_image(payload: DownloadImageRequest):
    """Download, validate with Pillow, optimize, and convert an image URL into a base64 data URL."""
    result = download_and_optimize_image(payload.image_url)
    if not result:
        raise HTTPException(status_code=400, detail="Gagal mengunduh atau memproses gambar dari URL tersebut.")
    return result


@router.post("/generate-hld", response_model=GenerateHldResponse)
def generate_hld(payload: GenerateHldRequest):
    """Synthesize existing TOR conditions + proposed solution into a Mermaid architecture diagram and render to PNG."""
    result = generate_hld_mermaid(payload.tor_text, payload.solution_text, payload.title)
    code = result.get("mermaid_code", "")
    rendered = render_mermaid_to_image(code)
    return GenerateHldResponse(
        mermaid_code=code,
        caption=result.get("caption", f"Gambar: Arsitektur High Level Design (HLD) Solusi {payload.title}"),
        architecture_narrative=result.get("architecture_narrative", ""),
        image_data_url=rendered.get("data_url") if rendered else None,
    )


@router.post("/render-mermaid", response_model=RenderMermaidResponse)
def render_mermaid(payload: RenderMermaidRequest):
    """Render a Mermaid code snippet into an optimized PNG base64 data URL."""
    rendered = render_mermaid_to_image(payload.mermaid_code)
    if not rendered:
        raise HTTPException(status_code=400, detail="Gagal me-render diagram Mermaid.")
    return RenderMermaidResponse(
        data_url=rendered.get("data_url"),
        engine=rendered.get("engine", "kroki"),
    )


@router.post("/extract-template-images")
async def extract_template_images(file: UploadFile):
    """Extract embedded images/diagrams from an uploaded .docx or .pptx template."""
    content = await file.read()
    images = extract_images_from_office_bytes(content)
    return {"images": images}


class ExportPreflightRequest(BaseModel):
    output_type: str = "pdf"
    items: list[ExportDocxItem]


class ExportPreflightResponse(BaseModel):
    estimated_pages: int
    warnings: list[str]
    blocking_issues: list[str]
    ready: bool


@router.post("/export-preflight", response_model=ExportPreflightResponse)
def export_preflight(payload: ExportPreflightRequest):
    """Run fast layout/content checks before generating an export file."""
    warnings: list[str] = []
    blocking_issues: list[str] = []
    placeholder_pattern = re.compile(
        r"\[\s*(?:belum|isi|fill|content|tanggapan|solusi)|\{\{.*?\}\}",
        re.IGNORECASE,
    )
    total_characters = 0

    if not payload.items:
        blocking_issues.append("Tidak ada bagian yang dipilih untuk diekspor")
    if len(payload.items) > 60:
        warnings.append("Jumlah bagian besar; hasil export dapat menjadi dokumen panjang")

    for item in payload.items:
        draft = (item.draft_text or "").strip()
        total_characters += len(item.requirement_text or "") + len(draft) + len(item.title or "")
        if not draft:
            blocking_issues.append(f"Jawaban kosong: {item.title}")
        if placeholder_pattern.search(draft):
            warnings.append(f"Placeholder masih tersisa: {item.title}")
        if len(item.title) > 100:
            warnings.append(f"Judul panjang berisiko memenuhi satu baris: {item.title[:80]}...")
        if len(draft) > 2500:
            warnings.append(f"Jawaban panjang; periksa potensi overflow: {item.title}")

    estimated_pages = max(1, (total_characters + 3499) // 3500)
    if estimated_pages > 20:
        warnings.append(f"Estimasi {estimated_pages} halaman; pertimbangkan membagi dokumen")

    return ExportPreflightResponse(
        estimated_pages=estimated_pages,
        warnings=list(dict.fromkeys(warnings)),
        blocking_issues=list(dict.fromkeys(blocking_issues)),
        ready=not blocking_issues,
    )


def _decode_logo_bytes(data_url: str) -> bytes | None:
    if not (data_url.startswith("data:image/") and ";base64," in data_url):
        return None
    import base64

    try:
        decoded = base64.b64decode(data_url.split(";base64,", 1)[1], validate=True)
        from PIL import Image

        with Image.open(io.BytesIO(decoded)) as image:
            image.verify()
        return decoded
    except (ValueError, base64.binascii.Error, OSError):
        return None


def add_formatted_text(paragraph, text: str, base_color=None):
    """Parse inline **bold**, *italic*, and `code` into styled docx runs."""
    tokens = re.split(r'(\*\*.*?\*\*|\*.*?\*|`.*?`)', text)
    from docx.shared import Pt
    for token in tokens:
        if not token:
            continue
        if token.startswith('**') and token.endswith('**') and len(token) >= 4:
            run = paragraph.add_run(token[2:-2])
            run.bold = True
        elif token.startswith('*') and token.endswith('*') and len(token) >= 2:
            run = paragraph.add_run(token[1:-1])
            run.italic = True
        elif token.startswith('`') and token.endswith('`') and len(token) >= 2:
            run = paragraph.add_run(token[1:-1])
            run.font.name = 'Consolas'
            run.font.size = Pt(9)
        else:
            run = paragraph.add_run(token)
        if base_color:
            run.font.color.rgb = base_color


def render_markdown_to_docx(doc, markdown_text: str, heading_offset: int = 2):
    """Convert raw markdown text with tables, headings, bullets into native DOCX elements."""
    if not markdown_text or not markdown_text.strip():
        return
    from docx.shared import Inches, Pt, RGBColor
    from docx.oxml import parse_xml
    from docx.oxml.ns import nsdecls

    lines = markdown_text.split('\n')
    i = 0
    table_lines = []

    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        # 1. Check for Table block
        if stripped.startswith('|') and stripped.endswith('|'):
            table_lines.append(stripped)
            i += 1
            while i < len(lines) and lines[i].strip().startswith('|') and lines[i].strip().endswith('|'):
                table_lines.append(lines[i].strip())
                i += 1

            if len(table_lines) >= 2:
                data_rows = []
                for t_line in table_lines:
                    if re.match(r'^\|[\s\-:|]+\|$', t_line):
                        continue
                    cells = [c.strip() for c in t_line.strip('|').split('|')]
                    data_rows.append(cells)

                if data_rows:
                    from docx.enum.table import WD_TABLE_ALIGNMENT
                    num_cols = max(len(r) for r in data_rows)
                    tbl = doc.add_table(rows=len(data_rows), cols=num_cols)
                    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
                    tbl.autofit = False

                    # CSUL Enterprise Table Styling: clean horizontal borders, zero heavy vertical lines
                    tbl_borders = parse_xml(
                        f'<w:tblBorders {nsdecls("w")}>'
                        f'<w:top w:val="single" w:sz="6" w:space="0" w:color="D1D5DB"/>'
                        f'<w:left w:val="none"/>'
                        f'<w:bottom w:val="single" w:sz="12" w:space="0" w:color="4A86E8"/>'
                        f'<w:right w:val="none"/>'
                        f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>'
                        f'<w:insideV w:val="none"/>'
                        f'</w:tblBorders>'
                    )
                    tbl._tbl.tblPr.append(tbl_borders)

                    # Distribute column widths across 6.5 inches
                    col_width_in = Inches(6.5 / max(num_cols, 1))

                    # Mark row 0 as tblHeader so Word repeats the header if table breaks across pages
                    try:
                        tbl.rows[0]._tr.get_or_add_trPr().append(parse_xml(r'<w:tblHeader %s/>' % nsdecls('w')))
                    except Exception:
                        pass

                    for r_idx, row in enumerate(data_rows):
                        for c_idx in range(num_cols):
                            cell_val = row[c_idx] if c_idx < len(row) else ""
                            cell = tbl.cell(r_idx, c_idx)
                            cell.width = col_width_in
                            cell.text = ""
                            p = cell.paragraphs[0]
                            p.paragraph_format.space_before = Pt(3.5)
                            p.paragraph_format.space_after = Pt(3.5)
                            if r_idx == 0:
                                add_formatted_text(p, cell_val)
                                for r in p.runs:
                                    r.bold = True
                                    r.font.size = Pt(9.5)
                                    r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                                shading = parse_xml(r'<w:shd {} w:fill="4A86E8"/>'.format(nsdecls('w')))
                                cell._tc.get_or_add_tcPr().append(shading)
                            else:
                                add_formatted_text(p, cell_val)
                                for r in p.runs:
                                    r.font.size = Pt(9)
                                if r_idx % 2 == 1:
                                    shading = parse_xml(r'<w:shd {} w:fill="F8FAFC"/>'.format(nsdecls('w')))
                                    cell._tc.get_or_add_tcPr().append(shading)
                    p_spacer = doc.add_paragraph()
                    p_spacer.paragraph_format.space_after = Pt(4)

            table_lines = []
            continue

        # 2a. Check for Hierarchical Sub-section Headings like "2.1.1 Judul" or "3.2.1 Sizing"
        hierarchical_match = re.match(r'^(?:#{1,4}\s*)?(\d+\.\d+(?:\.\d+)+)\s+(.+)$', stripped)
        if hierarchical_match:
            sec_num, sec_title = hierarchical_match.groups()
            depth = len(sec_num.split('.'))
            level = min(max(depth, 2), 4)
            h = doc.add_heading(level=level)
            h.paragraph_format.keep_with_next = True
            h.paragraph_format.space_before = Pt(8)
            h.paragraph_format.space_after = Pt(2)
            base_color = RGBColor(0x1F, 0x49, 0x7D)
            add_formatted_text(h, f"{sec_num} {sec_title}", base_color=base_color)
            i += 1
            continue

        # 2b. Check for Standard Markdown Headings: ### or ## or #
        heading_match = re.match(r'^(#{1,4})\s+(.*)$', stripped)
        if heading_match:
            hashes, h_text = heading_match.groups()
            level = len(hashes) + (heading_offset - 1)
            level = min(max(level, 1), 4)
            h = doc.add_heading(level=level)
            h.paragraph_format.keep_with_next = True
            h.paragraph_format.space_before = Pt(6)
            h.paragraph_format.space_after = Pt(2)
            base_color = RGBColor(0x4A, 0x86, 0xE8) if level <= 2 else RGBColor(0x1F, 0x49, 0x7D)
            add_formatted_text(h, h_text, base_color=base_color)
            i += 1
            continue

        # 3. Check for Bullet Points
        bullet_match = re.match(r'^[-*]\s+(.*)$', stripped)
        if bullet_match:
            b_text = bullet_match.group(1)
            try:
                p = doc.add_paragraph(style='List Bullet')
            except Exception:
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.space_after = Pt(2.5)
            add_formatted_text(p, b_text)
            i += 1
            continue

        # 4. Check for Numbered Points
        num_match = re.match(r'^(\d+\.)\s+(.*)$', stripped)
        if num_match:
            num_prefix, n_text = num_match.groups()
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.space_after = Pt(2.5)
            r_num = p.add_run(num_prefix + " ")
            r_num.bold = True
            add_formatted_text(p, n_text)
            i += 1
            continue

        # 5. Check for Blockquote
        if stripped.startswith('>'):
            q_text = stripped[1:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.3)
            p.paragraph_format.space_after = Pt(3)
            add_formatted_text(p, q_text, base_color=RGBColor(0x4B, 0x55, 0x63))
            for r in p.runs:
                r.italic = True
            i += 1
            continue

        # 6. Empty line
        if not stripped:
            i += 1
            continue

        # 7. Normal paragraph
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(5)
        add_formatted_text(p, stripped)
        i += 1


def _insert_item_image_docx(doc, item, prefix: str = "Gambar"):
    if not getattr(item, "image_data_url", None):
        return
    img_bytes = _decode_logo_bytes(item.image_data_url)
    if not img_bytes:
        return
    try:
        from docx.shared import Inches, Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from PIL import Image

        with Image.open(io.BytesIO(img_bytes)) as pil_img:
            w_px, h_px = pil_img.size

        w_in = 5.2
        h_in = (h_px / w_px) * w_in if w_px > 0 else 3.0
        if h_in > 4.0:
            h_in = 4.0
            w_in = (w_px / h_px) * h_in if h_px > 0 else 5.2

        p_img = doc.add_paragraph()
        p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_img.paragraph_format.space_before = Pt(8)
        p_img.paragraph_format.space_after = Pt(2)
        run_img = p_img.add_run()
        run_img.add_picture(io.BytesIO(img_bytes), width=Inches(w_in), height=Inches(h_in))

        caption = getattr(item, "image_caption", None) or f"{prefix}: Visualisasi Solusi {item.title}"
        p_cap = doc.add_paragraph()
        p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_cap.paragraph_format.space_after = Pt(12)
        r_cap = p_cap.add_run(caption)
        r_cap.font.size = Pt(9)
        r_cap.italic = True
        r_cap.font.color.rgb = RGBColor(0x1F, 0x49, 0x7D)
    except Exception as exc:
        logger.warning(f"Failed to insert image for item '{item.title}' in DOCX: {exc}")


class ExportDocxRequest(BaseModel):
    document_title: str
    template_type: str = "narrative"  # "narrative" (Proposal Teknis CSUL) | "matrix" | "sow" etc.
    font_name: str = "Google Sans"
    company_name: str = "PT Smartnet Magna Global (SMG)"
    logo_data_url: str = ""
    customer_logo_data_url: str = ""
    items: list[ExportDocxItem]



@router.post("/export-docx")
def export_proposal_docx(payload: ExportDocxRequest):
    """Generate a formatted Microsoft Word (.docx) proposal from drafted requirements."""
    from datetime import datetime
    from fastapi.responses import StreamingResponse
    from docx import Document as DocxDocument
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
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

    # Configure running header & footer for narrative mode (CSUL Layout)
    if payload.template_type == "narrative" and doc.sections:
        main_sec = doc.sections[0]
        main_sec.different_first_page_header_footer = True

        p_head = main_sec.header.paragraphs[0]
        p_head.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_head = p_head.add_run(f"{payload.company_name or 'PT. Smartnet Magna Global'} · Proposal Teknis")
        r_head.font.size = Pt(8.5)
        r_head.font.color.rgb = RGBColor(0x9C, 0xA3, 0xAF)

        p_foot = main_sec.footer.paragraphs[0]
        r_fl = p_foot.add_run("CONFIDENTIAL · Dokumen Rahasia PT Smartnet Magna Global  |  Halaman ")
        r_fl.font.size = Pt(8.5)
        r_fl.font.color.rgb = RGBColor(0x9C, 0xA3, 0xAF)

        fldChar1 = parse_xml(r'<w:fldChar %s w:fldCharType="begin"/>' % nsdecls('w'))
        instrText = parse_xml(r'<w:instrText %s xml:space="preserve"> PAGE </w:instrText>' % nsdecls('w'))
        fldChar2 = parse_xml(r'<w:fldChar %s w:fldCharType="separate"/>' % nsdecls('w'))
        fldChar3 = parse_xml(r'<w:fldChar %s w:fldCharType="end"/>' % nsdecls('w'))
        p_foot._p.append(fldChar1)
        p_foot._p.append(instrText)
        p_foot._p.append(fldChar2)
        p_foot._p.append(fldChar3)

    # Header logos and Cover structure
    company_logo_bytes = _decode_logo_bytes(payload.logo_data_url)
    customer_logo_bytes = _decode_logo_bytes(payload.customer_logo_data_url)

    if payload.template_type == "narrative":
        if company_logo_bytes or customer_logo_bytes:
            logo_table = doc.add_table(rows=1, cols=2)
            logo_table.alignment = WD_TABLE_ALIGNMENT.CENTER
            tbl_borders = parse_xml(
                f'<w:tblBorders {nsdecls("w")}>'
                f'<w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>'
                f'<w:insideH w:val="none"/><w:insideV w:val="none"/>'
                f'</w:tblBorders>'
            )
            logo_table._tbl.tblPr.append(tbl_borders)
            cell_left = logo_table.cell(0, 0)
            cell_right = logo_table.cell(0, 1)
            cell_left.width = Inches(3.25)
            cell_right.width = Inches(3.25)
            p_left = cell_left.paragraphs[0]
            if company_logo_bytes:
                run_left = p_left.add_run()
                run_left.add_picture(io.BytesIO(company_logo_bytes), height=Inches(0.65))
            p_right = cell_right.paragraphs[0]
            p_right.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            if customer_logo_bytes:
                run_right = p_right.add_run()
                run_right.add_picture(io.BytesIO(customer_logo_bytes), height=Inches(0.65))

        title_p = doc.add_paragraph()
        title_p.paragraph_format.space_before = Pt(28)
        title_p.paragraph_format.space_after = Pt(8)
        title_run = title_p.add_run("Proposal Teknis")
        title_run.bold = True
        title_run.font.size = Pt(22)
        title_run.font.color.rgb = RGBColor(0x4A, 0x86, 0xE8)

        sub_p = doc.add_paragraph()
        sub_p.paragraph_format.space_after = Pt(36)
        sub_run = sub_p.add_run(payload.document_title or "Tanggapan Teknis & Usulan Solusi Enterprise")
        sub_run.bold = True
        sub_run.font.size = Pt(14)
        sub_run.font.color.rgb = RGBColor(0x1F, 0x49, 0x7D)

        t0 = doc.add_table(rows=3, cols=2)
        t0.alignment = WD_TABLE_ALIGNMENT.CENTER
        t0.autofit = False
        col_w = Inches(3.25)
        for row in t0.rows:
            row.cells[0].width = col_w
            row.cells[1].width = col_w

        p = t0.cell(0, 0).paragraphs[0]
        r = p.add_run("Prepared by")
        r.bold = True
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)

        p = t0.cell(0, 1).paragraphs[0]
        r = p.add_run("Prepared for")
        r.bold = True
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)

        p = t0.cell(2, 0).paragraphs[0]
        r = p.add_run(payload.company_name or "PT. Smartnet Magna Global")
        r.bold = True
        r.font.size = Pt(11)
        r.font.color.rgb = RGBColor(0x1F, 0x49, 0x7D)
        p.add_run("\nSolution Architect & Presales Division")

        p = t0.cell(2, 1).paragraphs[0]
        r = p.add_run(payload.document_title or "Panitia Pengadaan / Klien")
        r.bold = True
        r.font.size = Pt(11)
        r.font.color.rgb = RGBColor(0x1F, 0x49, 0x7D)
        p.add_run("\nTim Evaluator Teknis & Komite Pengadaan")

        tbl_borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>'
            f'<w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>'
            f'<w:insideH w:val="none"/><w:insideV w:val="none"/>'
            f'</w:tblBorders>'
        )
        t0._tbl.tblPr.append(tbl_borders)

        date_p = doc.add_paragraph()
        date_p.paragraph_format.space_before = Pt(36)
        date_p.paragraph_format.space_after = Pt(20)
        r_date = date_p.add_run(f"{datetime.now().strftime('%d %B %Y')} · Proposal Teknis Resmi")
        r_date.font.size = Pt(9.5)
        r_date.font.color.rgb = RGBColor(0x9C, 0xA3, 0xAF)

        doc.add_page_break()

        # Document Release
        h_rel = doc.add_heading(level=1)
        r_rel = h_rel.add_run("Document Release")
        r_rel.font.color.rgb = RGBColor(0x4A, 0x86, 0xE8)

        t1 = doc.add_table(rows=2, cols=5)
        t1.alignment = WD_TABLE_ALIGNMENT.CENTER
        t1.autofit = False
        headers_rel = ['Version', 'Date Release', 'Change Information', 'Related Page', 'Change']
        for idx_rel, text_rel in enumerate(headers_rel):
            cell_rel = t1.cell(0, idx_rel)
            p_rel = cell_rel.paragraphs[0]
            r_rel_hdr = p_rel.add_run(text_rel)
            r_rel_hdr.bold = True
            r_rel_hdr.font.size = Pt(9.5)
            r_rel_hdr.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            shd = parse_xml(r'<w:shd {} w:fill="4A86E8"/>'.format(nsdecls('w')))
            cell_rel._tc.get_or_add_tcPr().append(shd)

        row1_data = ['1.0', datetime.now().strftime('%d-%b-%Y'), 'N/A', 'N/A', '1st Draft Proposal Teknis']
        for idx_rel, text_rel in enumerate(row1_data):
            cell_rel = t1.cell(1, idx_rel)
            p_rel = cell_rel.paragraphs[0]
            p_rel.add_run(text_rel).font.size = Pt(9)

        doc.add_page_break()

        # Pengakuan Kerahasiaan (Non-Disclosure Statement) - CSUL Ground Truth
        h_nda = doc.add_heading(level=1)
        r_nda = h_nda.add_run("Pengakuan Kerahasiaan")
        r_nda.font.color.rgb = RGBColor(0x4A, 0x86, 0xE8)

        p_nda1 = doc.add_paragraph()
        p_nda1.paragraph_format.space_before = Pt(8)
        p_nda1.paragraph_format.space_after = Pt(8)
        r1 = p_nda1.add_run(
            f"Dokumen Proposal Teknis ini serta seluruh data, informasi teknis, konfigurasi arsitektur, metodologi, "
            f"dan rancangan solusi yang tercantum di dalamnya merupakan informasi rahasia dan hak kekayaan intelektual "
            f"milik {payload.company_name or 'PT Smartnet Magna Global'}."
        )
        r1.font.size = Pt(10)

        p_nda2 = doc.add_paragraph()
        p_nda2.paragraph_format.space_after = Pt(8)
        r2 = p_nda2.add_run(
            f"Dokumen ini diserahkan secara khusus dan terbatas kepada {payload.document_title or 'Klien'} "
            f"hanya untuk keperluan evaluasi teknis pengadaan. Pihak penerima dilarang keras menggandakan, "
            f"menyebarluaskan, memperlihatkan kepada pihak ketiga, atau memanfaatkan sebagian maupun seluruh isi "
            f"dokumen ini di luar tujuan evaluasi resmi tanpa izin tertulis terlebih dahulu dari {payload.company_name or 'PT Smartnet Magna Global'}."
        )
        r2.font.size = Pt(10)

        p_nda3 = doc.add_paragraph()
        p_nda3.paragraph_format.space_after = Pt(16)
        r3 = p_nda3.add_run(
            f"Seluruh komitmen teknis, tata kelola SLA, dan metodologi implementasi yang diajukan tunduk pada "
            f"ketentuan kontrak final yang akan disepakati bersama antara para pihak."
        )
        r3.font.size = Pt(10)
        r3.italic = True

        doc.add_page_break()

        # ── Daftar Isi (Table of Contents - CSUL Ground Truth) ──────────────
        h_toc = doc.add_heading(level=1)
        r_toc = h_toc.add_run("Daftar Isi")
        r_toc.font.color.rgb = RGBColor(0x4A, 0x86, 0xE8)

        for item_idx, item in enumerate(payload.items, start=1):
            title_clean = (item.title or f"Bagian {item_idx}").strip()
            num_match = re.match(r"^(\d+(\.\d+)*)\s*(.*)$", title_clean)
            is_sub = False
            if num_match:
                parts = [p for p in num_match.group(1).split('.') if p]
                is_sub = len(parts) > 1

            p_toc = doc.add_paragraph()
            p_toc.paragraph_format.space_after = Pt(3)
            p_toc.paragraph_format.tab_stops.add_tab_stop(Inches(6.5), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
            if is_sub:
                p_toc.paragraph_format.left_indent = Inches(0.25)
                r_item = p_toc.add_run(title_clean)
                r_item.font.size = Pt(9.5)
                r_item.font.color.rgb = RGBColor(0x37, 0x41, 0x51)
            else:
                r_item = p_toc.add_run(title_clean if num_match else f"{item_idx}. {title_clean}")
                r_item.bold = True
                r_item.font.size = Pt(10)
                r_item.font.color.rgb = RGBColor(0x11, 0x18, 0x27)
            p_toc.add_run("\t")

        # ── Daftar Gambar (Table of Figures) ────────────────────────────────
        images_attached = [
            it for it in payload.items if getattr(it, "image_data_url", None)
        ]
        if images_attached:
            p_gap = doc.add_paragraph()
            p_gap.paragraph_format.space_before = Pt(8)
            h_fig = doc.add_heading(level=1)
            r_fig = h_fig.add_run("Daftar Gambar")
            r_fig.font.color.rgb = RGBColor(0x4A, 0x86, 0xE8)

            for img_idx, img_item in enumerate(images_attached, start=1):
                cap = getattr(img_item, "image_caption", None) or f"Gambar {img_idx}: Visualisasi {img_item.title}"
                p_fig = doc.add_paragraph()
                p_fig.paragraph_format.space_after = Pt(3)
                p_fig.paragraph_format.tab_stops.add_tab_stop(Inches(6.5), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
                r_fig_cap = p_fig.add_run(cap)
                r_fig_cap.font.size = Pt(9.5)
                r_fig_cap.italic = True
                r_fig_cap.font.color.rgb = RGBColor(0x37, 0x41, 0x51)
                p_fig.add_run("\t")

        # ── Daftar Tabel (Table of Tables) ──────────────────────────────────
        p_gap2 = doc.add_paragraph()
        p_gap2.paragraph_format.space_before = Pt(8)
        h_tbl = doc.add_heading(level=1)
        r_tbl = h_tbl.add_run("Daftar Tabel")
        r_tbl.font.color.rgb = RGBColor(0x4A, 0x86, 0xE8)

        table_entries = [
            "Tabel 1: Document Release",
        ]
        for it in payload.items:
            if "|" in (it.draft_text or ""):
                table_entries.append(f"Tabel: Spesifikasi & Pemenuhan {it.title}")

        for tbl_entry in table_entries:
            p_tbl = doc.add_paragraph()
            p_tbl.paragraph_format.space_after = Pt(3)
            p_tbl.paragraph_format.tab_stops.add_tab_stop(Inches(6.5), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
            r_tent = p_tbl.add_run(tbl_entry)
            r_tent.font.size = Pt(9.5)
            r_tent.font.color.rgb = RGBColor(0x37, 0x41, 0x51)
            p_tbl.add_run("\t")

        doc.add_page_break()

    else:
        if company_logo_bytes or customer_logo_bytes:
            logo_table = doc.add_table(rows=1, cols=2)
            logo_table.alignment = WD_TABLE_ALIGNMENT.CENTER
            tbl_borders = parse_xml(
                f'<w:tblBorders {nsdecls("w")}>'
                f'<w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>'
                f'<w:insideH w:val="none"/><w:insideV w:val="none"/>'
                f'</w:tblBorders>'
            )
            logo_table._tbl.tblPr.append(tbl_borders)

            cell_left = logo_table.cell(0, 0)
            cell_right = logo_table.cell(0, 1)
            cell_left.width = Inches(3.25)
            cell_right.width = Inches(3.25)

            p_left = cell_left.paragraphs[0]
            p_left.paragraph_format.space_after = Pt(10)
            if company_logo_bytes:
                run_left = p_left.add_run()
                run_left.add_picture(io.BytesIO(company_logo_bytes), height=Inches(0.65))

            p_right = cell_right.paragraphs[0]
            p_right.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p_right.paragraph_format.space_after = Pt(10)
            if customer_logo_bytes:
                run_right = p_right.add_run()
                run_right.add_picture(io.BytesIO(customer_logo_bytes), height=Inches(0.65))

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
            f"Total Bagian Tersusun: {len(payload.items)} bagian"
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
            "Ruang lingkup pekerjaan mencakup implementasi dan pemenuhan seluruh bagian berikut:"
        )
        for idx, item in enumerate(payload.items, start=1):
            doc.add_heading(f"2.{idx} Scope: {item.title} [{item.category}]", level=2)
            req_p = doc.add_paragraph()
            req_p.add_run(f"Cakupan Bagian: {item.requirement_text}\n").italic = True
            req_p.add_run("Rincian Lingkup Eksekusi:\n").bold = True
            req_p.add_run(item.draft_text.strip() if item.draft_text.strip() else "[Rincian belum ditentukan]")
            req_p.paragraph_format.space_after = Pt(10)
            _insert_item_image_docx(doc, item, prefix=f"Gambar 2.{idx}")

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
            _insert_item_image_docx(doc, item, prefix=f"Gambar {idx}")

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
            f"Agenda Pertemuan: Klarifikasi Teknis & Pembahasan {payload.document_title}\n"
            f"Waktu Pelaksanaan: {datetime.now().strftime('%d %B %Y')}\n"
            f"Penyelenggara: Tim Solution Architect {payload.company_name}"
        )

        doc.add_heading("2. Poin Pembahasan & Klarifikasi", level=1)
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

    elif payload.template_type == "pitch_deck":
        # Format Pitch Deck Executive Briefing & Slide Blueprint
        doc.add_heading("1. Ringkasan Eksekutif & Value Proposition", level=1)
        doc.add_paragraph(
            f"Dokumen Executive Pitch Deck Briefing ini dirancang khusus untuk memetakan alur presentasi, "
            f"pesan strategis, dan keunggulan kompetitif penawaran {payload.company_name} "
            f"dalam menjawab kebutuhan {payload.document_title}."
        )

        doc.add_heading("2. Rencana Struktur Slide Presentasi (Slide Breakdown)", level=1)
        doc.add_paragraph(
            "Berikut adalah ringkasan struktur slide untuk presentasi kepada stakeholder klien / internal:"
        )

        table = doc.add_table(rows=1, cols=4)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False

        headers = ["Slide #", "Topik & Pain Point Klien", "Pesan Kunci Solusi SMG", "Kategori / Fokus"]
        hdr_cells = table.rows[0].cells
        for idx, text in enumerate(headers):
            cell = hdr_cells[idx]
            cell.text = text
            shading = parse_xml(r'<w:shd {} w:fill="111827"/>'.format(nsdecls('w')))
            cell._tc.get_or_add_tcPr().append(shading)
            for p in cell.paragraphs:
                for r in p.runs:
                    r.bold = True
                    r.font.size = Pt(9.5)
                    r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

        col_widths = [Inches(0.8), Inches(2.2), Inches(2.8), Inches(1.2)]

        for item_idx, item in enumerate(payload.items, start=1):
            row_cells = table.add_row().cells
            row_cells[0].text = f"Slide {item_idx}"
            row_cells[1].text = f"{item.title}\n\nKebutuhan:\n{item.requirement_text}"
            row_cells[2].text = item.draft_text.strip() if item.draft_text.strip() else "[Pesan kunci belum disusun]"
            row_cells[3].text = f"{item.category}\n({item.status.upper()})"

            for c_idx, c in enumerate(row_cells):
                c.width = col_widths[c_idx]
                for p in c.paragraphs:
                    for r in p.runs:
                        r.font.size = Pt(9)

        doc.add_heading("3. Rincian Narasi per Slide (Presenter Talking Points)", level=1)
        for idx, item in enumerate(payload.items, start=1):
            doc.add_heading(f"Slide {idx}: {item.title}", level=2)
            p = doc.add_paragraph()
            p.add_run("Latar Belakang / Kebutuhan Stakeholder:\n").bold = True
            p.add_run(f"\"{item.requirement_text}\"\n\n")
            p.add_run("Talking Points & Solusi yang Disampaikan:\n").bold = True
            p.add_run(item.draft_text.strip() if item.draft_text.strip() else "[Talking points belum diisi]")
            p.paragraph_format.space_after = Pt(10)
            _insert_item_image_docx(doc, item, prefix=f"Visual Slide {idx}")

        doc.add_heading("4. Rekomendasi Tindak Lanjut & Call to Action", level=1)
        doc.add_paragraph(
            f"1. Penyelenggaraan sesi presentasi & live demo interaktif bersama komite pengadaan / C-level Klien.\n"
            f"2. Validasi lingkup prioritas (Proof of Concept) dan penyesuaian detail arsitektur penawaran.\n"
            f"3. Penyampaian proposal komersial resmi dan timeline implementasi bertahap oleh {payload.company_name}."
        )

    else:
        # Format Proposal Naratif Bertingkat (Bab & Sub-bab Standar CSUL PT Smartnet Magna Global)
        for idx, item in enumerate(payload.items, start=1):
            title_clean = (item.title or f"Bagian {idx}").strip()
            num_match = re.match(r"^(\d+(\.\d+)*)\s*(.*)$", title_clean)
            if num_match:
                num_str = num_match.group(1)
                parts = [p for p in num_str.split('.') if p]
                level = min(max(len(parts), 1), 4)
                h = doc.add_heading(level=level)
                base_color = RGBColor(0x4A, 0x86, 0xE8) if level <= 2 else RGBColor(0x1F, 0x49, 0x7D)
                add_formatted_text(h, title_clean, base_color=base_color)
            else:
                h = doc.add_heading(level=2)
                add_formatted_text(h, f"{idx}. {title_clean}", base_color=RGBColor(0x4A, 0x86, 0xE8))

            if item.requirement_text and item.requirement_text.strip():
                req_p = doc.add_paragraph()
                req_p.paragraph_format.left_indent = Inches(0.2)
                req_p.paragraph_format.space_after = Pt(4)
                req_run = req_p.add_run(f"Klausul Kebutuhan: {item.requirement_text.strip()}")
                req_run.italic = True
                req_run.font.size = Pt(9)
                req_run.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)

            resp_text = item.draft_text if item.draft_text.strip() else "[Tanggapan belum disusun]"
            render_markdown_to_docx(doc, resp_text, heading_offset=3)

            _insert_item_image_docx(doc, item, prefix=f"Gambar {idx}")


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
        "pitch_deck": "Executive-Pitch-Deck",
    }
    file_prefix = type_labels.get(payload.template_type, "Proposal")

    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{file_prefix}-{clean_name}.docx"'},
    )


class ExportPdfRequest(BaseModel):
    document_title: str
    template_type: str = "narrative"
    company_name: str = "PT Smartnet Magna Global (SMG)"
    primary_color: str = "#111827"
    accent_color: str = "#2F5FE0"
    footer_text: str = ""
    logo_data_url: str = ""
    customer_logo_data_url: str = ""
    items: list[ExportDocxItem]


@router.post("/export-pdf")
def export_proposal_pdf(payload: ExportPdfRequest):
    """Generate a professional PDF without requiring Word or LibreOffice."""
    from datetime import datetime
    import base64
    from fastapi.responses import StreamingResponse
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from xml.sax.saxutils import escape

    hex_color_pattern = re.compile(r"^#[0-9A-Fa-f]{6}$")
    primary_hex = payload.primary_color if hex_color_pattern.match(payload.primary_color) else "#111827"
    accent_hex = payload.accent_color if hex_color_pattern.match(payload.accent_color) else "#2F5FE0"
    primary_color = colors.HexColor(primary_hex)
    accent_color = colors.HexColor(accent_hex)
    logo_bytes = _decode_logo_bytes(payload.logo_data_url)
    customer_logo_bytes = _decode_logo_bytes(payload.customer_logo_data_url)

    type_labels = {
        "matrix": "Matriks Kepatuhan Tender",
        "narrative": "Proposal Teknis",
        "sow": "Statement of Work",
        "solution_brief": "Solution Brief",
        "mom": "Minutes of Meeting",
        "pitch_deck": "Executive Pitch Deck & Solution Briefing",
    }
    document_type = type_labels.get(payload.template_type, "Proposal Teknis")
    bio = io.BytesIO()
    doc = SimpleDocTemplate(
        bio,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title=payload.document_title,
        author=payload.company_name,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "SynapseTitle", parent=styles["Title"], fontName="Helvetica-Bold",
        fontSize=18, leading=23, textColor=primary_color,
        alignment=TA_CENTER, spaceAfter=8,
    )
    subtitle_style = ParagraphStyle(
        "SynapseSubtitle", parent=styles["Normal"], fontName="Helvetica",
        fontSize=10, leading=14, textColor=accent_color,
        alignment=TA_CENTER, spaceAfter=4,
    )
    meta_style = ParagraphStyle(
        "SynapseMeta", parent=styles["Normal"], fontName="Helvetica",
        fontSize=8.5, leading=11, textColor=colors.HexColor("#6B7280"),
        alignment=TA_CENTER, spaceAfter=18,
    )
    heading_style = ParagraphStyle(
        "SynapseHeading", parent=styles["Heading2"], fontName="Helvetica-Bold",
        fontSize=12, leading=15, textColor=colors.HexColor("#111827"),
        spaceBefore=10, spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "SynapseBody", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=9.5, leading=14, textColor=colors.HexColor("#1F2937"),
        spaceAfter=6,
    )
    small_style = ParagraphStyle(
        "SynapseSmall", parent=body_style, fontSize=8.2, leading=10.5,
    )

    def paragraph(text: str, style=body_style) -> Paragraph:
        return Paragraph(escape(text or "").replace("\n", "<br/>"), style)

    def _build_item_image_story(item, prefix: str = "Gambar") -> list:
        if not getattr(item, "image_data_url", None):
            return []
        img_bytes = _decode_logo_bytes(item.image_data_url)
        if not img_bytes:
            return []
        try:
            from reportlab.platypus import Image as RLImage
            from PIL import Image

            with Image.open(io.BytesIO(img_bytes)) as pil_img:
                w_px, h_px = pil_img.size

            max_w = 160 * mm
            max_h = 95 * mm
            ratio = min(max_w / max(w_px, 1), max_h / max(h_px, 1), 1.0)
            target_w = w_px * ratio
            target_h = h_px * ratio

            cap_style = ParagraphStyle(
                f"ImgCap_{getattr(item, 'id', 'item')}",
                parent=styles["Normal"],
                fontName="Helvetica-Oblique",
                fontSize=8,
                leading=10,
                textColor=colors.HexColor("#6B7280"),
                alignment=TA_CENTER,
                spaceBefore=3,
                spaceAfter=8,
            )

            caption_text = getattr(item, "image_caption", None) or f"{prefix}: Visualisasi {item.title}"
            return [
                Spacer(1, 4),
                RLImage(io.BytesIO(img_bytes), width=target_w, height=target_h),
                Paragraph(escape(caption_text), cap_style),
            ]
        except Exception as exc:
            logger.warning(f"Failed to build image story for PDF: {exc}")
            return []

    story = [
        paragraph(payload.company_name.upper(), subtitle_style),
        paragraph(document_type.upper(), title_style),
        paragraph(payload.document_title, subtitle_style),
        paragraph(
            f"Tanggal: {datetime.now().strftime('%d %B %Y')}  |  Total bagian: {len(payload.items)}",
            meta_style,
        ),
    ]

    if payload.template_type == "matrix":
        rows = [[
            paragraph("No", small_style), paragraph("Kebutuhan / Klausul", small_style),
            paragraph("Kategori", small_style), paragraph("Tanggapan Solusi", small_style),
            paragraph("Status", small_style),
        ]]
        for index, item in enumerate(payload.items, start=1):
            rows.append([
                paragraph(str(index), small_style),
                paragraph(f"{item.title}\n{item.requirement_text}", small_style),
                paragraph(item.category, small_style),
                paragraph(item.draft_text or "[Belum ada tanggapan]", small_style),
                paragraph(item.status.upper(), small_style),
            ])
        table = Table(
            rows,
            colWidths=[10 * mm, 49 * mm, 24 * mm, 73 * mm, 16 * mm],
            repeatRows=1,
        )
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), primary_color),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D1D5DB")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(table)
    elif payload.template_type == "pitch_deck":
        story.append(paragraph("Executive Summary & Presentation Blueprint", heading_style))
        story.append(paragraph(
            f"Dokumen Executive Pitch Deck Briefing ini dirancang khusus oleh {payload.company_name} "
            f"untuk memetakan pesan strategis, pain point kebutuhan, dan solusi unggulan dalam menjawab {payload.document_title}."
        ))
        story.append(paragraph("Rencana Struktur Slide Presentasi", heading_style))
        rows = [[
            paragraph("Slide #", small_style),
            paragraph("Judul & Kebutuhan", small_style),
            paragraph("Pesan Kunci Solusi SMG", small_style),
            paragraph("Kategori", small_style),
        ]]
        for index, item in enumerate(payload.items, start=1):
            rows.append([
                paragraph(f"Slide {index}", small_style),
                paragraph(f"<b>{item.title}</b><br/>{item.requirement_text}", small_style),
                paragraph(item.draft_text or "[Pesan kunci belum diisi]", small_style),
                paragraph(f"{item.category}<br/>({item.status.upper()})", small_style),
            ])
        deck_table = Table(
            rows,
            colWidths=[16 * mm, 52 * mm, 80 * mm, 24 * mm],
            repeatRows=1,
        )
        deck_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), primary_color),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D1D5DB")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(deck_table)
        story.append(Spacer(1, 10))

        story.append(paragraph("Presenter Talking Points per Slide", heading_style))
        for index, item in enumerate(payload.items, start=1):
            story.append(paragraph(f"Slide {index}: {item.title} [{item.category}]", heading_style))
            story.append(paragraph(f"<b>Latar Belakang / Kebutuhan Stakeholder:</b><br/>{item.requirement_text}"))
            story.append(paragraph(
                f"<b>Talking Points Solusi SMG:</b><br/>{item.draft_text or '[Tanggapan belum disusun]'}"
            ))
            story.extend(_build_item_image_story(item, f"Visual Slide {index}"))
            story.append(Spacer(1, 4))

        story.append(paragraph("Next Steps & Call to Action", heading_style))
        story.append(paragraph(
            f"1. Penyelenggaraan sesi presentasi & live demo interaktif bersama komite pengadaan Klien.<br/>"
            f"2. Validasi arsitektur dan penyesuaian detail penawaran teknis sesuai kebutuhan prioritas.<br/>"
            f"3. Penyampaian proposal komersial resmi dan timeline implementasi oleh {payload.company_name}."
        ))
    else:
        story.append(paragraph("Ringkasan Dokumen", heading_style))
        story.append(paragraph(
            f"Dokumen {document_type.lower()} ini disusun oleh {payload.company_name} "
            f"untuk menjawab kebutuhan pada {payload.document_title}."
        ))
        story.append(paragraph("Rincian Bagian dan Tanggapan", heading_style))
        for index, item in enumerate(payload.items, start=1):
            story.append(paragraph(f"{index}. {item.title} [{item.category}]", heading_style))
            story.append(paragraph(f"Cakupan Bagian:\n{item.requirement_text}"))
            story.append(paragraph(
                f"Tanggapan {payload.company_name}:\n{item.draft_text or '[Tanggapan belum disusun]'}"
            ))
            story.extend(_build_item_image_story(item, f"Gambar {index}"))
        story.append(paragraph("Penutup", heading_style))
        story.append(paragraph(
            "Dokumen ini disusun berdasarkan bagian yang tersedia dan dapat disempurnakan "
            "setelah proses review internal."
        ))

    def add_page_number(canvas, document):
        canvas.saveState()
        if document.page == 1:
            from reportlab.lib.utils import ImageReader

            if logo_bytes:
                canvas.drawImage(
                    ImageReader(io.BytesIO(logo_bytes)),
                    18 * mm,
                    270 * mm,
                    width=34 * mm,
                    height=14 * mm,
                    preserveAspectRatio=True,
                    anchor="sw",
                    mask="auto",
                )
            if customer_logo_bytes:
                canvas.drawImage(
                    ImageReader(io.BytesIO(customer_logo_bytes)),
                    158 * mm,
                    270 * mm,
                    width=34 * mm,
                    height=14 * mm,
                    preserveAspectRatio=True,
                    anchor="sw",
                    mask="auto",
                )
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#6B7280"))
        canvas.drawString(18 * mm, 10 * mm, payload.footer_text or payload.company_name)
        canvas.drawRightString(192 * mm, 10 * mm, f"Halaman {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    bio.seek(0)
    clean_name = "".join(
        c for c in payload.document_title if c.isalnum() or c in ("-", "_")
    ).strip() or "Dokumen"

    pdf_prefixes = {
        "matrix": "Matriks",
        "narrative": "Proposal",
        "sow": "StatementOfWork",
        "solution_brief": "SolutionBrief",
        "mom": "MinutesOfMeeting",
        "pitch_deck": "PitchDeck",
    }
    file_prefix = pdf_prefixes.get(payload.template_type, "Proposal")

    return StreamingResponse(
        bio,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{file_prefix}-{clean_name}.pdf"'},
    )


class ExportPptxRequest(BaseModel):
    document_title: str
    company_name: str = "PT Smartnet Magna Global (SMG)"
    items: list[ExportDocxItem]


@router.post("/export-pptx")
def export_proposal_pptx(payload: ExportPptxRequest):
    """Generate an elegant, modern widescreen presentation slide deck (.pptx) with animations and visual assets."""
    import io
    from datetime import datetime
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    from pptx.oxml import parse_xml
    from fastapi.responses import StreamingResponse

    prs = Presentation()
    # Modern 16:9 widescreen layout (13.333 x 7.5 inches)
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    blank_slide_layout = prs.slide_layouts[6]

    def _add_transition(slide, trans_type: str = "fade"):
        try:
            xml_str = (
                f'<p:transition xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
                f'spd="med" advClick="1"><p:{trans_type}/></p:transition>'
            )
            slide._element.append(parse_xml(xml_str))
        except Exception as exc:
            logger.warning(f"Failed to add PPTX slide transition: {exc}")

    def _add_top_stripe(slide):
        try:
            stripe = slide.shapes.add_shape(1, Inches(0), Inches(0), Inches(13.333), Inches(0.08))
            stripe.fill.solid()
            stripe.fill.fore_color.rgb = RGBColor(0x2F, 0x5F, 0xE0)
            stripe.line.fill.background()
        except Exception:
            pass

    total_content_slides = min(len(payload.items), 14)
    total_slides = total_content_slides + 3  # Cover + Agenda + Content + Close

    def _add_slide_footer(slide, current_idx: int):
        try:
            footer_box = slide.shapes.add_textbox(Inches(1.0), Inches(6.95), Inches(11.333), Inches(0.4))
            tf_f = footer_box.text_frame
            p_f = tf_f.paragraphs[0]
            p_f.text = f"{payload.company_name}  ·  Dokumen Proposal Teknis & Arsitektur Solusi"
            p_f.font.size = Pt(8.5)
            p_f.font.color.rgb = RGBColor(0x9C, 0xA3, 0xAF)

            p_page = tf_f.add_paragraph()
            p_page.text = f"Slide {current_idx} / {total_slides}"
            p_page.font.size = Pt(8.5)
            p_page.font.color.rgb = RGBColor(0x9C, 0xA3, 0xAF)
            p_page.alignment = PP_ALIGN.RIGHT
        except Exception:
            pass

    # Slide 1: Executive Title & Cover Slide (Dark Theme for Executive Wow Factor)
    cover_slide = prs.slides.add_slide(blank_slide_layout)
    _add_transition(cover_slide, "fade")

    # Dark executive background
    cover_bg = cover_slide.shapes.add_shape(1, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
    cover_bg.fill.solid()
    cover_bg.fill.fore_color.rgb = RGBColor(0x0F, 0x17, 0x2A)  # Slate 900
    cover_bg.line.fill.background()

    # Top accent line
    cover_stripe = cover_slide.shapes.add_shape(1, Inches(0), Inches(0), Inches(13.333), Inches(0.1))
    cover_stripe.fill.solid()
    cover_stripe.fill.fore_color.rgb = RGBColor(0x4A, 0x86, 0xE8)
    cover_stripe.line.fill.background()

    cover_box = cover_slide.shapes.add_textbox(Inches(1.2), Inches(1.8), Inches(10.9), Inches(4.5))
    tf = cover_box.text_frame
    tf.word_wrap = True

    p_badge = tf.paragraphs[0]
    p_badge.text = "SOLUTION ARCHITECTURE & TECHNICAL PROPOSAL"
    p_badge.font.size = Pt(12)
    p_badge.font.bold = True
    p_badge.font.color.rgb = RGBColor(0xF5, 0x9E, 0x0B)  # Vibrant Amber

    p_title = tf.add_paragraph()
    p_title.text = payload.document_title
    p_title.font.size = Pt(36)
    p_title.font.bold = True
    p_title.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)  # Crisp White
    p_title.space_before = Pt(16)

    p_sub = tf.add_paragraph()
    p_sub.text = f"Dipersiapkan secara eksklusif oleh: {payload.company_name}"
    p_sub.font.size = Pt(16)
    p_sub.font.color.rgb = RGBColor(0x60, 0xA5, 0xFA)  # Light Blue accent
    p_sub.space_before = Pt(14)

    p_meta = tf.add_paragraph()
    p_meta.text = f"Tanggal: {datetime.now().strftime('%d %B %Y')}  ·  {len(payload.items)} Bagian Solusi Teknis Terverifikasi"
    p_meta.font.size = Pt(11.5)
    p_meta.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)  # Slate 400
    p_meta.space_before = Pt(10)

    # Slide 2: Executive Summary & Presentation Blueprint
    agenda_slide = prs.slides.add_slide(blank_slide_layout)
    _add_transition(agenda_slide, "fade")
    _add_top_stripe(agenda_slide)
    _add_slide_footer(agenda_slide, 2)

    ag_box = agenda_slide.shapes.add_textbox(Inches(1.0), Inches(0.7), Inches(11.333), Inches(1.2))
    tf_ag = ag_box.text_frame
    p_h = tf_ag.paragraphs[0]
    p_h.text = "Ringkasan Eksekutif & Agenda Solusi"
    p_h.font.size = Pt(24)
    p_h.font.bold = True
    p_h.font.color.rgb = RGBColor(0x11, 0x18, 0x27)

    ag_body = agenda_slide.shapes.add_textbox(Inches(1.0), Inches(1.9), Inches(11.333), Inches(4.8))
    tf_body = ag_body.text_frame
    tf_body.word_wrap = True

    p_intro = tf_body.paragraphs[0]
    p_intro.text = (
        f"Presentasi ini menyajikan usulan arsitektur dan komitmen menyeluruh dari {payload.company_name} "
        f"dalam menjawab kebutuhan {payload.document_title}."
    )
    p_intro.font.size = Pt(14)
    p_intro.font.color.rgb = RGBColor(0x37, 0x41, 0x51)

    points = [
        f"Analisis Kebutuhan & Cakupan Teknis ({len(payload.items)} Bagian Prioritas)",
        "Desain Arsitektur Solusi Terpadu & Standar Prinsipal Terkemuka",
        "Visualisasi Perangkat, Topologi HLD, dan Spesifikasi Komponen Kunci",
        "Tata Kelola Proyek, SLA Layanan Purnajual 24/7, dan Keunggulan SMG",
    ]
    for pt in points:
        p_pt = tf_body.add_paragraph()
        p_pt.text = f"•  {pt}"
        p_pt.font.size = Pt(13.5)
        p_pt.font.bold = True
        p_pt.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
        p_pt.space_before = Pt(10)

    # Slides 3..N: Content Slides (Max 14 per deck)
    for idx, item in enumerate(payload.items[:14], start=1):
        slide = prs.slides.add_slide(blank_slide_layout)
        _add_transition(slide, "fade")
        _add_top_stripe(slide)
        _add_slide_footer(slide, idx + 2)

        # Header Title
        hdr_box = slide.shapes.add_textbox(Inches(1.0), Inches(0.5), Inches(11.333), Inches(1.1))
        tf_hdr = hdr_box.text_frame
        p_cat = tf_hdr.paragraphs[0]
        p_cat.text = f"BAGIAN #{idx} · {item.category.upper()}"
        p_cat.font.size = Pt(11)
        p_cat.font.bold = True
        p_cat.font.color.rgb = RGBColor(0xD9, 0x77, 0x06)

        p_t = tf_hdr.add_paragraph()
        p_t.text = item.title
        p_t.font.size = Pt(22)
        p_t.font.bold = True
        p_t.font.color.rgb = RGBColor(0x11, 0x18, 0x27)

        has_image = bool(getattr(item, "image_data_url", None))
        img_bytes = _decode_logo_bytes(item.image_data_url) if has_image else None

        if img_bytes:
            # Layout 2 Kolom: Kolom Kiri Teks (Ringkas & Padat), Kolom Kanan Visual Aset / Diagram
            left_box = slide.shapes.add_textbox(Inches(1.0), Inches(1.7), Inches(5.6), Inches(5.0))
            tf_l = left_box.text_frame
            tf_l.word_wrap = True

            p_lh = tf_l.paragraphs[0]
            p_lh.text = "📋 Kebutuhan Dokumen Acuan"
            p_lh.font.size = Pt(13)
            p_lh.font.bold = True
            p_lh.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

            p_lb = tf_l.add_paragraph()
            req_snippet = item.requirement_text[:300] + ("..." if len(item.requirement_text) > 300 else "")
            p_lb.text = req_snippet
            p_lb.font.size = Pt(11)
            p_lb.font.color.rgb = RGBColor(0x4B, 0x55, 0x63)
            p_lb.space_before = Pt(6)

            p_rh = tf_l.add_paragraph()
            p_rh.text = f"⚡ Tanggapan Solusi {payload.company_name}"
            p_rh.font.size = Pt(13)
            p_rh.font.bold = True
            p_rh.font.color.rgb = RGBColor(0x05, 0x96, 0x69)
            p_rh.space_before = Pt(14)

            p_rb = tf_l.add_paragraph()
            resp_str = item.draft_text.strip() if item.draft_text.strip() else "[Tanggapan belum disusun]"
            resp_snippet = resp_str[:420] + ("..." if len(resp_str) > 420 else "")
            p_rb.text = resp_snippet
            p_rb.font.size = Pt(11)
            p_rb.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
            p_rb.space_before = Pt(6)

            # Kolom Kanan: Card Visual
            try:
                from PIL import Image
                with Image.open(io.BytesIO(img_bytes)) as pil_img:
                    w_px, h_px = pil_img.size

                max_w_in = 5.7
                max_h_in = 4.2
                ratio = min(max_w_in / max(w_px, 1), max_h_in / max(h_px, 1))
                w_in = w_px * ratio
                h_in = h_px * ratio
                left_in = 7.0 + (max_w_in - w_in) / 2
                top_in = 1.8 + (max_h_in - h_in) / 2

                slide.shapes.add_picture(
                    io.BytesIO(img_bytes),
                    Inches(left_in),
                    Inches(top_in),
                    width=Inches(w_in),
                    height=Inches(h_in),
                )

                cap_box = slide.shapes.add_textbox(Inches(6.9), Inches(top_in + h_in + 0.1), Inches(max_w_in), Inches(0.8))
                tf_cap = cap_box.text_frame
                tf_cap.word_wrap = True
                p_cap = tf_cap.paragraphs[0]
                p_cap.text = getattr(item, "image_caption", None) or f"Gambar: Visualisasi Solusi {item.title}"
                p_cap.font.size = Pt(9.5)
                p_cap.font.italic = True
                p_cap.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
                p_cap.alignment = PP_ALIGN.CENTER
            except Exception as exc:
                logger.warning(f"Failed to render PPTX image for slide {idx}: {exc}")
        else:
            # Layout Standar: 2 Kolom Lebar Berdampingan
            left_box = slide.shapes.add_textbox(Inches(1.0), Inches(1.8), Inches(5.4), Inches(4.8))
            tf_l = left_box.text_frame
            tf_l.word_wrap = True
            p_lh = tf_l.paragraphs[0]
            p_lh.text = "📋 Kebutuhan Dokumen Acuan"
            p_lh.font.size = Pt(14)
            p_lh.font.bold = True
            p_lh.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

            p_lb = tf_l.add_paragraph()
            p_lb.text = item.requirement_text
            p_lb.font.size = Pt(11.5)
            p_lb.font.color.rgb = RGBColor(0x4B, 0x55, 0x63)
            p_lb.space_before = Pt(8)

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
            p_rb.font.size = Pt(11.5)
            p_rb.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
            p_rb.space_before = Pt(8)

    # Slide Penutup: Q&A / Terima Kasih (Dark Theme Matching Cover)
    close_slide = prs.slides.add_slide(blank_slide_layout)
    _add_transition(close_slide, "fade")

    close_bg = close_slide.shapes.add_shape(1, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
    close_bg.fill.solid()
    close_bg.fill.fore_color.rgb = RGBColor(0x0F, 0x17, 0x2A)  # Slate 900
    close_bg.line.fill.background()

    close_stripe = close_slide.shapes.add_shape(1, Inches(0), Inches(0), Inches(13.333), Inches(0.1))
    close_stripe.fill.solid()
    close_stripe.fill.fore_color.rgb = RGBColor(0x4A, 0x86, 0xE8)
    close_stripe.line.fill.background()

    close_box = close_slide.shapes.add_textbox(Inches(1.0), Inches(2.3), Inches(11.333), Inches(3.5))
    tf_c = close_box.text_frame
    tf_c.word_wrap = True

    p_c1 = tf_c.paragraphs[0]
    p_c1.text = "Terima Kasih"
    p_c1.font.size = Pt(44)
    p_c1.font.bold = True
    p_c1.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    p_c1.alignment = PP_ALIGN.CENTER

    p_c2 = tf_c.add_paragraph()
    p_c2.text = f"Sesi Diskusi Arsitektur Solusi & Tanya Jawab"
    p_c2.font.size = Pt(18)
    p_c2.font.color.rgb = RGBColor(0x60, 0xA5, 0xFA)
    p_c2.space_before = Pt(14)
    p_c2.alignment = PP_ALIGN.CENTER

    p_c3 = tf_c.add_paragraph()
    p_c3.text = f"{payload.company_name}  ·  Enterprise IT Infrastructure & System Integrator"
    p_c3.font.size = Pt(13)
    p_c3.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)
    p_c3.space_before = Pt(10)
    p_c3.alignment = PP_ALIGN.CENTER

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


DOC_TYPE_LABELS = {
    "proposal": {
        "cover_subtitle": "Tanggapan Teknis atas",
        "requirement_label": "Cakupan Bagian",
        "response_label": "Tanggapan {company}",
        "fallback_heading": "Tanggapan Teknis Tambahan",
    },
    "sow": {
        "cover_subtitle": "Statement of Work untuk",
        "requirement_label": "Cakupan Bagian",
        "response_label": "Rincian Lingkup Eksekusi",
        "fallback_heading": "Rincian Lingkup Tambahan",
    },
    "solution_brief": {
        "cover_subtitle": "Solution Brief untuk",
        "requirement_label": "Cakupan Bagian",
        "response_label": "Solusi & Keunggulan {company}",
        "fallback_heading": "Solusi Tambahan",
    },
    "mom": {
        "cover_subtitle": "Minutes of Meeting untuk",
        "requirement_label": "Cakupan Bagian",
        "response_label": "Tanggapan & Klarifikasi {company}",
        "fallback_heading": "Poin Tambahan",
    },
}


def _get_doc_type_labels(template_type: str, company_name: str) -> dict:
    """Wording per target document type, so the template-following flow speaks
    like a SoW/Solution Brief/MoM instead of always sounding like a proposal."""
    labels = DOC_TYPE_LABELS.get(template_type, DOC_TYPE_LABELS["proposal"])
    return {k: v.format(company=company_name) if "{company}" in v else v for k, v in labels.items()}


class ExportFromTemplateItem(BaseModel):
    id: str
    title: str
    requirement_text: str
    category: str
    draft_text: str
    status: str


class ExportFromTemplateRequest(BaseModel):
    document_title: str
    company_name: str = "PT Smartnet Magna Global (SMG)"
    items: list[ExportFromTemplateItem]
    # Template metadata returned by /upload-template
    template_default_font: str = "Calibri"
    template_default_font_size: float = 11.0
    # Serialized template sections (only headings + major body paragraphs)
    template_sections: list[TemplateSectionInfo]
    # Target document type: "proposal" | "sow" | "solution_brief" | "mom" — controls wording/labels
    template_type: str = "proposal"


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
    labels = _get_doc_type_labels(payload.template_type, payload.company_name)

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
    sub_para.add_run(f"{labels['cover_subtitle']}: {payload.document_title}").bold = True
    sub_para.runs[0].font.size = Pt(12)
    sub_para.runs[0].font.name = payload.template_default_font

    meta_para = doc.add_paragraph()
    meta_run = meta_para.add_run(
        f"Tanggal: {datetime.now().strftime('%d %B %Y')}  ·  "
        f"Total Bagian: {len(payload.items)} bagian"
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
    try:
        item_to_heading_index = get_llm_provider().map_items_to_sections(
            headings, items_for_mapping
        )
    except Exception:
        item_to_heading_index = _fallback_map_items_to_sections(
            headings, items_for_mapping
        )
    items_by_id = {it.id: it for it in payload.items}
    items_by_heading_index: dict[int, list[ExportFromTemplateItem]] = defaultdict(list)
    for item_id, heading_index in item_to_heading_index.items():
        items_by_heading_index[heading_index].append(items_by_id[item_id])

    # ── Replay template structure ──────────────────────────────────────────────
    PLACEHOLDER_RE = r"\{\{.*?\}\}|\[ISI_KONTEN\]|\[TANGGAPAN\]|\[CONTENT\]|\[FILL\]"
    import re

    placed_item_ids: set[str] = set()

    for idx, sec in enumerate(payload.template_sections):
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

            # After a heading, insert items the AI mapped to this specific heading
            for item in items_by_heading_index.get(idx, []):
                if item.id in placed_item_ids:
                    continue
                placed_item_ids.add(item.id)
                _insert_item_block(doc, item, font_name, payload.template_default_font_size, labels)

        elif re.search(PLACEHOLDER_RE, text, re.IGNORECASE):
            # This is a placeholder paragraph — replace with all compiled content
            unplaced = [it for it in payload.items if it.id not in placed_item_ids]
            for item in unplaced:
                placed_item_ids.add(item.id)
                _insert_item_block(doc, item, font_name, payload.template_default_font_size, labels)
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
        fallback_heading = doc.add_heading(labels["fallback_heading"], level=1)
        for run in fallback_heading.runs:
            run.font.name = payload.template_default_font
        for item in unplaced_remaining:
            _insert_item_block(doc, item, payload.template_default_font, payload.template_default_font_size, labels)

    bio = io.BytesIO()
    doc.save(bio)
    bio.seek(0)

    clean_name = "".join(c for c in payload.document_title if c.isalnum() or c in ("-", "_")).strip() or "Proposal"
    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="Proposal-Template-{clean_name}.docx"'},
    )


def _insert_item_block(doc, item: "ExportFromTemplateItem", font_name: str, font_size: float, labels: dict):
    """Insert a single requirement + response block into the document."""
    from docx.shared import Pt, RGBColor, Inches

    # Sub-heading for the item
    item_heading = doc.add_heading(f"{item.title}  [{item.category}]", level=2)
    for run in item_heading.runs:
        run.font.name = font_name

    # Requirement blockquote
    req_para = doc.add_paragraph()
    req_run = req_para.add_run(f"{labels['requirement_label']}:\n\"{item.requirement_text}\"")
    req_run.italic = True
    req_run.font.size = Pt(font_size - 0.5)
    req_run.font.name = font_name
    req_run.font.color.rgb = RGBColor(0x4B, 0x55, 0x63)
    req_para.paragraph_format.left_indent = Inches(0.3)
    req_para.paragraph_format.space_after = Pt(4)

    # Draft response
    resp_para = doc.add_paragraph()
    resp_para.add_run(f"{labels['response_label']}:\n").bold = True
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
    items_json: str = Form(""),
    document_title: str = Form(""),
    company_name: str = Form("PT Smartnet Magna Global (SMG)"),
    document_type: str = Form("proposal"),
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
    labels = _get_doc_type_labels(document_type, company_name)
    compiled_lines = []
    for idx, it in enumerate(final_items, start=1):
        compiled_lines.append(
            f"{idx}. {it.get('title', '')} [{it.get('category', '')}]\n"
            f"{labels['requirement_label']}: {it.get('requirement_text', '')}\n"
            f"{labels['response_label']}:\n{it.get('draft_text', '')}\n"
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


# ─────────────────────────────────────────────────────────────────────────────
# IN-PLACE PPTX TEMPLATE CLONING
# User's own designed .pptx deck is reused as-is. One slide marked with
# {{ITEM_*}} placeholders is treated as the repeatable "item slide" and
# duplicated once per TOR item; every other slide only gets the global
# {{DOCUMENT_TITLE}} / {{COMPANY_NAME}} / {{DATE}} / {{TOTAL_ITEMS}} tokens
# substituted. This preserves the template's own design (colors, fonts,
# master layout) instead of generating the fixed hardcoded deck /export-pptx does.
# ─────────────────────────────────────────────────────────────────────────────

_ITEM_MARKER_RE = re.compile(r"\{\{ITEM_[A-Z]+\}\}", re.IGNORECASE)


def _pptx_slide_text(slide) -> str:
    parts = []
    for shape in slide.shapes:
        if shape.has_text_frame:
            parts.append(shape.text_frame.text)
        if shape.has_table:
            for row in shape.table.rows:
                for cell in row.cells:
                    if cell.text_frame:
                        parts.append(cell.text_frame.text)
    return "\n".join(parts)


def _pptx_replace_in_text_frame(text_frame, replacements: dict) -> None:
    import re

    for para in text_frame.paragraphs:
        full_text = "".join(r.text for r in para.runs)
        if not full_text:
            continue
        new_text = full_text
        for pattern, value in replacements.items():
            new_text = re.sub(pattern, value, new_text, flags=re.IGNORECASE)
        if new_text == full_text:
            continue
        if para.runs:
            para.runs[0].text = new_text
            for r in para.runs[1:]:
                r.text = ""
        else:
            para.add_run().text = new_text


def _pptx_replace_in_slide(slide, replacements: dict) -> None:
    for shape in slide.shapes:
        if shape.has_text_frame:
            _pptx_replace_in_text_frame(shape.text_frame, replacements)
        if shape.has_table:
            for row in shape.table.rows:
                for cell in row.cells:
                    if cell.text_frame:
                        _pptx_replace_in_text_frame(cell.text_frame, replacements)


def _duplicate_pptx_slide(prs, slide):
    """Deep-copy `slide`'s shapes onto a brand new slide using the same layout.
    ponytail: XML-only shape copy — an item slide with its own embedded image
    or chart won't carry that media over onto the duplicates; extend by also
    copying `slide.part.rels` if item slides start needing per-item images.
    Tables/grouped shapes aren't scanned for {{...}} placeholders either.
    """
    import copy

    new_slide = prs.slides.add_slide(slide.slide_layout)
    for shape in list(new_slide.shapes):
        shape._element.getparent().remove(shape._element)
    for shape in slide.shapes:
        new_slide.shapes._spTree.append(copy.deepcopy(shape._element))
    return new_slide


def _move_pptx_slide(prs, old_index: int, new_index: int) -> None:
    xml_slides = prs.slides._sldIdLst
    slides = list(xml_slides)
    xml_slides.remove(slides[old_index])
    xml_slides.insert(new_index, slides[old_index])


def _delete_pptx_slide(prs, index: int) -> None:
    from pptx.oxml.ns import qn

    xml_slides = prs.slides._sldIdLst
    slides = list(xml_slides)
    rId = slides[index].get(qn("r:id"))
    prs.part.drop_rel(rId)
    xml_slides.remove(slides[index])


@router.post("/clone-template-pptx")
async def clone_template_pptx(
    template: UploadFile,
    items_json: str = Form(""),
    document_title: str = Form(""),
    company_name: str = Form("PT Smartnet Magna Global (SMG)"),
):
    """
    In-place PPTX template cloning. Form fields:
      - template: the .pptx template file binary
      - items_json: JSON string of [{id, title, requirement_text, category, draft_text, status}]
      - document_title, company_name

    Supported placeholders:
      Global (any slide):        {{DOCUMENT_TITLE}}, {{COMPANY_NAME}}, {{DATE}}, {{TOTAL_ITEMS}}
      Per-item (repeatable slide): {{ITEM_INDEX}}, {{ITEM_TITLE}}, {{ITEM_CATEGORY}},
                                    {{ITEM_REQUIREMENT}}, {{ITEM_RESPONSE}}

    Exactly one slide in the template must contain an {{ITEM_*}} marker — that
    slide is duplicated once per item (in order) and removed from the final deck;
    every other slide is kept as-is with only the global tokens substituted.
    """
    import json
    from datetime import datetime
    from fastapi.responses import StreamingResponse
    from pptx import Presentation

    data = await template.read()
    name = (template.filename or "template.pptx").lower()
    if not (name.endswith(".pptx") or template.content_type == (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )):
        raise HTTPException(status_code=400, detail="Template harus berformat .pptx")

    try:
        raw_items = json.loads(items_json) if items_json.strip() else []
    except Exception:
        raw_items = []
    final_items = [it for it in raw_items if it.get("status") in ("final", "draft") and it.get("draft_text", "").strip()]
    if not final_items:
        raise HTTPException(status_code=400, detail="Tidak ada item berstatus Draf/Final untuk dimasukkan ke slide")

    prs = Presentation(io.BytesIO(data))

    item_slide_index = next(
        (i for i, s in enumerate(prs.slides) if _ITEM_MARKER_RE.search(_pptx_slide_text(s))),
        None,
    )
    if item_slide_index is None:
        raise HTTPException(
            status_code=400,
            detail="Template PPTX tidak punya slide dengan placeholder {{ITEM_TITLE}}/{{ITEM_RESPONSE}} dll. "
                   "Tandai satu slide sebagai slide-per-item dengan placeholder tersebut.",
        )
    item_slide = list(prs.slides)[item_slide_index]

    today = datetime.now().strftime("%d %B %Y")
    global_replacements = {
        r"\{\{DOCUMENT_TITLE\}\}": document_title or "—",
        r"\{\{COMPANY_NAME\}\}": company_name,
        r"\{\{DATE\}\}": today,
        r"\{\{TOTAL_ITEMS\}\}": str(len(final_items)),
    }

    for i, it in enumerate(final_items, start=1):
        new_slide = _duplicate_pptx_slide(prs, item_slide)
        item_replacements = {
            **global_replacements,
            r"\{\{ITEM_INDEX\}\}": str(i),
            r"\{\{ITEM_TITLE\}\}": it.get("title", ""),
            r"\{\{ITEM_CATEGORY\}\}": it.get("category", ""),
            r"\{\{ITEM_REQUIREMENT\}\}": it.get("requirement_text", ""),
            r"\{\{ITEM_RESPONSE\}\}": it.get("draft_text", ""),
        }
        _pptx_replace_in_slide(new_slide, item_replacements)
        _move_pptx_slide(prs, len(prs.slides) - 1, item_slide_index + i - 1)

    _delete_pptx_slide(prs, item_slide_index + len(final_items))

    for slide in prs.slides:
        _pptx_replace_in_slide(slide, global_replacements)

    bio = io.BytesIO()
    prs.save(bio)
    bio.seek(0)

    clean_name = "".join(c for c in (document_title or "PitchDeck") if c.isalnum() or c in ("-", "_")).strip() or "PitchDeck"
    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="PitchDeck-Cloned-{clean_name}.pptx"'},
    )

