"use client";

import { useState } from "react";
import { FileText, Sparkles, Download, RotateCcw, CheckCircle2, Clock, AlertCircle, ShieldCheck, MoreVertical, BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RequirementItem } from "@/lib/types";

interface ProgressHeaderProps {
  fileName: string;
  items: RequirementItem[];
  onDraftAll: () => void;
  onOpenExport: () => void;
  onResetFile: () => void;
  isDraftingAll: boolean;
  lastSaved?: string;
  onQualityCheck: () => void;
  isCheckingQuality: boolean;
  qualityScore?: number;
  onSaveSession: () => void;
  isSavingSession: boolean;
  sessionSaved?: string;
  onCheckCoverage: () => void;
  isCheckingCoverage: boolean;
}

export function ProgressHeader({
  fileName,
  items,
  onDraftAll,
  onOpenExport,
  onResetFile,
  isDraftingAll,
  lastSaved,
  onQualityCheck,
  isCheckingQuality,
  qualityScore,
  onSaveSession,
  isSavingSession,
  sessionSaved,
  onCheckCoverage,
  isCheckingCoverage,
}: ProgressHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const total = items.length;
  const finalCount = items.filter((it) => it.status === "final").length;
  const draftCount = items.filter((it) => it.status === "draft").length;
  const todoCount = items.filter((it) => it.status === "todo").length;

  const percent = total > 0 ? Math.round((finalCount / total) * 100) : 0;
  const draftedPercent = total > 0 ? Math.round(((finalCount + draftCount) / total) * 100) : 0;

  return (
    <div className="border-b border-surface-border bg-surface-raised px-6 py-4 shadow-subtle">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Document info & Progress meter */}
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
              <FileText size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-text-primary truncate max-w-[min(18rem,45vw)]">
                  {fileName}
                </h2>
                <span className="rounded-full bg-surface border border-surface-border px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                  {total} bagian
                </span>
                {lastSaved && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Auto-save {lastSaved}
                  </span>
                )}
              </div>
              <p className="hidden text-xs text-text-muted sm:block">
                Checklist proposal · knowledge base internal
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-1 flex max-w-xl flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-text-primary">
                  {finalCount} dari {total} selesai
                </span>
                <span className="text-text-muted">({percent}%)</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 size={12} /> {finalCount} Final
                </span>
                <span className="flex items-center gap-1 text-amber-700">
                  <Clock size={12} /> {draftCount} Draf
                </span>
                <span className="flex items-center gap-1 text-text-muted">
                  <AlertCircle size={12} /> {todoCount} Belum
                </span>
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-surface border border-surface-border">
              <div className="flex h-full transition-all duration-500 ease-out">
                {/* Finalized bar (emerald green) */}
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
                {/* Drafted bar (warm accent yellow) */}
                <div
                  className="bg-accent transition-all duration-500"
                  style={{ width: `${Math.max(0, draftedPercent - percent)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={onDraftAll}
            disabled={isDraftingAll || todoCount === 0}
            className="flex items-center gap-1.5 border-surface-border px-2.5 hover:border-accent sm:px-3"
          >
            <Sparkles size={14} className={isDraftingAll ? "animate-spin text-accent-ink" : "text-accent-ink"} />
            <span className="hidden sm:inline">{isDraftingAll ? "Menyusun..." : "Generate All"}</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={onCheckCoverage}
            disabled={isCheckingCoverage || total === 0}
            className="flex items-center gap-1.5 border-surface-border px-2.5 hover:border-accent sm:px-3"
            title="Audit persentase kebutuhan TOR yang sudah terjawab di draf"
          >
            {isCheckingCoverage ? (
              <Loader2 size={14} className="animate-spin text-accent-ink" />
            ) : (
              <BarChart3 size={14} className="text-accent-ink" />
            )}
            <span className="hidden sm:inline">Audit Kepatuhan</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={onOpenExport}
            className="flex items-center gap-1.5 bg-ink-900 px-2.5 text-white hover:bg-ink-800 sm:px-3"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={onResetFile}
            className="flex items-center gap-1.5 border-surface-border px-2.5 hover:border-accent sm:px-3 text-xs text-text-secondary"
            title="Mulai dokumen baru atau ganti TOR/RFP acuan"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Ganti File</span>
          </Button>

          <div className="relative">
            <button
              onClick={() => setMoreOpen((open) => !open)}
              aria-label="More actions"
              aria-expanded={moreOpen}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-surface-border text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
            >
              <MoreVertical size={15} />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-10 z-20 w-48 rounded-lg border border-surface-border bg-surface-raised p-1.5 shadow-panel">
                <button
                  onClick={() => { onQualityCheck(); setMoreOpen(false); }}
                  disabled={isCheckingQuality || total === 0}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-text-secondary hover:bg-surface hover:text-text-primary disabled:opacity-50"
                >
                  <ShieldCheck size={14} />
                  <span>{isCheckingQuality ? "Memeriksa..." : qualityScore !== undefined ? `Quality check (${qualityScore})` : "Quality check"}</span>
                </button>
                <button
                  onClick={() => { onSaveSession(); setMoreOpen(false); }}
                  disabled={isSavingSession}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-text-secondary hover:bg-surface hover:text-text-primary disabled:opacity-50"
                >
                  <FileText size={14} />
                  <span>{isSavingSession ? "Menyimpan..." : sessionSaved ?? "Simpan project"}</span>
                </button>
                <div className="my-1 border-t border-surface-border" />
                <button
                  onClick={() => { onResetFile(); setMoreOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                >
                  <RotateCcw size={14} />
                  <span>Ganti dokumen</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
