"use client";

import { useState, useRef, useEffect } from "react";
import {
  X,
  Copy,
  Check,
  FileDown,
  AlertCircle,
  FileText,
  Loader2,
  Presentation,
  Eye,
  ChevronDown,
  ChevronUp,
  Search,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  exportProposalDocx,
  exportProposalPptx,
  exportProposalPdf,
  exportPreflight,
  type ExportPreflightResult,
} from "@/lib/api";
import type { RequirementItem, IndexedDocument } from "@/lib/types";
import { FORMAT_LABELS, getDocType, type DraftDocTypeId, type DraftFormat } from "@/lib/document-types";
import { cleanLatexMath } from "@/lib/utils";
import { WordIcon, PowerPointIcon, PdfIcon } from "@/components/office-icons";

const EXPORT_PRESETS: Array<{ docTypeId: DraftDocTypeId; format: DraftFormat; label: string; sub: string }> = [
  { docTypeId: "narrative", format: "docx", label: "Proposal Teknis", sub: "Word (.docx)" },
  { docTypeId: "sow", format: "docx", label: "Scope of Work", sub: "Word (.docx)" },
  { docTypeId: "pitch_deck", format: "pptx", label: "Presentation / Pitch Deck", sub: "PowerPoint (.pptx)" },
];

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  items: RequirementItem[];
  initialDocTypeId?: DraftDocTypeId;
  initialFormat?: DraftFormat;
  selectedReferenceDocs?: IndexedDocument[];
}

type ExportTab = "standard" | "text";
type ExportStep = 1 | 2;

type CorporateBranding = {
  companyName: string;
  primaryColor: string;
  accentColor: string;
  footerText: string;
  logoDataUrl: string;
};

const DEFAULT_BRANDING: CorporateBranding = {
  companyName: "PT Smartnet Magna Global (SMG)",
  primaryColor: "#111827",
  accentColor: "#2F5FE0",
  footerText: "PT Smartnet Magna Global (SMG)",
  logoDataUrl: "",
};

const MS_WORD_FONTS = [
  "Google Sans", "Calibri", "Arial", "Times New Roman", "Cambria", "Georgia", "Garamond",
  "Verdana", "Tahoma", "Trebuchet MS", "Segoe UI", "Book Antiqua",
  "Century Gothic", "Consolas", "Courier New", "Franklin Gothic Medium",
  "Lucida Sans", "Palatino Linotype", "Rockwell", "Corbel", "Constantia",
  "Bookman Old Style", "Candara", "Cabin", "Gill Sans MT", "Impact",
];

const BRANDING_STORAGE_KEY = "synapse-corporate-branding";

export function ExportModal({
  isOpen,
  onClose,
  documentTitle,
  items,
  initialDocTypeId = "narrative",
  initialFormat = "docx",
}: ExportModalProps) {
  // Standard tab state
  const [onlyFinal, setOnlyFinal] = useState(false);
  const [docTypeId, setDocTypeId] = useState<DraftDocTypeId>("narrative");
  const [format, setFormat] = useState<DraftFormat>("docx");
  const [fontName, setFontName] = useState<string>("Google Sans");
  const [customerLogoDataUrl, setCustomerLogoDataUrl] = useState<string>("");
  const [agreedToExport, setAgreedToExport] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [branding, setBranding] = useState<CorporateBranding>(DEFAULT_BRANDING);
  const [preflight, setPreflight] = useState<ExportPreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);

  // In-App Preview Popup state
  const [showPreviewPopup, setShowPreviewPopup] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [reviewViewMode, setReviewViewMode] = useState<"detail" | "compact">("detail");
  const [expandedItemIds, setExpandedItemIds] = useState<Record<string, boolean>>({});
  const [reviewSearch, setReviewSearch] = useState("");

  const handleProcessLogoFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCustomerLogoDataUrl(String(reader.result ?? ""));
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const clipItems = e.clipboardData?.items;
      if (!clipItems) return;
      for (let i = 0; i < clipItems.length; i++) {
        if (clipItems[i].type.startsWith("image/")) {
          const file = clipItems[i].getAsFile();
          if (file) {
            handleProcessLogoFile(file);
            e.preventDefault();
            break;
          }
        }
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showLogoModal) {
          setShowLogoModal(false);
        } else if (showPreviewPopup) {
          setShowPreviewPopup(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, showLogoModal, showPreviewPopup, onClose]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
      if (raw) setBranding({ ...DEFAULT_BRANDING, ...JSON.parse(raw) });
    } catch {
      setBranding(DEFAULT_BRANDING);
    }
  }, []);

  const prevIsOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setExportStep(1);
      setActiveTab("standard");
      setDocTypeId(initialDocTypeId || "narrative");
      setFormat(initialFormat || "docx");
      setAgreedToExport(false);
      setShowPreviewPopup(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [initialDocTypeId, initialFormat, isOpen]);

  // Tab state
  const [activeTab, setActiveTab] = useState<ExportTab>("standard");
  const [exportStep, setExportStep] = useState<ExportStep>(1);

  const goToExportStep = (step: ExportStep) => {
    setExportStep(step);
    setActiveTab(step === 1 ? "standard" : "text");
  };

  const targetItems = items.filter((it) => {
    if (onlyFinal) return it.status === "final";
    return it.status === "final" || it.status === "draft";
  });

  const filteredReviewItems = targetItems.filter((it) => {
    if (!reviewSearch.trim()) return true;
    const q = reviewSearch.toLowerCase();
    return (
      it.title.toLowerCase().includes(q) ||
      it.requirement_text.toLowerCase().includes(q) ||
      it.draft_text.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (!isOpen || targetItems.length === 0) {
      setPreflight(null);
      return;
    }
    let cancelled = false;
    setPreflightLoading(true);
    exportPreflight(
      targetItems.map((it) => ({
        id: it.id,
        title: it.title,
        requirement_text: it.requirement_text,
        category: it.category,
        draft_text: it.draft_text,
        status: it.status,
      })),
      getDocType(docTypeId).backendType,
    )
      .then((report) => { if (!cancelled) setPreflight(report); })
      .catch(() => { if (!cancelled) setPreflight(null); })
      .finally(() => { if (!cancelled) setPreflightLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, targetItems.length, docTypeId]);

  const toggleItemExpanded = (id: string) => {
    setExpandedItemIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleExpandAll = () => {
    const allExpanded = targetItems.every((it) => expandedItemIds[it.id]);
    const next: Record<string, boolean> = {};
    targetItems.forEach((it) => {
      next[it.id] = !allExpanded;
    });
    setExpandedItemIds(next);
  };

  if (!isOpen) return null;

  const compiledText = targetItems
    .map((it, idx) => {
      const response = it.draft_text.trim() || "[Belum ada respons/draf]";
      const cleanTitle = it.title.replace(/\s*\[(teknis|umum|administrative|compliance|pricing)\]\s*/gi, "").trim();
      return `### ${idx + 1}. ${cleanTitle}\n**Cakupan Bagian:**\n> ${it.requirement_text}\n\n**Tanggapan/Spesifikasi Usulan SMG:**\n${response}\n\n---\n`;
    })
    .join("\n");

  const fullExportContent = `# Tanggapan Teknis & Dokumen: ${documentTitle.replace(/\s*\[(teknis|umum|administrative|compliance|pricing)\]\s*/gi, "")}\nTanggal Ekspor: ${new Date().toLocaleDateString("id-ID")}\nFormat Dokumen: ${getDocType(docTypeId).label} (${FORMAT_LABELS[format]})\nTotal Bagian Terjawab: ${targetItems.length} dari ${items.length}\n\n---\n\n${compiledText}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullExportContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  const generateStandardBlob = async (): Promise<{ blob: Blob; ext: "docx" | "pdf" | "pptx"; filenamePrefix: string }> => {
    let figureCounter = 0;
    const mappedItems = targetItems.map((it) => {
      let finalCaption = it.image_caption;
      if (it.image_data_url) {
        figureCounter++;
        const rawDesc = (it.image_caption || it.title)
          .replace(/^(?:Gambar|Figure)\s*\d+(?:\.\d+)*\s*[:.-]?\s*/i, "")
          .trim();
        finalCaption = `Gambar ${figureCounter}: ${rawDesc || it.title}`;
      }
      return {
        id: it.id,
        title: it.title,
        requirement_text: it.requirement_text,
        category: it.category,
        draft_text: it.draft_text,
        status: it.status,
        image_data_url: it.image_data_url,
        image_caption: finalCaption,
      };
    });
    const docType = getDocType(docTypeId);

    if (format === "pptx") {
      const blob = await exportProposalPptx({
        document_title: documentTitle,
        company_name: branding.companyName,
        items: mappedItems,
      });
      return { blob, ext: "pptx", filenamePrefix: docType.fileLabel };
    }
    if (format === "pdf") {
      const blob = await exportProposalPdf({
        document_title: documentTitle,
        template_type: docType.backendType,
        company_name: branding.companyName,
        primary_color: branding.primaryColor,
        accent_color: branding.accentColor,
        footer_text: branding.footerText,
        logo_data_url: branding.logoDataUrl,
        customer_logo_data_url: customerLogoDataUrl,
        items: mappedItems,
      });
      return { blob, ext: "pdf", filenamePrefix: docType.fileLabel };
    }
    const blob = await exportProposalDocx({
      document_title: documentTitle,
      template_type: docType.backendType,
      font_name: fontName,
      company_name: branding.companyName || "PT Smartnet Magna Global (SMG)",
      logo_data_url: branding.logoDataUrl,
      customer_logo_data_url: customerLogoDataUrl,
      items: mappedItems,
    });
    return { blob, ext: "docx", filenamePrefix: docType.fileLabel };
  };

  const handleDownloadDocx = async () => {
    if (targetItems.length === 0) return;
    setDownloadingDocx(true);
    try {
      const { blob, ext, filenamePrefix } = await generateStandardBlob();
      const cleanTitle = documentTitle.replace(/\.[^/.]+$/, "").replace(/\s+/g, "-");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${filenamePrefix}-${cleanTitle}.${ext}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal mengunduh dokumen");
    } finally {
      setDownloadingDocx(false);
    }
  };

  // Opens the in-app popup modal directly without opening external browser windows
  const handleOpenPopupPreview = () => {
    if (targetItems.length === 0) return;
    setShowPreviewPopup(true);
    setAgreedToExport(true);
  };

  const handleDownloadMd = () => {
    const blob = new Blob([fullExportContent], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `proposal-response-${documentTitle.replace(/\.[^/.]+$/, "")}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const STEPS: { key: ExportStep; label: string; caption: string; icon: React.ReactNode }[] = [
    { key: 1, label: "Pilih Dokumen & Generate", caption: "Format output & review", icon: <FileText size={14} /> },
    { key: 2, label: "Salin Teks", caption: "Markdown langsung", icon: <Eye size={14} /> },
  ];

  const currentDateFormatted = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="flex h-[94vh] w-full max-w-5xl flex-col rounded-xl border border-surface-border bg-surface-raised shadow-panel overflow-hidden">
          {/* ── Header ─────────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between border-b border-surface-border px-6 py-3.5 bg-surface">
            <div>
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <span>Kompilasi &amp; Ekspor Proposal</span>
                <span className="text-xs font-normal text-text-muted">
                  ({targetItems.length} butir siap diekspor)
                </span>
              </h3>
              <p className="text-xs text-text-muted">
                Review butir proposal teknis secara detail dan ekspor ke format resmi (.docx / .pptx)
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-text-muted hover:bg-surface-raised hover:text-text-primary transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* ── Export Wizard Steps ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 border-b border-surface-border bg-surface px-3 sm:px-6">
            {STEPS.map((step) => (
              <button
                key={step.key}
                onClick={() => goToExportStep(step.key)}
                className={`flex items-center justify-center gap-2 border-b-2 px-2 py-2 text-xs font-medium transition-all sm:justify-start sm:px-4 ${
                  exportStep === step.key
                    ? "border-accent text-accent-ink font-semibold"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${exportStep >= step.key ? "bg-accent-soft text-accent-ink" : "bg-surface-raised"}`}>
                  {step.icon}
                </span>
                <span className="text-left">
                  <span className="block">{step.key}. {step.label}</span>
                </span>
              </button>
            ))}
          </div>

          {/* ── Tab: Standard Word / PPTX Export ─────────────────────────────────── */}
          {activeTab === "standard" && (
            <>
              {/* ── Compact Format Pill Bar (Replaces giant 3-column cards) ──────── */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface-raised px-6 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-semibold text-text-primary">Format Dokumen:</span>
                  <div className="inline-flex rounded-lg border border-surface-border bg-surface p-0.5 shadow-xs">
                    {EXPORT_PRESETS.map((preset) => {
                      const active = docTypeId === preset.docTypeId && format === preset.format;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setDocTypeId(preset.docTypeId);
                            setFormat(preset.format);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            active
                              ? "bg-[#111827] text-white shadow-xs font-semibold dark:bg-accent dark:text-white"
                              : "text-text-muted hover:text-text-primary hover:bg-surface-raised"
                          }`}
                        >
                          <span className="shrink-0">
                            {preset.format === "docx" ? (
                              <WordIcon size={16} />
                            ) : preset.format === "pptx" ? (
                              <PowerPointIcon size={16} />
                            ) : (
                              <PdfIcon size={16} />
                            )}
                          </span>
                          <span>{preset.label}</span>
                          <span className={`text-[10px] ${active ? "text-white/80" : "text-text-muted"}`}>
                            ({preset.sub.replace(/.*\((.*)\)/, "$1")})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3.5">
                  {format === "docx" && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-text-secondary">Font:</span>
                      <select
                        value={fontName}
                        onChange={(e) => setFontName(e.target.value)}
                        className="rounded border border-surface-border bg-surface px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                      >
                        {MS_WORD_FONTS.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {format === "docx" && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-text-secondary">Logo Klien:</span>
                      {customerLogoDataUrl ? (
                        <div className="flex items-center gap-1.5 rounded-md border border-surface-border bg-surface px-2 py-0.5 shadow-2xs">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={customerLogoDataUrl} alt="Logo customer" className="h-5 w-auto max-w-[80px] rounded object-contain" />
                          <button
                            type="button"
                            onClick={() => setShowLogoModal(true)}
                            className="text-[11px] font-semibold text-accent-ink hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomerLogoDataUrl("")}
                            className="text-[12px] font-bold text-text-muted hover:text-red-500 px-0.5 transition-colors"
                            title="Hapus logo"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowLogoModal(true)}
                          className="cursor-pointer rounded border border-dashed border-surface-border px-2 py-1 text-xs text-text-muted hover:border-accent hover:text-text-primary transition-colors"
                        >
                          + Upload logo
                        </button>
                      )}
                    </div>
                  )}

                  <label className="flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary">
                    <input
                      type="checkbox"
                      checked={onlyFinal}
                      onChange={(e) => setOnlyFinal(e.target.checked)}
                      className="rounded border-surface-border text-accent focus:ring-accent"
                    />
                    <span>Hanya Final ({items.filter((i) => i.status === "final").length})</span>
                  </label>
                </div>
              </div>

              {docTypeId === "narrative" && (
                <div className="flex items-center justify-between border-b border-surface-border bg-accent/5 px-6 py-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink text-[10px] font-bold">
                      ✓
                    </span>
                    <span className="text-text-secondary">
                      <span className="font-semibold text-text-primary">Standar Format Library:</span>{" "}
                      Cover CSUL Resmi (Logo SMG, Prepared By/For Table, Tanggal &amp; Label Proposal) · Document Release Table · Pengakuan Kerahasiaan (NDA) · Tabel &amp; Gambar Otomatis
                    </span>
                  </div>
                  <span className="text-text-muted hidden sm:inline">
                    Font: {fontName}
                  </span>
                </div>
              )}

              {preflightLoading && (
                <div className="border-b border-surface-border bg-surface px-6 py-1.5 text-[11px] text-text-muted flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" /> Memeriksa kesiapan dokumen proposal...
                </div>
              )}

              {/* ── Main Review Area ("Pratinjau Butir") ──────────────────────── */}
              <div className="flex-1 min-h-0 flex flex-col bg-surface/40 overflow-hidden">
                {/* Review Header Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 border-b border-surface-border bg-surface">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                      <FileText size={14} className="text-accent" />
                      Pratinjau Butir Tanggapan ({filteredReviewItems.length} dari {targetItems.length} butir)
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Search inside review */}
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="text"
                        placeholder="Cari bagian..."
                        value={reviewSearch}
                        onChange={(e) => setReviewSearch(e.target.value)}
                        className="rounded-md border border-surface-border bg-surface-raised pl-7 pr-2.5 py-1 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent w-36 sm:w-48"
                      />
                    </div>

                    {/* View Mode Switcher */}
                    <div className="inline-flex rounded border border-surface-border bg-surface-raised p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setReviewViewMode("detail")}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          reviewViewMode === "detail"
                            ? "bg-accent text-white font-semibold"
                            : "text-text-muted hover:text-text-primary"
                        }`}
                      >
                        Tampilan Lengkap
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewViewMode("compact")}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          reviewViewMode === "compact"
                            ? "bg-accent text-white font-semibold"
                            : "text-text-muted hover:text-text-primary"
                        }`}
                      >
                        Tampilan Ringkas
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={toggleExpandAll}
                      className="text-[11px] text-text-muted hover:text-text-primary underline"
                    >
                      Buka/Tutup Semua
                    </button>
                  </div>
                </div>

                {/* Review Items Container */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                  {targetItems.length === 0 ? (
                    <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-text-muted">
                      <AlertCircle size={32} />
                      <p className="text-sm font-medium text-text-primary">Belum ada bagian Draf atau Final.</p>
                      <p className="text-xs">Ubah status bagian di halaman utama terlebih dahulu.</p>
                    </div>
                  ) : filteredReviewItems.length === 0 ? (
                    <div className="p-8 text-center text-xs text-text-muted">
                      Tidak ada bagian yang cocok dengan kata kunci pencarian &quot;{reviewSearch}&quot;.
                    </div>
                  ) : (
                    filteredReviewItems.map((it, idx) => {
                      const isExpanded = reviewViewMode === "detail" || Boolean(expandedItemIds[it.id]);
                      const hasImage = Boolean(it.image_data_url);

                      return (
                        <div
                          key={it.id}
                          className="rounded-xl border border-surface-border bg-surface-raised shadow-xs transition-all hover:border-accent/40 overflow-hidden"
                        >
                          {/* Item Header */}
                          <div
                            onClick={() => toggleItemExpanded(it.id)}
                            className="flex items-center justify-between gap-3 p-3.5 cursor-pointer bg-surface/50 hover:bg-surface transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-ink font-mono text-[11px] font-bold">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <h4 className="text-xs font-semibold text-text-primary truncate">
                                  {it.title.replace(/\s*\[(teknis|umum|administrative|compliance|pricing)\]\s*/gi, "").trim()}
                                </h4>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-muted">
                                  {it.category && !it.category.match(/^(teknis|umum)$/i) && (
                                    <span className="rounded bg-surface px-1.5 py-0.2 border border-surface-border font-medium">
                                      {it.category}
                                    </span>
                                  )}
                                  {hasImage && (
                                    <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60 flex items-center gap-1 font-medium">
                                      🖼️ Aset Gambar Terpasang
                                    </span>
                                  )}
                                  <span>· {it.draft_text ? `${it.draft_text.split(/\s+/).length} kata` : "Kosong"}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`text-[10px] font-bold rounded-full px-2.5 py-0.5 ${
                                  it.status === "final"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-amber-50 text-amber-800 border border-amber-200"
                                }`}
                              >
                                {it.status.toUpperCase()}
                              </span>
                              <button
                                type="button"
                                className="p-1 text-text-muted hover:text-text-primary"
                              >
                                {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                              </button>
                            </div>
                          </div>

                          {/* Item Body (When Expanded) */}
                          {isExpanded && (
                            <div className="p-4 border-t border-surface-border space-y-3 bg-surface-raised">
                              {/* Requirement Scope Box */}
                              <div className="rounded-lg bg-surface p-3 border-l-4 border-accent text-xs">
                                <div className="font-semibold text-text-secondary text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1">
                                  <span>Cakupan Ketentuan TOR:</span>
                                </div>
                                <p className="text-text-secondary italic leading-relaxed whitespace-pre-wrap">
                                  {it.requirement_text || "Tidak ada rincian TOR spesifik."}
                                </p>
                              </div>

                              {/* Presales Solution Draft Box */}
                              <div className="rounded-lg bg-white dark:bg-zinc-900 border border-surface-border p-3.5 text-xs text-text-primary shadow-xs">
                                <div className="font-semibold text-accent-ink text-[11px] uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                  <span>✍️ Tanggapan &amp; Usulan Solusi SMG:</span>
                                  <span className="text-[10px] font-normal text-text-muted">
                                    Format: Paragraf &amp; Tabel Teknis
                                  </span>
                                </div>
                                <div className="leading-relaxed whitespace-pre-wrap font-sans text-xs text-text-primary">
                                  {it.draft_text ? (
                                    cleanLatexMath(it.draft_text)
                                  ) : (
                                    <span className="text-text-muted italic">
                                      [Belum ada tanggapan yang ditulis untuk butir ini]
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Image Preview Thumbnail if attached */}
                              {hasImage && it.image_data_url && (
                                <div className="rounded-lg border border-surface-border bg-surface p-2.5 flex items-center gap-3">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={it.image_data_url}
                                    alt={it.image_caption || it.title}
                                    className="h-16 w-28 object-contain rounded border border-surface-border bg-white"
                                  />
                                  <div className="text-xs">
                                    <p className="font-semibold text-text-primary">
                                      {it.image_caption || "Gambar Visualisasi Solusi"}
                                    </p>
                                    <p className="text-[11px] text-text-muted">
                                      Akan otomatis dicantumkan di bawah tanggapan dan masuk ke Daftar Gambar.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── Bottom Action Footer ────────────────────────────────────────── */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-surface-border px-6 py-3.5 bg-surface">
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleOpenPopupPreview}
                    disabled={targetItems.length === 0}
                    className="min-w-[170px] bg-surface hover:bg-surface-raised border border-surface-border text-text-primary font-medium text-xs shadow-xs"
                  >
                    <Eye size={14} className="mr-1.5 text-accent" />
                    Preview Dokumen (Pop-up)
                  </Button>

                  <label className="flex items-center gap-2 text-xs cursor-pointer text-text-secondary select-none">
                    <input
                      type="checkbox"
                      checked={agreedToExport}
                      onChange={(e) => setAgreedToExport(e.target.checked)}
                      className="rounded border-surface-border text-accent focus:ring-accent"
                    />
                    <span>Setuju untuk export dokumen ini</span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleDownloadDocx}
                    disabled={targetItems.length === 0 || downloadingDocx || !agreedToExport}
                    className="bg-[#111827] hover:bg-black text-white min-w-[210px] text-xs font-semibold shadow-sm disabled:opacity-50"
                  >
                    {downloadingDocx ? (
                      <><Loader2 size={14} className="mr-1.5 animate-spin" />Membuat File...</>
                    ) : format === "pptx" ? (
                      <><Presentation size={14} className="mr-1.5 text-accent" />Generate Document (.pptx)</>
                    ) : format === "pdf" ? (
                      <><FileDown size={14} className="mr-1.5 text-accent" />Generate Document (.pdf)</>
                    ) : (
                      <><FileDown size={14} className="mr-1.5 text-accent" />Generate Document (.docx)</>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ── Tab: Plain Text / Markdown ──────────────────────────────────── */}
          {activeTab === "text" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface px-6 py-3 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary">
                  <input
                    type="checkbox"
                    checked={onlyFinal}
                    onChange={(e) => setOnlyFinal(e.target.checked)}
                    className="rounded border-surface-border text-accent focus:ring-accent"
                  />
                  <span>Hanya Final ({items.filter((i) => i.status === "final").length})</span>
                </label>
                <span className="text-text-muted">{targetItems.length} bagian · format Markdown</span>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-surface/30">
                {targetItems.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-text-muted">
                    <AlertCircle size={32} />
                    <p className="text-sm font-medium text-text-primary">Belum ada bagian Draf atau Final.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
                    <div className="font-mono text-xs text-text-primary leading-relaxed whitespace-pre-wrap selection:bg-accent-soft max-h-[450px] overflow-y-auto pr-2">
                      {fullExportContent}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border px-6 py-4 bg-surface-raised">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadMd}
                  disabled={targetItems.length === 0}
                  className="text-xs"
                >
                  <FileDown size={13} className="mr-1" />
                  Download .md
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCopy}
                  disabled={targetItems.length === 0}
                  className="bg-[#111827] hover:bg-black text-white min-w-[130px]"
                >
                  {copied ? (
                    <><Check size={13} className="mr-1 text-emerald-400" />Tersalin!</>
                  ) : (
                    <><Copy size={13} className="mr-1" />Salin Semua Teks</>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── MODAL UPLOAD / DRAG & DROP / PASTE LOGO ──────────────────────── */}
      {showLogoModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface-raised p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <h4 className="text-sm font-bold text-text-primary">Upload Logo Klien (Cover Proposal)</h4>
              <button
                type="button"
                onClick={() => setShowLogoModal(false)}
                className="rounded p-1 text-text-muted hover:bg-surface hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>

            {customerLogoDataUrl ? (
              <div className="space-y-4 text-center">
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-emerald-300/80 bg-emerald-50/40 p-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={customerLogoDataUrl}
                    alt="Pratinjau Logo"
                    className="max-h-28 w-auto rounded border border-surface-border bg-white p-2 object-contain shadow-xs"
                  />
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 mt-1">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>Logo berhasil dimuat &amp; siap dipasang di Cover!</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogoModal(false)}
                    className="rounded-lg bg-ink-900 px-4 py-2 text-xs font-bold text-white shadow-subtle hover:bg-ink-800 transition-colors"
                  >
                    Gunakan Logo Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerLogoDataUrl("")}
                    className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Ganti / Upload Lain
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Drag and Drop Zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleProcessLogoFile(file);
                  }}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-border bg-surface/50 p-6 text-center transition-colors hover:border-accent"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                    <UploadCloud size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-primary">
                      Tarik &amp; lepas file logo ke sini
                    </p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Mendukung PNG, JPEG, SVG, WebP transparan
                    </p>
                  </div>

                  <div className="my-1 flex items-center gap-2 text-[10px] text-text-muted">
                    <span className="h-px w-8 bg-surface-border" />
                    <span>atau</span>
                    <span className="h-px w-8 bg-surface-border" />
                  </div>

                  <label className="cursor-pointer rounded-md bg-[#111827] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-black transition-colors">
                    Pilih File dari Komputer
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProcessLogoFile(file);
                      }}
                    />
                  </label>
                </div>

                {/* Paste Hint */}
                <div className="rounded-lg bg-accent-soft/40 border border-accent/20 p-2.5 text-center text-xs text-accent-ink">
                  <strong>Tips Cepat:</strong> Anda juga bisa langsung menekan <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold shadow-xs">Ctrl + V</kbd> untuk menempel logo dari clipboard.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── IN-APP DOCUMENT PREVIEW POPUP (No new browser tab!) ────────────── */}
      {showPreviewPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-2 sm:p-6 backdrop-blur-md animate-in fade-in duration-150">
          <div className="flex h-[96vh] w-full max-w-5xl flex-col rounded-xl border border-surface-border bg-slate-100 dark:bg-zinc-950 shadow-2xl overflow-hidden">
            {/* Popup Header */}
            <div className="flex items-center justify-between border-b border-surface-border px-6 py-3 bg-white dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
                  <WordIcon size={18} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-text-primary truncate max-w-md">
                    Pratinjau Dokumen: {documentTitle}
                  </h3>
                  <p className="text-[11px] text-text-muted">
                    Layout resmi Proposal Teknis Enterprise PT Smartnet Magna Global
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleDownloadDocx}
                  disabled={downloadingDocx}
                  className="bg-[#111827] hover:bg-black text-white text-xs font-semibold shadow-xs"
                >
                  {downloadingDocx ? (
                    <><Loader2 size={13} className="mr-1.5 animate-spin" />Membuat File...</>
                  ) : (
                    <><FileDown size={13} className="mr-1.5 text-accent" />Unduh Dokumen Sekarang (.docx)</>
                  )}
                </Button>

                <button
                  onClick={() => setShowPreviewPopup(false)}
                  className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
                  title="Tutup Pratinjau"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Quick Navigation Jump Bar (Comprehensive: Cover to Last Sub-Bab) */}
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 px-4 sm:px-6 py-2 text-xs scrollbar-thin">
              <span className="text-[11px] font-bold text-text-muted shrink-0 mr-1">Navigasi Cepat:</span>
              {[
                { label: "Cover Depan", id: "preview-page-cover" },
                { label: "Document Release", id: "preview-page-release" },
                { label: "Pengakuan Kerahasiaan", id: "preview-page-nda" },
                { label: "Daftar Isi", id: "preview-page-toc" },
                ...targetItems.map((it) => ({
                  label: it.title.replace(/\s*\[(teknis|umum|administrative|compliance|pricing)\]\s*/gi, "").trim(),
                  id: `preview-item-${it.id}`,
                })),
              ].map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(link.id);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-zinc-800 text-[11px] text-text-secondary hover:text-text-primary hover:bg-accent-soft hover:text-accent-ink border border-slate-200 dark:border-zinc-700 hover:border-accent transition-colors shrink-0 shadow-2xs whitespace-nowrap"
                >
                  {link.label}
                </button>
              ))}
            </div>

            {/* Realistic A4 Document Pages View */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 bg-slate-200/80 dark:bg-zinc-950/80">
              {/* PAGE 1: AUTHENTIC CSUL COVER (Image 3 Ground Truth) */}
              <div
                id="preview-page-cover"
                className="mx-auto max-w-3xl min-h-[960px] bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col justify-between border border-slate-300 text-slate-800 relative font-['Google_Sans',sans-serif]"
              >
                {/* Top Wave Graphic Header */}
                <div className="w-full relative h-40 overflow-hidden shrink-0">
                  <svg
                    viewBox="0 0 800 200"
                    preserveAspectRatio="none"
                    className="w-full h-full"
                  >
                    <path
                      d="M0,0 L800,0 L800,90 C620,170 420,180 260,110 C140,55 60,70 0,110 Z"
                      fill="#154360"
                    />
                    <path
                      d="M0,0 L800,0 L800,75 C600,150 400,165 240,95 C120,40 50,60 0,95 Z"
                      fill="#1F618D"
                      opacity="0.85"
                    />
                    <path
                      d="M0,0 L800,0 L800,55 C640,125 430,140 280,80 C150,30 70,45 0,75 Z"
                      fill="#2980B9"
                      opacity="0.75"
                    />
                  </svg>
                </div>

                {/* Center Content Frame */}
                <div className="flex-1 flex flex-col justify-center px-12 sm:px-16 py-8 space-y-10 text-center">
                  {/* Title and Project Name */}
                  <div className="space-y-3">
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#1155CC] tracking-tight">
                      Proposal Teknis
                    </h1>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-800 max-w-xl mx-auto leading-snug">
                      {documentTitle.replace(/\s*\[(teknis|umum|administrative|compliance|pricing)\]\s*/gi, "")}
                    </h2>
                  </div>

                  {/* Prepared by & Prepared for Columns (Matching Image 3) */}
                  <div className="grid grid-cols-2 gap-8 max-w-xl mx-auto w-full pt-4">
                    {/* Prepared By (PT Smartnet Magna Global) */}
                    <div className="flex flex-col items-center justify-start space-y-2">
                      <span className="text-xs font-semibold text-slate-700">
                        Prepared by
                      </span>
                      <div className="h-12 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/assets/magna_cti_logo.png"
                          alt="Magna Logo"
                          className="max-h-11 w-auto object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      </div>
                      <p className="text-xs font-medium text-slate-800">
                        PT. Smartnet Magna Global
                      </p>
                    </div>

                    {/* Prepared For (Customer / CSUL Finance) */}
                    <div className="flex flex-col items-center justify-start space-y-2">
                      <span className="text-xs font-semibold text-slate-700">
                        Prepared for
                      </span>
                      <div className="h-14 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={customerLogoDataUrl || "/assets/csul_finance_logo.png"}
                          alt="Customer Logo"
                          className="h-14 max-h-16 w-auto object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      </div>
                      <p className="text-xs font-medium text-slate-800 max-w-[220px]">
                        PT Chandra Sakti Utama Leasing (CSUL Finance)
                      </p>
                    </div>
                  </div>

                  {/* Date & Bold Tag */}
                  <div className="space-y-3 pt-6">
                    <p className="text-xs font-medium text-slate-600">
                      {currentDateFormatted}
                    </p>
                    <div className="text-sm font-black text-slate-900 tracking-wider">
                      Proposal
                    </div>
                  </div>
                </div>

                {/* Bottom Wave Graphic Footer */}
                <div className="w-full relative h-44 overflow-hidden shrink-0">
                  <svg
                    viewBox="0 0 800 220"
                    preserveAspectRatio="none"
                    className="w-full h-full"
                  >
                    <path
                      d="M0,130 C120,70 320,80 500,160 C640,220 740,190 800,140 L800,220 L0,220 Z"
                      fill="#154360"
                    />
                    <path
                      d="M0,145 C150,90 350,105 520,175 C660,230 750,205 800,160 L800,220 L0,220 Z"
                      fill="#1F618D"
                      opacity="0.85"
                    />
                    <path
                      d="M0,165 C180,115 370,130 550,190 C680,240 760,220 800,180 L800,220 L0,220 Z"
                      fill="#2980B9"
                      opacity="0.75"
                    />
                  </svg>
                </div>
              </div>

              {/* PAGE 2: DOCUMENT RELEASE TABLE (Image 4 Ground Truth) */}
              <div
                id="preview-page-release"
                className="mx-auto max-w-3xl min-h-[900px] bg-white rounded-lg shadow-2xl p-10 sm:p-14 border border-slate-300 text-slate-800 flex flex-col justify-between font-['Google_Sans',sans-serif]"
              >
                <div>
                  {/* Running Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-300 mb-8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/assets/magna_cti_logo.png"
                      alt="Magna"
                      className="h-16 max-w-[240px] object-contain"
                      onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={customerLogoDataUrl || "/assets/csul_finance_logo.png"}
                      alt="Customer"
                      className="h-16 max-w-[240px] object-contain"
                      onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                    />
                  </div>

                  {/* Heading */}
                  <h2 className="text-xl font-bold text-[#1155CC] mb-6">
                    Document Release
                  </h2>

                  {/* 5-Column Document Release Table */}
                  <div className="overflow-hidden border border-slate-900 rounded-xs">
                    <table className="w-full text-xs text-center border-collapse">
                      <thead className="bg-[#BFBFBF] text-slate-900 font-bold border-b border-slate-900">
                        <tr>
                          <th className="p-2.5 border-r border-slate-900 font-bold">Version</th>
                          <th className="p-2.5 border-r border-slate-900 font-bold">Date Release</th>
                          <th className="p-2.5 border-r border-slate-900 font-bold">Change Information</th>
                          <th className="p-2.5 border-r border-slate-900 font-bold">Related Page</th>
                          <th className="p-2.5 font-bold">Change</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-400 text-slate-800 font-medium">
                        <tr>
                          <td className="p-2.5 border-r border-slate-900">1.0</td>
                          <td className="p-2.5 border-r border-slate-900">{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-")}</td>
                          <td className="p-2.5 border-r border-slate-900">N/A</td>
                          <td className="p-2.5 border-r border-slate-900">N/A</td>
                          <td className="p-2.5">1<sup>st</sup> Draft</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[11px] text-slate-500 mt-6 italic">
                    * Riwayat rilis dan revisi dokumen ini mencatat seluruh pembaruan teknis serta hasil klarifikasi teknis (Aanwijzing).
                  </p>
                </div>

                {/* Running Footer */}
                <div className="pt-3 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-400">
                  <span>PT. Smartnet Magna Global</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[#1155CC] font-semibold">1</span>
                    <span className="text-[#1155CC]">Proposal - Confidential</span>
                  </div>
                </div>
              </div>

              {/* PAGE 3: PENGAKUAN KERAHASIAAN */}
              <div
                id="preview-page-nda"
                className="mx-auto max-w-3xl min-h-[900px] bg-white rounded-lg shadow-2xl p-10 sm:p-14 border border-slate-300 text-slate-800 flex flex-col justify-between font-['Google_Sans',sans-serif]"
              >
                <div>
                  {/* Running Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-300 mb-8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/assets/magna_cti_logo.png"
                      alt="Magna"
                      className="h-16 max-w-[240px] object-contain"
                      onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={customerLogoDataUrl || "/assets/csul_finance_logo.png"}
                      alt="Customer"
                      className="h-16 max-w-[240px] object-contain"
                      onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                    />
                  </div>

                  <h2 className="text-xl font-bold text-[#1155CC] mb-6 flex items-center gap-2">
                    <ShieldCheck size={20} className="text-[#1155CC]" />
                    Pengakuan Kerahasiaan
                  </h2>
                  <div className="space-y-4 text-xs text-slate-700 leading-relaxed text-justify">
                    <p>
                      Dokumen Proposal Teknis ini beserta seluruh data pendukung, konfigurasi topologi perangkat, diagram arsitektur, dan spesifikasi solusi merupakan informasi rahasia serta hak kekayaan intelektual milik <strong className="text-slate-900">PT. Smartnet Magna Global</strong>.
                    </p>
                    <p>
                      Dokumen ini diserahkan secara khusus dan terbatas kepada <strong className="text-slate-900">{
                        documentTitle.toLowerCase().includes("smbc") ? "PT Bank SMBC Indonesia Tbk" :
                        documentTitle.toLowerCase().includes("csul") ? "PT Chandra Sakti Utama Leasing (CSUL Finance)" :
                        "Klien / Calon Pengguna Jasa"
                      }</strong> hanya untuk keperluan evaluasi teknis pengadaan. Pihak penerima dilarang keras menggandakan, menyebarluaskan, memperlihatkan kepada pihak ketiga, atau memanfaatkan sebagian maupun seluruh isi dokumen ini di luar tujuan evaluasi resmi tanpa persetujuan tertulis terlebih dahulu dari <strong className="text-slate-900">PT. Smartnet Magna Global</strong>.
                    </p>
                    <p className="italic text-slate-500 pt-3 border-t border-slate-100">
                      Seluruh komitmen teknis, tata kelola SLA, dan metodologi implementasi yang diajukan tunduk pada ketentuan kontrak final yang akan disepakati bersama antara para pihak.
                    </p>
                  </div>
                </div>

                {/* Running Footer */}
                <div className="pt-3 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-400">
                  <span>PT. Smartnet Magna Global</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[#1155CC] font-semibold">2</span>
                    <span className="text-[#1155CC]">Proposal - Confidential</span>
                  </div>
                </div>
              </div>

              {/* PAGE 4: DAFTAR ISI */}
              <div
                id="preview-page-toc"
                className="mx-auto max-w-3xl min-h-[900px] bg-white rounded-lg shadow-2xl p-10 sm:p-14 border border-slate-300 text-slate-800 flex flex-col justify-between font-['Google_Sans',sans-serif]"
              >
                <div>
                  {/* Running Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-300 mb-8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/assets/magna_cti_logo.png"
                      alt="Magna"
                      className="h-16 max-w-[240px] object-contain"
                      onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={customerLogoDataUrl || "/assets/csul_finance_logo.png"}
                      alt="Customer"
                      className="h-16 max-w-[240px] object-contain"
                      onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                    />
                  </div>

                  <h2 className="text-xl font-bold text-[#1155CC] mb-6">
                    Daftar Isi
                  </h2>
                  <div className="space-y-2.5 text-xs font-medium">
                    <div className="flex items-center justify-between font-bold text-slate-900 border-b border-dotted border-slate-200 pb-1">
                      <span>Document Release</span>
                      <span className="text-slate-500 font-mono">1</span>
                    </div>
                    <div className="flex items-center justify-between font-bold text-slate-900 border-b border-dotted border-slate-200 pb-1">
                      <span>Pengakuan Kerahasiaan</span>
                      <span className="text-slate-500 font-mono">2</span>
                    </div>
                    <div className="flex items-center justify-between font-bold text-slate-900 border-b border-dotted border-slate-200 pb-1">
                      <span>Daftar Isi</span>
                      <span className="text-slate-500 font-mono">3</span>
                    </div>
                    {targetItems.map((it, idx) => {
                      const cleanT = it.title.replace(/\s*\[(teknis|umum|administrative|compliance|pricing)\]\s*/gi, "").trim();
                      const isL1 = !cleanT.includes(".") || cleanT.match(/^Bab\s+\d+/i);
                      return (
                        <div
                          key={it.id}
                          className={`flex items-center justify-between border-b border-dotted border-slate-200 pb-1 ${
                            isL1 ? "font-bold text-[#1155CC] pt-1" : "text-slate-700 pl-4"
                          }`}
                        >
                          <span className="truncate pr-4">{cleanT}</span>
                          <span className="text-slate-400 font-mono shrink-0">{idx + 4}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Running Footer */}
                <div className="pt-3 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-400">
                  <span>PT. Smartnet Magna Global</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[#1155CC] font-semibold">3</span>
                    <span className="text-[#1155CC]">Proposal - Confidential</span>
                  </div>
                </div>
              </div>

              {/* PAGE 5+: SECTIONS & RESPONSES */}
              <div
                id="preview-page-content"
                className="mx-auto max-w-3xl min-h-[900px] bg-white rounded-lg shadow-2xl p-10 sm:p-14 border border-slate-300 text-slate-800 flex flex-col justify-between font-['Google_Sans',sans-serif]"
              >
                <div>
                  {/* Running Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-300 mb-8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/assets/magna_cti_logo.png"
                      alt="Magna"
                      className="h-16 max-w-[240px] object-contain"
                      onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={customerLogoDataUrl || "/assets/csul_finance_logo.png"}
                      alt="Customer"
                      className="h-16 max-w-[240px] object-contain"
                      onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                    />
                  </div>

                  <div className="space-y-8">
                    {targetItems.map((it, idx) => {
                      const cleanTitle = it.title.replace(/\s*\[(teknis|umum|administrative|compliance|pricing)\]\s*/gi, "").trim();
                      const isL1 = !cleanTitle.includes(".") || cleanTitle.match(/^Bab\s+\d+/i);
                      const isL2 = cleanTitle.split(".").length === 2;

                      return (
                        <div key={it.id} className="border-b border-slate-100 pb-8 last:border-b-0 space-y-3">
                          {/* Heading with CSUL Hierarchy */}
                          <h3
                            className={`font-bold tracking-tight ${
                              isL1
                                ? "text-lg text-[#1155CC] border-b border-blue-100 pb-1.5"
                                : isL2
                                ? "text-base text-[#1F497D]"
                                : "text-sm text-[#1F497D]"
                            }`}
                          >
                            {cleanTitle}
                          </h3>

                          {/* Scope / Requirement */}
                          <div className="rounded-md bg-slate-50 border-l-2 border-slate-300 p-2.5 text-xs text-slate-600 italic">
                            {it.requirement_text}
                          </div>

                          {/* Response Text (Justified / Rata Kiri-Kanan) */}
                          <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap text-justify pt-1">
                            {cleanLatexMath(it.draft_text || "[Belum ada tanggapan]")}
                          </div>

                          {/* Image if any */}
                          {it.image_data_url && (() => {
                            const itemsWithImg = targetItems.filter((t) => Boolean(t.image_data_url));
                            const imgIdx = itemsWithImg.findIndex((t) => t.id === it.id);
                            const figureNumber = imgIdx >= 0 ? imgIdx + 1 : 1;
                            const rawDesc = (it.image_caption || cleanTitle)
                              .replace(/^(?:Gambar|Figure)\s*\d+(?:\.\d+)*\s*[:.-]?\s*/i, "")
                              .trim();
                            const figureCaption = `Gambar ${figureNumber}: ${rawDesc || cleanTitle}`;

                            return (
                              <div className="my-4 text-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={it.image_data_url}
                                  alt={figureCaption}
                                  className="max-h-72 mx-auto rounded border border-slate-200 shadow-sm object-contain"
                                />
                                <p className="text-[11px] text-slate-700 italic mt-1.5 font-semibold">
                                  {figureCaption}
                                </p>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Running Footer */}
                <div className="pt-3 mt-8 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-400">
                  <span>PT. Smartnet Magna Global</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[#1155CC] font-semibold">4</span>
                    <span className="text-[#1155CC]">Proposal - Confidential</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Popup Bottom Bar */}
            <div className="flex items-center justify-between border-t border-surface-border px-6 py-3 bg-white dark:bg-zinc-900">
              <span className="text-xs text-text-muted">
                Semua butir telah dikompilasi ke format Word resmi (.docx). Siap untuk unduh.
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowPreviewPopup(false)}
                  className="text-xs"
                >
                  Kembali ke Ringkasan
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleDownloadDocx}
                  disabled={downloadingDocx}
                  className="bg-[#111827] hover:bg-black text-white text-xs font-semibold"
                >
                  {downloadingDocx ? (
                    <><Loader2 size={13} className="mr-1.5 animate-spin" />Membuat File...</>
                  ) : (
                    <><FileDown size={13} className="mr-1.5 text-accent" />Unduh Sekarang (.docx)</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
