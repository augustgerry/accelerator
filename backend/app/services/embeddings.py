"""
Local embedding model (sentence-transformers) — no per-call API cost, runs
on CPU for MVP-scale document volume. Swap the model name below if a
multilingual model is needed for mixed Indonesian/English documents.
"""

from functools import lru_cache


@lru_cache(maxsize=1)
def _get_model():
    from sentence_transformers import SentenceTransformer

    # multilingual model — handles Indonesian + English TOR/checklist text
    return SentenceTransformer("paraphrase-multilingual-mpnet-base-v2")


def warm_up() -> None:
    """Load the model on the calling (main) thread. torch's first import has a
    known circular-import race when it happens lazily inside a worker thread
    (e.g. FastAPI's threadpool on the first /documents/sync request) — call
    this at app startup instead."""
    _get_model()


def embed_text(text: str) -> list[float]:
    model = _get_model()
    return model.encode(text).tolist()


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 120) -> list[str]:
    """Simple sliding-window chunker. Replace with a structure-aware splitter
    (headings/sections) if document quality demands it later."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return chunks


def semantic_select_tor_excerpt(tor_text: str, query: str, top_k: int = 5, max_chars: int = 6000) -> str:
    """Select the most semantically relevant paragraphs from a long TOR/RFP text.
    Uses the cached local multilingual sentence-transformers model.
    Preserves original document order for natural context flow.
    """
    if not tor_text or not tor_text.strip():
        return ""

    tor_clean = tor_text.strip()
    # If already within budget, return directly without computing embeddings
    if len(tor_clean) <= max_chars:
        return tor_clean

    import numpy as np

    # Split by double newline into meaningful paragraphs
    raw_paragraphs = [p.strip() for p in tor_clean.split("\n\n") if len(p.strip()) > 20]
    if not raw_paragraphs or len(raw_paragraphs) <= 2:
        raw_paragraphs = chunk_text(tor_clean, chunk_size=1000, overlap=100)

    if not raw_paragraphs:
        return tor_clean[:max_chars]

    try:
        model = _get_model()
        query_emb = model.encode(query, normalize_embeddings=True)
        para_embs = model.encode(raw_paragraphs, normalize_embeddings=True)

        similarities = np.dot(para_embs, query_emb)
        ranked_indices = np.argsort(similarities)[::-1]

        selected_indices = []
        accumulated_chars = 0
        for idx in ranked_indices:
            idx = int(idx)
            para_len = len(raw_paragraphs[idx])
            if accumulated_chars + para_len > max_chars and selected_indices:
                continue
            selected_indices.append(idx)
            accumulated_chars += para_len
            if len(selected_indices) >= top_k or accumulated_chars >= max_chars:
                break

        # Re-sort selected indices by original document order
        selected_indices.sort()
        return "\n\n".join(raw_paragraphs[i] for i in selected_indices)
    except Exception:
        return tor_clean[:max_chars]

