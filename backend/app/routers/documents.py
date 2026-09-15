import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Document, DocumentChunk
from app.db import get_session
from app.services.drive_sync import DOCX_MIME, PPTX_MIME, download_file_bytes, fetch_and_extract_text, list_drive_files
from app.services.embeddings import chunk_text, embed_text

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("")
def list_documents(
    workspace_id: str = settings.default_workspace_id,
    session: Session = Depends(get_session),
):
    stmt = (
        select(
            Document,
            func.count(DocumentChunk.id).label("chunk_count"),
        )
        .outerjoin(DocumentChunk, Document.id == DocumentChunk.document_id)
        .where(Document.workspace_id == workspace_id)
        .group_by(Document.id)
        .order_by(Document.updated_at.desc())
    )
    rows = session.execute(stmt).all()
    return [
        {
            "id": d.id,
            "title": d.title,
            "docType": d.doc_type,
            "division": d.division,
            "chunkCount": chunk_count,
            "updatedAt": d.updated_at.isoformat(),
        }
        for d, chunk_count in rows
    ]


@router.get("/{doc_id}/chunks")
def get_document_chunks(
    doc_id: str,
    workspace_id: str = settings.default_workspace_id,
    session: Session = Depends(get_session),
):
    doc = session.get(Document, doc_id)
    if not doc or doc.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")

    stmt = (
        select(DocumentChunk)
        .where(DocumentChunk.document_id == doc_id, DocumentChunk.workspace_id == workspace_id)
    )
    chunks = session.execute(stmt).scalars().all()
    return {
        "documentId": doc.id,
        "title": doc.title,
        "docType": doc.doc_type,
        "division": doc.division,
        "totalChunks": len(chunks),
        "chunks": [
            {
                "id": c.id,
                "content": c.content,
                "length": len(c.content),
            }
            for c in chunks
        ],
    }


@router.get("/{doc_id}/download")
def download_document(
    doc_id: str,
    workspace_id: str = settings.default_workspace_id,
    session: Session = Depends(get_session),
):
    """Re-download the original .docx/.pptx for a template document from Drive,
    so the frontend can pick a template from the library without a manual upload."""
    doc = session.get(Document, doc_id)
    if not doc or doc.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")
    if doc.doc_type != "template" or not doc.source_drive_id:
        raise HTTPException(status_code=400, detail="Dokumen ini bukan template")

    media_type = PPTX_MIME if doc.title.lower().endswith(".pptx") else DOCX_MIME
    data = download_file_bytes(doc.source_drive_id)
    return StreamingResponse(
        iter([data]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.title}"'},
    )


@router.get("/summary")
def get_summary(
    workspace_id: str = settings.default_workspace_id,
    session: Session = Depends(get_session),
):
    total_documents = session.execute(
        select(func.count()).select_from(Document).where(Document.workspace_id == workspace_id)
    ).scalar_one()
    total_chunks = session.execute(
        select(func.count())
        .select_from(DocumentChunk)
        .where(DocumentChunk.workspace_id == workspace_id)
    ).scalar_one()
    last_synced_at = session.execute(
        select(func.max(Document.updated_at)).where(Document.workspace_id == workspace_id)
    ).scalar_one()
    return {
        "totalDocuments": total_documents,
        "totalChunks": total_chunks,
        "lastSyncedAt": last_synced_at.isoformat() if last_synced_at else None,
    }


@router.post("/sync")
def sync_from_drive(
    workspace_id: str = settings.default_workspace_id,
    session: Session = Depends(get_session),
):
    """Pull every file from GOOGLE_DRIVE_FOLDER_ID, extract text, chunk, embed,
    and upsert into `documents` + `document_chunks` for this workspace."""
    if not settings.google_drive_folder_id:
        raise HTTPException(status_code=400, detail="GOOGLE_DRIVE_FOLDER_ID is not set")

    files = list_drive_files(settings.google_drive_folder_id)
    total = len(files)
    synced: list[str] = []
    skipped: list[str] = []

    for i, f in enumerate(files, start=1):
        try:
            text = fetch_and_extract_text(f["id"])
            division = f["folderPath"].split("/")[0] if f["folderPath"] else "presales"
            doc_type = "template" if f["mimeType"] in (DOCX_MIME, PPTX_MIME) else "document"

            doc = session.get(Document, f["id"])
            if doc is None:
                doc = Document(
                    id=f["id"],
                    workspace_id=workspace_id,
                    title=f["name"],
                    doc_type=doc_type,
                    division=division,
                    source_drive_id=f["id"],
                )
                session.add(doc)
            else:
                doc.title = f["name"]
                doc.division = division
                doc.doc_type = doc_type
            doc.updated_at = datetime.utcnow()

            session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))
            for chunk in chunk_text(text):
                session.add(
                    DocumentChunk(
                        id=str(uuid.uuid4()),
                        workspace_id=workspace_id,
                        document_id=doc.id,
                        content=chunk,
                        embedding=embed_text(chunk),
                    )
                )

            session.commit()
            synced.append(f["name"])
            print(f"[{i}/{total}] synced: {f['name']}", flush=True)
        except Exception as e:
            session.rollback()
            skipped.append(f["name"])
            print(f"[{i}/{total}] skipped: {f['name']} ({e!r})", flush=True)

    return {"synced": synced, "skipped": skipped}
