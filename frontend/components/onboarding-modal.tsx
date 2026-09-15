"use client";

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Search, FileEdit, CheckCircle2, Sparkles, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [step, setStep] = useState(0);

  if (!isOpen) return null;

  const slides = [
    {
      badge: "Masalah yang Diselesaikan",
      title: "Solusi Cepat untuk Tim Presales IT",
      subtitle:
        "Membantu Anda menjawab dokumen tender (TOR/RFP) tebal tanpa harus membongkar ribuan file lama di Google Drive secara manual.",
      icon: Database,
      points: [
        "161+ dokumen TOR, SoW, TCO, dan checklist sudah diindeks ke database vektor.",
        "Mencegah human error dan inkonsistensi penawaran teknis antar divisi.",
        "Menghemat waktu dari berhari-hari menjadi hitungan menit.",
      ],
    },
    {
      badge: "Mode 1: Seperti Glean",
      title: "Pencarian Cerdas Knowledge Base",
      subtitle:
        "Tanyakan apa saja seputar pengalaman proyek masa lalu perusahaan dalam bahasa sehari-hari.",
      icon: Search,
      points: [
        "Contoh: 'Berapa standar response time SLA untuk sektor perbankan?'",
        "Jawaban otomatis dirangkum dan SELALU menyertakan dokumen asli sebagai rujukan.",
        "Mencakup arsip dari divisi SMBC, CSUL Finance, dan Presales.",
      ],
    },
    {
      badge: "Mode 2: Seperti Loopio",
      title: "Akselerator Tanggapan Tender (TOR/RFP)",
      subtitle:
        "Alur kerja terstruktur seperti checklist untuk menuntaskan jawaban tender klausul per klausul.",
      icon: FileEdit,
      points: [
        "1. Upload PDF/Word TOR ➔ Sistem otomatis memecah jadi butir soal (checklist).",
        "2. Klik per klausul ➔ AI menyusun draf jawaban teknis berbasis arsip masa lalu.",
        "3. Review & tandai Final ➔ Klik 'Kompilasi' untuk menyalin seluruh proposal siap cetak.",
      ],
    },
  ];

  const current = slides[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex w-full max-w-lg flex-col rounded-xl border border-surface-border bg-surface-raised shadow-panel">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-ink">
            {current.badge}
          </span>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
            <Icon size={24} />
          </div>

          <h3 className="text-lg font-bold text-text-primary">
            {current.title}
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
            {current.subtitle}
          </p>

          <div className="mt-5 space-y-2.5 rounded-lg border border-surface-border bg-surface p-4">
            {current.points.map((pt, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs text-text-primary">
                <CheckCircle2 size={15} className="text-accent-ink shrink-0 mt-0.5" />
                <span className="leading-relaxed">{pt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-surface-border px-6 py-4 bg-surface-raised">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setStep(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === step ? "w-6 bg-ink-900" : "w-2 bg-surface-border hover:bg-text-muted"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
              >
                <ChevronLeft size={14} className="mr-1" />
                Sebelumnya
              </Button>
            )}

            {step < slides.length - 1 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setStep((s) => s + 1)}
                className="bg-ink-900 text-white"
              >
                Lanjut
                <ChevronRight size={14} className="ml-1" />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={onClose}
                className="bg-ink-900 text-white"
              >
                <Sparkles size={14} className="mr-1 text-accent" />
                Mulai Gunakan
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
