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


def _split_markdown_table(table_text: str, max_chars: int = 1800) -> list[str]:
    """Split a very large Markdown table row-by-row, keeping the header on every slice."""
    lines = [line.strip() for line in table_text.strip().split("\n") if line.strip()]
    if len(lines) <= 2:
        return [table_text]

    header = lines[0]
    separator = lines[1] if len(lines) > 1 and "---" in lines[1] else "| " + " | ".join(["---"] * max(1, header.count("|") - 1)) + " |"
    data_rows = lines[2:] if "---" in lines[1] else lines[1:]

    slices = []
    current_rows = []
    current_len = len(header) + len(separator) + 2

    for row in data_rows:
        row_len = len(row) + 1
        if current_rows and (current_len + row_len > max_chars):
            slices.append(f"{header}\n{separator}\n" + "\n".join(current_rows))
            current_rows = [row]
            current_len = len(header) + len(separator) + 2 + row_len
        else:
            current_rows.append(row)
            current_len += row_len

    if current_rows:
        slices.append(f"{header}\n{separator}\n" + "\n".join(current_rows))

    return slices or [table_text]


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 150) -> list[str]:
    """Structure-aware and table-preserving document chunker.
    
    1. Keeps Markdown tables intact without slicing them across mid-row boundaries.
    2. Large tables repeat the header row on each split slice.
    3. Respects Markdown headings (#, ##, ###) as section boundaries.
    4. Provides contextual overlap across chunk transitions.
    """
    if not text or not text.strip():
        return []

    from app.services.document_parser import clean_signature_blocks

    cleaned_input, _ = clean_signature_blocks(text.strip())
    clean_text = cleaned_input.strip()
    if len(clean_text) <= chunk_size:
        return [clean_text]

    # Break into logical blocks: tables, headings, and paragraphs
    raw_lines = clean_text.split("\n")
    blocks: list[tuple[str, str]] = []  # (block_type, content)
    
    current_table_lines: list[str] = []
    current_para_lines: list[str] = []

    def flush_para():
        nonlocal current_para_lines
        if current_para_lines:
            para = "\n".join(current_para_lines).strip()
            if para:
                blocks.append(("para", para))
            current_para_lines = []

    def flush_table():
        nonlocal current_table_lines
        if current_table_lines:
            tbl = "\n".join(current_table_lines).strip()
            if tbl:
                blocks.append(("table", tbl))
            current_table_lines = []

    for line in raw_lines:
        stripped = line.strip()
        # Table detection: starts and ends with pipe
        if stripped.startswith("|") and stripped.endswith("|"):
            flush_para()
            current_table_lines.append(stripped)
        elif stripped.startswith(("# ", "## ", "### ", "#### ")):
            flush_table()
            flush_para()
            blocks.append(("heading", stripped))
        elif not stripped:
            flush_table()
            flush_para()
        else:
            if current_table_lines:
                flush_table()
            current_para_lines.append(line)

    flush_table()
    flush_para()

    # If no blocks were structured (e.g. single giant paragraph without breaks), fallback
    if not blocks:
        chunks = []
        start = 0
        while start < len(clean_text):
            end = start + chunk_size
            chunks.append(clean_text[start:end])
            start = end - overlap
        return chunks

    # Assemble blocks into cohesive chunks
    chunks: list[str] = []
    current_chunk_parts: list[str] = []
    current_chunk_len = 0
    active_heading = ""

    for b_type, content in blocks:
        if b_type == "heading":
            active_heading = content
            # If current chunk has enough content (>500 chars), flush it before starting section
            if current_chunk_len >= 500:
                chunks.append("\n\n".join(current_chunk_parts))
                current_chunk_parts = []
                current_chunk_len = 0
            current_chunk_parts.append(content)
            current_chunk_len += len(content) + 2
            continue

        if b_type == "table":
            table_slices = _split_markdown_table(content, max_chars=chunk_size + 400)
            for tbl_slice in table_slices:
                if current_chunk_parts and (current_chunk_len + len(tbl_slice) > chunk_size):
                    chunks.append("\n\n".join(current_chunk_parts))
                    # Carry active heading to provide context for table in next chunk
                    current_chunk_parts = [active_heading] if active_heading else []
                    current_chunk_len = sum(len(p) + 2 for p in current_chunk_parts)
                current_chunk_parts.append(tbl_slice)
                current_chunk_len += len(tbl_slice) + 2
            continue

        # Regular paragraph
        if current_chunk_parts and (current_chunk_len + len(content) > chunk_size):
            flushed = "\n\n".join(current_chunk_parts).strip()
            # Clean trailing dangling conjunctions before flushing
            flushed = re.sub(r"(?i)\s+(?:sedangkan|dan|atau|serta|yaitu|bahwa|sebagaimana|termasuk|seperti)\s*[,.:;]?\s*$", ".", flushed)
            chunks.append(flushed)
            # Start new chunk with active heading for context
            current_chunk_parts = [active_heading] if (active_heading and not content.startswith("#")) else []
            current_chunk_len = sum(len(p) + 2 for p in current_chunk_parts)

        # If a single paragraph is longer than chunk_size, split by sentence boundaries
        if len(content) > chunk_size:
            sentences = re.split(r"(?<=[.!?\n])\s+", content)
            sub_part: list[str] = []
            sub_len = 0
            for s in sentences:
                if sub_len + len(s) > chunk_size and sub_part:
                    flushed_sub = "\n\n".join(current_chunk_parts + [" ".join(sub_part)]).strip()
                    flushed_sub = re.sub(r"(?i)\s+(?:sedangkan|dan|atau|serta|yaitu|bahwa|sebagaimana|termasuk|seperti)\s*[,.:;]?\s*$", ".", flushed_sub)
                    chunks.append(flushed_sub)
                    sub_part = []
                    sub_len = 0
                    current_chunk_parts = [active_heading] if active_heading else []
                sub_part.append(s)
                sub_len += len(s) + 1
            if sub_part:
                current_chunk_parts.append(" ".join(sub_part))
                current_chunk_len += sub_len
        else:
            current_chunk_parts.append(content)
            current_chunk_len += len(content) + 2

    if current_chunk_parts:
        final_chunk = "\n\n".join(current_chunk_parts).strip()
        if final_chunk and (not active_heading or final_chunk != active_heading):
            chunks.append(final_chunk)

    return chunks or [clean_text]


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

