"use client";

import { useState, useEffect } from "react";
import { Sparkles, Send, FileText, Globe, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";
import { askKnowledgeBase, researchExternal } from "@/lib/api";

type Mode = "qa" | "draft" | "research";

const modeCopy: Record<Mode, { title: string; subtitle: string }> = {
  qa: {
    title: "Tanya Knowledge Base",
    subtitle: "Jawaban dari dokumen internal, disertai sumber",
  },
  draft: {
    title: "Draft Assistant",
    subtitle: "Grounded pada TOR yang diupload + knowledge base",
  },
  research: {
    title: "Riset Eksternal",
    subtitle: "Sumber: web publik real-time · biaya per pencarian berlaku",
  },
};

const suggestedByMode: Record<Mode, string[]> = {
  qa: [
    "Checklist migrasi VMware ke Sangfor versi terakhir apa?",
    "Ada referensi TCO HCI buat sektor perbankan?",
    "Siapa yang pernah pegang proposal storage buat manufaktur?",
  ],
  draft: [
    "Buatkan draf klausul SLA berdasarkan TOR ini",
    "Rangkum requirement PM & CM dari dokumen ini",
    "Bandingkan spesifikasi teknis dengan checklist internal kita",
  ],
  research: [
    "Ringkas lini produk data center Sangfor terbaru",
    "Berita terbaru soal SMBC Indonesia tahun ini",
    "Bandingkan positioning Pure Storage vs NetApp saat ini",
  ],
};

export function AiPanel({
  mode: initialMode,
  messages: initialMessages,
  allowModeSwitch = false,
  initialQuery = "",
}: {
  mode: Mode;
  messages: ChatMessage[];
  allowModeSwitch?: boolean;
  initialQuery?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState(initialQuery || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendWithQuery = async (queryText: string) => {
    if (!queryText.trim() || loading) return;
    const question = queryText.trim();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      mode,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const reply =
        mode === "research"
          ? await researchExternal(question)
          : await askKnowledgeBase(question);
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal menghubungi backend. Pastikan API server jalan."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => handleSendWithQuery(input);

  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      handleSendWithQuery(initialQuery);
    }
  }, [initialQuery]);

  return (
    <div className="flex h-full w-[380px] flex-col border-l border-surface-border bg-surface-raised">
      <div className="border-b border-surface-border px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft">
            {mode === "research" ? (
              <Globe size={14} className="text-accent-ink" />
            ) : (
              <Sparkles size={14} className="text-accent-ink" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {modeCopy[mode].title}
            </p>
            <p className="text-[11px] text-text-muted">{modeCopy[mode].subtitle}</p>
          </div>
        </div>

        {allowModeSwitch && (
          <div className="mt-3 flex rounded-md border border-surface-border p-0.5">
            {(["qa", "research"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 rounded-sm border-b-2 py-1.5 text-xs font-medium transition-colors",
                  mode === m
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-secondary hover:bg-surface"
                )}
              >
                {m === "qa" ? "Internal" : "Riset Eksternal"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="rounded-md border border-dashed border-surface-border p-4 text-sm text-text-secondary">
            {mode === "research"
              ? "Tanyakan info publik terkini — produk vendor, berita perusahaan, dll. Jawaban akan disertai link sumber."
              : "Halo, saya asisten knowledge base. Silakan tanyakan apa saja dari dokumen yang sudah diindeks."}
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "rounded-md px-3.5 py-3 text-sm leading-relaxed",
              m.role === "user"
                ? "ml-6 bg-ink-950 text-white"
                : "mr-2 border border-surface-border bg-surface"
            )}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-2.5 space-y-1 border-t border-surface-border pt-2.5">
                {m.citations.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-center gap-1.5 text-xs",
                      c.source === "external" ? "text-text-secondary" : "text-secondary"
                    )}
                  >
                    {c.source === "external" ? (
                      <Globe size={12} />
                    ) : (
                      <FileText size={12} />
                    )}
                    <span className="truncate">{c.title}</span>
                    {c.division && <span className="text-text-muted">· {c.division}</span>}
                    {c.source === "external" && (
                      <span className="text-text-muted">· web publik</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="mr-2 flex items-center gap-2 rounded-md border border-surface-border bg-surface px-3.5 py-3 text-sm text-text-muted">
            <Loader2 size={14} className="animate-spin" />
            {mode === "research" ? "Mencari di web..." : "Mencari di knowledge base..."}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-surface-border px-4 py-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
          Rekomendasi pertanyaan
        </p>
        <div className="mb-3 space-y-1.5">
          {suggestedByMode[mode].map((q) => (
            <button
              key={q}
              onClick={() => setInput(q)}
              className="block w-full rounded-md border border-surface-border px-3 py-1.5 text-left text-xs text-text-secondary hover:border-secondary hover:text-secondary"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-md border border-surface-border bg-surface px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={
              mode === "qa"
                ? "Tanyakan sesuatu..."
                : mode === "research"
                ? "Tanyakan info publik terkini..."
                : "Minta draf, ringkasan, atau perbandingan..."
            }
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="rounded-sm bg-ink-900 p-1.5 text-white hover:bg-ink-800 disabled:opacity-50"
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
