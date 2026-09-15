# Synapse — Internal Knowledge & Proposal Accelerator

> ⚠️ **Historical / superseded.** This was the original project spec, written
> when Draft mode was still a freeform chat. That's long done. For current
> state, read **`SYNAPSE-CONTEXT.md`** instead — it's the actively maintained
> handoff file. Kept here for the original product framing (Glean/Loopio
> positioning, explicit non-goals) which is still accurate.

Handoff document for continuing development. Written for another AI coding
assistant (e.g. Antigravity/Gemini) to read and continue work from the
current state — not a marketing doc, a working spec.

## What this is

An internal, AI-powered (RAG) tool for a presales/solution-design team at
an IT infrastructure company (SMG, part of CTI Group, Indonesia). It has
two purposes:

1. **Search** the company's own past work (checklists, TORs, SoWs, TCO
   models, decks) in natural language, with cited answers.
2. **Draft** clause-level responses to a new RFP/TOR, grounded in that same
   knowledge base.

### Explicit positioning (do not blur this)

There is a separate, existing internal tool ("MOIP" — Magna Opportunity
Intelligence Platform) that does **customer-facing** opportunity research:
KYC-style company research, persona-based pitch playbooks, meeting
tracking, pipeline stages. Synapse is **not** that. Synapse is
**internal-facing**: it indexes the team's own historical documents so any
division can retrieve or draft from institutional knowledge, regardless of
who originally wrote it. Do not add customer/opportunity-pipeline features
here — that's a deliberately separate, future project.

### Product model — borrow from two categories, simplified

Synapse's two modes map to two established SaaS categories. Build simple
versions of the core mechanic from each, not their full complexity:

- **Search mode ≈ Glean** (enterprise workplace search): one search bar,
  answers synthesized from indexed documents, always cited. This mode is
  already built and works this way — keep it, just give it more visual
  prominence as the "home" experience.
- **Draft mode ≈ Loopio** (RFP response software): the core Loopio
  mechanic is *not* a chatbot — it's **import a document → break it into a
  list of discrete questions/requirements → auto-suggest an answer for
  each from a content library → user accepts/edits per item → track
  progress → export the compiled result.** Draft mode currently exists as
  a freeform chat and needs to be **restructured** to this checklist
  pattern (see "Next task" below — this is the main open work).

Explicitly **not** in scope for the simple version: SME assignment, review
cycles, multi-tenant content libraries, portal browser extensions, 250+
connectors. One user, one workspace, for now.

## Current status (as of this handoff)

### Working end-to-end
- Google Drive (personal, recursive across subfolders) is the document
  source. 161 documents / 4,586 chunks synced into Postgres+pgvector on
  Supabase. `division` field is populated from the Drive subfolder name.
- Database schema is version-controlled via Alembic
  (`backend/alembic/versions/`), not manual — `alembic upgrade head`
  reproduces it on a fresh DB.
- Git repo initialized, pushed to `github.com/augustgerry/accelerator`,
  `main` branch. `.gitignore` excludes `.env`, `credentials.json`,
  `token.json`, `venv/`, `node_modules/`.
- Backend (FastAPI) and frontend (Next.js) both run locally
  (`localhost:8000` / `localhost:3000`).

### Blocked / not yet verified
- `/query` (Search mode) and `/draft` (Draft mode) both call the Claude
  API and are confirmed still blocked on Anthropic account credit
  balance — tested live just now: `POST /query` returns `500`, backend
  log shows `anthropic.BadRequestError: Error code: 400 -
  {'type': 'invalid_request_error', 'message': 'Your credit balance is
  too low to access the Anthropic API...'}`. Request path (retrieval →
  `llm_provider.answer()` → Anthropic call) is reached correctly and the
  error is purely a billing block, not a code bug — but neither endpoint
  has ever returned a real Claude response end-to-end. Top up Anthropic
  credits, then re-test both before relying on this.
- External research (`/research`, web_search + web_fetch) is implemented
  for the Claude provider only, gated off by default
  (`ENABLE_EXTERNAL_RESEARCH=false`), untested live (same credit block
  would apply).

### Known incomplete
- **TOR upload endpoint** (`POST /draft/upload` in
  `backend/app/routers/draft.py`) is now implemented — reads the
  uploaded file, routes to `pypdf` (PDF) or `python-docx` (DOCX) by
  content-type/extension, returns `{ "text": ... }`. Verified: route
  responds `422` (not `404`/`NotImplementedError`) when called without a
  file, i.e. it's wired up and validating input correctly.
- **Documents page** (`frontend/app/documents/page.tsx`) is done — no
  longer a raw table. It's a status summary card (total documents, total
  chunks, last sync timestamp, via new `GET /documents/summary`) plus a
  "Sync Sekarang" button that calls `POST /documents/sync`. Confirmed
  live: summary endpoint currently reports 161 documents / 4,586 chunks.

## Architecture

```
knowledge-accelerator/
├── frontend/                  Next.js 14 (App Router) + TypeScript + Tailwind
│   ├── app/
│   │   ├── page.tsx              Dashboard
│   │   ├── search/page.tsx       Q&A mode (Glean-style)
│   │   ├── draft/page.tsx        Draft mode (Loopio-style — being restructured)
│   │   ├── documents/page.tsx    Indexed documents status
│   │   └── settings/page.tsx     Drive connection, LLM provider, workspace
│   ├── components/
│   │   ├── sidebar.tsx, topbar.tsx, ai-panel.tsx (3-mode: qa/draft/research)
│   │   ├── logo.tsx               custom SVG mark (connected nodes)
│   │   └── ui/                    button, card, badge, switch (shadcn-style primitives)
│   └── lib/
│       ├── api.ts                 fetch client to backend
│       └── types.ts
└── backend/                    FastAPI
    ├── app/
    │   ├── models.py              SQLAlchemy — workspace_id on every table (multi-tenant ready)
    │   ├── config.py              env-driven settings
    │   ├── routers/
    │   │   ├── query.py           POST /query — Q&A over knowledge base
    │   │   ├── draft.py           POST /draft, POST /draft/upload (TOR)
    │   │   ├── documents.py       GET /documents, POST /documents/sync
    │   │   ├── research.py        POST /research — external web search (Claude only)
    │   │   └── health.py
    │   └── services/
    │       ├── llm_provider.py    pluggable: ClaudeProvider implemented; Gemini/OpenAI stubbed
    │       ├── retrieval.py       pgvector cosine-similarity top-k search
    │       ├── embeddings.py      local sentence-transformers model (no API cost)
    │       └── drive_sync.py      recursive Google Drive traversal + text extraction
    └── alembic/                   schema migrations
```

### Design system (light theme, decided after iterating away from an
initial dark theme that didn't match the intended reference)

- Structure inspired by an internal reference tool ("MOIP"): white
  background, white sidebar with a thin right border, soft gray card
  borders (`#E5E7EB`), no heavy shadows, uppercase small-caps gray labels
  for field headers.
- **Accent color is intentionally NOT MOIP's blue** — the user chose a
  warm elegant yellow, paired with black and blue, to give Synapse its own
  identity rather than copying the reference 1:1:
  - `accent` (yellow): `#F0C239` — used for AI-related highlights/badges,
    background only; text/icons on top of it use `accent.ink` (`#17171A`,
    near-black) for contrast, never white-on-yellow.
  - `accent.soft`: `#FDF6DC` — pale yellow badge backgrounds.
  - Primary action buttons: solid black (`#111827`), not yellow — yellow
    is an accent/highlight color, not a call-to-action color.
  - `secondary` (blue): `#2F5FE0` — used for links and internal-document
    citations specifically (external/web citations, if shown, should stay
    visually distinct — e.g. a different tone — from internal ones).
  - Logo mark: black rounded-square background, yellow connected-nodes
    icon (was previously teal-on-dark).

### LLM provider (pluggable by design)

`backend/app/services/llm_provider.py` — swap via `LLM_PROVIDER` env var
(`claude` | `gemini` | `openai`). Only `ClaudeProvider` is implemented;
`GeminiProvider` and `OpenAIProvider` raise `NotImplementedError` and need
real implementations if the provider is ever switched. Do not hardcode any
one vendor's SDK outside this file.

## Next task — restructure Draft mode into a Loopio-style checklist

This is the main piece of open, well-scoped work. Goal: replace the
current freeform-chat draft experience with a structured per-item flow.

**Flow:**
1. User uploads a TOR/RFP (PDF/DOCX) on `/draft`.
2. Backend extracts the document's text (via `/draft/upload`, using pypdf
   / python-docx — implement if not already done).
3. A new step is needed: **segment the extracted text into a list of
   discrete questions/requirements** (likely needs an LLM call with a
   prompt like "extract each distinct requirement or question from this
   TOR as a structured list" — returns structured JSON, one item per
   requirement/clause).
4. For **each** item, run the existing retrieval + draft logic (same
   pattern as `/draft` today) to generate a suggested answer grounded in
   the knowledge base — but per-item, not as one long chat reply.
5. Frontend renders this as a **checklist/table**, not a chat thread: each
   row = one requirement, with its suggested draft answer, an edit
   affordance, and a status (e.g. Belum dijawab / Draf / Final).
6. A progress indicator shows completion (e.g. "12 / 20 item terjawab").
7. A "Copy semua" / export action compiles all finalized answers into one
   block of text the user can paste into their actual proposal document.

**Suggested new backend pieces:**
- A new endpoint, e.g. `POST /draft/segment` — takes extracted TOR text,
  returns `{ items: [{ id, requirement_text }] }`.
- Reuse `retrieval.py` + `llm_provider.answer(mode="draft")` per item
  rather than building a second drafting code path.
- Consider a lightweight in-memory or DB-backed session to hold the
  per-item state (draft text, status) while the user works through the
  list, rather than recomputing on every render.

**Suggested new frontend pieces:**
- Replace the chat-style right panel on `/draft` with a checklist view
  (left: list of requirement items with status; clicking one shows/edits
  its draft answer, possibly still using a compact version of `ai-panel.tsx`
  for the "regenerate this one" interaction).
- A progress bar component (simple: `completed / total`).

## Repo / environment reference

- GitHub: `github.com/augustgerry/accelerator`, branch `main`.
- `backend/.env` (not committed) needs: `LLM_PROVIDER`, `ANTHROPIC_API_KEY`,
  `DATABASE_URL` (Supabase pooler connection string — the direct connection
  host is IPv6-only and fails on IPv4-only networks, use the pooler),
  `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_OAUTH_CREDENTIALS_PATH`,
  `ENABLE_EXTERNAL_RESEARCH`.
- `backend/credentials.json` + `backend/token.json` — Google OAuth client
  secret + cached user token, both gitignored, both required for Drive
  sync to run without re-prompting login every time.
- Embedding model is `sentence-transformers` (local, ~1GB download on
  first run, cached after) — not an API call, no per-embedding cost.
- Run: `npm install && npm run dev` (frontend, port 3000);
  `pip install -r requirements.txt && uvicorn main:app --reload` (backend,
  port 8000, inside a venv).

## Ground rules for continuing work

- Keep the LLM provider abstraction intact — no direct vendor SDK calls
  outside `llm_provider.py`.
- Keep `workspace_id` on any new table — multi-tenant readiness is a
  deliberate, already-adopted convention, not optional for new schema.
- Don't reintroduce customer/opportunity/pipeline-tracking features — that
  scope is explicitly deferred to a separate future project.
- Match the existing design tokens (yellow/black/blue, light theme) rather
  than introducing new colors — see "Design system" above for exact values.
