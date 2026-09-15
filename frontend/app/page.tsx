"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { OnboardingModal } from "@/components/onboarding-modal";
import { Button } from "@/components/ui/button";
import {
  Search,
  FileEdit,
  ArrowRight,
  Database,
  CheckCircle2,
  HelpCircle,
  Clock3,
} from "lucide-react";
import { getDocumentsSummary, listProposalSessions, type DocumentsSummary, type ProposalSession } from "@/lib/api";

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
  const [recentProjects, setRecentProjects] = useState<ProposalSession[]>([]);

  useEffect(() => {
    Promise.all([getDocumentsSummary(), listProposalSessions().catch(() => [])])
      .then(([data, projects]) => {
        setSummary(data);
        setRecentProjects(projects.slice(0, 3));
      })
      .catch((e) => console.error("Could not fetch dashboard data:", e));
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

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => router.push("/draft")}
            className="group flex items-center justify-between rounded-lg border border-surface-border bg-surface-raised px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft/30"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent-ink"><FileEdit size={17} /></span>
              <span><span className="block text-sm font-semibold">New Proposal</span><span className="block text-[11px] text-text-muted">Upload TOR / RFP dan mulai drafting</span></span>
            </span>
            <ArrowRight size={15} className="text-text-muted transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => router.push("/library")}
            className="group flex items-center justify-between rounded-lg border border-surface-border bg-surface-raised px-4 py-3 text-left transition-colors hover:border-secondary hover:bg-secondary-soft/30"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary-soft text-secondary"><Database size={17} /></span>
              <span><span className="block text-sm font-semibold">Open Library</span><span className="block text-[11px] text-text-muted">Documents, templates, dan projects</span></span>
            </span>
            <ArrowRight size={15} className="text-text-muted transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {recentProjects.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">Recent Projects</h2>
              <button onClick={() => router.push("/library")} className="text-xs font-medium text-secondary hover:underline">Lihat semua</button>
            </div>
            <div className="divide-y divide-surface-border overflow-hidden rounded-lg border border-surface-border bg-surface-raised">
              {recentProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => { localStorage.setItem("synapse-proposal-session-id", project.id); router.push("/draft"); }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface"
                >
                  <span className="min-w-0"><span className="block truncate text-xs font-semibold">{project.title}</span><span className="mt-0.5 block text-[11px] text-text-muted">{project.items.length} klausul · {project.status}</span></span>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-text-muted"><Clock3 size={12} />{new Date(project.updated_at).toLocaleDateString("id-ID")}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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
