"use client";

import { useState, useRef, useMemo, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
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
  Flag,
  ChevronDown,
  BarChart3,
  Ruler,
  Target,
  Eye,
  Boxes,
  Zap,
  History,
} from "lucide-react";
import {
  uploadTor,
  generateItemDraft,
  streamItemDraft,
  qualityCheckDraft,
  recommendStructure,
  getProposalSession,
  saveProposalSession,
  listDocuments,
  getDocumentChunks,
  scanCriticalClauses,
  checkRequirementCoverage,
  calculateSizing,
  type QualityCheckResult,
  type RecommendedSection,
  type RecommendStructureResponse,
  type CriticalClausesScanResponse,
  type RequirementCoverageResponse,
  type SizingCalculationRequest,
  type SizingCalculationResult,
} from "@/lib/api";
import { useDraftStore } from "@/lib/stores/use-draft-store";

const ARCHETYPE_OPTIONS: { id: string; label: string }[] = [
  { id: "managed_services", label: "Managed Services" },
  { id: "hardware_infra", label: "Hardware / Infra" },
  { id: "software_dev", label: "Software Dev" },
];

function archetypeLabel(id: string): string {
  return ARCHETYPE_OPTIONS.find((a) => a.id === id)?.label || id;
}
import { OnboardingModal } from "@/components/onboarding-modal";
import type { RequirementItem, RequirementStatus, SourceCitation, IndexedDocument } from "@/lib/types";
import { DOC_TYPES, FORMAT_LABELS, getDocType, type DraftDocTypeId, type DraftFormat } from "@/lib/document-types";
import { SKELETONS, getSkeletonForDoc } from "@/lib/skeletons";
import { VisualAssetStudio } from "@/components/draft/visual-asset-studio";
import { cleanLatexMath, cleanDraftMarkdown } from "@/lib/utils";
import { WordIcon, PowerPointIcon, PdfIcon } from "@/components/office-icons";

// Poin 4: Grounding cuplikan TOR kini diproses secara semantik oleh backend
// menggunakan model sentence-transformers lokal. Frontend meneruskan konteks TOR
// hingga 35.000 karakter agar seluruh bab dan paragraf dapat diranking secara akurat.
function pickRelevantTorExcerpt(torText: string, _sectionTitle?: string, maxLen = 35000): string {
  if (!torText) return "";
  return torText.slice(0, maxLen);
}

// Section titles carry their own hierarchical numbering ("1.1 Kondisi Existing" /
// "3.2.1 Dasar Perhitungan") per the canonical structure convention — split it out
// so the sidebar can render the number and title as distinct, less cluttered elements.
function splitHierarchicalTitle(title: string): { number: string; text: string } {
  const m = title.match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/);
  return m ? { number: m[1], text: m[2] } : { number: "", text: title };
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

// Shared base for every small meta chip/pill (item header, sidebar rows, intel
// strip) — one fixed height + radius + text size so a row of mixed badges and
// buttons never zig-zags regardless of icon/label length.
const CHIP_BASE =
  "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium leading-none";
// Denser variant for the sidebar's narrow rows — same shape/radius language, smaller footprint.
const CHIP_SM =
  "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[10px] font-medium leading-none";


// Draft text is plain-ish markdown (bold, lists, BoQ tables from the Sizing
// calculator) — style it with the app's own tokens instead of pulling in the
// Tailwind typography plugin just for a preview toggle.
const markdownPreviewComponents: Components = {
  h1: ({ children }) => <h1 className="mb-3 mt-1 text-sm font-bold text-text-primary">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-1 text-sm font-bold text-text-primary">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-1 text-xs font-bold text-text-primary">{children}</h3>,
  // Justified, generously-leaded body text with real paragraph breathing room —
  // this is what makes AI drafts/answers read like a real document, not a wall of text.
  p: ({ children }) => <p className="mb-4 text-justify text-xs leading-relaxed text-text-primary">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
  em: ({ children }) => <em className="italic text-text-primary font-medium">{children}</em>,
  ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-5 text-xs leading-relaxed text-text-primary">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-text-primary">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent-ink underline">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-[11px] text-text-primary">{children}</code>
  ),
  // Zebra-striped, generously-padded table — markdown pipes/dashes never show through.
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto rounded-lg border border-surface-border shadow-subtle">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-raised">{children}</thead>,
  tbody: ({ children }) => <tbody className="[&>tr:nth-child(even)]:bg-surface-raised/50">{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-surface-border last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="border-r border-surface-border px-3.5 py-2.5 text-left font-semibold text-text-primary last:border-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-r border-surface-border px-3.5 py-2.5 text-text-secondary last:border-0">{children}</td>
  ),
};

const WIN_THEME_PRESETS = [
  "TCO Hemat",
  "High Availability",
  "Engineer Tersertifikasi Lokal",
  "Track Record Perbankan",
];

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
  const items = useDraftStore((s) => s.items);
  const selectedItemId = useDraftStore((s) => s.selectedItemId);
  const setItems = useDraftStore((s) => s.setItems);
  const selectItem = useDraftStore((s) => s.selectItem);
  const updateItem = useDraftStore((s) => s.updateItem);
  const removeItem = useDraftStore((s) => s.removeItem);
  const reorderItems = useDraftStore((s) => s.reorderItems);
  const revisions = useDraftStore((s) => s.revisions);
  const saveRevision = useDraftStore((s) => s.saveRevision);
  const restoreRevision = useDraftStore((s) => s.restoreRevision);
  const resetSession = useDraftStore((s) => s.resetSession);
  const [isRevisionMenuOpen, setIsRevisionMenuOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "review" | RequirementStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isDraftingAll, setIsDraftingAll] = useState(false);

  // Global ESC key listener to dismiss modals & popups (Poin 2)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewingSection(null);
        setPreviewImageModal(null);
        setIsRevisionMenuOpen(false);
        setIsExportOpen(false);
        setIsSizingOpen(false);
        setIsSectionModalOpen(false);
        setIsCoverageModalOpen(false);
        setIsVisualStudioOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingLibraryDocs, setPendingLibraryDocs] = useState<IndexedDocument[]>([]);
  const autoSavedSignature = useRef<string | null>(null);

  // Red-flag / critical clause scanner (runs once, right after TOR extraction)
  const [criticalClauses, setCriticalClauses] = useState<CriticalClausesScanResponse | null>(null);
  const [scanningClauses, setScanningClauses] = useState(false);
  const [clausesCardOpen, setClausesCardOpen] = useState(true);

  // Win themes injected into every draft generation call
  const [selectedWinThemes, setSelectedWinThemes] = useState<Set<string>>(new Set());
  const [customWinThemeInput, setCustomWinThemeInput] = useState("");

  // Requirement coverage / gap audit
  const [coverageReport, setCoverageReport] = useState<RequirementCoverageResponse | null>(null);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  const [isCoverageModalOpen, setIsCoverageModalOpen] = useState(false);

  // Compact workspace intel strip (red-flag risk / coverage / win themes) — which panel is expanded
  const [intelPanelOpen, setIntelPanelOpen] = useState<"clauses" | "coverage" | "winthemes" | null>(null);

  // Editor panel: requirement box collapsed by default. Rendered rich view is the
  // default read mode — raw markdown/textarea editing is the opt-in via toggle.
  const [requirementExpanded, setRequirementExpanded] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(true);

  // Infrastructure Sizing & BoQ Calculator — rarely used, kept behind the "more actions"
  // menu so it never competes with the main drafting workflow for attention.
  const [isSizingOpen, setIsSizingOpen] = useState(false);
  const [sizingPlatform, setSizingPlatform] = useState<SizingCalculationRequest["platform"]>("pure_storage");
  const [sizingCapacityTb, setSizingCapacityTb] = useState("");
  const [sizingWorkload, setSizingWorkload] = useState<NonNullable<SizingCalculationRequest["target_workload"]>>(
    "general_virtualization"
  );
  const [sizingResult, setSizingResult] = useState<SizingCalculationResult | null>(null);
  const [calculatingSizing, setCalculatingSizing] = useState(false);

  // Draft textarea: local state + 200ms debounce so fast typing doesn't push a
  // setItems (and re-render the whole 20+ item sidebar) on every keystroke.
  const [localDraftText, setLocalDraftText] = useState("");
  const draftDebounceRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; itemId: string | null; text: string }>({
    timer: null,
    itemId: null,
    text: "",
  });

  // Structure Curation & Discussion Gate
  const [curatingStructure, setCuratingStructure] = useState(false);
  const [isRecommendingStructure, setIsRecommendingStructure] = useState(false);
  const [structureSummary, setStructureSummary] = useState<string>("");
  const [curationItems, setCurationItems] = useState<RequirementItem[]>([]);
  const [structureInstruction, setStructureInstruction] = useState("");
  const [isRevisingStructure, setIsRevisingStructure] = useState(false);
  const [curationTargetEditId, setCurationTargetEditId] = useState<string | null>(null);
  const [detectedArchetype, setDetectedArchetype] = useState<string>("");
  const [referenceAccordionOpen, setReferenceAccordionOpen] = useState(false);
  const [customOutlineText, setCustomOutlineText] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [structureDiff, setStructureDiff] = useState<{
    instruction: string;
    added: string[];
    removed: string[];
    totalNow: number;
    summary: string;
  } | null>(null);
  const [previewingSection, setPreviewingSection] = useState<RequirementItem | null>(null);
  const [modalRevisionPrompt, setModalRevisionPrompt] = useState("");
  const [inlineEditorOpen, setInlineEditorOpen] = useState(false);

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
  const [previewModalScale, setPreviewModalScale] = useState<number>(1);
  const visualStudioRef = useRef<HTMLDivElement>(null);
  const hiddenSubBabFileInputRef = useRef<HTMLInputElement>(null);

  const handleSubBabDirectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedItem) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const cleanCap = (selectedItem.image_caption || selectedItem.title || "Visual Lampiran")
        .replace(/^(?:Gambar|Figure)\s*\d+(?:\.\d+)*\s*[:.-]?\s*/i, "")
        .trim();
      const updated = {
        ...selectedItem,
        image_data_url: dataUrl,
        image_caption: cleanCap,
      };
      updateItem(updated.id, updated);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

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
      selectItem(saved.items[0]?.id ?? null);
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

  const toggleWinTheme = (theme: string) => {
    setSelectedWinThemes((prev) => {
      const next = new Set(prev);
      if (next.has(theme)) next.delete(theme);
      else next.add(theme);
      return next;
    });
  };

  const addCustomWinTheme = () => {
    const value = customWinThemeInput.trim();
    if (!value) return;
    setSelectedWinThemes((prev) => new Set(prev).add(value));
    setCustomWinThemeInput("");
  };

  const removeWinTheme = (theme: string) => {
    setSelectedWinThemes((prev) => {
      const next = new Set(prev);
      next.delete(theme);
      return next;
    });
  };

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
      selectItem(briefItem.id);
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
        selectItem(saved.items[0]?.id ?? null);
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

  // Keep the textarea's local copy in sync when switching sub-bab or when a draft
  // arrives from generation — flushing any pending debounced edit first so fast
  // switching never silently drops the last few keystrokes.
  useEffect(() => {
    const pending = draftDebounceRef.current;
    if (pending.timer) {
      clearTimeout(pending.timer);
      if (pending.itemId) handleTextChange(pending.itemId, pending.text);
      pending.timer = null;
      pending.itemId = null;
    }
    setLocalDraftText(cleanLatexMath(selectedItem?.draft_text ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id, selectedItem?.draft_text]);

  useEffect(() => {
    setIsRevisionMenuOpen(false);
  }, [selectedItem?.id]);

  // Collapse the requirement box and drop out of markdown preview each time the
  // user switches to a different sub-bab.
  useEffect(() => {
    setRequirementExpanded(false);
    setShowMarkdownPreview(true);
  }, [selectedItem?.id]);

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

  // Alt+Up / Alt+Down — jump between sub-bab without reaching for the mouse.
  useEffect(() => {
    if (!fileName || curatingStructure || filteredItems.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      e.preventDefault();
      const currentIndex = filteredItems.findIndex((it) => it.id === selectedItemId);
      const step = e.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (currentIndex + step + filteredItems.length) % filteredItems.length;
      selectItem(filteredItems[nextIndex].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fileName, curatingStructure, filteredItems, selectedItemId]);

  const startDraftingBatch = async (targetItems: RequirementItem[], textContext: string) => {
    setIsDraftingAll(true);
    setDraftingProgress({ current: 0, total: targetItems.length, title: targetItems[0]?.title || "" });
    // Process in batches of 3 for 3x faster parallel drafting
    for (let index = 0; index < targetItems.length; index += 3) {
      const batch = targetItems.slice(index, index + 3);
      setDraftingProgress({
        current: Math.min(index + 1, targetItems.length),
        total: targetItems.length,
        title: batch.map((b) => b.title).join(", "),
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
              Array.from(selectedWinThemes)
            );
            return { itemId: item.id, result };
          } catch {
            return { itemId: item.id, result: null };
          }
        }),
      );
      useDraftStore.setState((state) => ({
        items: state.items.map((item) => {
          const generatedItem = generated.find((entry) => entry.itemId === item.id);
          if (!generatedItem?.result) return item;
          const cleanedText = cleanLatexMath(generatedItem.result.draft_text || "");
          return {
            ...item,
            draft_text: cleanedText,
            status: "draft",
            sources: generatedItem.result.sources,
            image_data_url: generatedItem.result.image_data_url || item.image_data_url,
            image_caption: generatedItem.result.image_caption || item.image_caption,
          };
        }),
      }));
    }
    setDraftingProgress(null);
    setIsDraftingAll(false);
  };

  const runClauseScan = async (text: string) => {
    setScanningClauses(true);
    setCriticalClauses(null);
    try {
      const result = await scanCriticalClauses(text);
      setCriticalClauses(result);
      setClausesCardOpen(result.risk_level !== "Low");
    } catch (err) {
      console.warn("scanCriticalClauses failed:", err);
    } finally {
      setScanningClauses(false);
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 4500);
  };

  const processSourceText = async (extractedText: string, title: string) => {
    setTorText(extractedText);
    setFileName(title);
    setUploading(false);

    // Transition into Structure Curation View
    setCuratingStructure(true);
    setIsRecommendingStructure(true);
    runClauseScan(extractedText); // fire-and-forget, runs alongside structure recommendation
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
        source_clause: sec.source_clause,
        draft_text: "",
        status: "todo",
      }));
      setCurationItems(recItems);
      setStructureSummary(resp.summary);
      setDetectedArchetype(resp.archetype || "");
      showToast("Synapse telah menganalisis dokumen & mempelajari pola operasional baru ke memori permanen.");
    } catch (err) {
      console.warn("recommendStructure fallback:", err);
      const skeleton = getSkeletonForDoc(docTypeId, extractedText);
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

  // Step 1: user picks library docs or files — processing occurs upon Step 3 CTA
  const handlePickLibrarySource = (doc: IndexedDocument) => {
    setPendingLibraryDocs((prev) => {
      const exists = prev.some((d) => d.id === doc.id);
      if (exists) {
        return prev.filter((d) => d.id !== doc.id);
      } else {
        return [...prev, doc];
      }
    });
    setPendingFiles([]);
    setErrorMessage(null);
  };

  const handleStartDrafting = async () => {
    if (pendingFiles.length > 0) {
      setUploading(true);
      setErrorMessage(null);
      try {
        const textParts: string[] = [];
        for (let i = 0; i < pendingFiles.length; i++) {
          const file = pendingFiles[i];
          const extractedText = await uploadTor(file);
          textParts.push(`=== DOKUMEN: ${file.name} ===\n${extractedText}`);
        }
        const combinedText = textParts.join("\n\n");
        const docNames = pendingFiles.map((f) => f.name).join(", ");
        await processSourceText(combinedText, docNames);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Gagal memproses dokumen. Pastikan API server aktif."
        );
        setUploading(false);
      }
    } else if (pendingLibraryDocs.length > 0) {
      setUploading(true);
      setErrorMessage(null);
      try {
        const textParts: string[] = [];
        for (let i = 0; i < pendingLibraryDocs.length; i++) {
          const doc = pendingLibraryDocs[i];
          const chunkRes = await getDocumentChunks(doc.id);
          const docText = (chunkRes.chunks || []).map((c) => c.content).join("\n\n");
          if (docText.trim()) {
            textParts.push(`=== DOKUMEN: ${doc.title} ===\n${docText}`);
          }
        }
        if (textParts.length === 0) {
          throw new Error("Dokumen terpilih di library tidak memiliki teks yang dapat diproses.");
        }
        const combinedText = textParts.join("\n\n");
        const docNames = pendingLibraryDocs.map((d) => d.title).join(", ");
        await processSourceText(combinedText, docNames);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Gagal memuat dokumen dari library Google Drive."
        );
        setUploading(false);
      }
    }
  };

  const handleRefineStructure = async () => {
    if (!structureInstruction.trim() || isRevisingStructure) return;
    setIsRevisingStructure(true);
    const prevItems = [...curationItems];
    const prevInstruction = structureInstruction.trim();
    try {
      const resp = await recommendStructure({
        tor_text: torText,
        doc_type: docTypeId,
        document_title: fileName || "Tender",
        instruction: prevInstruction,
      });
      applyStructureResponse(resp);

      const newTitles = new Set(resp.items.map((s: RecommendedSection) => s.title));
      const oldTitles = new Set(prevItems.map((s) => s.title));
      const added = resp.items.filter((s: RecommendedSection) => !oldTitles.has(s.title)).map((s: RecommendedSection) => s.title);
      const removed = prevItems.filter((s) => !newTitles.has(s.title)).map((s) => s.title);

      setStructureDiff({
        instruction: prevInstruction,
        added,
        removed,
        totalNow: resp.items.length,
        summary: resp.summary,
      });
      setStructureInstruction("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal merevisi struktur.");
    } finally {
      setIsRevisingStructure(false);
    }
  };

  const applyStructureResponse = (resp: RecommendStructureResponse) => {
    const recItems: RequirementItem[] = resp.items.map((sec: RecommendedSection) => ({
      id: sec.id,
      title: sec.title,
      requirement_text: sec.requirement_text,
      category: sec.category,
      rationale: sec.rationale,
      source_clause: sec.source_clause,
      draft_text: "",
      status: "todo",
    }));
    setCurationItems(recItems);
    setStructureSummary(resp.summary);
    setDetectedArchetype(resp.archetype || "");
  };

  const handleSwitchArchetype = async (archetype: string) => {
    if (isRecommendingStructure || isRevisingStructure) return;
    setIsRecommendingStructure(true);
    try {
      const resp = await recommendStructure({
        tor_text: torText,
        doc_type: docTypeId,
        document_title: fileName || "Tender",
        archetype,
      });
      applyStructureResponse(resp);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal mengganti tipe struktur.");
    } finally {
      setIsRecommendingStructure(false);
    }
  };

  const handleApplyReferenceStructure = async () => {
    if (!customOutlineText.trim() || isRecommendingStructure || isRevisingStructure) return;
    setIsRecommendingStructure(true);
    try {
      const resp = await recommendStructure({
        tor_text: torText,
        doc_type: docTypeId,
        document_title: fileName || "Tender",
        reference_structure: customOutlineText.trim(),
      });
      applyStructureResponse(resp);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal menerapkan pola acuan.");
    } finally {
      setIsRecommendingStructure(false);
    }
  };

  const handleApproveStructure = async () => {
    if (curationItems.length === 0) return;
    setItems(curationItems);
    selectItem(curationItems[0]?.id || null);
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
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    reorderItems(index, targetIndex);
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

  // Step 1: pick local files (supports multiple selection) — deferred to Step 3 CTA
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const incoming = Array.from(e.target.files);
      setPendingFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.name));
        const added = incoming.filter((f) => !existingNames.has(f.name));
        return [...prev, ...added];
      });
      setPendingLibraryDocs([]);
      setErrorMessage(null);
    }
    e.target.value = "";
  };

  // Reset document — 100% clean refresh without old leftovers
  const handleReset = () => {
    resetSession();
    setFileName(null);
    setTorText("");
    setItems([]);
    selectItem(null);
    setErrorMessage(null);
    setLastSaved(null);
    setSessionId(null);
    setSessionSaved(null);
    setCuratingStructure(false);
    setCurationItems([]);
    setStructureSummary("");
    setQualityReport(null);
    setPendingFiles([]);
    setPendingLibraryDocs([]);
    setCriticalClauses(null);
    setScanningClauses(false);
    setSelectedWinThemes(new Set());
    setCustomWinThemeInput("");
    setCoverageReport(null);
    setIntelPanelOpen(null);
    setIsSizingOpen(false);
    setSizingResult(null);
    setSizingCapacityTb("");
    setLocalDraftText("");
    setCustomPrompt("");
    setStructureDiff(null);
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_SESSION_ID_KEY);
      localStorage.removeItem("synapse-draft-storage");
      sessionStorage.removeItem("synapse-search-brief");
    } catch { /* ignore */ }
  };

  // Generate draft for a single item
  const handleGenerateItemDraft = async (itemId: string, instruction?: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    // Update item to loading state
    updateItem(itemId, { isGenerating: true });

    try {
      const result = await generateItemDraft(
        item.id,
        item.requirement_text,
        instruction,
        pickRelevantTorExcerpt(torText, item.title),
        Array.from(selectedReferenceIds),
        Array.from(selectedWinThemes)
      );

      useDraftStore.setState((state) => ({
        items: state.items.map((it) =>
          it.id === itemId
            ? {
                ...it,
                draft_text: result.draft_text,
                status: it.status === "final" ? "final" : "draft",
                sources: result.sources,
                image_data_url: result.image_data_url || it.image_data_url,
                image_caption: result.image_caption || it.image_caption,
                isGenerating: false,
              }
            : it
        ),
      }));
      if (instruction) setCustomPrompt("");
      setJustGeneratedId(itemId);
      setTimeout(() => setJustGeneratedId((cur) => (cur === itemId ? null : cur)), 900);
    } catch (err) {
      updateItem(itemId, {
        isGenerating: false,
        error: err instanceof Error ? err.message : "Gagal menyusun draf",
      });
    }
  };

  // Generate draft for a single item, streamed token-by-token (typewriter effect)
  const handleStreamGenerate = async (itemId: string, instruction?: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.isGenerating) return;

    if (item.draft_text.trim()) saveRevision(itemId, "Sebelum Regenerate");
    updateItem(itemId, { isGenerating: true, error: undefined });
    if (useDraftStore.getState().selectedItemId === itemId) setLocalDraftText("");

    let accumulated = "";
    let streamedSources: SourceCitation[] | undefined;
    let streamedSourceClause: string | null | undefined;

    try {
      for await (const evt of streamItemDraft({
        item_id: itemId,
        requirement_text: item.requirement_text,
        instruction,
        tor_context: pickRelevantTorExcerpt(torText, item.title),
        reference_doc_ids: Array.from(selectedReferenceIds),
        win_themes: Array.from(selectedWinThemes),
      })) {
        if (evt.type === "meta") {
          streamedSources = evt.sources;
          streamedSourceClause = evt.source_clause;
        } else if (evt.type === "token") {
          accumulated += evt.chunk;
          if (useDraftStore.getState().selectedItemId === itemId) {
            setLocalDraftText(cleanLatexMath(accumulated));
          }
        } else if (evt.type === "error") {
          throw new Error(evt.error);
        }
      }

      useDraftStore.setState((state) => ({
        items: state.items.map((it) =>
          it.id === itemId
            ? {
                ...it,
                draft_text: cleanLatexMath(accumulated),
                status: it.status === "final" ? "final" : "draft",
                sources: streamedSources ?? it.sources,
                source_clause: streamedSourceClause || it.source_clause,
                isGenerating: false,
              }
            : it
        ),
      }));
      if (instruction) setCustomPrompt("");
      setJustGeneratedId(itemId);
      setTimeout(() => setJustGeneratedId((cur) => (cur === itemId ? null : cur)), 900);
    } catch (err) {
      updateItem(itemId, {
        isGenerating: false,
        error: err instanceof Error ? err.message : "Gagal streaming draf",
      });
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

  const handleCheckCoverage = async () => {
    if (items.length === 0 || checkingCoverage) return;
    setCheckingCoverage(true);
    try {
      const report = await checkRequirementCoverage(
        torText,
        items.map((item) => ({
          id: item.id,
          title: item.title,
          requirement_text: item.requirement_text,
          draft_text: item.draft_text,
        }))
      );
      setCoverageReport(report);
      setIsCoverageModalOpen(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal menjalankan audit kepatuhan");
    } finally {
      setCheckingCoverage(false);
    }
  };

  const handleCalculateSizing = async () => {
    const capacity = parseFloat(sizingCapacityTb);
    if (!capacity || capacity <= 0 || calculatingSizing) return;
    setCalculatingSizing(true);
    try {
      const result = await calculateSizing({
        platform: sizingPlatform,
        usable_capacity_tb: capacity,
        target_workload: sizingWorkload,
      });
      setSizingResult(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal menghitung sizing");
    } finally {
      setCalculatingSizing(false);
    }
  };

  const handleInsertBoqToDraft = () => {
    if (!sizingResult || !selectedItem) return;
    const separator = localDraftText.trim() ? "\n\n" : "";
    const newText = localDraftText + separator + sizingResult.boq_markdown;
    setLocalDraftText(newText);
    handleTextChange(selectedItem.id, newText);
    setIsSizingOpen(false);
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
    useDraftStore.setState((state) => ({
      items: state.items.map((item) => (
        selectedIds.has(item.id) ? { ...item, status } : item
      )),
    }));
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
  const handleTextChange = (itemId: string, text: string) => {
    useDraftStore.setState((state) => ({
      items: state.items.map((it) =>
        it.id === itemId
          ? { ...it, draft_text: text, status: it.status === "todo" && text.trim() ? "draft" : it.status }
          : it
      ),
    }));
  };

  // Change status of current item
  const handleStatusChange = (newStatus: RequirementStatus) => {
    if (!selectedItem) return;
    updateItem(selectedItem.id, { status: newStatus });
  };

  // Copy active item draft text
  const handleCopyCurrentDraft = async () => {
    if (!selectedItem || !localDraftText) return;
    try {
      await navigator.clipboard.writeText(localDraftText);
      setCopiedItem(true);
      setTimeout(() => setCopiedItem(false), 1800);
    } catch (e) {
      console.error(e);
    }
  };

  const PRODUCT_BREAKDOWN_TEMPLATES: Array<Pick<RequirementItem, "title" | "category" | "requirement_text" | "rationale">> = [
    {
      title: "3.4 Spesifikasi Teknis Storage & Perangkat Utama (Pure Storage / HCI)",
      category: "Teknis",
      requirement_text: "Detail spesifikasi teknis platform perangkat utama (misal Pure Storage FlashArray //X / //C / RC20, Sangfor HCI, Dell PowerEdge, atau HPE): controller active/active, port NVMe-oF / 32G FC, kapasitas raw & usable, DirectFlash modules, dan redundancy power supply.",
      rationale: "Membuktikan kesesuaian mendalam spesifikasi perangkat terhadap klausul tender.",
    },
    {
      title: "3.5 Fitur Reduksi Data & Efisiensi Kapasitas (DRR 3:1 - 5:1)",
      category: "Teknis",
      requirement_text: "Arsitektur deduplikasi dan kompresi data inline hardware-accelerated, proyeksi rasio reduksi data (DRR 3:1 s.d 5:1), garansi kapasitas efektif, dan perbandingan efisiensi TCO terhadap pool eksisting klien.",
      rationale: "Justifikasi keunggulan efisiensi kapasitas dan penghematan biaya storage klien.",
    },
    {
      title: "3.6 Arsitektur High Availability & Redundansi Konektivitas (SAN Fabric)",
      category: "Teknis",
      requirement_text: "Skema redundansi dual-controller active/active, multi-pathing I/O (SAN FC / NVMe-oF / iSCSI 25G), dual fabric switch ToR, dual PSU, dan eliminasi single-point-of-failure.",
      rationale: "Menjamin ketersediaan 99.9999% untuk workload misi kritis perbankan/finansial tanpa downtime.",
    },
    {
      title: "3.7 Proteksi Data, Snapshot Immutability & Disaster Recovery",
      category: "Teknis",
      requirement_text: "Perlindungan data terhadap serangan siber/ransomware dengan immutable snapshot (SafeMode), integrasi replikasi sinkron/asinkron, serta pemenuhan target RPO = 0 dan sub-menit RTO.",
      rationale: "Kepatuhan terhadap regulasi ketahanan siber dan disaster recovery perbankan/finansial.",
    },
    {
      title: "3.8 Matriks Kompatibilitas Sistem Operasi & Hypervisor (VMware/KVM)",
      category: "Teknis",
      requirement_text: "Matriks dukungan resmi terhadap VMware vSphere, KVM, Nutanix, sistem operasi server (RHEL, Windows Server), integrasi VAAI storage offload, dan vCenter Plugin.",
      rationale: "Jaminan integrasi mulus dengan lingkungan server eksisting klien tanpa kendala driver.",
    },
  ];

  const handleAddProductBreakdownSections = () => {
    const existingTitles = new Set(items.map((it) => it.title.toLowerCase()));
    const toAdd = PRODUCT_BREAKDOWN_TEMPLATES.filter((tpl) => !existingTitles.has(tpl.title.toLowerCase()));
    if (toAdd.length === 0) {
      alert("Seluruh sub-bab breakdown produk solusi sudah ada di dalam proposal.");
      return;
    }

    const newItems: RequirementItem[] = toAdd.map((tpl, i) => ({
      id: `sec-prod-${Date.now()}-${i}`,
      title: tpl.title,
      category: tpl.category,
      requirement_text: tpl.requirement_text,
      rationale: tpl.rationale,
      draft_text: "",
      status: "todo",
    }));

    const hldIdx = items.findIndex((it) => it.title.includes("3.3") || it.title.toLowerCase().includes("hld"));
    let updated: RequirementItem[];
    if (hldIdx >= 0) {
      updated = [...items.slice(0, hldIdx + 1), ...newItems, ...items.slice(hldIdx + 1)];
    } else {
      updated = [...items, ...newItems];
    }

    setItems(updated);
    selectItem(newItems[0].id);
  };

  const handleAddProductBreakdownToCuration = () => {
    const existingTitles = new Set(curationItems.map((it) => it.title.toLowerCase()));
    const toAdd = PRODUCT_BREAKDOWN_TEMPLATES.filter((tpl) => !existingTitles.has(tpl.title.toLowerCase()));
    if (toAdd.length === 0) {
      alert("Seluruh sub-bab breakdown produk solusi sudah ada di daftar kurasi.");
      return;
    }

    const newItems: RequirementItem[] = toAdd.map((tpl, i) => ({
      id: `sec-cur-prod-${Date.now()}-${i}`,
      title: tpl.title,
      category: tpl.category,
      requirement_text: tpl.requirement_text,
      rationale: tpl.rationale,
      draft_text: "",
      status: "todo",
    }));

    const hldIdx = curationItems.findIndex((it) => it.title.includes("3.3") || it.title.toLowerCase().includes("hld"));
    let updated: RequirementItem[];
    if (hldIdx >= 0) {
      updated = [...curationItems.slice(0, hldIdx + 1), ...newItems, ...curationItems.slice(hldIdx + 1)];
    } else {
      updated = [...curationItems, ...newItems];
    }

    setCurationItems(updated);
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
        useDraftStore.setState((state) => ({ items: [...state.items, newItem] }));
        selectItem(newId);
      } else if (sectionModalMode === "edit" && selectedItemId) {
        useDraftStore.setState((state) => ({
          items: state.items.map((it) =>
            it.id === selectedItemId
              ? {
                  ...it,
                  title: sectionFormTitle.trim(),
                  category: sectionFormCategory || "Teknis",
                  requirement_text: sectionFormDescription.trim() || it.requirement_text,
                  rationale: sectionFormRationale.trim() || it.rationale,
                }
              : it
          ),
        }));
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

    removeItem(itemId);
  };

  return (
    <div className="flex h-full flex-1 min-h-0 flex-col overflow-hidden bg-surface font-sans text-text-primary">
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 max-w-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-300/60 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-950/80 px-4 py-3 text-xs font-medium text-emerald-900 dark:text-emerald-200 shadow-lg backdrop-blur-sm">
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
      <Topbar
        title="Jawab Dokumen Tender (TOR / RFP)"
        subtitle="Pecah soal tender otomatis, cari referensi dari arsip internal, dan susun proposal siap cetak"
      />

      {/* 3-Step Stepper — always visible, shows where the user is at a glance */}
      <div className="flex items-center justify-center gap-2 border-b border-surface-border bg-surface-raised/60 px-4 py-2 text-xs">
        {[
          { n: 1, label: "Upload TOR" },
          { n: 2, label: "Draf & Tinjau" },
          { n: 3, label: "Ekspor Word/PPTX" },
        ].map((step, idx, arr) => {
          const currentStep = !fileName ? 1 : isExportOpen ? 3 : 2;
          const done = currentStep > step.n;
          const active = currentStep === step.n;
          return (
            <Fragment key={step.n}>
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors duration-200 ${
                  active ? "bg-ink-900 text-white" : done ? "text-emerald-700" : "text-text-muted"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                    active ? "bg-white/20" : done ? "bg-emerald-100" : "bg-surface-border/60"
                  }`}
                >
                  {done ? "✓" : step.n}
                </span>
                {step.label}
              </div>
              {idx < arr.length - 1 && <span className="text-text-muted">───&gt;</span>}
            </Fragment>
          );
        })}
      </div>

      {/* STATE A: EMPTY / UPLOAD STATE - COMPACT 2-COLUMN LAYOUT */}
      {!fileName && (
        <div className="flex flex-1 flex-col items-center justify-start p-4 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-5xl space-y-4">
            {/* Header Strip with Title and direct Action CTA */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface-raised border border-surface-border rounded-xl p-4 shadow-subtle">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink shadow-subtle">
                  {uploading ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={20} />}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-text-primary">
                    {uploading
                      ? "Mengekstrak teks dokumen..."
                      : format === "pptx"
                      ? "Buat Slide Presentasi Tender dari Acuan TOR (PPTX)"
                      : format === "pdf"
                      ? "Buat Dokumen PDF Tender dari Acuan TOR"
                      : "Buat Dokumen Proposal Word Tender dari TOR (DOCX)"}
                  </h2>
                  <p className="text-xs text-text-muted">
                    Pilih dokumen acuan KAK/TOR di sebelah kiri, pilih grounding di sebelah kanan, lalu klik Mulai.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartDrafting}
                  disabled={(!pendingFiles.length && !pendingLibraryDocs.length) || uploading}
                  className="flex items-center justify-center gap-2 rounded-lg bg-ink-900 px-5 py-2.5 text-xs font-bold text-white shadow-subtle transition-all hover:bg-ink-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Memproses Dokumen...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} className="text-accent" />
                      {pendingFiles.length > 1
                        ? `Mulai Susun (${pendingFiles.length} File)`
                        : pendingLibraryDocs.length > 1
                        ? `Mulai Susun (${pendingLibraryDocs.length} Doc)`
                        : format === "pptx"
                        ? "Mulai Susun Slide Presentasi (PPTX)"
                        : format === "pdf"
                        ? "Mulai Buat Dokumen PDF"
                        : "Mulai Susun Proposal Word (DOCX)"}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error message banner if any */}
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                <AlertCircle size={15} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 2-Column Main Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left Column (col-span-7): Source Tender Documents & Format */}
              <div className="lg:col-span-7 rounded-xl border border-surface-border bg-surface-raised p-4 shadow-subtle space-y-3.5">
                <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[10px] font-bold text-white">
                      1
                    </span>
                    <span className="text-xs font-bold text-text-primary">
                      Dokumen Acuan Tender (TOR / RFP / RKS)
                    </span>
                  </div>
                  <span className="text-[10px] text-text-muted">Wajib 1 dokumen acuan</span>
                </div>

                {/* Doc Type & Format row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-text-primary">Dokumen yang ingin dibuat</label>
                    <select
                      value={docTypeId}
                      onChange={(e) => {
                        const next = e.target.value as DraftDocTypeId;
                        setDocTypeId(next);
                        const allowed = getDocType(next).formats;
                        if (!allowed.includes(format)) setFormat(allowed[0]);
                      }}
                      className="w-full rounded-md border border-surface-border bg-surface px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                    >
                      {DOC_TYPES.map((d) => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-text-primary">Format Output</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {getDocType(docTypeId).formats.map((f) => {
                        const isSelected = format === f;
                        return (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setFormat(f)}
                            className={`flex items-center justify-center gap-1.5 py-1.5 px-1 rounded-md border text-[11px] font-medium transition-all ${
                              isSelected
                                ? "border-accent bg-accent-soft text-accent-ink ring-1 ring-accent font-semibold"
                                : "border-surface-border bg-surface hover:border-accent/40 text-text-secondary hover:text-text-primary"
                            }`}
                          >
                            {f === "docx" ? (
                              <WordIcon size={14} className="shrink-0" />
                            ) : f === "pdf" ? (
                              <PdfIcon size={14} className="shrink-0" />
                            ) : (
                              <PowerPointIcon size={14} className="shrink-0" />
                            )}
                            <span className="truncate">{f === "docx" ? "Word" : f === "pdf" ? "PDF" : "PPT"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Source Selection Mode Selector */}
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-surface-border bg-surface p-1">
                    <button
                      type="button"
                      onClick={() => setSourceInputMode("upload")}
                      className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-xs transition-all ${
                        sourceInputMode === "upload"
                          ? "bg-surface-raised text-text-primary font-semibold shadow-subtle border border-surface-border"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      <UploadCloud size={13} />
                      <span>Upload dari Laptop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceInputMode("library")}
                      className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-xs transition-all ${
                        sourceInputMode === "library"
                          ? "bg-surface-raised text-text-primary font-semibold shadow-subtle border border-surface-border"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      <BookOpen size={13} />
                      <span>Dari Library ({referenceDocs.length})</span>
                    </button>
                  </div>

                  {sourceInputMode === "upload" ? (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.docx,.txt"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      {pendingFiles.length > 0 ? (
                        <div className="rounded-xl border border-accent/60 bg-accent-soft/30 p-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-accent-ink">
                              Dokumen Terpilih ({pendingFiles.length} file)
                            </span>
                            <button
                              type="button"
                              onClick={() => setPendingFiles([])}
                              className="text-[11px] text-text-muted hover:text-red-500 transition-colors"
                            >
                              Hapus Semua
                            </button>
                          </div>
                          <div className="max-h-32 overflow-y-auto space-y-1.5 pr-0.5">
                            {pendingFiles.map((file, idx) => (
                              <div
                                key={`${file.name}-${idx}`}
                                className="flex items-center justify-between gap-2 rounded-lg border border-accent/40 bg-surface px-2.5 py-1.5 shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText size={14} className="text-accent shrink-0" />
                                  <span className="truncate text-xs font-medium text-text-primary">
                                    {file.name}
                                  </span>
                                  <span className="text-[10px] text-text-muted shrink-0">
                                    ({file.size < 1024 * 1024 ? `${Math.round(file.size / 1024)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`})
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                                  className="shrink-0 rounded p-1 text-text-muted hover:text-red-500 transition-colors"
                                  title="Hapus file ini"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-accent/60 bg-surface hover:bg-accent-soft text-xs font-medium text-accent-ink transition-colors active:scale-[0.99]"
                          >
                            <UploadCloud size={13} />
                            <span>+ Tambah Dokumen Lain dari Laptop</span>
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-surface-border hover:border-accent rounded-xl bg-surface/40 hover:bg-surface-raised cursor-pointer transition-all group text-center"
                        >
                          <div className="h-9 w-9 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                            {uploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
                          </div>
                          <p className="text-xs font-semibold text-text-primary">
                            {uploading ? "Sedang mengekstrak teks..." : "Klik untuk Pilih File TOR / RFP (Bisa > 1 file)"}
                          </p>
                          <p className="text-[10.5px] text-text-muted mt-0.5">
                            Mendukung multi-file PDF (.pdf), Word (.docx), atau Teks (.txt)
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pendingLibraryDocs.length > 0 && (
                        <div className="p-2 rounded-lg border border-accent/60 bg-accent-soft/50 space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-accent-ink">
                            <span>Dokumen Terpilih ({pendingLibraryDocs.length}):</span>
                            <button
                              type="button"
                              onClick={() => setPendingLibraryDocs([])}
                              className="text-[10px] text-text-muted hover:text-red-500 hover:underline"
                            >
                              Hapus Semua
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                            {pendingLibraryDocs.map((doc) => (
                              <span
                                key={doc.id}
                                className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-surface px-2 py-0.5 text-[11px] font-medium text-accent-ink shadow-2xs"
                              >
                                <span className="truncate max-w-[180px]">{doc.title}</span>
                                <button
                                  type="button"
                                  onClick={() => handlePickLibrarySource(doc)}
                                  className="hover:text-red-500 transition-colors"
                                >
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                          type="text"
                          value={librarySourceSearch}
                          onChange={(e) => setLibrarySourceSearch(e.target.value)}
                          placeholder="Cari nama dokumen TOR, RKS, RFP di library..."
                          className="w-full rounded-md border border-surface-border bg-surface pl-8 pr-7 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
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

                      <div className="max-h-36 overflow-y-auto rounded-lg border border-surface-border bg-surface divide-y divide-surface-border">
                        {loadingReferenceDocs ? (
                          <div className="flex items-center justify-center p-4 text-xs text-text-muted gap-2">
                            <Loader2 size={13} className="animate-spin text-accent" /> Memuat dokumen dari library...
                          </div>
                        ) : filteredLibrarySourceDocs.length === 0 ? (
                          <p className="p-3 text-xs text-text-muted text-center">
                            Tidak ada dokumen yang sesuai.
                          </p>
                        ) : (
                          filteredLibrarySourceDocs.map((doc) => {
                            const isPicked = pendingLibraryDocs.some((d) => d.id === doc.id);
                            return (
                              <button
                                key={doc.id}
                                type="button"
                                onClick={() => handlePickLibrarySource(doc)}
                                className={`w-full flex items-center justify-between p-2 text-left text-xs transition-colors ${
                                  isPicked
                                    ? "bg-accent-soft/70 font-semibold text-accent-ink"
                                    : "hover:bg-surface-raised text-text-primary"
                                }`}
                              >
                                <span className="truncate">{doc.title}</span>
                                {isPicked && <Check size={13} className="shrink-0 text-accent-ink" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column (col-span-5): Grounding & References */}
              <div className="lg:col-span-5 rounded-xl border border-surface-border bg-surface-raised p-4 shadow-subtle space-y-3">
                <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[10px] font-bold text-white">
                      2
                    </span>
                    <span className="text-xs font-bold text-text-primary">
                      Referensi Internal (Opsional)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {selectedReferenceIds.size > 0 && (
                      <span className="text-[10px] font-medium text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded border border-accent/30">
                        {selectedReferenceIds.size} aktif
                      </span>
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

                <p className="text-[11px] text-text-muted">
                  Grounding acuan internal (spesifikasi produk, proposal lalu, standar operasional).
                </p>

                {/* Drive search */}
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={referenceSearch}
                    onChange={(e) => setReferenceSearch(e.target.value)}
                    placeholder="Cari dokumen internal..."
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

                {/* Reference Docs pills */}
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-0.5">
                  {loadingReferenceDocs ? (
                    <div className="flex items-center gap-1.5 text-xs text-text-muted p-2">
                      <Loader2 size={12} className="animate-spin text-accent" /> Memuat referensi...
                    </div>
                  ) : filteredReferenceDocs.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-text-muted">
                      {referenceDocs.length === 0 ? "Belum ada dokumen referensi." : "Tidak ada dokumen yang cocok."}
                    </p>
                  ) : (
                    filteredReferenceDocs.map((doc) => {
                      const selected = selectedReferenceIds.has(doc.id);
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => toggleReferenceDoc(doc.id)}
                          title={doc.title}
                          className={`max-w-[200px] truncate rounded-full border px-2.5 py-1 text-[11px] transition-all active:scale-[0.98] ${
                            selected
                              ? "border-accent bg-accent-soft text-accent-ink font-medium"
                              : "border-surface-border/70 bg-surface text-text-secondary hover:border-accent/50 hover:text-text-primary"
                          }`}
                        >
                          {doc.title}
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Sub-CTA inside right card */}
                <div className="pt-2 border-t border-surface-border">
                  <button
                    type="button"
                    onClick={handleStartDrafting}
                    disabled={(!pendingFiles.length && !pendingLibraryDocs.length) || uploading}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-ink-900 py-2.5 text-xs font-semibold text-white shadow-subtle transition-all duration-150 hover:bg-ink-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles size={14} className="text-accent" />
                    <span>Mulai Susun Proposal Sekarang</span>
                  </button>
                  {!pendingFiles.length && !pendingLibraryDocs.length && (
                    <p className="mt-1.5 text-center text-[10.5px] text-text-muted">
                      Pilih dokumen acuan KAK/TOR di sebelah kiri terlebih dahulu.
                    </p>
                  )}
                </div>
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
            {/* Archetype Badge & Switcher */}
            <div className="flex flex-wrap items-center gap-2">
              {detectedArchetype && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-bold text-accent-ink">
                  <Zap size={12} className="text-accent" />
                  Tipe Terdeteksi: {archetypeLabel(detectedArchetype)}
                </span>
              )}
              <span className="text-[11px] text-text-muted">Ganti pola:</span>
              {ARCHETYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSwitchArchetype(opt.id)}
                  disabled={isRecommendingStructure || isRevisingStructure}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                    detectedArchetype === opt.id
                      ? "border-accent bg-accent text-ink-900"
                      : "border-surface-border bg-surface-raised text-text-secondary hover:border-accent"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

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

            {/* Red-Flag & Critical Clause Scanner */}
            {(scanningClauses || criticalClauses) && (
              <div className="rounded-xl border border-surface-border bg-surface-raised shadow-subtle overflow-hidden animate-in fade-in duration-300">
                <button
                  type="button"
                  onClick={() => setClausesCardOpen((open) => !open)}
                  disabled={!criticalClauses}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Flag size={16} className="text-red-600" />
                    <span className="text-sm font-bold text-text-primary">Risiko &amp; Klausul Kritis TOR</span>
                    {scanningClauses ? (
                      <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                        <Loader2 size={12} className="animate-spin" /> Memindai...
                      </span>
                    ) : criticalClauses ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                          criticalClauses.risk_level === "High"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : criticalClauses.risk_level === "Medium"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        Risiko {criticalClauses.risk_level}
                      </span>
                    ) : null}
                  </div>
                  {criticalClauses && (
                    <ChevronDown
                      size={16}
                      className={`shrink-0 text-text-muted transition-transform ${clausesCardOpen ? "rotate-180" : ""}`}
                    />
                  )}
                </button>

                {clausesCardOpen && criticalClauses && (
                  <div className="border-t border-surface-border p-4 space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
                    {criticalClauses.executive_summary_alerts.length > 0 && (
                      <ul className="space-y-1.5">
                        {criticalClauses.executive_summary_alerts.map((alert, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 rounded-lg border border-red-200/50 bg-red-50/60 px-3 py-2 text-xs text-text-primary"
                          >
                            <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-600" />
                            <span>{alert}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-text-muted sm:grid-cols-4">
                      <span>{criticalClauses.mandatory_requirements.length} kebutuhan wajib</span>
                      <span>{criticalClauses.penalties_and_risks.length} penalti/risiko</span>
                      <span>{criticalClauses.sla_and_maintenance.length} SLA/maintenance</span>
                      <span>{criticalClauses.certifications_and_legal.length} sertifikasi/legal</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Discussion & Structure Customization Card */}
            <div className="rounded-xl border border-surface-border bg-surface-raised p-4 shadow-subtle space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <label className="block text-xs font-bold text-text-primary">
                    Diskusikan / Minta Revisi AI terhadap Susunan Sub-Bab
                  </label>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Contoh: <span className="italic text-text-secondary">&ldquo;Tambahkan bab Disaster Recovery multi-cloud dan pisahkan SLA ke bab mandiri&rdquo;</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReferenceAccordionOpen((open) => !open)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all shrink-0 ${
                    referenceAccordionOpen
                      ? "border-accent bg-accent-soft text-accent-ink shadow-2xs"
                      : "border-surface-border bg-surface text-text-secondary hover:border-accent hover:text-text-primary"
                  }`}
                >
                  <FileText size={13} className="text-accent-ink" />
                  <span>{referenceAccordionOpen ? "Tutup Acuan" : "+ Gunakan Pola Acuan"}</span>
                  <ChevronDown
                    size={13}
                    className={`transition-transform duration-200 ${referenceAccordionOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </div>

              {/* Input Revisi AI */}
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

              {/* Custom Reference Proposal Dropdown Panel */}
              {referenceAccordionOpen && (
                <div className="rounded-lg border border-surface-border bg-surface p-3.5 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                      <FileText size={13} className="text-accent-ink" /> Pola Outline Acuan Proposal (Opsional)
                    </span>
                    <span className="text-[10.5px] text-text-muted">
                      Tempel outline proposal tender sebelumnya
                    </span>
                  </div>
                  <textarea
                    value={customOutlineText}
                    onChange={(e) => setCustomOutlineText(e.target.value)}
                    placeholder={"1. Pendahuluan & Gambaran Umum\n2. Solusi Teknis & Arsitektur\n3. Metodologi Implementasi\n4. SLA & Garansi Layanan\n..."}
                    rows={4}
                    disabled={isRecommendingStructure || isRevisingStructure}
                    className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-xs text-text-primary outline-none focus:border-accent transition-colors disabled:opacity-60 resize-y font-mono text-[11px]"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setReferenceAccordionOpen(false)}
                      className="text-xs h-7 px-2.5"
                    >
                      Batal
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!customOutlineText.trim() || isRecommendingStructure || isRevisingStructure}
                      onClick={handleApplyReferenceStructure}
                      className="flex items-center gap-1.5 text-xs font-semibold h-7 px-3 bg-ink-900 text-white hover:bg-ink-800"
                    >
                      {isRecommendingStructure ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                      <span>Terapkan Acuan</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* Hasil Perubahan AI / Structure Diff Alert — Pill Badges */}
              {structureDiff && (
                <div className="rounded-lg border border-emerald-300/80 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 text-xs text-emerald-950 dark:text-emerald-200 space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      <span>Hasil Penyesuaian AI: &ldquo;{structureDiff.instruction}&rdquo;</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setStructureDiff(null)}
                      className="text-[10px] text-emerald-700 hover:text-emerald-900 font-medium px-1.5 py-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                    >
                      ✕ Tutup
                    </button>
                  </div>

                  {structureDiff.added.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10.5px] font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
                        <span>Sub-Bab Ditambahkan ({structureDiff.added.length}):</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {structureDiff.added.map((item, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shadow-2xs"
                          >
                            + {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {structureDiff.removed.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10.5px] font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-600"></span>
                        <span>Sub-Bab Disesuaikan / Digabung ({structureDiff.removed.length}):</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {structureDiff.removed.map((item, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100/80 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs"
                          >
                            − {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {structureDiff.summary && (
                    <p className="text-emerald-800 dark:text-emerald-400 italic text-[11px] pt-0.5">
                      {structureDiff.summary}
                    </p>
                  )}
                </div>
              )}
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenAddCurationSection}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent transition-colors shadow-subtle"
                  >
                    <Plus size={13} />
                    <span>Tambah Sub-Bab Manual</span>
                  </button>
                </div>
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
                      <div className="h-3 w-1/3 rounded bg-surface-border/60 animate-shimmer" />
                      <div className="h-2.5 w-2/3 rounded bg-surface-border/40 animate-shimmer" />
                      <div className="h-2 w-full rounded bg-surface-border/40 animate-shimmer" />
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
                            {item.source_clause && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full border border-emerald-300/60 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300"
                                title={item.source_clause}
                              >
                                Acuan Dokumen Sumber: {item.source_clause}
                              </span>
                            )}
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
                            onClick={() => setPreviewingSection(item)}
                            className="rounded-md border border-surface-border p-1.5 text-text-muted hover:bg-accent-soft hover:text-accent-ink hover:border-accent transition-colors"
                            title="Pratinjau isi & tujuan sub-bab"
                          >
                            <Eye size={13} />
                          </button>
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
            onCheckCoverage={handleCheckCoverage}
            isCheckingCoverage={checkingCoverage}
            onOpenSizing={() => setIsSizingOpen(true)}
          />

          {/* Proposal Intelligence Strip — red-flag risk, coverage & win themes, always reachable in workspace */}
          <>
              <div className="flex flex-wrap items-center gap-2 border-b border-surface-border bg-surface-raised/60 px-6 py-2">
                {criticalClauses && (
                  <button
                    type="button"
                    onClick={() => setIntelPanelOpen((p) => (p === "clauses" ? null : "clauses"))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all active:scale-[0.98] ${
                      criticalClauses.risk_level === "High"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : criticalClauses.risk_level === "Medium"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    <Flag size={12} /> Risiko TOR: {criticalClauses.risk_level}
                    <ChevronDown
                      size={12}
                      className={`transition-transform ${intelPanelOpen === "clauses" ? "rotate-180" : ""}`}
                    />
                  </button>
                )}

                {coverageReport ? (
                  <button
                    type="button"
                    onClick={() => setIntelPanelOpen((p) => (p === "coverage" ? null : "coverage"))}
                    className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-all hover:border-accent active:scale-[0.98]"
                  >
                    <BarChart3 size={12} className="text-accent-ink" /> Coverage: {coverageReport.overall_coverage_pct}%
                    <ChevronDown
                      size={12}
                      className={`transition-transform ${intelPanelOpen === "coverage" ? "rotate-180" : ""}`}
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCheckCoverage}
                    disabled={checkingCoverage}
                    className="text-[11px] text-accent-ink hover:underline disabled:opacity-50"
                  >
                    {checkingCoverage ? "Mengaudit coverage..." : "Jalankan audit coverage →"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIntelPanelOpen((p) => (p === "winthemes" ? null : "winthemes"))}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all active:scale-[0.98] ${
                    selectedWinThemes.size > 0
                      ? "border-accent bg-accent-soft text-accent-ink"
                      : "border-surface-border bg-surface text-text-secondary hover:border-accent/50"
                  }`}
                >
                  <Target size={12} /> Win Themes ({selectedWinThemes.size} aktif)
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${intelPanelOpen === "winthemes" ? "rotate-180" : ""}`}
                  />
                </button>
              </div>

              {intelPanelOpen === "clauses" && criticalClauses && (
                <div className="border-b border-surface-border bg-surface px-6 py-3.5 space-y-2.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
                  {criticalClauses.executive_summary_alerts.length > 0 ? (
                    <ul className="space-y-1.5">
                      {criticalClauses.executive_summary_alerts.map((alert, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 rounded-lg border border-red-200/50 bg-red-50/60 px-3 py-1.5 text-xs text-text-primary"
                        >
                          <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-600" />
                          <span>{alert}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-text-muted">Tidak ada alert kritis yang menonjol.</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-[11px] text-text-muted">
                    <span>{criticalClauses.mandatory_requirements.length} kebutuhan wajib</span>
                    <span>{criticalClauses.penalties_and_risks.length} penalti/risiko</span>
                    <span>{criticalClauses.sla_and_maintenance.length} SLA/maintenance</span>
                    <span>{criticalClauses.certifications_and_legal.length} sertifikasi/legal</span>
                  </div>
                </div>
              )}

              {intelPanelOpen === "coverage" && coverageReport && (
                <div className="border-b border-surface-border bg-surface px-6 py-3.5 space-y-2.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
                  <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full border border-surface-border bg-surface-raised">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
                      style={{ width: `${coverageReport.overall_coverage_pct}%` }}
                    />
                  </div>
                  {coverageReport.uncovered_items.length > 0 ? (
                    <ul className="space-y-1.5">
                      {coverageReport.uncovered_items.slice(0, 3).map((it, i) => (
                        <li
                          key={i}
                          className="rounded-lg border border-amber-200/50 bg-amber-50/60 px-3 py-1.5 text-xs text-text-primary"
                        >
                          {it.requirement}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-emerald-700">Seluruh kebutuhan TOR sudah tercakup di draf.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCoverageModalOpen(true)}
                    className="text-[11px] font-medium text-accent-ink hover:underline"
                  >
                    Lihat detail lengkap →
                  </button>
                </div>
              )}

              {intelPanelOpen === "winthemes" && (
                <div className="border-b border-surface-border bg-surface px-6 py-3.5 space-y-2.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
                  <p className="text-[11px] text-text-muted">
                    Dipilih di sini otomatis diinjeksi ke setiap panggilan Generate/Regenerate Draf.
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {WIN_THEME_PRESETS.map((theme) => {
                      const active = selectedWinThemes.has(theme);
                      return (
                        <button
                          key={theme}
                          type="button"
                          onClick={() => toggleWinTheme(theme)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition-all active:scale-[0.98] ${
                            active
                              ? "border-accent bg-accent-soft text-accent-ink font-medium"
                              : "border-surface-border/70 bg-surface text-text-secondary hover:border-accent/50 hover:text-text-primary"
                          }`}
                        >
                          {theme}
                        </button>
                      );
                    })}

                    {Array.from(selectedWinThemes)
                      .filter((theme) => !WIN_THEME_PRESETS.includes(theme))
                      .map((theme) => (
                        <span
                          key={theme}
                          className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent-ink animate-in fade-in zoom-in duration-150"
                        >
                          {theme}
                          <button
                            type="button"
                            onClick={() => removeWinTheme(theme)}
                            className="rounded-full hover:bg-accent/30 transition-colors"
                            title="Hapus"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}

                    <input
                      type="text"
                      value={customWinThemeInput}
                      onChange={(e) => setCustomWinThemeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomWinTheme();
                        }
                      }}
                      placeholder="+ Tambah keunggulan lain..."
                      className="min-w-[160px] flex-1 rounded-full border border-dashed border-surface-border bg-transparent px-2.5 py-1 text-[11px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                    />
                  </div>
                </div>
              )}
          </>

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
          <div className="flex flex-1 min-h-0 h-full overflow-hidden">
            {/* LEFT COLUMN: REQUIREMENTS NAVIGATOR / CHECKLIST */}
            <div className="flex w-full md:w-[360px] lg:w-[420px] xl:w-[450px] flex-col border-r border-surface-border bg-surface-raised h-full min-h-0 shrink-0">
              {/* Search & Filters (Compact) */}
              <div className="border-b border-surface-border p-2.5 space-y-2">
                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari bagian, SLA, storage..."
                    className="w-full rounded-md border border-surface-border bg-surface pl-7 pr-2.5 py-1 text-xs text-text-primary outline-none focus:border-accent transition-colors"
                  />
                </div>

                {/* Status Tabs (Compact) */}
                <div className="flex rounded-md border border-surface-border bg-surface p-0.5 text-[11px]">
                  <button
                    onClick={() => setFilterStatus("all")}
                    className={`flex-1 rounded py-0.5 font-medium transition-all ${
                      filterStatus === "all"
                        ? "bg-surface-raised text-text-primary shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Semua ({items.length})
                  </button>
                  <button
                    onClick={() => setFilterStatus("todo")}
                    className={`flex-1 rounded py-0.5 font-medium transition-all ${
                      filterStatus === "todo"
                        ? "bg-surface-raised text-text-primary shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Belum ({items.filter((i) => i.status === "todo").length})
                  </button>
                  <button
                    onClick={() => setFilterStatus("draft")}
                    className={`flex-1 rounded py-0.5 font-medium transition-all ${
                      filterStatus === "draft"
                        ? "bg-surface-raised text-amber-700 shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Draf ({items.filter((i) => i.status === "draft").length})
                  </button>
                  <button
                    onClick={() => setFilterStatus("final")}
                    className={`flex-1 rounded py-0.5 font-medium transition-all ${
                      filterStatus === "final"
                        ? "bg-surface-raised text-emerald-700 shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Final ({items.filter((i) => i.status === "final").length})
                  </button>
                  <button
                    onClick={() => setFilterStatus("review")}
                    className={`flex-1 rounded py-0.5 font-medium transition-all ${
                      filterStatus === "review"
                        ? "bg-surface-raised text-red-700 shadow-subtle"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Review ({qualityReport?.items_with_issues ?? 0})
                  </button>
                </div>

                <div className="flex items-center justify-between gap-1.5 text-[11px] pt-0.5">
                  <button
                    onClick={selectVisibleItems}
                    className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary text-[11px]"
                  >
                    <CheckSquare size={12} />
                    {filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id))
                      ? "Batal"
                      : "Pilih semua"}
                  </button>
                  {selectedIds.size > 0 ? (
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-text-primary text-[10px]">{selectedIds.size} dipilih</span>
                      <button onClick={() => bulkSetStatus("draft")} className="rounded border border-surface-border px-1.5 py-0.5 text-[10px] text-amber-700 hover:bg-accent-soft">Draf</button>
                      <button onClick={() => bulkSetStatus("final")} className="rounded border border-emerald-200 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-50">Final</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenAddSection}
                      className="inline-flex items-center gap-1 text-accent-ink bg-accent-soft hover:bg-accent border border-accent/40 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors"
                    >
                      <Plus size={11} />
                      Tambah Bagian
                    </button>
                  )}
                </div>
              </div>

              {/* Requirement Items List - Maximized viewport height for easy scrolling */}
              <div className="flex-1 overflow-y-auto divide-y divide-surface-border min-h-0">
                {filteredItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-text-muted">
                    Tidak ada bagian yang cocok dengan filter.
                  </div>
                ) : (
                  filteredItems.map((item, idx) => {
                    const isSelected = selectedItem?.id === item.id;
                    const { number: hierNum, text: hierText } = splitHierarchicalTitle(item.title);
                    const statusDot =
                      item.status === "final"
                        ? "bg-emerald-500"
                        : item.status === "draft"
                        ? "bg-amber-500"
                        : "bg-surface-border";
                    const statusLabel =
                      item.status === "final" ? "Final" : item.status === "draft" ? "Draf" : "Belum dikerjakan";
                    return (
                      <div
                        key={item.id}
                        onClick={() => selectItem(item.id)}
                        className={`group cursor-pointer px-3 py-2.5 transition-colors relative ${
                          isSelected
                            ? "bg-surface border-l-4 border-l-accent"
                            : "hover:bg-surface/50 border-l-4 border-l-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleItemSelection(item.id)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Pilih ${item.title}`}
                            className="shrink-0 rounded border-surface-border text-accent focus:ring-accent"
                          />
                          {hierNum && (
                            <span className="shrink-0 font-mono text-[11px] font-bold text-accent-ink">
                              {hierNum}
                            </span>
                          )}
                          <h4 className="flex-1 min-w-0 truncate text-xs font-semibold text-text-primary">
                            {hierText}
                          </h4>

                          {/* Reorder, preview & regenerate — hidden until row hover */}
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewingSection(item);
                              }}
                              className="rounded p-0.5 text-text-muted hover:bg-surface hover:text-accent-ink"
                              title="Pratinjau Isi & Ruang Lingkup"
                            >
                              <Eye size={11} />
                            </button>
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
                                handleStreamGenerate(item.id);
                              }}
                              className="rounded p-0.5 text-text-muted hover:bg-surface hover:text-accent-ink disabled:opacity-40"
                              title="Regenerate Bagian Ini"
                            >
                              <RefreshCw size={11} className={item.isGenerating ? "animate-spin" : ""} />
                            </button>
                          </div>

                          {/* Minimal status indicator */}
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`}
                            title={statusLabel}
                          />
                        </div>

                        <div className="mt-1 flex items-center gap-1.5 pl-5">
                          <span className={`${CHIP_SM} border border-surface-border bg-surface uppercase tracking-wider text-text-secondary text-[9px] h-4.5 px-1.5`}>
                            {item.category}
                          </span>
                          {item.image_data_url && (
                            <span className={`${CHIP_SM} border border-blue-200/60 bg-blue-50 text-blue-700 text-[9px] h-4.5 px-1.5`}>
                              Aset
                            </span>
                          )}
                          {(() => {
                            const badge = getGroundingBadge(item);
                            return badge ? (
                              <span className={`${CHIP_SM} border ${badge.className} text-[9px] h-4.5 px-1.5`}>
                                <span className={`h-1 w-1 rounded-full ${badge.dotClassName}`} />
                                {badge.label}
                              </span>
                            ) : null;
                          })()}
                        </div>

                        <p className="mt-1 pl-5 text-[10.5px] leading-snug text-text-muted line-clamp-1">
                          {item.requirement_text}
                        </p>

                        {/* Generation spinner indicator */}
                        {item.isGenerating && (
                          <div className="animate-in fade-in duration-200 mt-1 pl-5 flex items-center gap-1.5 text-[10px] font-medium text-accent-ink">
                            <Loader2 size={11} className="animate-spin" />
                            <span>Menyusun draf AI...</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Add Section affordance */}
              <div className="p-2 border-t border-surface-border bg-surface/50 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenAddSection}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-surface-border bg-surface py-2 px-3 text-xs font-semibold text-text-secondary hover:border-accent hover:text-text-primary hover:bg-accent-soft/30 transition-all shadow-2xs"
                >
                  <Plus size={13} className="text-accent-ink shrink-0" />
                  <span>+ Tambah Bagian Baru</span>
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: ACTIVE REQUIREMENT STUDIO & DRAFT WORKSPACE */}
            <div className="flex flex-1 flex-col overflow-hidden bg-surface">
              {selectedItem ? (
                <>
                  {/* Pinned Top Action Bar — stays permanently pinned across the top of the editor column without floating */}
                  <div className="shrink-0 z-20 w-full border-b border-surface-border bg-surface-raised/95 backdrop-blur-md px-4 sm:px-6 py-2 shadow-xs flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles size={15} className="text-accent-ink shrink-0" />
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* Quick Jump Selector Dropdown */}
                        <select
                          value={selectedItem.id}
                          onChange={(e) => selectItem(e.target.value)}
                          className="rounded-md border border-surface-border bg-surface px-2 py-1 text-[11px] text-text-primary font-semibold outline-none focus:border-accent w-40 sm:w-52 truncate"
                          title="Navigasi Cepat Bab: Lompat langsung ke sub-bab manapun"
                        >
                          {items.map((it, idx) => (
                            <option key={it.id} value={it.id}>
                              {idx + 1}. {it.title}
                            </option>
                          ))}
                        </select>
                        <span className="hidden md:inline-block rounded bg-surface border border-surface-border px-1.5 py-0.5 text-[9px] font-semibold uppercase text-text-secondary shrink-0">
                          {selectedItem.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          handleOpenStudio(
                            selectedItem.title.toLowerCase().includes("hld") ||
                            selectedItem.title.toLowerCase().includes("arsitektur") ||
                            selectedItem.title.toLowerCase().includes("topologi")
                              ? "hld"
                              : "search"
                          )
                        }
                        title="Buka Visual Asset Studio (Diagram HLD, Stencil Hardware, Gambar)"
                        className="h-7 px-2.5 text-xs font-medium border-surface-border hover:border-accent"
                      >
                        <ImageIcon size={13} className="mr-1.5 text-accent-ink" />
                        <span>Studio Visual</span>
                      </Button>
                      {localDraftText && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShowMarkdownPreview((v) => !v)}
                          title={showMarkdownPreview ? "Edit teks mentah (markdown)" : "Selesai edit, kembali ke tampilan rapi"}
                          className="h-7 px-2.5 text-xs"
                        >
                          {showMarkdownPreview ? (
                            <><Pencil size={12} className="mr-1" /> Edit Mentah</>
                          ) : (
                            <><Eye size={12} className="mr-1" /> Pratinjau</>
                          )}
                        </Button>
                      )}
                      {localDraftText && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleCopyCurrentDraft}
                          className="text-xs h-7 px-2.5"
                        >
                          {copiedItem ? (
                            <><Check size={12} className="mr-1 text-emerald-500" /> Tersalin</>
                          ) : (
                            <><Copy size={12} className="mr-1" /> Salin</>
                          )}
                        </Button>
                      )}
                      <div className="relative">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!(revisions[selectedItem.id]?.length > 0)}
                          onClick={() => setIsRevisionMenuOpen((v) => !v)}
                          title="Riwayat / Undo ke draf sebelumnya"
                          className="h-7 px-2.5 text-xs font-medium border-surface-border hover:border-accent disabled:opacity-40"
                        >
                          <History size={13} className="mr-1.5 text-accent-ink" />
                          <span>Riwayat</span>
                        </Button>
                        {isRevisionMenuOpen && revisions[selectedItem.id]?.length > 0 && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setIsRevisionMenuOpen(false)} />
                            <div className="absolute right-0 top-full mt-1.5 w-64 rounded-lg border border-surface-border bg-surface-raised shadow-lg z-30 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted border-b border-surface-border">
                                Riwayat Draf ({revisions[selectedItem.id].length})
                              </div>
                              <div className="max-h-56 overflow-y-auto">
                                {revisions[selectedItem.id].map((rev, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                      restoreRevision(selectedItem.id, idx);
                                      setIsRevisionMenuOpen(false);
                                    }}
                                    className="w-full flex flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-surface transition-colors border-b border-surface-border last:border-b-0"
                                  >
                                    <span className="text-xs font-semibold text-text-primary">{rev.label}</span>
                                    <span className="text-[10px] text-text-muted">
                                      {new Date(rev.timestamp).toLocaleTimeString("id-ID", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit",
                                      })}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={selectedItem.isGenerating}
                        onClick={() => handleStreamGenerate(selectedItem.id, customPrompt)}
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
                            Regenerate
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

                  {/* Scrollable Workspace Content */}
                  <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                    <div
                      key={selectedItem.id}
                      className="flex flex-col gap-6 max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-bottom-1 duration-150"
                    >
                      {/* Item Header & Status Bar */}
                      <div className="flex flex-col gap-4 rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          {/* All meta chips share one fixed height/radius/text-size so nothing zig-zags */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`${CHIP_BASE} border border-transparent bg-accent-soft font-bold text-accent-ink`}>
                              {selectedItem.id.toUpperCase()}
                            </span>
                            <span className={`${CHIP_BASE} border border-surface-border bg-surface text-text-secondary`}>
                              {selectedItem.category}
                            </span>
                            {(() => {
                              const badge = getGroundingBadge(selectedItem);
                              return badge ? (
                                <span
                                  key={selectedItem.sources?.length ?? 0}
                                  className={`${CHIP_BASE} animate-in fade-in duration-300 border ${badge.className}`}
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
                              className={`${CHIP_BASE} border border-surface-border bg-surface text-text-secondary transition-colors hover:border-accent hover:text-text-primary active:scale-[0.98]`}
                            >
                              <Pencil size={11} /> Edit Info
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSection(selectedItem.id)}
                              title="Hapus Bagian ini"
                              className={`${CHIP_BASE} border border-red-200 bg-surface text-red-600 transition-colors hover:bg-red-50 active:scale-[0.98]`}
                            >
                              <Trash2 size={11} /> Hapus
                            </button>
                          </div>
                          <h3 className="mt-2.5 text-base font-bold text-text-primary">
                            {selectedItem.title}
                          </h3>
                        </div>

                        {/* Status Selector Segmented Controls */}
                        <div className="flex h-8 shrink-0 items-center rounded-lg border border-surface-border bg-surface p-1">
                          <button
                            onClick={() => handleStatusChange("todo")}
                            className={`flex h-full items-center rounded-md px-3 text-xs font-medium transition-all active:scale-[0.98] ${
                              selectedItem.status === "todo"
                                ? "bg-surface-raised text-text-primary shadow-subtle"
                                : "text-text-muted hover:text-text-primary"
                            }`}
                          >
                            Belum
                          </button>
                          <button
                            onClick={() => handleStatusChange("draft")}
                            className={`flex h-full items-center rounded-md px-3 text-xs font-medium transition-all active:scale-[0.98] ${
                              selectedItem.status === "draft"
                                ? "bg-accent-soft text-accent-ink font-semibold shadow-subtle"
                                : "text-text-muted hover:text-text-primary"
                            }`}
                          >
                            Draf
                          </button>
                          <button
                            onClick={() => handleStatusChange("final")}
                            className={`flex h-full items-center rounded-md px-3 text-xs font-medium transition-all active:scale-[0.98] ${
                              selectedItem.status === "final"
                                ? "bg-emerald-600 text-white font-semibold shadow-subtle"
                                : "text-text-muted hover:text-text-primary"
                            }`}
                          >
                            Final
                          </button>
                        </div>
                      </div>

                      {/* Tujuan Bagian Ini — Compact Callout */}
                      <div className="rounded-lg border border-surface-border bg-surface-raised px-3.5 py-2.5 shadow-subtle flex items-start gap-2.5">
                        <div className="w-1 self-stretch rounded-full bg-accent flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-0.5">
                            Tujuan Bagian Ini
                          </div>
                          <p className="text-xs text-text-primary leading-relaxed">
                            {selectedItem.requirement_text}
                          </p>
                        </div>
                      </div>

                      {/* AI Draft Response Editor */}
                      <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles size={15} className="text-accent-ink" />
                            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                              Draf Jawaban Proposal (Siap Copas)
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            {localDraftText && (
                              <span>
                                {localDraftText.split(/\s+/).filter(Boolean).length} kata · {localDraftText.length} karakter
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Textarea Editor / Markdown Preview / Empty Draft State */}
                        {!localDraftText.trim() && !selectedItem.isGenerating ? (
                          <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed border-surface-border bg-surface text-center space-y-3">
                            <div className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center text-accent-ink">
                              <Sparkles size={20} />
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-sm font-bold text-text-primary">
                                Draf untuk &ldquo;{selectedItem.title}&rdquo; belum disusun
                              </h4>
                              <p className="text-xs text-text-muted max-w-md">
                                AI akan mengintegrasikan klausul KAK/TOR, referensi terindeks, dan spesifikasi produk ke dalam jawaban teknis komprehensif.
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleStreamGenerate(selectedItem.id, customPrompt)}
                                className="bg-ink-900 hover:bg-ink-800 text-white text-xs font-semibold px-4 py-2"
                              >
                                <Sparkles size={13} className="mr-1.5" />
                                Buat Draf AI Sekarang
                              </Button>
                              {(selectedItem.title.toLowerCase().includes("hld") ||
                                selectedItem.title.toLowerCase().includes("arsitektur") ||
                                selectedItem.title.toLowerCase().includes("topologi")) && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleOpenStudio("hld")}
                                  className="text-xs font-semibold px-3 py-2 border-surface-border hover:border-accent"
                                >
                                  <ImageIcon size={13} className="mr-1.5 text-accent-ink" />
                                  Buka Studio Desain HLD & Topologi
                                </Button>
                              )}
                              <button
                                type="button"
                                onClick={() => setLocalDraftText(" ")}
                                className="text-xs text-text-muted hover:text-text-primary hover:underline px-2 py-1"
                              >
                                Ketik Manual
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {!inlineEditorOpen ? (
                              <div className="rounded-lg border border-surface-border bg-surface p-3.5 space-y-3">
                                {/* Snippet Preview with subtle fade */}
                                <div className="relative max-h-28 overflow-hidden rounded-md text-xs leading-relaxed text-text-primary">
                                  <div className="line-clamp-4 font-normal text-text-primary">
                                    {cleanDraftMarkdown(localDraftText)}
                                  </div>
                                  <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
                                </div>

                                {/* Action Buttons: Full Modal Preview & Revision vs Inline Edit */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-surface-border/60">
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      onClick={() => setPreviewingSection(selectedItem)}
                                      className="bg-ink-900 text-white hover:bg-ink-800 text-xs font-semibold h-7 px-3 flex items-center gap-1.5 shadow-2xs"
                                    >
                                      <Eye size={13} className="text-accent" />
                                      <span>Lihat Selengkapnya &amp; Review Penuh</span>
                                    </Button>
                                    <button
                                      type="button"
                                      onClick={() => setInlineEditorOpen(true)}
                                      className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded hover:bg-surface-raised transition-colors"
                                    >
                                      <Pencil size={11} />
                                      <span>Edit Teks Langsung</span>
                                    </button>
                                  </div>
                                  <span className="text-[11px] text-text-muted">
                                    {localDraftText.split(/\s+/).filter(Boolean).length} kata · {localDraftText.length} karakter
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="relative space-y-2">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-[11px] font-semibold text-text-muted">Editor Teks Langsung</span>
                                  <button
                                    type="button"
                                    onClick={() => setInlineEditorOpen(false)}
                                    className="text-[11px] text-accent-ink hover:underline font-medium"
                                  >
                                    Ciutkan Tampilan ↑
                                  </button>
                                </div>
                                {showMarkdownPreview ? (
                                  <div className="min-h-[13rem] w-full rounded-lg border border-surface-border bg-surface p-4 text-xs leading-relaxed text-text-primary animate-in fade-in duration-150">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownPreviewComponents}>
                                      {cleanLatexMath(localDraftText)}
                                    </ReactMarkdown>
                                  </div>
                                ) : (
                                  <textarea
                                    value={localDraftText}
                                    onChange={(e) => {
                                      const text = e.target.value;
                                      setLocalDraftText(text);
                                      draftDebounceRef.current.itemId = selectedItem.id;
                                      draftDebounceRef.current.text = text;
                                      if (draftDebounceRef.current.timer) clearTimeout(draftDebounceRef.current.timer);
                                      draftDebounceRef.current.timer = setTimeout(() => {
                                        handleTextChange(selectedItem.id, text);
                                        draftDebounceRef.current.timer = null;
                                        draftDebounceRef.current.itemId = null;
                                      }, 200);
                                    }}
                                    onBlur={() => {
                                      if (draftDebounceRef.current.timer) {
                                        clearTimeout(draftDebounceRef.current.timer);
                                        draftDebounceRef.current.timer = null;
                                        draftDebounceRef.current.itemId = null;
                                        handleTextChange(selectedItem.id, localDraftText);
                                      }
                                    }}
                                    placeholder="Klik 'Buat Draf AI' atau ketik langsung konten bagian proposal di sini..."
                                    rows={8}
                                    className={`w-full rounded-lg border p-4 text-xs leading-relaxed text-text-primary outline-none focus:border-accent font-sans transition-colors duration-700 resize-y ${
                                      justGeneratedId === selectedItem.id
                                        ? "border-accent bg-accent-soft/30"
                                        : "border-surface-border bg-surface"
                                    }`}
                                  />
                                )}
                                <div className="flex justify-end text-[11px] text-text-muted">
                                  {localDraftText.split(/\s+/).filter(Boolean).length} kata · {localDraftText.length} karakter
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                    {/* AI Revision & Direction Studio Card */}
                    <div className="rounded-xl border border-accent/40 bg-gradient-to-br from-accent-soft/20 via-surface to-surface-raised p-4 shadow-subtle space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles size={14} className="text-accent-ink" />
                          <span className="text-xs font-bold text-text-primary">
                            Minta Revisi / Tambah Arahan AI untuk Bab Ini
                          </span>
                        </div>
                        <span className="text-[10px] text-text-muted">
                          Ketik revisi spesifik jika draf belum sesuai
                        </span>
                      </div>

                      <div className="relative">
                        <textarea
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          rows={2}
                          placeholder="Ketik revisi yang diinginkan, misal: 'Detailkan arsitektur data pipeline Cloudera ke Tableau, tambahkan matriks tabel SLA respon 15 menit, dan perjelas pembagian tanggung jawab L1/L2'..."
                          className="w-full rounded-lg border border-surface-border bg-surface p-2.5 text-xs text-text-primary outline-none focus:border-accent resize-none placeholder:text-text-muted transition-colors"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-text-muted mr-1">Prompt Cepat:</span>
                          {[
                            "Perdalam Teknis & Komponen",
                            "Buat Format Tabel Matriks",
                            "Perketat SLA & Response Time",
                            "Sesuaikan Persyaratan KAK",
                          ].map((promptText) => (
                            <button
                              key={promptText}
                              type="button"
                              onClick={() => setCustomPrompt(promptText)}
                              className="rounded-full border border-surface-border bg-surface px-2 py-0.5 text-[10px] text-text-secondary hover:border-accent hover:text-text-primary transition-colors active:scale-[0.98]"
                            >
                              + {promptText}
                            </button>
                          ))}
                        </div>

                        <Button
                          variant="primary"
                          size="sm"
                          disabled={selectedItem.isGenerating}
                          onClick={() => handleStreamGenerate(selectedItem.id, customPrompt)}
                          className="bg-ink-900 hover:bg-ink-800 text-white text-xs font-semibold px-3.5 py-1.5 h-8 flex items-center gap-1.5 shadow-subtle shrink-0"
                        >
                          <Sparkles size={13} className="text-accent" />
                          <span>{selectedItem.isGenerating ? "Sedang Merevisi..." : "Generate Revisi AI"}</span>
                        </Button>
                      </div>
                    </div>

                    {/* Error display */}
                    {selectedItem.error && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                        {selectedItem.error}
                      </div>
                    )}
                  </div>

                  {/* Hidden file input for direct local upload into current sub-bab */}
                  <input
                    ref={hiddenSubBabFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleSubBabDirectUpload}
                  />

                  {/* Poin 1: Inline Visual Preview & Action Card */}
                  {selectedItem.image_data_url ? (() => {
                    const itemsWithImages = items.filter((it) => Boolean(it.image_data_url));
                    const figureIndex = itemsWithImages.findIndex((it) => it.id === selectedItem.id) + 1;
                    const cleanCapText = (selectedItem.image_caption || "")
                      .replace(/^(?:Gambar|Figure)\s*\d+(?:\.\d+)*\s*[:.-]?\s*/i, "")
                      .trim();

                    return (
                      <div className="rounded-xl border border-blue-200/80 bg-gradient-to-r from-blue-50/40 via-white to-indigo-50/30 p-4 shadow-subtle">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          {/* Thumbnail with click-to-zoom */}
                          <div
                            onClick={() => {
                              setPreviewModalScale(1);
                              setPreviewImageModal({
                                url: selectedItem.image_data_url!,
                                caption: `Gambar ${figureIndex}: ${cleanCapText || selectedItem.title}`,
                              });
                            }}
                            className="relative group w-36 h-24 bg-slate-900 rounded-lg overflow-hidden flex-shrink-0 cursor-zoom-in border border-slate-200 shadow-sm transition-transform hover:scale-[1.01]"
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
                              Gambar {figureIndex}
                            </span>
                          </div>

                          {/* Detail, Caption Input, & Quick Action Bar */}
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-800">
                                  Aset Visual Bagian Ini
                                </span>
                                <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-[9.5px] font-semibold border border-blue-200">
                                  ✓ Urutan Gambar {figureIndex} (Auto-Renumbering)
                                </span>
                              </div>

                              {/* Quick Action Buttons */}
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => hiddenSubBabFileInputRef.current?.click()}
                                  className="rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                                  title="Ganti dengan upload gambar dari komputer"
                                >
                                  <UploadCloud size={11} className="text-blue-600" />
                                  <span>Ganti File</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenStudio("search")}
                                  className="rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                                  title="Ganti foto dengan pencarian perangkat publik"
                                >
                                  <RefreshCw size={11} />
                                  <span>Cari Foto</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenStudio("hld")}
                                  className="rounded-md px-2.5 py-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                                  title="Buat atau edit topologi arsitektur di HLD Studio"
                                >
                                  <Layers size={11} />
                                  <span>Edit HLD</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewModalScale(1);
                                    setPreviewImageModal({
                                      url: selectedItem.image_data_url!,
                                      caption: `Gambar ${figureIndex}: ${cleanCapText || selectedItem.title}`,
                                    });
                                  }}
                                  className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                                  title="Lihat ukuran penuh"
                                >
                                  <Maximize2 size={11} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateItem(selectedItem.id, {
                                      image_data_url: undefined,
                                      image_caption: undefined,
                                    });
                                  }}
                                  className="rounded-md p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Hapus aset visual dari bab ini"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {/* Sequential Auto-Renumbering Caption */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 block">
                                  Keterangan Gambar (Caption Word & PPTX):
                                </label>
                                <span className="text-[9.5px] text-slate-400">
                                  Nomor urut otomatis disesuaikan jika gambar dihapus atau ditambah
                                </span>
                              </div>

                              <div className="flex items-center rounded-md border border-slate-300 bg-white shadow-2xs overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                                <div className="px-2.5 py-1.5 bg-slate-100 border-r border-slate-200 text-xs font-bold text-slate-700 select-none shrink-0">
                                  Gambar {figureIndex}:
                                </div>
                                <input
                                  type="text"
                                  value={cleanCapText}
                                  onChange={(e) => {
                                    updateItem(selectedItem.id, { image_caption: e.target.value });
                                  }}
                                  placeholder="Ketik deskripsi gambar (mis: Topologi Arsitektur High Level Design)..."
                                  className="w-full px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })() : (
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
                                (Opsional per Sub-Bab)
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 line-clamp-1">
                              Perkuat sub-bab ini dengan gambar sendiri, foto perangkat enterprise, atau diagram arsitektur.
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => hiddenSubBabFileInputRef.current?.click()}
                            className="rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 px-3 py-1.5 text-xs font-semibold transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <UploadCloud size={13} className="text-blue-600" />
                            <span>Upload Gambar Sendiri</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenStudio("search")}
                            className="rounded-lg bg-white border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Search size={12} className="text-slate-500" />
                            <span>Cari Foto Publik</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenStudio("hld")}
                            className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Sparkles size={12} className="text-indigo-600" />
                            <span>Buat Topologi HLD</span>
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
                          updateItem(updated.id, updated);
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
              </div>
            </>
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
                          selectItem(res.item_id);
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

      {/* Requirement Coverage & Gap Audit Modal */}
      {isCoverageModalOpen && coverageReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex w-full max-w-2xl max-h-[85vh] flex-col rounded-xl border border-surface-border bg-surface-raised shadow-panel overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">Audit Kepatuhan Kebutuhan TOR</h3>
                  <p className="text-xs text-text-muted">
                    Seberapa banyak kebutuhan dokumen acuan sudah terjawab di draf saat ini
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCoverageModalOpen(false)}
                className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Coverage score card */}
              <div className="rounded-xl border border-surface-border bg-surface p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    {coverageReport.overall_coverage_pct}% Kebutuhan TOR Terjawab
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {coverageReport.covered_count} dari {coverageReport.total_requirements} kebutuhan sudah tercakup di draf
                    {coverageReport.uncovered_count > 0 && `, ${coverageReport.uncovered_count} belum dibahas`}.
                  </p>
                </div>
                <div
                  className={`rounded-xl px-4 py-2 text-center font-bold ${
                    coverageReport.overall_coverage_pct >= 80
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : coverageReport.overall_coverage_pct >= 50
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  <div className="text-2xl font-mono leading-none">{coverageReport.overall_coverage_pct}</div>
                  <div className="text-[10px] uppercase tracking-wider mt-0.5">/ 100%</div>
                </div>
              </div>

              {/* Uncovered items */}
              {coverageReport.uncovered_items.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Belum Dibahas di Draf ({coverageReport.uncovered_items.length})
                  </h4>
                  {coverageReport.uncovered_items.map((it, i) => (
                    <div key={i} className="rounded-lg border border-amber-200/60 bg-amber-50/60 p-3 text-xs space-y-1">
                      <p className="font-semibold text-text-primary">{it.requirement}</p>
                      <p className="text-text-secondary">{it.tip}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {coverageReport.recommendations.length > 0 && (
                <div className="rounded-lg bg-accent-soft/40 border border-accent/25 p-3 text-xs text-text-primary space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-accent-ink text-[11px] uppercase tracking-wider">
                    <Sparkles size={13} /> Rekomendasi:
                  </div>
                  <ul className="list-disc list-inside space-y-1 pl-1 text-xs text-text-secondary">
                    {coverageReport.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-surface-border px-6 py-3 bg-surface flex items-center justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCoverageModalOpen(false)}
                className="bg-ink-900 text-white hover:bg-ink-800 text-xs"
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Infrastructure Sizing & BoQ Calculator — rarely used, compact modal, not part of the main flow */}
      {isSizingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised shadow-panel overflow-hidden animate-in zoom-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-surface-border px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Ruler size={16} className="text-accent-ink" />
                <h3 className="text-sm font-bold text-text-primary">📐 Sizing / BoQ Calculator</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSizingOpen(false)}
                className="rounded-md p-1 text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              {!sizingResult ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-text-primary">Platform</label>
                    <select
                      value={sizingPlatform}
                      onChange={(e) => setSizingPlatform(e.target.value as SizingCalculationRequest["platform"])}
                      className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
                    >
                      <option value="pure_storage">Pure Storage</option>
                      <option value="sangfor_hci">Sangfor HCI</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-text-primary">Usable Capacity (TB)</label>
                    <input
                      type="number"
                      min={1}
                      value={sizingCapacityTb}
                      onChange={(e) => setSizingCapacityTb(e.target.value)}
                      placeholder="mis. 100"
                      className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-text-primary">Workload</label>
                    <select
                      value={sizingWorkload}
                      onChange={(e) =>
                        setSizingWorkload(e.target.value as NonNullable<SizingCalculationRequest["target_workload"]>)
                      }
                      className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
                    >
                      <option value="general_virtualization">General Virtualization</option>
                      <option value="database">Database</option>
                      <option value="vdi">VDI</option>
                    </select>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleCalculateSizing}
                    disabled={!sizingCapacityTb || calculatingSizing}
                    className="w-full justify-center bg-ink-900 text-white hover:bg-ink-800 text-xs"
                  >
                    {calculatingSizing ? (
                      <>
                        <Loader2 size={13} className="mr-1.5 animate-spin" /> Menghitung...
                      </>
                    ) : (
                      "Calculate Sizing & BoQ"
                    )}
                  </Button>
                </>
              ) : (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-150">
                  <div className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-ink">
                      Model Rekomendasi
                    </p>
                    <p className="text-sm font-bold text-text-primary">{sizingResult.recommended_model}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="rounded-md border border-surface-border bg-surface p-2">
                      <p className="text-text-muted">Target</p>
                      <p className="font-mono font-bold text-text-primary">{sizingResult.metrics.target_usable_tb} TB</p>
                    </div>
                    <div className="rounded-md border border-surface-border bg-surface p-2">
                      <p className="text-text-muted">Planned</p>
                      <p className="font-mono font-bold text-text-primary">{sizingResult.metrics.planned_usable_tb} TB</p>
                    </div>
                    <div className="rounded-md border border-surface-border bg-surface p-2">
                      <p className="text-text-muted">Effective</p>
                      <p className="font-mono font-bold text-text-primary">
                        {sizingResult.metrics.effective_capacity_tb ?? "—"} TB
                      </p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-text-secondary">{sizingResult.executive_summary}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSizingResult(null)}
                      className="flex-1 justify-center border-surface-border text-xs"
                    >
                      Hitung Ulang
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleInsertBoqToDraft}
                      disabled={!selectedItem}
                      title={!selectedItem ? "Pilih sub-bab dulu di workspace" : undefined}
                      className="flex-1 justify-center bg-ink-900 text-white hover:bg-ink-800 text-xs"
                    >
                      Insert BoQ to Draft
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Tour Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />

      {/* Full-resolution Image Lightbox Modal with React Portal and Zoom Controls */}
      {previewImageModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/85 p-3 sm:p-6 backdrop-blur-md animate-in fade-in duration-150 select-none overflow-hidden"
          onClick={() => setPreviewImageModal(null)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[92vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 bg-slate-950 border-b border-slate-800 text-white">
              <div className="flex items-center gap-2 truncate pr-4">
                <span className="text-xs font-semibold truncate">
                  {previewImageModal.caption || "Pratinjau Visual Perangkat / Topologi"}
                </span>
                <span className="text-[10px] bg-blue-900/60 text-blue-300 px-1.5 py-0.5 rounded border border-blue-700 font-mono">
                  Word & PPTX Preview
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewModalScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))))}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors font-medium cursor-pointer"
                  title="Perkecil (-)"
                >
                  − Zoom
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModalScale(1)}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors font-medium font-mono cursor-pointer"
                  title="Pas Layar (100%)"
                >
                  Fit 100%
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModalScale((s) => Math.min(2.5, Number((s + 0.25).toFixed(2))))}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors font-medium cursor-pointer"
                  title="Perbesar (+)"
                >
                  + Zoom
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewImageModal(null)}
                  className="ml-2 px-3 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-md transition-colors cursor-pointer"
                >
                  ✕ Tutup
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-slate-950/60">
              <div className="relative flex items-center justify-center max-h-[70vh] max-w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewImageModal.url}
                  alt={previewImageModal.caption}
                  style={{
                    transform: `scale(${previewModalScale})`,
                    transformOrigin: "center center",
                    maxHeight: "68vh",
                    maxWidth: "100%",
                  }}
                  className="w-auto h-auto object-contain rounded shadow-lg transition-transform duration-150 block mx-auto"
                />
              </div>
            </div>

            <div className="px-5 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="text-[11px] truncate max-w-lg font-medium">
                {previewImageModal.caption}
              </span>
              <div className="flex items-center gap-3">
                <a
                  href={previewImageModal.url}
                  download="visual-asset.png"
                  className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 font-semibold"
                >
                  ⬇️ Unduh File Resolusi Asli
                </a>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Eye Preview Modal Portal for Sub-Bab (Point 3) */}
      {/* Eye Preview Modal Portal for Sub-Bab with Live AI Revision Studio (Poin 5) */}
      {previewingSection && typeof document !== "undefined" && (() => {
        const liveSection = items.find((i) => i.id === previewingSection.id) || previewingSection;
        return createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div
              className="fixed inset-0"
              onClick={() => setPreviewingSection(null)}
            />
            <div className="relative z-10 flex flex-col w-full max-w-3xl max-h-[90vh] rounded-xl border border-surface-border bg-surface-raised shadow-panel overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-surface-border px-5 py-3.5 bg-surface">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink text-xs font-bold">
                    <Eye size={15} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-text-primary truncate">
                      {liveSection.title}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-text-muted">
                      <span className="font-mono">{liveSection.id.toUpperCase()}</span>
                      <span>·</span>
                      <span>{liveSection.category}</span>
                      {liveSection.isGenerating && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 text-accent-ink font-semibold animate-pulse">
                            <Loader2 size={11} className="animate-spin" /> Sedang Streaming AI...
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewingSection(null)}
                  className="rounded-lg p-1.5 text-text-muted hover:bg-surface-raised hover:text-text-primary transition-colors cursor-pointer"
                  title="Tutup (Esc)"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-text-primary">
                {/* Interactive AI Revision Input Card inside Modal */}
                <div className="rounded-xl border border-accent/40 bg-accent-soft/25 p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                      <Sparkles size={13} className="text-accent-ink" /> Minta Revisi AI untuk Bab Ini
                    </span>
                    {liveSection.isGenerating && (
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-accent-ink">
                        <Loader2 size={12} className="animate-spin" /> Menulis revisi langsung...
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={modalRevisionPrompt}
                      onChange={(e) => setModalRevisionPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && modalRevisionPrompt.trim() && !liveSection.isGenerating) {
                          e.preventDefault();
                          handleStreamGenerate(liveSection.id, modalRevisionPrompt);
                          setModalRevisionPrompt("");
                        }
                      }}
                      placeholder="Instruksi revisi, misal: 'Tambahkan tabel matriks SLA dan rincian garansi 3 tahun'..."
                      disabled={liveSection.isGenerating}
                      className="flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs text-text-primary outline-none focus:border-accent transition-colors disabled:opacity-60"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!modalRevisionPrompt.trim() || liveSection.isGenerating}
                      onClick={() => {
                        handleStreamGenerate(liveSection.id, modalRevisionPrompt);
                        setModalRevisionPrompt("");
                      }}
                      className="shrink-0 bg-ink-900 text-white hover:bg-ink-800 text-xs font-semibold h-8 px-3.5 flex items-center gap-1.5"
                    >
                      {liveSection.isGenerating ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                      <span>Revisi AI</span>
                    </Button>
                  </div>

                  {/* Quick revision pills */}
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    <span className="text-[10px] text-text-muted mr-1">Revisi Cepat:</span>
                    {[
                      "Perdalam Teknis & Komponen",
                      "Buat Format Tabel Matriks",
                      "Perjelas SLA & Garansi",
                      "Gaya Bahasa Formal BUMN",
                      "Ringkas & Padat",
                    ].map((pill) => (
                      <button
                        key={pill}
                        type="button"
                        disabled={liveSection.isGenerating}
                        onClick={() => {
                          handleStreamGenerate(liveSection.id, pill);
                        }}
                        className="rounded-full border border-surface-border bg-surface px-2 py-0.5 text-[10px] text-text-secondary hover:border-accent hover:text-text-primary hover:bg-accent-soft/40 transition-colors disabled:opacity-50"
                      >
                        + {pill}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tujuan Bagian Ini */}
                <div className="rounded-lg border border-surface-border bg-surface p-3.5 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Tujuan &amp; Ruang Lingkup Bagian Ini
                  </span>
                  <p className="text-xs text-text-primary leading-relaxed">
                    {liveSection.requirement_text}
                  </p>
                </div>

                {/* Draf Isi Proposal */}
                <div className="rounded-lg border border-surface-border bg-surface p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                      <Sparkles size={12} className="text-accent-ink" /> Hasil Draf Proposal (Live Update)
                    </span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      liveSection.status === "final"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : liveSection.status === "draft"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}>
                      Status: {liveSection.status.toUpperCase()}
                    </span>
                  </div>

                  {liveSection.draft_text ? (
                    <div className="prose prose-xs max-w-none text-text-primary font-normal leading-relaxed overflow-x-auto">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownPreviewComponents}
                      >
                        {cleanDraftMarkdown(liveSection.draft_text)}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-text-muted italic bg-surface-raised/50 rounded border border-dashed border-surface-border space-y-2">
                      <p>Draf untuk bagian ini belum digenerate oleh AI.</p>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleStreamGenerate(liveSection.id, customPrompt)}
                        className="bg-ink-900 text-white hover:bg-ink-800 text-xs font-semibold px-3 py-1.5"
                      >
                        <Sparkles size={12} className="mr-1.5" />
                        Buat Draf Sekarang
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between border-t border-surface-border px-5 py-3 bg-surface">
                <span className="text-[11px] text-text-muted">
                  {liveSection.draft_text ? `${liveSection.draft_text.split(/\s+/).filter(Boolean).length} kata · ` : ""}
                  {liveSection.sources?.length ? `${liveSection.sources.length} sumber grounding` : "Belum ada grounding"}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPreviewingSection(null)}
                    className="text-xs h-8 px-3"
                  >
                    Selesai / Tutup
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      selectItem(liveSection.id);
                      setPreviewingSection(null);
                    }}
                    className="bg-ink-900 text-white hover:bg-ink-800 text-xs font-semibold h-8 px-3.5 shadow-subtle flex items-center gap-1.5"
                  >
                    <Pencil size={12} className="text-accent" />
                    Buka &amp; Edit di Studio
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
