# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal RAG knowledge base + drafting assistant for a presales team (PT Smartnet Magna Global). Indexes past work product (Google Drive → parse → chunk/embed → Postgres+pgvector) so it can be searched in natural language, and drafts tender-response documents (Proposal Teknis, SoW, Solution Brief, MoM, Klarifikasi Teknis, Pitch Deck) grounded in an uploaded TOR/RFP/KAK/RKS plus the knowledge base, exporting to Word/PDF/PPTX.

Stack: FastAPI (`backend/`) + Next.js 14 App Router/TypeScript/Tailwind (`frontend/`), PostgreSQL+pgvector, pluggable LLM (Claude/Gemini/OpenAI).

## Commands

**Backend** (from `backend/`):
```
./venv/Scripts/python.exe -m uvicorn main:app --port 8000
```
On Windows, always invoke uvicorn via `python -m uvicorn`, never `venv/Scripts/uvicorn.exe` directly — the exe shim has been observed to exit silently with no error in this setup. Avoid `--reload` when you need to be sure edited code is actually picked up; it has not always restarted the worker cleanly here — kill the process and start fresh instead.
```
./venv/Scripts/python.exe -m py_compile $(find app -name "*.py") main.py   # syntax check
./venv/Scripts/python.exe -c "import main; main.app.openapi()"             # import + route/schema sanity check
alembic upgrade head                                                        # apply migrations
```
No test suite exists in this repo. There is no linter/formatter configured for the backend either — `py_compile` + the `import main` check above are the only automated correctness signals short of exercising a route.

**Frontend** (from `frontend/`):
```
npm run dev             # localhost:3000
npm run build            # production build; also the closest thing to a full typecheck across all routes
npx tsc --noEmit          # typecheck only, faster iteration
```
`npm run lint` (`next lint`) has never been configured in this project — running it launches an interactive ESLint setup wizard, which hangs in a non-interactive shell. Don't rely on it; `tsc --noEmit` plus `npm run build` are what this repo actually uses to catch issues.

**Verifying document generation changes**: there's no fixture/test harness for the docx/pdf/pptx export code. To check a change to `export_proposal_docx`/`export_proposal_pdf`/`export_proposal_pptx`/`convert_office_pdf`, actually call the route function with a real payload and inspect the output (open with `python-docx`/`python-pptx`, check PDF magic bytes) — `py_compile` and even a successful `import main` do **not** execute function bodies, so they will not catch a runtime-only bug (see the two gotchas below, both found this way).

## Architecture

### Backend module map
- `app/routers/draft.py` — by far the largest file (~3000 lines): TOR upload, AI-recommended section structure (`/draft/recommend-structure`), per-item draft generation with automatic hardware-photo/HLD-diagram attachment, and export to docx/pdf/pptx across every document type/template combination. Read it in sections; don't assume changes are isolated — helper functions (`_add_item_heading`, `_fit_image_dimensions`, `_insert_logo_header_table`) are shared across the matrix/sow/solution_brief/mom/klarifikasi_teknis/pitch_deck/narrative branches.
- `app/services/llm_provider.py` — the only place that talks to an LLM vendor SDK. `get_llm_provider()` reads `LLM_PROVIDER` from `.env` and returns `ClaudeProvider`/`GeminiProvider`/`OpenAIProvider` (stub); every other module calls the abstract `LLMProvider` interface. `answer(mode=...)` has three real behaviors: `"draft"` (drafting persona, no citation markers), `"qa"` (used only by `/search` — asks the LLM to insert `[n]` citation markers matching the numbered context chunks), and anything else e.g. `"json"` (grounded answer, no citation markers — used by callers that need clean parseable output, like the HLD diagram generator). Do not let `mode="qa"`'s citation-marker instruction leak into a caller that needs raw JSON.
- `app/services/retrieval.py` — hybrid vector+keyword search (`_hybrid_ranked_chunks`); `doc_type`/`division` filters are exact case-insensitive matches, not substring search.
- `app/services/image_search.py` / `template_extractor.py` / `image_utils.py` — web hardware-photo search, embedded-image extraction from uploaded templates, and the shared Pillow RGBA→RGB flatten helper they both use.
- `app/services/diagram_generator.py` / `office_render.py` — Mermaid HLD diagram generation (LLM + Kroki/mermaid.ink rendering) and DOCX/PPTX→PDF conversion via real Microsoft Word/PowerPoint COM automation (PowerShell subprocess) — **requires Word/PowerPoint actually installed on Windows**; there's a ReportLab-based fallback PDF path for environments without Office, but it's not full-fidelity.
- `app/models.py` — every table carries a `workspace_id` from day one for future multi-tenant isolation, even though only one workspace (`default_workspace_id` in `config.py`) exists today.

### Two gotchas specific to `draft.py`, both the root cause of real bugs found in this codebase's history
1. **No module-level `python-docx` imports.** `Inches`, `Pt`, `RGBColor`, `WD_TABLE_ALIGNMENT`, `parse_xml`, `nsdecls`, `WD_ALIGN_PARAGRAPH` etc. are imported **locally inside every function that uses them**, not once at the top of the file. If you add a new module-level helper that touches docx objects, it needs its own local imports too — `py_compile` and `import main` will pass either way (they don't execute function bodies), and the bug only surfaces as a `NameError` the first time the function actually runs.
2. **Raw OOXML elements must be wrapped in a `<w:r>` run.** Appending `<w:fldChar>`/`<w:instrText>` (or similar low-level XML) directly onto a paragraph's `_p` element produces a file `python-docx` reads back without complaint, but real Microsoft Word rejects outright ("Word experienced an error trying to open the file") — this broke the Office-COM PDF preview for every export until it was found by actually round-tripping a generated file through Word, not by reading it back with python-docx.

### Document structure consistency
The canonical "Proposal Teknis" (`narrative`) section outline is a **style/grouping reference, not a fixed template** — `recommend_structure()` in both `ClaudeProvider` and `GeminiProvider` must analyze the actual uploaded TOR/RFP/KAK/RKS and adapt section count/titles/content to it; only the hierarchical-numbering convention (`1`, `1.1`, `3.2.1`) and topic grouping (e.g. Timeline/Scope of Work/Out of Scope as sub-sections of Implementation Plan, not separate chapters) are meant to carry over. The example lives once as `NARRATIVE_STRUCTURE_TEMPLATE` in `llm_provider.py` and is reused by both providers' prompts. The offline fallback (`_fallback_recommend_structure`, used when there's no document to analyze or the LLM call fails outright) and `frontend/lib/skeletons.ts`'s `SKELETONS.narrative` (client-side fallback used only if the `/draft/recommend-structure` API call itself fails) should be kept structurally aligned with that same reference when it changes.

### Frontend
- `app/draft/page.tsx` is the other very large file (~2500 lines): the whole TOR→structure-curation→per-item-drafting→export workflow.
- `recommend_structure` (backend AI call) is the primary path for generating a document's section list; `frontend/lib/skeletons.ts` is only a client-side fallback used if the API call itself throws (network/CORS failure) — it is not the normal path.
- `frontend/lib/document-types.ts` is the single source of truth for which export formats (pdf/docx/pptx) are valid per document type; keep new document types registered there.
- Search page markdown handling: raw `**bold**`/`*italic*` from indexed source text or LLM answers is stripped for display (`components/search/highlighted-text.tsx`'s `stripMarkdown`) rather than rendered — actual formatting is only shown in the real document preview.

### Environment / config
- `LLM_PROVIDER` in `backend/.env` selects `claude` | `gemini` | `openai`; only the matching API key needs to be set. Swapping providers is a config change, not a code change — every call site goes through `get_llm_provider()`.
- `ENABLE_EXTERNAL_RESEARCH` gates the `/research` endpoint (Claude native web_search/web_fetch, ~$10/1000 searches) server-side — the Settings page toggle is UI convenience only, this backend flag is the real cost control.
- CORS in `main.py` is a single `allow_origin_regex` matching any localhost/127.0.0.1 port — don't add an explicit `allow_origins` list alongside it, it would be redundant (the regex is already a superset).

### Working alongside another agent on this repo
This repo has at times been developed by two AI agent sessions (Claude Code + Antigravity) sharing the same working directory. If you're aware another agent may be active concurrently, prefer an isolated `git worktree` for your own branch rather than assuming exclusive control of the checked-out branch in this directory — a shared checkout has caused branches to switch out from under an in-progress session before. `SYNAPSE-CONTEXT.md` at the repo root is a running handoff log the agents maintain manually (status, recent fixes, known issues) — read it for current project state, but treat it as a session log, not as documentation of stable conventions (that's what this file is for).
