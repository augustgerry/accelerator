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
      className={`fixed inset-0 z-[9999] flex justify-end bg-black/65 backdrop-blur-sm transition-opacity duration-200 ${
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
        className={`h-full w-full max-w-2xl lg:max-w-3xl border-l border-slate-300 bg-[#F0F2F5] shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {chunk && (
          <>
            {/* Top Ribbon — Microsoft Word / Document Viewer Style */}
            <div className="flex items-center justify-between gap-3 border-b border-[#154694] bg-[#185ABD] px-5 py-3 text-white shadow-sm">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white shadow-inner font-bold text-sm">
                  {ext === "pdf" ? "📕" : ext === "docx" || ext === "doc" ? "📄" : "📝"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100">
                      Pratinjau Dokumen Sumber · Kutipan [{index + 1} dari {total}]
                    </span>
                    <span className="rounded bg-white/20 px-1.5 py-0.2 text-[10px] font-semibold uppercase text-white">
                      .{ext || "doc"}
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold leading-snug text-white truncate" title={chunk.title}>
                    {chunk.title}
                  </h3>
                </div>
              </div>

              {/* Navigation & Close Buttons */}
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => onNavigate(index - 1)}
                  disabled={index <= 0}
                  title="Kutipan sebelumnya (Panah Kiri)"
                  aria-label="Kutipan sebelumnya"
                  className="rounded-md bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[11px] font-medium text-blue-100 px-1 select-none">
                  {index + 1}/{total}
                </span>
                <button
                  onClick={() => onNavigate(index + 1)}
                  disabled={index >= total - 1}
                  title="Kutipan berikutnya (Panah Kanan)"
                  aria-label="Kutipan berikutnya"
                  className="rounded-md bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
                >
                  <ChevronRight size={16} />
                </button>
                <div className="h-4 w-px bg-white/20 mx-1" />
                <button
                  ref={closeButtonRef}
                  onClick={onClose}
                  title="Tutup (Esc)"
                  aria-label="Tutup panel kutipan"
                  className="rounded-md bg-white/10 p-1.5 text-white transition-colors hover:bg-white/25 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Word Sub-toolbar / Document Metadata Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-5 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                    DOC_TYPE_COLORS[chunk.docType] ?? DOC_TYPE_COLORS.other
                  }`}
                >
                  {chunk.docType}
                </span>
                <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  Relevansi {chunk.confidence}%
                </span>
                {formattedDate && (
                  <span className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 border border-slate-200">
                    <Clock size={11} />
                    {formattedDate}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySnippet}
                  className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  {copied ? (
                    <>
                      <Check size={12} className="text-emerald-600" />
                      <span className="text-emerald-700">Tersalin ke Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      Salin Teks Acuan
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Word Document Paper View Container */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#E8EBF0]">
              {/* Simulated A4 Document Sheet */}
              <div
                className={`mx-auto max-w-2xl rounded-sm bg-white p-7 sm:p-10 shadow-lg border border-slate-300/80 transition-all duration-300 text-slate-900 font-sans ${
                  pulse ? "ring-2 ring-blue-500" : ""
                }`}
                style={{ minHeight: "560px" }}
              >
                {/* Simulated Word Document Header / Letterhead */}
                <div className="border-b-2 border-slate-800 pb-3 mb-5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    <span>Smartnet Magna Global · Knowledge Base</span>
                    <span>Arsip Dokumen Resmi</span>
                  </div>
                  <h1 className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug">
                    {chunk.title}
                  </h1>
                </div>

                {/* Simulated Word Margin / Content Ruler Guide */}
                <div className="mb-4 flex items-center justify-between text-[9px] font-mono text-slate-400 select-none border-b border-dashed border-slate-200 pb-1">
                  <span>◀ MARGIN KIRI</span>
                  <span>[ CUPLIKAN ASLI HASIL INDEXING PGVECTOR ]</span>
                  <span>MARGIN KANAN ▶</span>
                </div>

                {/* Document Body Text with Clean Document Formatting */}
                <div className="text-[13px] leading-relaxed text-slate-800 space-y-3">
                  {chunk.chunk_text.split("\n\n").map((para, pIdx) => {
                    const trimmed = para.trim();
                    if (!trimmed) return null;

                    // Detect bullet points or lists
                    const lines = trimmed.split("\n");
                    const isList = lines.every((l) => l.trim().startsWith("•") || l.trim().startsWith("-") || l.trim().startsWith("*") || l.trim().match(/^\d+\./));

                    if (isList) {
                      return (
                        <ul key={pIdx} className="space-y-1.5 pl-5 list-disc my-2">
                          {lines.map((line, lIdx) => {
                            const cleanLine = line.replace(/^[•\-*]\s*/, "").replace(/^\d+\.\s*/, "");
                            return (
                              <li key={lIdx} className="text-slate-800 leading-normal pl-1">
                                <HighlightedText text={cleanLine} query={query} />
                              </li>
                            );
                          })}
                        </ul>
                      );
                    }

                    // Meeting minutes or key-value header line (e.g. "Date:", "Attendees:", etc.)
                    const isHeaderLike = /^(minutes of meeting|agenda|attendees|discussions|hasil pembahasan|catatan penting|spesifikasi teknis):?/i.test(trimmed);

                    return (
                      <div
                        key={pIdx}
                        className={
                          isHeaderLike
                            ? "font-bold text-slate-900 text-sm mt-3 pt-2 border-t border-slate-100"
                            : "text-justify leading-relaxed"
                        }
                      >
                        <HighlightedText text={trimmed} query={query} />
                      </div>
                    );
                  })}
                </div>

                {/* Keyword Match Tags inside document view */}
                {chunk.matched_terms.length > 0 && (
                  <div className="mt-8 pt-4 border-t border-slate-200">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Kata Kunci Cocok dengan Pencarian:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {chunk.matched_terms.map((term) => (
                        <span
                          key={term}
                          className="rounded bg-yellow-100 text-yellow-900 border border-yellow-300 px-2 py-0.5 text-[11px] font-medium"
                        >
                          ✓ {term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Simulated Word Page Footer */}
                <div className="mt-10 pt-4 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500 select-none">
                  <span>Dokumen Arsip Presales SMG · Rahasia</span>
                  <span className="font-semibold">Halaman 1 dari 1</span>
                  <span>ID: {chunk.id.slice(0, 8)}...</span>
                </div>
              </div>
            </div>

            {/* Persistent Bottom Action Bar */}
            <div className="border-t border-slate-300 bg-white px-5 py-3 shadow-md">
              {downloadError && (
                <p className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
                  {downloadError}
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#185ABD] px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-[#124b9e] active:scale-[0.99] disabled:opacity-50 shadow-sm"
                >
                  {downloading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Download Dokumen Lengkap (.{ext || "pdf"})
                </button>
                <a
                  href={`https://drive.google.com/file/d/${chunk.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-800 transition-all hover:bg-slate-100 hover:border-slate-400 active:scale-[0.99] shadow-sm"
                >
                  <ExternalLink size={14} />
                  Buka Dokumen Asli di Drive ↗
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
