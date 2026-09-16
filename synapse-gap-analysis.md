# Synapse — Gap Analysis vs. Sangfor Agent Builder Demo

Context: Sangfor demoed their Agent Builder platform (RAG + agentic workflow builder) during a bootcamp session. Several of their design patterns map directly onto gaps in Synapse (our internal knowledge/proposal accelerator). This doc lists what's missing, who should own it (Claude Code = frontend, Antigravity = backend), and rough priority. Update this file as items are picked up or resolved — treat it as the shared backlog between the two agents.

---

## 1. Retrieval quality (Backend — Antigravity)

- [x] **Reranking pass** — ✅ **RESOLVED (Antigravity):** Implemented local cached Cross-Encoder (`cross-encoder/ms-marco-TinyBERT-L-2-v2`) in `backend/app/services/retrieval.py` (`_rerank_candidates`). Reranks top 20-25 hybrid vector/lexical candidates with cross-attention relevance before passing top-k to LLM. Pre-warmed on FastAPI startup (`main.py`).
- [x] **Reflect-before-generate step** — ✅ **RESOLVED (Antigravity):** Added `_evaluate_context_sufficiency()` and `_reformulate_query_for_expansion()` in `backend/app/routers/draft.py` (`POST /draft/item`). If retrieved context is sparse (<180 chars or low token coverage), it automatically expands query terms, broadens search to the entire KB, and returns `grounding_status` ('strong' | 'moderate' | 'sparse') + `grounding_note` in `DraftItemResponse` for frontend display.
- [x] **Chunking strategy review** — ✅ **RESOLVED (Antigravity):** Replaced naive sliding-window with structure-aware chunker in `backend/app/services/embeddings.py` (`chunk_text`). Respects markdown headers (`# `, `## `, `### `) as chunk boundaries, preserves Markdown tables intact, and slices giant tables row-by-row with repeated header rows (`_split_markdown_table`).

**Priority:** High — these three directly affect answer/draft quality, which is the core value prop.

---

## 2. Document parsing (Backend — Antigravity)

- [x] **Tables spanning multiple pages / Ingestion table loss** — ✅ **RESOLVED (Antigravity):** Fixed major data-loss bug in `backend/app/services/drive_sync.py` & `backend/app/routers/draft.py` (`upload_tor`). Extracts paragraphs and tables in sequential document order via `_extract_docx_text_and_tables()`, converting all tables into structured Markdown tables (`| Col 1 | Col 2 |`).
- [x] **Signature/stamp pages noise exclusion** — ✅ **RESOLVED (Antigravity):** Implemented `clean_signature_blocks()` in `backend/app/services/document_parser.py`. Automatically detects approval headers, signature blanks, and stamp boilerplate at the end of TOR/SoW documents, stripping them from vector embeddings and returning a `has_signature_page` provenance flag.
- [x] **Scanned/OCR fallback** — ✅ **RESOLVED (Antigravity):** Implemented `extract_pdf_with_ocr_fallback()` in `backend/app/services/document_parser.py`. Detects PDF pages with minimal text (<50 chars) and active images, automatically triggering Gemini Vision OCR (`gemini-3.6-flash`) to accurately transcribe scanned pages and tables into Markdown.

**Priority:** High — completed.

---

## 3. Evaluation / self-learning loop (Backend — Antigravity)

- [x] **Before/after evaluation** — ✅ **RESOLVED (Antigravity):** Built `backend/tests/benchmark_eval.py` regression benchmark suite testing 4 core presales scenarios (CSUL Storage Sizing, Maintenance & SLA Terms, Network/HLD Topology, and BoQ / Compliance Matrix). Computes retrieval precision, TinyBERT reranking latency, and grounding sufficiency without wasting LLM tokens. Result: 100% test pass rate with warm retrieval latency ~600ms.
- [ ] **Synthetic QA generation** — Sangfor auto-generates Q&A pairs from the corpus to tune retrieval. Overkill for Synapse's current corpus size (dozens of documents, not enterprise-scale) — **flag as later/nice-to-have, not MVP-critical.**

**Priority:** Low for now — benchmark evaluation complete.

---

## 4. Security & access control (DROPPED per user directive)

- [x] ~~**Dynamic answer-scope control & RBAC foundation**~~ — **DROPPED:** User mengonfirmasi Synapse tidak menggunakan konsep divisi sama sekali. Semua dokumen adalah single-tenant/unified organizational knowledge base. Filter dan pemisahan divisi dihilangkan dari backlog dan antarmuka.

---

## 5. Ecosystem / integration surface (Backend — Antigravity)

- [x] **Expose Synapse as an MCP server** — ✅ **RESOLVED (Antigravity):** Implemented standard JSON-RPC 2.0 MCP server in `backend/mcp_server.py`. Exposes `search_knowledge_base`, `get_proposal_outline`, and `evaluate_grounding` tools over stdio for direct integration with Claude Code, Claude Desktop, Cursor, or external custom agents.

**Priority:** Completed.

---

## 6. Already covered — no action needed

- **Human-confirmation-before-finalize** — Sangfor's workflow example ends in "human confirmation" before closing the loop. Synapse's Draft mode already has an explicit review step + agreement checkbox before final document generation. ✅ No gap here, just noting the parallel.
- **Workflow + knowledge + rules = agent** — Synapse's Draft mode (structured per output sub-section, grounded in reference docs) already follows this shape conceptually. No structural change needed.

---

## Suggested sequencing (Status Selesai)

1. [x] Chunking review + table handling (backend, parsing correctness)
2. [x] Reranking pass (backend, retrieval quality)
3. [x] Reflect-before-generate step in Draft mode (backend, draft quality)
4. [x] Document parsing enhancements: Signature/stamp page noise reduction & Scanned OCR fallback (backend)
5. [x] Evaluation benchmark suite (backend, before/after retrieval regression test - 100% pass)
6. [x] MCP server endpoint (`backend/mcp_server.py` stdio JSON-RPC protocol)
