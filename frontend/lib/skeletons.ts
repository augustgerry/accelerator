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
    { id: "sec-ruang-lingkup", title: "Ruang Lingkup Pekerjaan", category: "Teknis", description: "Ruang lingkup pekerjaan yang akan dilaksanakan sesuai TOR/RFP." },
    { id: "sec-deliverables", title: "Deliverables & Output", category: "Manajemen Proyek", description: "Daftar deliverable/output yang diserahkan pada setiap tahap pekerjaan." },
    { id: "sec-jadwal", title: "Jadwal & Milestone", category: "Manajemen Proyek", description: "Jadwal pelaksanaan dan milestone utama." },
    { id: "sec-sla", title: "SLA & Service Level", category: "SLA & Support", description: "Service level agreement, response time, dan target ketersediaan layanan." },
    { id: "sec-tanggung-jawab", title: "Tanggung Jawab Para Pihak", category: "Administrasi & Legal", description: "Pembagian tanggung jawab antara penyedia dan klien." },
    { id: "sec-terms", title: "Syarat & Ketentuan", category: "Administrasi & Legal", description: "Syarat dan ketentuan umum pelaksanaan pekerjaan." },
  ],
  solution_brief: [
    { id: "sec-challenge", title: "Business Challenge", category: "Umum", description: "Tantangan bisnis/masalah yang dihadapi klien saat ini." },
    { id: "sec-solution", title: "Proposed Solution", category: "Teknis", description: "Solusi yang diusulkan untuk menjawab tantangan tersebut." },
    { id: "sec-benefits", title: "Key Benefits", category: "Umum", description: "Manfaat utama dan value proposition dari solusi yang diusulkan." },
    { id: "sec-arch", title: "Technical Overview", category: "Teknis", description: "Gambaran arsitektur/teknologi dari solusi yang diusulkan." },
    { id: "sec-implementation", title: "Implementation Approach", category: "Manajemen Proyek", description: "Pendekatan implementasi solusi secara garis besar." },
  ],
  mom: [
    { id: "sec-agenda", title: "Agenda Pertemuan", category: "Umum", description: "Agenda dan tujuan pertemuan." },
    { id: "sec-diskusi", title: "Poin Diskusi", category: "Umum", description: "Poin-poin yang dibahas selama pertemuan." },
    { id: "sec-kesimpulan", title: "Kesimpulan & Kesepakatan", category: "Umum", description: "Kesimpulan dan kesepakatan yang dicapai." },
    { id: "sec-tindak-lanjut", title: "Tindak Lanjut (Action Items)", category: "Manajemen Proyek", description: "Action item, PIC, dan target waktu tindak lanjut." },
  ],
  klarifikasi_teknis: [
    { id: "sec-pertanyaan", title: "Daftar Pertanyaan Klarifikasi", category: "Teknis", description: "Daftar pertanyaan klarifikasi teknis terhadap TOR/RFP." },
    { id: "sec-jawaban", title: "Jawaban & Klarifikasi Teknis", category: "Teknis", description: "Jawaban dan klarifikasi atas pertanyaan teknis yang diajukan." },
    { id: "sec-dampak", title: "Dampak terhadap Ruang Lingkup/Penawaran", category: "Administrasi & Legal", description: "Dampak klarifikasi terhadap ruang lingkup pekerjaan atau nilai penawaran." },
  ],
  pitch_deck: [
    { id: "sec-cover", title: "Cover & Perkenalan", category: "Umum", description: "Perkenalan singkat perusahaan dan tujuan presentasi." },
    { id: "sec-challenge", title: "Business Challenge", category: "Umum", description: "Tantangan bisnis yang dihadapi klien." },
    { id: "sec-solution", title: "Solution Overview", category: "Teknis", description: "Gambaran solusi yang ditawarkan." },
    { id: "sec-value", title: "Value Proposition & Keunggulan", category: "Umum", description: "Value proposition dan keunggulan dibanding kompetitor." },
    { id: "sec-portfolio", title: "Studi Kasus / Portofolio Relevan", category: "Umum", description: "Studi kasus atau portofolio proyek relevan yang pernah dikerjakan." },
    { id: "sec-next-steps", title: "Next Steps / Call to Action", category: "Manajemen Proyek", description: "Langkah selanjutnya yang diusulkan kepada klien." },
  ],
};
