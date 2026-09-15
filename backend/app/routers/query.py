from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.services.retrieval import retrieve_chunks_with_full_metadata
from app.services.llm_provider import format_llm_error, get_llm_provider
from app.db import get_session

router = APIRouter(prefix="/query", tags=["query"])


class QueryRequest(BaseModel):
    question: str
    workspace_id: str = settings.default_workspace_id


class ChunkResult(BaseModel):
    id: str
    title: str
    docType: str
    division: Optional[str] = None
    source: str = "internal"
    chunk_text: str = ""


class QueryResponse(BaseModel):
    answer: str
    sources_used: int
    sources: list[ChunkResult] = []


@router.post("", response_model=QueryResponse)
def query_knowledge_base(
    payload: QueryRequest, session: Session = Depends(get_session)
):
    chunk_records = retrieve_chunks_with_full_metadata(
        session, payload.workspace_id, payload.question, top_k=6
    )
    chunks_text = [r["chunk_text"] for r in chunk_records]

    try:
        provider = get_llm_provider()
        answer = provider.answer(payload.question, chunks_text, mode="qa")
    except Exception as e:
        answer = (
            f"[LLM tidak tersedia: {format_llm_error(e)}] "
            "Berikut kutipan dokumen yang relevan."
        )

    sources = [
        ChunkResult(
            id=r.get("id", ""),
            title=r.get("title", ""),
            docType=r.get("docType", "other"),
            division=r.get("division"),
            source=r.get("source", "internal"),
            chunk_text=r.get("chunk_text", ""),
        )
        for r in chunk_records
    ]

    return QueryResponse(answer=answer, sources_used=len(chunks_text), sources=sources)
