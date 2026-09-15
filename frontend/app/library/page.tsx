"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText, FolderOpen, LayoutTemplate, Loader2, RefreshCw, Search, ArrowUpRight, Clock3 } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import {
  getDocumentsSummary,
  listDocuments,
  listProposalSessions,
  syncDocuments,
  type DocumentsSummary,
  type ProposalSession,
} from "@/lib/api";
import type { IndexedDocument } from "@/lib/types";

type LibraryTab = "documents" | "templates" | "projects";

const TAB_LABELS: Record<LibraryTab, { label: string; icon: typeof FileText }> = {
  documents: { label: "Drive Docs", icon: FileText },
  templates: { label: "Drive Templates", icon: LayoutTemplate },
  projects: { label: "Projects", icon: FolderOpen },
};

export default function LibraryPage() {
  const [tab, setTab] = useState<LibraryTab>("documents");
  const [documents, setDocuments] = useState<IndexedDocument[]>([]);
  const [projects, setProjects] = useState<ProposalSession[]>([]);
  const [summary, setSummary] = useState<DocumentsSummary | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const [docs, sessions, sum] = await Promise.all([
        listDocuments().catch(() => []),
        listProposalSessions().catch(() => []),
        getDocumentsSummary().catch(() => null),
      ]);
      setDocuments(docs);
      setProjects(sessions);
      setSummary(sum);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat library");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  const templates = useMemo(
    () => documents.filter((doc) => doc.docType === "template"),
    [documents]
  );

  const visibleDocuments = useMemo(() => {
    const source = tab === "templates" ? templates : documents;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return source;
    return source.filter((doc) =>
      [doc.title, doc.division, doc.docType].some((value) =>
        value?.toLowerCase().includes(normalized)
      )
    );
  }, [documents, templates, tab, query]);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) =>
      [project.title, project.file_name, project.status].some((value) =>
        value?.toLowerCase().includes(normalized)
      )
    );
  }, [projects, query]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncDocuments();
      await loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync Google Drive gagal");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface font-sans text-text-primary">
      <Topbar title="Google Drive" subtitle="Sumber knowledge base dan template Synapse" />
      <div className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Workspace Presales</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Drive Workspace</h2>
            <p className="mt-1 text-xs text-text-muted">
              {summary ? `${summary.totalDocuments} dokumen dari Google Drive terindeks` : "Dokumen dan template dari Google Drive"}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="flex w-fit items-center gap-1.5 border-surface-border"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? "Mengindeks Drive..." : "Refresh dari Drive"}
          </Button>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full rounded-lg border border-surface-border bg-surface-raised p-1 sm:w-auto">
            {(Object.keys(TAB_LABELS) as LibraryTab[]).map((key) => {
              const item = TAB_LABELS[key];
              const Icon = item.icon;
              const count = key === "documents" ? documents.length : key === "templates" ? templates.length : projects.length;
              return (
                <button
                  key={key}
                  onClick={() => { setTab(key); setQuery(""); }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors sm:flex-none ${tab === key ? "bg-ink-900 text-white" : "text-text-muted hover:text-text-primary"}`}
                >
                  <Icon size={14} />
                  {item.label}
                  <span className={tab === key ? "text-white/70" : "text-text-muted"}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari di library..."
              className="w-full rounded-lg border border-surface-border bg-surface-raised py-2 pl-9 pr-3 text-xs outline-none focus:border-accent"
            />
          </div>
        </div>

        {error && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-xs text-text-muted">
            <Loader2 size={18} className="mr-2 animate-spin" /> Memuat library...
          </div>
        ) : tab === "projects" ? (
          <div className="overflow-hidden rounded-lg border border-surface-border bg-surface-raised">
            {visibleProjects.length === 0 ? (
              <EmptyState label="Belum ada project proposal tersimpan." href="/draft" action="Buat proposal baru" />
            ) : visibleProjects.map((project) => (
              <Link key={project.id} href="/draft" onClick={() => localStorage.setItem("synapse-proposal-session-id", project.id)} className="flex items-center justify-between gap-3 border-b border-surface-border p-4 last:border-b-0 hover:bg-surface">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink"><FolderOpen size={16} /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{project.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-text-muted">{project.file_name} · {project.items.length} klausul</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px] text-text-muted"><Clock3 size={13} />{new Date(project.updated_at).toLocaleDateString("id-ID")}<ArrowUpRight size={14} /></div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-surface-border bg-surface-raised">
            {visibleDocuments.length === 0 ? (
              <EmptyState label={tab === "templates" ? "Belum ada template di library." : "Belum ada dokumen terindeks."} href="/documents" action="Buka arsip lama" />
            ) : visibleDocuments.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 border-b border-surface-border p-4 last:border-b-0 hover:bg-surface">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${doc.docType === "template" ? "bg-accent-soft text-accent-ink" : "bg-secondary-soft text-secondary"}`}>
                    {doc.docType === "template" ? <LayoutTemplate size={16} /> : <FileText size={16} />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{doc.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-text-muted">{doc.division || "presales"} · {doc.chunkCount ?? 0} chunks · {doc.docType}</p>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-text-muted">{new Date(doc.updatedAt).toLocaleDateString("id-ID")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ label, href, action }: { label: string; href: string; action: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-2 p-6 text-center">
      <FolderOpen size={24} className="text-text-muted" />
      <p className="text-sm font-medium text-text-primary">{label}</p>
      <Link href={href} className="text-xs font-semibold text-secondary hover:underline">{action}</Link>
    </div>
  );
}
