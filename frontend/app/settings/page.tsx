"use client";

import { useState, useEffect } from "react";
import { Topbar } from "@/components/topbar";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Globe,
  Bot,
  Sparkles,
  Check,
  Key,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  Database,
  FolderSync,
  Info,
  Palette,
} from "lucide-react";
import { syncDocuments } from "@/lib/api";

type LLMProvider = "claude" | "gemini" | "openai";

const PROVIDER_INFO: Record<LLMProvider, { label: string; model: string; note: string; color: string }> = {
  claude: {
    label: "Claude (Anthropic)",
    model: "claude-sonnet-5",
    note: "Terbaik untuk drafting teknis panjang. Biaya ~$3/1M input token.",
    color: "bg-orange-50 border-orange-200 text-orange-700",
  },
  gemini: {
    label: "Gemini (Google)",
    model: "gemini-1.5-flash",
    note: "Cepat & hemat. Cocok untuk segmentasi TOR dan Q&A cepat.",
    color: "bg-blue-50 border-blue-200 text-blue-700",
  },
  openai: {
    label: "OpenAI (GPT)",
    model: "gpt-4o",
    note: "Belum diimplementasi di backend. Coming soon.",
    color: "bg-surface border-surface-border text-text-muted",
  },
};

const LS_PROVIDER_KEY = "synapse-llm-provider";
const LS_HISTORY_KEY = "synapse-search-history";
const LS_BRANDING_KEY = "synapse-corporate-branding";

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

export default function SettingsPage() {
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [provider, setProvider] = useState<LLMProvider>("gemini");
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savedProvider, setSavedProvider] = useState<LLMProvider | null>(null);
  const [providerSaved, setProviderSaved] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [branding, setBranding] = useState<CorporateBranding>(DEFAULT_BRANDING);
  const [brandingSaved, setBrandingSaved] = useState(false);

  const handleLogoUpload = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 1_500_000) {
      alert("Logo harus berupa PNG/JPG/WebP maksimal 1,5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setBranding((current) => ({ ...current, logoDataUrl: String(reader.result ?? "") }));
    reader.readAsDataURL(file);
  };

  // Load from localStorage
  useEffect(() => {
    try {
      const p = localStorage.getItem(LS_PROVIDER_KEY) as LLMProvider | null;
      if (p && PROVIDER_INFO[p]) {
        setProvider(p);
        setSavedProvider(p);
      }
      const h = localStorage.getItem(LS_HISTORY_KEY);
      if (h) setSearchHistory(JSON.parse(h));
      const b = localStorage.getItem(LS_BRANDING_KEY);
      if (b) setBranding({ ...DEFAULT_BRANDING, ...JSON.parse(b) });
    } catch {}
  }, []);

  const handleSaveBranding = () => {
    try {
      localStorage.setItem(LS_BRANDING_KEY, JSON.stringify(branding));
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 2000);
    } catch {}
  };

  const handleSaveProvider = () => {
    try {
      localStorage.setItem(LS_PROVIDER_KEY, provider);
      if (apiKey.trim()) {
        localStorage.setItem(`synapse-apikey-${provider}`, apiKey.trim());
      }
      setSavedProvider(provider);
      setProviderSaved(true);
      setTimeout(() => setProviderSaved(false), 2000);
    } catch {}
  };

  const handleClearHistory = () => {
    try {
      localStorage.removeItem(LS_HISTORY_KEY);
      setSearchHistory([]);
    } catch {}
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncDocuments();
      setSyncResult(`✅ Sync selesai: ${result.synced.length} dokumen baru, ${result.skipped.length} dilewati.`);
    } catch (e) {
      setSyncResult(`❌ Sync gagal: ${e instanceof Error ? e.message : "Error tidak diketahui"}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface font-sans">
      <Topbar title="Pengaturan" subtitle="Konfigurasi AI provider, Google Drive sync, dan preferensi aplikasi" />

      <div className="mx-auto w-full max-w-4xl p-6 space-y-5">

        {/* ── LLM Provider Selector ──────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="LLM Provider"
            eyebrow="AI Engine"
            action={
              savedProvider ? (
                <Badge tone="accent">{PROVIDER_INFO[savedProvider].label}</Badge>
              ) : (
                <Badge tone="neutral">Belum disimpan</Badge>
              )
            }
          />
          <div className="p-5 space-y-4">
            <p className="text-sm text-text-secondary">
              Pilih model AI yang digunakan untuk drafting, Q&A knowledge base, dan segmentasi TOR. Konfigurasi ini disimpan di browser dan dikirim ke backend.
            </p>

            {/* Provider cards */}
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys(PROVIDER_INFO) as LLMProvider[]).map((p) => {
                const info = PROVIDER_INFO[p];
                const isSelected = provider === p;
                const isDisabled = p === "openai";
                return (
                  <button
                    key={p}
                    onClick={() => !isDisabled && setProvider(p)}
                    disabled={isDisabled}
                    className={`relative flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all ${
                      isSelected
                        ? "border-accent bg-accent-soft/40 shadow-subtle"
                        : isDisabled
                        ? "border-surface-border bg-surface opacity-50 cursor-not-allowed"
                        : "border-surface-border bg-surface hover:border-accent/50"
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-ink-900">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                    <Bot size={20} className={isSelected ? "text-accent-ink" : "text-text-muted"} />
                    <span className={`mt-2 text-xs font-bold ${isSelected ? "text-accent-ink" : "text-text-primary"}`}>
                      {info.label}
                    </span>
                    <span className="mt-0.5 font-mono text-[10px] text-text-muted">{info.model}</span>
                    <span className="mt-2 text-[11px] leading-relaxed text-text-muted">{info.note}</span>
                    {isDisabled && (
                      <span className="mt-1 rounded bg-surface border border-surface-border px-1.5 py-0.5 text-[10px] text-text-muted">
                        Coming Soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* API Key input */}
            <div className="rounded-lg border border-surface-border bg-surface p-3 space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                <Key size={13} />
                API Key untuk {PROVIDER_INFO[provider].label}
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Masukkan ${provider === "claude" ? "ANTHROPIC_API_KEY" : provider === "gemini" ? "GOOGLE_API_KEY" : "OPENAI_API_KEY"}`}
                    className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-1.5 pr-9 text-xs text-text-primary outline-none focus:border-accent font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveProvider}
                  className="bg-ink-900 hover:bg-ink-800 text-white text-xs min-w-[90px]"
                >
                  {providerSaved ? (
                    <><Check size={13} className="mr-1 text-emerald-400" />Tersimpan</>
                  ) : (
                    "Simpan"
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-text-muted flex items-start gap-1">
                <Info size={11} className="shrink-0 mt-0.5" />
                API key disimpan hanya di browser (localStorage). Untuk production, set di file <code className="font-mono bg-surface border border-surface-border px-1 rounded">.env</code> backend.
              </p>
            </div>
          </div>
        </Card>

        {/* ── Google Drive Sync ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Google Drive Sync"
            eyebrow="Sumber Knowledge Base"
            action={<Badge tone="neutral">Manual Sync</Badge>}
          />
          <div className="p-5 space-y-3">
            <p className="text-sm text-text-secondary">
              Sinkronisasi dokumen PDF/DOCX dari Google Drive ke knowledge base pgvector. Dokumen akan di-embed dan diindeks untuk pencarian.
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 border-surface-border"
              >
                {syncing ? (
                  <RefreshCw size={14} className="animate-spin text-accent-ink" />
                ) : (
                  <FolderSync size={14} className="text-accent-ink" />
                )}
                {syncing ? "Menyinkronkan..." : "Sync Sekarang"}
              </Button>
              {syncResult && (
                <span className="text-xs text-text-secondary">{syncResult}</span>
              )}
            </div>
            <div className="rounded-md border border-surface-border bg-surface p-3 text-xs text-text-muted">
              Folder Drive dikonfigurasi via <code className="font-mono bg-surface-raised border border-surface-border px-1 rounded">GOOGLE_DRIVE_FOLDER_ID</code> di backend <code>.env</code>. File credentials.json diperlukan untuk OAuth.
            </div>
          </div>
        </Card>

        {/* ── Corporate Branding ────────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Corporate Branding"
            eyebrow="Format Dokumen"
            action={<Badge tone="accent">PDF & Preview</Badge>}
          />
          <div className="p-5 space-y-4">
            <p className="text-sm text-text-secondary">
              Identitas ini dipakai pada cover, warna heading, tabel, dan footer PDF proposal.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5 text-xs font-semibold text-text-primary md:col-span-2">
                Logo perusahaan
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-surface-border bg-surface p-3">
                  {branding.logoDataUrl ? (
                    <img src={branding.logoDataUrl} alt="Preview logo perusahaan" className="h-12 max-w-40 object-contain" />
                  ) : (
                    <div className="flex h-12 w-24 items-center justify-center rounded border border-dashed border-surface-border text-[10px] font-normal text-text-muted">Belum ada logo</div>
                  )}
                  <label className="cursor-pointer rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-xs font-medium text-text-secondary hover:border-accent hover:text-text-primary">
                    Upload logo
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { handleLogoUpload(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {branding.logoDataUrl && (
                    <button onClick={() => setBranding({ ...branding, logoDataUrl: "" })} className="text-xs font-medium text-red-600 hover:underline">Hapus</button>
                  )}
                  <span className="text-[11px] font-normal text-text-muted">PNG/JPG/WebP, maksimal 1,5 MB</span>
                </div>
              </div>
              <label className="space-y-1.5 text-xs font-semibold text-text-primary">
                Nama perusahaan
                <input
                  value={branding.companyName}
                  onChange={(e) => setBranding({ ...branding, companyName: e.target.value })}
                  className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-xs font-normal outline-none focus:border-accent"
                />
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-text-primary">
                Teks footer
                <input
                  value={branding.footerText}
                  onChange={(e) => setBranding({ ...branding, footerText: e.target.value })}
                  className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-xs font-normal outline-none focus:border-accent"
                />
              </label>
              <label className="flex items-center gap-3 rounded-md border border-surface-border bg-surface p-3 text-xs font-semibold text-text-primary">
                <input
                  type="color"
                  value={branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span>Warna utama <span className="font-mono font-normal text-text-muted">{branding.primaryColor}</span></span>
              </label>
              <label className="flex items-center gap-3 rounded-md border border-surface-border bg-surface p-3 text-xs font-semibold text-text-primary">
                <input
                  type="color"
                  value={branding.accentColor}
                  onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                  className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span>Warna aksen <span className="font-mono font-normal text-text-muted">{branding.accentColor}</span></span>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveBranding}
                className="flex items-center gap-1.5 border-surface-border"
              >
                <Palette size={13} />
                {brandingSaved ? "Tersimpan" : "Simpan Branding"}
              </Button>
              <span className="text-[11px] text-text-muted">Disimpan lokal di browser, tanpa API key.</span>
            </div>
          </div>
        </Card>

        {/* ── External Research Toggle ───────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Riset Eksternal (Web Search)"
            eyebrow="Fitur Premium"
            action={
              <Badge tone={researchEnabled ? "accent" : "neutral"}>
                {researchEnabled ? "Aktif" : "Nonaktif"}
              </Badge>
            }
          />
          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <Globe size={16} className="mt-0.5 text-text-muted shrink-0" />
                <p className="text-sm text-text-secondary">
                  Izinkan mode "Riset Eksternal" mencari info publik real-time (produk vendor, berita perusahaan) lewat web search Claude. Terpisah dari knowledge base internal.
                </p>
              </div>
              <Switch checked={researchEnabled} onChange={setResearchEnabled} />
            </div>
            <div className="rounded-md bg-accent-soft px-3 py-2 text-xs text-accent-ink">
              ⚠️ Biaya ~$10 per 1.000 pencarian web, di luar biaya token normal. Matikan jika tidak dipakai.
            </div>
          </div>
        </Card>

        {/* ── Search History ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Riwayat Pencarian"
            eyebrow="Tersimpan di browser"
            action={
              searchHistory.length > 0 ? (
                <button
                  onClick={handleClearHistory}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  <Trash2 size={12} /> Hapus semua
                </button>
              ) : null
            }
          />
          <div className="p-5">
            {searchHistory.length === 0 ? (
              <p className="text-sm text-text-muted">Belum ada riwayat pencarian.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((q, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-surface-border bg-surface px-3 py-1 text-xs text-text-secondary"
                  >
                    {q}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ── Data & Cache ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader title="Data Lokal & Cache" eyebrow="Browser Storage" />
          <div className="p-5 space-y-3">
            <p className="text-sm text-text-secondary">
              Data yang tersimpan di browser: draft sesi aktif, riwayat pencarian, preferensi provider.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  try { localStorage.removeItem("synapse-draft-session"); alert("Draft sesi dihapus."); } catch {}
                }}
                className="flex items-center gap-1.5 rounded-md border border-surface-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:border-red-300 hover:text-red-600 transition-colors"
              >
                <Trash2 size={12} /> Hapus Draft Tersimpan
              </button>
              <button
                onClick={() => {
                  try {
                    ["synapse-draft-session", "synapse-search-history", "synapse-llm-provider", LS_BRANDING_KEY, "synapse-proposal-session-id"].forEach(k => localStorage.removeItem(k));
                    setSearchHistory([]);
                    alert("Semua data lokal dihapus.");
                  } catch {}
                }}
                className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100 transition-colors"
              >
                <Database size={12} /> Reset Semua Data Lokal
              </button>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
