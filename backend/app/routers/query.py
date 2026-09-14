from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.services.retrieval import retrieve_relevant_chunks
from app.services.llm_provider import get_llm_provider
from app.db import get_session

router = APIRouter(prefix="/query", tags=["query"])


class QueryRequest(BaseModel):
    question: str
    workspace_id: str = settings.default_workspace_id


class QueryResponse(BaseModel):
    answer: str
    sources_used: int


@router.post("", response_model=QueryResponse)
def query_knowledge_base(
    payload: QueryRequest, session: Session = Depends(get_session)
):
    chunks = retrieve_relevant_chunks(session, payload.workspace_id, payload.question)
    provider = get_llm_provider()
    answer = provider.answer(payload.question, chunks, mode="qa")
    return QueryResponse(answer=answer, sources_used=len(chunks))
