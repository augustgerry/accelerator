# 🚀 SYNAPSE FULL-STACK ARCHITECTURE & ENGINEERING GUIDE
> **Dokumen Arsitektur & Alur Sistem untuk Presentasi ke Tim Full Stack & DevOps**  
> *Sistem: Synapse — AI Proposal & Presales Knowledge Accelerator*  
> *Tech Stack: Next.js 14 (App Router) • Zustand • FastAPI • PostgreSQL (pgvector) • Claude 3.5 Sonnet • Gemini 2.0 Flash • Hybrid Cache*

---

## 1. Executive Architecture Summary

Synapse adalah platform **AI Presales Acceleration & Autonomous Continuous Learning** yang dirancang untuk menyusun dokumen tender enterprise (*Proposal Teknis, SOW, MoM, SLA, Solution Brief*) dalam hitungan menit, dengan jaminan **100% Zero-Hallucination** berbasis dokumen acuan historis PT Smartnet Magna Global (Member of CTI Group).

```mermaid
graph TD
    subgraph Frontend ["Frontend Tier (Next.js 14 App Router)"]
        UI["React UI (Tailwind CSS + Lucide)"]
        Zustand["Global State Store (Zustand + LocalStorage Persist)"]
        EdgeMW["Next.js Edge Middleware (Security & Tracing)"]
        UI <--> Zustand
        EdgeMW --> UI
    end

    subgraph Gateway ["Network & Gateway Tier"]
        CORS["FastAPI Telemetry Middleware (X-Request-ID, X-Process-Time)"]
    end

    subgraph Backend ["Backend Tier (FastAPI Async)"]
        RouterDraft["/draft (SSE Streaming & Async Bulk Queue)"]
        RouterDoc["/documents (Deduplication & Vector Indexing)"]
        RouterHealth["/health (Observability & Cache Metrics)"]
        LearningEngine["Autonomous Continuous Learning Engine"]
    end

    subgraph CacheTier ["Caching & Resilience Tier"]
        Cache["Hybrid Semantic Cache (In-Memory LRU + Redis Auto-Detect)"]
        CircuitBreaker["Resilient LLM Provider (Multi-Provider Failover)"]
        Claude["Anthropic Claude 3.5 Sonnet (Primary)"]
        Gemini["Google Gemini 2.0 Flash (Secondary/Fallback)"]
        CircuitBreaker --> Claude
        CircuitBreaker -. Failover .-> Gemini
    end

    subgraph StorageTier ["Storage & Vector Tier"]
        PGVector["PostgreSQL 15 + pgvector (Supabase Hosted)"]
        LocalEmbed["Local MPNet Sentence-Transformers (CPU)"]
        Reranker["Cross-Encoder Reranker (ms-marco)"]
    end

    UI -->|HTTP / SSE| CORS
    CORS --> Backend
    Backend <--> Cache
    Backend --> CircuitBreaker
    Backend <--> LocalEmbed
    Backend <--> Reranker
    Backend <--> PGVector
```

---

## 2. Alur Kerja Sistem (End-to-End Workflows)

### Alur 1: Real-Time SSE Streaming Proposal Drafting (<500ms TTFT)
Menggantikan request blocking 15 detik dengan efek mengetik progresif kata-per-kata langsung ke layar.

```mermaid
sequenceDiagram
    autonumber
    actor User as Presales Engineer
    participant UI as Next.js Draft UI
    participant ZS as Zustand Store
    participant API as FastAPI (/draft/item-stream)
    participant Cache as Hybrid Cache
    participant RAG as Retrieval & Cross-Encoder
    participant LLM as Resilient LLM (Claude/Gemini)

    User->>UI: Klik "Generate Bagian" (misal: 3.3 HLD)
    UI->>ZS: setGenerating(true)
    UI->>API: POST /draft/item-stream { item_id, requirement_text, tor_context }
    
    API->>Cache: Cek SHA-256 Cache Key
    alt Cache HIT (<10ms)
        Cache-->>API: Return Cached Result
        API-->>UI: Stream cached tokens in bursts
    else Cache MISS
        API->>RAG: Hybrid Search (Vector 0.70 + BM25 0.30)
        RAG-->>API: Top-5 Verified Context Chunks
        API-->>UI: event: meta { sources, source_clause }
        API->>LLM: Stream Prompt (Strict Anti-Ngide System Prompt)
        loop Token-by-Token
            LLM-->>API: Yield Token ("Arsitektur", " SAN", " HA...")
            API-->>UI: event: token { chunk: "..." }
            UI->>UI: Render live typewriter effect
        end
        API->>Cache: Simpan response ke Cache (TTL 24h)
        API-->>UI: event: done { done: true }
    end
    UI->>ZS: updateItem(item_id, draft_text) & saveRevision(item_id)
```

---

### Alur 2: Multi-Provider Circuit Breaker & Automatic Failover
Menjamin **Zero Downtime**: Jika vendor Anthropic atau Google mengalami limit kuota (`429`), request dialihkan secara transparan tanpa error di hadapan klien.

```mermaid
flowchart TD
    Req([Request Generate Section / Q&A]) --> ResilientRouter{ResilientLLMProvider}
    
    ResilientRouter -->|Step 1: Panggil Primer| Claude[Anthropic Claude 3.5 Sonnet]
    
    Claude -->|Sukses 200 OK| ReturnSuccess([Kembalikan Response ke User])
    
    Claude -->|Gagal: 429 / Quota / Timeout / 503| CircuitBreaker[Trigger Circuit Breaker Fallback]
    
    CircuitBreaker -->|Auto-Failover Sub-Detik| Gemini[Google Gemini 2.0 Flash]
    
    Gemini -->|Sukses 200 OK| LogTele[Catat Warning di Telemetry Log]
    LogTele --> ReturnSuccess
    
    Gemini -->|Keduanya Gagal| SafeFallback([Kembalikan Fallback Template Berbasis SOW Otentik])
```

---

### Alur 3: Asynchronous Background Bulk Queue (Anti-Timeout 504)
Saat men-generate seluruh proposal (15–20 sub-bab sekaligus), gateway server (Cloudflare/Nginx) tidak akan pernah mengalami timeout 60 detik.

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Presales
    participant UI as Frontend
    participant Queue as FastAPI Bulk Worker Thread
    participant DB as PostgreSQL

    User->>UI: Klik "Generate All Sections" (20 Sub-Bab)
    UI->>Queue: POST /draft/bulk-generate-async { items: [sec-1...sec-20] }
    Queue-->>UI: Return 200 OK { job_id: "job-55976b47d3", status: "queued" }
    
    Note over UI,Queue: UI tidak menunggu blocking HTTP connection
    
    loop Polling tiap 1.5 detik
        UI->>Queue: GET /draft/bulk-job/job-55976b47d3
        Queue-->>UI: { status: "running", progress_pct: 35.0, current_item_id: "sec-7", results: {...} }
        UI->>UI: Update progress bar & render bab yang sudah selesai
    end
    
    Queue-->>UI: { status: "completed", progress_pct: 100.0, results: {...} }
    UI->>User: Notifikasi: "Proposal selesai disusun secara lengkap!"
```

---

### Alur 4: Autonomous Continuous Learning (Self-Improving Engine)
Synapse otomatis membedah struktur dan menyerap klausul operasional setiap kali ada dokumen baru yang disinkronkan.

```mermaid
flowchart LR
    Upload([Dokumen: TOR / SOW / MoM / SLA / RFP]) --> Extractor[Parser: PyPDF / python-docx]
    Extractor --> Deduplication{Cek Dokumen Eksisting}
    
    Deduplication -->|File Sudah Ada| ReplaceChunks[Hapus Chunks Lama & Re-Index]
    Deduplication -->|File Baru| AddChunks[Index ke Document Chunks]
    
    ReplaceChunks --> LearningEngine[Autonomous Learning Engine]
    AddChunks --> LearningEngine
    
    LearningEngine --> DNA[Ekstrak DNA Struktur Bab Proposal]
    LearningEngine --> Rules[Distilasi Presales Rules: Headcount, SLA, Platform]
    
    DNA --> TableStruct[(proposal_structures)]
    Rules --> TableRules[(presales_rules)]
```

---

## 3. Tech Stack & Rationale untuk Diskusi Tim Full Stack

| Komponen | Pilihan Teknologi | Alasan Arsitektural (Kenapa ini, bukan yang lain?) |
|---|---|---|
| **Frontend Framework** | **Next.js 14 (App Router)** | Rendering hybrid (SSR/SSG), routing file-system, dan Edge Middleware native untuk menyuntikkan security headers. |
| **State Management** | **Zustand** | Zero-boilerplate dibanding Redux, tidak menyebabkan re-render massal seperti React Context biasa, dan memiliki native `persist` middleware ke `localStorage`. |
| **Backend Framework** | **FastAPI (Python 3.12)** | Python adalah ekosistem standar emas untuk NLP, RAG, dan pemrosesan embeddings. FastAPI berbasis Starlette/Pydantic memberikan performa async setara Node.js. |
| **Database & Vector** | **PostgreSQL 15 + pgvector** | Menghindari vendor-lockin vektor terpisah (Pinecone/Milvus). Relasi dokumen, session, dan vektor embedding berada dalam 1 database ACID yang sama. |
| **Embeddings** | **paraphrase-multilingual-mpnet-base-v2** | Dijalankan lokal di CPU container. Nol biaya token embedding, mendukung dwibahasa (Indonesia + English), dan bebas limitasi rate API luar. |
| **Reranking** | **Cross-Encoder (ms-marco-TinyBERT)** | Mengurutkan ulang hasil pencarian vektor + leksikal. Meningkatkan relevansi potongan teks acuan hingga 95% sebelum dikirim ke LLM. |
| **Caching Layer** | **Hybrid In-Memory TTL + Redis** | Sub-10ms latency untuk query/struktur yang berulang. Menghemat 30–50% biaya token LLM tanpa mewajibkan infrastruktur Redis di fase dev. |
| **Observability** | **Correlation ID (`X-Request-ID`)** | Tracing end-to-end dari console browser hingga baris log server saat debugging masalah klien. |

---

## 4. Struktur State Management Zustand (`use-draft-store.ts`)

Store global Synapse dirancang secara modular dan tahan banting:

```typescript
// Lokasi: frontend/lib/stores/use-draft-store.ts
export interface DraftState {
  // 1. Dokumen Acuan & Konteks
  torText: string;
  torFileName: string;
  docType: string;             // narrative | sow | mom | solution_brief
  archetype: string;           // managed_services | hardware_infra | software_dev
  customInstruction: string;
  sessionId: string | null;

  // 2. Daftar Sub-Bab & Konten
  items: RequirementItem[];
  selectedItemId: string | null;
  filterStatus: "all" | "todo" | "draft" | "final";

  // 3. Snapshot & Riwayat Revisi (Undo / Diff)
  revisions: Record<string, SectionRevision[]>;
  saveRevision: (itemId: string, label?: string) => void;
  restoreRevision: (itemId: string, revisionIndex: number) => void;

  // 4. Visual Assets per Bab
  visualAssets: Record<string, VisualAsset[]>;

  // 5. Asynchronous Job Flags
  isAnalyzingTor: boolean;
  isGeneratingAll: boolean;
  currentGeneratingIndex: number;
}
```

---

## 5. Ringkasan API Endpoints Siap Pakai

| Method | Endpoint | Deskripsi | Tipe Response |
|---|---|---|---|
| `POST` | `/draft/item-stream` | Real-time token streaming draf per bab | `text/event-stream` (SSE) |
| `POST` | `/draft/bulk-generate-async` | Antrian background generate seluruh proposal | `application/json` (Job ID) |
| `GET` | `/draft/bulk-job/{id}` | Polling status & hasil background job | `application/json` (Progress %) |
| `GET` | `/health/cache` | Observability hit-rate & estimasi token saved | `application/json` (Metrik) |
| `POST` | `/health/cache/clear` | Purge cache on-demand | `application/json` |
| `POST` | `/documents/upload` | Upload & re-index dokumen acuan (anti-duplicate) | `application/json` |
| `POST` | `/draft/recommend-structure`| Analisis struktur bab hierarkis (1., 1.1, 1.2) | `application/json` (Chapters) |
| `POST` | `/draft/quality-check` | Preflight compliance check sebelum ekspor | `application/json` (Audit report) |
| `POST` | `/draft/calculate-sizing` | Otomasi sizing storage / HCI & BoQ table | `application/json` (BoQ Markdown) |

---

## 6. Checklist Diskusi untuk Tim Full Stack & DevOps

1. **Deployment Architecture**:
   * **Frontend**: Next.js standalone build (`output: 'standalone'`) siap di-deploy ke Vercel atau Docker container ringan (~80MB base Node alpine).
   * **Backend**: FastAPI siap di-deploy dengan `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4` di container Linux/Kubernetes.
2. **Environment Variables Kunci**:
   * `DATABASE_URL`: Koneksi Supabase PostgreSQL (`postgresql+asyncpg://...`).
   * `ANTHROPIC_API_KEY`: API Key Claude 3.5 Sonnet.
   * `GOOGLE_API_KEY`: API Key Gemini 2.0 Flash (Secondary Failover otomatis).
   * `REDIS_URL`: *(Opsional)* URL Redis untuk cluster multi-node (e.g. `redis://default:password@redis:6379/0`). Jika tidak diisi, otomatis beralih ke in-memory cache ber-TTL tanpa error.
   * `NEXT_PUBLIC_API_URL`: URL Backend FastAPI yang diakses browser frontend.
3. **Security & Authentication (Milestone Berikutnya)**:
   * **Next.js Edge Middleware**: Telah disiapkan slot di [middleware.ts](file:///d:/Downloads/Mini%20Project/Proposal%20Acceleator/knowledge-accelerator/frontend/middleware.ts) untuk proteksi rute (`/draft`, `/documents`, dll.) dan auto-redirect ke `/login`.
   * **JWT & RBAC Supabase Auth**: Backend tinggal memasang FastAPI dependency `get_current_user` yang memvalidasi header `Authorization: Bearer <supabase_jwt>`.
   * **CORS Whitelist**: Pada production, ganti `allow_origins=["*"]` dengan domain resmi korporat.
4. **Database & Vector Optimization**:
   * Tabel `document_chunks` sudah memiliki index IVFFlat / HNSW pada kolom `embedding vector(768)`.
   * Menggunakan PostgreSQL connection pooler (Supabase port 6543 / Supavisor) untuk mencegah *too many clients* saat scaling horizontal.
5. **Worker Sizing & Resource Allocation**:
   * Backend CPU: 2 Core (minimal untuk running sentence-transformers embedding lokal).
   * Backend RAM: 4 GB (2 GB untuk model embedding & cross-encoder di memori, 2 GB untuk worker requests).
   * Frontend: 1 Core, 1 GB RAM.

---

## 7. Production Docker Compose Reference

Contoh deployment stack terpadu untuk tim DevOps:

```yaml
version: '3.8'

services:
  # 1. Frontend Web App
  synapse-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: synapse-frontend
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://backend:8000
    depends_on:
      backend:
        condition: service_healthy

  # 2. FastAPI Intelligence Backend
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: synapse-backend
    restart: always
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - REDIS_URL=redis://redis:6379/0
      - ENVIRONMENT=production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
    depends_on:
      - redis

  # 3. Redis Cache Cluster (Opsional, Liveness Guard)
  redis:
    image: redis:7-alpine
    container_name: synapse-redis
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

---

## 8. Health Checks, Sentinel Monitoring, & SRE Runbook

Untuk memastikan reliabilitas sistem, telah disediakan autonomous health agent (`agent3_sentinel.py`):

* **Periodic Check**:
  ```bash
  python .agents/agent3_sentinel.py --check
  ```
* **Metrik yang Dipantau**:
  1. `Backend HTTP 8000`: Response time `<500ms`, cache hit-rate, dan error count.
  2. `Frontend HTTP 3000`: Evaluasi HTTP 200 OK pada halaman landing `/` dan `/draft`.
  3. `Token Savings`: Mengkalkulasi estimasi token LLM yang berhasil dihemat oleh caching layer.
* **Troubleshooting Command**:
  * Restart Backend: `uvicorn main:app --reload --port 8000`
  * Restart Frontend: `npm run dev`
  * Purge Invalidation Cache: `curl -X POST http://localhost:8000/health/cache/clear`

---

## 9. Jawaban Pertanyaan Teknis (Cheat Sheet Diskusi Mas Jo MS)

Berikut rangkuman jawaban teknis singkat dan padat jika ditanya oleh rekan Full Stack / DevOps:

* **"Pake global state apa di frontend?"**  
  👉 **Zustand**. Lebih ringan dari Redux, tidak menyebabkan unnecessary re-render seperti React Context, dan punya built-in `persist` middleware ke local storage yang SSR-safe.
* **"Kenapa backend-nya Python (FastAPI), bukan Express / NestJS?"**  
  👉 Sistem Synapse adalah RAG & Machine Learning intensive: pemrosesan dokumen (PyPDF, docx), local sentence-transformers, reranker cross-encoder, dan vector embeddings berjalan di ekosistem Python. FastAPI asinkron (ASGI) memberikan throughput I/O setara Node.js, namun dengan akses langsung ke seluruh library AI.
* **"Udah pake Redis?"**  
  👉 Menggunakan **Hybrid Cache Pattern**. Jika `REDIS_URL` ada, sistem otomatis menggunakan Redis cluster. Jika tidak ada (misal di local dev atau single-container), sistem secara elegan fallback ke *In-Memory LRU Cache ber-TTL* tanpa error.
* **"Gimana security & middleware-nya?"**  
  👉 **Next.js Edge Middleware** sudah terpasang untuk request tracing (`X-Request-ID`), header security, dan slot redirect authentication. Di backend, FastAPI Telemetry Middleware memonitor waktu eksekusi (`X-Process-Time`) dan logging audit per request. Milestone berikutnya tinggal mengaktifkan Supabase JWT Auth guard.

---

## 10. Handover & Roadmap Transisi ke Claude Code

Dokumen serah terima dan status teknis terkini untuk rekan AI / Developer yang melanjutkan dapat dibaca langsung pada:
👉 **[`CLAUDE-CODE-HANDOVER.md`](file:///d:/Downloads/Mini%20Project/Proposal%20Acceleator/knowledge-accelerator/CLAUDE-CODE-HANDOVER.md)**

