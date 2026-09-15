# SYNAPSE CONTEXT — Auto-Handoff File
> ⚠️ File ini di-update otomatis setiap ~15 detik. Jika AI agent sebelumnya habis quota, baca file ini dari atas untuk melanjutkan pekerjaan.

---

## 🗂️ PROJECT OVERVIEW

**Nama:** Synapse Knowledge Accelerator
**Repo:** https://github.com/augustgerry/accelerator
**Stack:** FastAPI (Python) backend + Next.js (TypeScript) frontend
**Database:** PostgreSQL + pgvector (Supabase)
**LLM:** Claude (Anthropic) atau Gemini (Google) — configurable via `.env`

**Tujuan Produk:**
Platform presales internal untuk tim Solution Architect di PT Solusi Mitra Gemilang (SMG) agar bisa:
1. **Search internal** — Glean-style: cari di arsip proposal/checklist dengan AI synthesis + sitasi
2. **Draft Tender (Loopio-style)** — Upload TOR/RFP, AI pecah jadi checklist klausul, susun draf per butir, ekspor ke Word
3. **Generator Proposal dari Template** — User upload template Word (.docx), AI ikuti struktur & font template, isi otomatis dari draft yang sudah dibuat

---

## 📁 STRUKTUR DIREKTORI

```
knowledge-accelerator/
├── backend/
│   ├── app/
│   │   ├── config.py          — Settings (LLM provider, API keys, DB URL)
│   │   ├── db.py              — SQLAlchemy session
│   │   ├── models.py          — Document, DocumentChunk SQLAlchemy models
│   │   ├── routers/
│   │   │   ├── draft.py       — /draft/* endpoints (upload, segment, item, export-docx, upload-template, export-from-template)
│   │   │   ├── query.py       — /query endpoint (search KB + return AI answer + sources)
│   │   │   ├── documents.py   — /documents/* (list, sync dari GDrive)
│   │   │   ├── health.py      — /health
│   │   │   └── research.py    — /research (external web search via Claude)
│   │   └── services/
│   │       ├── llm_provider.py  — LLMProvider ABC, ClaudeProvider, GeminiProvider
│   │       ├── retrieval.py     — pgvector similarity search functions
│   │       └── embeddings.py    — sentence-transformers embed_text()
│   ├── requirements.txt
│   ├── main.py
│   └── .env                   — API keys (TIDAK di-commit)
├── frontend/
│   ├── app/
│   │   ├── page.tsx           — Dashboard (hero search + 2 action cards)
│   │   ├── search/page.tsx    — Glean-style dual-panel search
│   │   ├── draft/page.tsx     — Loopio-style TOR checklist workspace
│   │   ├── documents/page.tsx — Daftar dokumen terindeks
│   │   └── settings/page.tsx  — Settings (LLM provider selector dll)
│   ├── components/
│   │   ├── draft/
│   │   │   ├── export-modal.tsx     — Modal ekspor (3 tab: Word Standar, Template, Markdown)
│   │   │   └── progress-header.tsx  — Progress bar + global actions di draft page
│   │   ├── ai-panel.tsx       — Chat panel (QA / Draft / Research mode)
│   │   ├── sidebar.tsx        — Nav sidebar
│   │   ├── topbar.tsx         — Page header
│   │   ├── logo.tsx
│   │   └── onboarding-modal.tsx
│   └── lib/
│       ├── api.ts             — Semua API calls ke backend
│       └── types.ts           — TypeScript types
└── SYNAPSE-CONTEXT.md         ← FILE INI
```

---

## ✅ YANG SUDAH SELESAI

### Backend
- [x] FastAPI app dengan semua router terdaftar
- [x] `POST /draft/upload` — extract text dari PDF/DOCX TOR
- [x] `POST /draft/segment` — AI segment TOR jadi list RequirementItem (LLM + fallback heuristic)
- [x] `POST /draft/item` — generate draf per klausul grounded in KB (retrieve + LLM)
- [x] `POST /draft/export-docx` — export Word matrix/narrative tanpa template
- [x] `POST /draft/upload-template` — parse struktur DOCX template (headings, fonts, styles)
- [x] `POST /draft/export-from-template` — generate Word mengikuti struktur template + AI fill
- [x] `GET/POST /query` — search KB + return AI answer + per-chunk source citations
- [x] `GeminiProvider` implemented (google-generativeai)
- [x] `retrieve_chunks_with_full_metadata()` — per-chunk retrieval tanpa dedup untuk Glean UI
- [x] `segment_document()` di LLMProvider + ClaudeProvider + GeminiProvider
- [x] Fallback heuristic segmenter `_fallback_segment_text()`
- [x] Error handling LLM (billing/credits) dengan graceful fallback message

### Frontend
- [x] Dashboard page (hero search bar + 2 action cards: Glean + Loopio)
- [x] **Search page** — Glean dual-panel: left=citation cards dengan keyword highlight, right=AI synthesized answer + source list
- [x] **Draft page** — Loopio checklist: upload TOR → segment → per-item editor dengan status (todo/draft/final), search/filter, custom instruction, copy, progress bar
- [x] **Auto-save localStorage** — draft items + fileName disimpan otomatis ke localStorage setiap kali ada perubahan. Dipulihkan saat browser refresh. Timestamp lastSaved tampil di ProgressHeader.
- [x] `ProgressHeader` component (termasuk `lastSaved` indicator)
- [x] `ExportModal` — 3 tab: Word Standar (matrix/narrative), Template Word (upload+preview+generate), Salin/Markdown
- [x] `OnboardingModal`
- [x] `lib/api.ts` — semua API functions: uploadTor, segmentTor, generateItemDraft, exportProposalDocx, uploadTemplate, exportFromTemplate, searchKnowledgeBase
- [x] `lib/types.ts` — TemplateSection, TemplateInfo types added
- [x] Design system: light MOIP-style dengan yellow accent, Tailwind tokens
- [x] **In-Place Template Cloning** (`POST /draft/clone-template`) — preserve 100% font, margins, tables, header/footer template Word asli dengan placeholder tokens (`{{PROPOSAL_TITLE}}`, `{{ITEM_TITLE}}`, `{{ITEM_RESPONSE}}`, `{{COMPILED_RESPONSES}}`)
- [x] **Clone Mode UI** di `ExportModal` — user bisa pilih mode clone vs mode struktur, preview token placeholder docs
- [x] **Settings Page** (`/settings`) — switch LLM Provider (Claude, Gemini, OpenAI), API Key configuration, Google Drive sync management, local storage cleaner
- [x] **Search History Persistence** — simpan riwayat pencarian ke localStorage dan tampilkan chip pencarian terakhir
- [x] **Git Auto-Commit Script** (`auto-commit.ps1`) — background process yang mendeteksi perubahan file dan push ke GitHub tiap 15 detik

---

## 🔄 STATUS GIT & HANDOFF TERAKHIR

**Status Repositori:**
- Branch: `main`
- Commit Terakhir: `e01f41b` ("feat: in-place clone-template endpoint (preserves ALL docx formatting), clone mode UI in ExportModal with placeholder docs")
- Status: **Up to date dengan origin/main (GitHub). Working tree CLEAN.**
- Semua file kode di backend dan frontend sudah ter-push ke GitHub repo https://github.com/augustgerry/accelerator.

> 💡 **PETUNJUK UNTUK CLAUDE CODE / NEXT AGENT:**
> Jika kamu melanjutkan sesi ini menggunakan Claude Code:
> 1. Kode sudah 100% tersinkronisasi di GitHub dan lokal.
> 2. Backend berjalan di port 8000 (`uvicorn main:app --reload --port 8000`).
> 3. Frontend berjalan di port 3000 (`npm run dev` di folder `frontend/`).
> 4. Silakan langsung lanjutkan task prioritas di bawah ini.

---

## 📋 ROADMAP — NEXT TASKS (Prioritas Lanjutan)

### 🔴 PRIORITY 1: Documents Page Enhancement
**File:** `frontend/app/documents/page.tsx` & `backend/app/routers/documents.py`
- Tambahkan endpoint `GET /documents/{id}/chunks` untuk ambil preview chunk dokumen.
- Di frontend UI: expand dokumen saat diklik untuk menampilkan cuplikan teks chunk-chunk yang tersimpan di pgvector.

### 🟡 PRIORITY 2: Folder Sync → Template Library (Google Drive Integration)
**File:** `backend/app/routers/documents.py` & `frontend/components/draft/export-modal.tsx`
- Saat sync Google Drive, deteksi dokumen template (.docx) dan beri tag `doc_type = "template"`.
- Di `ExportModal` tab template: sediakan opsi dropdown "Pilih Template dari Library Drive" tanpa user harus upload file manual setiap kali.

### 🟡 PRIORITY 3: Multi-Format Proposal Types (SoW, Solution Brief, MoM, PPT Deck)
**File:** `backend/app/routers/draft.py` & `frontend/components/draft/export-modal.tsx`
- Buat generator SoW, Solution Brief, dan MoM (Minutes of Meeting).
- Siapkan generator presentasi PPT / Pitch Deck (menggunakan library `python-pptx`).

---

## ⚙️ ENVIRONMENT & CARA JALANKAN

### Backend
```bash
cd backend
pip install -r requirements.txt
# Buat .env dengan:
# LLM_PROVIDER=gemini  (atau claude)
# GOOGLE_API_KEY=...   (kalau gemini)
# ANTHROPIC_API_KEY=... (kalau claude)
# DATABASE_URL=postgresql://...
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Running at http://localhost:3000
```

---

## 🔑 KEY DESIGN DECISIONS

1. **Pluggable LLM**: `get_llm_provider()` baca dari `settings.llm_provider` (.env). Ganti provider = ganti env var saja.
2. **Fallback Segmentation**: Kalau LLM gagal/no credits, `_fallback_segment_text()` pake regex heuristic.
3. **Template Parsing**: Upload-template endpoint extract semua paragraph metadata (style, level, font). Frontend simpan ini sebagai state, kirim balik ke export-from-template.
4. **Per-chunk Citation**: Query endpoint return per-chunk source, bukan per-dokumen, agar Glean UI bisa show snippet text setiap kutipan.
5. **Design**: Light theme, yellow accent (#F5C518 range), Inter font, MOIP/Glean-inspired.

---

## 🐛 KNOWN ISSUES / NOTES

- `retrieve_chunks_with_full_metadata` tidak dedup per dokumen — satu dokumen bisa muncul beberapa kali di search results (by design, tiap chunk = 1 card)
- Template export (`export-from-template`) menggunakan keyword matching antara heading text dan item category — kalau nama heading di template tidak cocok dengan category name (Teknis/SLA dll), items akan masuk ke "Tanggapan Teknis Tambahan" fallback section
- Backend masih perlu GDrive credentials (credentials.json) untuk fitur sync dokumen

---

*Last updated: AUTO-SAVED oleh skrip auto-commit*
*Agent: Antigravity (Google Deepmind)*
