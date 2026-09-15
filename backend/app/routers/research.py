"""
External web research (company/product/industry) via the LLM provider's
native web_search + web_fetch tools. Kept separate from /query on purpose:
/query answers from the internal knowledge base (private docs), this
endpoint answers from the live public web. Don't merge the two — mixing
"what we've done before" with "what's publicly true right now" muddies
both the UX and the citation trail.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.services.llm_provider import format_llm_error, get_llm_provider

router = APIRouter(prefix="/research", tags=["research"])


class ResearchRequest(BaseModel):
    query: str  # e.g. "Ringkas lini produk data center Sangfor terbaru"


class ResearchResponse(BaseModel):
    answer: str
    citations: list[dict]


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
