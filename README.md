# Internal Knowledge & Proposal Accelerator

Internal, AI-powered (RAG) knowledge base and drafting assistant. Indexes past
work product (checklists, TOR, SoW, TCO models, decks) so any division can
search it in natural language, and drafts clause-level text (e.g. SLA/PM/CM)
grounded in an uploaded RFP/TOR plus the knowledge base.

This scaffold mirrors the architecture diagram: Google Drive (source) →
document parser + chunk/embed → PostgreSQL + pgvector (knowledge core) →
pluggable LLM provider (Claude / GPT / open-source) → FastAPI → Next.js.

## Structure

```
knowledge-accelerator/
├── frontend/          Next.js 14 (App Router) + TypeScript + Tailwind
│   ├── app/
│   │   ├── page.tsx           Dashboard — indexed docs, recent activity
│   │   ├── search/            Q&A mode — ask the knowledge base, cited answers
│   │   ├── draft/             Draft mode — upload a TOR, get clause-level drafts
│   │   ├── documents/         Browse indexed documents (source: Google Drive)
│   │   └── settings/          Drive connection, LLM provider, workspace
│   ├── components/            Sidebar, topbar, AI panel, shared UI primitives
│   └── lib/                   Types, API client, utils
└── backend/           FastAPI
    └── app/
        ├── routers/           query, draft, documents, research, health
        └── services/          llm_provider (pluggable), retrieval, embeddings,
                                drive_sync
```

## Running locally

**Frontend**
```
cd frontend
npm install
npm run dev
```

**Backend**
```
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Copy `.env.example` to `.env` in `backend/` and fill in:
- `LLM_PROVIDER` — `claude` | `gemini` | `openai` (pluggable, see `services/llm_provider.py`)
- `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `OPENAI_API_KEY` — only the one matching `LLM_PROVIDER`
- `DATABASE_URL` — Postgres connection string (Supabase free tier works — pgvector included)
- `GOOGLE_DRIVE_FOLDER_ID` — the folder to index
- `ENABLE_EXTERNAL_RESEARCH` — `true` to turn on the `/research` endpoint (costs ~$10/1000 searches)

Also copy `frontend/.env.example` to `frontend/.env.local` and point
`NEXT_PUBLIC_API_URL` at your backend (defaults to `http://localhost:8000`).

## External research (`/research`)

Separate from the internal knowledge base. Uses Claude's native `web_search`
+ `web_fetch` server tools — live web results with citations, no manual
catalog to maintain (unlike a hand-curated solutions list). Billed ~$10 per
1,000 searches on top of normal token cost. Only implemented for the
`claude` provider today (`ClaudeProvider.research_external()` in
`llm_provider.py`) — Gemini/OpenAI equivalents (Google Search grounding /
OpenAI web search) are stubbed for later.

Gated server-side by `ENABLE_EXTERNAL_RESEARCH` (default `false`) — the
Settings page toggle is a UI convenience, but the real cost control lives
in this backend flag so a stray frontend state can't rack up billing.
On the frontend, it's a mode switch inside the same AI panel on the Search
page ("Internal" vs "Riset Eksternal"), with citations visually
distinguished — teal for internal documents, gold for external web sources.

## Design notes

- **Multi-tenant ready**: every core table carries a `workspace_id` from day
  one (see `backend/app/models.py`), so the same codebase can later serve
  isolated SI-partner workspaces without a schema rewrite.
- **LLM provider is swappable** at runtime via `LLM_PROVIDER` — no vendor
  lock-in, and it's easy to route cheap/simple queries to a lighter model
  later.
- **Demo dataset**: point `GOOGLE_DRIVE_FOLDER_ID` at a folder containing your
  own reference documents (migration checklists, TCO models, SoWs) and a
  sample TOR for the draft-mode demo.
