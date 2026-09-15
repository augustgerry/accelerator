"""
Retrieval over PostgreSQL + pgvector. Kept intentionally simple for the MVP —
a flat top-k similarity search, no reranking or agentic multi-hop retrieval.
Add those later only if query quality genuinely needs it.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload
from app.models import DocumentChunk
from app.services.embeddings import embed_text


def retrieve_relevant_chunks(
    session: Session, workspace_id: str, query: str, top_k: int = 5
) -> list[str]:
    chunks, _ = retrieve_relevant_chunks_with_sources(session, workspace_id, query, top_k)
    return chunks


def retrieve_relevant_chunks_with_sources(
    session: Session, workspace_id: str, query: str, top_k: int = 5
) -> tuple[list[str], list[dict]]:
    query_embedding = embed_text(query)

    stmt = (
        select(DocumentChunk)
        .options(joinedload(DocumentChunk.document))
        .where(DocumentChunk.workspace_id == workspace_id)
        .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
        .limit(top_k)
    )
    chunks = session.execute(stmt).scalars().all()
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
    session: Session, workspace_id: str, query: str, top_k: int = 6
) -> list[dict]:
    """Return top-k chunks each with their own chunk text and parent document metadata.
    Unlike retrieve_relevant_chunks_with_sources, this does NOT deduplicate by document —
    every chunk gets its own entry so the Glean UI can show individual citation cards."""
    query_embedding = embed_text(query)

    stmt = (
        select(DocumentChunk)
        .options(joinedload(DocumentChunk.document))
        .where(DocumentChunk.workspace_id == workspace_id)
        .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
        .limit(top_k)
    )
    chunks = session.execute(stmt).scalars().all()

    results = []
    for c in chunks:
        doc = c.document
        results.append({
            "id": doc.id if doc else c.id,
            "title": doc.title if doc else "Dokumen Tidak Diketahui",
            "docType": doc.doc_type if doc else "other",
            "division": doc.division if doc else None,
            "source": "internal",
            "chunk_text": c.content or "",
        })
    return results

