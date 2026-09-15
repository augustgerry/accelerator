"use client";

import { useState, useRef } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportProposalDocx, uploadTemplate, exportFromTemplate, cloneTemplate } from "@/lib/api";
import type { RequirementItem, TemplateInfo } from "@/lib/types";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  items: RequirementItem[];
}

type ExportTab = "standard" | "template" | "text";

export function ExportModal({
  isOpen,
  onClose,
  documentTitle,
  items,
}: ExportModalProps) {
  // ── Standard tab state
  const [onlyFinal, setOnlyFinal] = useState(false);
  const [templateType, setTemplateType] = useState<"matrix" | "narrative">("matrix");
  const [fontName, setFontName] = useState<string>("Calibri");
  const [copied, setCopied] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);

  // ── Tab state
  const [activeTab, setActiveTab] = useState<ExportTab>("standard");

  // ── Template tab state
  const templateInputRef = useRef<HTMLInputElement>(null);
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [exportingFromTemplate, setExportingFromTemplate] = useState(false);
  const [templateOnlyFinal, setTemplateOnlyFinal] = useState(false);
  const [templateMode, setTemplateMode] = useState<"structure" | "clone">("clone");

  if (!isOpen) return null;

  const targetItems = items.filter((it) => {
    if (onlyFinal) return it.status === "final";
    return it.status === "final" || it.status === "draft";
  });

  const templateTargetItems = items.filter((it) => {
    if (templateOnlyFinal) return it.status === "final";
    return it.status === "final" || it.status === "draft";
  });

  const compiledText = targetItems
    .map((it, idx) => {
      const response = it.draft_text.trim() || "[Belum ada respons/draf]";
      return `### ${idx + 1}. ${it.title} [${it.category}]\n**Klausul TOR:**\n> ${it.requirement_text}\n\n**Tanggapan/Spesifikasi Usulan SMG:**\n${response}\n\n---\n`;
    })
    .join("\n");

  const fullExportContent = `# Tanggapan Teknis & Proposal: ${documentTitle}\nTanggal Ekspor: ${new Date().toLocaleDateString("id-ID")}\nFormat Template: ${templateType === "matrix" ? "Matriks Tender Resmi" : "Proposal Naratif Bertingkat"}\nTotal Klausul Terjawab: ${targetItems.length} dari ${items.length}\n\n---\n\n${compiledText}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullExportContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  const handleDownloadDocx = async () => {
    if (targetItems.length === 0) return;
    setDownloadingDocx(true);
    try {
      const blob = await exportProposalDocx({
        document_title: documentTitle,
        template_type: templateType,
        font_name: fontName,
        company_name: "PT Solusi Mitra Gemilang (SMG)",
        items: targetItems.map((it) => ({
          id: it.id,
          title: it.title,
          requirement_text: it.requirement_text,
          category: it.category,
          draft_text: it.draft_text,
          status: it.status,
        })),
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const cleanTitle = documentTitle.replace(/\.[^/.]+$/, "").replace(/\s+/g, "-");
      link.setAttribute("download", `Proposal-Response-${cleanTitle}.docx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal mengunduh dokumen Word");
    } finally {
      setDownloadingDocx(false);
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

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      e.target.value = "";
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
          items: templateTargetItems.map((it) => ({
            id: it.id, title: it.title, requirement_text: it.requirement_text,
            category: it.category, draft_text: it.draft_text, status: it.status,
          })),
        });
      } else {
        blob = await exportFromTemplate({
          document_title: documentTitle,
          company_name: "PT Solusi Mitra Gemilang (SMG)",
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

  const TABS: { key: ExportTab; label: string; icon: React.ReactNode }[] = [
    { key: "standard", label: "Word Standar", icon: <Table2 size={14} /> },
    { key: "template", label: "Gunakan Template", icon: <Wand2 size={14} /> },
    { key: "text", label: "Salin / Markdown", icon: <FileCode2 size={14} /> },
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
              Ekspor ke Word standar, ikuti template Anda, atau salin teks
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Tab Navigation ────────────────────────────────────────────────── */}
        <div className="flex border-b border-surface-border bg-surface px-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px ${
                activeTab === tab.key
                  ? "border-accent text-accent-ink"
                  : "border-transparent text-text-muted hover:text-text-primary"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Standard Word Export ─────────────────────────────────────── */}
        {activeTab === "standard" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface px-6 py-3 text-xs">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-text-primary">Gaya:</span>
                  <select
                    value={templateType}
                    onChange={(e) => setTemplateType(e.target.value as "matrix" | "narrative")}
                    className="rounded border border-surface-border bg-surface-raised px-2.5 py-1 text-xs text-text-primary outline-none focus:border-accent"
                  >
                    <option value="matrix">Matriks Kepatuhan Tender (Tabel)</option>
                    <option value="narrative">Proposal Naratif (Bab &amp; Sub-Bab)</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-text-primary">Font:</span>
                  <select
                    value={fontName}
                    onChange={(e) => setFontName(e.target.value)}
                    className="rounded border border-surface-border bg-surface-raised px-2.5 py-1 text-xs text-text-primary outline-none focus:border-accent"
                  >
                    <option value="Calibri">Calibri</option>
                    <option value="Arial">Arial</option>
                    <option value="Times New Roman">Times New Roman</option>
                  </select>
                </div>
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

            <div className="flex-1 overflow-y-auto p-6 bg-surface/30">
              {targetItems.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-text-muted">
                  <AlertCircle size={32} />
                  <p className="text-sm font-medium text-text-primary">Belum ada klausul Draf atau Final.</p>
                  <p className="text-xs">Ubah status klausul di halaman utama terlebih dahulu.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
                  <div className="flex items-center justify-between border-b border-surface-border pb-3 mb-4">
                    <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                      <FileText size={15} className="text-secondary" />
                      Pratinjau ({targetItems.length} butir)
                    </span>
                    <span className="text-[11px] text-text-muted">Format: {templateType === "matrix" ? "Matriks Tabel" : "Naratif Bab"}</span>
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {targetItems.map((it, idx) => (
                      <div key={it.id} className="flex items-start gap-2 rounded-md border border-surface-border bg-surface p-2.5">
                        <span className="text-[11px] font-mono text-text-muted shrink-0 w-5">{idx + 1}.</span>
                        <div className="min-w-0">
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

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-surface-border px-6 py-4 bg-surface-raised">
              <Button
                variant="primary"
                size="sm"
                onClick={handleDownloadDocx}
                disabled={targetItems.length === 0 || downloadingDocx}
                className="bg-ink-900 hover:bg-ink-800 text-white min-w-[170px]"
              >
                {downloadingDocx ? (
                  <><Loader2 size={14} className="mr-1.5 animate-spin" />Membuat Word...</>
                ) : (
                  <><FileDown size={14} className="mr-1.5 text-accent" />Download Word (.docx)</>
                )}
              </Button>
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
                    {templateTargetItems.length} klausul akan dimasukkan ke dalam template
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
            </div>

            <div className="flex items-center justify-between border-t border-surface-border px-6 py-4 bg-surface-raised">
              <p className="text-xs text-text-muted max-w-xs">
                {templateInfo
                  ? "Klik Generate untuk membuat Word yang mengikuti struktur dan font dari template Anda."
                  : "Upload template terlebih dahulu untuk mengaktifkan ekspor."}
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={handleExportFromTemplate}
                disabled={!templateInfo || templateTargetItems.length === 0 || exportingFromTemplate}
                className="bg-ink-900 hover:bg-ink-800 text-white min-w-[200px]"
              >
                {exportingFromTemplate ? (
                  <><Loader2 size={14} className="mr-1.5 animate-spin" />Membuat dari Template...</>
                ) : (
                  <><Wand2 size={14} className="mr-1.5 text-accent" />Generate dari Template</>
                )}
              </Button>
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
              <span className="text-text-muted">{targetItems.length} klausul · format Markdown</span>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-surface/30">
              {targetItems.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-text-muted">
                  <AlertCircle size={32} />
                  <p className="text-sm font-medium text-text-primary">Belum ada klausul Draf atau Final.</p>
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
