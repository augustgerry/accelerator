"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/topbar";
import {
  Search,
  Sparkles,
  FileEdit,
  FileText,
  Loader2,
  ArrowRight,
  BookOpen,
  X,
  ChevronRight,
  SlidersHorizontal,
  History,
  Bookmark,
  BookmarkCheck,
  Copy,
  Check,
} from "lucide-react";
import { searchKnowledgeBase, type SearchResult } from "@/lib/api";
import { CitationDrawer } from "@/components/search/citation-drawer";
import { HighlightedText } from "@/components/search/highlighted-text";
import { AnswerWithCitations } from "@/components/search/answer-with-citations";

const LS_HISTORY_KEY = "synapse-search-history";
const LS_BOOKMARKS_KEY = "synapse-search-bookmarks";

type BookmarkEntry = { question: string; answer: string; savedAt: string };

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function loadBookmarks(): BookmarkEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LS_BOOKMARKS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

const SUGGESTED_QUERIES = [
  "SLA response time teknisi on-site SMBC",
  "Checklist sizing HCI Sangfor 3 node",
  "RPO RTO skema Disaster Recovery",
  "Spesifikasi storage proposal CSUL Finance",
  "Sertifikasi Project Manager implementasi DC",
];

const DOC_TYPE_COLORS: Record<string, string> = {
  checklist: "bg-blue-50 border-blue-200 text-blue-700",
  TOR: "bg-purple-50 border-purple-200 text-purple-700",
  SoW: "bg-orange-50 border-orange-200 text-orange-700",
  TCO: "bg-emerald-50 border-emerald-200 text-emerald-700",
  deck: "bg-pink-50 border-pink-200 text-pink-700",
  other: "bg-surface border-surface-border text-text-muted",
};

type ConversationMessage = { role: "user" | "assistant"; content: string };

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChunkIdx, setSelectedChunkIdx] = useState<number | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [answerCopied, setAnswerCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(loadHistory());
    setBookmarks(loadBookmarks());
  }, []);

  const isBookmarked = !!result && bookmarks.some((b) => b.question === query);

  const toggleBookmark = () => {
    if (!result) return;
    const existing = loadBookmarks();
    const already = existing.some((b) => b.question === query);
    const updated = already
      ? existing.filter((b) => b.question !== query)
      : [{ question: query, answer: result.answer, savedAt: new Date().toISOString() }, ...existing].slice(0, 20);
    localStorage.setItem(LS_BOOKMARKS_KEY, JSON.stringify(updated));
    setBookmarks(updated);
  };

  const copyAnswer = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.answer);
    setAnswerCopied(true);
    setTimeout(() => setAnswerCopied(false), 2000);
  };

  const doSearch = async (q: string, nextDocType = docTypeFilter, nextDivision = divisionFilter) => {
    if (!q.trim()) return;
    const previousConversation = conversation.slice(-6);
    setConversation((previous) => [...previous, { role: "user", content: q } as ConversationMessage].slice(-8));
    setQuery(q);
    setInputValue(q);
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedChunkIdx(null);
    router.replace(`/search?q=${encodeURIComponent(q)}`, { scroll: false });

    // Persist to search history (max 10, no duplicates)
    try {
      const existing = loadHistory();
      const updated = [q, ...existing.filter((h) => h !== q)].slice(0, 10);
      localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updated));
      setHistory(updated);
    } catch { /* private mode */ }

    try {
      const res = await searchKnowledgeBase(q, { docType: nextDocType, division: nextDivision }, previousConversation);
      setResult(res);
      setConversation((previous) => [...previous, { role: "assistant", content: res.answer } as ConversationMessage].slice(-8));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pencarian gagal. Pastikan server API aktif.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      doSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(inputValue);
  };

  const handleFilterChange = (kind: "docType" | "division", value: string) => {
    if (kind === "docType") {
      setDocTypeFilter(value);
      if (query) doSearch(query, value, divisionFilter);
    } else {
      setDivisionFilter(value);
      if (query) doSearch(query, docTypeFilter, value);
    }
  };

  const selectedChunk = result && selectedChunkIdx !== null ? result.sources[selectedChunkIdx] : null;

  const createDocumentFromAnswer = () => {
    if (!result) return;
    sessionStorage.setItem("synapse-search-brief", JSON.stringify({
      question: query,
      answer: result.answer,
    }));
    router.push("/draft");
  };

  return (
    <div className="flex h-screen flex-col bg-surface font-sans text-text-primary">
      <Topbar
        title="Pencarian Presales Knowledge Base"
        subtitle="Cari arsip dokumen internal dengan AI synthesis — Glean Model"
      />

      {/* ── Search Bar ─────────────────────────────────────────────────────── */}
      <div className="border-b border-surface-border bg-surface-raised px-6 py-3">
        <form onSubmit={handleSubmit} className="flex max-w-3xl items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Tanya seputar proposal, SLA, spesifikasi, arsip dokumen..."
              className="w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-10 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => { setInputValue(""); inputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !inputValue.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Cari
          </button>
        </form>

          <div className="mt-2 flex max-w-3xl flex-wrap items-center gap-2">
            <SlidersHorizontal size={13} className="text-text-muted" />
            <select
              value={docTypeFilter}
              onChange={(e) => handleFilterChange("docType", e.target.value)}
              className="rounded-md border border-surface-border bg-surface px-2 py-1.5 text-[11px] text-text-secondary outline-none focus:border-accent"
            >
              <option value="">Semua jenis dokumen</option>
              <option value="document">Dokumen</option>
              <option value="template">Template</option>
            </select>
            <select
              value={divisionFilter}
              onChange={(e) => handleFilterChange("division", e.target.value)}
              className="rounded-md border border-surface-border bg-surface px-2 py-1.5 text-[11px] text-text-secondary outline-none focus:border-accent"
            >
              <option value="">Semua divisi</option>
              <option value="presales">Presales</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="security">Security</option>
              <option value="application">Application</option>
            </select>
            {(docTypeFilter || divisionFilter) && (
              <button
                onClick={() => { setDocTypeFilter(""); setDivisionFilter(""); if (query) doSearch(query, "", ""); }}
                className="text-[11px] font-medium text-secondary hover:underline"
              >
                Reset filter
              </button>
            )}
          </div>

        {/* Search history */}
        {!query && history.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <History size={12} className="text-text-muted" />
            {history.slice(0, 6).map((h, i) => (
              <span
                key={i}
                className="group flex items-center gap-1 rounded-full border border-surface-border bg-surface pl-3 pr-1.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent-ink transition-colors"
              >
                <button onClick={() => doSearch(h)} className="max-w-[220px] truncate">
                  {h}
                </button>
                <button
                  onClick={() => {
                    const updated = history.filter((item) => item !== h);
                    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updated));
                    setHistory(updated);
                  }}
                  className="rounded-full p-0.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Bookmarks */}
        {!query && bookmarks.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Bookmark size={12} className="text-text-muted" />
            {bookmarks.slice(0, 6).map((b, i) => (
              <span
                key={i}
                className="group flex items-center gap-1 rounded-full border border-secondary/40 bg-secondary-soft pl-3 pr-1.5 py-1 text-xs text-secondary hover:border-secondary transition-colors"
              >
                <button onClick={() => doSearch(b.question)} className="max-w-[220px] truncate">
                  {b.question}
                </button>
                <button
                  onClick={() => {
                    const updated = bookmarks.filter((item) => item.question !== b.question);
                    localStorage.setItem(LS_BOOKMARKS_KEY, JSON.stringify(updated));
                    setBookmarks(updated);
                  }}
                  className="rounded-full p-0.5 text-secondary opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Quick chips */}
        {!query && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {SUGGESTED_QUERIES.map((chip, i) => (
              <button
                key={i}
                onClick={() => doSearch(chip)}
                className="rounded-full border border-surface-border bg-surface px-3 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent-ink transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Document Citation Cards */}
        <div className="flex w-[420px] shrink-0 flex-col border-r border-surface-border bg-surface-raised overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center p-10 gap-3 text-text-muted">
              <Loader2 size={28} className="animate-spin text-accent-ink" />
              <p className="text-xs text-center">Mencari di seluruh arsip dokumen presales...</p>
            </div>
          )}

          {error && (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && result && (
            <>
              <div className="sticky top-0 z-10 border-b border-surface-border bg-surface-raised px-4 py-2.5">
                <p className="text-xs text-text-muted">
                  <span className="font-semibold text-text-primary">{result.sources.length}</span> kutipan ditemukan untuk:
                  <span className="ml-1 font-medium text-accent-ink">"{query}"</span>
                </p>
              </div>
              {result.sources.map((src, idx) => (
                <div
                  key={`${src.id}-${idx}`}
                  onClick={() => setSelectedChunkIdx(idx)}
                  className={`cursor-pointer border-b border-surface-border p-4 transition-all ${
                    selectedChunkIdx === idx
                      ? "bg-accent-soft/50 border-l-4 border-l-accent"
                      : "hover:bg-surface/60 border-l-4 border-l-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText size={13} className="text-secondary shrink-0" />
                      <span className="shrink-0 rounded bg-surface px-1 text-[10px] font-bold text-accent-ink">[{idx + 1}]</span>
                      <span className="text-xs font-semibold text-text-primary truncate">{src.title}</span>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold border rounded px-1.5 py-0.5 ${
                      DOC_TYPE_COLORS[src.docType] ?? DOC_TYPE_COLORS.other
                    }`}>
                      {src.docType}
                    </span>
                  </div>
                  {src.division && (
                    <span className="inline-block text-[10px] font-medium text-secondary bg-secondary-soft rounded px-1.5 py-0.5 mb-1.5">
                      {src.division}
                    </span>
                  )}
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Relevansi {src.confidence}%
                    </span>
                    {src.matched_terms.slice(0, 3).map((term) => (
                      <span key={term} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-text-muted">
                        match: {term}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-text-muted line-clamp-3">
                    <HighlightedText text={src.chunk_text} query={query} />
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-accent-ink font-medium">
                    <span>Lihat detail</span>
                    <ChevronRight size={10} />
                  </div>
                </div>
              ))}
            </>
          )}

          {!loading && !error && !result && (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center gap-3">
              <BookOpen size={36} className="text-text-muted/50" />
              <p className="text-sm font-medium text-text-primary">Mulai pencarian di atas</p>
              <p className="text-xs text-text-muted max-w-xs">
                Ketik pertanyaan atau topik untuk mencari di seluruh arsip proposal, checklist, TOR, dan dokumen presales internal.
              </p>
            </div>
          )}
        </div>

        {/* RIGHT: AI Synthesized Answer */}
        <div className="flex flex-1 flex-col overflow-y-auto bg-surface p-6 lg:p-8">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
                <Sparkles size={24} className="animate-pulse" />
              </div>
              <p className="text-sm font-medium text-text-primary">AI sedang merangkum jawaban...</p>
              <p className="text-xs text-text-muted">Menganalisis {SUGGESTED_QUERIES.length}+ ribu chunk dokumen</p>
            </div>
          )}

          {!loading && result && (
            <div className="max-w-3xl mx-auto w-full space-y-5">
              {conversation.length > 2 && (
                <div className="rounded-lg border border-surface-border bg-surface px-4 py-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">Percakapan aktif</p>
                  <div className="space-y-2">
                    {conversation.slice(0, -1).map((message, index) => (
                      <div key={`${message.role}-${index}`} className={`text-xs ${message.role === "user" ? "text-text-primary" : "text-text-muted"}`}>
                        <span className="mr-1 font-semibold">{message.role === "user" ? "Anda:" : "Synapse:"}</span>{message.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Answer Card */}
              <div className="rounded-xl border border-surface-border bg-surface-raised p-6 shadow-subtle">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-text-primary">AI Synthesized Answer</span>
                    <p className="text-[11px] text-text-muted">Berdasarkan {result.sources_used} chunk dokumen internal terindeks</p>
                  </div>
                </div>
                <div className="rounded-lg border-l-4 border-accent bg-surface p-4">
                  <p className="text-sm leading-relaxed text-text-primary whitespace-pre-wrap">
                    <AnswerWithCitations
                      text={result.answer}
                      sourceCount={result.sources.length}
                      onCitationClick={(idx) => setSelectedChunkIdx(idx)}
                    />
                  </p>
                </div>
                {result.sources.length === 0 && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                    Tidak ditemukan dokumen relevan di knowledge base — jawaban di atas bersifat umum, bukan hasil grounding dokumen internal.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={createDocumentFromAnswer}
                    className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-surface px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-accent hover:bg-accent-soft"
                  >
                    <FileEdit size={14} className="text-accent-ink" />
                    Buat dokumen dari jawaban
                  </button>
                  <button
                    onClick={copyAnswer}
                    className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-surface px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-accent hover:bg-accent-soft"
                  >
                    {answerCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    {answerCopied ? "Tersalin!" : "Salin Jawaban"}
                  </button>
                  <button
                    onClick={toggleBookmark}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                      isBookmarked
                        ? "border-secondary bg-secondary-soft text-secondary"
                        : "border-surface-border bg-surface text-text-primary hover:border-accent hover:bg-accent-soft"
                    }`}
                  >
                    {isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                    {isBookmarked ? "Tersimpan" : "Bookmark"}
                  </button>
                </div>
              </div>

              {/* Source list summary */}
              {result.sources.length > 0 && (
                <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-subtle">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">
                    Dokumen Referensi ({result.sources.length} kutipan)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {result.sources.map((src, idx) => (
                      <button
                        key={`${src.id}-${idx}`}
                        onClick={() => setSelectedChunkIdx(idx)}
                        className={`flex items-center justify-between rounded-lg border p-2.5 text-left transition-all ${
                          selectedChunkIdx === idx
                            ? "border-accent bg-accent-soft/30"
                            : "border-surface-border bg-surface hover:border-secondary"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 text-[10px] font-bold text-accent-ink">[{idx + 1}]</span>
                          <FileText size={13} className="text-secondary shrink-0" />
                          <span className="text-xs text-text-primary truncate">{src.title}</span>
                        </div>
                        <ArrowRight size={12} className="text-text-muted shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && !result && !error && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
                <Sparkles size={28} />
              </div>
              <div className="text-center max-w-sm">
                <h3 className="text-base font-bold text-text-primary">AI Knowledge Search</h3>
                <p className="mt-1 text-xs text-text-muted leading-relaxed">
                  Masukkan pertanyaan dan AI akan merangkum jawaban dari seluruh arsip dokumen presales internal, lengkap dengan kutipan sumber yang dapat diverifikasi.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 w-full max-w-md">
                {SUGGESTED_QUERIES.slice(0, 4).map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => doSearch(chip)}
                    className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-raised p-3 text-left text-xs text-text-secondary hover:border-accent hover:text-accent-ink transition-all"
                  >
                    <Search size={12} className="shrink-0" />
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <CitationDrawer
        chunk={selectedChunk}
        index={selectedChunkIdx ?? 0}
        total={result?.sources.length ?? 0}
        query={query}
        onClose={() => setSelectedChunkIdx(null)}
        onNavigate={(nextIndex) => setSelectedChunkIdx(nextIndex)}
      />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Memuat pencarian...</div>}>
      <SearchContent />
    </Suspense>
  );
}
