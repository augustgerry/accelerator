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
    { id: "sec-nda", title: "0. Pengakuan Kerahasiaan (Non-Disclosure & Confidentiality)", category: "Administrasi & Legal", description: "Pernyataan resmi pengakuan kerahasiaan atas seluruh informasi, data teknis, dan dokumen tender dari Klien yang diterima oleh PT Smartnet Magna Global, sesuai dengan ketentuan kerahasiaan dan regulasi perlindungan data." },
    { id: "sec-1", title: "1. Latar Belakang", category: "Umum", description: "Konteks proyek, latar belakang pengadaan, dan urgensi modernisasi infrastruktur klien." },
    { id: "sec-1-1", title: "1.1 Kondisi Existing Infrastruktur", category: "Teknis", description: "Deskripsi kondisi eksisting perangkat/sistem klien saat ini beserta keterbatasan dan bottleneck operasionalnya." },
    { id: "sec-1-2", title: "1.2 Risiko End of Life (EOL) / End of Support (EOS)", category: "Teknis", description: "Analisis risiko perangkat yang sudah/akan EOL-EOS dan dampak operasional jika tidak segera diganti." },
    { id: "sec-2", title: "2. Tujuan", category: "Umum", description: "Tujuan strategis dan sasaran teknis yang ingin dicapai melalui implementasi solusi yang diusulkan." },
    { id: "sec-3", title: "3. Proposed Solution", category: "Teknis", description: "Gambaran umum solusi yang ditawarkan oleh PT Smartnet Magna Global untuk menjawab kebutuhan pada dokumen acuan." },
    { id: "sec-3-1", title: "3.1 Solution Overview", category: "Teknis", description: "Ringkasan solusi, komponen utama, dan value proposition teknis yang ditawarkan." },
    { id: "sec-3-2", title: "3.2 Sizing dan Opsi Penawaran", category: "Teknis", description: "Perhitungan sizing kapasitas dan opsi-opsi penawaran solusi sesuai kebutuhan klien." },
    { id: "sec-3-2-1", title: "3.2.1 Dasar Perhitungan Kapasitas", category: "Teknis", description: "Metodologi dan asumsi perhitungan kapasitas: data growth rate, redundancy, overhead, dan proyeksi 3-5 tahun ke depan." },
    { id: "sec-3-3", title: "3.3 Proposed High Level Design (HLD)", category: "Teknis", description: "Diagram topologi arsitektur solusi yang diusulkan, termasuk konektivitas dan skema redundansi." },
    { id: "sec-4", title: "4. Compliance Matrix", category: "Teknis", description: "Matriks kepatuhan spesifikasi teknis terhadap setiap butir dokumen acuan (RFP/TOR/KAK/RKS) — Comply / Not Comply / Exceed." },
    { id: "sec-5", title: "5. Bill of Quantity", category: "Teknis", description: "Rincian item, part number, deskripsi, dan kuantitas perangkat/lisensi yang ditawarkan." },
    { id: "sec-6", title: "6. Implementation Plan", category: "Manajemen Proyek", description: "Rencana pelaksanaan proyek secara keseluruhan dari persiapan hingga serah terima." },
    { id: "sec-6-1", title: "6.1 Timeline Pekerjaan", category: "Manajemen Proyek", description: "Jadwal pelaksanaan tiap tahapan proyek (persiapan, instalasi, konfigurasi, migrasi, UAT, BAST)." },
    { id: "sec-6-2", title: "6.2 Scope of Work", category: "Manajemen Proyek", description: "Rincian lingkup pekerjaan yang menjadi tanggung jawab penyedia selama implementasi." },
    { id: "sec-6-3", title: "6.3 Out of Scope", category: "Administrasi & Legal", description: "Daftar pekerjaan yang secara tegas berada di luar lingkup penawaran." },
    { id: "sec-7", title: "7. Maintenance Plan", category: "SLA & Support", description: "Layanan pemeliharaan pasca-implementasi mencakup PM, CM, dan komitmen SLA." },
    { id: "sec-7-1", title: "7.1 Preventive Maintenance (PM)", category: "SLA & Support", description: "Jadwal dan cakupan pemeliharaan preventif berkala untuk menjaga performa dan umur perangkat." },
    { id: "sec-7-2", title: "7.2 Corrective Maintenance (CM)", category: "SLA & Support", description: "Prosedur penanganan gangguan/insiden termasuk response time dan eskalasi." },
    { id: "sec-7-3", title: "7.3 Service Level Agreement (SLA)", category: "SLA & Support", description: "Komitmen SLA response time 24x7, target uptime, dan skema eskalasi dukungan teknis." },
    { id: "sec-8", title: "8. Lampiran", category: "Administrasi & Legal", description: "Dokumen pendukung penawaran: profil perusahaan, legalitas, dan tim tenaga ahli." },
    { id: "sec-8-1", title: "8.1 Profil Perusahaan & Legalitas", category: "Administrasi & Legal", description: "Profil PT Smartnet Magna Global (Member of CTI Group), akta, NIB, dan sertifikasi perusahaan relevan." },
    { id: "sec-8-2", title: "8.2 Tim Tenaga Ahli & Sertifikasi", category: "Administrasi & Legal", description: "Struktur tim proyek, CV ringkas, dan sertifikasi profesional tenaga ahli yang ditugaskan." },
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

export const MANAGED_SERVICES_SKELETON: SkeletonSection[] = [
  { id: "sec-ms-nda", title: "0. Pengakuan Kerahasiaan (Non-Disclosure & Confidentiality)", category: "Administrasi & Legal", description: "Pernyataan pengakuan kerahasiaan atas seluruh data platform, arsitektur, dan informasi tender Klien yang diterima oleh PT Smartnet Magna Global, menjamin perlindungan data dan kepatuhan regulasi perbankan/finansial." },
  { id: "sec-ms-1", title: "1. Latar Belakang & Pemahaman Kebutuhan", category: "Umum", description: "Latar belakang pengadaan managed services, profil ekosistem data platform, dan urgensi stabilitas operasional 24x7." },
  { id: "sec-ms-1-1", title: "1.1 Profil Ekosistem Data Platform Klien", category: "Teknis", description: "Pemetaan platform eksisting (Cloudera Data Platform, Apache Airflow, Apache Flink, Qlik Replicate, Greenplum, Talend, Tableau) dan future data platform." },
  { id: "sec-ms-1-2", title: "1.2 Urgensi Operasional 24x7 & Stabilitas Layanan", category: "Teknis", description: "Pentingnya ketersediaan platform data perbankan tanpa henti untuk integrasi data, analitik, pelaporan, dan kepatuhan regulasi." },
  { id: "sec-ms-2", title: "2. Tujuan Proyek", category: "Umum", description: "Sasaran objektif Managed Service Provider: 24x7 monitoring, incident management, problem resolution, job monitoring, dan pemeliharaan preventif." },
  { id: "sec-ms-3", title: "3. Proposed Solution: Metodologi Layanan & Model Operasi", category: "Teknis", description: "Metodologi komprehensif pengoperasian data platform, model rotasi shift 24x7, dan alur penanganan insiden cepat." },
  { id: "sec-ms-3-1", title: "3.1 Model Operasi 24x7 Rotational Shift", category: "Teknis", description: "Skema pembagian shift kerja 24x7 (Shift 1, 2, 3), penempatan on-site, dan mitigasi liputan hari libur nasional." },
  { id: "sec-ms-3-2", title: "3.2 Prosedur Deteksi, Level 1 Troubleshooting & Recovery", category: "Teknis", description: "Prosedur deteksi alert, investigasi awal, recovery L1, dan komitmen response time di bawah 5 menit." },
  { id: "sec-ms-3-3", title: "3.3 Prosedur Eskalasi Insiden via ServiceNow", category: "Teknis", description: "Alur eskalasi tiket insiden ke tim internal (Big Data Ops / BI Ops) dengan eskalasi <5 menit serta tracking hingga tuntas." },
  { id: "sec-ms-3-4", title: "3.4 Tata Kelola Koordinasi Multi-Tim", category: "Teknis", description: "Mekanisme koordinasi harian dengan IT Data Center Operations, IT DBA, dan IT Business Enablement." },
  { id: "sec-ms-4", title: "4. Compliance Matrix Kebutuhan Layanan TOR", category: "Teknis", description: "Matriks kepatuhan rinci terhadap butir kebutuhan TOR (cakupan platform, jam operasional, SLA, dan kualifikasi personel)." },
  { id: "sec-ms-5", title: "5. Manpower & Resource Plan", category: "Manajemen Proyek", description: "Rencana penugasan sumber daya manusia terdedikasi sesuai tahapan kebutuhan headcount TOR." },
  { id: "sec-ms-5-1", title: "5.1 Alokasi Headcount Bertahap (Fase 1: 5 Personel | Fase 2: 8 Personel)", category: "Manajemen Proyek", description: "Rencana deployment 5 personel tahap awal dan peningkatan menjadi 8 personel sesuai jadwal TOR." },
  { id: "sec-ms-5-2", title: "5.2 Skill Matrix Personel per Shift", category: "Teknis", description: "Distribusi keahlian per shift mencakup Big Data Ops dan BI & Structured Data Ops." },
  { id: "sec-ms-5-3", title: "5.3 Penempatan Personel On-Site & Rencana Kontinuitas", category: "Manajemen Proyek", description: "Penempatan on-site dan skema cadangan personel saat cuti, sakit, atau hari libur keagamaan." },
  { id: "sec-ms-6", title: "6. Implementation & Onboarding Plan", category: "Manajemen Proyek", description: "Rencana transisi operasional, transfer knowledge, dan onboarding sebelum tanggal go-live." },
  { id: "sec-ms-6-1", title: "6.1 Scope of Work", category: "Manajemen Proyek", description: "Batasan tanggung jawab penyedia dalam layanan monitoring operasional 24x7 dan L1 troubleshooting." },
  { id: "sec-ms-6-2", title: "6.2 Out of Scope", category: "Administrasi & Legal", description: "Batasan hal-hal di luar lingkup layanan operasional L1." },
  { id: "sec-ms-6-3", title: "6.3 Timeline Transisi & Screening Onboarding", category: "Manajemen Proyek", description: "Jadwal transisi sebelum go-live, proses screening SLIK Checking, dan penandatanganan NDA." },
  { id: "sec-ms-7", title: "7. Service Level Agreement (SLA) & Reporting Plan", category: "SLA & Support", description: "Komitmen tingkat layanan kuantitatif, standar pelaporan berkala, dan garansi operasional." },
  { id: "sec-ms-7-1", title: "7.1 Komitmen Target SLA (Response & Escalation Time)", category: "SLA & Support", description: "Komitmen waktu deteksi/respons <5 menit, eskalasi tiket <5 menit, dan 100% ketersediaan shift." },
  { id: "sec-ms-7-2", title: "7.2 Standar Laporan Insiden & Root Cause Analysis (RCA)", category: "SLA & Support", description: "Format incident report lengkap dengan kronologi kejadian, analisa akar masalah (RCA), dan solusi permanen." },
  { id: "sec-ms-7-3", title: "7.3 Mekanisme Laporan Berkala (Harian, Bulanan & Ad-Hoc)", category: "SLA & Support", description: "Penyusunan laporan operasional harian, laporan bulanan manajemen, dan laporan ad-hoc." },
  { id: "sec-ms-7-4", title: "7.4 Garansi Layanan Pasca-Implementasi", category: "SLA & Support", description: "Ketentuan garansi operasional 6 bulan sesuai kriteria evaluasi tender." },
  { id: "sec-ms-8", title: "8. Lampiran", category: "Administrasi & Legal", description: "Kredensial perusahaan, portofolio proyek serupa, dan CV tenaga ahli." },
  { id: "sec-ms-8-1", title: "8.1 Profil Perusahaan & Portofolio Relevan", category: "Administrasi & Legal", description: "Profil PT Smartnet Magna Global (Member of CTI Group), legalitas, dan pengalaman implementasi data platform." },
  { id: "sec-ms-8-2", title: "8.2 Profil & CV Tenaga Ahli (Ready Resource Pool)", category: "Administrasi & Legal", description: "Daftar riwayat hidup (CV) dan sertifikasi tenaga ahli yang ditugaskan." },
];

export function getSkeletonForDoc(docTypeId: DraftDocTypeId, torText: string = ""): SkeletonSection[] {
  let base: SkeletonSection[];
  if (docTypeId === "narrative") {
    const lower = torText.toLowerCase();
    const isManagedServices = ["managed service", "24x7", "rotational shift", "level 1", "l1", "servicenow", "headcount"].some(
      (k) => lower.includes(k)
    );
    base = isManagedServices ? [...MANAGED_SERVICES_SKELETON] : [...SKELETONS.narrative];
  } else {
    base = [...(SKELETONS[docTypeId] ?? SKELETONS.narrative)];
  }

  // Deteksi nama institusi klien dari teks TOR untuk mempersonalisasi Pengakuan Kerahasiaan
  const lowerText = torText.toLowerCase();
  let clientName = "Klien";
  if (lowerText.includes("smbc") || lowerText.includes("bank smbc")) {
    clientName = "PT Bank SMBC Indonesia Tbk";
  } else if (lowerText.includes("csul") || lowerText.includes("chandra sakti")) {
    clientName = "PT Chandra Sakti Utama Leasing (CSUL Finance)";
  } else if (lowerText.includes("bni")) {
    clientName = "PT Bank Negara Indonesia (Persero) Tbk";
  } else if (lowerText.includes("mandiri")) {
    clientName = "PT Bank Mandiri (Persero) Tbk";
  }

  return base.map((sec) => {
    if (sec.id.includes("nda")) {
      return {
        ...sec,
        title: `0. Pengakuan Kerahasiaan (${clientName})`,
        description: `Pernyataan resmi pengakuan kerahasiaan atas seluruh informasi, data teknis, arsitektur data platform, dan dokumen tender ${clientName} yang diterima oleh PT Smartnet Magna Global, sesuai standar Non-Disclosure Agreement (NDA) dan kepatuhan regulasi perbankan.`,
      };
    }
    return sec;
  });
}

