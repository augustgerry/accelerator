import type { DraftDocTypeId } from "@/lib/document-types";

// Default outline per output document type. Each entry becomes one generated
// section instead of an atomic TOR clause — the unit users actually paste into
// the final document. `description` is the generation brief sent to the LLM.
export type SkeletonSection = {
  id: string;
  title: string;
  category: string;
  description: string;
};

export const SKELETONS: Record<DraftDocTypeId, SkeletonSection[]> = {
  narrative: [
    { id: "sec-1-latar-belakang", title: "1. Latar Belakang & Analisis Kebutuhan", category: "Umum", description: "Latar belakang pengadaan, kondisi existing infrastruktur klien, analisis kebutuhan peningkatan performa sistem, serta urgensi modernisasi perangkat." },
    { id: "sec-2-tujuan", title: "2. Tujuan & Sasaran Implementasi", category: "Umum", description: "Tujuan strategis dan sasaran teknis yang ingin dicapai melalui modernisasi infrastruktur yang diusulkan." },
    { id: "sec-3-solution-overview", title: "3. Proposed Solution & Arsitektur Solusi", category: "Teknis", description: "Gambaran umum solusi yang ditawarkan oleh PT Smartnet Magna Global, arsitektur High Level Design (HLD), sizing kapasitas, dan spesifikasi detail hardware." },
    { id: "sec-3-1-solution-overview", title: "3.1 Solution Overview & Rekomendasi Hardware", category: "Teknis", description: "Rincian usulan perangkat keras enterprise (Server DL360 / Storage All-Flash / Network Switch), konfigurasi redundant controller, CPU, RAM, dan storage." },
    { id: "sec-3-2-hld", title: "3.2 Proposed High Level Design (HLD) & Topologi Sistem", category: "Teknis", description: "Diagram arsitektur topologi sistem (HLD), konektivitas jaringan SAN/LAN, interkoneksi cluster, dan proteksi redundansi." },
    { id: "sec-4-compliance", title: "4. Compliance Matrix Spesifikasi Teknis", category: "Teknis", description: "Tabel matriks kepatuhan spesifikasi teknis terhadap butir kebutuhan TOR (Comply / Not Comply / Exceed) beserta rincian komitmen pemenuhan teknis SMG." },
    { id: "sec-5-implementation", title: "5. Implementation Plan, Scope of Work & Deliverables", category: "Manajemen Proyek", description: "Rencana implementasi, tahapan pelaksanaan (delivery, instalasi, konfigurasi, migrasi data), batasan ruang lingkup (in scope & out of scope), deliverables, dan prosedur UAT." },
    { id: "sec-6-maintenance", title: "6. Maintenance Plan (PM/CM) & Service Level Agreement (SLA)", category: "SLA & Support", description: "Layanan purnajual pemeliharaan berkala Preventive Maintenance (PM), penanganan gangguan Corrective Maintenance (CM), komitmen SLA response time 24x7, dan dukungan prinsipal." },
    { id: "sec-7-penutup", title: "7. Penutup, Tim Tenaga Ahli & Profil PT Smartnet Magna Global", category: "Administrasi & Legal", description: "Kesimpulan proposal, struktur tim tenaga ahli bersertifikasi, rekam jejak pengalaman PT Smartnet Magna Global, dan surat dukungan prinsipal resmi." },
  ],
  sow: [
    { id: "sec-sow-latar-belakang", title: "1. Latar Belakang & Deskripsi Pekerjaan", category: "Umum", description: "Latar belakang proyek, tujuan pelaksanaan pekerjaan, dasar penugasan, dan ringkasan cakupan layanan oleh PT Smartnet Magna Global." },
    { id: "sec-sow-ruang-lingkup", title: "2. Ruang Lingkup Pengerjaan & Layanan Teknis", category: "Teknis", description: "Rincian ruang lingkup pekerjaan teknis mencakup persiapan, delivery perangkat, instalasi hardware/software, konfigurasi sistem, migrasi, dan pengujian menyeluruh (onsite/remote)." },
    { id: "sec-sow-scope-matrix", title: "3. Matriks Pembagian Peran & Tanggung Jawab (RACI)", category: "Manajemen Proyek", description: "Tabel matriks pembagian tanggung jawab yang jelas antara PT Smartnet Magna Global (SMG) dan pihak Klien, mencakup penyediaan infrastruktur pendukung, izin akses data center, serta koordinasi teknis." },
    { id: "sec-sow-out-scope", title: "4. Batasan & Pengecualian Pekerjaan (Out of Scope)", category: "Administrasi & Legal", description: "Daftar pekerjaan yang secara tegas dikecualikan dari cakupan proyek (misal: penyediaan lisensi pihak ketiga non-scope, modifikasi kode aplikasi existing, perbaikan fasilitas fisik di luar perangkat terkait)." },
    { id: "sec-sow-deliverables", title: "5. Deliverables Proyek, Milestones & Timeline Pengerjaan", category: "Manajemen Proyek", description: "Daftar keluaran resmi (deliverables) seperti Dokumen Arsitektur (HLD/LLD), Berita Acara Instalasi, Hasil UAT, Laporan As-Built, materi transfer knowledge, dan estimasi durasi mandays pengerjaan." },
    { id: "sec-sow-sla", title: "6. Service Level Agreement (SLA), Dukungan 24x7 & Prosedur Eskalasi", category: "SLA & Support", description: "Komitmen tingkat layanan penanganan gangguan (P1 Critical 30 menit respons & 4 jam onsite, P2 Major 60 menit, P3 Minor, P4 Info), hotline dukungan 24x7x365, serta matriks eskalasi teknis." },
    { id: "sec-sow-acceptance", title: "7. Kriteria Penerimaan Pekerjaan (UAT & BAST)", category: "Manajemen Proyek", description: "Kriteria pengujian penerimaan sistem (User Acceptance Testing) dan tata cara penandatanganan Berita Acara Serah Terima (BAST)." },
    { id: "sec-sow-terms", title: "8. Syarat & Ketentuan Umum serta Change Request (CR)", category: "Administrasi & Legal", description: "Ketentuan operasional, tata cara perubahan ruang lingkup (Change Request), garansi pengerjaan, dan kerahasiaan data (NDA)." },
  ],
  solution_brief: [
    { id: "sec-sb-executive-summary", title: "1. Executive Summary & Value Proposition", category: "Umum", description: "Ringkasan eksekutif tingkat tinggi yang menyajikan nilai strategis dan keunggulan solusi yang diusulkan oleh PT Smartnet Magna Global untuk menjawab kebutuhan klien secara efisien." },
    { id: "sec-sb-business-understanding", title: "2. Business Understanding & Customer Pain Points", category: "Umum", description: "Profil latar belakang bisnis klien, tantangan infrastruktur existing (bottleneck performa, skalabilitas, lisensi), serta pemetaan target hasil bisnis (Objectives & Key Results / OKRs)." },
    { id: "sec-sb-scope-timeline", title: "3. Scope of Work & High-Level Timeline", category: "Manajemen Proyek", description: "Ringkasan batasan in-scope dan out-of-scope, serta tabel tahapan implementasi bertahap (Discovery, Foundation Setup, Migration/Deployment, UAT & Go-Live)." },
    { id: "sec-sb-proposed-solution", title: "4. Proposed Solution & Architecture Overview", category: "Teknis", description: "Narasi solusi yang diusulkan, diagram arsitektur High-Level Design (HLD), tabel komponen kunci (teknologi & fungsi), dan analisis pemilihan mode deployment (On-Prem / Cloud / Hybrid)." },
    { id: "sec-sb-integration", title: "5. Integration Points, Dependencies & Regulatory Compliance", category: "Teknis", description: "Titik integrasi dengan sistem existing klien, dependensi jaringan/otentikasi, serta kepatuhan kedaulatan data dan regulasi nasional (OJK / BI)." },
    { id: "sec-sb-security", title: "6. Security, Governance & High Availability", category: "Teknis", description: "Kerangka keamanan solusi: Identity & Access Management (IAM), enkripsi data at-rest & in-transit, isolasi jaringan VPC/firewall, dan redundansi proteksi bencana." },
    { id: "sec-sb-success-criteria", title: "7. Measurable Success Criteria & KPIs", category: "Manajemen Proyek", description: "Kriteria terukur keberhasilan proyek (zero data loss, peningkatan throughput, performa respons, ketersediaan 99.99%, keberhasilan pelatihan tim teknis klien)." },
    { id: "sec-sb-why-smg", title: "8. Why Smartnet Magna Global?", category: "Administrasi & Legal", description: "Nilai pembeda SMG sebagai bagian dari CTI Group: keahlian end-to-end multi-vendor, engineer tersertifikasi prinsipal terkemuka, fasilitas lab pengujian lokal, dan rekam jejak enterprise terpercaya." },
    { id: "sec-sb-next-steps", title: "9. Next Steps & Engagement Model", category: "Manajemen Proyek", description: "Langkah konkrit berikutnya: sesi review teknis bersama, pengajuan proposal komersial formal, dan penandatanganan Statement of Work (SOW)." },
  ],
  mom: [
    { id: "sec-mom-metadata", title: "1. Informasi & Metadata Pertemuan", category: "Umum", description: "Rincian lengkap pelaksanaan rapat: Hari/Tanggal, Waktu/Durasi, Lokasi/Media Meeting (Onsite Ruang Rapat / Google Meet / MS Teams), Agenda Utama, Pemimpin Rapat, dan Notulen dari PT Smartnet Magna Global." },
    { id: "sec-mom-attendees", title: "2. Daftar Hadir Peserta Rapat (Attendees)", category: "Umum", description: "Tabel daftar hadir peserta rapat dari pihak Klien (Stakeholders, Lead Engineer, PM) dan pihak PT Smartnet Magna Global (Account Manager, Solution Architect, Technical Specialist)." },
    { id: "sec-mom-discussions", title: "3. Poin-Poin Utama Pembahasan & Klarifikasi Teknis", category: "Teknis", description: "Catatan mendalam mengenai topik-topik yang dibahas selama pertemuan: klarifikasi arsitektur, kebutuhan fungsional, kendala existing, tinjauan kapasitas, dan opsi rekomendasi teknologi." },
    { id: "sec-mom-decisions", title: "4. Kesepakatan & Keputusan Bersama (Key Decisions)", category: "Umum", description: "Poin-poin kesepakatan final yang telah disetujui bersama oleh seluruh pihak dalam rapat sebagai acuan langkah pengerjaan berikutnya." },
    { id: "sec-mom-action-items", title: "5. Matriks Tindak Lanjut (Action Items Plan)", category: "Manajemen Proyek", description: "Tabel matriks tindak lanjut terstruktur: No, Aktivitas / Action Item, Penanggung Jawab (Owner / PIC SMG atau Klien), Target Tanggal Penyelesaian (Due Date), dan Status Terkini." },
    { id: "sec-mom-signoff", title: "6. Lembar Pengesahan & Tanda Tangan (Sign-off)", category: "Administrasi & Legal", description: "Kolom pengesahan resmi dokumen MoM: Disiapkan oleh Notulen SMG, Diketahui oleh Project Manager / Lead SMG, dan Disetujui oleh Perwakilan Klien." },
  ],
  klarifikasi_teknis: [
    { id: "sec-klarifikasi-latar-belakang", title: "1. Latar Belakang, Kondisi Existing & Hasil Klarifikasi", category: "Umum", description: "Latar belakang pengadaan, profil lingkungan infrastruktur existing klien, analisis risiko End of Life (EOL) & End of Support (EOS), mitigasi risiko downtime, serta adopsi hasil klarifikasi teknis sebagai baseline penawaran resmi." },
    { id: "sec-klarifikasi-solusi-arsitektur", title: "2. Solusi yang Diusulkan, Sizing & Arsitektur (HLD)", category: "Teknis", description: "Gambaran spesifikasi platform perangkat keras enterprise yang diusulkan, teknologi reduksi data inline (Data Reduction Ratio / DRR deduplication & compression), kalkulasi data growth 10%/tahun selama 5 tahun, diagram topologi High Level Design (HLD) multi-fabric redundan, dan posisi Gartner Magic Quadrant." },
    { id: "sec-klarifikasi-compliance-boq", title: "3. Compliance Matrix & Bill of Quantity (BOQ)", category: "Teknis", description: "Tabel matriks kesesuaian teknis lengkap (Comply) terhadap butir persyaratan minimum klien, serta tabel Bill of Quantity (BOQ) perangkat keras dan lisensi perangkat lunak lengkap dengan Part Number, Deskripsi, dan Kuantitas." },
    { id: "sec-klarifikasi-implementasi-timeline", title: "4. Rencana Implementasi, Scope of Work & Timeline", category: "Manajemen Proyek", description: "Ruang lingkup pengerjaan detail (assessment, rack mount, konfigurasi, hardening, integrasi VMware/datastore, pengujian UAT), batasan pekerjaan (Out of Scope), dan jadwal tahapan implementasi bulanan (timeline)." },
    { id: "sec-klarifikasi-sla-support", title: "5. Maintenance Plan & Service Level Agreement (SLA)", category: "SLA & Support", description: "Layanan purnajual komprehensif selama 60 bulan (5 tahun), pemeliharaan berkala Preventive Maintenance (PM) min 2x/tahun, penanganan gangguan Corrective Maintenance (CM), SLA respons teknis lokal 24x7 (maks 4 jam), dan komitmen eskalasi prinsipal Severity 1 (15 menit response time)." },
    { id: "sec-klarifikasi-tim-penutup", title: "6. Susunan Tim Proyek & Profil PT Smartnet Magna Global", category: "Administrasi & Legal", description: "Struktur tim proyek yang ditugaskan (Project Manager bersertifikasi dan tim Technical Engineer berpengalaman puluhan tahun), rekam jejak sertifikasi prinsipal, serta profil keunggulan PT Smartnet Magna Global (Member of CTI Group)." },
  ],
  pitch_deck: [
    { id: "sec-cover", title: "Slide 1: Executive Title & Introduction", category: "Umum", description: "Cover presentasi eksekutif: Judul Solusi, Nama Klien, Logo PT Smartnet Magna Global, Tanggal, dan pembuka nilai strategis." },
    { id: "sec-challenge", title: "Slide 2: Client Business Challenge & Current Landscape", category: "Umum", description: "Tantangan bisnis utama yang dihadapi klien, keterbatasan infrastruktur existing, serta urgensi transformasi." },
    { id: "sec-solution", title: "Slide 3: Proposed Architecture & Solution Overview", category: "Teknis", description: "Gambaran arsitektur High-Level Design (HLD), integrasi komponen modern, serta keselarasan dengan target operasional klien." },
    { id: "sec-value", title: "Slide 4: Key Advantages & Value Proposition", category: "Umum", description: "Manfaat nyata solusi: efisiensi TCO, ketersediaan tinggi (high availability), skalabilitas masa depan, dan keamanan enterprise." },
    { id: "sec-portfolio", title: "Slide 5: Enterprise Credentials & Relevant Track Record", category: "Umum", description: "Kredibilitas PT Smartnet Magna Global (Member of CTI Group), sertifikasi engineer prinsipal, dan rekam jejak sukses proyek sejenis." },
    { id: "sec-next-steps", title: "Slide 6: Implementation Roadmap & Next Steps", category: "Manajemen Proyek", description: "Jadwal pengerjaan bertahap, alokasi sumber daya, dan ajakan tindak lanjut (Call to Action / PoC / Workshop)." },
  ],
};
