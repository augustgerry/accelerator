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
    doc_type: Optional[str] = None
    division: Optional[str] = None
    conversation: list[dict[str, str]] = []


class ChunkResult(BaseModel):
    id: str
    title: str
    docType: str
    division: Optional[str] = None
    source: str = "internal"
    chunk_text: str = ""
    confidence: int = 0
    matched_terms: list[str] = []


class QueryResponse(BaseModel):
    answer: str
    sources_used: int
    sources: list[ChunkResult] = []


@router.post("", response_model=QueryResponse)
def query_knowledge_base(
    payload: QueryRequest, session: Session = Depends(get_session)
):
    conversation_context = "\n".join(
        f"{message.get('role', 'user')}: {message.get('content', '')}"
        for message in payload.conversation[-6:]
        if message.get("content")
    )
    retrieval_question = (
        f"Percakapan sebelumnya:\n{conversation_context}\n\nPertanyaan terbaru: {payload.question}"
        if conversation_context
        else payload.question
    )
    chunk_records = retrieve_chunks_with_full_metadata(
        session,
        payload.workspace_id,
        retrieval_question,
        top_k=6,
        doc_type=payload.doc_type,
        division=payload.division,
    )
    chunks_text = [r["chunk_text"] for r in chunk_records]

    try:
        provider = get_llm_provider()
        answer = provider.answer(retrieval_question, chunks_text, mode="qa")
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
            confidence=r.get("confidence", 0),
            matched_terms=r.get("matched_terms", []),
        )
        for r in chunk_records
    ]

    return QueryResponse(answer=answer, sources_used=len(chunks_text), sources=sources)
