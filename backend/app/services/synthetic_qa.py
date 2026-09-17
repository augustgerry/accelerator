"""
Synthetic QA Dataset Generation & Automated Grounding Evaluation Service
Implements Sangfor Agent Builder design pattern:
- Automatically synthesizes realistic presales RFP/TOR Q&A pairs from the corpus.
- Benchmarks retrieval accuracy, Hit@k, Mean Reciprocal Rank (MRR), and grounding sufficiency.
"""

import json
import logging
import time
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.services.llm_provider import get_llm_provider
from app.services.retrieval import retrieve_chunks_with_full_metadata
from app.routers.draft import _evaluate_context_sufficiency

logger = logging.getLogger(__name__)


def generate_synthetic_qa_pairs(
    session: Session,
    workspace_id: str = settings.default_workspace_id,
    num_pairs: int = 3,
    document_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Selects representative knowledge chunks from the corpus and uses the LLM
    to formulate realistic RFP presales technical questions with ground-truth answers.
    """
    sql = """
        SELECT c.id, c.document_id, c.content, d.title, d.doc_type
        FROM document_chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE c.workspace_id = :ws_id
          AND LENGTH(c.content) > 200
    """
    params: Dict[str, Any] = {"ws_id": workspace_id}
    if document_id:
        sql += " AND c.document_id = :doc_id"
        params["doc_id"] = document_id

    sql += " ORDER BY RANDOM() LIMIT :limit"
    params["limit"] = max(1, min(num_pairs * 2, 10))

    rows = session.execute(text(sql), params).fetchall()
    if not rows:
        return []

    provider = get_llm_provider()
    qa_results = []

    for row in rows[:num_pairs]:
        chunk_id, doc_id, chunk_content, doc_title, doc_type = row

        prompt = f"""Anda adalah QA Quality Engineer untuk sistem Retrieval-Augmented Generation (RAG) Presales Solusi IT.
Berdasarkan potongan dokumen resmi berikut:

--- KONTEN DOKUMEN ---
Dokumen: {doc_title} ({doc_type})
Konten:
{chunk_content[:1500]}
--- AKHIR KONTEN ---

Buatlah SATU pasangan Pertanyaan & Jawaban Sintetis (Synthetic Q&A) realistis yang mungkin ditanyakan oleh klien/presales dalam dokumen TOR/RFP/Tender.
Pertanyaan harus spesifik, faktual, dan jawabannya harus secara eksplisit dapat ditemukan di dalam konten di atas.

Kembalikan jawaban HANYA dalam format JSON valid tanpa format markdown lain:
{{
  "question": "Pertanyaan spesifik dan jelas dalam bahasa Indonesia",
  "ground_truth_answer": "Jawaban ringkas dan padat yang didukung langsung oleh teks",
  "expected_keywords": ["3-5 kata kunci teknis penting yang wajib muncul di hasil retrieval"]
}}
"""
        try:
            raw_response = provider.answer(
                query=prompt,
                context_chunks=[],
                mode="json"
            )
            # Clean JSON formatting
            cleaned = raw_response.strip()
            if cleaned.startswith("```"):
                lines = cleaned.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                cleaned = "\n".join(lines).strip()

            parsed = json.loads(cleaned)
            qa_results.append({
                "chunk_id": chunk_id,
                "document_id": doc_id,
                "document_title": doc_title,
                "question": parsed.get("question", ""),
                "ground_truth_answer": parsed.get("ground_truth_answer", ""),
                "expected_keywords": parsed.get("expected_keywords", []),
                "source_chunk_excerpt": chunk_content[:200] + "..."
            })
        except Exception as e:
            logger.warning("Failed to generate synthetic QA pair for chunk %s: %s", chunk_id, e)

    return qa_results


def evaluate_retrieval_against_synthetic_qa(
    session: Session,
    workspace_id: str,
    qa_pairs: List[Dict[str, Any]],
    top_k: int = 5
) -> Dict[str, Any]:
    """
    Evaluates retrieval performance and grounding sufficiency using synthetic QA pairs.
    Measures:
    - Hit@k: Proportion of queries where the source document/chunk is in top-k
    - Keyword Match Rate: Key terms retrieved in candidates
    - Grounding Sufficiency: Strong / Moderate / Sparse
    - Mean Reciprocal Rank (MRR)
    """
    if not qa_pairs:
        return {
            "total_evaluated": 0,
            "hit_rate_pct": 0.0,
            "mrr": 0.0,
            "avg_latency_ms": 0.0,
            "results": []
        }

    results = []
    total_latency = 0.0
    reciprocal_ranks = []
    hit_count = 0

    for idx, item in enumerate(qa_pairs, start=1):
        q = item.get("question", "")
        expected_doc_id = item.get("document_id")
        expected_keywords = [k.lower() for k in item.get("expected_keywords", [])]

        t0 = time.perf_counter()
        retrieved = retrieve_chunks_with_full_metadata(
            session=session,
            workspace_id=workspace_id,
            query=q,
            top_k=top_k
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000
        total_latency += elapsed_ms

        chunk_texts = [c.get("chunk_text", "") for c in retrieved]
        combined_text = " ".join(chunk_texts).lower()

        # Check document hit
        rank = 0
        for i, c in enumerate(retrieved, start=1):
            if expected_doc_id and c.get("document_id") == expected_doc_id:
                rank = i
                break

        if rank > 0:
            reciprocal_ranks.append(1.0 / rank)
            hit_count += 1
        else:
            reciprocal_ranks.append(0.0)

        # Keyword overlap
        matched_kw = [kw for kw in expected_keywords if kw in combined_text]
        kw_coverage = (len(matched_kw) / max(1, len(expected_keywords))) * 100

        # Grounding status
        grounding_status, note = _evaluate_context_sufficiency(q, chunk_texts, "")

        results.append({
            "index": idx,
            "question": q,
            "target_document": item.get("document_title"),
            "retrieved_rank": rank if rank > 0 else "Not in top-" + str(top_k),
            "hit": rank > 0,
            "matched_keywords": matched_kw,
            "keyword_coverage_pct": round(kw_coverage, 1),
            "grounding_status": grounding_status,
            "latency_ms": round(elapsed_ms, 1)
        })

    mrr = sum(reciprocal_ranks) / max(1, len(reciprocal_ranks))
    hit_rate = (hit_count / max(1, len(qa_pairs))) * 100
    avg_lat = total_latency / max(1, len(qa_pairs))

    return {
        "total_evaluated": len(qa_pairs),
        "hit_rate_pct": round(hit_rate, 1),
        "mrr": round(mrr, 3),
        "avg_latency_ms": round(avg_lat, 1),
        "verdict": "STRONG_RETRIEVAL" if hit_rate >= 75.0 else "NEEDS_OPTIMIZATION",
        "results": results
    }
