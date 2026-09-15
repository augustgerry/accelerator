import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_session
from app.models import ProposalSession

router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionItem(BaseModel):
    id: str
    title: str
    requirement_text: str
    category: str
    draft_text: str = ""
    status: str = "todo"
    sources: list[dict] = []


class SessionPayload(BaseModel):
    title: str
    file_name: str = ""
    tor_text: str = ""
    items: list[SessionItem] = []
    status: str = "draft"
    workspace_id: str = settings.default_workspace_id


def _serialize(session: ProposalSession) -> dict:
    try:
        items = json.loads(session.items_json or "[]")
    except json.JSONDecodeError:
        items = []
    return {
        "id": session.id,
        "title": session.title,
        "file_name": session.file_name,
        "tor_text": session.tor_text,
        "items": items,
        "status": session.status,
        "created_at": session.created_at.isoformat(),
        "updated_at": session.updated_at.isoformat(),
    }


@router.get("")
def list_sessions(
    workspace_id: str = settings.default_workspace_id,
    session: Session = Depends(get_session),
):
    rows = session.execute(
        select(ProposalSession)
        .where(ProposalSession.workspace_id == workspace_id)
        .order_by(ProposalSession.updated_at.desc())
    ).scalars().all()
    return [_serialize(row) for row in rows]


@router.get("/{session_id}")
def get_proposal_session(
    session_id: str,
    workspace_id: str = settings.default_workspace_id,
    session: Session = Depends(get_session),
):
    row = session.get(ProposalSession, session_id)
    if not row or row.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Proposal project tidak ditemukan")
    return _serialize(row)


@router.post("")
def create_proposal_session(
    payload: SessionPayload,
    session: Session = Depends(get_session),
):
    now = datetime.utcnow()
    row = ProposalSession(
        id=str(uuid.uuid4()),
        workspace_id=payload.workspace_id,
        title=payload.title,
        file_name=payload.file_name,
        tor_text=payload.tor_text,
        items_json=json.dumps([item.model_dump() for item in payload.items]),
        status=payload.status,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _serialize(row)


@router.put("/{session_id}")
def update_proposal_session(
    session_id: str,
    payload: SessionPayload,
    session: Session = Depends(get_session),
):
    row = session.get(ProposalSession, session_id)
    if not row or row.workspace_id != payload.workspace_id:
        raise HTTPException(status_code=404, detail="Proposal project tidak ditemukan")
    row.title = payload.title
    row.file_name = payload.file_name
    row.tor_text = payload.tor_text
    row.items_json = json.dumps([item.model_dump() for item in payload.items])
    row.status = payload.status
    row.updated_at = datetime.utcnow()
    session.commit()
    session.refresh(row)
    return _serialize(row)


@router.delete("/{session_id}")
def delete_proposal_session(
    session_id: str,
    workspace_id: str = settings.default_workspace_id,
    session: Session = Depends(get_session),
):
    row = session.get(ProposalSession, session_id)
    if not row or row.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Proposal project tidak ditemukan")
    session.delete(row)
    session.commit()
    return {"deleted": session_id}