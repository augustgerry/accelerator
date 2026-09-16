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

- [x] **Tables spanning multiple pages / Ingestion table loss** — ✅ **RESOLVED (Antigravity):** Fixed major data-loss bug in `backend/app/services/drive_sync.py` & `backend/app/routers/draft.py` (`upload_tor`). Previously, DOCX parsing only extracted `doc.paragraphs` and completely lost all tables (`doc.tables`). Now extracts paragraphs and tables in sequential document order via `_extract_docx_text_and_tables()`, converting all tables into structured Markdown tables (`| Col 1 | Col 2 |`).
- [ ] **Signature/stamp pages** — TOR and SoW documents usually end with signature blocks and company stamps. Decide explicitly: exclude these pages from embedding (they add noise, no retrievable value), but optionally keep a lightweight metadata flag like `has_signature_page: true` for provenance/citation purposes.
- [ ] **Scanned/OCR fallback** — confirm there's a fallback path for scanned PDFs (some older TORs from customers may be scans, not native PDFs).

**Priority:** Medium-high — affects data quality at ingestion, compounds into every downstream answer.

---

## 3. Evaluation / self-learning loop (Backend — Antigravity)

- [ ] **Before/after evaluation** — no current mechanism to measure whether a retrieval or prompt change actually improved answer quality. Even a lightweight version helps: keep a small fixed set of test questions with known-good answers, re-run them whenever chunking/reranking/prompt changes, and diff the outputs.
- [ ] **Synthetic QA generation** — Sangfor auto-generates Q&A pairs from the corpus to tune retrieval. Likely overkill for Synapse's current corpus size (dozens of documents, not enterprise-scale) — **flag as later/nice-to-have, not MVP-critical.**

**Priority:** Low for now — useful once the corpus and user base grow past a size where manual spot-checking stops being enough.

---

## 4. Security & access control (Backend — Antigravity, Frontend — Claude Code for UI)

- [ ] **Dynamic answer-scope control** — Synapse's roadmap includes cross-divisional scaling (sales, presales, cloud infra, network security, admin, etc.). Before that happens, need a real access model: which documents/sources a given user's queries are allowed to retrieve from. This is bigger than basic RBAC (who can log in) — it's scoping *what the retrieval layer is allowed to see* per user/role.
- [ ] **RBAC foundation** — if not already in place with Clerk/Auth0, define roles now (even just `owner`, `viewer`) so the scope-control work above has something to hook into later.

**Priority:** Medium — not urgent for the single-user MVP, but worth designing the data model now (e.g. a `document_access` table) so it isn't a painful retrofit later.

---

## 5. Ecosystem / integration surface (Backend — Antigravity)

- [ ] **Expose Synapse as an MCP server** — Sangfor highlighted "bidirectional MCP" (their agent can act as both an MCP client and an MCP server). For Synapse's future B2B SaaS angle, exposing a minimal MCP server interface (so Synapse's knowledge base can be queried directly from Claude Code, Claude Desktop, or a customer's own agent tooling) would be a strong differentiator and requires relatively little new backend surface — mostly wrapping the existing retrieval endpoint.

**Priority:** Low/exploratory — good positioning story, not needed for the internal MVP.

---

## 6. Already covered — no action needed

- **Human-confirmation-before-finalize** — Sangfor's workflow example ends in "human confirmation" before closing the loop. Synapse's Draft mode already has an explicit review step + agreement checkbox before final document generation. ✅ No gap here, just noting the parallel.
- **Workflow + knowledge + rules = agent** — Synapse's Draft mode (structured per output sub-section, grounded in reference docs) already follows this shape conceptually. No structural change needed.

---

## Suggested sequencing

1. Chunking review + table handling (backend, parsing correctness)
2. Reranking pass (backend, retrieval quality)
3. Reflect-before-generate step in Draft mode (backend, draft quality)
4. Document access/scope data model — design only, not full implementation yet (backend)
5. Everything else (self-learning loop, MCP server, full RBAC) — defer until post-MVP
