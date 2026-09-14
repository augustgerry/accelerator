from fastapi import APIRouter, Depends, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.services.retrieval import retrieve_relevant_chunks
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


@router.post("", response_model=DraftResponse)
def generate_draft(payload: DraftRequest, session: Session = Depends(get_session)):
    # Ground the draft in both the uploaded TOR and the knowledge base
    kb_chunks = retrieve_relevant_chunks(session, payload.workspace_id, payload.instruction)
    context = [payload.tor_text] + kb_chunks

    provider = get_llm_provider()
    draft = provider.answer(payload.instruction, context, mode="draft")
    return DraftResponse(draft_text=draft, sources_used=len(context))


@router.post("/upload")
async def upload_tor(file: UploadFile):
    """Accepts a TOR/RFP file, extracts text, returns it for use in /draft.
    TODO: route to pypdf or python-docx based on file.content_type."""
    raise NotImplementedError
