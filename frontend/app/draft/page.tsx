"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { Topbar } from "@/components/topbar";
import { ProgressHeader } from "@/components/draft/progress-header";
import { ExportModal } from "@/components/draft/export-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud,
  FileText,
  Loader2,
  Sparkles,
  Check,
  Copy,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  BookOpen,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  SendHorizontal,
  ChevronRight,
  CheckSquare,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  uploadTor,
  generateItemDraft,
  qualityCheckDraft,
  getProposalSession,
  saveProposalSession,
  listDocuments,
  type QualityCheckResult,
} from "@/lib/api";
import { OnboardingModal } from "@/components/onboarding-modal";
import type { RequirementItem, RequirementStatus, SourceCitation, IndexedDocument } from "@/lib/types";
import { DOC_TYPES, FORMAT_LABELS, getDocType, type DraftDocTypeId, type DraftFormat } from "@/lib/document-types";
import { SKELETONS } from "@/lib/skeletons";

// Poin 4: Grounding cuplikan TOR kini diproses secara semantik oleh backend
// menggunakan model sentence-transformers lokal. Frontend meneruskan konteks TOR
// hingga 35.000 karakter agar seluruh bab dan paragraf dapat diranking secara akurat.
function pickRelevantTorExcerpt(torText: string, _sectionTitle?: string, maxLen = 35000): string {
  if (!torText) return "";
  return torText.slice(0, maxLen);
}

const LS_KEY = "synapse-draft-session";
const LS_SESSION_ID_KEY = "synapse-proposal-session-id";

function loadFromStorage(): { fileName: string; torText: string; items: RequirementItem[] } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveToStorage(fileName: string, torText: string, items: RequirementItem[]) {
  try {
    // Strip isGenerating/error flags before saving
    const clean = items.map(({ isGenerating: _ig, error: _e, ...rest }) => rest);
    localStorage.setItem(LS_KEY, JSON.stringify({ fileName, torText, items: clean }));
  } catch {
    /* storage full or private mode — silently ignore */
  }
}

export default function DraftPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [torText, setTorText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<RequirementItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "review" | RequirementStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isDraftingAll, setIsDraftingAll] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [copiedItem, setCopiedItem] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [qualityReport, setQualityReport] = useState<QualityCheckResult | null>(null);
  const [checkingQuality, setCheckingQuality] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const [sessionSaved, setSessionSaved] = useState<string | null>(null);
  const [docTypeId, setDocTypeId] = useState<DraftDocTypeId>("narrative");
  const [format, setFormat] = useState<DraftFormat>("docx");
  const [referenceDocs, setReferenceDocs] = useState<IndexedDocument[]>([]);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<string>>(new Set());
  const [referenceSearch, setReferenceSearch] = useState("");
  const autoSavedSignature = useRef<string | null>(null);

  // Section management (Add / Edit / Delete)
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [sectionModalMode, setSectionModalMode] = useState<"add" | "edit">("add");
  const [sectionFormTitle, setSectionFormTitle] = useState("");
  const [sectionFormCategory, setSectionFormCategory] = useState("Teknis");
  const [sectionFormDescription, setSectionFormDescription] = useState("");

  // ── Restore from localStorage on mount ──────────────────────────────────
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved && saved.fileName && saved.items.length > 0) {
      setFileName(saved.fileName);
      setTorText(saved.torText ?? "");
      setItems(saved.items);
      setSelectedItemId(saved.items[0]?.id ?? null);
      setLastSaved("(restored)");
    }
    setHydrated(true);
  }, []);

  // ── Load Drive documents for the "Sumber Referensi" multi-select ────────
  useEffect(() => {
    listDocuments().then(setReferenceDocs).catch(() => setReferenceDocs([]));
  }, []);

  const toggleReferenceDoc = (id: string) => {
    setSelectedReferenceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredReferenceDocs = useMemo(() => {
    const q = referenceSearch.trim().toLowerCase();
    if (!q) return referenceDocs;
    return referenceDocs.filter((d) => d.title.toLowerCase().includes(q));
  }, [referenceDocs, referenceSearch]);

  useEffect(() => {
    const rawBrief = sessionStorage.getItem("synapse-search-brief");
    if (!rawBrief) return;
    try {
      const brief = JSON.parse(rawBrief) as { question: string; answer: string };
      const briefItem: RequirementItem = {
        id: "search-brief-1",
        title: brief.question,
        requirement_text: brief.question,
        category: "Brief dari Knowledge Search",
        draft_text: "",
        status: "todo",
      };
      setFileName("Brief-dari-Search.md");
      setTorText(`${brief.question}\n\nJawaban knowledge base:\n${brief.answer}`);
      setItems([briefItem]);
      setSelectedItemId(briefItem.id);
      sessionStorage.removeItem("synapse-search-brief");
      setIsDraftingAll(true);
      generateItemDraft(briefItem.id, brief.question, brief.answer, brief.answer)
        .then((result) => {
          setItems([{ ...briefItem, draft_text: result.draft_text, status: "draft", sources: result.sources }]);
        })
        .finally(() => setIsDraftingAll(false));
    } catch {
      sessionStorage.removeItem("synapse-search-brief");
    }
  }, []);

  // Restore the last server-backed project when a session id exists.
  useEffect(() => {
    let cancelled = false;
    const savedSessionId = localStorage.getItem(LS_SESSION_ID_KEY);
    if (!savedSessionId) return;
    setSessionId(savedSessionId);
    getProposalSession(savedSessionId)
      .then((saved) => {
        if (cancelled || !saved.file_name || saved.items.length === 0) return;
        setFileName(saved.file_name);
        setTorText(saved.tor_text);
        setItems(saved.items);
        setSelectedItemId(saved.items[0]?.id ?? null);
        setSessionSaved("Project dipulihkan");
      })
      .catch(() => {
        localStorage.removeItem(LS_SESSION_ID_KEY);
        setSessionId(null);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Auto-save to localStorage whenever items or fileName changes ─────────
  useEffect(() => {
    if (!hydrated || !fileName || items.length === 0) return;
    saveToStorage(fileName, torText, items);
    const time = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLastSaved(time);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, fileName, torText, hydrated]);

  useEffect(() => {
    if (!hydrated || !fileName || items.length === 0) return;
    const cleanItems = items.map(({ isGenerating: _isGenerating, error: _error, ...item }) => item);
    const signature = JSON.stringify({ fileName, torText, items: cleanItems });
    if (signature === autoSavedSignature.current) return;

    const timer = window.setTimeout(async () => {
      setSavingSession(true);
      try {
        const saved = await saveProposalSession(
          {
            title: fileName.replace(/\.[^/.]+$/, ""),
            file_name: fileName,
            tor_text: torText,
            items: cleanItems,
            status: items.every((item) => item.status === "final") ? "completed" : "draft",
          },
          sessionId ?? undefined,
        );
        autoSavedSignature.current = signature;
        setSessionId(saved.id);
        localStorage.setItem(LS_SESSION_ID_KEY, saved.id);
        setSessionSaved("Auto-saved");
        window.setTimeout(() => setSessionSaved(null), 1800);
      } catch {
        setSessionSaved("Belum tersimpan ke server");
      } finally {
        setSavingSession(false);
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [fileName, hydrated, items, sessionId, torText]);

  // Active selected item
  const selectedItem = useMemo(() => {
    return items.find((i) => i.id === selectedItemId) ?? items[0] ?? null;
  }, [items, selectedItemId]);

  // Filtered requirements list
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const hasQualityIssue = qualityReport?.results.some(
        (result) => result.item_id === item.id && result.issues.length > 0
      ) ?? false;
      const matchStatus = filterStatus === "all"
        || (filterStatus === "review" && hasQualityIssue)
        || item.status === filterStatus;
      const matchQuery =
        !searchQuery.trim() ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.requirement_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchQuery;
    });
  }, [items, filterStatus, searchQuery, qualityReport]);

  const processSourceFile = async (file: File) => {
    setUploading(true);
    setErrorMessage(null);
    try {
      const extractedText = await uploadTor(file);
      setTorText(extractedText);
      setFileName(file.name);

      setUploading(false);

      const skeleton = SKELETONS[docTypeId];
      const requirementItems: RequirementItem[] = skeleton.map((sec) => ({
        id: sec.id,
        title: sec.title,
        requirement_text: sec.description,
        category: sec.category,
        draft_text: "",
        status: "todo",
      }));

      setItems(requirementItems);
      if (requirementItems.length > 0) {
        setSelectedItemId(requirementItems[0].id);
      }

      setIsDraftingAll(true);
      for (let index = 0; index < requirementItems.length; index += 3) {
        const batch = requirementItems.slice(index, index + 3);
        const generated = await Promise.all(
          batch.map(async (item) => {
            try {
              const result = await generateItemDraft(
                item.id,
                item.requirement_text,
                undefined,
                pickRelevantTorExcerpt(extractedText, item.title),
                Array.from(selectedReferenceIds),
              );
              return { itemId: item.id, result };
            } catch {
              return { itemId: item.id, result: null };
            }
          }),
        );
        setItems((previous) => previous.map((item) => {
          const generatedItem = generated.find((entry) => entry.itemId === item.id);
          if (!generatedItem?.result) return item;
          return {
            ...item,
            draft_text: generatedItem.result.draft_text,
            status: "draft",
            sources: generatedItem.result.sources,
          };
        }));
      }
      setIsDraftingAll(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Gagal memproses dokumen. Pastikan API server aktif."
      );
    } finally {
      setUploading(false);
    }
  };

  // Handle local file upload & auto-generation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processSourceFile(file);
    e.target.value = "";
  };

  // Reset document
  const handleReset = () => {
    setFileName(null);
    setTorText("");
    setItems([]);
    setSelectedItemId(null);
    setErrorMessage(null);
    setLastSaved(null);
    setSessionId(null);
    setSessionSaved(null);
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_SESSION_ID_KEY);
    } catch { /* ignore */ }
  };

  // Generate draft for a single item
  const handleGenerateItemDraft = async (itemId: string, instruction?: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    // Update item to loading state
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, isGenerating: true } : it))
    );

    try {
      const result = await generateItemDraft(
        item.id,
        item.requirement_text,
        instruction,
        pickRelevantTorExcerpt(torText, item.title),
        Array.from(selectedReferenceIds)
      );

      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== itemId) return it;
          return {
            ...it,
            draft_text: result.draft_text,
            status: it.status === "final" ? "final" : "draft",
            sources: result.sources,
            isGenerating: false,
          };
        })
      );
      if (instruction) setCustomPrompt("");
    } catch (err) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                isGenerating: false,
                error: err instanceof Error ? err.message : "Gagal menyusun draf",
              }
            : it
        )
      );
    }
  };

  // Auto-draft all uncompleted items
  const handleDraftAll = async () => {
    const uncompleted = items.filter((it) => it.status === "todo");
    if (uncompleted.length === 0 || isDraftingAll) return;

    setIsDraftingAll(true);
    for (let index = 0; index < uncompleted.length; index += 3) {
      const batch = uncompleted.slice(index, index + 3);
      await Promise.all(batch.map((item) => handleGenerateItemDraft(item.id)));
    }
    setIsDraftingAll(false);
  };

  const handleQualityCheck = async () => {
    if (items.length === 0 || checkingQuality) return;
    setCheckingQuality(true);
    try {
      const report = await qualityCheckDraft(items.map((item) => ({
        id: item.id,
        title: item.title,
        requirement_text: item.requirement_text,
        category: item.category,
        draft_text: item.draft_text,
        status: item.status,
      })));
      setQualityReport(report);
      setSelectedIds(new Set(report.results.filter((result) => result.issues.length > 0).map((result) => result.item_id)));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal menjalankan quality check");
    } finally {
      setCheckingQuality(false);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectVisibleItems = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      const allSelected = filteredItems.length > 0 && filteredItems.every((item) => next.has(item.id));
      filteredItems.forEach((item) => (allSelected ? next.delete(item.id) : next.add(item.id)));
      return next;
    });
  };

  const bulkSetStatus = (status: RequirementStatus) => {
    if (selectedIds.size === 0) return;
    setItems((previous) => previous.map((item) => (
      selectedIds.has(item.id) ? { ...item, status } : item
    )));
    setSelectedIds(new Set());
  };

  const handleSaveSession = async () => {
    if (!fileName || items.length === 0 || savingSession) return;
    setSavingSession(true);
    try {
      const saved = await saveProposalSession(
        {
          title: fileName.replace(/\.[^/.]+$/, ""),
          file_name: fileName,
          tor_text: torText,
          items: items.map(({ isGenerating: _isGenerating, error: _error, ...item }) => item),
          status: items.every((item) => item.status === "final") ? "completed" : "draft",
        },
        sessionId ?? undefined,
      );
      setSessionId(saved.id);
      localStorage.setItem(LS_SESSION_ID_KEY, saved.id);
      autoSavedSignature.current = JSON.stringify({
        fileName,
        torText,
        items: items.map(({ isGenerating: _isGenerating, error: _error, ...item }) => item),
      });
      setSessionSaved("Tersimpan");
      setTimeout(() => setSessionSaved(null), 2500);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal menyimpan project");
    } finally {
      setSavingSession(false);
    }
  };

  // Update draft text directly (user edits)
  const handleTextChange = (text: string) => {
    if (!selectedItem) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== selectedItem.id) return it;
        return {
          ...it,
          draft_text: text,
          status: it.status === "todo" && text.trim() ? "draft" : it.status,
        };
      })
    );
  };

  // Change status of current item
  const handleStatusChange = (newStatus: RequirementStatus) => {
    if (!selectedItem) return;
    setItems((prev) =>
      prev.map((it) => (it.id === selectedItem.id ? { ...it, status: newStatus } : it))
    );
  };

  // Copy active item draft text
  const handleCopyCurrentDraft = async () => {
    if (!selectedItem || !selectedItem.draft_text) return;
    try {
      await navigator.clipboard.writeText(selectedItem.draft_text);
      setCopiedItem(true);
      setTimeout(() => setCopiedItem(false), 1800);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenAddSection = () => {
    setSectionFormTitle("");
    setSectionFormCategory("Teknis");
    setSectionFormDescription("");
    setSectionModalMode("add");
    setIsSectionModalOpen(true);
  };

  const handleOpenEditSection = () => {
    if (!selectedItem) return;
    setSectionFormTitle(selectedItem.title);
    setSectionFormCategory(selectedItem.category);
    setSectionFormDescription(selectedItem.requirement_text);
    setSectionModalMode("edit");
    setIsSectionModalOpen(true);
  };

  const handleSaveSectionModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionFormTitle.trim()) return;

    if (sectionModalMode === "add") {
      const newId = `sec-custom-${Date.now()}`;
      const newItem: RequirementItem = {
        id: newId,
        title: sectionFormTitle.trim(),
        category: sectionFormCategory || "Teknis",
        requirement_text: sectionFormDescription.trim() || "Cakupan bagian kustom.",
        draft_text: "",
        status: "todo",
      };
      setItems((prev) => [...prev, newItem]);
      setSelectedItemId(newId);
    } else if (sectionModalMode === "edit" && selectedItemId) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedItemId
            ? {
                ...it,
                title: sectionFormTitle.trim(),
                category: sectionFormCategory || "Teknis",
                requirement_text: sectionFormDescription.trim() || it.requirement_text,
              }
            : it
        )
      );
    }
    setIsSectionModalOpen(false);
  };

  const handleDeleteSection = (itemId: string) => {
    const itemToDelete = items.find((it) => it.id === itemId);
    const confirmMsg = itemToDelete
      ? `Apakah Anda yakin ingin menghapus bagian "${itemToDelete.title}"?`
      : "Apakah Anda yakin ingin menghapus bagian ini?";
    if (!window.confirm(confirmMsg)) return;

    setItems((prev) => {
      const updated = prev.filter((it) => it.id !== itemId);
      if (selectedItemId === itemId) {
        setSelectedItemId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
  };

  return (
    <div className="flex h-screen flex-col bg-surface font-sans text-text-primary">
      <Topbar
        title="Jawab Dokumen Tender (TOR / RFP)"
        subtitle="Pecah soal tender otomatis, cari referensi dari arsip internal, dan susun proposal siap cetak"
      />

      {/* STATE A: EMPTY / UPLOAD STATE */}
      {!fileName && (
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          <div className="w-full max-w-2xl">
            {/* Upload Card */}
            <div className="rounded-xl border border-surface-border bg-surface-raised p-8 shadow-panel transition-all">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink shadow-subtle">
                  {uploading ? (
                    <Loader2 size={28} className="animate-spin" />
                  ) : (
                    <UploadCloud size={28} />
                  )}
                </div>

                <h3 className="text-lg font-semibold text-text-primary">
                  {uploading ? "Mengekstrak teks dokumen..." : "Buat Dokumen dari TOR / RFP"}
                </h3>
                <p className="mt-1 text-sm text-text-muted max-w-md">
                  Pilih jenis dokumen, upload TOR/RFP, lalu Synapse menyusun isi berdasarkan knowledge base internal.
                </p>

                <div className="mt-5 w-full max-w-md text-left">
                  <label className="mb-1.5 block text-xs font-semibold text-text-primary">Dokumen yang ingin dibuat</label>
                  <select
                    value={docTypeId}
                    onChange={(e) => {
                      const next = e.target.value as DraftDocTypeId;
                      setDocTypeId(next);
                      const allowed = getDocType(next).formats;
                      if (!allowed.includes(format)) setFormat(allowed[0]);
                    }}
                    className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
                  {getDocType(docTypeId).formats.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      className={`rounded border px-2 py-0.5 font-mono transition-all ${
                        format === f
                          ? "border-accent bg-accent-soft text-accent-ink"
                          : "border-surface-border bg-surface hover:border-accent"
                      }`}
                    >
                      {FORMAT_LABELS[f]}
                    </button>
                  ))}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    variant="primary"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-ink-900 hover:bg-ink-800 text-white min-w-[140px]"
                  >
                    {uploading ? "Mengupload..." : "Pilih dokumen sumber"}
                  </Button>
                </div>

                {errorMessage && (
                  <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertCircle size={14} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="mt-6 w-full max-w-md text-left">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-semibold text-text-primary">Sumber Referensi (opsional)</label>
                    {selectedReferenceIds.size > 0 && (
                      <span className="text-[11px] font-medium text-accent-ink">{selectedReferenceIds.size} dipilih</span>
                    )}
                  </div>
                  <p className="mb-1.5 text-[11px] text-text-muted">
                    Pilih beberapa dokumen dari Drive sebagai acuan jawaban, seperti sumber di NotebookLM.
                  </p>
                  <input
                    type="text"
                    value={referenceSearch}
                    onChange={(e) => setReferenceSearch(e.target.value)}
                    placeholder="Cari dokumen di Drive..."
                    className="mb-1.5 w-full rounded-md border border-surface-border bg-surface px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                  />
                  <div className="max-h-40 overflow-y-auto rounded-md border border-surface-border bg-surface p-1.5">
                    {filteredReferenceDocs.length === 0 ? (
                      <p className="px-1.5 py-1 text-xs text-text-muted">
                        {referenceDocs.length === 0 ? "Drive belum tersinkron atau kosong." : "Tidak ada dokumen cocok."}
                      </p>
                    ) : (
                      filteredReferenceDocs.map((doc) => (
                        <label
                          key={doc.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-text-primary hover:bg-surface-raised"
                        >
                          <input
                            type="checkbox"
                            checked={selectedReferenceIds.has(doc.id)}
                            onChange={() => toggleReferenceDoc(doc.id)}
                            className="shrink-0 rounded border-surface-border text-accent focus:ring-accent"
                          />
                          <span className="truncate">{doc.title}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Loopio value prop banner */}
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
                <div className="flex items-center gap-2 font-medium text-xs text-text-primary mb-1">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-accent-ink text-[10px] font-bold">
                    1
                  </span>
                  Jawaban dari Arsip
                </div>
                <p className="text-xs text-text-muted">
                  AI mencocokkan jawaban resmi dari 4.500+ arsip proposal & checklist internal.
                </p>
              </div>

              <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
                <div className="flex items-center gap-2 font-medium text-xs text-text-primary mb-1">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-accent-ink text-[10px] font-bold">
                    2
                  </span>
                  Ekspor Siap Copas
                </div>
                <p className="text-xs text-text-muted">
                  Edit per butir, pantau progres, lalu salin seluruh jawaban ke proposal Word.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATE B: CHECKLIST WORKSPACE */}
      {fileName && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header with Progress Bar & Global Actions */}
          <ProgressHeader
            fileName={fileName}
            items={items}
            onDraftAll={handleDraftAll}
            onOpenExport={() => setIsExportOpen(true)}
            onResetFile={handleReset}
            isDraftingAll={isDraftingAll}
            lastSaved={lastSaved ?? undefined}
            onQualityCheck={handleQualityCheck}
            isCheckingQuality={checkingQuality}
            qualityScore={qualityReport?.overall_score}
            onSaveSession={handleSaveSession}
            isSavingSession={savingSession}
            sessionSaved={sessionSaved ?? undefined}
          />

          {/* Split Workspace */}
          <div className="flex flex-1 overflow-hidden">
            {/* LEFT COLUMN: REQUIREMENTS NAVIGATOR / CHECKLIST */}
            <div className="flex w-full md:w-[420px] lg:w-[460px] flex-col border-r border-surface-border bg-surface-raised">
              {/* Search & Filters */}
              <div className="border-b border-surface-border p-3 space-y-2.5">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari bagian, SLA, storage..."
                    className="w-full rounded-md border border-surface-border bg-surface pl-8 pr-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent transition-colors"
                  />
                </div>

                {/* Status Tabs */}
                <div className="flex rounded-md border border-surface-border bg-surface p-0.5 text-xs">
                  <button
                    onClick={() => setFilterStatus("all")}
                    className={`flex-1 rounded py-1 font-medium transition-all ${
                      filterStatus === "all"
                        ? "bg-surface-raised text-text-primary shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Semua ({items.length})
                  </button>
                  <button
                    onClick={() => setFilterStatus("todo")}
                    className={`flex-1 rounded py-1 font-medium transition-all ${
                      filterStatus === "todo"
                        ? "bg-surface-raised text-text-primary shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Belum ({items.filter((i) => i.status === "todo").length})
                  </button>
                  <button
                    onClick={() => setFilterStatus("draft")}
                    className={`flex-1 rounded py-1 font-medium transition-all ${
                      filterStatus === "draft"
                        ? "bg-surface-raised text-amber-700 shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Draf ({items.filter((i) => i.status === "draft").length})
                  </button>
                  <button
                    onClick={() => setFilterStatus("final")}
                    className={`flex-1 rounded py-1 font-medium transition-all ${
                      filterStatus === "final"
                        ? "bg-surface-raised text-emerald-700 shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Final ({items.filter((i) => i.status === "final").length})
                  </button>
                  <button
                    onClick={() => setFilterStatus("review")}
                    className={`flex-1 rounded py-1 font-medium transition-all ${
                      filterStatus === "review"
                        ? "bg-surface-raised text-red-700 shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Review ({qualityReport?.items_with_issues ?? 0})
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <button
                    onClick={selectVisibleItems}
                    className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary"
                  >
                    <CheckSquare size={13} />
                    {filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id))
                      ? "Batalkan pilihan"
                      : "Pilih yang tampil"}
                  </button>
                  {selectedIds.size > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-text-primary">{selectedIds.size} dipilih</span>
                      <button onClick={() => bulkSetStatus("draft")} className="rounded border border-surface-border px-2 py-1 text-amber-700 hover:bg-accent-soft">Jadikan Draf</button>
                      <button onClick={() => bulkSetStatus("final")} className="rounded border border-emerald-200 px-2 py-1 text-emerald-700 hover:bg-emerald-50">Finalkan</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenAddSection}
                      className="inline-flex items-center gap-1 text-accent-ink bg-accent-soft hover:bg-accent border border-accent/40 rounded px-2.5 py-1 font-semibold transition-colors"
                    >
                      <Plus size={12} />
                      Tambah Bagian
                    </button>
                  )}
                </div>
              </div>

              {qualityReport && (
                <div className="border-b border-surface-border bg-surface px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-text-primary">Quality check</p>
                      <p className="text-[11px] text-text-muted">
                        {qualityReport.items_with_issues} dari {qualityReport.total_items} bagian perlu review
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${qualityReport.overall_score >= 80 ? "bg-emerald-50 text-emerald-700" : qualityReport.overall_score >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                      {qualityReport.overall_score}/100
                    </span>
                  </div>
                  {qualityReport.results.filter((result) => result.issues.length > 0).slice(0, 3).map((result) => (
                    <button
                      key={result.item_id}
                      onClick={() => setSelectedItemId(result.item_id)}
                      className="mt-2 block w-full text-left text-[11px] text-amber-800 hover:text-text-primary"
                    >
                      <span className="font-semibold">{result.title}:</span> {result.issues[0]}
                    </button>
                  ))}
                </div>
              )}

              {/* Requirement Items List */}
              <div className="flex-1 overflow-y-auto divide-y divide-surface-border">
                {filteredItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-text-muted">
                    Tidak ada bagian yang cocok dengan filter.
                  </div>
                ) : (
                  filteredItems.map((item, idx) => {
                    const isSelected = selectedItem?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedItemId(item.id)}
                        className={`group cursor-pointer p-4 transition-all relative ${
                          isSelected
                            ? "bg-surface border-l-4 border-l-accent"
                            : "hover:bg-surface/50 border-l-4 border-l-transparent"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleItemSelection(item.id)}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`Pilih ${item.title}`}
                              className="rounded border-surface-border text-accent focus:ring-accent"
                            />
                            <span className="text-[11px] font-mono font-medium text-text-muted">
                              #{idx + 1}
                            </span>
                            <span className="rounded bg-surface border border-surface-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                              {item.category}
                            </span>
                          </div>

                          {/* Status Pill */}
                          <div>
                            {item.status === "final" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                <CheckCircle2 size={10} /> Final
                              </span>
                            ) : item.status === "draft" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft border border-accent/40 px-2 py-0.5 text-[10px] font-medium text-accent-ink">
                                <Clock size={10} /> Draf
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-surface border border-surface-border px-2 py-0.5 text-[10px] font-medium text-text-muted">
                                Belum
                              </span>
                            )}
                          </div>
                        </div>

                        <h4 className="mt-1.5 text-xs font-semibold text-text-primary line-clamp-1">
                          {item.title}
                        </h4>

                        <p className="mt-1 text-[11px] leading-relaxed text-text-muted line-clamp-2">
                          {item.requirement_text}
                        </p>

                        {/* Generation spinner indicator */}
                        {item.isGenerating && (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-accent-ink">
                            <Loader2 size={12} className="animate-spin" />
                            <span>Menyusun draf AI...</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Add Section affordance */}
              <div className="p-2.5 border-t border-surface-border bg-surface/50">
                <button
                  type="button"
                  onClick={handleOpenAddSection}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-surface-border bg-surface py-1.5 text-xs font-semibold text-text-secondary hover:border-accent hover:text-text-primary hover:bg-accent-soft/30 transition-all"
                >
                  <Plus size={13} className="text-accent-ink" />
                  Tambah Bagian Baru
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: ACTIVE REQUIREMENT STUDIO & DRAFT WORKSPACE */}
            <div className="flex flex-1 flex-col overflow-y-auto bg-surface p-6 lg:p-8">
              {selectedItem ? (
                <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
                  {/* Item Header & Status Bar */}
                  <div className="flex flex-col gap-4 rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-ink">
                          {selectedItem.id.toUpperCase()}
                        </span>
                        <span className="rounded bg-surface border border-surface-border px-2 py-0.5 text-xs font-medium text-text-secondary">
                          {selectedItem.category}
                        </span>
                        <button
                          type="button"
                          onClick={handleOpenEditSection}
                          title="Edit Judul & Cakupan Bagian"
                          className="inline-flex items-center gap-1 rounded border border-surface-border bg-surface px-2 py-0.5 text-[11px] text-text-secondary hover:border-accent hover:text-text-primary transition-colors ml-1"
                        >
                          <Pencil size={11} /> Edit Info
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSection(selectedItem.id)}
                          title="Hapus Bagian ini"
                          className="inline-flex items-center gap-1 rounded border border-red-200 bg-surface px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={11} /> Hapus
                        </button>
                      </div>
                      <h3 className="mt-2 text-base font-bold text-text-primary">
                        {selectedItem.title}
                      </h3>
                    </div>

                    {/* Status Selector Segmented Controls */}
                    <div className="flex items-center rounded-lg border border-surface-border bg-surface p-1">
                      <button
                        onClick={() => handleStatusChange("todo")}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                          selectedItem.status === "todo"
                            ? "bg-surface-raised text-text-primary shadow-subtle"
                            : "text-text-muted hover:text-text-primary"
                        }`}
                      >
                        Belum
                      </button>
                      <button
                        onClick={() => handleStatusChange("draft")}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                          selectedItem.status === "draft"
                            ? "bg-accent-soft text-accent-ink font-semibold shadow-subtle"
                            : "text-text-muted hover:text-text-primary"
                        }`}
                      >
                        Draf
                      </button>
                      <button
                        onClick={() => handleStatusChange("final")}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                          selectedItem.status === "final"
                            ? "bg-emerald-600 text-white font-semibold shadow-subtle"
                            : "text-text-muted hover:text-text-primary"
                        }`}
                      >
                        Final
                      </button>
                    </div>
                  </div>

                  {/* Requirement Blockquote */}
                  <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                        Tujuan Bagian Ini
                      </span>
                    </div>
                    <blockquote className="rounded-lg border-l-4 border-accent bg-surface p-4 text-xs font-normal leading-relaxed text-text-primary">
                      {selectedItem.requirement_text}
                    </blockquote>
                  </div>

                  {/* AI Draft Response Editor */}
                  <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-accent-ink" />
                        <span className="text-sm font-semibold text-text-primary">
                          Draf Jawaban Proposal (Siap Copas)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedItem.draft_text && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleCopyCurrentDraft}
                            className="text-xs h-7 px-2.5"
                          >
                            {copiedItem ? (
                              <>
                                <Check size={12} className="mr-1 text-emerald-500" />
                                Tersalin
                              </>
                            ) : (
                              <>
                                <Copy size={12} className="mr-1" />
                                Salin
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={selectedItem.isGenerating}
                          onClick={() =>
                            handleGenerateItemDraft(selectedItem.id, customPrompt)
                          }
                          className="bg-ink-900 hover:bg-ink-800 text-white text-xs h-7 px-3"
                        >
                          {selectedItem.isGenerating ? (
                            <>
                              <Loader2 size={12} className="mr-1.5 animate-spin" />
                              Menyusun...
                            </>
                          ) : selectedItem.draft_text ? (
                            <>
                              <Sparkles size={12} className="mr-1.5" />
                              Regenerate Draf
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} className="mr-1.5" />
                              Buat Draf AI
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Textarea Editor */}
                    <div className="relative">
                      <textarea
                        value={selectedItem.draft_text}
                        onChange={(e) => handleTextChange(e.target.value)}
                        placeholder="Klik 'Buat Draf AI' atau ketik langsung konten bagian proposal di sini..."
                        rows={8}
                        className="w-full rounded-lg border border-surface-border bg-surface p-4 text-xs leading-relaxed text-text-primary outline-none focus:border-accent font-sans transition-colors resize-y"
                      />
                      {selectedItem.draft_text && (
                        <div className="mt-1 flex justify-end text-[11px] text-text-muted">
                          {selectedItem.draft_text.split(/\s+/).filter(Boolean).length} kata ·{" "}
                          {selectedItem.draft_text.length} karakter
                        </div>
                      )}
                    </div>

                    {/* Quick Custom Instruction Input */}
                    <div className="flex items-center gap-2 rounded-md border border-surface-border bg-surface px-3 py-2">
                      <input
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleGenerateItemDraft(selectedItem.id, customPrompt);
                          }
                        }}
                        placeholder="Instruksi kustom: misal 'Tambahkan komitmen response time 15 menit'..."
                        className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
                      />
                      <button
                        onClick={() =>
                          handleGenerateItemDraft(selectedItem.id, customPrompt)
                        }
                        disabled={selectedItem.isGenerating}
                        className="rounded p-1 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
                      >
                        <SendHorizontal size={14} />
                      </button>
                    </div>

                    {/* Error display */}
                    {selectedItem.error && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                        {selectedItem.error}
                      </div>
                    )}
                  </div>

                  {/* Internal Knowledge Base Grounding Citations */}
                  <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen size={16} className="text-secondary" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                        Rujukan Dokumen Internal yang Digunakan
                      </h4>
                    </div>

                    {selectedItem.sources && selectedItem.sources.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {selectedItem.sources.map((src, idx) => (
                          <div
                            key={src.id || idx}
                            className="flex items-center justify-between rounded-lg border border-secondary-soft bg-surface p-3 hover:border-secondary transition-colors"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <FileText size={14} className="text-secondary shrink-0" />
                              <span className="text-xs font-medium text-text-primary truncate">
                                {src.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {src.division && (
                                <span className="rounded bg-secondary-soft text-secondary px-1.5 py-0.5 text-[10px] font-semibold">
                                  {src.division}
                                </span>
                              )}
                              <span className="rounded bg-surface border border-surface-border text-text-muted px-1.5 py-0.5 text-[10px]">
                                {src.docType}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">
                        Belum ada sitasi. Draf yang dihasilkan via tombol AI akan
                        menampilkan dokumen internal presales yang menjadi rujukan jawaban ini.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-text-muted">
                  Pilih salah satu butir soal di kolom kiri untuk melihat dan mengedit draf jawaban.
                </div>
              )}
            </div>
          </div>

          {/* Proposal Compilation & Export Modal */}
          <ExportModal
            isOpen={isExportOpen}
            onClose={() => setIsExportOpen(false)}
            documentTitle={fileName}
            items={items}
            initialDocTypeId={docTypeId}
            initialFormat={format}
            selectedReferenceDocs={referenceDocs.filter((d) => selectedReferenceIds.has(d.id))}
          />
        </div>
      )}

      {/* Add / Edit Section Modal */}
      {isSectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex w-full max-w-md flex-col rounded-xl border border-surface-border bg-surface-raised shadow-panel">
            <div className="flex items-center justify-between border-b border-surface-border px-5 py-3.5">
              <h3 className="text-sm font-bold text-text-primary">
                {sectionModalMode === "add" ? "Tambah Bagian Baru" : "Edit Info Bagian"}
              </h3>
              <button
                type="button"
                onClick={() => setIsSectionModalOpen(false)}
                className="rounded-md p-1 text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSectionModal} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Judul Bagian / Sub-Bab *
                </label>
                <input
                  type="text"
                  required
                  value={sectionFormTitle}
                  onChange={(e) => setSectionFormTitle(e.target.value)}
                  placeholder="Contoh: Arsitektur Keamanan & Disaster Recovery"
                  className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Kategori Bagian
                </label>
                <select
                  value={sectionFormCategory}
                  onChange={(e) => setSectionFormCategory(e.target.value)}
                  className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
                >
                  <option value="Teknis">Teknis</option>
                  <option value="Umum">Umum</option>
                  <option value="SLA & Support">SLA & Support</option>
                  <option value="Manajemen Proyek">Manajemen Proyek</option>
                  <option value="Administrasi & Legal">Administrasi & Legal</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Cakupan / Tujuan Bagian (Acuan Jawaban AI)
                </label>
                <textarea
                  rows={3}
                  value={sectionFormDescription}
                  onChange={(e) => setSectionFormDescription(e.target.value)}
                  placeholder="Deskripsikan poin-poin yang perlu dijawab pada bagian ini berdasarkan TOR..."
                  className="w-full rounded-md border border-surface-border bg-surface p-3 text-xs text-text-primary outline-none focus:border-accent resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsSectionModalOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="bg-ink-900 text-white hover:bg-ink-800"
                >
                  {sectionModalMode === "add" ? "Tambah Bagian" : "Simpan Perubahan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Onboarding Tour Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />
    </div>
  );
}
