"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/topbar";
import {
  Search,
  Sparkles,
  FileText,
  Loader2,
  ArrowRight,
  BookOpen,
  X,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { searchKnowledgeBase, type SearchResult } from "@/lib/api";

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

function highlightKeywords(text: string, query: string): string {
  if (!query.trim()) return text;
  const words = query.trim().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return text;
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.replace(pattern, "**$1**");
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const highlighted = highlightKeywords(text, query);
  const parts = highlighted.split(/\*\*(.*?)\*\*/g);
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-accent-soft text-accent-ink rounded px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

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
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = async (q: string, nextDocType = docTypeFilter, nextDivision = divisionFilter) => {
    if (!q.trim()) return;
    setQuery(q);
    setInputValue(q);
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedChunkIdx(null);
    router.replace(`/search?q=${encodeURIComponent(q)}`, { scroll: false });

    // Persist to search history (max 10, no duplicates)
    try {
      const LS_HISTORY_KEY = "synapse-search-history";
      const existing: string[] = JSON.parse(localStorage.getItem(LS_HISTORY_KEY) ?? "[]");
      const updated = [q, ...existing.filter((h) => h !== q)].slice(0, 10);
      localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updated));
    } catch { /* private mode */ }

    try {
      const res = await searchKnowledgeBase(q, { docType: nextDocType, division: nextDivision });
      setResult(res);
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
                  onClick={() => setSelectedChunkIdx(selectedChunkIdx === idx ? null : idx)}
                  className={`cursor-pointer border-b border-surface-border p-4 transition-all ${
                    selectedChunkIdx === idx
                      ? "bg-accent-soft/50 border-l-4 border-l-accent"
                      : "hover:bg-surface/60 border-l-4 border-l-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText size={13} className="text-secondary shrink-0" />
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
                    <span>{selectedChunkIdx === idx ? "Tutup" : "Lihat lengkap"}</span>
                    <ChevronRight size={10} className={`transition-transform ${selectedChunkIdx === idx ? "rotate-90" : ""}`} />
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
                    {result.answer}
                  </p>
                </div>
              </div>

              {/* Selected chunk detail */}
              {selectedChunk && (
                <div className="rounded-xl border border-accent/40 bg-accent-soft/20 p-5 shadow-subtle">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-accent-ink" />
                      <span className="text-sm font-bold text-text-primary">{selectedChunk.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedChunk.division && (
                        <span className="text-[10px] font-semibold text-secondary bg-secondary-soft rounded px-1.5 py-0.5">
                          {selectedChunk.division}
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold border rounded px-1.5 py-0.5 ${
                        DOC_TYPE_COLORS[selectedChunk.docType] ?? DOC_TYPE_COLORS.other
                      }`}>
                        {selectedChunk.docType}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface border border-surface-border p-4">
                    <p className="text-xs leading-relaxed text-text-primary whitespace-pre-wrap">
                      <HighlightedText text={selectedChunk.chunk_text} query={query} />
                    </p>
                  </div>
                </div>
              )}

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
                        onClick={() => setSelectedChunkIdx(selectedChunkIdx === idx ? null : idx)}
                        className={`flex items-center justify-between rounded-lg border p-2.5 text-left transition-all ${
                          selectedChunkIdx === idx
                            ? "border-accent bg-accent-soft/30"
                            : "border-surface-border bg-surface hover:border-secondary"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
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
