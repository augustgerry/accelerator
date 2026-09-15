"use client";

import { FileText, Sparkles, Download, RotateCcw, CheckCircle2, Clock, AlertCircle, ShieldCheck } from "lucide-react";
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
}: ProgressHeaderProps) {
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
                <h2 className="text-sm font-semibold text-text-primary truncate max-w-md">
                  {fileName}
                </h2>
                <span className="rounded-full bg-surface border border-surface-border px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                  {total} klausul
                </span>
                {lastSaved && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Auto-save {lastSaved}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted">
                Mode Checklist Loopio · Grounding presales internal
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
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onDraftAll}
            disabled={isDraftingAll || todoCount === 0}
            className="flex items-center gap-1.5 border-surface-border hover:border-accent"
          >
            <Sparkles size={14} className={isDraftingAll ? "animate-spin text-accent-ink" : "text-accent-ink"} />
            <span>{isDraftingAll ? "Menyusun Draf..." : "Draf Semua Otomatis"}</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={onQualityCheck}
            disabled={isCheckingQuality || total === 0}
            className="flex items-center gap-1.5 border-surface-border hover:border-accent"
            title="Periksa kelengkapan dan konsistensi draft"
          >
            <ShieldCheck size={14} className={isCheckingQuality ? "animate-pulse text-accent-ink" : "text-accent-ink"} />
            <span>{isCheckingQuality ? "Memeriksa..." : qualityScore !== undefined ? `Quality ${qualityScore}` : "Cek Kualitas"}</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={onSaveSession}
            disabled={isSavingSession}
            className="flex items-center gap-1.5 border-surface-border hover:border-accent"
          >
            <FileText size={14} className={isSavingSession ? "animate-pulse text-accent-ink" : "text-accent-ink"} />
            <span>{isSavingSession ? "Menyimpan..." : sessionSaved ?? "Simpan Project"}</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={onOpenExport}
            className="flex items-center gap-1.5 bg-ink-900 hover:bg-ink-800 text-white"
          >
            <Download size={14} />
            <span>Kompilasi / Salin Semua</span>
          </Button>

          <button
            onClick={onResetFile}
            title="Ganti Dokumen TOR"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-surface-border text-text-muted hover:border-red-300 hover:text-red-600 transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
