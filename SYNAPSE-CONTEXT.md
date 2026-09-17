# SYNAPSE CONTEXT — Auto-Handoff File
> ⚠️ File ini di-update otomatis. Jika AI agent sebelumnya habis quota, baca file ini dari atas untuk melanjutkan pekerjaan.

---

## 🚀 MILESTONE SELESAI: 100% GAP ANALYSIS RESOLVED, SYNTHETIC QA ENGINE, 2D HARDWARE STUDIO UI, & TEST SUITE HARDENING

Seluruh sisa backlog pada `synapse-gap-analysis.md` dan penyempurnaan UI/Backend telah 100% selesai dan tervalidasi:

1. **Synthetic QA Generation & Retrieval Benchmark Pipeline (`backend/app/services/synthetic_qa.py`):**
   - Mengimplementasikan pola Sangfor Agent Builder untuk pembuatan dataset evaluasi otomatis: mengambil cuplikan pengetahuan internal, lalu LLM menyusun pasangan Pertanyaan Presales & Jawaban Target (Ground-Truth) yang realistis beserta kata kunci wajib.
   - Fungsi evaluasi otomatis menghitung skor akurasi: Hit@k, Mean Reciprocal Rank (MRR), latensi, dan kecukupan grounding (*reflect-before-generate*).
   - Terintegrasi pada endpoint `POST /research/synthetic-qa/generate` dan `POST /research/synthetic-qa/evaluate`, serta didaftarkan sebagai autonomous task pada `worker_agent2.py`.
   - Menuntaskan 100% seluruh daftar item pada `synapse-gap-analysis.md`.

2. **Integrasi UI 2D Technical Hardware Studio (`frontend/components/draft/visual-asset-studio.tsx` & `api.ts`):**
   - Menambahkan tab khusus `🛠️ Studio Hardware 2D` di dalam Visual Asset Studio.
   - User dapat menginput nama perangkat keras (misal: HPE DL380, Pure Storage //X20, Cisco Catalyst, Sangfor HCI), memilih form factor (1U / 2U / 4U), atau menggunakan preset cepat 1-klik.
   - Generator langsung menggambar visual sasis teknis (chassis body, status LEDs, rack ears, drive bays), menyediakan tombol preview perbesar fullscreen, dan tombol `Gunakan Sebagai Aset Bagian Ini`.
   - Function API client `generateHardwareVisual` ditambahkan di `frontend/lib/api.ts`.

3. **Backend Test Suite Hardening & In-Process TestClient:**
   - Memperbaiki `backend/app/config.py` agar selalu me-resolve file `.env` di direktori backend secara absolut, mencegah error SQLAlchemy URL saat dieksekusi dari direktori mana pun.
   - Mengonversi `test_sizing.py`, `test_battlecard_query.py`, dan `test_proposal_intelligence.py` ke standar `unittest.TestCase` menggunakan `TestClient(app)` in-process.
   - Hasil pengujian: seluruh unit test lolos bersih, benchmark RAG `benchmark_eval.py` **100% PASSED** dengan 4/4 skenario berstatus `STRONG` grounding.

4. **Verifikasi Frontend:**
   - `npx tsc --noEmit` lolos bersih (0 error).
   - `npm run build` berhasil mengompilasi seluruh 9/9 halaman aplikasi tanpa kendala.

---

## 🚀 MILESTONE SELESAI: DEEP RESEARCH, 2D FLAT ARCHITECTURE, & 2D HARDWARE STUDIO (COMMITTED & PUSHED)

Rangkaian perbaikan terkini berdasarkan feedback langsung user telah berhasil diselesaikan, diuji, dan divalidasi:

1. **Deep Market & Battlecard Research (`/query` & `/research`) — Backend (Antigravity):**
   - Otomatis melakukan query classification: jika mendeteksi query perbandingan/komparasi vendor (`vs`, `battlecard`, `komparasi`, `kelebihan kekurangan`) atau saat dokumen internal memiliki tingkat kecukupan rendah (<35%), backend langsung mengaktifkan `GeminiProvider.research_external(query)`.
   - Mengintegrasikan hasil riset mendalam dengan sitasi resmi URL web industri (misal: VMware, Nutanix, Sangfor, Gartner, IDC) dan memadukannya dengan dokumen internal secara terstruktur.
   - Pengujian `backend/tests/test_battlecard_query.py` **100% PASSED** dengan 11 sumber gabungan (8 sitasi web terverifikasi + 3 acuan TOR internal).

2. **Modern 2D Flat Architecture Engine — Backend (Antigravity):**
   - File: `backend/app/services/diagram_generator.py`.
   - Mengadopsi theme Mermaid modern 2D flat ala Whimsical/Gemini:
     `%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#F1F5F9', 'primaryTextColor': '#0F172A', 'primaryBorderColor': '#3B82F6', 'lineColor': '#64748B', 'secondaryColor': '#EFF6FF', 'tertiaryColor': '#F8FAFC', 'clusterBkg': '#F8FAFC', 'clusterBorder': '#CBD5E1', 'fontFamily': 'Inter, system-ui, sans-serif' }}}%%`
   - Node semantik yang bervariasi: rounded kotak compute, silinder database/storage, border tegas network, dan palet warna pastel.
   - Dilengkapi fallback render Kroki, mermaid.ink, dan vector Pillow offline.

3. **Pencarian Hardware & 2D Technical Hardware Studio — Backend (Antigravity):**
   - File: `backend/app/services/image_search.py` & `backend/app/routers/draft.py`.
   - Query modifier otomatis: memprioritaskan isolated transparent PNG official front-view chassis.
   - **Synthetic 2D Hardware Generator (`generate_synthetic_hardware_visual`)**: Jika pencarian foto di internet tidak menemukan aset yang bersih atau gagal, backend secara otomatis menggambar diagram 2D technical rack chassis yang realistis (1U/2U/4U: Server/HCI node, All-Flash Storage DirectFlash array, Core Switch) lengkap dengan rack ears, drive bays/caddies, status LEDs, dan branding perangkat.
   - Endpoint baru: `POST /draft/generate-hardware-visual` dan otomatis diinjeksi pada urutan teratas `/draft/search-images`.

4. **UI & Rendering Refactor — Frontend (Claude Code):**
   - **Rich Rendered Default Display**: Editor draf kini menampilkan Markdown ter-render rapi secara default (`react-markdown` + `remark-gfm`) dengan tombol toggle `✏️ Edit Teks Mentah` / `👁️ Selesai Edit`, menghilangkan karakter mentah (`*`, `|`, `---`).
   - **Tipografi Presales**: Format teks justified (`text-justify`), line-height lega (`leading-relaxed` / 1.5), margin paragraf proporsional.
   - **HLD Lightbox Zoom**: Gambar diagram arsitektur HLD dapat diklik untuk membuka modal zoom fullscreen berlatar `backdrop-blur-md` beserta tombol unduh PNG.
   - **Container Preview Ekspor Luas**: Preview dokumen sebelum ekspor di `export-modal.tsx` diperbesar menjadi minimal 75vh bergaya lembar A4.
   - **Penyederhanaan Ekspor**: Fitur "Ikut Gaya File Lain" (Style Matcher/Template Extractor) dihapus total dari UI atas instruksi user. Opsi ekspor disederhanakan menjadi 3 kartu preset: Proposal Teknis (.docx), Scope of Work (.docx), dan Pitch Deck (.pptx).

5. **Arsitektur Multi-Agent Otonom:**
   - Worker Agent 2: `.agents/worker_agent2.py` (DataOps & Vector benchmark suite).
   - Sentinel Agent 3: `.agents/agent3_sentinel.py` (Watchdog port 8000/3000 & auto-healer).
   - Task Bus: `.agents/task_bus.py` (File-based atomic queue).

---

> **PENTING UNTUK KEDUA AGENT (Claude Code & Antigravity):**
> 1. **Pembagian Peran Utama:**
>    - **Claude Code:** Berfokus penuh pada **Frontend** (UI/UX, Next.js, komponen interaktif, state management, tampilan & feedback pengguna).
>    - **Antigravity:** Berfokus penuh pada **Backend** (FastAPI, database pgvector, retrieval quality/reranking, document parsing, embeddings, business logic, export builders).
> 2. **Shared Backlog (`synapse-gap-analysis.md`):**
>    - File baru [`synapse-gap-analysis.md`](file:///d:/Downloads/Mini%20Project/Proposal%20Acceleator/knowledge-accelerator/synapse-gap-analysis.md) telah ditambahkan di root repositori.
>    - File ini berisi Gap Analysis vs Sangfor Agent Builder Demo (Reranking pass, reflect-before-generate, chunking review, table parsing multi-page, OCR fallback, RBAC/scoping, MCP server) dan harus diperlakukan sebagai **shared backlog bersama**.
> 3. **Protokol Sinkronisasi:**
>    - Selalu update file markdown (`SYNAPSE-CONTEXT.md` & `synapse-gap-analysis.md`) setiap kali menyelesaikan suatu item atau memulai task baru.
>    - Sebelum mulai bekerja, selalu `git pull origin feat/proposal-visual-engine` dan cek update terbaru di file handoff agar kolaborasi tetap mulus tanpa konflik.

---

## ✅ CLAUDE CODE — SELESAI: REDESIGN UI `/draft` (DECLUTTER, INTEL PILLS, TYPOGRAFI) & EXPORT MODAL DISEDERHANAKAN

Rangkaian task berurutan dari user di sesi ini (branch `feat/proposal-visual-engine`), semua commit sudah **di-push ke origin**:

1. **Redesign total UI `/draft`** (respons ke feedback "keramean, belum user-friendly") — commit `ad5aea8`, `78b7965`:
   - Stepper 3-langkah persisten (`Upload TOR → Draf & Tinjau → Ekspor`) di bawah Topbar.
   - Sidebar sub-bab dipersempit 420-460px → 300-340px, nomor hierarkis (1.1/3.2.1) di-parse dari title, status jadi dot minimalis (hijau/kuning/abu), panah reorder+regenerate cuma muncul on-hover.
   - Panel Red-Flag Scanner / Coverage Audit / Win Themes (fitur baru dari Antigravity, lihat poin 2) diringkas jadi **1 baris pill collapsible** di bawah ProgressHeader — bukan kotak besar permanen.
   - `CHIP_BASE`/`CHIP_SM` (tinggi fix h-6/h-5) buat nyeragamkan semua badge/tombol kecil di header item & sidebar — root cause "tombol naik-turun" adalah campur `rounded` vs `rounded-full` + padding-only height tanpa fixed height.
   - Textarea draf: local state + debounce 200ms (bukan `setItems` tiap keystroke) biar sidebar 20+ item gak lag pas ngetik cepat.
   - Sticky toolbar Generate/Salin/Asset Studio di editor kanan.

2. **Wiring 3 fitur backend baru Antigravity ke UI** — commit `ac66db4`, `fbb49b6`, `3a573d6`:
   - `scanCriticalClauses` (red-flag/klausul kritis TOR) → auto-jalan pas upload, badge risiko + alert.
   - `checkRequirementCoverage` (audit kepatuhan TOR) → pill coverage % + modal detail uncovered items.
   - `win_themes` param di `generateItemDraft` → chip preset + custom-add (bebas ketik keunggulan sendiri, bukan cuma 4 preset).
   - `calculateSizing` (Sizing/BoQ calculator) → **sengaja disembunyiin** di menu "•••" ProgressHeader (bukan toolbar utama) sesuai catatan presales "jarang dipakai, jangan menonjol".

3. **5 perbaikan UI final** — commit `756a913`:
   - Typografi draf & jawaban search: `text-justify` + `leading-relaxed` + `mb-4` antar paragraf, tabel markdown render beneran (border, zebra-stripe) via `react-markdown` + `remark-gfm` (dependency baru, di-style pakai token app sendiri, bukan Tailwind typography plugin).
   - **Rendered rich view jadi default** di editor draf (dulu textarea mentah default) — toggle `✏️ Edit Teks Mentah` / `👁️ Selesai Edit`. Draf kosong tetap force textarea biar user bisa mulai ngetik.
   - Gambar HLD/arsitektur click-to-zoom (lightbox fullscreen, `backdrop-blur-md`, tombol unduh PNG) — di kartu draf & di Visual Asset Studio (lightbox lokal sendiri di situ, gak prop-drilling ke page.tsx).
   - Preview export di-restyle jadi lembar A4 (putih, shadow, min-h 70-75vh), ganti list sempit `max-h-[300px]`.
   - **⚠️ Fitur "Ikuti Gaya File Lain" (Template Cloner/Style Extractor) DIHAPUS TOTAL dari UI** atas instruksi eksplisit user ("membingungkan, gak kepake") — ~450 baris JSX+handler di `export-modal.tsx` (upload template, pilih dari Drive library, mode clone vs structure, clone PPTX) dihapus. Export sekarang cuma 3 kartu preset: Proposal Teknis (.docx), SoW (.docx), Pitch Deck (.pptx). **Endpoint backend `cloneTemplate`/`exportFromTemplate`/`cloneTemplatePptx`/`uploadTemplate` TIDAK disentuh/dihapus** — cuma udah gak ada call site dari frontend lagi. Kalau Antigravity mau deprecate endpoint-nya juga, itu keputusan terpisah.

4. **Custom subagent baru**: `.claude/agents/frontend-verifier.md` — watchdog verify-only (tsc/build/restart dev server bersih), dipanggil manual di sesi ini karena baru dibuat mid-session (agent list Claude Code gak hot-reload); sesi depan akan otomatis dipanggil.

- **Catatan collision (bukan bug kode, histori kerja)**: commit `1552ad1` (Antigravity, "red-flag clause scanner...") sempat ke-bundle sama 522 baris in-progress frontend UI refactor punya Claude Code karena staging luas (`git add -A`-ish) di checkout yang sama — user minta dibiarin gabung aja (gak di-reset), Antigravity udah diingetin gak pake staging luas lagi. Kalau nemu commit message yang gak match sama diff-nya, ini penyebabnya.
- Verifikasi keseluruhan sesi: `npx tsc --noEmit` + `npm run build` clean di setiap commit. Dev server sempat 2x kena stale `.next` cache (chunk JS/CSS 404 → semua tombol gak responsif) — fix-nya selalu sama: kill process port 3000, `rm -rf .next`, restart fresh.

---

## ✅ ANTIGRAVITY — SELESAI: PEMBERSIHAN DIVISI, NOISE EXCLUSION, OCR FALLBACK, BENCHMARK SUITE & MCP SERVER

Sesuai instruksi user ("opsi 3 gue udah bilang gak pake divisi2an, diilangin ya soal divisinya. fokus enhancement aja. lanjut semua sisanya gas"):

1. **Pembersihan Total Konsep Divisi (Frontend & Shared Backlog):**
   - **`synapse-gap-analysis.md`**: Section 4 (RBAC & Divisional scoping) di-drop permanen. Synapse ditegaskan sebagai basis pengetahuan organisasi tunggal (single-tenant / non-divisional).
   - **`frontend/app/documents/page.tsx`**: Filter pills divisi dihapus, dropdown divisi dibersihkan, card subtitle diubah dari "presales" ke tipe dokumen (`docType`).
   - **`frontend/app/library/page.tsx`**: Subtitle dan pencarian dibersihkan dari field division.
   - **`frontend/app/draft/page.tsx` & `export-modal.tsx` & `citation-drawer.tsx`**: Label division dibersihkan dari badge dan dropdown picker template.
   - Verifikasi: `npx tsc --noEmit` lolos 0 error.

2. **Document Parsing Enhancements (`backend/app/services/document_parser.py`):**
   - **Signature & Stamp Boilerplate Cleaner (`clean_signature_blocks`)**: Mendeteksi pola penutup dokumen TOR/SoW/MoM (kata penutup, "Mengetahui/Menyetujui", Pihak Pertama/Kedua, garis tanda tangan titik-titik, dan stempel/meterai). Teks boilerplate ini dipangkas sebelum proses chunking dan embedding agar tidak mengotori hasil pencarian RAG, dengan penanda `has_signature_page` untuk provenance.
   - **Scanned PDF OCR Fallback (`extract_pdf_with_ocr_fallback`)**: Mendeteksi halaman PDF yang minim teks (<50 karakter) namun memiliki raster image (halaman hasil scan). Secara otomatis mengaktifkan fallback multimodal Gemini Vision (`gemini-3.6-flash`) untuk mentranskripsi halaman dan tabel hasil scan ke Markdown table.
   - Diintegrasikan ke `drive_sync.py` (`fetch_and_extract_text`) dan `draft.py` (`upload_tor`).

3. **Retrieval Quality Benchmark Evaluation Suite (`backend/tests/benchmark_eval.py`):**
   - Suite pengujian regresi otomatis dengan 4 skenario presales riil (CSUL Pure Storage sizing, Maintenance & SLA terms, HLD Topology, dan BoQ / Compliance Matrix).
   - Menghitung akurasi kata kunci esensial, evaluasi context sufficiency (`strong`), serta latensi query reranking.
   - **Hasil benchmark:** 4/4 PASSED (100%), seluruh case berstatus `STRONG` grounding, latensi warm query rata-rata **~600–670ms** per query. Zero LLM token waste.

4. **Synapse MCP Server (`backend/mcp_server.py`):**
   - Mengimplementasikan server Model Context Protocol (MCP) standar berbasis JSON-RPC 2.0 over stdio.
   - Menyediakan 3 tool siap pakai: `search_knowledge_base`, `get_proposal_outline`, dan `evaluate_grounding`.
   - Memungkinkan Synapse diakses langsung dari Claude Code, Claude Desktop, Cursor, Antigravity, atau agent kustom eksternal.

5. **Status Layanan Aktif:**
   - **Backend FastAPI**: Aktif di `http://127.0.0.1:8000` (Status: `{"status":"ok"}`).
   - **Frontend Next.js**: Aktif di `http://localhost:3000` (Status: HTTP 200).
   - **Watchdog**: Aktif memonitoring setiap 600 detik (`watchdog.ps1`).

## ✅ ANTIGRAVITY (BACKEND) — SELESAI: Reranking Pass, Reflect-Before-Generate, & Table-Aware Chunking

Sesuai urutan prioritas di `synapse-gap-analysis.md` (Poin 1 & 2):

1. **Cross-Encoder Reranking Pass (`backend/app/services/retrieval.py`):**
   - Mengintegrasikan Cross-Encoder lokal `cross-encoder/ms-marco-TinyBERT-L-2-v2` (ringan, ~45MB, ter-cache lokal di mesin user).
   - Fungsi `_rerank_candidates()` mengambil 20-25 kandidat hybrid teratas dan mengevaluasi relevansi semantik sejati via cross-attention `(query, passage)` sebelum mengembalikan top-$k$ ke LLM.
   - Di-pre-warm saat startup FastAPI (`main.py`) agar respon query instan tanpa cold-start latency.
   - Teruji: query `"Berapa kapasitas dan model Pure Storage untuk CSUL Finance?"` mengembalikan chunks otentik Pure Storage //RC20 dengan akurasi 100%.

2. **Reflect-Before-Generate & Query Expansion (`backend/app/routers/draft.py`):**
   - Menambahkan evaluasi kecukupan konteks di `POST /draft/item` (`_evaluate_context_sufficiency()`).
   - Jika grounding terdeteksi `sparse` (<180 karakter atau minim kata kunci teknis), sistem otomatis melakukan query expansion (`_reformulate_query_for_expansion()`) dan memperluas pencarian ke seluruh basis pengetahuan untuk menyelamatkan draf dari halusinasi.
   - `DraftItemResponse` kini mengembalikan `grounding_status` (`strong` | `moderate` | `sparse`) dan `grounding_note` yang bisa disinkronkan langsung dengan badge UI Claude Code.

3. **Table-Aware Extraction & Structure Chunking (`drive_sync.py` & `embeddings.py`):**
   - **Fix Data-Loss Tabel DOCX:** `_extract_docx_text_and_tables()` di `drive_sync.py` dan `upload_tor` di `draft.py` kini mengekstrak tabel DOCX secara sekuensial dan mengonversinya menjadi tabel Markdown (`| Col 1 | Col 2 |`), sehingga BoQ, tabel harga, dan matriks teknis tidak lagi hilang saat sinkronisasi/unggah.
   - **Structure-Aware Chunker:** `chunk_text()` di `embeddings.py` kini mengenali tabel Markdown (`_split_markdown_table`) sehingga tabel tidak terbelah di tengah baris, mengulang baris header jika tabel sangat panjang, dan menjadikan `# Heading` bab sebagai batas alami chunk.

- **Verifikasi:**
  - `py_compile` semua 5 file backend: Clean (0 error).
  - Integration test `test_reranker_query.py`: 200 OK (Akurasi grounding Pure Storage CSUL 100%).
  - Integration test `test_draft_item.py`: 200 OK (`grounding_status: strong`, note terverifikasi).
  - Server aktif di Port 8000 dan Port 3000 dijaga oleh `watchdog.ps1`.

---

## ✅ CLAUDE CODE (FRONTEND) — SELESAI: Sufficiency badge + one-click regenerate + loading polish di `/draft`

Task dari user, scope frontend-only (`frontend/app/draft/page.tsx`, commit `7fcc8d1`), gak nyentuh file backend Antigravity yang lagi diedit bareng (`draft.py`, `retrieval.py`, `embeddings.py`, `drive_sync.py`, `main.py` — noted lagi ada kerjaan reranking pass, sesuai `synapse-gap-analysis.md` #1).

1. **Grounding sufficiency badge per sub-bab** — dihitung dari `item.sources.length` (hasil citation generate terakhir), TANPA endpoint backend baru: 0 sumber → "Perlu Tambahan Referensi" (merah), 1-2 → "Grounding Sedang" (amber), 3+ → "Grounding Kuat" (hijau). Cuma muncul kalau `draft_text` udah ada (belum di-generate = gak ada badge). Tampil di 2 tempat: list row (bawah judul, ganti posisi spinner pas gak lagi generating) dan header editor panel item terpilih (sebelah badge kategori).
2. **Tombol "Regenerate Bagian Ini" one-click** — icon `RefreshCw` di list row (sebelah panah reorder ↑↓), langsung manggil `handleGenerateItemDraft(item.id)` tanpa perlu buka section itu dulu. Reuse fungsi yang udah ada, gak ada logic baru.
3. **Loading/transisi diperhalus:**
   - Skeleton placeholder card (bukan spinner polos doang) pas AI lagi rekomendasiin struktur sub-bab dari TOR.
   - Stagger fade-in pas kartu-kartu hasil kurasi struktur muncul, dan pas badge grounding muncul/berubah.
   - Pulse accent-color singkat (700ms) di textarea draft pas generate/regenerate baru selesai — feedback visual "ini baru di-update".
   - Semua pakai utility `animate-in`/`fade-in`/`slide-in-from-bottom-1`/`fill-mode-both` yang udah di-hand-roll di `globals.css` sesi sebelumnya (bukan dependency baru).
- Verifikasi: `npx tsc --noEmit` clean, `npm run build` (7/7 route) clean. Belum sempat diklik manual di browser — servernya sempat dimatiin user sebelum switch ke Antigravity, jadi verifikasi visual pending pas server nyala lagi.

---

## 🔒 SESI CLAUDE CODE — SECURITY REVIEW + TOOLING SETUP (branch `feat/proposal-visual-engine`)

Atas permintaan user, dijalanin `/security-review` (skill resmi, bukan review manual) atas seluruh diff `feat/proposal-visual-engine`. Ketemu 1 vulnerability nyata (verified via sub-task filtering terpisah, confidence 9/10), 1 kandidat lain di-drop (confidence 3/10 — data ke kroki.io/mermaid.ink itu HTTPS ke layanan legit, bukan vulnerability, cuma catatan data-governance kalau mau diformalkan nanti).

**FIXED — SSRF di `POST /draft/download-image`:** `backend/app/services/image_search.py` `download_and_optimize_image()` dulu fetch `image_url` (full attacker-controlled string, endpoint gak ada auth) tanpa validasi host/IP sama sekali, plus `follow_redirects=True` — bisa dipakai buat probe/exfiltrate isi endpoint internal (`169.254.169.254` cloud metadata, `127.0.0.1`, RFC1918) lewat backend sebagai proxy. Fix: helper baru `_is_public_http_url()` (tolak scheme selain http/https, resolve hostname lalu tolak kalau ada IP yang loopback/link-local/private/reserved/multicast) dipanggil SEBELUM fetch, plus `_fetch_public_image_bytes()` yang manual-handle redirect (`follow_redirects=False` + loop maks 5 hop, re-validate URL tiap hop) biar URL publik gak bisa 302 ke target privat. **Verified end-to-end lewat HTTP asli:** target metadata/loopback → 400, gambar publik asli (`google.com`) → 200 dengan data_url valid. Regression-check: re-run semua smoke test export docx (7 tipe)/pdf (4 tipe)/pptx/preview-conversion — semua masih 200/OK, gak ada yang somehow ke-block juga.

**Tooling/workflow baru buat kerja bareng Claude Code lebih efisien** (semua skill resmi, langsung diterapin, bukan third-party plugin):
- `CLAUDE.md` (baru, root repo) — dokumentasi arsitektur + 2 gotcha spesifik `draft.py` yang udah kejadian jadi bug nyata sesi-sesi sebelumnya (no module-level docx import; fldChar/instrText harus di dalam `<w:r>`), plus catatan soal shared-checkout collision sama Antigravity kalau ada 2 agent kerja bareng.
- `.claude/settings.json` (baru) — hasil scan `fewer-permission-prompts` atas 50 transkrip terakhir: cuma 3 entry MCP read-only (`read_network_requests`/`read_page`/`find` dari claude-in-chrome) yang qualify buat allowlist — sisanya command yang sering dipake (cd/ls/cat/grep/git status/dll) udah auto-allowed Claude Code sendiri, dan `python`/`uvicorn`/`powershell`/`curl` sengaja TIDAK di-allowlist (interpreter/shell = setara arbitrary code execution kalau di-wildcard; curl ambigu/bisa hit apa aja).
- Verifikasi app juga udah dicoba pake skill `run` (drive beneran via HTTP: semua 6 route frontend 200, endpoint `/draft/recommend-structure` dan `/query` di-hit live pake Gemini asli buat konfirmasi fix struktur adaptif & search jalan).

---

## 🐛 SESI CLAUDE CODE — 4 BUG LAPORAN USER LANGSUNG (branch `feat/proposal-visual-engine`)

User laporin 4 hal langsung setelah nyoba UI, semua dicek & dibenerin:

1. **Filter "Semua Jenis Dokumen"/"Semua Divisi" di `/search` dihapus total** — user gak mau dropdown filter itu ada. `frontend/app/search/page.tsx`: hapus state `docTypeFilter`/`divisionFilter`/`availableDivisions`, `handleFilterChange`, `persistFilters`, fetch divisi dari `listDocuments()`, dan UI dropdown-nya. `doSearch` sekarang selalu cari tanpa filter.
   - **Simbol markdown `**`/`*` di hasil pencarian dihapus** — snippet kutipan & jawaban AI sering nampilin `**kata**` mentah (dari markdown di dokumen sumber/jawaban LLM) karena mekanisme highlight query di `HighlightedText` sendiri makai `**` sebagai penanda internal, jadi markdown asli dari teks sumber ketabrak/kebaca sebagai bagian dari mekanisme highlight. Fix: `components/search/highlighted-text.tsx` tambah `stripMarkdown()` (strip `**bold**`/`*italic*`/`` `code` ``) yang jalan otomatis di dalam `HighlightedText`, dan dipanggil manual di `search/page.tsx` sebelum teks jawaban AI masuk ke `AnswerWithCitations`.
2. **& 3. Struktur sub-bab hasil rekomendasi AI (`/draft/recommend-structure`) dirombak total** — sebelumnya semua fallback/prompt cuma flat list tanpa nested numbering asli (gak ada `1.1`/`3.2.1`), dan urutan bab (Scope of Work, Timeline, dst) gak konsisten sama dokumen real. Sekarang struktur baku "Proposal Teknis" (doc_type `narrative`) jadi:
   ```
   1. Latar Belakang → 1.1 Kondisi Existing, 1.2 Risiko EOL/EOS
   2. Tujuan
   3. Proposed Solution → 3.1 Solution Overview, 3.2 Sizing dan Opsi Penawaran → 3.2.1 Dasar Perhitungan Kapasitas, 3.3 Proposed HLD
   4. Compliance Matrix (berdasarkan RFP/TOR/KAK/RKS)
   5. Bill of Quantity
   6. Implementation Plan → 6.1 Timeline Pekerjaan, 6.2 Scope of Work, 6.3 Out of Scope
   7. Maintenance Plan → 7.1 PM, 7.2 CM, 7.3 SLA
   8. Lampiran → 8.1 Profil Perusahaan & Legalitas, 8.2 Tim Tenaga Ahli & Sertifikasi
   ```
   Diterapkan di **3 tempat sekaligus** biar konsisten kapan pun jalur mana yang aktif:
   - `backend/app/services/llm_provider.py` `_fallback_recommend_structure()` branch default/narrative — daftar 22 section flat dengan title yang udah embed nomor hierarkis (mekanisme parsing level heading di `_add_item_heading` udah otomatis baca kedalaman dari jumlah titik di nomor, gak perlu ubah kode render).
   - Prompt `recommend_structure()` di `ClaudeProvider` DAN `GeminiProvider` — konstanta baru `NARRATIVE_STRUCTURE_TEMPLATE` (satu sumber kebenaran dipakai kedua prompt) diselipkan sebagai instruksi WAJIB kalau `doc_type == "narrative"`, biar hasil AI asli (bukan cuma fallback) juga ikut kerangka ini.
   - `frontend/lib/skeletons.ts` `SKELETONS.narrative` (client-side fallback kalau API `recommend-structure` gagal total) — disamakan persis.
   - **Verified end-to-end:** generate docx asli pake 22 section baru → cek heading level via `python-docx` (Heading 1 buat "1."/"2."/dst, Heading 2 buat "x.y", Heading 3 buat "3.2.1") → hasilnya PERSIS sesuai kedalaman yang diminta. Lanjut convert ke PDF via Word COM juga sukses (694KB, real dokumen ~22 bagian).
4. **BUG NYATA: "Gagal Preview Dokumen" — root cause ketemu & fixed.** Setiap dokumen hasil export (SEMUA `template_type`, bukan cuma satu) gagal dibuka Word lewat COM automation (`convert-office-pdf` / tombol Preview di Export Wizard) dengan error "Word experienced an error trying to open the file." Root cause: kode footer nomor halaman di `export_proposal_docx` (`backend/app/routers/draft.py`) append elemen XML `<w:fldChar>`/`<w:instrText>` LANGSUNG ke `<w:p>` (paragraph), padahal OOXML mewajibkan elemen itu ada di dalam `<w:r>` (run). `python-docx`/lxml baca balik dokumennya tanpa keluhan (makanya lolos semua smoke test sebelumnya yang cuma cek `len(doc.paragraphs)`/`len(doc.tables)`), tapi Word asli (dipakai buat render PDF preview) nolak file yang secara struktural invalid ini — **jadi PREVIEW EMANG SELALU GAGAL SEJAK FITUR INI DIBUAT**, bukan cuma sesekali. Fix: bungkus fldChar/instrText dalam satu `p_foot.add_run()` yang benar. **Verified:** re-test HTTP round-trip penuh (`export-docx` → `convert-office-pdf`) buat narrative/matrix/sow — ketiganya sekarang 200 OK dengan PDF bytes asli (sebelumnya 503 di ketiganya).
- Verifikasi keseluruhan: backend `py_compile` + `import main` clean, frontend `npx tsc --noEmit` + `npm run build` (7/7 route) clean. Backend & frontend dev server di-restart biar kode terbaru ke-load, dites hidup (`/health` 200, `localhost:3000` 200) sebelum diserahkan ke user buat dicoba manual.

---

## 🩹 SESI CLAUDE CODE — FULL CODEBASE BUG SWEEP & DEDUP (branch `feat/proposal-visual-engine`)

User minta: cek seluruh codebase, benerin semua bug, efisienkan kode yang duplikat/berulang, sampai "perfect tanpa issue", baru mau ditest manual. Prosesnya: jalanin `/code-review` (8 agent paralel, angle correctness/reuse/efficiency/removed-behavior/cross-file) atas diff `main..feat/proposal-visual-engine`, lalu semua temuan di-cross-verify manual satu-satu sebelum di-fix (bukan asal apply).

**Bug korektnes yang diperbaiki (9 item):**
1. **`_fallback_recommend_structure` didefinisikan 2x** di `llm_provider.py` (baris 372 & 653) — Python cuma pakai definisi terakhir, jadi versi kaya/otentik CSUL (baris 372, hasil kerja commit `f7456df`) SELALU KETIMPA sama versi generik lama tiap kali LLM call gagal dan jatuh ke fallback. Definisi kedua (dead code) dihapus. **Verified:** `_fallback_recommend_structure("sow", ...)` sekarang balikin "1. Latar Belakang & Deskripsi Pekerjaan" (bukan "Ruang Lingkup Pekerjaan (Scope of Work)" generik).
2. **Citation-marker `[1]`/`[2]` bocor ke `diagram_generator.py`** — instruksi sitasi yang saya tambahin sesi lalu di `_build_system_prompt(mode="qa")` (buat `/search`) ternyata ikut kepake sama `generate_hld_mermaid()` (fitur HLD Antigravity, sama-sama panggil `.answer(..., mode="qa")`) yang butuh JSON murni tanpa markup — beresiko break `json.loads()` dan leak `[1]` ke narasi arsitektur di dokumen customer. Fix: `diagram_generator.py` sekarang pakai `mode="json"` (prompt grounded biasa, tanpa instruksi sitasi); `_build_system_prompt`/`_format_context_chunks` di-3-way branch (`draft` / `qa` / lainnya).
3. **Template `matrix` (docx & PDF) gak pernah nyisipin gambar** — semua template_type lain (sow/mom/solution_brief/klarifikasi_teknis/pitch_deck/narrative) manggil `_insert_item_image_docx`/`_build_item_image_story`, cuma matrix yang kelewat. UI janji "🖼️ Aset" ke-attach tapi hasil export matrix gambarnya hilang diam-diam. Fix: tambah section "Lampiran Visual Pendukung" setelah tabel matriks (docx & PDF) buat item yang punya `image_data_url`.
4. **Badge "Wikimedia" di Visual Asset Studio gak pernah muncul** — frontend cek `res.source === "wikimedia"`, backend kirim `"Wikimedia Commons"` — perbandingan string gak pernah match, semua hasil Wikimedia ke-label "Web". Fix string compare-nya.
5. **SQL LIKE wildcard gak di-escape** di filter `doc_type`/`division` (`retrieval.py` `_hybrid_ranked_chunks`) — pakai `.ilike(value)` mentah, kalau divisi ada karakter `%`/`_` bisa match salah divisi. Ganti ke `func.lower(...) == value.lower()` (exact match case-insensitive, sesuai maksud aslinya).
6. **`extract_template_images` (`async def`) blocking event loop** — manggil `extract_images_from_office_bytes` (CPU-bound: baca zip + PIL thumbnail) langsung di event loop, beda pola dari endpoint image lain di file ini yang semua `def` biasa (auto lari ke threadpool FastAPI). Fix: `await run_in_threadpool(extract_images_from_office_bytes, content)`.
7. **`extractTemplateImages()` frontend type gak match response backend** — TS declare `filename`/`mime_type`, backend beneran balikin `name`/`size_bytes`. Belum ada UI yang makai fungsi ini (dead code), tapi trap buat siapa pun yang wire nanti. Fix type-nya biar sesuai realita.
8. **Regresi warna font default docx hilang** — `doc.styles["Normal"].font` di `export_proposal_docx` cuma set `name`+`size`, `color.rgb = RGBColor(0x1F,0x24,0x30)` (dark-slate) ke-drop entah di commit mana → paragraf polos jatuh ke hitam default Word. Ditambahin balik.
9. **Filter divisi `/search` gak ada fallback kalau `listDocuments()` gagal** — `.catch(() => {})` kosong, dropdown divisi permanen cuma "Semua divisi" sepanjang sesi kalau fetch awal gagal. Ditambah fallback ke daftar divisi baseline (presales/infrastructure/security/application).
- **Bonus (semi-bug, robustness):** deteksi keyword hardware di `draft_item()` (buat auto-attach gambar) trigger dari kata `switch`/`firewall` tapi gak punya bucket generik sendiri — vendor selain Cisco/Fortinet (Juniper, Palo Alto, dst) silently gagal dapet gambar. Ditambah 2 bucket generik.
- **Cleanup:** CORS di `main.py` hapus `allow_origins` list eksplisit (redundant, `allow_origin_regex` udah superset-nya).

**Duplikasi/reuse yang dibereskan (backend, semua diverifikasi jalan via smoke test nyata, bukan cuma compile):**
- `draft.py`: 6× blok penomoran-heading identik (5 branch template_type) → helper `_add_item_heading(doc, idx, title_clean)`.
- `draft.py`: 2× blok tabel logo 2-kolom (narrative vs fallback cover) → helper `_insert_logo_header_table(doc, company_bytes, customer_bytes, space_after_pt=None)`.
- `draft.py`: 3× matematika fit-image (docx/pdf/pptx, beda unit & beda allow-upscale) → helper `_fit_image_dimensions(w_px, h_px, max_w, max_h, allow_upscale=False)` — matematis identik di ketiga tempat (dibuktikan lewat manual derivation sebelum extract, bukan asumsi).
- `llm_provider.py`: `recommend_structure()` di `ClaudeProvider`+`GeminiProvider` masing-masing re-implement fence-stripping JSON manual → reuse `_parse_json_object()` yang udah ada (dipakai `map_items_to_sections`).
- `image_search.py` vs `template_extractor.py`: logic flatten RGBA/P→RGB (buat JPEG encode) diketik ulang identik di 2 file → diekstrak ke modul baru `backend/app/services/image_utils.py` (`flatten_to_rgb()`).
- **Verifikasi khusus:** karena refactor helper docx sempat introduce bug baru (helper baru pakai `Pt`/`RGBColor`/`WD_TABLE_ALIGNMENT` dkk yang di file ini SEMUA di-import lokal per-fungsi, bukan module-level — helper pertama sempat lupa import ini, lolos `py_compile`/`import main` karena keduanya cuma cek syntax, gak nge-run function body), dibikin smoke test yang BENERAN MANGGIL `export_proposal_docx`/`export_proposal_pdf`/`export_proposal_pptx` buat semua `template_type` dengan gambar dummy terlampir, drain `StreamingResponse` via asyncio, dan re-parse hasilnya pakai `python-docx`/`python-pptx`/cek magic bytes PDF. Semua lolos (7 tipe docx, 4 tipe PDF, PPTX).

**Duplikasi/reuse yang dibereskan (frontend, `npx tsc --noEmit` + `npm run build` full 7 route clean):**
- `visual-asset-studio.tsx`: state `currentCaption` + `useEffect` sync-nya dihapus (semua handler yang mutasi caption udah manggil `onUpdateItem` juga — 2 sumber kebenaran buat 1 value). Input caption sekarang baca `item.image_caption` langsung.
- `visual-asset-studio.tsx`: tombol preset "Contoh Hardware" re-implement flow search inline (bukan reuse `handleSearch`, kemungkinan karena `setSearchQuery` async gak langsung ke-baca `handleSearch`) → `handleSearch` sekarang terima param `queryOverride` opsional, preset button tinggal `handleSearch(undefined, preset)`.
- `draft/page.tsx`: `filteredReferenceDocs` & `filteredLibrarySourceDocs` (2 `useMemo` identik, beda query state doang) → fungsi module-level `filterDocsByQuery(docs, query)` dipanggil dari keduanya.

**Yang SENGAJA gak disentuh (dicatat, bukan lupa):** temuan efficiency-angle soal blocking sequential network call (Kroki→mermaid.ink di `diagram_generator.py`, Wikimedia→Bing di `image_search.py`, sampai ~22 detik worst-case di request handler sync) gak difix — butuh konversi ke async/concurrent fetch atau caching yang gak bisa divalidasi tanpa hit endpoint eksternal beneran, dan gak ada test suite buat nangkep regresi. Juga gak nyeragamkan `urllib` (diagram_generator) vs `httpx` (image_search) — stylistic doang, resiko lebih besar dari manfaatnya buat kondisi sekarang.

---

## 📍 STATUS AKTIF (SESI SELESAI / HANDOFF ISTIRAHAT)
- **Status Sesi:** Seluruh background processes (FastAPI port 8000, Next.js dev server port 3000, dan `watchdog.ps1`) telah dihentikan secara aman untuk istirahat user.
- **Branch Aktif:** `feat/proposal-visual-engine` (working tree clean, seluruh commit telah di-push ke `origin/feat/proposal-visual-engine`).
- **Ringkasan Kemajuan Terakhir:**
  1. **Backend Retrieval & Ingestion Quality (Selesai):**
     - Cross-Encoder reranking (`TinyBERT`) aktif untuk top 20-25 hybrid candidates di `retrieval.py`.
     - Reflect-before-generate & query expansion di `POST /draft/item` (`draft.py`) dengan sufficiency evaluation.
     - Table-aware sequential parser di `drive_sync.py` & `draft.py` serta structure-aware chunker tabel Markdown di `embeddings.py`.
  2. **Frontend Draft & Visual Polish (Selesai):**
     - Grounding sufficiency badges, one-click regenerate per sub-bab, transisi skeleton loading halus di `/draft`.
     - Citation drawer interaktif di `/search`, dokumen filter, dan fix export preview.
  3. **Keamanan & Stabilitas (Selesai):**
     - SSRF fix pada `POST /draft/download-image`.
     - Clean compilation pada backend (`py_compile`) dan frontend (`npx tsc --noEmit` & production build 7/7 route).
- **Panduan Menyalakan Kembali Saat Lanjut Kerja:**
  - **Backend:** `cd backend; .\venv\Scripts\python.exe -m uvicorn main:app --port 8000`
  - **Frontend:** `cd frontend; npm run dev`
  - **Watchdog (Opsional):** `powershell -ExecutionPolicy Bypass -File .\watchdog.ps1 -IntervalSeconds 600`

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

### Lanjutan (batch 3) — simplify + animasi, masih di branch `feat/search-citation-drawer`
Murni frontend, gak ada sentuhan backend sama sekali:
- **Konsolidasi `DOC_TYPE_COLORS`:** dulu duplikat persis di `search/page.tsx` dan `citation-drawer.tsx`. Diekstrak ke `components/search/doc-type-colors.ts`, dua-duanya import dari situ.
- **BUG FIX: `animate-in`/`fade-in`/`zoom-in`/`slide-in-from-*`/`fill-mode-both` ternyata dead class selama ini** — `tailwindcss-animate` plugin gak pernah ke-install (`tailwind.config.ts` `plugins: []`), jadi animasi drawer chunk di `/documents` yang udah lama ada (dan animasi baru yang saya tambahin) diam-diam gak pernah render. Fix: `frontend/app/globals.css` sekarang punya implementasi minimal manual (bukan install dependency baru) pakai `--tw-enter-*` CSS vars + satu `@keyframes enter`, cuma nyakup varian yang beneran dipakai di codebase (fade-in, zoom-in, slide-in-from-bottom-1/2, slide-in-from-right, fill-mode-both). Kalau butuh varian baru nanti, tambahin pola yang sama di situ.
- **Anti race-condition di search:** `doSearch()` di `search/page.tsx` sekarang pakai `requestIdRef` counter — kalau user ganti filter cepat-cepat, response request lama yang telat datang gak akan nimpa response yang lebih baru.
- **Retry button** di error banner search (dulu cuma teks merah tanpa aksi).
- **Skeleton loading** ganti spinner polos di list kutipan kiri.
- **Micro-animation:** stagger fade-in kartu kutipan & kartu jawaban AI pas muncul, scale-pop di ikon Copy/Bookmark/Check pas state berubah, pulse highlight di snippet drawer pas dibuka/pindah sitasi.
- Verifikasi: `npx tsc --noEmit` exit 0. CSS custom di `globals.css` belum divisualkan langsung di browser (butuh `npm run dev`) — logikanya straightforward (dua custom property + satu keyframe) tapi worth di-eyeball sekali di browser kalau sempat.

### Lanjutan (batch 4) — a11y + persist filter + copy link + responsive, dikerjakan di worktree terpisah
Murni frontend, `search/page.tsx` dan `citation-drawer.tsx` doang:
- **Accessibility drawer (`citation-drawer.tsx`):** focus trap manual (Tab/Shift+Tab siklus di dalam panel doang selama drawer terbuka — implementasi tangan pakai query `querySelectorAll` elemen focusable, bukan library), fokus otomatis pindah ke tombol Tutup pas drawer kebuka, dan balik ke elemen yang tadinya fokus pas drawer ditutup. Tambah `role="dialog"` `aria-modal="true"` `aria-label`, serta `aria-label` di semua icon-only button (Tutup, Prev, Next) yang sebelumnya cuma ada `title`.
- **Aria-label di `search/page.tsx`:** tombol hapus input (X), hapus item history/bookmark per-chip — sebelumnya icon-only tanpa label sama sekali.
- **Persist filter `docType`/`division`:** disimpan ke `localStorage` (`synapse-search-filters`) tiap kali user ganti filter. Kalau user buka `/search` polos (gak ada `?q=`) di sesi berikutnya, filter terakhir otomatis ke-restore ke dropdown. URL query (`?docType=`/`?division=`) tetap prioritas kalau ada (misal dari link yang di-share) — gak ketimpa localStorage.
- **Copy Link:** tombol baru di kartu jawaban AI, nyalin `window.location.href` (sekarang beneran ngandung `q`+`docType`+`division` karena `router.replace` di `doSearch` diperluas buat include filter, sebelumnya cuma `q`).
- **Responsive `/search`:** panel kiri (list kutipan) yang dulu `w-[420px]` fixed dan bakal kepotong di layar sempit sekarang `flex-col md:flex-row` — mobile: list kutipan di atas (capped `max-h-[45vh]`, scroll sendiri), jawaban AI di bawah; desktop (`md:` ke atas): layout side-by-side seperti semula.
- Verifikasi: `npx tsc --noEmit` exit 0 (dijalankan di worktree `../accelerator-search-wt`). Belum dites manual di browser beneran (responsive breakpoint & focus trap logic-nya lurus tapi worth di-eyeball, terutama Tab-cycling di drawer pake keyboard beneran).

### ✅ RESOLVED: shared working directory antara Claude Code & Antigravity (update dari user)
Masalah `844b882` nyelip di branch search (dicatat di bawah, dibiarkan buat jejak histori) sudah dibereskan user + Antigravity: `844b882` di-cherry-pick bersih ke `main` (`c54b9ed`, sudah di-push), kerjaan Antigravity selanjutnya (Visual Hardware Search, HLD Diagram, PPTX 16:9) dipindah ke branch terpisah `feat/proposal-visual-engine` (dicabangkan dari `main`), dan auto-commit script katanya sudah dimatikan total.
- Saya rebase `feat/search-citation-drawer` ke `main` — `git rebase main` otomatis SKIP `844b882` (patch-id sudah match `c54b9ed`), history jadi bersih murni kerjaan search. Force-push ke `origin/feat/search-citation-drawer` (dikonfirmasi user dulu sebelum force-push).
- **Tapi:** setelah itu, working directory ini masih ke-checkout paksa ke `feat/proposal-visual-engine` 2x lagi di tengah sesi saya (bukan cuma sekali, bukan cuma sebelum auto-commit dimatikan) — file yang lagi saya edit (`search/page.tsx`, `citation-drawer.tsx`, dll) mendadak balik ke versi lama tiap kejadian. Jadi entah auto-commit-nya belum 100% mati, atau ada proses/tooling lain (dev script, IDE agent Antigravity manual checkout) yang masih switch branch di direktori bersama ini. **Belum ketauan root cause pastinya** — kalau kejadian lagi, ini clue-nya.
- **Workaround yang saya pakai:** bikin git worktree terpisah (`../accelerator-search-wt`, branch sementara `feat/search-citation-drawer-wip` dari tip `feat/search-citation-drawer`) khusus buat kerjaan saya, biar checkout branch di direktori utama gak lagi ganggu file yang lagi saya edit. Kerjaan batch 4 di bawah dikerjain di worktree ini lalu di-merge fast-forward balik ke `feat/search-citation-drawer` via `git push` dari worktree tsb (dan worktree-nya dibuang setelah selesai). Kalau agent Antigravity/user mau setup serupa biar gak saling ganggu, ini pola yang kepake.

---

## 🗂️ PROJECT OVERVIEW

**Nama:** Synapse Knowledge Accelerator
**Repo:** https://github.com/augustgerry/accelerator
**Stack:** FastAPI (Python) backend + Next.js (TypeScript) frontend
**Database:** PostgreSQL + pgvector (Supabase)
**LLM:** Claude (Anthropic) atau Gemini (Google) — configurable via `.env`

**Tujuan Produk:**
Platform presales internal untuk tim Solution Architect di PT Smartnet Magna Global (SMG) agar bisa:
1. **Search internal** — Glean-style: cari di arsip proposal/checklist dengan AI synthesis + sitasi
2. **Draft Tender (Loopio-style)** — Upload TOR/RFP, AI pecah jadi checklist klausul, susun draf per butir, ekspor ke Word
3. **Generator Proposal dari Template** — User upload template Word (.docx), AI ikuti struktur & font template, isi otomatis dari draft yang sudah dibuat (termasuk alignment dengan standar proposal CSUL dan enterprise tender lainnya).

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
- Branch: `feat/proposal-visual-engine` (incorporates `feat/search-citation-drawer`)
- Commit Terakhir: `c35f628` (*"merge: integrate feat/search-citation-drawer (interactive citation drawer, focus trap, document filters) with feat/proposal-visual-engine"*)
- Status: **Up to date dengan origin/feat/proposal-visual-engine (GitHub). Working tree CLEAN.**
- Semua perubahan kode backend dan frontend telah diuji dan ter-push ke GitHub repo https://github.com/augustgerry/accelerator.
- `LLM_PROVIDER=gemini` di `.env` (Google API key aktif, model: `gemini-3.6-flash`).

> 💡 **PETUNJUK UNTUK AGENT BERIKUTNYA (Antigravity atau lainnya):**
> 1. Kode sudah 100% tersinkronisasi di GitHub dan lokal pada branch `feat/proposal-visual-engine`.
> 2. Backend: `cd backend && ./venv/Scripts/python.exe -m uvicorn main:app --port 8000` (JANGAN pakai `venv/Scripts/uvicorn.exe` langsung).
> 3. Frontend berjalan di port 3000 (`npm run dev` di folder `frontend/`).
> 4. Seluruh fitur search citation drawer, keyboard a11y, format otentik CSUL/MoM/SoW/Klarifikasi Teknis, dan template engine sudah bersatu di branch ini.

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

## 🎨 SESI ANTIGRAVITY: PROPOSAL VISUAL ENGINE & CSUL FORMAT ALIGNMENT (16 Sep 2026)

### 1. Koreksi Nama Perusahaan Global
- Nama resmi: **PT Smartnet Magna Global (SMG)**.
- Diperbarui di seluruh backend (`draft.py`, `diagram_generator.py`, prompt `llm_provider.py`) dan frontend (`export-modal.tsx`, `settings/page.tsx`, `sidebar.tsx`, `page.tsx`, `api.ts`).

### 2. Eliminasi Kebocoran Markdown (Zero Markdown Leakage)
- Dibuat parser `render_markdown_to_docx(doc, markdown_text)` di `backend/app/routers/draft.py`.
- Menghilangkan seluruh simbol `###`, `**`, dan `|---|` dari hasil export:
  - Heading `###` diubah menjadi native docx headings dengan hierarki warna `#4A86E8` dan `#1F497D`.
  - Tabel markdown `|---|` diubah menjadi native Word Table bergaris rapi dengan header biru `#4A86E8` dan baris belang (zebra shading `#F8FAFC`).
  - Bullet point `- ` diubah menjadi paragraf native `List Bullet`.
  - Inline bold `**...**` dan italic `*...*` diubah menjadi runs berformat.

### 3. Hierarki Sub-Bab Resmi CSUL
- `SKELETONS.narrative` dan `export_proposal_docx` diselaraskan dengan struktur proposal asli:
  - 1. Latar Belakang & Analisis Kebutuhan
  - 2. Tujuan & Sasaran Implementasi
  - 3. Proposed Solution & Arsitektur Solusi
    - 3.1 Solution Overview & Rekomendasi Hardware
    - 3.2 Proposed High Level Design (HLD) & Topologi Sistem
  - 4. Compliance Matrix Spesifikasi Teknis
  - 5. Implementation Plan, Scope of Work & Deliverables
  - 6. Maintenance Plan (PM/CM) & Service Level Agreement (SLA)
  - 7. Penutup, Tim Tenaga Ahli & Profil PT Smartnet Magna Global

### 4. Layout Cover & Document Release CSUL
- Cover Proposal Teknis dengan 2 tabel resmi:
  - Table 0: Prepared by `PT. Smartnet Magna Global` (kiri) | Prepared for `[Customer Name]` (kanan), borderless.
  - Heading 1: `Document Release` dengan Table 1 (Version, Date Release, Change Information, Related Page, Change) ber-header `#4A86E8`.
  - Font default standar: `Google Sans`.

### 5. Otomasi Lampiran Visual Hardware & Diagram HLD
- Di endpoint `POST /draft/item` (`draft_item`):
  - Terdeteksi otomatis kata kunci hardware (Server DL360, Storage All-Flash, Switch, Firewall): langsung mencari gambar publik via `search_public_images` dan melampirkan `image_data_url` serta caption `Gambar: ...`.
  - Terdeteksi otomatis kata kunci HLD/topologi/arsitektur: langsung memanggil `generate_hld_mermaid` dan me-render PNG diagram via Kroki engine.
  - Gambar langsung tersemat di item draf dan diekspor otomatis ke file `.docx`.

### 6. Harmonisasi Alur Export Modal
- Step 1 ("Format & Generate") menampilkan banner konfirmasi standar Proposal Teknis CSUL PT Smartnet Magna Global, dengan tombol quick-action ke Step 2 ("Ikuti Gaya File Lain") untuk mengkloning langsung file acuan yang diunggah.
- Memperbaiki pemanggilan fungsi `handlePickLibraryTemplate` saat user memilih kloning langsung acuan template.

### 7. Halaman Pengakuan Kerahasiaan (NDA) & Running Header/Footer CSUL (Poin 2)
- Di `backend/app/routers/draft.py` (`export_proposal_docx`):
  - **Running Header** di halaman 2+: `PT. Smartnet Magna Global · Proposal Teknis` (rata kanan, warna `#9CA3AF`, ukuran 8.5pt).
  - **Running Footer** di halaman 2+: `CONFIDENTIAL · Dokumen Rahasia PT Smartnet Magna Global  |  Halaman ` dengan nomor halaman dinamis via OpenXML native field (`w:fldChar` / `w:instrText PAGE`).
  - Halaman cover (halaman 1) tetap bersih tanpa header & footer (`different_first_page_header_footer = True`).
  - **Halaman Pengakuan Kerahasiaan** disisipkan otomatis tepat setelah Table 1 Document Release dengan Heading 1 `Pengakuan Kerahasiaan` dan klausul formal non-disclosure bertanda tangan PT Smartnet Magna Global, diikuti page break rapi menuju Bab 1.

### 8. Inline Visual Preview & Action Card di Draft Workspace (Poin 1)
- Di `frontend/app/draft/page.tsx` & `frontend/components/draft/visual-asset-studio.tsx`:
  - Di bawah editor respons draf, terpasang **Inline Visual Preview & Action Card**:
    - Saat bab memiliki gambar/HLD: menampilkan thumbnail perangkat dengan efek zoom hover, badge *Siap Ekspor ke Word & PPTX*, field input keterangan gambar (caption) langsung dengan auto-sync, serta action bar ringkas (`[🔄 Ganti Foto]`, `[📐 Edit HLD]`, `[👁️ Perbesar]`, `[🗑️ Hapus]`).
    - Saat bab belum memiliki gambar: menampilkan banner ajakan visual elegan (`[🔍 Cari Foto Publik]`, `[✨ Buat Topologi HLD]`, `[📁 Upload]`) yang langsung membuka Visual Asset Studio sesuai tab yang dipilih.
    - **Modal Lightbox Resolusi Penuh**: Klik pada thumbnail membuka modal pratinjau full-screen dengan resolusi asli dan tombol unduh aset.
  - Penambahan prop `initialTab` pada `VisualAssetStudio` untuk integrasi mulus dengan tombol aksi inline.

### 9. Standardisasi Tabel Enterprise & Deteksi Hierarki Sub-Sub Bab di DOCX
- Di `backend/app/routers/draft.py` (`render_markdown_to_docx`):
  - **Tabel Standar CSUL**: Border atas `#D1D5DB`, border bawah aksen biru `#4A86E8`, garis dalam halus `#E5E7EB`, tanpa garis vertikal kaku (gaya modern executive Word). Dilengkapi `tblHeader` agar header berulang otomatis jika tabel terpotong ke halaman baru, serta distribusi lebar kolom otomatis berjarak total 6.5 inci.
  - **Sub-Sub Bab Otomatis**: Mendeteksi pola nomor bertingkat seperti `2.1.1` atau `3.2.1` dan otomatis mengubahnya menjadi Heading 3/4 Word native warna `#1F497D` dengan `keep_with_next = True`.

### 10. Modernisasi Kosmetik Slide Deck PPTX Executive
- Di `backend/app/routers/draft.py` (`export_proposal_pptx`):
  - **Slide Cover & Penutup Dark Executive**: Background Slate 900 (`#0F172A`) dengan garis aksen atas `#4A86E8`, tipografi kontras tinggi (judul putih 36pt/44pt, badge amber `#F59E0B`, subtitle biru muda `#60A5FA`).
  - **Slide Konten**: Dilengkapi top corporate stripe (`#2F5FE0`), running footer di bawah (`PT Smartnet Magna Global · Dokumen Proposal Teknis & Arsitektur Solusi`), serta nomor slide `Slide X / Y`.

### 11. Halaman Daftar Isi, Daftar Gambar & Daftar Tabel Otomatis (CSUL Style)
- Di `backend/app/routers/draft.py` (`export_proposal_docx`):
  - **Daftar Isi**: Dihasilkan otomatis tepat setelah halaman *Pengakuan Kerahasiaan* dengan dot leader tab stops (`WD_TAB_LEADER.DOTS`) rata kanan pada 6.5 inci, membedakan bab utama (bold 10pt `#111827`) dan sub-bab (indent 0.25 inci, 9.5pt `#374151`).
  - **Daftar Gambar**: Menginventarisasi otomatis seluruh foto hardware publik & diagram topologi HLD yang tersemat pada proposal lengkap dengan nomor urut dan caption formal.
  - **Daftar Tabel**: Menginventarisasi otomatis Tabel 1 Document Release dan tabel-tabel compliance matrix teknis pada dokumen.
  - Diikuti page break formal menuju Bab 1.

---

*Branch aktif: `feat/proposal-visual-engine`*
*Branch Claude (`feat/search-citation-drawer`) tetap terisolasi dan tidak tersentuh (Claude menggunakan git worktree terpisah).*



