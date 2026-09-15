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
  UploadCloud,
  Layout,
  FileCode2,
  Wand2,
  ChevronRight,
  Table2,
  BookOpen,
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
  uploadTemplate,
  exportFromTemplate,
  cloneTemplate,
  cloneTemplatePptx,
  listDocuments,
  downloadTemplateDocument,
  type ExportPreflightResult,
} from "@/lib/api";
import type { RequirementItem, TemplateInfo, IndexedDocument } from "@/lib/types";
import { DOC_TYPES, FORMAT_LABELS, getDocType, type DraftDocTypeId, type DraftFormat } from "@/lib/document-types";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  items: RequirementItem[];
  initialDocTypeId?: DraftDocTypeId;
  initialFormat?: DraftFormat;
}

type ExportTab = "standard" | "template" | "text";
type ExportStep = 1 | 2 | 3;

type CorporateBranding = {
  companyName: string;
  primaryColor: string;
  accentColor: string;
  footerText: string;
  logoDataUrl: string;
};

const DEFAULT_BRANDING: CorporateBranding = {
  companyName: "PT Solusi Mitra Gemilang (SMG)",
  primaryColor: "#111827",
  accentColor: "#2F5FE0",
  footerText: "PT Solusi Mitra Gemilang (SMG)",
  logoDataUrl: "",
};

// Standard fonts bundled with Microsoft Word / Microsoft 365.
const MS_WORD_FONTS = [
  "Calibri", "Arial", "Times New Roman", "Cambria", "Georgia", "Garamond",
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
  const [fontName, setFontName] = useState<string>("Calibri");
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

  useEffect(() => {
    if (isOpen) {
      setExportStep(1);
      setActiveTab("standard");
      setDocTypeId(initialDocTypeId);
      setFormat(initialFormat);
    }
  }, [initialDocTypeId, initialFormat, isOpen]);

  // ── Tab state
  const [activeTab, setActiveTab] = useState<ExportTab>("standard");
  const [exportStep, setExportStep] = useState<ExportStep>(1);

  const goToExportStep = (step: ExportStep) => {
    setExportStep(step);
    setActiveTab(step === 1 ? "standard" : step === 2 ? "template" : "text");
  };

  // ── Template tab state
  const templateInputRef = useRef<HTMLInputElement>(null);
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [exportingFromTemplate, setExportingFromTemplate] = useState(false);
  const [convertingTemplatePdf, setConvertingTemplatePdf] = useState(false);
  const [templateOnlyFinal, setTemplateOnlyFinal] = useState(false);
  const [templateMode, setTemplateMode] = useState<"structure" | "clone">("clone");
  const [templateDocType, setTemplateDocType] = useState<DraftDocTypeId>("narrative");
  // The template-clone/structure backend uses "proposal" where the plain docx/pdf
  // export uses "narrative" for the same Proposal Teknis wording — two legacy key spaces.
  const TEMPLATE_BACKEND_TYPE: Record<DraftDocTypeId, "proposal" | "sow" | "solution_brief" | "mom"> = {
    narrative: "proposal",
    sow: "sow",
    solution_brief: "solution_brief",
    mom: "mom",
    klarifikasi_teknis: "mom",
    pitch_deck: "proposal",
  };

  // ── PPTX clone-template state (separate from docx flow — no structure parsing needed)
  const pptxTemplateInputRef = useRef<HTMLInputElement>(null);
  const [pptxTemplateFile, setPptxTemplateFile] = useState<File | null>(null);
  const [generatingPptxClone, setGeneratingPptxClone] = useState(false);
  const [convertingPptxPdf, setConvertingPptxPdf] = useState(false);
  const [pptxCloneError, setPptxCloneError] = useState<string | null>(null);
  const [pickingPptxLibraryId, setPickingPptxLibraryId] = useState<string | null>(null);

  // ── Google Drive examples/templates
  const [templateLibrary, setTemplateLibrary] = useState<IndexedDocument[] | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryPickError, setLibraryPickError] = useState<string | null>(null);
  const [pickingLibraryId, setPickingLibraryId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== "template" || templateLibrary !== null) return;
    setLibraryLoading(true);
    listDocuments()
      .then((docs) => setTemplateLibrary(docs))
      .catch(() => setTemplateLibrary([]))
      .finally(() => setLibraryLoading(false));
  }, [activeTab, templateLibrary]);

  const docxTemplateLibrary = (templateLibrary ?? []).filter((d) => d.title.toLowerCase().endsWith(".docx"));
  const pptxTemplateLibrary = (templateLibrary ?? []).filter((d) => d.title.toLowerCase().endsWith(".pptx"));

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

  const templateTargetItems = items.filter((it) => {
    if (templateOnlyFinal) return it.status === "final";
    return it.status === "final" || it.status === "draft";
  });

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
      company_name: "PT Solusi Mitra Gemilang (SMG)",
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

  const applyTemplateFile = async (file: File) => {
    setTemplateFile(file);
    setUploadingTemplate(true);
    setTemplateError(null);
    try {
      const info = await uploadTemplate(file);
      setTemplateInfo(info);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Gagal membaca template");
    } finally {
      setUploadingTemplate(false);
    }
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await applyTemplateFile(file);
    e.target.value = "";
  };

  const handlePickLibraryTemplate = async (doc: IndexedDocument) => {
    setPickingLibraryId(doc.id);
    setLibraryPickError(null);
    try {
      const blob = await downloadTemplateDocument(doc.id);
      const file = new File([blob], doc.title, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      await applyTemplateFile(file);
    } catch (err) {
      setLibraryPickError(err instanceof Error ? err.message : "Gagal mengambil template");
    } finally {
      setPickingLibraryId(null);
    }
  };

  const handleExportFromTemplate = async () => {
    if (!templateInfo || templateTargetItems.length === 0) return;
    setExportingFromTemplate(true);
    try {
      let blob: Blob;
      if (templateMode === "clone" && templateFile) {
        blob = await cloneTemplate({
          templateFile,
          document_title: documentTitle,
          company_name: "PT Solusi Mitra Gemilang (SMG)",
          document_type: TEMPLATE_BACKEND_TYPE[templateDocType],
          items: templateTargetItems.map((it) => ({
            id: it.id, title: it.title, requirement_text: it.requirement_text,
            category: it.category, draft_text: it.draft_text, status: it.status,
          })),
        });
      } else {
        blob = await exportFromTemplate({
          document_title: documentTitle,
          company_name: "PT Solusi Mitra Gemilang (SMG)",
          template_type: TEMPLATE_BACKEND_TYPE[templateDocType],
          items: templateTargetItems.map((it) => ({
            id: it.id, title: it.title, requirement_text: it.requirement_text,
            category: it.category, draft_text: it.draft_text, status: it.status,
          })),
          template_default_font: templateInfo.default_font_name,
          template_default_font_size: templateInfo.default_font_size_pt,
          template_sections: templateInfo.sections,
        });
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const cleanTitle = documentTitle.replace(/\.[^/.]+$/, "").replace(/\s+/g, "-");
      const suffix = templateMode === "clone" ? "Cloned" : "FromTemplate";
      link.setAttribute("download", `Proposal-${suffix}-${cleanTitle}.docx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal mengekspor dari template");
    } finally {
      setExportingFromTemplate(false);
    }
  };

  const handleExportTemplatePdf = async () => {
    if (!templateInfo || templateTargetItems.length === 0 || convertingTemplatePdf) return;
    setConvertingTemplatePdf(true);
    try {
      const docxBlob = templateMode === "clone" && templateFile
        ? await cloneTemplate({
            templateFile,
            document_title: documentTitle,
            company_name: branding.companyName,
            document_type: TEMPLATE_BACKEND_TYPE[templateDocType],
            items: templateTargetItems,
          })
        : await exportFromTemplate({
            document_title: documentTitle,
            company_name: branding.companyName,
            template_type: TEMPLATE_BACKEND_TYPE[templateDocType],
            items: templateTargetItems,
            template_default_font: templateInfo.default_font_name,
            template_default_font_size: templateInfo.default_font_size_pt,
            template_sections: templateInfo.sections,
          });
      const pdfBlob = await convertOfficeToPdf(docxBlob, `${documentTitle}.docx`);
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Proposal-Template-${documentTitle.replace(/\.[^/.]+$/, "").replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal membuat PDF full-fidelity dari template");
    } finally {
      setConvertingTemplatePdf(false);
    }
  };

  const handlePptxTemplateSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPptxTemplateFile(file);
    setPptxCloneError(null);
    e.target.value = "";
  };

  const handlePickLibraryPptx = async (doc: IndexedDocument) => {
    setPickingPptxLibraryId(doc.id);
    setPptxCloneError(null);
    try {
      const blob = await downloadTemplateDocument(doc.id);
      const file = new File([blob], doc.title, {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      setPptxTemplateFile(file);
    } catch (err) {
      setPptxCloneError(err instanceof Error ? err.message : "Gagal mengambil template");
    } finally {
      setPickingPptxLibraryId(null);
    }
  };

  const handleGeneratePptxClone = async () => {
    if (!pptxTemplateFile || templateTargetItems.length === 0) return;
    setGeneratingPptxClone(true);
    setPptxCloneError(null);
    try {
      const blob = await cloneTemplatePptx({
        templateFile: pptxTemplateFile,
        document_title: documentTitle,
        company_name: "PT Solusi Mitra Gemilang (SMG)",
        items: templateTargetItems.map((it) => ({
          id: it.id, title: it.title, requirement_text: it.requirement_text,
          category: it.category, draft_text: it.draft_text, status: it.status,
        })),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const cleanTitle = documentTitle.replace(/\.[^/.]+$/, "").replace(/\s+/g, "-");
      link.setAttribute("download", `PitchDeck-Cloned-${cleanTitle}.pptx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setPptxCloneError(err instanceof Error ? err.message : "Gagal clone template PowerPoint");
    } finally {
      setGeneratingPptxClone(false);
    }
  };

  const handleGeneratePptxPdf = async () => {
    if (!pptxTemplateFile || templateTargetItems.length === 0 || convertingPptxPdf) return;
    setConvertingPptxPdf(true);
    setPptxCloneError(null);
    try {
      const pptxBlob = await cloneTemplatePptx({
        templateFile: pptxTemplateFile,
        document_title: documentTitle,
        company_name: branding.companyName,
        items: templateTargetItems,
      });
      const pdfBlob = await convertOfficeToPdf(pptxBlob, pptxTemplateFile.name);
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `PitchDeck-Cloned-${documentTitle.replace(/\.[^/.]+$/, "").replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setPptxCloneError(err instanceof Error ? err.message : "Gagal membuat PDF full-fidelity PPTX");
    } finally {
      setConvertingPptxPdf(false);
    }
  };

  const STEPS: { key: ExportStep; label: string; caption: string; icon: React.ReactNode }[] = [
    { key: 1, label: "Format & Generate", caption: "Pilih output", icon: <Table2 size={14} /> },
    { key: 2, label: "Ikuti Gaya File Lain", caption: "Opsional", icon: <Wand2 size={14} /> },
    { key: 3, label: "Salin Teks", caption: "Markdown", icon: <Eye size={14} /> },
  ];

  // Headings from template for preview
  const headingSections = templateInfo?.sections.filter((s) => s.level > 0) ?? [];

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
              Ekspor ke Word (Proposal, SoW, Solution Brief, MoM), Slide PPTX, atau ikuti Template Anda
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
        <div className="grid grid-cols-3 border-b border-surface-border bg-surface px-3 sm:px-4">
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface px-6 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-text-primary">Jenis Dokumen:</span>
                  <select
                    value={docTypeId}
                    onChange={(e) => {
                      const next = e.target.value as DraftDocTypeId;
                      setDocTypeId(next);
                      const allowed = getDocType(next).formats;
                      if (!allowed.includes(format)) setFormat(allowed[0]);
                    }}
                    className="rounded border border-surface-border bg-surface-raised px-2.5 py-1 text-xs text-text-primary font-medium outline-none focus:border-accent cursor-pointer"
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-text-primary">Format:</span>
                  <div className="flex rounded border border-surface-border bg-surface-raised p-0.5">
                    {getDocType(docTypeId).formats.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFormat(f)}
                        className={`rounded px-2 py-1 text-xs font-medium transition-all ${
                          format === f ? "bg-accent-soft text-accent-ink" : "text-text-muted hover:text-text-primary"
                        }`}
                      >
                        {FORMAT_LABELS[f]}
                      </button>
                    ))}
                  </div>
                </div>

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

                {format === "pdf" && (
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

            <div className="flex-1 overflow-y-auto p-6 bg-surface/30">
              {targetItems.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-text-muted">
                  <AlertCircle size={32} />
                  <p className="text-sm font-medium text-text-primary">Belum ada bagian Draf atau Final.</p>
                  <p className="text-xs">Ubah status bagian di halaman utama terlebih dahulu.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
                  <div className="flex items-center justify-between border-b border-surface-border pb-3 mb-4">
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
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {targetItems.map((it, idx) => (
                      <div key={it.id} className="flex items-start gap-2 rounded-md border border-surface-border bg-surface p-2.5">
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


        {/* ── Tab: Template-Based Export ───────────────────────────────────── */}
        {activeTab === "template" && (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Upload Template card */}
              <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
                <div className="flex items-center gap-2 mb-3">
                  <Wand2 size={16} className="text-accent-ink" />
                  <h4 className="text-sm font-bold text-text-primary">Upload Template Word (.docx)</h4>
                </div>

                {/* Mode toggle */}
                <div className="flex rounded-lg border border-surface-border bg-surface p-0.5 text-xs mb-4">
                  <button
                    onClick={() => setTemplateMode("clone")}
                    className={`flex-1 rounded-md py-1.5 px-2 font-medium transition-all ${
                      templateMode === "clone"
                        ? "bg-surface-raised text-accent-ink shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    🔁 Clone Langsung (Ganti Placeholder)
                  </button>
                  <button
                    onClick={() => setTemplateMode("structure")}
                    className={`flex-1 rounded-md py-1.5 px-2 font-medium transition-all ${
                      templateMode === "structure"
                        ? "bg-surface-raised text-accent-ink shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    🏗️ Susun dari Struktur Template
                  </button>
                </div>

                {/* Target document type — controls wording/labels (SoW, Solution Brief, MoM, dll) */}
                <div className="flex items-center gap-1.5 mb-4 text-xs">
                  <span className="font-semibold text-text-primary">Jenis Dokumen:</span>
                  <select
                    value={templateDocType}
                    onChange={(e) => setTemplateDocType(e.target.value as DraftDocTypeId)}
                    className="rounded border border-surface-border bg-surface px-2.5 py-1 text-xs text-text-primary outline-none focus:border-accent"
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>

                <p className="text-xs text-text-muted mb-3 leading-relaxed">
                  {templateMode === "clone"
                    ? <>
                        <strong className="text-text-primary">Mode Clone:</strong> Template DOCX di-kopi persis,
                        lalu teks placeholder diganti dengan konten AI. Semua style, header, footer, tabel,
                        dan margin dipertahankan 100%.{" "}
                        <span className="text-accent-ink font-medium">Placeholder yang didukung:</span>{" "}
                        <code className="font-mono bg-surface border border-surface-border rounded px-1">{"{{COMPILED_RESPONSES}}"}</code>{", "}
                        <code className="font-mono bg-surface border border-surface-border rounded px-1">{"{{DOCUMENT_TITLE}}"}</code>{", "}
                        <code className="font-mono bg-surface border border-surface-border rounded px-1">{"{{DATE}}"}</code>
                      </>
                    : <>
                        <strong className="text-text-primary">Mode Struktur:</strong> AI membaca heading,
                        font, dan level dari template, lalu membangun ulang dokumen dengan konten AI
                        ditempatkan di bawah heading yang sesuai kategorinya.
                      </>
                  }
                </p>

                {!templateInfo ? (
                  <>
                    <div className="mb-3">
                      <span className="text-xs font-semibold text-text-primary block mb-1.5">
                        Pilih Contoh/Template dari Library Drive
                      </span>
                      {libraryLoading ? (
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <Loader2 size={13} className="animate-spin" /> Memuat daftar dokumen...
                        </div>
                      ) : docxTemplateLibrary.length > 0 ? (
                        <select
                          value=""
                          disabled={pickingLibraryId !== null}
                          onChange={(e) => {
                            const doc = docxTemplateLibrary.find((d) => d.id === e.target.value);
                            if (doc) handlePickLibraryTemplate(doc);
                          }}
                          className="w-full rounded border border-surface-border bg-surface px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent disabled:opacity-60"
                        >
                          <option value="" disabled>
                            {pickingLibraryId ? "Mengambil dokumen..." : "— Pilih dari Drive —"}
                          </option>
                          {docxTemplateLibrary.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.title}{d.division ? ` (${d.division})` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xs text-text-muted">
                          Belum ada dokumen .docx di library. Sync Google Drive dulu di halaman Documents, atau upload manual di bawah.
                        </p>
                      )}
                      {libraryPickError && (
                        <p className="text-xs text-red-600 mt-1">{libraryPickError}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-text-muted mb-3">
                      <div className="h-px flex-1 bg-surface-border" />
                      atau
                      <div className="h-px flex-1 bg-surface-border" />
                    </div>

                    <div
                      onClick={() => templateInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-surface-border bg-surface p-8 cursor-pointer hover:border-accent hover:bg-accent-soft/30 transition-all group"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-ink group-hover:scale-105 transition-transform">
                        {uploadingTemplate ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-text-primary">
                          {uploadingTemplate ? "Membaca template..." : "Klik atau seret file template .docx"}
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">Hanya file .docx yang didukung</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-emerald-600" />
                        <span className="text-sm font-semibold text-emerald-800">{templateInfo.template_name}</span>
                      </div>
                      <button
                        onClick={() => { setTemplateInfo(null); setTemplateError(null); }}
                        className="text-xs text-emerald-600 hover:text-emerald-800 underline"
                      >
                        Ganti
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-emerald-700">
                      <span>📝 {templateInfo.section_count} paragraf</span>
                      <span>🔤 Font: <strong>{templateInfo.default_font_name}</strong></span>
                      <span>📏 Ukuran: <strong>{templateInfo.default_font_size_pt}pt</strong></span>
                      <span>📑 Heading: <strong>{headingSections.length} bagian</strong></span>
                    </div>
                  </div>
                )}

                {templateError && (
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertCircle size={13} />
                    <span>{templateError}</span>
                  </div>
                )}

                <input
                  ref={templateInputRef}
                  type="file"
                  accept=".docx"
                  className="hidden"
                  onChange={handleTemplateUpload}
                />
              </div>

              {/* Template structure preview */}
              {templateInfo && headingSections.length > 0 && (
                <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen size={15} className="text-secondary" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                      Struktur Template Terdeteksi
                    </h4>
                  </div>
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                    {headingSections.slice(0, 30).map((sec) => (
                      <div
                        key={sec.index}
                        className="flex items-center gap-2"
                        style={{ paddingLeft: `${(sec.level - 1) * 14}px` }}
                      >
                        <span className={`shrink-0 text-[10px] font-bold rounded px-1.5 py-0.5 ${
                          sec.level === 1
                            ? "bg-accent-soft text-accent-ink"
                            : sec.level === 2
                            ? "bg-secondary-soft text-secondary"
                            : "bg-surface border border-surface-border text-text-muted"
                        }`}>
                          H{sec.level}
                        </span>
                        <span className="text-xs text-text-primary truncate">{sec.text || "(kosong)"}</span>
                        {sec.font_name && (
                          <span className="shrink-0 text-[10px] text-text-muted font-mono">{sec.font_name} {sec.font_size_pt && `${sec.font_size_pt}pt`}</span>
                        )}
                      </div>
                    ))}
                    {headingSections.length > 30 && (
                      <p className="text-[11px] text-text-muted text-center pt-1">+{headingSections.length - 30} heading lainnya</p>
                    )}
                  </div>
                </div>
              )}

              {/* Filter */}
              {templateInfo && (
                <div className="flex items-center justify-between rounded-lg border border-surface-border bg-surface px-4 py-2.5 text-xs">
                  <span className="text-text-secondary">
                    {templateTargetItems.length} bagian akan dimasukkan ke dalam template
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary">
                    <input
                      type="checkbox"
                      checked={templateOnlyFinal}
                      onChange={(e) => setTemplateOnlyFinal(e.target.checked)}
                      className="rounded border-surface-border text-accent focus:ring-accent"
                    />
                    <span>Hanya Final ({items.filter((i) => i.status === "final").length})</span>
                  </label>
                </div>
              )}

              {/* Clone PowerPoint template card — separate flow, no structure parsing needed */}
              <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
                <div className="flex items-center gap-2 mb-2">
                  <Presentation size={16} className="text-amber-500" />
                  <h4 className="text-sm font-bold text-text-primary">Clone Template PowerPoint (.pptx)</h4>
                </div>
                <p className="text-xs text-text-muted mb-3 leading-relaxed">
                  Upload deck <code className="font-mono bg-surface border border-surface-border rounded px-1">.pptx</code> Anda
                  sendiri. Tandai <strong className="text-text-primary">satu slide</strong> sebagai slide-per-item pakai placeholder{" "}
                  <code className="font-mono bg-surface border border-surface-border rounded px-1">{"{{ITEM_TITLE}}"}</code>,{" "}
                  <code className="font-mono bg-surface border border-surface-border rounded px-1">{"{{ITEM_REQUIREMENT}}"}</code>,{" "}
                  <code className="font-mono bg-surface border border-surface-border rounded px-1">{"{{ITEM_RESPONSE}}"}</code> — slide
                  itu akan digandakan sekali per bagian. Slide lain (cover/closing) cukup pakai{" "}
                  <code className="font-mono bg-surface border border-surface-border rounded px-1">{"{{DOCUMENT_TITLE}}"}</code>,{" "}
                  <code className="font-mono bg-surface border border-surface-border rounded px-1">{"{{COMPANY_NAME}}"}</code>,{" "}
                  <code className="font-mono bg-surface border border-surface-border rounded px-1">{"{{DATE}}"}</code>. Desain, warna,
                  dan font asli deck Anda dipertahankan.
                </p>

                {!pptxTemplateFile ? (
                  <>
                    <div className="mb-3">
                      <span className="text-xs font-semibold text-text-primary block mb-1.5">
                        Pilih Contoh/Template dari Library Drive
                      </span>
                      {libraryLoading ? (
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <Loader2 size={13} className="animate-spin" /> Memuat daftar dokumen...
                        </div>
                      ) : pptxTemplateLibrary.length > 0 ? (
                        <select
                          value=""
                          disabled={pickingPptxLibraryId !== null}
                          onChange={(e) => {
                            const doc = pptxTemplateLibrary.find((d) => d.id === e.target.value);
                            if (doc) handlePickLibraryPptx(doc);
                          }}
                          className="w-full rounded border border-surface-border bg-surface px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent disabled:opacity-60"
                        >
                          <option value="" disabled>
                            {pickingPptxLibraryId ? "Mengambil template..." : "— Pilih dari Drive —"}
                          </option>
                          {pptxTemplateLibrary.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.title}{d.division ? ` (${d.division})` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xs text-text-muted">
                          Belum ada dokumen .pptx di library. Sync Google Drive dulu, atau upload manual di bawah.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-text-muted mb-3">
                      <div className="h-px flex-1 bg-surface-border" />
                      atau
                      <div className="h-px flex-1 bg-surface-border" />
                    </div>

                    <div
                      onClick={() => pptxTemplateInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-surface-border bg-surface p-6 cursor-pointer hover:border-accent hover:bg-accent-soft/30 transition-all group"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink group-hover:scale-105 transition-transform">
                        <UploadCloud size={18} />
                      </div>
                      <p className="text-sm font-semibold text-text-primary">Klik atau seret file template .pptx</p>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Presentation size={16} className="text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-800">{pptxTemplateFile.name}</span>
                    </div>
                    <button
                      onClick={() => { setPptxTemplateFile(null); setPptxCloneError(null); }}
                      className="text-xs text-emerald-600 hover:text-emerald-800 underline"
                    >
                      Ganti
                    </button>
                  </div>
                )}

                {pptxCloneError && (
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertCircle size={13} />
                    <span>{pptxCloneError}</span>
                  </div>
                )}

                <input
                  ref={pptxTemplateInputRef}
                  type="file"
                  accept=".pptx"
                  className="hidden"
                  onChange={handlePptxTemplateSelect}
                />

                {pptxTemplateFile && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleGeneratePptxPdf}
                      disabled={templateTargetItems.length === 0 || generatingPptxClone || convertingPptxPdf}
                      className="flex-1 border-surface-border"
                    >
                      {convertingPptxPdf ? <><Loader2 size={14} className="mr-1.5 animate-spin" />Render...</> : <><FileDown size={14} className="mr-1.5" />PDF Fidelity</>}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleGeneratePptxClone}
                      disabled={templateTargetItems.length === 0 || generatingPptxClone || convertingPptxPdf}
                      className="flex-1 bg-ink-900 text-white hover:bg-ink-800"
                    >
                      {generatingPptxClone ? (
                        <><Loader2 size={14} className="mr-1.5 animate-spin" />Membuat...</>
                      ) : (
                        <><Presentation size={14} className="mr-1.5 text-accent" />PPTX</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border px-6 py-4 bg-surface-raised">
              <p className="text-xs text-text-muted max-w-xs">
                {templateInfo
                  ? "Klik Generate untuk membuat Word yang mengikuti struktur dan font dari template Anda."
                  : "Upload template terlebih dahulu untuk mengaktifkan ekspor."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportTemplatePdf}
                  disabled={!templateInfo || templateTargetItems.length === 0 || exportingFromTemplate || convertingTemplatePdf}
                  className="border-surface-border"
                >
                  {convertingTemplatePdf ? <><Loader2 size={14} className="mr-1.5 animate-spin" />Render PDF...</> : <><FileDown size={14} className="mr-1.5" />PDF Full Fidelity</>}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExportFromTemplate}
                  disabled={!templateInfo || templateTargetItems.length === 0 || exportingFromTemplate}
                  className="bg-ink-900 hover:bg-ink-800 text-white"
                >
                  {exportingFromTemplate ? (
                    <><Loader2 size={14} className="mr-1.5 animate-spin" />Membuat Word...</>
                  ) : (
                    <><Wand2 size={14} className="mr-1.5 text-accent" />Generate Word</>
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
