"""
External web research (company/product/industry) via the LLM provider's
native web_search + web_fetch tools. Kept separate from /query on purpose:
/query answers from the internal knowledge base (private docs), this
endpoint answers from the live public web. Don't merge the two — mixing
"what we've done before" with "what's publicly true right now" muddies
both the UX and the citation trail.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_session
from app.services.llm_provider import format_llm_error, get_llm_provider
from app.services.synthetic_qa import (
    generate_synthetic_qa_pairs,
    evaluate_retrieval_against_synthetic_qa,
)

router = APIRouter(prefix="/research", tags=["research"])


class ResearchRequest(BaseModel):
    query: str  # e.g. "Ringkas lini produk data center Sangfor terbaru"


class ResearchResponse(BaseModel):
    answer: str
    citations: list[dict]


class GenerateSyntheticQaRequest(BaseModel):
    workspace_id: str = settings.default_workspace_id
    num_pairs: int = 3
    document_id: Optional[str] = None


class EvaluateSyntheticQaRequest(BaseModel):
    workspace_id: str = settings.default_workspace_id
    qa_pairs: List[Dict[str, Any]]
    top_k: int = 5


@router.post("", response_model=ResearchResponse)
def research_external(payload: ResearchRequest):
    if not settings.enable_external_research:
        raise HTTPException(
            status_code=403,
            detail="External research is disabled (set ENABLE_EXTERNAL_RESEARCH=true).",
        )
    try:
        provider = get_llm_provider()
        result = provider.research_external(payload.query)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=format_llm_error(exc)) from exc
    return ResearchResponse(**result)


@router.post("/synthetic-qa/generate")
def generate_synthetic_qa_endpoint(
    payload: GenerateSyntheticQaRequest, session: Session = Depends(get_session)
):
    """
    Auto-generate high-quality synthetic RFP/TOR Q&A pairs from existing knowledge chunks.
    Implements Sangfor Agent Builder autonomous self-learning pattern.
    """
    pairs = generate_synthetic_qa_pairs(
        session=session,
        workspace_id=payload.workspace_id,
        num_pairs=payload.num_pairs,
        document_id=payload.document_id,
    )
    return {"status": "success", "count": len(pairs), "qa_pairs": pairs}


@router.post("/synthetic-qa/evaluate")
def evaluate_synthetic_qa_endpoint(
    payload: EvaluateSyntheticQaRequest, session: Session = Depends(get_session)
):
    """
    Run retrieval evaluation and grounding benchmark against synthetic Q&A pairs.
    Measures Hit@k, MRR, latency, and context sufficiency.
    """
    report = evaluate_retrieval_against_synthetic_qa(
        session=session,
        workspace_id=payload.workspace_id,
        qa_pairs=payload.qa_pairs,
        top_k=payload.top_k,
    )
    return {"status": "success", "report": report}

