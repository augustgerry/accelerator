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
- [x] `ProgressHeader` component
- [x] `ExportModal` — 3 tab: Word Standar (matrix/narrative), Template Word (upload+preview+generate), Salin/Markdown
- [x] `OnboardingModal`
- [x] `lib/api.ts` — semua API functions: uploadTor, segmentTor, generateItemDraft, exportProposalDocx, uploadTemplate, exportFromTemplate, searchKnowledgeBase
- [x] `lib/types.ts` — TemplateSection, TemplateInfo types added
- [x] Design system: light MOIP-style dengan yellow accent, Tailwind tokens

---

## 🔄 SEDANG DIKERJAKAN / IN PROGRESS

**Status saat ini:** Semua file sudah ditulis, BELUM di-commit ke GitHub.

### Yang perlu di-commit:
```
backend/app/config.py
backend/app/routers/draft.py        ← BARU: upload-template + export-from-template endpoints
backend/app/routers/query.py        ← UPDATE: return sources[] untuk Glean UI
backend/app/services/llm_provider.py ← UPDATE: GeminiProvider + segment_document
backend/app/services/retrieval.py   ← UPDATE: retrieve_chunks_with_full_metadata()
backend/requirements.txt            ← UPDATE: google-generativeai added
frontend/app/draft/page.tsx         ← BARU: Loopio checklist full implementation
frontend/app/page.tsx               ← UPDATE: dashboard dengan Glean search hero
frontend/app/search/page.tsx        ← BARU: Glean dual-panel search
frontend/components/draft/          ← BARU: export-modal.tsx + progress-header.tsx
frontend/components/onboarding-modal.tsx ← BARU
frontend/lib/api.ts                 ← UPDATE: template + search functions
frontend/lib/types.ts               ← UPDATE: TemplateSection, TemplateInfo types
```

---

## 📋 ROADMAP — NEXT TASKS (Prioritas Tinggi → Rendah)

### 🔴 HIGH PRIORITY — Belum dikerjakan sama sekali

#### 1. Template-Based Generation Enhancement
**Problem:** Saat ini `export-from-template` bisa ikuti struktur heading dari template Word, tapi belum bisa:
- Copy EXACT formatting dari template (table styles, custom paragraph styles, page headers/footers)
- Replace text di dalam template DOCX secara langsung (in-place replacement)
- Handle template dengan tabel (misalnya matriks compliance yang sudah ada kolomnya)

**Plan:**
- Gunakan `python-docx` `Document` object cloning: open template file, replace placeholder text, save as new file
- Endpoint baru: `POST /draft/export-clone-template` yang menerima binary template file + items
- Di frontend: simpan raw template File object (bukan hanya metadata) dan kirim keduanya ke backend

#### 2. Auto-Save Draft ke localStorage
**Problem:** Kalau user refresh browser, semua draft hilang karena state hanya di React.

**Plan:**
- Di `frontend/app/draft/page.tsx`: tambahkan `useEffect` yang persist `items` ke `localStorage` dengan key `synapse-draft-{fileName}`
- Load dari localStorage saat mount (kalau ada)
- Tambahkan indicator "Auto-saved" di ProgressHeader

#### 3. Search Page — Query Chips & History
**Problem:** Search page belum ada history pencarian sebelumnya.

**Plan:**
- Simpan array `searchHistory` di localStorage
- Tampilkan di bawah search bar sebagai "Pencarian Terakhir" chips
- Max 10 item

#### 4. Documents Page Enhancement
**Problem:** Halaman /documents terlalu basic, belum menampilkan file dengan preview chunk.

**Plan:**
- Tambahkan endpoint `GET /documents/{id}/chunks` yang return N chunks dari dokumen
- Di frontend: klik dokumen → expand dan tampilkan preview chunk-chunk-nya

### 🟡 MEDIUM PRIORITY

#### 5. Settings Page — LLM Provider Toggle
**File:** `frontend/app/settings/page.tsx`
**Plan:**
- UI untuk toggle antara Claude / Gemini / OpenAI
- Input API key (disimpan di localStorage, dikirim ke backend via header)
- Backend: baca API key dari request header (opsional, override .env)

#### 6. Proposal Types Support
User minta support berbagai jenis dokumen output:
- Technical Proposal / SoW
- Solution Brief
- MoM (Minutes of Meeting)
- PPT / Pitch Deck (via python-pptx)
- Competitive Comparison Matrix

**Plan:**
- Di ExportModal: dropdown "Jenis Dokumen" 
- Backend: `template_type` enum di `ExportDocxRequest`
- Buat format berbeda per jenis

#### 7. Folder Sync → Template Library
User minta: AI bisa baca template dari folder Google Drive yang sudah di-sync.

**Plan:**
- Saat sync GDrive, detect file dengan nama "Template_*" atau di folder "Templates/"
- Simpan di DB sebagai `doc_type = "template"`
- Di ExportModal tab "Template": tambahkan opsi "Gunakan Template dari Drive" → list template dari KB
- Backend fetch template dari storage dan parse dengan endpoint yang sudah ada

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
