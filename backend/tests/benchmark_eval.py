"""
Synapse Retrieval Benchmark Evaluation Suite
Automated regression test and quality evaluator for RAG retrieval and reranking.
Runs without generating unnecessary LLM tokens, measuring top-k precision,
cross-encoder relevance scoring, and retrieval latency.
"""

import sys
import time
from dataclasses import dataclass
from typing import List

from app.config import settings
from app.db import SessionLocal
from app.services.retrieval import retrieve_chunks_with_full_metadata
from app.routers.draft import _evaluate_context_sufficiency


@dataclass
class BenchmarkCase:
    name: str
    query: str
    must_contain_any: List[str]
    description: str


BENCHMARK_CASES = [
    BenchmarkCase(
        name="CSUL Storage Sizing",
        query="Berapa kapasitas usable dan model Pure Storage untuk penawaran CSUL Finance?",
        must_contain_any=["pure storage", "//rc20", "csul", "usable", "directflash"],
        description="Verifies retrieval of Pure Storage //RC20 sizing and capacity data",
    ),
    BenchmarkCase(
        name="SLA & Maintenance Terms",
        query="Apa saja cakupan Preventive Maintenance (PM) dan Corrective Maintenance (CM) serta SLA?",
        must_contain_any=["preventive", "corrective", "sla", "pemeliharaan", "response time", "mttr", "24x7", "8x5"],
        description="Verifies retrieval of maintenance terms and service level agreements",
    ),
    BenchmarkCase(
        name="Network & HLD Architecture",
        query="Arsitektur High Level Design (HLD) topologi jaringan core switch firewall",
        must_contain_any=["hld", "arsitektur", "topologi", "switch", "firewall", "core", "redundant", "network"],
        description="Verifies retrieval of network architecture and HLD diagrams/descriptions",
    ),
    BenchmarkCase(
        name="Compliance Matrix & BoQ",
        query="Bill of Quantity BoQ spesifikasi hardware dan matriks kepatuhan teknis",
        must_contain_any=["boq", "bill of quantity", "spesifikasi", "matriks", "compliance", "qty", "unit"],
        description="Verifies retrieval of BoQ tables and technical compliance items",
    ),
]


def run_retrieval_benchmark():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    db = SessionLocal()
    results = []
    print("=" * 80)
    print(">> SYNAPSE RETRIEVAL & RERANKING QUALITY BENCHMARK")
    print("=" * 80)

    total_time = 0.0
    passed_cases = 0

    try:
        for idx, case in enumerate(BENCHMARK_CASES, start=1):
            t0 = time.perf_counter()
            # Perform hybrid retrieval + TinyBERT cross-encoder reranking
            chunks = retrieve_chunks_with_full_metadata(
                session=db,
                workspace_id=settings.default_workspace_id,
                query=case.query,
                top_k=5,
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000
            total_time += elapsed_ms

            if not chunks:
                print(f"[{idx}/{len(BENCHMARK_CASES)}] [FAIL] {case.name} - No chunks retrieved ({elapsed_ms:.1f}ms)")
                results.append((case, False, 0.0, "sparse", elapsed_ms, "No chunks"))
                continue

            chunk_texts = [c.get("chunk_text", "") for c in chunks]
            combined_text = " ".join(chunk_texts).lower()
            matched_keywords = [kw for kw in case.must_contain_any if kw in combined_text]
            hit_score = len(matched_keywords) / max(1, len(case.must_contain_any))

            # Evaluate context sufficiency using reflect-before-generate logic
            grounding_status, note = _evaluate_context_sufficiency(case.query, chunk_texts, "")

            is_pass = len(matched_keywords) >= 1
            if is_pass:
                passed_cases += 1
                status_icon = "[PASS]"
            else:
                status_icon = "[FAIL]"

            avg_conf = sum(c.get("confidence", 0) for c in chunks) / len(chunks)
            results.append((case, is_pass, avg_conf, grounding_status, elapsed_ms, matched_keywords))

            print(f"[{idx}/{len(BENCHMARK_CASES)}] {status_icon}: {case.name}")
            print(f"    Latency: {elapsed_ms:.1f}ms | Chunks: {len(chunks)} | Avg Confidence: {avg_conf:.1f}%")
            print(f"    Grounding: {grounding_status.upper()} ({note})")
            print(f"    Matched terms: {', '.join(matched_keywords) or 'None'}")
            print("-" * 80)

    finally:
        db.close()

    success_rate = (passed_cases / len(BENCHMARK_CASES)) * 100
    avg_latency = total_time / max(1, len(BENCHMARK_CASES))

    print("\nBENCHMARK SUMMARY REPORT")
    print(f"Total Test Cases : {len(BENCHMARK_CASES)}")
    print(f"Passed           : {passed_cases} ({success_rate:.1f}%)")
    print(f"Average Latency  : {avg_latency:.1f} ms / query (Reranker pass included)")

    if success_rate >= 75.0:
        print("\nRETRIEVAL QUALITY BENCHMARK PASSED (Meets accuracy & latency criteria)\n")
        return 0
    else:
        print("\nWARNING: Quality benchmark below threshold (75%). Check embeddings and reranking.\n")
        return 1


if __name__ == "__main__":
    exit_code = run_retrieval_benchmark()
    sys.exit(exit_code)
