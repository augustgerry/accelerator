"use client";

import React, { useState, useEffect } from "react";
import { RequirementItem } from "@/lib/types";
import { searchImages, downloadImage, generateHld, renderMermaid } from "@/lib/api";

interface VisualAssetStudioProps {
  item: RequirementItem;
  torText: string;
  onUpdateItem: (updated: RequirementItem) => void;
  onClose?: () => void;
  initialTab?: "search" | "hld" | "upload";
}

export function VisualAssetStudio({
  item,
  torText,
  onUpdateItem,
  onClose,
  initialTab = "search",
}: VisualAssetStudioProps) {
  const [activeTab, setActiveTab] = useState<"search" | "hld" | "upload">(initialTab);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{
    title: string;
    image_url: string;
    thumbnail_url: string;
    source: string;
  }>>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  // HLD Diagram State
  const [isGeneratingHld, setIsGeneratingHld] = useState(false);
  const [hldMermaidCode, setHldMermaidCode] = useState("");
  const [hldCaption, setHldCaption] = useState("");
  const [hldNarrative, setHldNarrative] = useState("");
  const [hldRenderedUrl, setHldRenderedUrl] = useState<string | null>(null);
  const [isReRenderingMermaid, setIsReRenderingMermaid] = useState(false);

  // Auto-suggest search query when item changes
  useEffect(() => {
    if (!item.image_data_url) {
      // Create clean query suggestion from title & draft keywords
      const titleClean = item.title.replace(/^(bab|sub-bab|\d+(\.\d+)*)\s*[:.-]?\s*/i, "").trim();
      const hardwareKeywords = ["server", "storage", "switch", "router", "firewall", "hci", "dl360", "poweredge", "cisco", "fortigate", "nutanix"];
      const matchedHw = hardwareKeywords.find((kw) =>
        (titleClean + " " + item.requirement_text).toLowerCase().includes(kw)
      );

      if (matchedHw) {
        setSearchQuery(titleClean.length < 35 ? titleClean : `Enterprise ${matchedHw}`);
      } else {
        setSearchQuery(titleClean.slice(0, 35));
      }
    }
  }, [item.id, item.title, item.image_caption, item.image_data_url, item.requirement_text]);

  // Handle Image Search. Pass queryOverride for callers (e.g. quick presets) that
  // search a specific string without waiting for setSearchQuery to re-render first.
  const handleSearch = async (e?: React.FormEvent, queryOverride?: string) => {
    if (e) e.preventDefault();
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) return;
    setSearchQuery(q);
    setIsSearching(true);
    try {
      const resp = await searchImages(q, 8);
      setSearchResults(resp.items || []);
    } catch (err: any) {
      console.error("Search images error:", err);
      alert("Gagal mencari gambar: " + (err?.message || "Kesalahan jaringan"));
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Pick Image from Search Results
  const handleSelectImage = async (imgUrl: string, title: string) => {
    setIsDownloading(true);
    try {
      const downloaded = await downloadImage(imgUrl);
      const cap = `Gambar: ${title.slice(0, 65)}`;
      onUpdateItem({
        ...item,
        image_data_url: downloaded.data_url,
        image_caption: cap,
      });
    } catch (err: any) {
      console.error("Download image error:", err);
      alert("Gagal mengunduh gambar terpilih: " + (err?.message || "Format tidak didukung"));
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle Generate HLD
  const handleGenerateHld = async () => {
    setIsGeneratingHld(true);
    try {
      const res = await generateHld(torText, item.draft_text || item.requirement_text, item.title);
      setHldMermaidCode(res.mermaid_code);
      setHldCaption(res.caption);
      setHldNarrative(res.architecture_narrative);
      setHldRenderedUrl(res.image_data_url || null);
    } catch (err: any) {
      console.error("Generate HLD error:", err);
      alert("Gagal generate diagram HLD: " + (err?.message || "Kesalahan server"));
    } finally {
      setIsGeneratingHld(false);
    }
  };

  // Handle Re-render Mermaid code
  const handleReRenderMermaid = async () => {
    if (!hldMermaidCode.trim()) return;
    setIsReRenderingMermaid(true);
    try {
      const res = await renderMermaid(hldMermaidCode);
      if (res.data_url) {
        setHldRenderedUrl(res.data_url);
      }
    } catch (err: any) {
      alert("Gagal me-render diagram: " + (err?.message || "Kode Mermaid tidak valid"));
    } finally {
      setIsReRenderingMermaid(false);
    }
  };

  // Apply HLD to Item
  const handleApplyHldToItem = () => {
    if (!hldRenderedUrl) return;
    const cap = hldCaption || `Gambar: Arsitektur High Level Design (HLD) ${item.title}`;
    onUpdateItem({
      ...item,
      image_data_url: hldRenderedUrl,
      image_caption: cap,
    });
  };

  // Remove attached image
  const handleRemoveImage = () => {
    onUpdateItem({
      ...item,
      image_data_url: undefined,
      image_caption: undefined,
    });
  };

  // Update caption
  const handleUpdateCaption = (newCap: string) => {
    onUpdateItem({
      ...item,
      image_caption: newCap,
    });
  };

  // Handle Manual File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const cap = `Gambar: ${file.name.replace(/\.[^/.]+$/, "")}`;
      onUpdateItem({
        ...item,
        image_data_url: dataUrl,
        image_caption: cap,
      });
    };
    reader.readAsDataURL(file);
  };

  const quickSearchPresets = [
    "HPE ProLiant DL360 Gen10",
    "Dell PowerEdge R750",
    "Cisco Catalyst 9300 Switch",
    "Fortinet FortiGate 100F",
    "Server Rack Cabinet 42U Data Center",
    "Nutanix HCI Node Appliance",
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 text-xs">
      {/* Studio Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#FDF6DC] text-[#111827] flex items-center justify-center font-bold">
            🖼️
          </div>
          <div>
            <div className="font-semibold text-gray-900 text-xs flex items-center gap-1.5">
              Studio Visual & Diagram HLD
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[10px] font-medium border border-amber-200/50">
                Word & PPTX Ready
              </span>
            </div>
            <p className="text-[11px] text-gray-500 line-clamp-1">
              Sisipkan foto perangkat keras enterprise atau generate topologi arsitektur HLD
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {/* Currently Attached Image Preview */}
      {item.image_data_url && (
        <div className="mb-4 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="w-28 h-20 bg-gray-900 rounded-md overflow-hidden flex-shrink-0 border border-gray-200 shadow-sm relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image_data_url}
                alt="Attached Preview"
                className="w-full h-full object-contain"
              />
              <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded">
                Terlampir
              </span>
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-800">
                  Aset Terpasang pada Bagian ini
                </span>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="text-[10px] text-red-600 hover:text-red-700 font-medium hover:underline flex items-center gap-1"
                >
                  Hapus Aset
                </button>
              </div>

              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider block mb-0.5">
                  Keterangan Gambar (Caption Dokumen & PPTX)
                </label>
                <input
                  type="text"
                  value={item.image_caption || ""}
                  onChange={(e) => handleUpdateCaption(e.target.value)}
                  placeholder="Mis: Gambar 2.1: Server HPE ProLiant DL360 Gen10 Rackmount"
                  className="w-full px-2.5 py-1 text-xs border border-gray-200 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <p className="text-[10px] text-gray-500">
                ✅ Aset ini akan otomatis disisipkan ke Word naratif, PDF, dan slide PowerPoint dengan transisi animasi.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-3 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("search")}
          className={`pb-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "search"
              ? "border-[#111827] text-gray-900 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          🔍 Cari Gambar Publik (Hardware)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("hld")}
          className={`pb-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "hld"
              ? "border-[#111827] text-gray-900 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          ✨ Generate Diagram HLD (AI)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("upload")}
          className={`pb-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "upload"
              ? "border-[#111827] text-gray-900 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          📁 Upload / Aset Lokal
        </button>
      </div>

      {/* TAB 1: Search Public Hardware Images */}
      {activeTab === "search" && (
        <div className="space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ketik nama perangkat/server, mis: HPE DL360 Gen10, Cisco Switch, FortiGate..."
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
            />
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-3 py-1.5 bg-[#111827] text-white rounded-lg font-medium text-xs hover:bg-black transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSearching ? (
                <>
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Mencari...
                </>
              ) : (
                "Cari Web"
              )}
            </button>
          </form>

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-gray-400 font-medium">Contoh Hardware:</span>
            {quickSearchPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleSearch(undefined, preset)}
                className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Results Grid */}
          {isDownloading && (
            <div className="p-4 bg-blue-50 text-blue-800 rounded-lg text-center flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
              Mengunduh & mengoptimasi gambar terpilih...
            </div>
          )}

          {searchResults.length > 0 && !isDownloading && (
            <div>
              <div className="text-[10px] text-gray-500 font-medium mb-1.5">
                Ditemukan {searchResults.length} gambar publik relevan (Klik untuk memasang ke bagian ini):
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {searchResults.map((res, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectImage(res.image_url, res.title)}
                    className="group border border-gray-200 hover:border-blue-500 rounded-lg overflow-hidden bg-white cursor-pointer transition-all shadow-xs hover:shadow-md flex flex-col"
                  >
                    <div className="h-24 bg-gray-50 overflow-hidden relative flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={res.thumbnail_url || res.image_url}
                        alt={res.title}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                      <span className="absolute top-1 left-1 bg-black/60 text-white text-[8.5px] px-1 py-0.2 rounded">
                        {res.source === "Wikimedia Commons" ? "Wikimedia" : "Web"}
                      </span>
                    </div>
                    <div className="p-1.5 flex-1 flex flex-col justify-between">
                      <div className="text-[10px] font-medium text-gray-800 line-clamp-2 leading-tight">
                        {res.title}
                      </div>
                      <div className="text-[9px] text-blue-600 font-medium mt-1 group-hover:underline">
                        + Pilih Gambar
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.length === 0 && !isSearching && (
            <div className="p-4 border border-dashed border-gray-200 rounded-lg text-center text-gray-400 text-xs">
              Ketik nama spesifikasi hardware atau pilih chip contoh di atas untuk mencari foto resmi perangkat.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Generate HLD Diagram */}
      {activeTab === "hld" && (
        <div className="space-y-3">
          <div className="p-3 bg-gradient-to-r from-amber-50/60 to-blue-50/60 border border-amber-200/50 rounded-lg">
            <div className="font-semibold text-gray-900 text-xs mb-1 flex items-center gap-1.5">
              <span>⚡</span> Generator High Level Design (HLD) Otomatis
            </div>
            <p className="text-[11px] text-gray-600">
              Synapse akan menganalisis kondisi kebutuhan TOR serta solusi SMG pada bagian ini, kemudian menyusun topologi arsitektur sistem (Data Center, DR Site, Network, dan Security) dalam diagram Mermaid resolusi tinggi.
            </p>

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateHld}
                disabled={isGeneratingHld}
                className="px-3.5 py-1.5 bg-[#111827] text-white rounded-lg font-medium text-xs hover:bg-black transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isGeneratingHld ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Menganalisis & Menggambar Topologi HLD...
                  </>
                ) : (
                  <>✨ Generate Diagram HLD Solusi</>
                )}
              </button>

              {hldRenderedUrl && (
                <button
                  type="button"
                  onClick={handleApplyHldToItem}
                  className="px-3.5 py-1.5 bg-[#2F5FE0] text-white rounded-lg font-medium text-xs hover:bg-blue-700 transition-colors shadow-sm"
                >
                  ✓ Terapkan Diagram ini ke Dokumen
                </button>
              )}
            </div>
          </div>

          {/* Generated HLD Preview */}
          {hldRenderedUrl && (
            <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span className="font-semibold text-gray-800 text-xs">
                  Pratinjau Hasil Render Diagram HLD:
                </span>
                <span className="text-[10px] text-gray-400">
                  Engine: Kroki SVG / PNG Renderer
                </span>
              </div>

              {/* Rendered Image Box — click to zoom full-screen */}
              <div
                onClick={() => setZoomImageUrl(hldRenderedUrl)}
                className="w-full bg-slate-900/5 rounded-lg p-2 border border-gray-200 flex items-center justify-center overflow-auto max-h-72 cursor-zoom-in transition-transform hover:scale-[1.01]"
                title="Klik untuk pratinjau ukuran penuh"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hldRenderedUrl}
                  alt="HLD Diagram"
                  className="max-h-64 object-contain rounded shadow-xs"
                />
              </div>

              {/* Narrative */}
              {hldNarrative && (
                <div className="p-2.5 bg-gray-50 rounded border border-gray-100 text-[11px] text-gray-700 leading-relaxed">
                  <span className="font-semibold text-gray-900 block mb-0.5">Penjelasan Arsitektur:</span>
                  {hldNarrative}
                </div>
              )}

              {/* Editable Mermaid Code Accordion */}
              <details className="text-[11px] border border-gray-200 rounded p-2 bg-gray-50/50">
                <summary className="font-medium text-gray-700 cursor-pointer select-none">
                  Lihat & Edit Kode Topologi Mermaid (Opsional)
                </summary>
                <div className="mt-2 space-y-2">
                  <textarea
                    rows={6}
                    value={hldMermaidCode}
                    onChange={(e) => setHldMermaidCode(e.target.value)}
                    className="w-full font-mono text-[10px] p-2 border border-gray-200 rounded bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleReRenderMermaid}
                    disabled={isReRenderingMermaid}
                    className="px-2.5 py-1 bg-gray-800 text-white rounded text-[10px] font-medium hover:bg-black disabled:opacity-50"
                  >
                    {isReRenderingMermaid ? "Rendering..." : "Render Ulang Perubahan"}
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Upload Local File */}
      {activeTab === "upload" && (
        <div className="p-4 border-2 border-dashed border-gray-200 rounded-lg text-center space-y-2">
          <div className="text-2xl">📤</div>
          <div className="text-xs font-medium text-gray-700">
            Unggah Gambar dari Komputer Lokal
          </div>
          <p className="text-[11px] text-gray-400">
            Mendukung file PNG, JPG, JPEG, SVG, atau WebP (Maksimal 5MB)
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-gray-900 file:text-white hover:file:bg-black cursor-pointer"
          />
        </div>
      )}

      {/* Fullscreen zoom lightbox for the HLD render preview */}
      {zoomImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setZoomImageUrl(null)}
        >
          <div className="relative max-h-[90vh] w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomImageUrl}
              alt="HLD Diagram — pratinjau penuh"
              className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
            />
            <div className="mt-3 flex items-center justify-center gap-3">
              <a
                href={zoomImageUrl}
                download="hld-diagram.png"
                className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
              >
                ⬇️ Unduh PNG
              </a>
              <button
                type="button"
                onClick={() => setZoomImageUrl(null)}
                className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
              >
                ✕ Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
