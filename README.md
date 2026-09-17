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

- **Tri-Mode High Level Design (HLD) Engine (`diagram_generator.py` & `hardware_rear_render.py`)**:
  1. **🔀 Skematik Vector Topology**: Diagram topologi logikal arsitektur multi-tier (ISP -> Firewall HA -> Core ToR -> Compute Cluster -> Storage) dengan link redundan (10G LACP, 25G RoCE, 100G MLAG).
  2. **🏢 Visual 2D Enterprise Datacenter Rack**: Elevasi rak 2D multi-layer beresolusi tinggi (1400x960) lengkap dengan jalur kabel berwarna dan ringkasan spesifikasi.
  3. **🖥️ Tampak Belakang Perangkat & Port I/O**: Chassis tampak belakang dinamis yang disesuaikan dengan perangkat (Pure Storage FlashArray //X / //C / RC20 dual-controller active/active dengan 32G FC / 25G NVMe-oF & dual 1600W PSUs, 1U Firewall FortiGate 100F dengan HA sync link & SFP+, 1U Switch Cisco Catalyst dengan StackWise-480, 2U Server/Storage).
- **Official Verified Vendor Stencils & Strict Negative Filtering (`image_search.py`)**:
  - Menyediakan stensil transparan resmi vendor untuk **Pure Storage (FlashArray //X, //C, RC20)**, **Fortinet FortiGate (100F, 200F, 60F)**, **Cisco Catalyst (9300, 9200)**, **HPE ProLiant DL360 Gen10**, dan **Dell PowerEdge R750**.
  - Filter negatif ketat yang memblokir foto streamer/viral YouTube dan memvalidasi keaslian perangkat keras IT.
- **Background AI Learning & Stencil Upload (`/documents`)**:
  - Panel upload dokumen acuan (PDF, DOCX, TXT) yang otomatis memotong teks per klausul dan mengindeksnya ke PostgreSQL `pgvector`. AI mempelajari stensil, datasheet, dan proposal lampau untuk memperkaya jawaban teknis RFP/TOR secara mandiri di background.
- **Product Breakdown Sub-Sections & 1-Click Proposal Insertion**:
  - Fitur breakdown produk otomatis pada Bab *Proposed Solution*: spesifikasi perangkat utama (Pure Storage / HCI), rasio reduksi data (DRR 3:1 - 5:1), arsitektur redundansi SAN Fabric HA, proteksi snapshot SafeMode immutable, dan matriks kompatibilitas OS/hypervisor (VMware/KVM).
- **Pinned Top Action Bar & Word Document Preview**:
  - Bilah aksi draf proposal yang menempel permanen (*docked top*) tanpa efek melayang saat di-scroll, lengkap dengan pratinjau lembar kertas Microsoft Word (A4, ruler margins, letterhead, dan stabilo sitasi).
- **Formula Sanitizer (Bebas Simbol LaTeX Rusak)**:
  - Mengonversi formula matematika LaTeX mentah (`$$\text{Total Kapasitas Efektif} = \frac{...}{...}$$`) menjadi notasi teks bersih Bahasa Indonesia: `Total Kapasitas Efektif = (Kapasitas Raw × Rasio Reduksi Data (DRR)) / (Overhead Sistem)`.
- **A4 Pop-up Document Preview & Word Export**:
  - Modal pratinjau dokumen 5 halaman (Cover, Document Release, Pengakuan Kerahasiaan NDA, Daftar Isi, Konten) dengan running header logo korporat proporsional (`h-16 max-w-[240px]`).
  - Ekspor Word (.docx) resmi dengan tabel bergaris bersih dan format teks terjustifikasi.

## Autonomous Multi-Agent Architecture

- **Leader Agent 1 (Antigravity)**: Core backend engineering, RAG retrieval optimization, and system integration.
- **Worker Agent 2 (`.agents/worker_agent2.py`)**: Autonomous DataOps and benchmark evaluation daemon.
- **Sentinel Agent 3 (`.agents/agent3_sentinel.py`)**: Background health watchdog (60s loop) monitoring ports 8000 and 3000, clearing zombie processes, and auto-healing services.
- **Atomic Task Bus (`.agents/task_bus.py`)**: Decoupled JSON file-based task queue.

## Design notes

- **Non-divisional & unified**: Enterprise-wide single-tenant knowledge base without rigid divisional silos.
- **LLM provider is swappable** at runtime via `LLM_PROVIDER` (Claude, Gemini, OpenAI).
- **Evaluation benchmark**: Automated suite in `backend/tests/benchmark_eval.py` ensuring high precision and sub-second retrieval latency.
