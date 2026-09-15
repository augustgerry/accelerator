"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { OnboardingModal } from "@/components/onboarding-modal";
import { Button } from "@/components/ui/button";
import {
  Search,
  Sparkles,
  FileEdit,
  ArrowRight,
  Database,
  CheckCircle2,
  FolderSync,
  HelpCircle,
  FileText,
} from "lucide-react";
import { getDocumentsSummary, type DocumentsSummary } from "@/lib/api";

const SUGGESTED_SEARCHES = [
  "SLA response time & teknisi on-site SMBC",
  "Checklist sizing HCI Sangfor vs Nutanix",
  "Proposal implementasi storage CSUL Finance",
  "Target RPO dan RTO skema Disaster Recovery",
];

export default function DashboardPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [summary, setSummary] = useState<DocumentsSummary | null>(null);

  useEffect(() => {
    getDocumentsSummary()
      .then((data) => setSummary(data))
      .catch((e) => console.error("Could not fetch summary:", e));
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleQuickChip = (q: string) => {
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface font-sans text-text-primary">
      <Topbar
        title="Dasbor Presales"
        subtitle="Knowledge accelerator & RFP response assistant — Solusi Mitra Gemilang"
      />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-10">
        {/* HERO SECTION: GLEAN SEARCH EXPERIENCE */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-raised px-3 py-1 text-xs font-medium text-text-secondary shadow-subtle mb-4">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {summary
                ? `${summary.totalDocuments} Dokumen Terindeks · ${summary.totalChunks.toLocaleString()} Chunk Vektor`
                : "161 Dokumen Terindeks · 4.586 Chunk Vektor"}
            </span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl">
            Cari & Jawab Proposal Presales Lebih Cepat
          </h1>
          <p className="mt-2 text-sm text-text-muted max-w-xl mx-auto">
            Akses pengetahuan kolektif tim Solution Architect internal untuk menjawab
            tender dan kebutuhan teknis tanpa mulai dari nol.
          </p>

          {/* Glean-Style Prominent Search Bar */}
          <form
            onSubmit={handleSearchSubmit}
            className="mt-6 mx-auto flex max-w-2xl items-center rounded-xl border border-surface-border bg-surface-raised p-2 shadow-panel transition-all focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20"
          >
            <div className="flex h-10 w-10 items-center justify-center text-text-muted shrink-0">
              <Search size={18} />
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tanya apa saja ke knowledge base internal... (misal: 'SLA SMBC 4 jam')"
              className="flex-1 bg-transparent px-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="bg-ink-900 text-white hover:bg-ink-800 shrink-0 px-4"
            >
              <span>Cari</span>
              <ArrowRight size={14} className="ml-1" />
            </Button>
          </form>

          {/* Search Suggestion Pills */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-text-muted">Coba cari:</span>
            {SUGGESTED_SEARCHES.map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickChip(chip)}
                className="rounded-full border border-surface-border bg-surface-raised px-3 py-1 text-text-secondary hover:border-secondary hover:text-secondary transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* TWO PRIMARY ACTION CARDS (GLEAN vs LOOPIO) */}
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Card 1: Glean Model (Search) */}
          <div
            onClick={() => router.push("/search")}
            className="group cursor-pointer rounded-xl border border-surface-border bg-surface-raised p-6 shadow-subtle hover:border-accent hover:shadow-panel transition-all duration-200 relative flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-ink group-hover:scale-105 transition-transform">
                  <Search size={22} />
                </div>
                <span className="rounded-full bg-surface border border-surface-border px-2.5 py-0.5 text-[11px] font-semibold text-text-secondary">
                  Glean Model
                </span>
              </div>

              <h2 className="text-lg font-bold text-text-primary group-hover:text-ink-900">
                Tanya Knowledge Base Internal
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Cari arsip proposal, sizing checklist, dan spesifikasi masa lalu dengan
                jawaban natural dan sitasi dokumen sumber yang dapat diverifikasi.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-surface-border pt-4">
              <span className="text-xs font-semibold text-text-primary group-hover:underline flex items-center gap-1">
                Buka Pencarian <ArrowRight size={13} />
              </span>
              <span className="text-[11px] text-text-muted">Q&A Tanya Jawab</span>
            </div>
          </div>

          {/* Card 2: Loopio Model (Draft Accelerator) */}
          <div
            onClick={() => router.push("/draft")}
            className="group cursor-pointer rounded-xl border border-surface-border bg-surface-raised p-6 shadow-subtle hover:border-accent hover:shadow-panel transition-all duration-200 relative flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-ink group-hover:scale-105 transition-transform">
                  <FileEdit size={22} />
                </div>
                <span className="rounded-full bg-accent-soft border border-accent/40 px-2.5 py-0.5 text-[11px] font-semibold text-accent-ink">
                  Loopio Model
                </span>
              </div>

              <h2 className="text-lg font-bold text-text-primary group-hover:text-ink-900">
                Akselerator Tanggapan Tender (TOR / RFP)
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Upload dokumen tender klien, otomatis pecah menjadi checklist butir soal,
                susun draf tanggapan siap copas per klausul, dan ekspor proposal 1-klik.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-surface-border pt-4">
              <span className="text-xs font-semibold text-text-primary group-hover:underline flex items-center gap-1">
                Buka Checklist Tender <ArrowRight size={13} />
              </span>
              <span className="text-[11px] text-accent-ink font-medium">Loopio Checklist</span>
            </div>
          </div>
        </div>

        {/* BOTTOM HELPER & STATUS BAR */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-surface-border bg-surface-raised px-6 py-3.5 shadow-subtle text-xs">
          <div className="flex items-center gap-5 text-text-secondary">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span>Drive Sync: Terhubung (161 Dokumen)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Database size={14} className="text-secondary" />
              <span>pgvector Supabase: Aktif</span>
            </div>
          </div>

          <button
            onClick={() => setIsOnboardingOpen(true)}
            className="flex items-center gap-1.5 font-medium text-text-primary hover:text-secondary transition-colors"
          >
            <HelpCircle size={14} />
            <span>Panduan Cepat (30 Detik)</span>
          </button>
        </div>
      </div>

      {/* Onboarding Tour Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />
    </div>
  );
}
