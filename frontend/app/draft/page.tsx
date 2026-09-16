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
  ArrowUp,
  ArrowDown,
  RefreshCw,
  SlidersHorizontal,
  Layers,
  Image as ImageIcon,
  Maximize2,
} from "lucide-react";
import {
  uploadTor,
  generateItemDraft,
  qualityCheckDraft,
  recommendStructure,
  getProposalSession,
  saveProposalSession,
  listDocuments,
  getDocumentChunks,
  type QualityCheckResult,
  type RecommendedSection,
} from "@/lib/api";
import { OnboardingModal } from "@/components/onboarding-modal";
import type { RequirementItem, RequirementStatus, SourceCitation, IndexedDocument } from "@/lib/types";
import { DOC_TYPES, FORMAT_LABELS, getDocType, type DraftDocTypeId, type DraftFormat } from "@/lib/document-types";
import { SKELETONS } from "@/lib/skeletons";
import { VisualAssetStudio } from "@/components/draft/visual-asset-studio";

// Poin 4: Grounding cuplikan TOR kini diproses secara semantik oleh backend
// menggunakan model sentence-transformers lokal. Frontend meneruskan konteks TOR
// hingga 35.000 karakter agar seluruh bab dan paragraf dapat diranking secara akurat.
function pickRelevantTorExcerpt(torText: string, _sectionTitle?: string, maxLen = 35000): string {
  if (!torText) return "";
  return torText.slice(0, maxLen);
}

function filterDocsByQuery(docs: IndexedDocument[], query: string): IndexedDocument[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter(
    (d) =>
      d.title.toLowerCase().includes(q) ||
      d.docType?.toLowerCase().includes(q)
  );
}

// Sufficiency/grounding signal for a drafted section, derived from the citation
// count the last generation actually returned — no extra API call needed.
type GroundingBadge = { label: string; className: string; dotClassName: string };

function getGroundingBadge(item: RequirementItem): GroundingBadge | null {
  if (!item.draft_text?.trim()) return null;
  const sourceCount = item.sources?.length ?? 0;
  if (sourceCount >= 3) {
    return {
      label: "Grounding Kuat",
      className: "bg-emerald-50 border-emerald-200 text-emerald-700",
      dotClassName: "bg-emerald-500",
    };
  }
  if (sourceCount >= 1) {
    return {
      label: "Grounding Sedang",
      className: "bg-amber-50 border-amber-200 text-amber-700",
      dotClassName: "bg-amber-500",
    };
  }
  return {
    label: "Perlu Tambahan Referensi",
    className: "bg-red-50 border-red-200 text-red-700",
    dotClassName: "bg-red-500",
  };
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
  const [justGeneratedId, setJustGeneratedId] = useState<string | null>(null);
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
  const [loadingReferenceDocs, setLoadingReferenceDocs] = useState(false);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<string>>(new Set());
  const [referenceSearch, setReferenceSearch] = useState("");
  const [sourceInputMode, setSourceInputMode] = useState<"upload" | "library">("upload");
  const [librarySourceSearch, setLibrarySourceSearch] = useState("");
  const autoSavedSignature = useRef<string | null>(null);

  // Structure Curation & Discussion Gate
  const [curatingStructure, setCuratingStructure] = useState(false);
  const [isRecommendingStructure, setIsRecommendingStructure] = useState(false);
  const [structureSummary, setStructureSummary] = useState<string>("");
  const [curationItems, setCurationItems] = useState<RequirementItem[]>([]);
  const [structureInstruction, setStructureInstruction] = useState("");
  const [isRevisingStructure, setIsRevisingStructure] = useState(false);
  const [curationTargetEditId, setCurationTargetEditId] = useState<string | null>(null);

  // Real-time Drafting Progress Bar
  const [draftingProgress, setDraftingProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);

  // Section management (Add / Edit / Delete)
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [sectionModalMode, setSectionModalMode] = useState<"add" | "edit">("add");
  const [sectionModalContext, setSectionModalContext] = useState<"workspace" | "curation">("workspace");
  const [sectionFormTitle, setSectionFormTitle] = useState("");
  const [sectionFormCategory, setSectionFormCategory] = useState("Teknis");
  const [sectionFormDescription, setSectionFormDescription] = useState("");
  const [sectionFormRationale, setSectionFormRationale] = useState("");

  // Visual Asset Studio state & lightbox preview
  const [isVisualStudioOpen, setIsVisualStudioOpen] = useState(false);
  const [visualStudioTab, setVisualStudioTab] = useState<"search" | "hld" | "upload">("search");
  const [previewImageModal, setPreviewImageModal] = useState<{ url: string; caption: string } | null>(null);
  const visualStudioRef = useRef<HTMLDivElement>(null);

  const handleOpenStudio = (tab: "search" | "hld" | "upload") => {
    setVisualStudioTab(tab);
    setIsVisualStudioOpen(true);
    setTimeout(() => {
      visualStudioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

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
  const loadReferenceDocs = async () => {
    setLoadingReferenceDocs(true);
    try {
      const docs = await listDocuments();
      setReferenceDocs(docs);
    } catch {
      setReferenceDocs([]);
    } finally {
      setLoadingReferenceDocs(false);
    }
  };

  useEffect(() => {
    loadReferenceDocs();
  }, []);

  const toggleReferenceDoc = (id: string) => {
    setSelectedReferenceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredReferenceDocs = useMemo(
    () => filterDocsByQuery(referenceDocs, referenceSearch),
    [referenceDocs, referenceSearch]
  );

  const filteredLibrarySourceDocs = useMemo(
    () => filterDocsByQuery(referenceDocs, librarySourceSearch),
    [referenceDocs, librarySourceSearch]
  );

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

  const startDraftingBatch = async (targetItems: RequirementItem[], textContext: string) => {
    setIsDraftingAll(true);
    setDraftingProgress({ current: 0, total: targetItems.length, title: targetItems[0]?.title || "" });
    for (let index = 0; index < targetItems.length; index += 2) {
      const batch = targetItems.slice(index, index + 2);
      setDraftingProgress({
        current: Math.min(index + 1, targetItems.length),
        total: targetItems.length,
        title: batch[0]?.title || "",
      });
      const generated = await Promise.all(
        batch.map(async (item) => {
          try {
            const result = await generateItemDraft(
              item.id,
              item.requirement_text,
              undefined,
              pickRelevantTorExcerpt(textContext, item.title),
              Array.from(selectedReferenceIds),
            );
            return { itemId: item.id, result };
          } catch {
            return { itemId: item.id, result: null };
          }
        }),
      );
      setItems((previous) =>
        previous.map((item) => {
          const generatedItem = generated.find((entry) => entry.itemId === item.id);
          if (!generatedItem?.result) return item;
          return {
            ...item,
            draft_text: generatedItem.result.draft_text,
            status: "draft",
            sources: generatedItem.result.sources,
            image_data_url: generatedItem.result.image_data_url || item.image_data_url,
            image_caption: generatedItem.result.image_caption || item.image_caption,
          };
        })
      );
    }
    setDraftingProgress(null);
    setIsDraftingAll(false);
  };

  const processSourceText = async (extractedText: string, title: string) => {
    setTorText(extractedText);
    setFileName(title);
    setUploading(false);

    // Transition into Structure Curation View
    setCuratingStructure(true);
    setIsRecommendingStructure(true);
    try {
      const resp = await recommendStructure({
        tor_text: extractedText,
        doc_type: docTypeId,
        document_title: title,
      });
      const recItems: RequirementItem[] = resp.items.map((sec: RecommendedSection) => ({
        id: sec.id,
        title: sec.title,
        requirement_text: sec.requirement_text,
        category: sec.category,
        rationale: sec.rationale,
        draft_text: "",
        status: "todo",
      }));
      setCurationItems(recItems);
      setStructureSummary(resp.summary);
    } catch (err) {
      console.warn("recommendStructure fallback:", err);
      const skeleton = SKELETONS[docTypeId];
      setCurationItems(
        skeleton.map((sec) => ({
          id: sec.id,
          title: sec.title,
          requirement_text: sec.description,
          category: sec.category,
          rationale: `Rekomendasi sub-bab baku untuk format ${getDocType(docTypeId).label}.`,
          draft_text: "",
          status: "todo",
        }))
      );
    } finally {
      setIsRecommendingStructure(false);
    }
  };

  const processSourceFile = async (file: File) => {
    setUploading(true);
    setErrorMessage(null);
    try {
      const extractedText = await uploadTor(file);
      await processSourceText(extractedText, file.name);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Gagal memproses dokumen. Pastikan API server aktif."
      );
      setUploading(false);
    }
  };

  const handleSelectDriveSource = async (doc: IndexedDocument) => {
    setUploading(true);
    setErrorMessage(null);
    try {
      const chunkRes = await getDocumentChunks(doc.id);
      const fullText = (chunkRes.chunks || []).map((c) => c.content).join("\n\n");
      if (!fullText.trim()) {
        throw new Error("Dokumen terpilih di library tidak memiliki teks yang dapat diproses.");
      }
      await processSourceText(fullText, doc.title);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Gagal memuat dokumen dari library Google Drive."
      );
      setUploading(false);
    }
  };

  const handleRefineStructure = async () => {
    if (!structureInstruction.trim() || isRevisingStructure) return;
    setIsRevisingStructure(true);
    try {
      const resp = await recommendStructure({
        tor_text: torText,
        doc_type: docTypeId,
        document_title: fileName || "Tender",
        instruction: structureInstruction.trim(),
      });
      const recItems: RequirementItem[] = resp.items.map((sec: RecommendedSection) => ({
        id: sec.id,
        title: sec.title,
        requirement_text: sec.requirement_text,
        category: sec.category,
        rationale: sec.rationale,
        draft_text: "",
        status: "todo",
      }));
      setCurationItems(recItems);
      setStructureSummary(resp.summary);
      setStructureInstruction("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal merevisi struktur.");
    } finally {
      setIsRevisingStructure(false);
    }
  };

  const handleApproveStructure = async () => {
    if (curationItems.length === 0) return;
    setItems(curationItems);
    setSelectedItemId(curationItems[0]?.id || null);
    setCuratingStructure(false);
    await startDraftingBatch(curationItems, torText);
  };

  const moveCurationItem = (index: number, direction: "up" | "down") => {
    setCurationItems((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const moveWorkspaceItem = (index: number, direction: "up" | "down") => {
    setItems((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleOpenAddCurationSection = () => {
    setSectionFormTitle("");
    setSectionFormCategory("Teknis");
    setSectionFormDescription("");
    setSectionFormRationale("");
    setSectionModalMode("add");
    setSectionModalContext("curation");
    setIsSectionModalOpen(true);
  };

  const handleOpenEditCurationSection = (item: RequirementItem) => {
    setCurationTargetEditId(item.id);
    setSectionFormTitle(item.title);
    setSectionFormCategory(item.category);
    setSectionFormDescription(item.requirement_text);
    setSectionFormRationale(item.rationale || "");
    setSectionModalMode("edit");
    setSectionModalContext("curation");
    setIsSectionModalOpen(true);
  };

  const handleDeleteCurationSection = (itemId: string) => {
    setCurationItems((prev) => prev.filter((it) => it.id !== itemId));
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
    setCuratingStructure(false);
    setCurationItems([]);
    setStructureSummary("");
    setQualityReport(null);
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
            image_data_url: result.image_data_url || it.image_data_url,
            image_caption: result.image_caption || it.image_caption,
            isGenerating: false,
          };
        })
      );
      if (instruction) setCustomPrompt("");
      setJustGeneratedId(itemId);
      setTimeout(() => setJustGeneratedId((cur) => (cur === itemId ? null : cur)), 900);
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
      setIsQualityModalOpen(true);
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
    setSectionFormRationale("");
    setSectionModalMode("add");
    setSectionModalContext("workspace");
    setIsSectionModalOpen(true);
  };

  const handleOpenEditSection = () => {
    if (!selectedItem) return;
    setSectionFormTitle(selectedItem.title);
    setSectionFormCategory(selectedItem.category);
    setSectionFormDescription(selectedItem.requirement_text);
    setSectionFormRationale(selectedItem.rationale || "");
    setSectionModalMode("edit");
    setSectionModalContext("workspace");
    setIsSectionModalOpen(true);
  };

  const handleSaveSectionModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionFormTitle.trim()) return;

    if (sectionModalContext === "curation") {
      if (sectionModalMode === "add") {
        const newId = `sec-curation-${Date.now()}`;
        const newItem: RequirementItem = {
          id: newId,
          title: sectionFormTitle.trim(),
          category: sectionFormCategory || "Teknis",
          requirement_text: sectionFormDescription.trim() || "Cakupan bagian kustom.",
          rationale: sectionFormRationale.trim() || "Ditambahkan manual oleh user untuk melengkapi struktur proposal.",
          draft_text: "",
          status: "todo",
        };
        setCurationItems((prev) => [...prev, newItem]);
      } else if (sectionModalMode === "edit" && curationTargetEditId) {
        setCurationItems((prev) =>
          prev.map((it) =>
            it.id === curationTargetEditId
              ? {
                  ...it,
                  title: sectionFormTitle.trim(),
                  category: sectionFormCategory || "Teknis",
                  requirement_text: sectionFormDescription.trim() || it.requirement_text,
                  rationale: sectionFormRationale.trim() || it.rationale,
                }
              : it
          )
        );
      }
    } else {
      if (sectionModalMode === "add") {
        const newId = `sec-custom-${Date.now()}`;
        const newItem: RequirementItem = {
          id: newId,
          title: sectionFormTitle.trim(),
          category: sectionFormCategory || "Teknis",
          requirement_text: sectionFormDescription.trim() || "Cakupan bagian kustom.",
          rationale: sectionFormRationale.trim() || "",
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
                  rationale: sectionFormRationale.trim() || it.rationale,
                }
              : it
          )
        );
      }
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

                <div className="mt-4 w-full max-w-md text-left">
                  <label className="mb-1.5 block text-xs font-semibold text-text-primary">
                    Format / Ekstensi Output yang Ingin Dihasilkan
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {getDocType(docTypeId).formats.map((f) => {
                      const isSelected = format === f;
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFormat(f)}
                          className={`flex flex-col items-center justify-center gap-1 py-2.5 px-3 rounded-lg border text-xs transition-all ${
                            isSelected
                              ? "border-accent bg-accent-soft text-accent-ink shadow-sm ring-1 ring-accent font-semibold"
                              : "border-surface-border bg-surface hover:border-accent/60 text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          <span className="text-base">
                            {f === "docx" ? "📄" : f === "pdf" ? "📕" : "📊"}
                          </span>
                          <span className="font-mono text-[11px]">{FORMAT_LABELS[f]}</span>
                          {isSelected && (
                            <span className="text-[10px] bg-accent/30 text-accent-ink px-1.5 py-0.2 rounded font-bold">
                              Dipilih
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Source Document Selection (Upload or Library) */}
                <div className="mt-6 w-full max-w-md text-left">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-text-primary">
                      Pilih Dokumen Sumber (TOR / RFP / RKS)
                    </label>
                    <span className="text-[10px] text-text-muted">
                      Wajib 1 dokumen acuan
                    </span>
                  </div>

                  {/* Mode selector tab */}
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-surface-border bg-surface p-1 mb-3">
                    <button
                      type="button"
                      onClick={() => setSourceInputMode("upload")}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs transition-all ${
                        sourceInputMode === "upload"
                          ? "bg-surface-raised text-text-primary font-semibold shadow-subtle border border-surface-border"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      <UploadCloud size={14} />
                      <span>Upload dari Laptop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceInputMode("library")}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs transition-all ${
                        sourceInputMode === "library"
                          ? "bg-surface-raised text-text-primary font-semibold shadow-subtle border border-surface-border"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      <BookOpen size={14} />
                      <span>Pilih dari Library ({referenceDocs.length})</span>
                    </button>
                  </div>

                  {sourceInputMode === "upload" ? (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-surface-border hover:border-accent rounded-xl bg-surface/40 hover:bg-surface-raised cursor-pointer transition-all group text-center"
                      >
                        <div className="h-11 w-11 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                          {uploading ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
                        </div>
                        <p className="text-xs font-semibold text-text-primary">
                          {uploading ? "Sedang mengekstrak teks..." : "Klik untuk Pilih File TOR / RFP"}
                        </p>
                        <p className="text-[11px] text-text-muted mt-0.5">
                          Mendukung format PDF (.pdf), Word (.docx), atau Teks (.txt)
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                          type="text"
                          value={librarySourceSearch}
                          onChange={(e) => setLibrarySourceSearch(e.target.value)}
                          placeholder="Cari nama dokumen TOR, RKS, RFP di library..."
                          className="w-full rounded-md border border-surface-border bg-surface pl-8 pr-7 py-2 text-xs text-text-primary outline-none focus:border-accent"
                        />
                        {librarySourceSearch && (
                          <button
                            type="button"
                            onClick={() => setLibrarySourceSearch("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      <div className="max-h-56 overflow-y-auto rounded-lg border border-surface-border bg-surface divide-y divide-surface-border">
                        {loadingReferenceDocs ? (
                          <div className="flex items-center justify-center p-6 text-xs text-text-muted gap-2">
                            <Loader2 size={14} className="animate-spin text-accent" /> Memuat dokumen dari library...
                          </div>
                        ) : filteredLibrarySourceDocs.length === 0 ? (
                          <div className="p-6 text-center text-xs text-text-muted">
                            {referenceDocs.length === 0 ? "Library belum terhubung atau kosong." : "Tidak ada dokumen yang cocok."}
                          </div>
                        ) : (
                          filteredLibrarySourceDocs.map((doc) => (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => handleSelectDriveSource(doc)}
                              disabled={uploading}
                              className="w-full flex items-center justify-between p-2.5 text-left hover:bg-surface-raised transition-colors group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <FileText size={16} className="text-accent shrink-0" />
                                <div className="truncate">
                                  <p className="text-xs font-medium text-text-primary truncate group-hover:text-accent-ink">
                                    {doc.title}
                                  </p>
                                  <div className="flex items-center gap-2 text-[10px] text-text-muted mt-0.5">
                                    <span>{doc.chunkCount || 0} chunks</span>
                                  </div>
                                </div>
                              </div>
                              <span className="shrink-0 text-[11px] font-bold text-accent-ink opacity-80 group-hover:opacity-100 transition-opacity bg-accent-soft px-2.5 py-1 rounded border border-accent/40 flex items-center gap-1">
                                Gunakan ➔
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {errorMessage && (
                  <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertCircle size={14} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Additional Reference Sources (Optional Grounding) */}
                <div className="mt-6 w-full max-w-md text-left">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-semibold text-text-primary">
                      Sumber Referensi Tambahan (opsional)
                    </label>
                    <div className="flex items-center gap-2">
                      {selectedReferenceIds.size > 0 && (
                        <span className="text-[11px] font-medium text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded border border-accent/30">
                          {selectedReferenceIds.size} dipilih
                        </span>
                      )}
                      {referenceDocs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedReferenceIds.size === referenceDocs.length) {
                              setSelectedReferenceIds(new Set());
                            } else {
                              setSelectedReferenceIds(new Set(referenceDocs.map((d) => d.id)));
                            }
                          }}
                          className="text-[10px] text-text-muted hover:text-accent-ink hover:underline"
                        >
                          {selectedReferenceIds.size === referenceDocs.length ? "Batal Semua" : "Pilih Semua"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={loadReferenceDocs}
                        disabled={loadingReferenceDocs}
                        className="text-text-muted hover:text-text-primary p-0.5"
                        title="Muat ulang dokumen dari Drive"
                      >
                        <RefreshCw size={11} className={loadingReferenceDocs ? "animate-spin" : ""} />
                      </button>
                    </div>
                  </div>
                  <p className="mb-2 text-[11px] text-text-muted leading-relaxed">
                    Pilih beberapa dokumen internal sebagai acuan jawaban grounding AI (gaya NotebookLM).
                  </p>

                  <div className="relative mb-2">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input
                      type="text"
                      value={referenceSearch}
                      onChange={(e) => setReferenceSearch(e.target.value)}
                      placeholder="Cari dokumen di Drive..."
                      className="w-full rounded-md border border-surface-border bg-surface pl-8 pr-7 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                    />
                    {referenceSearch && (
                      <button
                        type="button"
                        onClick={() => setReferenceSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <div className="max-h-44 overflow-y-auto rounded-md border border-surface-border bg-surface p-1.5 space-y-0.5">
                    {loadingReferenceDocs ? (
                      <div className="flex items-center justify-center p-4 text-xs text-text-muted gap-1.5">
                        <Loader2 size={13} className="animate-spin text-accent" /> Memuat dokumen...
                      </div>
                    ) : filteredReferenceDocs.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-text-muted text-center">
                        {referenceDocs.length === 0 ? "Drive belum tersinkron atau kosong." : "Tidak ada dokumen yang cocok."}
                      </p>
                    ) : (
                      filteredReferenceDocs.map((doc) => (
                        <label
                          key={doc.id}
                          className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${
                            selectedReferenceIds.has(doc.id) ? "bg-accent-soft/50 font-medium text-accent-ink" : "text-text-primary hover:bg-surface-raised"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <input
                              type="checkbox"
                              checked={selectedReferenceIds.has(doc.id)}
                              onChange={() => toggleReferenceDoc(doc.id)}
                              className="shrink-0 rounded border-surface-border text-accent focus:ring-accent"
                            />
                            <span className="truncate">{doc.title}</span>
                          </div>
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

      {/* STATE B: STRUCTURE CURATION & REVIEW VIEW */}
      {fileName && curatingStructure && (
        <div className="flex flex-1 flex-col overflow-y-auto bg-surface">
          {/* Curation Header Bar */}
          <div className="border-b border-surface-border bg-surface-raised px-6 py-4 shadow-subtle sticky top-0 z-20">
            <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink shadow-subtle">
                  <SlidersHorizontal size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-text-primary truncate max-w-md">
                      {fileName}
                    </h2>
                    <span className="rounded bg-accent-soft border border-accent/40 px-2 py-0.5 text-[11px] font-bold text-accent-ink">
                      {getDocType(docTypeId).label}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    Tahap 1: Review & Kustomisasi Struktur Sub-Bab Sebelum Drafting
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleReset}
                  className="border-surface-border text-xs hover:bg-surface"
                >
                  Ganti File
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={curationItems.length === 0 || isRecommendingStructure || isRevisingStructure}
                  onClick={handleApproveStructure}
                  className="bg-ink-900 text-white hover:bg-ink-800 text-xs font-semibold px-4 flex items-center gap-1.5 shadow-subtle"
                >
                  <Sparkles size={14} className="text-accent" />
                  Setujui Struktur & Mulai Drafting ({curationItems.length})
                </Button>
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-5xl p-6 space-y-6">
            {/* AI Summary Banner */}
            <div className="rounded-xl border border-accent/30 bg-gradient-to-r from-accent-soft/40 via-surface-raised to-surface-raised p-5 shadow-subtle">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-ink-900 font-bold">
                  <Sparkles size={16} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    Rekomendasi Struktur Proposal oleh Synapse AI
                    {isRecommendingStructure && (
                      <span className="inline-flex items-center gap-1 text-xs font-normal text-text-muted">
                        <Loader2 size={12} className="animate-spin text-accent-ink" /> Menganalisis dokumen...
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                    {structureSummary || "Synapse telah mengekstrak dan memetakan bab-bab kunci dari dokumen sumber (TOR/RKS/RFP) agar struktur proposal presales Anda komprehensif, terstruktur, dan patuh pada persyaratan tender."}
                  </p>
                </div>
              </div>
            </div>

            {/* AI Discussion & Revision Input */}
            <div className="rounded-xl border border-surface-border bg-surface-raised p-4 shadow-subtle">
              <label className="block text-xs font-bold text-text-primary mb-1">
                Diskusikan / Minta Revisi AI terhadap Susunan Sub-Bab
              </label>
              <p className="text-[11px] text-text-muted mb-2.5">
                Ingin menambah fokus khusus? Berikan instruksi seperti: <span className="italic text-text-secondary">&ldquo;Tambahkan bab Disaster Recovery multi-cloud dan pisahkan SLA ke bab mandiri&rdquo;</span>
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={structureInstruction}
                  onChange={(e) => setStructureInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleRefineStructure();
                    }
                  }}
                  placeholder="Ketik instruksi revisi struktur di sini..."
                  disabled={isRevisingStructure || isRecommendingStructure}
                  className="flex-1 rounded-lg border border-surface-border bg-surface px-3.5 py-2 text-xs text-text-primary outline-none focus:border-accent transition-colors disabled:opacity-60"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!structureInstruction.trim() || isRevisingStructure || isRecommendingStructure}
                  onClick={handleRefineStructure}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-medium border-surface-border hover:border-accent"
                >
                  {isRevisingStructure ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  <span>{isRevisingStructure ? "Menganalisis..." : "Sesuaikan AI"}</span>
                </Button>
              </div>
            </div>

            {/* Recommended Sub-Bab Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-text-primary">
                    Susunan Sub-Bab yang Diusulkan ({curationItems.length})
                  </h3>
                  <p className="text-xs text-text-muted">
                    Atur urutan (▲/▼), edit cakupan, atau hapus bagian sebelum draf jawaban di-generate.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAddCurationSection}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent transition-colors shadow-subtle"
                >
                  <Plus size={13} />
                  <span>Tambah Sub-Bab Manual</span>
                </button>
              </div>

              {isRecommendingStructure ? (
                <div className="animate-in fade-in duration-200 space-y-4">
                  <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-surface-border bg-surface-raised text-center space-y-2">
                    <Loader2 size={28} className="animate-spin text-accent-ink" />
                    <p className="text-sm font-semibold text-text-primary">Merumuskan Rekomendasi Sub-Bab dari Dokumen Sumber...</p>
                    <p className="text-xs text-text-muted max-w-sm">
                      Menganalisis kebutuhan teknis, SLA, arsitektur, dan kepatuhan dalam TOR Anda.
                    </p>
                  </div>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      style={{ animationDelay: `${i * 80}ms` }}
                      className="animate-in fade-in duration-300 fill-mode-both rounded-xl border border-surface-border bg-surface-raised p-4 space-y-2"
                    >
                      <div className="h-3 w-1/3 rounded bg-surface-border/60 animate-pulse" />
                      <div className="h-2.5 w-2/3 rounded bg-surface-border/40 animate-pulse" />
                      <div className="h-2 w-full rounded bg-surface-border/40 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : curationItems.length === 0 ? (
                <div className="rounded-xl border border-surface-border bg-surface-raised p-8 text-center text-xs text-text-muted">
                  Belum ada sub-bab yang ditentukan. Klik &ldquo;Tambah Sub-Bab Manual&rdquo; untuk memulai.
                </div>
              ) : (
                <div className="space-y-3">
                  {curationItems.map((item, idx) => (
                    <div
                      key={item.id}
                      style={{ animationDelay: `${Math.min(idx, 8) * 60}ms` }}
                      className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 rounded-xl border border-surface-border bg-surface-raised p-4 shadow-subtle transition-all hover:border-surface-border/80"
                    >
                      <div className="flex items-start gap-3">
                        {/* Reorder Controls & Index */}
                        <div className="flex flex-col items-center justify-center shrink-0 rounded-lg bg-surface border border-surface-border p-1.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveCurationItem(idx, "up")}
                            className="rounded p-1 text-text-muted hover:bg-surface-raised hover:text-text-primary disabled:opacity-25 transition-colors"
                            title="Pindah ke atas"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <span className="text-xs font-mono font-bold text-text-primary my-0.5">
                            {idx + 1}
                          </span>
                          <button
                            type="button"
                            disabled={idx === curationItems.length - 1}
                            onClick={() => moveCurationItem(idx, "down")}
                            className="rounded p-1 text-text-muted hover:bg-surface-raised hover:text-text-primary disabled:opacity-25 transition-colors"
                            title="Pindah ke bawah"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-text-primary">
                              {item.title}
                            </h4>
                            <span className="rounded bg-surface border border-surface-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                              {item.category}
                            </span>
                          </div>

                          {/* Rationale Box */}
                          {item.rationale && (
                            <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-accent-soft/50 border border-accent/25 p-2.5 text-xs text-accent-ink">
                              <Sparkles size={14} className="shrink-0 mt-0.5 text-accent-ink" />
                              <div className="leading-relaxed">
                                <span className="font-bold">Alasan Rekomendasi: </span>
                                <span>{item.rationale}</span>
                              </div>
                            </div>
                          )}

                          {/* Requirement text */}
                          <div className="mt-2 text-xs text-text-muted leading-relaxed">
                            <span className="font-semibold text-text-secondary">Cakupan Kebutuhan: </span>
                            {item.requirement_text}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditCurationSection(item)}
                            className="rounded-md border border-surface-border p-1.5 text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
                            title="Edit info sub-bab"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCurationSection(item.id)}
                            className="rounded-md border border-surface-border p-1.5 text-text-muted hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                            title="Hapus sub-bab"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Approval Card */}
            <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-panel flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-text-primary">
                  Sudah puas dengan susunan {curationItems.length} sub-bab ini?
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  AI akan langsung mulai menyusun draf jawaban per sub-bab berdasarkan dokumen acuan TOR dan knowledge base internal.
                </p>
              </div>
              <Button
                variant="primary"
                size="lg"
                disabled={curationItems.length === 0 || isRecommendingStructure || isRevisingStructure}
                onClick={handleApproveStructure}
                className="bg-ink-900 text-white hover:bg-ink-800 text-xs font-bold px-6 py-2.5 flex items-center gap-2 shadow-subtle w-full sm:w-auto justify-center"
              >
                <Sparkles size={16} className="text-accent" />
                Setujui & Mulai Drafting Otomatis
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STATE C: CHECKLIST WORKSPACE */}
      {fileName && !curatingStructure && (
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

          {/* Real-time Drafting Progress Banner */}
          {isDraftingAll && draftingProgress && (
            <div className="border-b border-accent/40 bg-accent-soft px-6 py-2.5 shadow-subtle animate-in fade-in duration-200">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between text-xs">
                <div className="flex items-center gap-2 text-accent-ink font-semibold">
                  <Loader2 size={14} className="animate-spin text-accent-ink" />
                  <span>
                    Menyusun Draf AI: Sub-Bab {draftingProgress.current} dari {draftingProgress.total} —{" "}
                    <span className="font-bold underline decoration-accent-ink/40">{draftingProgress.title}</span>
                  </span>
                </div>
                <span className="text-[11px] font-mono text-accent-ink">
                  {Math.round((draftingProgress.current / draftingProgress.total) * 100)}% Selesai
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface border border-accent/20">
                <div
                  className="h-full bg-accent-ink transition-all duration-300 ease-out"
                  style={{ width: `${Math.round((draftingProgress.current / draftingProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

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
                <div
                  onClick={() => setIsQualityModalOpen(true)}
                  className="border-b border-surface-border bg-surface px-3 py-3 cursor-pointer hover:bg-surface/80 transition-colors"
                  title="Klik untuk membuka laporan audit kepatuhan presales lengkap"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-text-primary flex items-center gap-1.5">
                        <ShieldCheck size={13} className="text-accent-ink" />
                        Quality Check Auditor
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {qualityReport.items_with_issues} dari {qualityReport.total_items} bagian perlu review · Klik untuk audit
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${qualityReport.overall_score >= 80 ? "bg-emerald-50 text-emerald-700" : qualityReport.overall_score >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                      {qualityReport.overall_score}/100
                    </span>
                  </div>
                  {qualityReport.results.filter((result) => result.issues.length > 0).slice(0, 2).map((result) => (
                    <button
                      key={result.item_id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItemId(result.item_id);
                      }}
                      className="mt-2 block w-full text-left text-[11px] text-amber-800 hover:text-text-primary truncate"
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
                            <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const realIdx = items.findIndex((it) => it.id === item.id);
                                  if (realIdx > 0) moveWorkspaceItem(realIdx, "up");
                                }}
                                className="rounded p-0.5 text-text-muted hover:bg-surface hover:text-text-primary disabled:opacity-20"
                                title="Pindah ke atas"
                              >
                                <ArrowUp size={11} />
                              </button>
                              <button
                                type="button"
                                disabled={idx === filteredItems.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const realIdx = items.findIndex((it) => it.id === item.id);
                                  if (realIdx >= 0 && realIdx < items.length - 1) moveWorkspaceItem(realIdx, "down");
                                }}
                                className="rounded p-0.5 text-text-muted hover:bg-surface hover:text-text-primary disabled:opacity-20"
                                title="Pindah ke bawah"
                              >
                                <ArrowDown size={11} />
                              </button>
                              <button
                                type="button"
                                disabled={item.isGenerating}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateItemDraft(item.id);
                                }}
                                className="rounded p-0.5 text-text-muted hover:bg-surface hover:text-accent-ink disabled:opacity-40"
                                title="Regenerate Bagian Ini"
                              >
                                <RefreshCw size={11} className={item.isGenerating ? "animate-spin" : ""} />
                              </button>
                            </div>
                            <span className="text-[11px] font-mono font-medium text-text-muted">
                              #{idx + 1}
                            </span>
                            <span className="rounded bg-surface border border-surface-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                              {item.category}
                            </span>
                            {item.image_data_url && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 text-[9.5px] font-medium text-blue-700">
                                🖼️ Aset
                              </span>
                            )}
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
                        {item.isGenerating ? (
                          <div className="animate-in fade-in duration-200 mt-2 flex items-center gap-1.5 text-[11px] font-medium text-accent-ink">
                            <Loader2 size={12} className="animate-spin" />
                            <span>Menyusun draf AI...</span>
                          </div>
                        ) : (
                          (() => {
                            const badge = getGroundingBadge(item);
                            return badge ? (
                              <div
                                key={item.sources?.length ?? 0}
                                className="animate-in fade-in duration-300 mt-2"
                              >
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClassName}`} />
                                  {badge.label}
                                </span>
                              </div>
                            ) : null;
                          })()
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
                        {(() => {
                          const badge = getGroundingBadge(selectedItem);
                          return badge ? (
                            <span
                              key={selectedItem.sources?.length ?? 0}
                              className={`animate-in fade-in duration-300 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}
                              title={`${selectedItem.sources?.length ?? 0} sumber referensi dipakai saat generate`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClassName}`} />
                              {badge.label}
                            </span>
                          ) : null;
                        })()}
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
                        className={`w-full rounded-lg border p-4 text-xs leading-relaxed text-text-primary outline-none focus:border-accent font-sans transition-colors duration-700 resize-y ${
                          justGeneratedId === selectedItem.id
                            ? "border-accent bg-accent-soft/30"
                            : "border-surface-border bg-surface"
                        }`}
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

                  {/* Poin 1: Inline Visual Preview & Action Card */}
                  {selectedItem.image_data_url ? (
                    <div className="rounded-xl border border-blue-200/80 bg-gradient-to-r from-blue-50/40 via-white to-indigo-50/30 p-4 shadow-subtle">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                        {/* Thumbnail with click-to-zoom */}
                        <div
                          onClick={() =>
                            setPreviewImageModal({
                              url: selectedItem.image_data_url!,
                              caption:
                                selectedItem.image_caption ||
                                `Aset Visual: ${selectedItem.title}`,
                            })
                          }
                          className="relative group w-36 h-24 bg-slate-900 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer border border-slate-200 shadow-sm"
                          title="Klik untuk pratinjau ukuran penuh"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={selectedItem.image_data_url}
                            alt={selectedItem.image_caption || "Visual Asset"}
                            className="w-full h-full object-contain p-1 transition-transform duration-200 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-medium gap-1">
                            <Maximize2 size={13} />
                            <span>Perbesar</span>
                          </div>
                          <span className="absolute bottom-1 right-1 bg-black/75 text-[9px] font-mono text-white px-1.5 py-0.5 rounded">
                            Word & PPTX
                          </span>
                        </div>

                        {/* Detail, Caption Input, & Quick Action Bar */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-800">
                                Aset Visual Terlampir
                              </span>
                              <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[9.5px] font-semibold border border-emerald-200">
                                ✓ Siap Ekspor ke Word & PPTX
                              </span>
                            </div>

                            {/* Quick Action Buttons */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenStudio("search")}
                                className="rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1 shadow-2xs"
                                title="Ganti foto dengan pencarian perangkat publik"
                              >
                                <RefreshCw size={11} />
                                <span>Ganti Foto</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenStudio("hld")}
                                className="rounded-md px-2.5 py-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors flex items-center gap-1 shadow-2xs"
                                title="Buat atau edit topologi arsitektur di HLD Studio"
                              >
                                <Layers size={11} />
                                <span>Edit HLD</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewImageModal({
                                    url: selectedItem.image_data_url!,
                                    caption:
                                      selectedItem.image_caption ||
                                      `Aset Visual: ${selectedItem.title}`,
                                  })
                                }
                                className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1 shadow-2xs"
                                title="Lihat ukuran penuh"
                              >
                                <Maximize2 size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = {
                                    ...selectedItem,
                                    image_data_url: undefined,
                                    image_caption: undefined,
                                  };
                                  setItems((prev) =>
                                    prev.map((it) =>
                                      it.id === updated.id ? updated : it
                                    )
                                  );
                                }}
                                className="rounded-md p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                                title="Hapus aset visual dari bab ini"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Editable caption */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
                              Keterangan Gambar (Caption di Word & PowerPoint):
                            </label>
                            <input
                              type="text"
                              value={selectedItem.image_caption || ""}
                              onChange={(e) => {
                                const newCap = e.target.value;
                                const updated = {
                                  ...selectedItem,
                                  image_caption: newCap,
                                };
                                setItems((prev) =>
                                  prev.map((it) =>
                                    it.id === updated.id ? updated : it
                                  )
                                );
                              }}
                              placeholder="Mis: Gambar 2.1: Server HPE ProLiant DL360 Gen10 High Density Rackmount"
                              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none shadow-2xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Banner when no image is attached */
                    <div className="rounded-xl border border-dashed border-slate-300 bg-gradient-to-r from-slate-50 to-indigo-50/20 p-4 transition-colors hover:border-slate-400">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs">
                            <ImageIcon size={16} />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              Lampirkan Visual Perangkat / Topologi HLD
                              <span className="text-[10px] text-slate-500 font-normal">
                                (Opsional)
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 line-clamp-1">
                              Perkuat proposal teknis dengan foto perangkat enterprise atau diagram arsitektur AI otomatis.
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenStudio("search")}
                            className="rounded-lg bg-white border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs flex items-center gap-1.5"
                          >
                            <Search size={12} className="text-slate-500" />
                            <span>Cari Foto Publik</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenStudio("hld")}
                            className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors shadow-2xs flex items-center gap-1.5"
                          >
                            <Sparkles size={12} className="text-indigo-600" />
                            <span>Buat Topologi HLD</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenStudio("upload")}
                            className="rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
                            title="Upload gambar dari komputer"
                          >
                            <UploadCloud size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Visual Asset Studio (Expandable Drawer / Studio) */}
                  <div ref={visualStudioRef}>
                    {isVisualStudioOpen ? (
                      <VisualAssetStudio
                        item={selectedItem}
                        torText={torText}
                        initialTab={visualStudioTab}
                        onClose={() => setIsVisualStudioOpen(false)}
                        onUpdateItem={(updated) => {
                          setItems((prev) =>
                            prev.map((it) =>
                              it.id === updated.id ? updated : it
                            )
                          );
                        }}
                      />
                    ) : (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleOpenStudio("search")}
                          className="text-xs text-text-secondary hover:text-text-primary hover:underline flex items-center gap-1 font-medium"
                        >
                          <span>Buka Panel Studio Visual Lengkap</span>
                          <ChevronRight size={13} />
                        </button>
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

              {sectionModalContext === "curation" && (
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Alasan / Rationale AI (Opsional)
                  </label>
                  <input
                    type="text"
                    value={sectionFormRationale}
                    onChange={(e) => setSectionFormRationale(e.target.value)}
                    placeholder="Alasan mengapa sub-bab ini relevan dengan dokumen acuan..."
                    className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
                  />
                </div>
              )}

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

      {/* Presales Compliance & Quality Check Audit Modal */}
      {isQualityModalOpen && qualityReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex w-full max-w-2xl max-h-[85vh] flex-col rounded-xl border border-surface-border bg-surface-raised shadow-panel overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">
                    Presales Compliance & Quality Auditor
                  </h3>
                  <p className="text-xs text-text-muted">
                    Audit ketajaman jawaban proposal, parameter SLA, dan mitigasi komitmen berisiko
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQualityModalOpen(false)}
                className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Score card */}
              <div className="rounded-xl border border-surface-border bg-surface p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    Skor Kepatuhan Proposal
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {qualityReport.items_with_issues === 0
                      ? "Seluruh sub-bab telah memenuhi standar ketajaman presales."
                      : `${qualityReport.items_with_issues} dari ${qualityReport.total_items} sub-bab memiliki catatan kepatuhan atau komitmen ambigu.`}
                  </p>
                </div>
                <div className={`rounded-xl px-4 py-2 text-center font-bold ${
                  qualityReport.overall_score >= 80
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : qualityReport.overall_score >= 50
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                  <div className="text-2xl font-mono leading-none">{qualityReport.overall_score}</div>
                  <div className="text-[10px] uppercase tracking-wider mt-0.5">/ 100</div>
                </div>
              </div>

              {/* Items Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                  Rincian Per Sub-Bab
                </h4>

                {qualityReport.results.map((res) => (
                  <div
                    key={res.item_id}
                    className="rounded-xl border border-surface-border bg-surface p-4 space-y-2.5 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text-primary">{res.title}</span>
                        <span className="rounded bg-surface-raised border border-surface-border px-1.5 py-0.5 text-[10px] text-text-muted">
                          {res.category || items.find((it) => it.id === res.item_id)?.category || "Teknis"}
                        </span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        res.score >= 80
                          ? "bg-emerald-50 text-emerald-700"
                          : res.score >= 50
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-700"
                      }`}>
                        Skor: {res.score}
                      </span>
                    </div>

                    {/* Issues detected */}
                    {res.issues.length > 0 ? (
                      <div className="space-y-1">
                        {res.issues.map((issue, iIdx) => (
                          <div
                            key={iIdx}
                            className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50/70 border border-amber-200/60 rounded px-2.5 py-1.5"
                          >
                            <AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-600" />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50/60 border border-emerald-200/50 rounded px-2.5 py-1.5">
                        <CheckCircle2 size={13} />
                        <span>Jawaban telah spesifik dan memenuhi standar presales.</span>
                      </div>
                    )}

                    {/* Presales Suggestions */}
                    {res.suggestions && res.suggestions.length > 0 && (
                      <div className="rounded-lg bg-accent-soft/40 border border-accent/25 p-3 text-xs text-text-primary space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5 text-accent-ink text-[11px] uppercase tracking-wider">
                          <Sparkles size={13} /> Rekomendasi Presales:
                        </div>
                        <ul className="list-disc list-inside space-y-1 pl-1 text-xs text-text-secondary">
                          {res.suggestions.map((sug: string, sIdx: number) => (
                            <li key={sIdx}>{sug}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedItemId(res.item_id);
                          setIsQualityModalOpen(false);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline"
                      >
                        <span>Edit Bagian Ini di Workspace</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-surface-border px-6 py-3 bg-surface flex items-center justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsQualityModalOpen(false)}
                className="bg-ink-900 text-white hover:bg-ink-800 text-xs"
              >
                Tutup Auditor
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Tour Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />

      {/* Full-resolution Image Lightbox Modal */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setPreviewImageModal(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[90vh] bg-slate-900 rounded-xl overflow-hidden shadow-2xl flex flex-col border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800 text-white">
              <div className="flex items-center gap-2 truncate pr-4">
                <span className="text-xs font-semibold truncate">
                  {previewImageModal.caption || "Pratinjau Visual Perangkat / Topologi"}
                </span>
                <span className="text-[10px] bg-blue-900/60 text-blue-300 px-1.5 py-0.5 rounded border border-blue-700 font-mono">
                  Word & PPTX Preview
                </span>
              </div>
              <button
                onClick={() => setPreviewImageModal(null)}
                className="text-slate-400 hover:text-white rounded-md p-1 hover:bg-slate-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-slate-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImageModal.url}
                alt={previewImageModal.caption}
                className="max-h-[75vh] w-auto max-w-full object-contain rounded shadow-lg"
              />
            </div>
            <div className="px-4 py-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="text-[11px] truncate max-w-lg">
                {previewImageModal.caption}
              </span>
              <a
                href={previewImageModal.url}
                download="visual-asset.png"
                className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 font-medium"
              >
                Download Gambar Asli
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
