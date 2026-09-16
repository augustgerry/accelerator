"""
Synapse MCP Server (Model Context Protocol)
Exposes Synapse Presales Knowledge Base to external AI agents
(Claude Code, Claude Desktop, Cursor, Antigravity, or custom agent tooling)
via standard JSON-RPC 2.0 over stdio.
"""

import json
import sys
import os

# Add backend directory to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.config import settings
from app.db import SessionLocal
from app.services.retrieval import retrieve_chunks_with_full_metadata
from app.routers.draft import _evaluate_context_sufficiency
from app.services.llm_provider import NARRATIVE_STRUCTURE_TEMPLATE


TOOLS = [
    {
        "name": "search_knowledge_base",
        "description": "Cari dokumen, klausul spesifikasi teknis, BoQ, sizing, SLA, dan materi proposal di Synapse Knowledge Base dengan hybrid vector ranking dan Cross-Encoder reranking.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Pertanyaan atau kata kunci pencarian teknis presales",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Jumlah cuplikan dokumen teratas (default 5)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_proposal_outline",
        "description": "Dapatkan kerangka struktur 22 sub-bab baku Proposal Teknis (1.1, 3.2.1, BoQ, Compliance Matrix, Maintenance SLA).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "doc_type": {
                    "type": "string",
                    "description": "Jenis dokumen (contoh: narrative, sow, matrix)",
                    "default": "narrative",
                },
            },
        },
    },
    {
        "name": "evaluate_grounding",
        "description": "Evaluasi tingkat kecukupan grounding acuan (strong, moderate, sparse) untuk suatu klausul kebutuhan.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "requirement_text": {
                    "type": "string",
                    "description": "Teks klausul atau kebutuhan tender yang akan dinilai",
                },
            },
            "required": ["requirement_text"],
        },
    },
]


def handle_search(query: str, top_k: int = 5) -> str:
    db = SessionLocal()
    try:
        chunks = retrieve_chunks_with_full_metadata(
            session=db,
            workspace_id=settings.default_workspace_id,
            query=query,
            top_k=top_k,
        )
        if not chunks:
            return "Tidak ditemukan cuplikan dokumen yang relevan di basis pengetahuan Synapse."

        output_lines = [f"Ditemukan {len(chunks)} referensi terverifikasi:\n"]
        for idx, c in enumerate(chunks, 1):
            title = c.get("title", "Dokumen")
            doc_type = c.get("docType", "general")
            confidence = c.get("confidence", 0)
            text = c.get("chunk_text", "").strip()
            output_lines.append(f"[{idx}] {title} ({doc_type} | Relevansi: {confidence}%)")
            output_lines.append(f"{text}\n")

        return "\n".join(output_lines)
    finally:
        db.close()


def handle_get_outline(doc_type: str = "narrative") -> str:
    if doc_type == "narrative":
        return f"Kerangka Baku Proposal Teknis:\n\n{NARRATIVE_STRUCTURE_TEMPLATE}"
    return f"Kerangka dokumen untuk tipe '{doc_type}':\n\n1. Pendahuluan\n2. Ruang Lingkup\n3. Solusi Teknis\n4. SLA & Garansi\n5. Penutup"


def handle_evaluate(requirement_text: str) -> str:
    db = SessionLocal()
    try:
        chunks = retrieve_chunks_with_full_metadata(
            session=db,
            workspace_id=settings.default_workspace_id,
            query=requirement_text,
            top_k=5,
        )
        chunk_texts = [c.get("chunk_text", "") for c in chunks]
        status, note = _evaluate_context_sufficiency(requirement_text, chunk_texts, "")
        return json.dumps(
            {
                "grounding_status": status,
                "note": note,
                "sources_found": len(chunks),
                "top_documents": [c.get("title") for c in chunks[:3]],
            },
            indent=2,
            ensure_ascii=False,
        )
    finally:
        db.close()


def run_mcp_stdio_server():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")

    while True:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
        except Exception:
            continue

        msg_id = req.get("id")
        method = req.get("method")
        params = req.get("params", {})

        if method == "initialize":
            res = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {
                        "name": "synapse-knowledge-mcp",
                        "version": "1.0.0",
                    },
                },
            }
        elif method == "notifications/initialized":
            continue
        elif method == "tools/list":
            res = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {"tools": TOOLS},
            }
        elif method == "tools/call":
            tool_name = params.get("name")
            tool_args = params.get("arguments", {})

            try:
                if tool_name == "search_knowledge_base":
                    out_text = handle_search(
                        query=tool_args.get("query", ""),
                        top_k=int(tool_args.get("top_k", 5)),
                    )
                elif tool_name == "get_proposal_outline":
                    out_text = handle_get_outline(
                        doc_type=tool_args.get("doc_type", "narrative")
                    )
                elif tool_name == "evaluate_grounding":
                    out_text = handle_evaluate(
                        requirement_text=tool_args.get("requirement_text", "")
                    )
                else:
                    out_text = f"Tool '{tool_name}' tidak dikenal."

                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "content": [{"type": "text", "text": out_text}],
                        "isError": False,
                    },
                }
            except Exception as e:
                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "content": [{"type": "text", "text": f"Error: {e}"}],
                        "isError": True,
                    },
                }
        else:
            res = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }

        sys.stdout.write(json.dumps(res, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    run_mcp_stdio_server()
