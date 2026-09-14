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
