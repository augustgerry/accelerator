"use client";

import { useEffect, useState, useMemo } from "react";
import { Topbar } from "@/components/topbar";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Layers,
  RefreshCw,
  Loader2,
  Search,
  Filter,
  Eye,
  Copy,
  Check,
  X,
  Database,
  ExternalLink,
  ChevronRight,
  FileCode,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  getDocumentsSummary,
  syncDocuments,
  listDocuments,
  getDocumentChunks,
  deleteDocument,
  type DocumentsSummary,
} from "@/lib/api";
import type { IndexedDocument, DocumentChunksResponse, DocumentChunkItem } from "@/lib/types";
import { getFileExtension } from "@/lib/utils";

export default function DocumentsPage() {
  const [summary, setSummary] = useState<DocumentsSummary | null>(null);
  const [documents, setDocuments] = useState<IndexedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedExt, setSelectedExt] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "title" | "chunks">("updated");

  // Chunk Inspection Drawer State
  const [activeDoc, setActiveDoc] = useState<IndexedDocument | null>(null);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunksData, setChunksData] = useState<DocumentChunksResponse | null>(null);
  const [chunkFilter, setChunkFilter] = useState("");
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sum, docs] = await Promise.all([
        getDocumentsSummary().catch(() => null),
        listDocuments().catch(() => []),
      ]);
      setSummary(sum);
      setDocuments(docs);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal menghubungi backend. Pastikan API server jalan."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncDocuments();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sinkronisasi Google Drive gagal.");
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenChunks = async (doc: IndexedDocument) => {
    setActiveDoc(doc);
    setChunkFilter("");
    setChunksLoading(true);
    try {
      const res = await getDocumentChunks(doc.id);
      setChunksData(res);
    } catch (err) {
      console.error("Gagal mengambil chunks:", err);
    } finally {
      setChunksLoading(false);
    }
  };

  const handleCopyChunk = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedChunkId(id);
    setTimeout(() => setCopiedChunkId(null), 2000);
  };

  // Extensions list (derived from filenames)
  const extensions = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => {
      const ext = getFileExtension(d.title);
      if (ext) set.add(ext);
    });
    return ["all", ...Array.from(set).sort()];
  }, [documents]);

  // Filtered & Sorted documents
  const filteredDocs = useMemo(() => {
    return documents
      .filter((d) => {
        const matchesSearch =
          d.title.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
          d.docType?.toLowerCase().includes(debouncedQuery.toLowerCase());
        const matchesExt =
          selectedExt === "all" || getFileExtension(d.title) === selectedExt;
        return matchesSearch && matchesExt;
      })
      .sort((a, b) => {
        if (sortBy === "title") return a.title.localeCompare(b.title);
        if (sortBy === "chunks") return (b.chunkCount || 0) - (a.chunkCount || 0);
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [documents, debouncedQuery, selectedExt, sortBy]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === filteredDocs.length ? new Set() : new Set(filteredDocs.map((d) => d.id))
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Hapus ${selectedIds.size} dokumen dari index? Dokumen asli di Google Drive tidak terhapus.`)) return;
    setDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => deleteDocument(id)));
      setSelectedIds(new Set());
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus sebagian dokumen.");
    } finally {
      setDeleting(false);
    }
  };

  // Filtered chunks in modal
  const filteredChunks = useMemo(() => {
    if (!chunksData) return [];
    if (!chunkFilter.trim()) return chunksData.chunks;
    return chunksData.chunks.filter((c) =>
      c.content.toLowerCase().includes(chunkFilter.toLowerCase())
    );
  }, [chunksData, chunkFilter]);

  return (
    <div className="min-h-screen bg-surface-base">
      <Topbar
        title="Dokumen Terindeks"
        subtitle="Repositori Knowledge Base SMG — tersinkron dengan Google Drive & terindeks pgvector"
      />

      <div className="p-8 space-y-6 max-w-7xl mx-auto">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between shadow-subtle">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-800"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-4 rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
            <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center text-accent-text flex-shrink-0">
              <FileText size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted">Total Dokumen</p>
              <p className="text-2xl font-bold text-text-primary tracking-tight">
                {summary?.totalDocuments ?? documents.length ?? "0"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <Layers size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted">Total Vector Chunks</p>
              <p className="text-2xl font-bold text-text-primary tracking-tight">
                {summary?.totalChunks ?? "0"}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 flex-shrink-0">
                <RefreshCw size={22} className={syncing ? "animate-spin" : ""} />
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted">Terakhir Sinkron</p>
                <p className="text-sm font-semibold text-text-primary">
                  {summary?.lastSyncedAt
                    ? new Date(summary.lastSyncedAt).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Belum pernah"}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={syncing}
              onClick={handleSync}
              className="gap-1.5"
            >
              {syncing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              {syncing ? "Syncing..." : "Sync Drive"}
            </Button>
          </div>
        </div>

        {/* Document List Section */}
        <Card className="overflow-hidden">
          {/* Controls Bar */}
          <div className="p-5 border-b border-surface-border bg-surface-raised flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                type="text"
                placeholder="Cari nama dokumen, divisi, atau tipe..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-surface-border bg-surface-base text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filter & Sort Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedExt}
                onChange={(e) => setSelectedExt(e.target.value)}
                className="bg-transparent text-xs text-text-secondary border border-surface-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
              >
                {extensions.map((ext) => (
                  <option key={ext} value={ext}>
                    {ext === "all" ? "Semua Ekstensi" : `.${ext}`}
                  </option>
                ))}
              </select>

              <div className="h-4 w-px bg-surface-border hidden sm:block" />

              <div className="flex items-center gap-1 text-xs text-text-muted">
                <SlidersHorizontal size={13} />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs text-text-secondary border-none focus:outline-none cursor-pointer"
                >
                  <option value="updated">Terbaru</option>
                  <option value="title">Nama (A-Z)</option>
                  <option value="chunks">Chunks Terbanyak</option>
                </select>
              </div>
            </div>
          </div>

          {/* Bulk Action Bar */}
          {filteredDocs.length > 0 && (
            <div className="px-5 py-2.5 border-b border-surface-border bg-surface-base flex items-center gap-3 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-text-secondary">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filteredDocs.length}
                  onChange={toggleSelectAll}
                  className="rounded border-surface-border"
                />
                Pilih Semua
              </label>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-text-muted">{selectedIds.size} dipilih</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={deleting}
                    onClick={handleBulkDelete}
                    className="gap-1.5 text-red-600 hover:bg-red-50 ml-auto"
                  >
                    {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Hapus dari Index
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Table / List View */}
          <div className="divide-y divide-surface-border">
            {loading ? (
              <div className="p-12 text-center text-text-muted">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-accent" />
                <p className="text-xs">Memuat daftar dokumen...</p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-12 text-center text-text-muted">
                <FileText size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium text-text-primary">
                  {searchQuery || selectedExt !== "all"
                    ? "Tidak ada dokumen yang cocok dengan filter"
                    : "Belum ada dokumen yang terindeks"}
                </p>
                <p className="text-xs mt-1 max-w-sm mx-auto">
                  {searchQuery || selectedExt !== "all"
                    ? "Coba ubah kata kunci pencarian atau pilih ekstensi lain."
                    : "Jalankan 'Sync Drive' untuk menarik dan memproses dokumen dari Google Drive."}
                </p>
              </div>
            ) : (
              filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 sm:px-6 hover:bg-surface-raised/60 transition-colors flex items-center justify-between gap-4 group"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(doc.id)}
                      onChange={() => toggleSelect(doc.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 rounded border-surface-border"
                    />
                    <div className="w-9 h-9 rounded-lg bg-surface-raised border border-surface-border flex items-center justify-center text-accent flex-shrink-0 group-hover:border-accent transition-colors">
                      <FileText size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-semibold text-text-primary truncate group-hover:text-accent-text transition-colors">
                        {doc.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-text-muted">
                        <span className="capitalize px-1.5 py-0.5 rounded bg-surface-raised border border-surface-border text-text-secondary">
                          {doc.docType || "Dokumen"}
                        </span>
                        <span>•</span>
                        <span>
                          {new Date(doc.updatedAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        {doc.chunkCount !== undefined && (
                          <>
                            <span>•</span>
                            <span className="font-medium text-text-secondary">
                              {doc.chunkCount} chunks
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenChunks(doc)}
                      className="text-xs gap-1.5 text-text-secondary hover:text-text-primary"
                    >
                      <Eye size={13} />
                      <span className="hidden sm:inline">Lihat Chunks</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Chunk Inspection Slide-Over Drawer */}
      {activeDoc && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in">
          <div className="w-full max-w-2xl bg-surface-base h-full shadow-2xl flex flex-col border-l border-surface-border animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-surface-border bg-surface-raised flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-accent/20 text-accent-text">
                    Vector Chunks Preview
                  </span>
                  <span className="text-xs text-text-muted">
                    {chunksData ? `${chunksData.totalChunks} chunks` : "Memuat..."}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-text-primary truncate">
                  {activeDoc.title}
                </h3>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Tipe: <span className="capitalize font-medium text-text-secondary">{activeDoc.docType || "Dokumen"}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setActiveDoc(null);
                  setChunksData(null);
                }}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-border transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Chunk Search Bar */}
            <div className="p-4 border-b border-surface-border bg-surface-raised/40">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="text"
                  placeholder="Cari klausul / kata kunci di dalam dokumen ini..."
                  value={chunkFilter}
                  onChange={(e) => setChunkFilter(e.target.value)}
                  className="w-full pl-8 pr-4 py-1.5 text-xs rounded-lg border border-surface-border bg-surface-base text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {chunkFilter && (
                  <button
                    onClick={() => setChunkFilter("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Chunks List Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {chunksLoading ? (
                <div className="py-20 text-center text-text-muted">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2 text-accent" />
                  <p className="text-xs">Mengambil chunks dari pgvector...</p>
                </div>
              ) : filteredChunks.length === 0 ? (
                <div className="py-16 text-center text-text-muted">
                  <Layers size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Tidak ada chunk yang sesuai filter pencarian.</p>
                </div>
              ) : (
                filteredChunks.map((chunk, idx) => (
                  <div
                    key={chunk.id}
                    className="p-4 rounded-xl border border-surface-border bg-surface-raised shadow-subtle hover:border-surface-border/80 transition-all space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-[11px] text-text-muted">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-surface-base border border-surface-border text-accent-text">
                          #{idx + 1}
                        </span>
                        <span>{chunk.length} karakter</span>
                      </div>
                      <button
                        onClick={() => handleCopyChunk(chunk.id, chunk.content)}
                        className="flex items-center gap-1 hover:text-text-primary transition-colors text-text-secondary"
                        title="Salin chunk ini"
                      >
                        {copiedChunkId === chunk.id ? (
                          <>
                            <Check size={12} className="text-emerald-500" />
                            <span className="text-emerald-600 font-medium">Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-xs text-text-secondary leading-relaxed font-mono whitespace-pre-wrap bg-surface-base/60 p-3 rounded-lg border border-surface-border/60">
                      {chunk.content}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-surface-border bg-surface-raised flex items-center justify-between text-xs text-text-muted">
              <span>ID Dokumen: <code className="font-mono text-[10px] text-text-secondary">{activeDoc.id}</code></span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setActiveDoc(null);
                  setChunksData(null);
                }}
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
