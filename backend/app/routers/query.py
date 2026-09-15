from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.services.retrieval import retrieve_chunks_with_full_metadata
from app.services.llm_provider import get_llm_provider
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

    provider = get_llm_provider()
    try:
        answer = provider.answer(payload.question, chunks_text, mode="qa")
    except Exception as e:
        err_msg = str(e)
        if "credit balance" in err_msg.lower() or "billing" in err_msg.lower():
            answer = f"[LLM tidak aktif: {err_msg}] Berikut kutipan dokumen yang relevan."
        else:
            answer = f"[Gagal menghubungi LLM: {err_msg}]"

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
