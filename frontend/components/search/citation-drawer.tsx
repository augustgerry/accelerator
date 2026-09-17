"use client";

import { useEffect, useRef, useState } from "react";
import { X, Download, ExternalLink, Loader2, Copy, Check, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { downloadDriveDocument, type SearchResultChunk } from "@/lib/api";
import { getFileExtension } from "@/lib/utils";
import { HighlightedText } from "@/components/search/highlighted-text";
import { DOC_TYPE_COLORS } from "@/components/search/doc-type-colors";

export function CitationDrawer({
  chunk,
  index,
  total,
  query = "",
  onClose,
  onNavigate,
}: {
  chunk: SearchResultChunk | null;
  index: number;
  total: number;
  query?: string;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pulse, setPulse] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const open = !!chunk;
  const ext = chunk ? getFileExtension(chunk.title) : "";

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowRight" && index < total - 1) onNavigate(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      else if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, total]);

  // Move focus into the drawer on open, restore it to whatever triggered it on close.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();
    } else {
      previouslyFocusedRef.current?.focus();
    }
  }, [open]);

  // Brief highlight pulse on the snippet each time the drawer opens on a new chunk
  useEffect(() => {
    if (!chunk) return;
    setPulse(true);
    const timer = setTimeout(() => setPulse(false), 700);
    return () => clearTimeout(timer);
  }, [chunk?.id, chunk?.chunk_text]);

  const formattedDate = chunk?.updated_at
    ? new Date(chunk.updated_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const handleDownload = async () => {
    if (!chunk) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await downloadDriveDocument(chunk.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = chunk.title;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Gagal mengunduh dokumen.");
    } finally {
      setDownloading(false);
    }
  };

  const handleCopySnippet = () => {
    if (!chunk) return;
    navigator.clipboard.writeText(chunk.chunk_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={chunk ? `Detail kutipan: ${chunk.title}` : "Detail kutipan"}
        className={`h-full w-full max-w-md border-l border-surface-border bg-surface-base shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {chunk && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-surface-border bg-surface-raised p-5">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent-ink">
                  Kutipan [{index + 1}]
                </span>
                <h3 className="mt-1 text-sm font-bold leading-snug text-text-primary break-words">
                  {chunk.title}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {ext && (
                    <span className="rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase text-text-secondary">
                      .{ext}
                    </span>
                  )}
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                      DOC_TYPE_COLORS[chunk.docType] ?? DOC_TYPE_COLORS.other
                    }`}
                  >
                    {chunk.docType}
                  </span>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Relevansi {chunk.confidence}%
                  </span>
                  {formattedDate && (
                    <span className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[10px] text-text-muted border border-surface-border">
                      <Clock size={10} />
                      {formattedDate}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => onNavigate(index - 1)}
                  disabled={index <= 0}
                  title="Kutipan sebelumnya"
                  aria-label="Kutipan sebelumnya"
                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-border hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => onNavigate(index + 1)}
                  disabled={index >= total - 1}
                  title="Kutipan berikutnya"
                  aria-label="Kutipan berikutnya"
                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-border hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  ref={closeButtonRef}
                  onClick={onClose}
                  aria-label="Tutup panel kutipan"
                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-border hover:text-text-primary"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Snippet */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Cuplikan Teks Acuan
                </p>
                <button
                  onClick={handleCopySnippet}
                  className="flex items-center gap-1 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                >
                  {copied ? (
                    <>
                      <Check size={12} className="text-emerald-500 animate-in zoom-in duration-200" />
                      <span className="text-emerald-600 animate-in fade-in duration-200">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      Salin
                    </>
                  )}
                </button>
              </div>
              <div
                className={`rounded-lg border p-4 transition-colors duration-700 ${
                  pulse ? "border-accent bg-accent-soft/40" : "border-surface-border bg-surface-raised"
                }`}
              >
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-text-primary font-normal">
                  <HighlightedText
                    text={
                      chunk.chunk_text.trim().match(/[.!?\n]$/)
                        ? chunk.chunk_text
                        : `${chunk.chunk_text.trim()} ...`
                    }
                    query={query}
                  />
                </p>
              </div>

              {chunk.matched_terms.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Kata Kunci Cocok
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {chunk.matched_terms.map((term) => (
                      <span key={term} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-text-muted border border-surface-border">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2 border-t border-surface-border bg-surface-raised p-4">
              {downloadError && (
                <p className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
                  {downloadError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50"
                >
                  {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  Download Dokumen
                </button>
                <a
                  href={`https://drive.google.com/file/d/${chunk.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-accent hover:bg-accent-soft"
                >
                  <ExternalLink size={13} />
                  Buka di Drive
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
