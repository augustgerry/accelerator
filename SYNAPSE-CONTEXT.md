# SYNAPSE CONTEXT — Auto-Handoff File
> ⚠️ File ini di-update otomatis setiap ~15 detik. Jika AI agent sebelumnya habis quota, baca file ini dari atas untuk melanjutkan pekerjaan.

---

## 📍 STATUS AKTIF (SEDANG DIKERJAKAN DETIK INI)
- **Task Saat Ini:** Melanjutkan enhancement produk poin 2-5: PDF export, quality check, proposal sessions, dan batch review.
- **Poin 1 selesai:** Hardening LLM provider sudah diimplementasikan di commit sesi ini. Provider/API key divalidasi, error vendor dipetakan ke pesan aman, endpoint query/draft tetap punya fallback manual/lokal, dan external research mengembalikan HTTP 503 yang actionable.
- **Request User (verbatim intent):** User mau generator proposal (Proposal Teknis / SoW / Solution Brief / MoM / PPT Pitch Deck) bisa dikasih **landasan template** — baik upload manual atau ambil dari Template Library hasil sync Drive (Priority 2) — lalu AI ikutin template itu **sampai ke sub-bab, jenis font, ukuran font, semua detail teknis Word/PPT**, dan ngisi konten pakai AI sepintar mungkin sehingga hasil akhirnya (dikasih TOR + template) langsung jadi dengan kesalahan minim.
- **Gap Analisis (kondisi existing vs yang diminta):**
  1. `clone-template` (docx) — SUDAH preserve 100% formatting, tapi cuma isi placeholder token (`{{...}}`), bukan pemetaan per-sub-bab otomatis, dan cuma untuk 1 mode compiled response, belum ngerti bedanya SoW/MoM/Solution Brief.
  2. `export-from-template` (docx, mode struktur) — baca heading & font dari template, tapi pemetaan item ke section masih **keyword-matching category** (heuristic sederhana, lihat KNOWN ISSUES), belum "AI pintar" beneran, dan belum tau target `template_type` (sow/mom/dll).
  3. `export-pptx` — **BELUM ada konsep template sama sekali.** Selalu generate slide dari layout fixed hardcoded (warna, style tetap). User minta bisa upload/pilih template `.pptx` dan AI ikutin master slide/layout aslinya — ini gap paling besar.
  4. Template Library (Priority 2) — baru nyimpen & fetch `.docx`. Perlu extend juga tag/simpan `.pptx` sebagai template kalau mau dipakai utk Pitch Deck.
- **Status:** SEMUA sub-task (1-4) SELESAI. PRIORITY 4 kelar. Lihat detail tiap sub-task di bawah. Belum ada task aktif baru — tunggu instruksi user.

### ✅ Sub-task 1 SELESAI: LLM semantic section-mapping (ganti keyword-matching)
- `backend/app/services/llm_provider.py`: tambah `LLMProvider.map_items_to_sections(headings, items) -> dict[item_id, heading_index]` di ABC (default fallback `_fallback_map_items_to_sections`, keyword heuristic yang tadinya inline di `draft.py`, dipindah kesini + fix bug token pendek kayak `&` ikut ke-match). `ClaudeProvider` & `GeminiProvider` override dengan LLM call (prompt semantik, item yang gak relevan boleh di-skip biar jatuh ke fallback section).
- `backend/app/routers/draft.py` `export_from_template()`: hapus blok `items_by_category` keyword-matching, ganti panggil `get_llm_provider().map_items_to_sections(...)` sekali di awal, hasil mapping dipakai saat replay heading (`items_by_heading_index.get(idx, [])`).
- Verifikasi: `py_compile` OK, import OK, unit test fallback heuristic OK, integration test `export_from_template` dengan fake provider (monkeypatch) — item ke-mapping tampil persis di bawah heading yang benar, item ter-skip jatuh ke placeholder/fallback section, docx ke-generate valid.
- Belum jalan test pakai LLM asli (Claude/Gemini) — cuma ke-tes lewat fake provider supaya gak ada cost API call. Kalau mau validasi kualitas mapping asli, jalanin end-to-end lewat UI dengan API key aktif.

### ✅ Sub-task 2 SELESAI: template_type/document_type awareness (SoW/Solution Brief/MoM/Proposal wording)
- `backend/app/routers/draft.py`: dict `DOC_TYPE_LABELS` + helper `_get_doc_type_labels(template_type, company_name)` — per jenis dokumen nyimpen `cover_subtitle`, `requirement_label`, `response_label`, `fallback_heading` (mis. SoW pakai "Klausul Acuan" / "Rincian Lingkup Eksekusi", MoM pakai "Poin Diskusi / Pertanyaan Klien" / "Tanggapan & Klarifikasi", dll).
- `ExportFromTemplateRequest` dapat field baru `template_type: str = "proposal"`. `export_from_template()` pakai `labels` ini utk cover subtitle, heading fallback, dan diteruskan ke `_insert_item_block()` (signature nambah param `labels`) buat label requirement/response per item.
- `clone_template()` (endpoint `/draft/clone-template`) dapat form field baru `document_type: str = "proposal"`, dipakai di compiled_lines placeholder block ({{COMPILED_RESPONSES}}) biar wording ikut jenis dokumen juga.
- Frontend: `lib/api.ts` — `exportFromTemplate()` terima `template_type?`, `cloneTemplate()` terima `document_type?`. `ExportModal` tab Template ada dropdown baru "Jenis Dokumen" (Proposal Teknis/SoW/Solution Brief/MoM) di atas mode toggle Clone/Struktur, state `templateDocType`, diteruskan ke kedua mode export.
- Verifikasi: `npx tsc --noEmit` clean, backend `py_compile` + import OK, integration test `export_from_template` utk keempat `template_type` (cover subtitle & fallback heading berubah sesuai), integration test `clone_template` dengan `document_type="sow"` (compiled block pakai "Klausul Acuan"/"Rincian Lingkup Eksekusi").

### ✅ Sub-task 3 SELESAI: PPTX template-following (`clone-template-pptx`)
- **Endpoint baru** `POST /draft/clone-template-pptx` di `backend/app/routers/draft.py` (multipart: `template` .pptx, `items_json`, `document_title`, `company_name`). User upload deck `.pptx` sendiri; satu slide yang mengandung placeholder `{{ITEM_TITLE}}` / `{{ITEM_CATEGORY}}` / `{{ITEM_REQUIREMENT}}` / `{{ITEM_RESPONSE}}` / `{{ITEM_INDEX}}` dideteksi sebagai "slide-per-item" lalu digandakan sekali per klausul (posisi tetap di tempat asal slide itu), slide lain cuma disubstitusi placeholder global `{{DOCUMENT_TITLE}}` / `{{COMPANY_NAME}}` / `{{DATE}}` / `{{TOTAL_ITEMS}}`. Kalau template gak ada slide dengan marker `{{ITEM_*}}`, endpoint balikin error 400 yang jelas (bukan silent fallback ke layout hardcoded) — desain & warna asli deck user dipertahankan 100%.
- Helper baru: `_duplicate_pptx_slide` (deep-copy shape XML ke slide baru dari layout yang sama), `_move_pptx_slide` / `_delete_pptx_slide` (reorder & hapus slide via manipulasi `prs.slides._sldIdLst` XML langsung — python-pptx gak punya API resmi utk ini), `_pptx_replace_in_slide` / `_pptx_replace_in_text_frame` (substitusi placeholder run-level, sama pola dengan `clone_template` docx).
- **Known limitation (ponytail-marked di kode):** shape copy XML-only — kalau slide-per-item punya gambar/chart tertanam sendiri, gambar itu gak ikut ke-copy ke slide hasil duplikasi (perlu extend copy `slide.part.rels` kalau ini jadi kebutuhan nyata). Placeholder di dalam tabel/grouped shape belum ke-scan (cuma top-level shape dengan text_frame).
- Frontend: `lib/api.ts` punya `cloneTemplatePptx()`. `ExportModal` tab Template ada card baru "Clone Template PowerPoint (.pptx)" — mandiri, gak nyentuh state docx template yang lama (upload file .pptx langsung generate, gak lewat parsing struktur docx).
- Verifikasi: `npx tsc --noEmit` clean, backend `py_compile` + import OK, **end-to-end test dengan .pptx asli** dibuat via `python-pptx` (3 slide: cover+item+closing) → hasil 4 slide dengan urutan & isi benar (2 item slide ke-duplikasi & ke-isi sesuai data, cover/closing ke-substitusi global token). Test error path (template tanpa marker `{{ITEM_*}}`) juga confirmed raise HTTPException 400 yang jelas.
- Belum ditest manual lewat browser (cuma tsc + backend function test) — kalau mau validasi UI beneran, jalanin `npm run dev` + `uvicorn` lalu coba upload `.pptx` asli lewat modal.

### ✅ Sub-task 4 SELESAI: Template Library sekarang juga nyimpen `.pptx`
- `backend/app/services/drive_sync.py`: tambah konstanta `PPTX_MIME`, dan `fetch_and_extract_text()` sekarang bisa ekstrak teks dari `.pptx` (baca semua `shape.text_frame.text` per slide via `python-pptx`) — sebelumnya file `.pptx` di folder Drive selalu ke-skip pas sync (mimeType gak dikenali).
- `backend/app/routers/documents.py`: `doc_type = "template"` sekarang berlaku utk `.docx` MAUPUN `.pptx` (`f["mimeType"] in (DOCX_MIME, PPTX_MIME)`). Endpoint `/documents/{id}/download` milih `media_type` dari ekstensi `doc.title` (bukan field DB baru — sengaja gak nambah kolom/migration, ekstensi filename yang udah kesimpen di `title` cukup).
- Frontend: `templateLibrary` di-split jadi `docxTemplateLibrary` (dropdown tab Template mode docx) dan `pptxTemplateLibrary` (dropdown baru di card "Clone Template PowerPoint"), masing-masing filter by ekstensi filename. Pilih dari dropdown PPTX langsung `setPptxTemplateFile()` (gak lewat parsing struktur, karena PPTX clone gak butuh itu).
- Verifikasi: `npx tsc --noEmit` clean, backend `py_compile` + import OK, unit-check logic doc_type tagging & media_type selection.

**PRIORITY 4 KELAR SEPENUHNYA.** Semua 4 sub-task selesai: LLM semantic mapping, wording per jenis dokumen, PPTX template-following, dan template library yang nyimpen kedua format.

---

## 🐛 BUG FIX PENTING: `clone-template` & `clone-template-pptx` gagal via HTTP asli
- **Root cause:** `clone_template()` dan `clone_template_pptx()` di `backend/app/routers/draft.py` declare `items_json`, `document_title`, `company_name`, `document_type` sebagai `str = "..."` biasa (bukan `Form(...)`). FastAPI (versi terpasang: 0.141.1) TIDAK otomatis treat plain `str` sebagai form field pas endpoint juga punya `UploadFile` — field-field itu selalu dapet default kosong walau browser ngirim via `multipart/form-data` dengan benar. Semua test sebelumnya di sesi ini LOLOS karena dites dengan manggil fungsi Python langsung (bypass FastAPI request parsing) — baru ketauan pas user coba upload PPTX asli lewat browser dan dapet 400 "Tidak ada item...".
- **Fix:** kedua endpoint sekarang declare eksplisit `items_json: str = Form("")`, dst. (`from fastapi import Form` ditambah ke import module-level). Ini juga artinya **`clone_template` (docx) kemungkinan gak pernah kepake dengan benar dari UI sejak awal dibuat** (commit `e01f41b`) — baru sekarang beneran jalan.
- **Verifikasi:** dites end-to-end pakai `.pptx` asli via curl multipart request langsung (bukan cuma manggil fungsi Python) → 200 OK, isi slide benar. Juga dikonfirmasi via browser asli (Claude in Chrome): upload `.pptx` beneran → klik Generate → network request 200 OK, file ke-download.
- **Insiden sampingan:** restart backend buat pickup fix ini nabrak sync Google Drive (231 file) yang user gak sengaja pencet di tab lain. User minta dimatiin — udah di-stop (proses lama di-kill, sync gak lanjut). Kalau user butuh index dokumen lengkap lagi, tinggal klik Sync Google Drive lagi manual.
- **Pelajaran buat ke depan:** SELALU test endpoint multipart form (`UploadFile` + field lain) lewat HTTP request asli (curl/browser), bukan cuma manggil fungsi Python langsung — manggil fungsi langsung bypass seluruh request-parsing layer FastAPI dan bisa nyamarin bug kayak gini.

## ✅ PRIORITY 2 SELESAI (Folder Sync → Template Library)
- Backend: `POST /documents/sync` (`documents.py`) sekarang set `doc_type = "template"` otomatis untuk file `.docx` (via `DOCX_MIME` check), `doc_type = "document"` untuk selainnya. Update juga jalan di re-sync dokumen existing.
- Backend: `GET /documents/{id}/download` — re-download bytes .docx asli dari Drive by `source_drive_id` (fungsi baru `drive_sync.download_file_bytes()`), khusus dokumen `doc_type == "template"`.
- Frontend: `lib/api.ts` punya `downloadTemplateDocument(docId)`. `ExportModal` tab Template menampilkan dropdown "Pilih Template dari Library Drive" (hasil filter `listDocuments()` where `docType === "template"`), pilih → fetch blob → dibungkus jadi `File` → masuk ke alur `applyTemplateFile()` yang sama dengan upload manual (reuse, tidak ada endpoint duplikat untuk clone/structure mode).
- Verifikasi: `npx tsc --noEmit` clean, `app.routers.documents` import OK.

## ✅ PRIORITY 3 SELESAI (Multi-Format Proposal Types)
- Backend: `POST /draft/export-docx` mendukung `matrix`, `narrative`, `sow`, `solution_brief`, `mom`. `POST /draft/export-pptx` generate Pitch Deck (`python-pptx`).
- Frontend: `ExportModal` dropdown "Jenis Output" (6 opsi termasuk PPTX), `lib/api.ts` punya `exportProposalPptx`.
- Verifikasi: `npx tsc --noEmit` clean; kelima format docx + pptx berhasil di-generate via direct function call test (tidak lewat DB).

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
- **STATUS: SELESAI** (commit `6e1af4d`).

### ✅ Enhancement Poin 1: LLM Provider Reliability
- `backend/app/services/llm_provider.py`: validasi provider/API key, `LLMProviderError`, dan formatter error aman untuk billing, quota, auth, timeout, serta provider yang belum tersedia.
- `backend/app/routers/query.py` dan `backend/app/routers/draft.py`: fallback jawaban/source/manual saat provider gagal.
- `backend/app/routers/research.py`: kegagalan provider dikembalikan sebagai HTTP 503 dengan pesan aman.
- Verifikasi: `backend/venv` compile check, provider error formatter, invalid provider check, dan diagnostics editor bersih.

### ✅ Enhancement Poin 2: Professional PDF Export
- `backend/app/routers/draft.py`: endpoint `POST /draft/export-pdf` dengan layout matriks dan naratif, header/footer, metadata, zebra table, serta nomor halaman.
- `backend/requirements.txt`: tambah `reportlab` sebagai generator PDF native tanpa ketergantungan Word atau LibreOffice.
- `frontend/lib/api.ts` dan `frontend/components/draft/export-modal.tsx`: opsi Proposal PDF tersedia di modal export, termasuk tombol Preview PDF yang membuka hasil render di tab browser sebelum download.
- Verifikasi: dependency terpasang di `backend/venv`, backend compile bersih, response endpoint terdeteksi `application/pdf` streaming, dan `npx tsc --noEmit` exit 0.

### ✅ Enhancement Step 2A: PDF Preview
- Preview memakai endpoint export yang sama sehingga file yang dilihat identik dengan file yang diunduh.
- Popup blocker ditangani dengan pesan yang jelas; object URL dibersihkan setelah satu menit.
- Verifikasi: `npx tsc --noEmit` exit 0 dan diagnostics `export-modal.tsx` bersih.

### ✅ Enhancement Step 2B: Corporate Branding
- `frontend/app/settings/page.tsx`: profil branding lokal untuk nama perusahaan, warna utama, warna aksen, dan teks footer.
- `frontend/components/draft/export-modal.tsx`: profil branding otomatis dipakai saat download dan preview PDF.
- `backend/app/routers/draft.py`: `POST /draft/export-pdf` menerima warna/footer custom dengan fallback aman jika hex color invalid.
- Reset data lokal ikut menghapus profil branding.
- Verifikasi: `npx tsc --noEmit` exit 0, backend compile/import bersih, dan sample PDF dengan branding custom menghasilkan response `application/pdf`.

### ✅ Enhancement: Compact Responsive UX & Faster Drafting
- `frontend/components/draft/progress-header.tsx`: aksi utama diringkas menjadi `Generate All` dan `Export`; quality check, simpan project, dan ganti dokumen dipindahkan ke menu `More`.
- `frontend/components/sidebar.tsx`, `frontend/components/topbar.tsx`, dan `frontend/app/layout.tsx`: desktop tetap sidebar, mobile memakai bottom navigation, topbar lebih ringkas dan tidak overflow.
- `frontend/app/draft/page.tsx`: `Generate All` memproses batch maksimal 3 item paralel agar respons lebih cepat tanpa membanjiri provider.
- Verifikasi: `npx tsc --noEmit` exit 0, diagnostics semua file UI bersih, dan `git diff --check` bersih.

### ✅ Enhancement: Export Wizard
- `frontend/components/draft/export-modal.tsx`: navigasi export diringkas menjadi tiga langkah: `Format`, `Template`, dan `Preview`.
- Modal selalu kembali ke langkah Format saat dibuka agar workflow konsisten.
- Panel lama tetap dipakai di balik wizard, sehingga export Word/PDF/PPTX, template, dan Markdown tidak berubah kontraknya.
- Verifikasi: `npx tsc --noEmit` exit 0, diagnostics bersih, dan `git diff --check` bersih.

### ✅ Enhancement: Unified Library
- `frontend/app/library/page.tsx`: halaman Library ringkas dengan tab `Documents`, `Templates`, dan `Projects`.
- Data dokumen, template, summary, dan proposal sessions dimuat paralel agar respons awal cepat.
- `frontend/lib/api.ts`: tambah `listProposalSessions()`.
- `frontend/components/sidebar.tsx`: navigasi desktop/mobile diarahkan ke Library, sementara halaman Documents lama tetap tersedia sebagai fallback.
- Project yang dipilih menyimpan session id lalu membuka Draft dengan restore session yang sudah ada.
- Verifikasi: `npx tsc --noEmit` exit 0, diagnostics page/API/sidebar bersih, dan `git diff --check` bersih.

### ✅ Enhancement Poin 3: Draft Quality Check
- `backend/app/routers/draft.py`: endpoint `POST /draft/quality-check` mendeteksi jawaban kosong, jawaban terlalu singkat, placeholder, serta angka/target klausul yang belum terlihat di draft.
- `frontend/lib/api.ts`, `frontend/app/draft/page.tsx`, dan `frontend/components/draft/progress-header.tsx`: tombol Cek Kualitas, skor keseluruhan, daftar isu teratas, dan navigasi langsung ke klausul bermasalah.
- Verifikasi: scoring test menghasilkan status warning/fail sesuai input, backend compile bersih, `npx tsc --noEmit` exit 0, dan diagnostics editor bersih.

### ✅ Enhancement Poin 4: Persistent Proposal Sessions
- `backend/app/models.py` dan migration `d3b4c5d6e7f8`: tambah tabel `proposal_sessions` untuk menyimpan title, TOR, item draft, status, dan timestamp per workspace.
- `backend/app/routers/sessions.py`: CRUD session (`GET/POST /sessions`, `GET/PUT/DELETE /sessions/{session_id}`).
- `frontend/lib/api.ts` dan `frontend/app/draft/page.tsx`: tombol Simpan Project, create/update session, restore session terakhir, tetap mempertahankan localStorage sebagai fallback cepat.
- `frontend/components/draft/progress-header.tsx`: indikator simpan session.
- Verifikasi: backend/app dan migration compile bersih, migration head `d3b4c5d6e7f8`, route methods terdaftar di router session, `npx tsc --noEmit` exit 0, dan diagnostics editor bersih.

### ✅ Enhancement Poin 5: Batch Review Workflow
- `frontend/app/draft/page.tsx`: filter klausul `Review` dari quality check, pilih per item, pilih semua yang tampil, serta bulk action `Jadikan Draf` dan `Finalkan`.
- Batch action hanya mengubah status item yang dipilih; tidak mengubah isi jawaban secara diam-diam.
- Verifikasi: `npx tsc --noEmit` exit 0, diagnostics editor bersih, dan `git diff --check` bersih.

**STATUS ENHANCEMENT 1-5: SELESAI.** Semua milestone sudah di-commit dan dipush berurutan ke `main`.

### 🟡 PRIORITY 2: Folder Sync → Template Library (Google Drive Integration)
**File:** `backend/app/routers/documents.py` & `frontend/components/draft/export-modal.tsx`
- Saat sync Google Drive, deteksi dokumen template (.docx) dan beri tag `doc_type = "template"`.
- Di `ExportModal` tab template: sediakan opsi dropdown "Pilih Template dari Library Drive" tanpa user harus upload file manual setiap kali.
- **STATUS: SELESAI** (commit `814bd73`).

### 🟡 PRIORITY 3: Multi-Format Proposal Types (SoW, Solution Brief, MoM, PPT Deck)
**File:** `backend/app/routers/draft.py` & `frontend/components/draft/export-modal.tsx`
- Buat generator SoW, Solution Brief, dan MoM (Minutes of Meeting).
- Siapkan generator presentasi PPT / Pitch Deck (menggunakan library `python-pptx`).
- **STATUS: SELESAI** (commit `9f4ae1b`).

### 🟢 PRIORITY 4: Full-Fidelity Template-Following Generator (SEMUA jenis dokumen)
**File:** `backend/app/routers/draft.py`, `backend/app/services/llm_provider.py`, `frontend/components/draft/export-modal.tsx`
- User kasih TOR + template (upload manual ATAU pilih dari Template Library Priority 2) → AI generate Proposal Teknis / SoW / Solution Brief / MoM / PPT Pitch Deck yang ikutin template **sampai ke sub-bab, font name, font size, semua detail teknis Word/PPT**, isi otomatis pakai AI dengan minim kesalahan.
- Sub-task:
  1. Ganti heuristic keyword-matching di `export-from-template` dengan pemetaan section berbasis LLM (kirim daftar heading template + daftar item TOR ke LLM, minta hasil mapping semantik, bukan cocok kata kunci doang).
  2. `ExportFromTemplateRequest` / `clone-template` perlu tau `template_type` target (proposal/sow/solution_brief/mom) supaya AI tau gaya bahasa & struktur yang diharapkan per section.
  3. PPTX template-following (gap terbesar, belum ada sama sekali): terima upload/pilih `.pptx` template dari library, baca slide master/layout & placeholder asli (pakai `python-pptx` baca `slide.slide_layout`, `placeholders`), lalu AI isi teks per placeholder sesuai konten TOR — bukan generate slide baru dari layout fixed hardcoded seperti sekarang.
  4. Extend Template Library (Priority 2) supaya sync Drive juga tag `.pptx` sebagai `doc_type = "template"` (sekarang cuma docx yang di-tag, lihat `documents.py` `DOCX_MIME` check).
- **STATUS: BELUM MULAI** — masih scoping, tunggu keputusan user mulai dari sub-task mana.

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
