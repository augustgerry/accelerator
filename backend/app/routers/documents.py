import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Document, DocumentChunk
from app.db import get_session
from app.services.drive_sync import fetch_and_extract_text, list_drive_files
from app.services.embeddings import chunk_text, embed_text

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("")
def list_documents(
    workspace_id: str = settings.default_workspace_id,
    session: Session = Depends(get_session),
):
    stmt = select(Document).where(Document.workspace_id == workspace_id)
    docs = session.execute(stmt).scalars().all()
    return [
        {
            "id": d.id,
            "title": d.title,
            "docType": d.doc_type,
            "division": d.division,
            "updatedAt": d.updated_at.isoformat(),
        }
        for d in docs
    ]


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

            doc = session.get(Document, f["id"])
            if doc is None:
                doc = Document(
                    id=f["id"],
                    workspace_id=workspace_id,
                    title=f["name"],
                    doc_type="document",
                    division=division,
                    source_drive_id=f["id"],
                )
                session.add(doc)
            else:
                doc.title = f["name"]
                doc.division = division
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
