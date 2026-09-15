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
    { id: "sec-exec-summary", title: "Executive Summary", category: "Umum", description: "Ringkasan eksekutif: pemahaman kebutuhan klien, solusi yang diusulkan, dan value proposition utama secara singkat." },
    { id: "sec-ruang-lingkup", title: "Pemahaman Kebutuhan & Ruang Lingkup", category: "Umum", description: "Pemahaman terhadap kebutuhan klien berdasarkan TOR/RFP, termasuk ruang lingkup pekerjaan yang akan dikerjakan." },
    { id: "sec-solusi-teknis", title: "Solusi Teknis yang Diusulkan", category: "Teknis", description: "Arsitektur/desain solusi teknis, spesifikasi perangkat, dan pendekatan implementasi yang diusulkan." },
    { id: "sec-metodologi", title: "Metodologi & Rencana Implementasi", category: "Manajemen Proyek", description: "Tahapan pelaksanaan proyek, metodologi kerja, dan milestone implementasi." },
    { id: "sec-maintenance", title: "Maintenance Plan (PM & CM)", category: "SLA & Support", description: "Rencana pemeliharaan Preventive Maintenance (PM) dan Corrective Maintenance (CM), termasuk SLA response time dan prosedur eskalasi." },
    { id: "sec-tim", title: "Tim Pelaksana & Struktur Organisasi", category: "Manajemen Proyek", description: "Struktur tim proyek, kualifikasi personel, dan sertifikasi yang relevan." },
    { id: "sec-jadwal", title: "Jadwal Pelaksanaan (Timeline)", category: "Manajemen Proyek", description: "Rencana jadwal kerja dan milestone utama proyek." },
    { id: "sec-keunggulan", title: "Keunggulan & Value Proposition", category: "Umum", description: "Keunggulan kompetitif dan nilai tambah yang ditawarkan dibanding solusi lain." },
    { id: "sec-penutup", title: "Penutup", category: "Administrasi & Legal", description: "Kesimpulan dan komitmen penyedia terhadap keberhasilan proyek." },
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
