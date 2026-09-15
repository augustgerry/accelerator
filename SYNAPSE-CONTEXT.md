# SYNAPSE CONTEXT — Auto-Handoff File
> ⚠️ File ini di-update otomatis setiap ~15 detik. Jika AI agent sebelumnya habis quota, baca file ini dari atas untuk melanjutkan pekerjaan.

---

## 📍 STATUS AKTIF (SEDANG DIKERJAKAN DETIK INI)
- **Sesi terakhir (Antigravity):** Fitur Sub-Bab Adaptif dari Dokumen Acuan (TOR/RKS/KAK) dengan Layar Kurasi & Diskusi AI, Presales Quality & Compliance Auditor, Real-time Drafting Progress Bar, dan PPTX Table Clone TELAH SELESAI diimplementasikan, diverifikasi, dan lolos uji end-to-end.
- **Ringkasan Fitur yang Baru Selesai:**
  1. **Sub-Bab Adaptif Berdasarkan Dokumen Acuan:** Synapse membaca dokumen acuan (TOR, RKS, KAK, RFP) dan merekomendasikan urutan sub-bab kontekstual lengkap dengan alasan rekomendasi (*rationale*) per butir melalui endpoint `POST /draft/recommend-structure`.
  2. **Layar Kurasi & Diskusi Struktur Sebelum Drafting:** Sebelum draf isi dibuat, user masuk ke tampilan kurasi untuk melihat ringkasan AI, membaca alasan pemilihan sub-bab, mengatur urutan (▲ / ▼), mengedit cakupan/judul, menambah sub-bab manual, atau berdiskusi dengan AI (*"Revisi Struktur dengan AI"*) hingga susunan disetujui (*fixed*).
  3. **Presales Quality & Compliance Auditor:** Endpoint `POST /draft/quality-check` diperluas dengan skor kepatuhan (0-100), deteksi komitmen ambigu/tentatif, audit SLA eksplisit, pemenuhan metrik angka, serta rekomendasi presales per sub-bab (`suggestions`) yang ditampilkan dalam Auditor Modal interaktif.
  4. **Progress Bar Real-Time & Reordering di Workspace:** Banner progres dinamis saat drafting berjalan bertahap, dan tombol panah mini (▲ / ▼) pada navigator kiri untuk fleksibilitas susunan proposal.
  5. **PPTX Template Clone Table Support:** Mesin kloning PPTX kini memindai dan menggantikan token di dalam shape tabel (`shape.has_table`).
- **Status Service:** Backend aktif di port 8000 (`http://127.0.0.1:8000/health` 200 OK, LLM: `gemini-3.6-flash`), Frontend aktif di port 3000. TypeScript compilation `npx tsc --noEmit` exit code 0.

---

## ⚠️ LLM PROVIDER — CEK INI DULU SEBELUM KERJA
`backend/.env` sekarang `LLM_PROVIDER=gemini` (bukan `claude`). **Anthropic API key kehabisan credit balance**. `GOOGLE_API_KEY` telah diperbarui dengan API key baru dari user (`AQ.Ab8RN6KsVrv...`), model aktif `gemini-3.6-flash`. Catatan: model Pro (`gemini-3.1-pro`) memerlukan project billing aktif, sementara `gemini-3.6-flash` dan `gemini-3.8-flash` aktif dengan kuota testing. Kalau Anthropic sudah di-top-up, tinggal kembalikan `LLM_PROVIDER=claude` di `.env`.

Catatan startup Windows: jalanin backend pake `./venv/Scripts/python.exe -m uvicorn main:app --port 8000` (JANGAN pakai `venv/Scripts/uvicorn.exe` langsung — exe shim-nya kadang exit silent tanpa error di setup ini). `--reload` juga pernah kejadian gak beneran restart worker process-nya (kode lama masih kepake walau file udah diedit) — kalau curiga kode gak ke-pickup, matiin proses manual (`Stop-Process`) terus start ulang fresh tanpa `--reload` buat mastiin.

---

## 🔧 SESI CLAUDE CODE — REDESIGN ALUR DRAFT & EXPORT (setelah sesi Antigravity di atas)

User minta lanjutin kerjaan Copilot yang kepotong, lalu iteratif redesign besar alur Draft + Export berdasar feedback langsung. Urutan kerjaan:

**1. Beresin kerjaan Copilot yang kepotong (template picker Drive):**
- `backend/app/routers/documents.py` `download_document()`: dulu nolak download dokumen yang `doc_type != "template"`. Sekarang cuma cek `source_drive_id` ada — semua dokumen Drive (bukan cuma yang ditag template) bisa dipakai sebagai contoh gaya/style di Export Modal.
- `frontend/lib/api.ts`: `downloadTemplateDocument` di-rename konsepnya jadi `downloadDriveDocument` (alias lama tetap ada, gak break existing call site).
- `export-modal.tsx` tab Template: filter `docType === "template"` dihapus, sekarang filter by ekstensi file (`.docx`/`.pptx`) aja — list dropdown nampilin semua dokumen Drive.

**2. Setup Gemini sebagai fallback LLM provider** — lihat bagian ⚠️ LLM PROVIDER di atas.

**3. Redesign total alur Draft (paling besar, atas persetujuan eksplisit user "Ganti Total"):**
- **Sebelum:** upload TOR → LLM segmentasi jadi klausul atomik (compliance-matrix style) → tiap klausul dijawab satu-satu. User bingung apa gunanya draft/final, dan hasil pecahnya kerasa gak jelas tujuannya.
- **Sesudah:** setiap jenis dokumen output (Proposal Teknis, SoW, dst) punya **skeleton statis** — daftar sub-bab baku (`frontend/lib/skeletons.ts`, contoh Proposal Teknis: Executive Summary, Pemahaman Kebutuhan, Solusi Teknis, Metodologi, **Maintenance Plan (PM & CM)**, Tim, Jadwal, Keunggulan, Penutup — 9 sub-bab). Upload TOR → sub-bab langsung muncul instan (gak ada LLM call buat struktur lagi) → tiap sub-bab generate draf dari TOR + knowledge base + Sumber Referensi.
- Data model item (`id/title/requirement_text/category/draft_text/status`) ternyata generic, gak perlu diubah — cuma sumber `items` yang diganti dari hasil LLM segmentasi jadi skeleton statis. `/draft/segment` endpoint lama masih ada di backend tapi udah gak dipanggil dari frontend (harmless, dead code kalau mau dibersihin nanti).
- Konteks TOR yang dikirim ke LLM per sub-bab sekarang pake `pickRelevantTorExcerpt()` (page.tsx) — nyortir paragraf TOR berdasar kecocokan kata kunci judul sub-bab, bukan potong 1500 karakter pertama doang. **ponytail flag:** ini keyword-matching biasa (stdlib doang), bukan embedding search — upgrade ke local embedding search kalau grounding kerasa lemah di TOR yang panjang/padat. Backend `tor_context` slice juga dinaikin dari 2000 → 6000 karakter.
- Wording "klausul" diganti "bagian" di ~20 tempat, termasuk yang paling penting: **teks di dalam dokumen hasil export** (docx/pdf/pptx builder di `backend/app/routers/draft.py` — "Klausul Acuan" → "Cakupan Bagian", dst), bukan cuma UI.
- "Sumber Referensi" (multi-select dokumen Drive, gaya NotebookLM) ditambah di layar upload — dipakai buat SCOPE retrieval knowledge base per generate (`backend/app/services/retrieval.py` `_hybrid_ranked_chunks` dapet param `doc_ids` baru, filter `DocumentChunk.document_id.in_(doc_ids)`). Kalau user pilih referensi, retrieval CUMA cari di dokumen itu; kalau kosong, cari di seluruh KB kayak biasa.

**4. Redesign Export Modal:**
- `frontend/lib/document-types.ts` (baru): satu sumber kebenaran mapping **Jenis Dokumen → format yang diizinkan** (6 tipe: Proposal Teknis/SoW/Solution Brief/Minutes of Meetings/Klarifikasi Teknis/Pitch Deck × pdf/docx/pptx sesuai kombinasi masing-masing), dipakai bareng di `page.tsx` (upload screen) DAN `export-modal.tsx` (Standard tab + Template tab) biar konsisten.
- **Bug nyata yang kefix:** endpoint `/draft/export-pdf` dulu HARDCODE `template_type: "narrative"` apa pun jenis dokumen yang dipilih (jadi PDF Solution Brief/SoW ikut gaya Proposal Teknis). Sekarang ngirim jenis dokumen asli.
- Font dropdown diperluas dari 3 opsi → 26 font (Google Sans + 25 font standar Microsoft Word).
- Field **Logo Customer** ditambah di step Format (khusus format PDF) — digambar di kanan-atas cover PDF, sejajar/mirror sama company logo (kiri-atas). Backend `ExportPdfRequest.customer_logo_data_url` baru, helper `_decode_logo_bytes()` dipakai bareng buat 2 logo.
- Alur generate direstruktur: **Preview Dokumen → centang "saya setuju" → baru tombol Generate Document aktif**. Preview docx/pptx dikonversi ke PDF dulu (`convertOfficeToPdf`, udah ada sebelumnya) biar preview-nya nunjukkin font/bold/italic asli, bukan teks mentah. Ganti opsi apa pun (jenis dokumen/format/font/logo) otomatis reset gate ini, paksa preview ulang.
- Step wizard di-rename: "Template" → "Ikuti Gaya File Lain", "Preview" → "Salin Teks" (karena isinya emang cuma salin markdown mentah, bukan preview beneran).
- **Integrasi Sumber Referensi → Template (SELESAI):** Dokumen `.docx` / `.pptx` yang dipilih user sebagai Sumber Referensi di layar upload otomatis muncul sebagai kartu quick-access di Step 2 Export Modal ("Ikuti Gaya File Lain") dengan tombol 1-klik "Gunakan Sebagai Template".
- **Logo Perusahaan & Logo Customer di DOCX (SELESAI):** `export_proposal_docx` kini menyisipkan header table 2 kolom di paling atas dokumen (kiri: logo perusahaan, kanan: logo customer). Di UI Export Modal, input Logo Customer dibuka untuk format PDF maupun DOCX.
- **Fleksibilitas Sub-Bab di UI (SELESAI):** User dapat menambah sub-bab/bagian baru via tombol `+ Tambah Bagian`, mengedit judul/kategori/tujuan bagian via tombol `Edit Info`, dan menghapus bagian via tombol `Hapus`.
- **Poin 4: Grounding Semantik Cuplikan TOR (SELESAI):** Menggantikan pemotongan kata kunci biasa di frontend, fungsi `semantic_select_tor_excerpt()` di `backend/app/services/embeddings.py` menggunakan model lokal `sentence-transformers` (`paraphrase-multilingual-mpnet-base-v2`) untuk meng-encode dan merangking paragraf TOR berdasarkan kesesuaian semantik dengan kebutuhan sub-bab, lalu menyusun cuplikan relevan terbaik secara terurut (preserves document order) hingga 3.500 karakter.
- **Poin 5: Layout Khusus Pitch Deck untuk DOCX & PDF (SELESAI):** Format "Pitch Deck For Customer / Internal" kini memiliki layout khusus tersendiri saat diekspor ke Word (.docx) dan PDF:
  - **DOCX**: Executive Pitch Deck Briefing Paper yang memuat Ringkasan Eksekutif & Value Proposition, tabel ringkasan struktur slide (Slide #, Topik & Pain Point, Solusi SMG, Kategori/Fokus), Talking Points per slide, serta Rekomendasi Next Steps & Call-to-Action.
  - **PDF**: Layout slide briefing berformat kartu dan tabel berulang dengan tajuk warna primer/aksen, talking points per slide, dan metadata dokumen yang disesuaikan.
- **Backend & Model Status:** `LLM_PROVIDER=gemini` dengan model aktif `gemini-3.6-flash`. Server Uvicorn aktif dan telah dites end-to-end via HTTP.

Semua perubahan di atas: `npx tsc --noEmit` clean, backend `py_compile` clean, unit test & integration test HTTP valid.

---

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

## 🔍 SESI CLAUDE CODE — SEARCH MODE & CITATION UX (branch `feat/search-citation-drawer`)

Kerja terisolasi di `frontend/app/search/`, `frontend/components/search/`, `frontend/app/documents/` — TIDAK menyentuh `frontend/app/draft/` atau `backend/app/routers/draft.py` (area Antigravity), jadi backend tetap 0 perubahan.

1. **Interactive Citation Drawer:** `frontend/components/search/citation-drawer.tsx` (baru) — slide-over panel dari kanan (Tailwind transition, tanpa dependency baru). Diklik dari chip sitasi `[1]` di kartu kutipan (list kiri) maupun grid "Dokumen Referensi" (kanan). Menampilkan judul dokumen lengkap, badge ekstensi file (`.pdf/.docx/.pptx` — diparse dari `title` via `getFileExtension()` baru di `lib/utils.ts`, TANPA perlu field/migrasi backend baru), badge tipe dokumen, divisi, cuplikan chunk teks lengkap + tombol salin, serta tombol **Download Dokumen** (reuse `downloadDriveDocument()` yang sudah ada) dan **Buka di Drive** (`https://drive.google.com/file/d/{doc.id}/view` — valid karena `Document.id` di backend memang di-set sama dengan Drive file id saat sync, lihat `documents.py` `sync_from_drive()`).
   - `frontend/app/search/page.tsx`: inline "Selected chunk detail" box lama dihapus (redundant, digantikan drawer). Klik kartu kutipan sekarang selalu membuka drawer (bukan toggle expand/collapse).
2. **Search History & Bookmarking** (`frontend/app/search/page.tsx`):
   - Riwayat pencarian (`localStorage` key `synapse-search-history`, sudah ada sebelumnya tapi belum pernah ditampilkan) sekarang dirender sebagai chip yang bisa diklik ulang di bawah search bar.
   - Bookmark baru (`localStorage` key `synapse-search-bookmarks`, maks 20 entri) — tombol **Bookmark** di kartu jawaban AI, tersimpan tampil sebagai chip terpisah (bisa diklik ulang juga).
   - Tombol **Salin Jawaban** (clipboard) ditambah di kartu jawaban AI.
3. **Filter Lanjutan `/documents`** (`frontend/app/documents/page.tsx`): dropdown filter Ekstensi File (`.docx/.pdf/.pptx`, dll — di-derive dari `title` via `getFileExtension()`, bukan field DB baru) ditambahkan di samping filter Divisi yang sudah ada. Pencarian cepat lokal di tabel dokumen sudah ada sebelumnya (tidak diubah).
- Verifikasi: `npx tsc --noEmit` di `frontend/` exit 0. Belum ditest manual lewat browser (`npm run dev`) — kalau mau validasi UI, jalankan dev server lalu coba klik chip sitasi di `/search` dan filter ekstensi di `/documents`.
- Tidak ada perubahan backend/database sama sekali di sesi ini — seluruh fitur reuse endpoint & field yang sudah ada (`/documents/{id}/download`, `Document.id == source_drive_id`, `title` yang sudah menyimpan ekstensi asli).

### Lanjutan (batch 2) — masih di branch `feat/search-citation-drawer`
Enhancement lanjutan atas ide sendiri (disetujui user "gas aja semua"). Kali ini ADA sentuhan backend, tapi tetap sama sekali tidak menyentuh `backend/app/routers/draft.py` maupun `frontend/app/draft/`:
- **Inline citation markers di jawaban AI:** `backend/app/services/llm_provider.py` — `_build_system_prompt(mode="qa")` sekarang instruksikan LLM sisipkan penanda `[1]`, `[2]` dst tepat di kalimat yang memakai potongan konteks tsb. Helper baru `_format_context_chunks()` menomori tiap chunk sebelum dikirim ke LLM (`[1] ...`, `[2] ...`) — HANYA untuk `mode="qa"` (dipanggil dari `query.py`); `mode="draft"` (dipakai `draft.py`) tetap format lama, tidak terpengaruh sama sekali. Frontend baru `components/search/answer-with-citations.tsx` mem-parse `[n]` di teks jawaban jadi chip yang bisa diklik → buka `CitationDrawer` ke sumber ke-n.
- **Recency indicator di drawer:** `backend/app/services/retrieval.py` `retrieve_chunks_with_full_metadata()` dan `backend/app/routers/query.py` `ChunkResult` nambah field `updated_at` (dari `Document.updated_at`). `CitationDrawer` nampilin tanggal ini sebagai badge kecil.
- **Keyboard nav di drawer:** Esc buat tutup, panah kiri/kanan buat pindah antar sitasi tanpa balik ke list kiri — plus tombol chevron prev/next di header drawer.
- **Highlight keyword di snippet drawer:** snippet lengkap di drawer sekarang pakai `HighlightedText` yang sama (diekstrak ke `components/search/highlighted-text.tsx`, dipakai bareng oleh `search/page.tsx` dan `citation-drawer.tsx` — no duplication).
- **Empty-grounding warning:** kalau `sources.length === 0` tapi tetap ada jawaban AI, tampil banner kuning kecil "jawaban ini bersifat umum, bukan hasil grounding dokumen internal" — mencegah user salah percaya jawaban itu grounded.
- **Hapus item individual dari history/bookmark:** tombol X kecil per-chip (muncul on-hover) di `search/page.tsx`, tidak perlu reset semua lewat Settings lagi.
- **Bulk delete dokumen di `/documents`:** endpoint baru `DELETE /documents/{doc_id}` (`backend/app/routers/documents.py`) — hapus dokumen + chunks dari index (TIDAK menghapus file aslinya di Google Drive). Frontend: checkbox per-baris + "Pilih Semua" + tombol "Hapus dari Index" dengan `confirm()` guard, plus `deleteDocument()` baru di `lib/api.ts`.
- **Debounce local search `/documents`:** input pencarian di-debounce 250ms (`debouncedQuery` state) sebelum masuk filter `useMemo`, biar gak re-filter tiap keystroke kalau daftar dokumen sudah besar.
- Verifikasi: `npx tsc --noEmit` (frontend) exit 0, `python -m py_compile` (backend, file yang diubah: `documents.py`, `query.py`, `retrieval.py`, `llm_provider.py`) OK. Belum ditest manual end-to-end lewat browser dengan LLM asli (citation marker `[n]` tergantung LLM benar-benar patuh instruksi — kalau kualitasnya kurang, snippet drawer + grid referensi tetap jadi fallback cara buka sitasi tanpa marker).

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
- Commit Terakhir: lihat `git log -1` — commit paling atas judulnya soal redesign alur Draft/Export (sesi Claude Code, lanjutan dari sesi Antigravity di atas).
- Status: **Up to date dengan origin/main (GitHub). Working tree CLEAN** (di-push langsung setelah commit, bukan lewat auto-commit script — `auto-commit.ps1` gak jalan otomatis, harus dijalanin manual kalau mau dipakai lagi).
- Semua file kode di backend dan frontend sudah ter-push ke GitHub repo https://github.com/augustgerry/accelerator.
- `LLM_PROVIDER=gemini` di `.env` (Anthropic credit habis) — lihat bagian ⚠️ LLM PROVIDER di atas sebelum lanjut kerja.

> 💡 **PETUNJUK UNTUK AGENT BERIKUTNYA (Antigravity atau lainnya):**
> 1. Kode sudah 100% tersinkronisasi di GitHub dan lokal.
> 2. Backend: `cd backend && ./venv/Scripts/python.exe -m uvicorn main:app --port 8000` (lihat catatan startup Windows di bagian ⚠️ LLM PROVIDER — hindari `--reload` kalau ragu, dan jangan panggil `uvicorn.exe` langsung).
> 3. Frontend berjalan di port 3000 (`npm run dev` di folder `frontend/`).
> 4. Baca bagian "🔧 SESI CLAUDE CODE — REDESIGN ALUR DRAFT & EXPORT" di atas buat konteks lengkap kerjaan terakhir sebelum lanjutin apa pun.

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

### ✅ Next Batch Poin 1: Backend Autosave Proposal Session
- `frontend/app/draft/page.tsx`: autosave session ke backend setelah 1,2 detik tanpa perubahan, memakai debounce dan payload yang sama dengan save manual.
- Session id baru disimpan ke localStorage setelah create pertama; perubahan berikutnya memakai update session yang sama.
- UI menampilkan `Auto-saved` atau `Belum tersimpan ke server` tanpa mengganggu editor.
- Verifikasi: `npx tsc --noEmit` exit 0, diagnostics bersih, dan `git diff --check` bersih.

### ✅ Next Batch Poin 2: Company Logo Branding
- `frontend/app/settings/page.tsx`: upload logo PNG/JPG/WebP maksimal 1,5 MB, preview, dan hapus logo.
- `frontend/components/draft/export-modal.tsx` dan `frontend/lib/api.ts`: logo branding ikut dikirim ke PDF download dan Preview PDF.
- `backend/app/routers/draft.py`: validasi data URL dan image bytes dengan Pillow sebelum render logo pada halaman pertama PDF; logo rusak diabaikan dengan aman.
- Verifikasi: `npx tsc --noEmit` exit 0, frontend diagnostics bersih, backend compile bersih, dan sample invalid/valid logo sama-sama menghasilkan response PDF aman.

### ✅ Next Batch Poin 3: Dashboard Cleanup
- `frontend/app/page.tsx`: dashboard diringkas menjadi search utama, `New Proposal`, `Open Library`, status knowledge base, dan `Recent Projects`.
- Copy panjang serta dua kartu fitur besar dihapus agar entry point lebih cepat dipahami.
- Recent project memakai session backend dan membuka Draft melalui mekanisme restore yang sudah ada.
- Verifikasi: `npx tsc --noEmit` exit 0, diagnostics dashboard bersih, dan `git diff --check` bersih.

### ✅ Next Batch Poin 4: Hybrid Search Retrieval
- `backend/app/services/retrieval.py`: vector candidate diperlebar lalu digabung dengan exact keyword candidates.
- Ranking memberi bobot vector similarity dan lexical overlap; angka/target klausul mendapat bonus jika muncul di chunk.
- Kandidat dibatasi agar tetap cepat dan tidak menyapu seluruh database.
- Verifikasi: backend compile bersih, token teknis `HCI-3`, `24x7`, `SKU` terdeteksi benar, diagnostics bersih, dan `git diff --check` bersih.

### ✅ Next Batch Poin 5: Incremental Google Drive Sync
- `backend/app/models.py` dan migration `e4f5a6b7c8d9`: tambah `documents.source_modified_at` untuk menyimpan `modifiedTime` dari Drive.
- `backend/app/routers/documents.py`: file yang timestamp, nama, divisi, dan tipe-nya tidak berubah dilewati tanpa download, extract, chunk, atau embedding ulang.
- Response sync sekarang membedakan `synced`, `unchanged`, dan `skipped`; Settings menampilkan ketiganya.
- Verifikasi: migration head `e4f5a6b7c8d9`, backend compile bersih, `npx tsc --noEmit` exit 0, dan diagnostics semua file bersih.

**STATUS BATCH POIN 1-5: SELESAI.** Autosave session, logo branding, dashboard cleanup, hybrid search, dan incremental Drive sync sudah diimplementasikan serta dipush berurutan.

### ✅ Next Batch Poin 6: Search Filters
- `backend/app/routers/query.py` dan `backend/app/services/retrieval.py`: query menerima filter `doc_type` dan `division` sebelum hybrid ranking.
- `frontend/app/search/page.tsx`: filter ringkas Semua Jenis Dokumen/Template/Dokumen dan Divisi, refresh otomatis saat berubah.
- `frontend/lib/api.ts`: `searchKnowledgeBase()` menerima filter opsional.
- Verifikasi: query model, backend compile, `npx tsc --noEmit`, dan diagnostics semua file bersih.

### ✅ Next Batch Poin 7: Evidence & Confidence
- `backend/app/services/retrieval.py`: ranked candidate menyimpan score dan token yang match.
- `backend/app/routers/query.py` dan `frontend/lib/api.ts`: citation contract menambahkan `confidence` dan `matched_terms`.
- `frontend/app/search/page.tsx`: setiap citation card menampilkan relevansi dan evidence terms sebelum user membuka snippet lengkap.
- Verifikasi: response model, backend compile, `npx tsc --noEmit`, dan diagnostics semua file bersih.

### ✅ Next Batch Poin 8: Export Visual Preflight
- `backend/app/routers/draft.py`: endpoint `POST /draft/export-preflight` menghitung estimasi halaman dan mendeteksi draft kosong, placeholder, judul panjang, jawaban berisiko overflow, serta dokumen terlalu besar.
- `frontend/lib/api.ts` dan `frontend/components/draft/export-modal.tsx`: preflight otomatis tampil di Export Wizard sebagai blocking issue atau warning ringkas.
- Verifikasi: sample draft kosong terdeteksi sebagai blocking issue, backend compile bersih, `npx tsc --noEmit` exit 0, dan diagnostics bersih.

### ✅ Next Batch Poin 9-10: Live Smoke Verification
- `npm run build`: berhasil, lint/type validation dan static generation semua route berhasil; `/library` ikut ter-build.
- `backend/venv`: `alembic upgrade head` berhasil menjalankan migration proposal sessions dan Drive modified time sampai `e4f5a6b7c8d9`.
- Backend import smoke test berhasil dan memuat 10 route.
- Tidak ada API LLM berbayar yang dipanggil saat verifikasi.

**STATUS ROADMAP 6-10: SELESAI.** Search filters, evidence/confidence, export visual preflight, dan live smoke verification sudah selesai.


### ✅ Full-Fidelity Template PDF Renderer
- `backend/app/services/office_render.py`: DOCX/PPTX dirender melalui Microsoft Word/PowerPoint native dalam child PowerShell process, lalu dikembalikan sebagai PDF.
- `backend/app/routers/draft.py`: endpoint `POST /draft/convert-office-pdf` menerima hasil DOCX/PPTX dan mengembalikan PDF dengan layout Office asli.
- `frontend/lib/api.ts` dan `frontend/components/draft/export-modal.tsx`: standard PDF, `PDF Full Fidelity` untuk template Word, dan `PDF Fidelity` untuk cloned PPTX.
- Standard PDF tetap memakai renderer branded agar logo/warna Corporate Branding tidak hilang; mode Full Fidelity dipakai khusus saat template Office dipilih.
- Child process dipakai agar reference COM tidak meninggalkan file template terkunci.
- Verifikasi: Word smoke test menghasilkan PDF valid, `npm run build` exit 0, backend compile bersih, dan diagnostics bersih.
- Requirement runtime: Windows dengan Microsoft Word/PowerPoint terpasang. Fallback PDF ReportLab tetap tersedia untuk environment tanpa Office.

**STATUS ROADMAP: SELESAI.** PDF branded, preview, preflight, dan full-fidelity template PDF sudah tersedia.

### ✅ Product Workflow Redesign: Conversational Search + Document Generator
- `backend/app/routers/query.py` dan `frontend/app/search/page.tsx`: Search sekarang mendukung follow-up conversation dengan konteks beberapa pesan terakhir, tetap grounded ke citation baru setiap turn.
- `frontend/app/draft/page.tsx`: user memilih target output sebelum upload (`Proposal Teknis`, `SoW`, `Solution Brief`, `Klarifikasi Teknis/MoM`, Matriks, PPTX, atau PDF). Segmentasi TOR tetap berjalan internal dan tidak lagi menjadi konsep yang harus dipahami user.
- Setelah TOR selesai dianalisis, Synapse otomatis generate jawaban per klausul dalam batch maksimal 3 request; user masuk ke workspace untuk review, bukan mengisi semuanya manual.
- `frontend/components/draft/export-modal.tsx`: target output dari awal dibawa ke Export Wizard; template Word/PPTX tetap tersedia sebagai landasan opsional.
- `frontend/app/library/page.tsx`, `frontend/components/sidebar.tsx`, dan dashboard: Library direframe menjadi Google Drive Workspace/Drive, karena dokumen dan template berasal dari hasil indexing Google Drive. Projects tetap merepresentasikan pekerjaan yang dibuat di Synapse.
- Verifikasi: `npm run build` exit 0, backend compile bersih, dan diagnostics workflow bersih.

### ✅ Final Workflow Connections
- `frontend/app/search/page.tsx`: tombol `Buat dokumen dari jawaban` menyimpan brief percakapan dan membuka Draft.
- `frontend/app/draft/page.tsx`: brief Search otomatis menjadi satu item grounded dan siap masuk Export Wizard.
- `frontend/app/settings/page.tsx`: CTA `Connect & Sync Drive` menjelaskan dan menjalankan OAuth existing pada first sync.
- `frontend/app/library/page.tsx` dan sidebar: sumber diberi nama Google Drive/Drive, bukan library manual.
- Verifikasi: `npm run build` exit 0, backend compile bersih, dan diagnostics Search/Draft/Settings/Drive bersih.

### ✅ Export Client Exception Fix
- Root cause: `ExportModal` melakukan `return null` sebelum hook preflight dipanggil, sehingga urutan React hooks berubah saat modal dibuka/tutup.
- Fix: guard `!isOpen` dipindahkan setelah seluruh hooks.
- Verifikasi: `npm run build` exit 0, diagnostics `export-modal.tsx` bersih, dan `git diff --check` bersih.

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
- **STATUS: SELESAI** — semantic mapping, document-type awareness, DOCX/PPTX template cloning, template library PPTX, dan Office-rendered full-fidelity PDF sudah tersedia.

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
- Template export memakai semantic section mapping via LLM dengan fallback heuristic jika provider tidak tersedia; item yang tidak punya heading relevan masuk ke fallback section.
- Full-fidelity PDF renderer membutuhkan Windows dengan Microsoft Word/PowerPoint terpasang; environment tanpa Office memakai fallback ReportLab PDF.
- Backend masih perlu GDrive credentials (credentials.json) untuk fitur sync dokumen
- `frontend/lib/document-types.ts` (baru) — satu sumber kebenaran Jenis Dokumen × Format yang diizinkan, dipakai `page.tsx` dan `export-modal.tsx`.
- `frontend/lib/skeletons.ts` (baru) — daftar sub-bab default per Jenis Dokumen, dipakai buat populate item begitu TOR di-upload (gak ada LLM call buat struktur lagi).
- `backend/app/routers/draft.py` `/draft/segment` masih ada tapi udah gak dipanggil dari frontend (draft mode sekarang skeleton-based, bukan segmentasi TOR).

---

*Last updated: sesi Claude Code (redesign alur Draft/Export), lanjutan dari sesi Antigravity di atas.*
*Agent sebelumnya: Antigravity (Google Deepmind). User pindah balik ke Antigravity setelah sesi ini.*
