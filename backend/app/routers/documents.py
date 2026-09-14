from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Document
from app.db import get_session

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


@router.post("/sync")
def sync_from_drive(workspace_id: str = settings.default_workspace_id):
    """TODO: call drive_sync.list_drive_files(), extract text, chunk, embed,
    and upsert into `documents` + `document_chunks` for this workspace."""
    raise NotImplementedError
