"""
Retrieval over PostgreSQL + pgvector. Kept intentionally simple for the MVP —
a flat top-k similarity search, no reranking or agentic multi-hop retrieval.
Add those later only if query quality genuinely needs it.
"""

import re

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload
from app.models import Document, DocumentChunk
from app.services.embeddings import embed_text


def _query_tokens(query: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"[a-zA-Z0-9][a-zA-Z0-9._/-]{2,}", query.lower())))


def _hybrid_ranked_chunks(
    session: Session,
    workspace_id: str,
    query: str,
    top_k: int,
    doc_type: str | None = None,
    division: str | None = None,
) -> list[DocumentChunk]:
    """Blend vector candidates with exact-term candidates before returning top-k."""
    query_embedding = embed_text(query)
    candidate_limit = max(top_k * 4, 20)
    filters = [DocumentChunk.workspace_id == workspace_id]
    if doc_type:
        filters.append(DocumentChunk.document.has(Document.doc_type == doc_type))
    if division:
        filters.append(DocumentChunk.document.has(Document.division == division))
    distance = DocumentChunk.embedding.cosine_distance(query_embedding).label("distance")
    vector_rows = session.execute(
        select(DocumentChunk, distance)
        .options(joinedload(DocumentChunk.document))
        .where(*filters)
        .order_by(distance)
        .limit(candidate_limit)
    ).all()

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
    return ranked[:top_k]


def _hybrid_chunks(
    session: Session,
    workspace_id: str,
    query: str,
    top_k: int,
    doc_type: str | None = None,
    division: str | None = None,
) -> list[DocumentChunk]:
    return [
        candidate["chunk"]
        for candidate in _hybrid_ranked_chunks(session, workspace_id, query, top_k, doc_type, division)
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
) -> tuple[list[str], list[dict]]:
    chunks = _hybrid_chunks(session, workspace_id, query, top_k, doc_type, division)
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
        })
    return results

