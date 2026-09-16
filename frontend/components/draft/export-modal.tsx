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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  exportProposalDocx,
  exportProposalPptx,
  exportProposalPdf,
  convertOfficeToPdf,
  exportPreflight,
  type ExportPreflightResult,
} from "@/lib/api";
import type { RequirementItem, IndexedDocument } from "@/lib/types";
import { FORMAT_LABELS, getDocType, type DraftDocTypeId, type DraftFormat } from "@/lib/document-types";

// The export menu is deliberately just these three — presales only ever ships
// one of these three combos; a free doc-type x format matrix confused users.
const EXPORT_PRESETS: Array<{ docTypeId: DraftDocTypeId; format: DraftFormat; icon: string; label: string; sub: string }> = [
  { docTypeId: "narrative", format: "docx", icon: "📄", label: "Proposal Teknis", sub: "Word (.docx)" },
  { docTypeId: "sow", format: "docx", icon: "📋", label: "Scope of Work", sub: "Word (.docx)" },
  { docTypeId: "pitch_deck", format: "pptx", icon: "📊", label: "Presentation / Pitch Deck", sub: "PowerPoint (.pptx)" },
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

// Standard fonts bundled with Microsoft Word / Microsoft 365, plus Google Sans.
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
  // ── Standard tab state
  const [onlyFinal, setOnlyFinal] = useState(false);
  const [docTypeId, setDocTypeId] = useState<DraftDocTypeId>("narrative");
  const [format, setFormat] = useState<DraftFormat>("docx");
  const [fontName, setFontName] = useState<string>("Google Sans");
  const [customerLogoDataUrl, setCustomerLogoDataUrl] = useState<string>("");
  const [previewedOnce, setPreviewedOnce] = useState(false);
  const [agreedToExport, setAgreedToExport] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [previewingPdf, setPreviewingPdf] = useState(false);
  const [branding, setBranding] = useState<CorporateBranding>(DEFAULT_BRANDING);
  const [preflight, setPreflight] = useState<ExportPreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);

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
      setDocTypeId(initialDocTypeId);
      setFormat(initialFormat);
      setPreviewedOnce(false);
      setAgreedToExport(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [initialDocTypeId, initialFormat, isOpen]);

  // ── Tab state
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

  // Any change to what will actually be generated invalidates the last preview —
  // force a fresh look before the export gets re-armed.
  useEffect(() => {
    setPreviewedOnce(false);
    setAgreedToExport(false);
  }, [docTypeId, format, fontName, customerLogoDataUrl, onlyFinal]);


  if (!isOpen) return null;

  const compiledText = targetItems
    .map((it, idx) => {
      const response = it.draft_text.trim() || "[Belum ada respons/draf]";
      return `### ${idx + 1}. ${it.title} [${it.category}]\n**Cakupan Bagian:**\n> ${it.requirement_text}\n\n**Tanggapan/Spesifikasi Usulan SMG:**\n${response}\n\n---\n`;
    })
    .join("\n");

  const fullExportContent = `# Tanggapan Teknis & Dokumen: ${documentTitle}\nTanggal Ekspor: ${new Date().toLocaleDateString("id-ID")}\nFormat Dokumen: ${getDocType(docTypeId).label} (${FORMAT_LABELS[format]})\nTotal Bagian Terjawab: ${targetItems.length} dari ${items.length}\n\n---\n\n${compiledText}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullExportContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  // Builds the export file for the current Jenis Dokumen/Format choice, without
  // triggering a download — shared by the preview step and the final generate step.
  const generateStandardBlob = async (): Promise<{ blob: Blob; ext: "docx" | "pdf" | "pptx"; filenamePrefix: string }> => {
    const mappedItems = targetItems.map((it) => ({
      id: it.id,
      title: it.title,
      requirement_text: it.requirement_text,
      category: it.category,
      draft_text: it.draft_text,
      status: it.status,
      image_data_url: it.image_data_url,
      image_caption: it.image_caption,
    }));
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

  const handlePreviewPdf = async () => {
    if (targetItems.length === 0 || previewingPdf) return;
    setPreviewingPdf(true);
    try {
      const { blob, ext } = await generateStandardBlob();
      // Non-PDF formats get converted so the preview mirrors real fonts/bold/italic,
      // not just a plain-text approximation.
      const pdfBlob = ext === "pdf" ? blob : await convertOfficeToPdf(blob, `preview.${ext}`);
      const url = URL.createObjectURL(pdfBlob);
      const previewWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (!previewWindow) {
        URL.revokeObjectURL(url);
        alert("Preview diblokir browser. Izinkan pop-up untuk membuka dokumen.");
      } else {
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setPreviewedOnce(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal membuka preview dokumen");
    } finally {
      setPreviewingPdf(false);
    }
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
    { key: 1, label: "Pilih Dokumen & Generate", caption: "Format output", icon: <FileText size={14} /> },
    { key: 2, label: "Salin Teks", caption: "Markdown", icon: <Eye size={14} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-surface-border bg-surface-raised shadow-panel">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-text-primary">
              Kompilasi &amp; Ekspor Proposal
            </h3>
            <p className="text-xs text-text-muted">
              Proposal Teknis, Scope of Work, atau Pitch Deck — siap unduh
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Export Wizard Steps ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 border-b border-surface-border bg-surface px-3 sm:px-4">
          {STEPS.map((step) => (
            <button
              key={step.key}
              onClick={() => goToExportStep(step.key)}
              className={`flex items-center justify-center gap-2 border-b-2 px-2 py-2.5 text-xs font-medium transition-all sm:justify-start sm:px-4 ${
                exportStep === step.key
                  ? "border-accent text-accent-ink"
                  : "border-transparent text-text-muted hover:text-text-primary"
              }`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${exportStep >= step.key ? "bg-accent-soft text-accent-ink" : "bg-surface-raised"}`}>
                {step.icon}
              </span>
              <span className="text-left">
                <span className="block">{step.key}. {step.label}</span>
                <span className="hidden text-[10px] font-normal text-text-muted sm:block">{step.caption}</span>
              </span>
            </button>
          ))}
        </div>

        {/* ── Tab: Standard Word / PPTX Export ─────────────────────────────────── */}
        {activeTab === "standard" && (
          <>
            {/* The 3 outputs presales actually ships — no doc-type x format matrix to get lost in */}
            <div className="grid grid-cols-1 gap-2.5 border-b border-surface-border bg-surface px-6 py-4 sm:grid-cols-3">
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
                    className={`flex flex-col items-center gap-1 rounded-xl border p-3.5 text-center transition-all active:scale-[0.98] ${
                      active
                        ? "border-accent bg-accent-soft shadow-subtle ring-1 ring-accent"
                        : "border-surface-border bg-surface-raised hover:border-accent/50"
                    }`}
                  >
                    <span className="text-xl">{preset.icon}</span>
                    <span className={`text-xs font-semibold ${active ? "text-accent-ink" : "text-text-primary"}`}>
                      {preset.label}
                    </span>
                    <span className="text-[10px] text-text-muted">{preset.sub}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface px-6 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                {format === "docx" && (
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-text-primary">Font:</span>
                    <select
                      value={fontName}
                      onChange={(e) => setFontName(e.target.value)}
                      className="rounded border border-surface-border bg-surface-raised px-2.5 py-1 text-xs text-text-primary outline-none focus:border-accent"
                    >
                      {MS_WORD_FONTS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                )}

                {format === "docx" && (
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-text-primary">Logo Customer:</span>
                    {customerLogoDataUrl ? (
                      <div className="flex items-center gap-1.5">
                        <img src={customerLogoDataUrl} alt="Logo customer" className="h-6 w-auto rounded border border-surface-border bg-white p-0.5" />
                        <button
                          type="button"
                          onClick={() => setCustomerLogoDataUrl("")}
                          className="text-[11px] text-red-600 hover:underline"
                        >
                          Hapus
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer rounded border border-dashed border-surface-border px-2.5 py-1 text-xs text-text-muted hover:border-accent hover:text-text-primary">
                        Upload logo...
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => setCustomerLogoDataUrl(String(reader.result ?? ""));
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
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

            {docTypeId === "narrative" && (
              <div className="flex items-center gap-2 border-b border-surface-border bg-accent/5 px-6 py-2.5 text-xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink text-[11px] font-bold">
                  ✓
                </span>
                <span className="text-text-secondary">
                  <span className="font-semibold text-text-primary">Format Standar:</span>{" "}
                  Proposal Teknis Enterprise PT Smartnet Magna Global (Layout Cover CSUL, Penomoran Bab/Sub-bab Hierarkis, Font Google Sans, Gambar &amp; Tabel Otomatis)
                </span>
              </div>
            )}

            {preflightLoading && (
              <div className="border-b border-surface-border bg-surface px-6 py-2 text-[11px] text-text-muted">
                Memeriksa kesiapan export...
              </div>
            )}
            {!preflightLoading && preflight && (preflight.blocking_issues.length > 0 || preflight.warnings.length > 0) && (
              <div className={`border-b px-6 py-2.5 text-[11px] ${preflight.blocking_issues.length > 0 ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <span className="font-semibold">Preflight: estimasi {preflight.estimated_pages} halaman.</span>
                {preflight.blocking_issues.length > 0 && <span className="ml-2">{preflight.blocking_issues.slice(0, 2).join(" · ")}</span>}
                {preflight.warnings.length > 0 && <span className="ml-2">{preflight.warnings.slice(0, 2).join(" · ")}</span>}
              </div>
            )}

            {/* Preview area — sized like an A4 sheet on a light desk background, tall
                enough (70-75vh) to actually read through before exporting */}
            <div className="flex-1 overflow-y-auto bg-surface/60 p-6 sm:p-8">
              {targetItems.length === 0 ? (
                <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-2 text-center text-text-muted">
                  <AlertCircle size={32} />
                  <p className="text-sm font-medium text-text-primary">Belum ada bagian Draf atau Final.</p>
                  <p className="text-xs">Ubah status bagian di halaman utama terlebih dahulu.</p>
                </div>
              ) : (
                <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col rounded-lg border border-surface-border bg-white p-6 shadow-panel sm:min-h-[75vh] sm:p-8">
                  <div className="flex items-center justify-between border-b border-surface-border pb-4 mb-5">
                    <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                      {format === "pptx" ? (
                        <Presentation size={15} className="text-amber-500" />
                      ) : (
                        <FileText size={15} className="text-secondary" />
                      )}
                      Pratinjau Butir ({targetItems.length} butir ditanggapi)
                    </span>
                    <span className="text-[11px] text-text-muted">
                      Target: {getDocType(docTypeId).label} ({FORMAT_LABELS[format]})
                    </span>
                  </div>
                  <div className="flex-1 space-y-2.5">
                    {targetItems.map((it, idx) => (
                      <div key={it.id} className="flex items-start gap-2 rounded-md border border-surface-border bg-surface p-3">
                        <span className="text-[11px] font-mono text-text-muted shrink-0 w-5">{idx + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-text-primary truncate">{it.title}</p>
                          <p className="text-[11px] text-text-muted line-clamp-1">{it.draft_text || "—"}</p>
                        </div>
                        <span className={`shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 ${it.status === "final" ? "bg-emerald-50 text-emerald-700" : "bg-accent-soft text-accent-ink"}`}>
                          {it.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-surface-border px-6 py-4 bg-surface-raised">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePreviewPdf}
                  disabled={targetItems.length === 0 || previewingPdf}
                  className="min-w-[150px]"
                >
                  {previewingPdf ? (
                    <><Loader2 size={14} className="mr-1.5 animate-spin" />Menyiapkan preview...</>
                  ) : (
                    <><Eye size={14} className="mr-1.5" />{previewedOnce ? "Preview Ulang" : "Preview Dokumen"}</>
                  )}
                </Button>
              </div>

              <label className={`flex items-center gap-2 text-xs ${previewedOnce ? "cursor-pointer text-text-primary" : "cursor-not-allowed text-text-muted"}`}>
                <input
                  type="checkbox"
                  checked={agreedToExport}
                  disabled={!previewedOnce}
                  onChange={(e) => setAgreedToExport(e.target.checked)}
                  className="rounded border-surface-border text-accent focus:ring-accent disabled:opacity-50"
                />
                <span>
                  {previewedOnce
                    ? "Saya sudah review preview dan setuju untuk export dokumen ini."
                    : "Klik \"Preview Dokumen\" dulu sebelum bisa export."}
                </span>
              </label>

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleDownloadDocx}
                  disabled={targetItems.length === 0 || downloadingDocx || !agreedToExport}
                  className="bg-ink-900 hover:bg-ink-800 text-white min-w-[220px] disabled:opacity-50"
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
                  <div className="font-mono text-xs text-text-primary leading-relaxed whitespace-pre-wrap selection:bg-accent-soft max-h-[350px] overflow-y-auto pr-2">
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
                className="bg-ink-900 hover:bg-ink-800 text-white min-w-[130px]"
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
  );
}
