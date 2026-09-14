"""
Retrieval over PostgreSQL + pgvector. Kept intentionally simple for the MVP —
a flat top-k similarity search, no reranking or agentic multi-hop retrieval.
Add those later only if query quality genuinely needs it.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import DocumentChunk
from app.services.embeddings import embed_text


def retrieve_relevant_chunks(
    session: Session, workspace_id: str, query: str, top_k: int = 5
) -> list[str]:
    query_embedding = embed_text(query)

    stmt = (
        select(DocumentChunk)
        .where(DocumentChunk.workspace_id == workspace_id)
        .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
        .limit(top_k)
    )
    results = session.execute(stmt).scalars().all()
    return [chunk.content for chunk in results]
