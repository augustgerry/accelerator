"""
Retrieval over PostgreSQL + pgvector. Kept intentionally simple for the MVP —
a flat top-k similarity search, no reranking or agentic multi-hop retrieval.
Add those later only if query quality genuinely needs it.
"""

import logging
import re
import time

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload
from app.models import Document, DocumentChunk
from app.services.embeddings import embed_text

logger = logging.getLogger(__name__)

_RETRIEVAL_CACHE: dict[tuple, tuple[float, list[dict]]] = {}
_CACHE_TTL_SECONDS = 300  # 5 minutes cache for fast sub-section browsing
_MAX_CACHE_SIZE = 256


def clear_retrieval_cache() -> None:
    """Clear in-memory retrieval cache."""
    global _RETRIEVAL_CACHE
    _RETRIEVAL_CACHE.clear()


def _query_tokens(query: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"[a-zA-Z0-9][a-zA-Z0-9._/-]{2,}", query.lower())))


def _hybrid_ranked_chunks(
    session: Session,
    workspace_id: str,
    query: str,
    top_k: int,
    doc_type: str | None = None,
    division: str | None = None,
    doc_ids: list[str] | None = None,
) -> list[dict]:
    """Blend vector candidates with exact-term candidates and Cross-Encoder reranking.
    Caches results in-memory for instant 0ms response on repeated/sub-section queries."""
    cache_key = (
        workspace_id,
        query.strip().lower(),
        top_k,
        (doc_type or "").strip().lower(),
        tuple(sorted(doc_ids or [])),
    )
    now = time.time()
    if cache_key in _RETRIEVAL_CACHE:
        cached_time, cached_results = _RETRIEVAL_CACHE[cache_key]
        if now - cached_time < _CACHE_TTL_SECONDS:
            return cached_results

    candidate_limit = max(top_k * 4, 20)
    filters = [DocumentChunk.workspace_id == workspace_id]
    if doc_type and doc_type.strip():
        filters.append(DocumentChunk.document.has(func.lower(Document.doc_type) == doc_type.strip().lower()))
    if doc_ids:
        filters.append(DocumentChunk.document_id.in_(doc_ids))

    vector_rows = []
    try:
        query_embedding = embed_text(query)
        distance = DocumentChunk.embedding.cosine_distance(query_embedding).label("distance")
        vector_rows = session.execute(
            select(DocumentChunk, distance)
            .options(joinedload(DocumentChunk.document))
            .where(*filters)
            .order_by(distance)
            .limit(candidate_limit)
        ).all()
    except Exception as e:
        logger.warning("Vector embedding failed, falling back to keyword retrieval: %s", e)

    tokens = _query_tokens(query)
    keyword_rows = []
    if tokens:
        keyword_rows = session.execute(
            select(DocumentChunk)
            .options(joinedload(DocumentChunk.document))
            .where(
                *filters,
                or_(*(DocumentChunk.content.ilike(f"%{token}%") for token in tokens)),
            )
            .limit(candidate_limit)
        ).scalars().all()

    candidates: dict[str, dict] = {}
    for rank, (chunk, raw_distance) in enumerate(vector_rows):
        candidates[chunk.id] = {
            "chunk": chunk,
            "vector_score": max(0.0, 1.0 - float(raw_distance)),
            "vector_rank": rank,
        }
    for chunk in keyword_rows:
        candidates.setdefault(chunk.id, {
            "chunk": chunk,
            "vector_score": 0.0,
            "vector_rank": candidate_limit,
        })

    normalized_query = query.lower()
    query_numbers = set(re.findall(r"\d+(?:[.,]\d+)?(?:\s?[xX]\s?\d+)?%?", normalized_query))
    for candidate in candidates.values():
        content = (candidate["chunk"].content or "").lower()
        matched_tokens = [token for token in tokens if token in content]
        matches = len(matched_tokens)
        lexical_score = matches / max(1, len(tokens))
        if query_numbers and any(number in content for number in query_numbers):
            lexical_score = min(1.0, lexical_score + 0.25)
        candidate["score"] = candidate["vector_score"] * 0.65 + lexical_score * 0.35
        candidate["matched_tokens"] = matched_tokens

    ranked = sorted(
        candidates.values(),
        key=lambda candidate: (candidate["score"], -candidate["vector_rank"]),
        reverse=True,
    )
    reranked = _rerank_candidates(query, ranked, top_k)
    if len(_RETRIEVAL_CACHE) >= _MAX_CACHE_SIZE:
        oldest_k = min(_RETRIEVAL_CACHE, key=lambda k: _RETRIEVAL_CACHE[k][0])
        _RETRIEVAL_CACHE.pop(oldest_k, None)
    _RETRIEVAL_CACHE[cache_key] = (now, reranked)
    return reranked


from functools import lru_cache

@lru_cache(maxsize=1)
def _get_reranker():
    try:
        from sentence_transformers import CrossEncoder
        # Ultra-fast, lightweight CPU cross-encoder (cached locally)
        return CrossEncoder("cross-encoder/ms-marco-TinyBERT-L-2-v2")
    except Exception as e:
        logger.warning("CrossEncoder reranker initialization skipped: %s", e)
        return None


def _rerank_candidates(query: str, ranked_candidates: list[dict], top_k: int) -> list[dict]:
    """Rerank top initial candidates using Cross-Encoder cross-attention scoring.
    Combines cross-encoder semantic precision with term matching and density."""
    if not ranked_candidates:
        return []

    # Consider up to 20 top candidates for reranking
    candidate_pool = ranked_candidates[:max(top_k * 3, 20)]
    reranker = _get_reranker()

    if reranker is None:
        return ranked_candidates[:top_k]

    try:
        # Build (query, document_passage) pairs
        pairs = []
        for item in candidate_pool:
            text = (item["chunk"].content or "").strip()[:1000]
            title = item["chunk"].document.title if (item["chunk"] and item["chunk"].document) else ""
            passage = f"{title}: {text}" if title else text
            pairs.append((query, passage))

        raw_scores = reranker.predict(pairs)

        import math
        for idx, item in enumerate(candidate_pool):
            raw_s = float(raw_scores[idx])
            # Sigmoid normalization
            ce_score = 1.0 / (1.0 + math.exp(-raw_s))
            initial_score = item.get("score", 0.0)
            # 70% Cross-Encoder relevance, 30% initial hybrid/lexical score
            blended = ce_score * 0.70 + initial_score * 0.30
            item["rerank_score"] = blended
            item["score"] = blended

        reranked = sorted(candidate_pool, key=lambda x: x.get("rerank_score", 0.0), reverse=True)
        return reranked[:top_k]
    except Exception as e:
        logger.warning("Reranking pass failed, falling back to hybrid ranking: %s", e)
        return ranked_candidates[:top_k]


def _hybrid_chunks(
    session: Session,
    workspace_id: str,
    query: str,
    top_k: int,
    doc_type: str | None = None,
    division: str | None = None,
    doc_ids: list[str] | None = None,
) -> list[DocumentChunk]:
    return [
        candidate["chunk"]
        for candidate in _hybrid_ranked_chunks(session, workspace_id, query, top_k, doc_type, division, doc_ids)
    ]


def retrieve_relevant_chunks(
    session: Session, workspace_id: str, query: str, top_k: int = 5
) -> list[str]:
    chunks, _ = retrieve_relevant_chunks_with_sources(session, workspace_id, query, top_k)
    return chunks


def retrieve_relevant_chunks_with_sources(
    session: Session,
    workspace_id: str,
    query: str,
    top_k: int = 5,
    doc_type: str | None = None,
    division: str | None = None,
    doc_ids: list[str] | None = None,
) -> tuple[list[str], list[dict]]:
    chunks = _hybrid_chunks(session, workspace_id, query, top_k, doc_type, division, doc_ids)
    chunk_texts = [c.content for c in chunks]

    seen = set()
    sources = []
    for c in chunks:
        doc = c.document
        if doc and doc.id not in seen:
            seen.add(doc.id)
            sources.append({
                "id": doc.id,
                "title": doc.title,
                "docType": doc.doc_type,
                "division": doc.division,
                "source": "internal",
            })

    return chunk_texts, sources


def retrieve_chunks_with_full_metadata(
    session: Session,
    workspace_id: str,
    query: str,
    top_k: int = 6,
    doc_type: str | None = None,
    division: str | None = None,
) -> list[dict]:
    """Return top-k chunks each with their own chunk text and parent document metadata.
    Unlike retrieve_relevant_chunks_with_sources, this does NOT deduplicate by document —
    every chunk gets its own entry so the Glean UI can show individual citation cards."""
    ranked_chunks = _hybrid_ranked_chunks(session, workspace_id, query, top_k, doc_type, division)

    results = []
    for candidate in ranked_chunks:
        c = candidate["chunk"]
        doc = c.document
        results.append({
            "id": doc.id if doc else c.id,
            "title": doc.title if doc else "Dokumen Tidak Diketahui",
            "docType": doc.doc_type if doc else "other",
            "division": doc.division if doc else None,
            "source": "internal",
            "chunk_text": c.content or "",
            "confidence": round(max(0.05, min(0.99, candidate["score"])) * 100),
            "matched_terms": candidate.get("matched_tokens", []),
            "updatedAt": doc.updated_at.isoformat() if doc and doc.updated_at else None,
        })
    return results

