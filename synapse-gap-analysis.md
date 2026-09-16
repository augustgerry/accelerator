# Synapse — Gap Analysis vs. Sangfor Agent Builder Demo

Context: Sangfor demoed their Agent Builder platform (RAG + agentic workflow builder) during a bootcamp session. Several of their design patterns map directly onto gaps in Synapse (our internal knowledge/proposal accelerator). This doc lists what's missing, who should own it (Claude Code = frontend, Antigravity = backend), and rough priority. Update this file as items are picked up or resolved — treat it as the shared backlog between the two agents.

---

## 1. Retrieval quality (Backend — Antigravity)

- [ ] **Reranking pass** — currently Synapse likely returns top-k vector matches as-is. Add a reranking step after initial pgvector retrieval, before passing chunks to Claude. Options: a hosted cross-encoder reranker (e.g. Cohere Rerank) called as a second API step, or a lightweight local reranker — either works with pgvector, no need to migrate vector DB.
- [ ] **Reflect-before-generate step** — before generating a draft answer/section, add a check: "is the retrieved context actually sufficient to answer this sub-section?" If not, re-query with a reformulated query (wider scope, different keywords, or pull an adjacent sub-section's sources) before falling back to generation. This directly targets hallucinated/thin drafts on sparse source material.
- [ ] **Chunking strategy review** — confirm current chunking isn't naive fixed-length splitting. For TOR/SoW-style docs, chunk boundaries should respect section/sub-section headers and keep tables intact as single chunks rather than splitting mid-table.

**Priority:** High — these three directly affect answer/draft quality, which is the core value prop.

---

## 2. Document parsing (Backend — Antigravity)

- [ ] **Tables spanning multiple pages** — check how the current parser (whatever library is being used to ingest PDFs/DOCX) handles a table that breaks across a page boundary. Today it may be silently split into two disconnected chunks. Needs either OCR/layout-aware table reconstruction or an explicit "continued table" merge step.
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
