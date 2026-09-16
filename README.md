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
- `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `OPENAI_API_KEY` — matching `LLM_PROVIDER` (Active: `gemini-3.6-flash`)
- `DATABASE_URL` — Postgres connection string (with pgvector extension)
- `GOOGLE_DRIVE_FOLDER_ID` — the folder to index
- `ENABLE_EXTERNAL_RESEARCH` — `true` to enable deep live web and battlecard research

Also copy `frontend/.env.example` to `frontend/.env.local` and point
`NEXT_PUBLIC_API_URL` at your backend (defaults to `http://localhost:8000`).

## External research & Battlecard Engine (`/query` & `/research`)

Separate from or blended with the internal knowledge base. Implemented natively for both Claude (`web_search` / `web_fetch`) and Gemini (`gemini-3.6-flash` deep market intelligence).
- Automatically detects competitive comparisons (`vs`, `battlecard`, `kelebihan kekurangan`) or low internal confidence queries.
- Combines live web industry citations (VMware, Nutanix, Sangfor, Gartner, IDC) with internal TOR references into a unified, verified response.

## Visual & Proposal Engine

- **Modern 2D Flat Architecture Engine (`diagram_generator.py`)**: Generates clean Whimsical/Gemini-style 2D flat Mermaid architecture diagrams with semantic rounded nodes, pastel palettes, and multi-tier boundaries (Data Center, DR Site, Management/Backup). Renders via Kroki, mermaid.ink, or offline Pillow vector.
- **2D Technical Hardware Studio (`image_search.py`)**: Prioritizes clean transparent isolated PNG hardware shots. If photos are unavailable online, the synthetic generator renders realistic 2D rackmount chassis graphics (1U/2U/4U: Server/HCI, All-Flash SAN Storage, Core Switch) on-demand.
- **Rich Document Preview & Lightbox**: Interactive diagram zoom modal (`backdrop-blur-md`), formatted markdown preview with 1.5 line height and justified text, plus an enlarged 75vh A4 export preview.
- **Simplified Export**: Clean 3-preset export options: Word Proposal (.docx), Scope of Work (.docx), and Pitch Deck (.pptx).

## Autonomous Multi-Agent Architecture

- **Leader Agent 1 (Antigravity)**: Core backend engineering, RAG retrieval optimization, and system integration.
- **Worker Agent 2 (`.agents/worker_agent2.py`)**: Autonomous DataOps and benchmark evaluation daemon.
- **Sentinel Agent 3 (`.agents/agent3_sentinel.py`)**: Background health watchdog (60s loop) monitoring ports 8000 and 3000, clearing zombie processes, and auto-healing services.
- **Atomic Task Bus (`.agents/task_bus.py`)**: Decoupled JSON file-based task queue.

## Design notes

- **Non-divisional & unified**: Enterprise-wide single-tenant knowledge base without rigid divisional silos.
- **LLM provider is swappable** at runtime via `LLM_PROVIDER` (Claude, Gemini, OpenAI).
- **Evaluation benchmark**: Automated suite in `backend/tests/benchmark_eval.py` ensuring high precision and sub-second retrieval latency.
