"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { RequirementItem } from "@/lib/types";
import { searchImages, downloadImage, generateHld, renderMermaid, generateHardwareVisual, renderHardwareRear } from "@/lib/api";

interface VisualAssetStudioProps {
  item: RequirementItem;
  torText: string;
  onUpdateItem: (updated: RequirementItem) => void;
  onClose?: () => void;
  initialTab?: "search" | "hardware" | "hld" | "upload";
}

export function VisualAssetStudio({
  item,
  torText,
  onUpdateItem,
  onClose,
  initialTab = "search",
}: VisualAssetStudioProps) {
  const [activeTab, setActiveTab] = useState<"search" | "hardware" | "hld" | "upload">(initialTab);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [hwViewType, setHwViewType] = useState<"front" | "rear">("rear");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && zoomImageUrl) {
        setZoomImageUrl(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomImageUrl]);

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
  const [hldMermaidUrl, setHldMermaidUrl] = useState<string | null>(null);
  const [hld2dUrl, setHld2dUrl] = useState<string | null>(null);
  const [hldRearUrl, setHldRearUrl] = useState<string | null>(null);
  const [hldActiveVisual, setHldActiveVisual] = useState<"mermaid" | "2d" | "rear">("mermaid");
  const [customHldInstruction, setCustomHldInstruction] = useState("");
  const [hldDiagramStyle, setHldDiagramStyle] = useState<"topology" | "2d_datacenter" | "hardware_rear">("topology");
  const [isReRenderingMermaid, setIsReRenderingMermaid] = useState(false);

  // 2D Hardware Studio State
  const [hwDeviceName, setHwDeviceName] = useState("");
  const [hwFormFactor, setHwFormFactor] = useState<"1U" | "2U" | "4U">("2U");
  const [isGeneratingHw, setIsGeneratingHw] = useState(false);
  const [hwGeneratedAsset, setHwGeneratedAsset] = useState<{
    data_url: string;
    title: string;
  } | null>(null);

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
        setHwDeviceName(titleClean.length < 35 ? titleClean : `Enterprise ${matchedHw}`);
      } else {
        setSearchQuery(titleClean.slice(0, 35));
        setHwDeviceName(titleClean.slice(0, 35));
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
  const handleGenerateHld = async (targetStyle?: "topology" | "2d_datacenter" | "hardware_rear") => {
    const styleToUse = targetStyle || hldDiagramStyle;
    setIsGeneratingHld(true);
    try {
      const res = await generateHld(
        torText,
        item.draft_text || item.requirement_text,
        item.title,
        customHldInstruction.trim() || undefined,
        styleToUse === "hardware_rear" ? "hardware_rear" : (styleToUse === "2d_datacenter" ? "2d_datacenter" : "topology"),
      );
      setHldMermaidCode(res.mermaid_code);
      setHldCaption(res.caption);
      setHldNarrative(res.architecture_narrative);
      setHldMermaidUrl(res.mermaid_rendered_url || (res.image_data_url !== res.diagram_2d_url ? res.image_data_url : null) || null);
      setHld2dUrl(res.diagram_2d_url || null);
      setHldRearUrl(res.hardware_rear_url || null);

      if (styleToUse === "hardware_rear" && res.hardware_rear_url) {
        setHldActiveVisual("rear");
      } else if (styleToUse === "2d_datacenter" && res.diagram_2d_url) {
        setHldActiveVisual("2d");
      } else {
        setHldActiveVisual("mermaid");
      }
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
        setHldMermaidUrl(res.data_url);
      }
    } catch (err: any) {
      alert("Gagal me-render diagram: " + (err?.message || "Kode Mermaid tidak valid"));
    } finally {
      setIsReRenderingMermaid(false);
    }
  };

  // Current active HLD preview URL
  const currentHldPreviewUrl =
    hldActiveVisual === "rear"
      ? (hldRearUrl || hld2dUrl || hldMermaidUrl)
      : hldActiveVisual === "2d"
      ? (hld2dUrl || hldMermaidUrl)
      : (hldMermaidUrl || hld2dUrl);

  const isCurrentHldAttached = Boolean(
    item.image_data_url && (
      item.image_data_url === currentHldPreviewUrl ||
      item.image_data_url === hldMermaidUrl ||
      item.image_data_url === hld2dUrl ||
      item.image_data_url === hldRearUrl
    )
  );

  // Toggle HLD Attachment Checkbox
  const toggleHldAttachment = () => {
    if (isCurrentHldAttached) {
      onUpdateItem({
        ...item,
        image_data_url: undefined,
        image_caption: undefined,
      });
    } else {
      if (!currentHldPreviewUrl) return;
      const styleLabel =
        hldActiveVisual === "rear"
          ? "Tampak Belakang Perangkat & Port I/O"
          : hldActiveVisual === "2d"
          ? "Topologi 2D Enterprise Datacenter"
          : "Topologi Arsitektur Skematik (HLD)";
      const cap = hldCaption || `Gambar: ${styleLabel} - ${item.title}`;
      onUpdateItem({
        ...item,
        image_data_url: currentHldPreviewUrl,
        image_caption: cap,
      });
    }
  };

  // Handle Generate Hardware Visual (Front Faceplate or Rear I/O Stencil)
  const handleGenerateHardware = async (
    nameOverride?: string,
    ffOverride?: "1U" | "2U" | "4U",
    viewOverride?: "front" | "rear"
  ) => {
    const devName = (nameOverride ?? hwDeviceName).trim();
    if (!devName) return;
    if (nameOverride) setHwDeviceName(nameOverride);
    const ff = ffOverride ?? hwFormFactor;
    if (ffOverride) setHwFormFactor(ffOverride);
    const view = viewOverride ?? hwViewType;
    if (viewOverride) setHwViewType(viewOverride);

    setIsGeneratingHw(true);
    try {
      if (view === "rear") {
        const res = await renderHardwareRear(devName);
        setHwGeneratedAsset({
          data_url: res.data_url,
          title: res.title,
        });
      } else {
        const res = await generateHardwareVisual(devName, ff);
        setHwGeneratedAsset({
          data_url: res.data_url || res.image_url || res.thumbnail_url,
          title: res.title,
        });
      }
    } catch (err: any) {
      console.error("Generate hardware visual error:", err);
      alert("Gagal generate visual stencil hardware: " + (err?.message || "Kesalahan server"));
    } finally {
      setIsGeneratingHw(false);
    }
  };

  // Check if hardware asset is attached
  const isHwAttached = Boolean(
    item.image_data_url && hwGeneratedAsset && item.image_data_url === hwGeneratedAsset.data_url
  );

  // Toggle 2D Hardware to Item
  const toggleHwAttachment = () => {
    if (isHwAttached) {
      onUpdateItem({
        ...item,
        image_data_url: undefined,
        image_caption: undefined,
      });
    } else {
      if (!hwGeneratedAsset) return;
      onUpdateItem({
        ...item,
        image_data_url: hwGeneratedAsset.data_url,
        image_caption: `Gambar: ${hwGeneratedAsset.title}`,
      });
    }
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
        <div className="mb-4 p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg">
          <div className="flex items-start gap-3">
            <div
              className="w-28 h-20 bg-gray-900 rounded-md overflow-hidden flex-shrink-0 border border-gray-200 shadow-sm relative group cursor-zoom-in"
              onClick={() => setZoomImageUrl(item.image_data_url || null)}
              title="Klik untuk perbesar"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image_data_url}
                alt="Attached Preview"
                className="w-full h-full object-contain"
              />
              <span className="absolute bottom-1 right-1 bg-emerald-700 text-white text-[9px] px-1 py-0.5 rounded font-medium">
                ✓ Terpasang
              </span>
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={() => handleRemoveImage()}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-[11px] font-bold text-emerald-900 flex items-center gap-1">
                    ✅ Aset Terpasang &amp; Masuk ke Dokumen Proposal
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="text-[10px] text-red-600 hover:text-red-700 font-medium hover:underline flex items-center gap-1"
                >
                  Lepas Aset
                </button>
              </div>

              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider block mb-0.5">
                  Keterangan Gambar (Caption Dokumen &amp; PPTX)
                </label>
                <input
                  type="text"
                  value={item.image_caption || ""}
                  onChange={(e) => handleUpdateCaption(e.target.value)}
                  placeholder="Mis: Gambar 2.1: Server HPE ProLiant DL360 Gen10 Rackmount"
                  className="w-full px-2.5 py-1 text-xs border border-gray-200 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <p className="text-[10px] text-emerald-700">
                ✅ Aset visual ini akan otomatis disertakan dalam ekspor Word (.docx), PDF, dan PowerPoint (.pptx).
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
          onClick={() => setActiveTab("hardware")}
          className={`pb-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "hardware"
              ? "border-[#111827] text-gray-900 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          🛠️ Studio Hardware 2D
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
          <div className="p-3.5 bg-gradient-to-r from-amber-50/70 to-blue-50/70 border border-amber-200/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-900 text-xs flex items-center gap-1.5">
                <span>⚡</span> Generator High Level Design (HLD) &amp; Topologi
              </div>
              <span className="text-[10px] text-gray-500">Kroki Engine + PIL 2D Engine</span>
            </div>

            {/* Custom Directive Box */}
            <div className="space-y-2 bg-white/90 dark:bg-zinc-900/90 p-3 rounded-lg border border-amber-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-800 flex items-center gap-1">
                  <span>🧭 Arahan Khusus Alur Koneksi &amp; Perangkat:</span>
                </label>
                <span className="text-[10px] text-gray-500">
                  Arahkan switch, firewall HA, server, storage (Tekan Ctrl+Enter untuk Generate)
                </span>
              </div>
              <textarea
                value={customHldInstruction}
                onChange={(e) => setCustomHldInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleGenerateHld();
                  }
                }}
                placeholder="Ketik alur perangkat yang diinginkan di sini, misal: Dari Core Switch 100G ke Spine-Leaf ToR MLAG, konek ke Dual Controller Pure Storage FlashArray RC20 via 32G FC / 25G iSCSI, dan 3x Server Compute Dell R750 dengan Firewall FortiGate 100F HA di perimeter..."
                rows={4}
                className="w-full text-xs rounded-lg border border-amber-300 bg-white p-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none min-h-[96px] leading-relaxed shadow-xs"
              />
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Pure Storage RC20 / //X SAN Fabric + 4x Compute",
                    "3-Node HCI + ToR MLAG + Firewall HA",
                    "Core Switch 100G ke Dual SAN Storage + 4x Compute",
                    "Perimeter FortiGate HA + DMZ Switch + Internal Cluster",
                    "Spine-Leaf Architecture + Redundant Power"
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCustomHldInstruction(preset)}
                      className="text-[10px] px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200 transition-colors font-medium shadow-2xs"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleGenerateHld()}
                  disabled={isGeneratingHld}
                  className="px-3.5 py-1.5 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-md transition-all shadow-xs flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
                  title="Generate diagram berdasarkan arahan di kolom ini"
                >
                  {isGeneratingHld ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Menggambar...</span>
                    </>
                  ) : (
                    <>
                      <span>🚀 Terapkan Arahan &amp; Generate HLD</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Output Style Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700">Format Visual:</span>
                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs shadow-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setHldDiagramStyle("topology");
                      setHldActiveVisual("mermaid");
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      hldDiagramStyle === "topology" && hldActiveVisual === "mermaid"
                        ? "bg-[#111827] text-white font-semibold"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    🔀 Skematik (Mermaid)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHldDiagramStyle("2d_datacenter");
                      setHldActiveVisual("2d");
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      hldDiagramStyle === "2d_datacenter" || hldActiveVisual === "2d"
                        ? "bg-[#111827] text-white font-semibold"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    🏢 Visual 2D Rack Datacenter
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHldDiagramStyle("hardware_rear");
                      setHldActiveVisual("rear");
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      hldDiagramStyle === "hardware_rear" || hldActiveVisual === "rear"
                        ? "bg-[#111827] text-white font-semibold"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    🖥️ Tampak Belakang &amp; Port 2D
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGenerateHld()}
                  disabled={isGeneratingHld}
                  className="px-3.5 py-1.5 bg-[#111827] text-white rounded-lg font-medium text-xs hover:bg-black transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {isGeneratingHld ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Menganalisis &amp; Menggambar...
                    </>
                  ) : (
                    <>✨ Generate Diagram HLD</>
                  )}
                </button>

                {currentHldPreviewUrl && (
                  <button
                    type="button"
                    onClick={toggleHldAttachment}
                    className={`px-3.5 py-1.5 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${
                      isCurrentHldAttached
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400"
                        : "bg-[#2F5FE0] hover:bg-blue-700 text-white"
                    }`}
                  >
                    <span>{isCurrentHldAttached ? "☑️" : "⬜"}</span>
                    <span>{isCurrentHldAttached ? "Terpasang di Dokumen (Klik untuk Melepas)" : "Gunakan Sebagai Aset Bagian Ini"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Generated HLD Preview with Mermaid / 2D / Rear View Switcher */}
          {currentHldPreviewUrl && (
            <div className="space-y-2.5 border border-gray-200 rounded-xl p-3.5 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800 text-xs">
                    Pilih Format Tampilan:
                  </span>
                  <div className="inline-flex rounded border border-gray-200 bg-gray-50 p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setHldActiveVisual("mermaid")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        hldActiveVisual === "mermaid" ? "bg-blue-600 text-white font-semibold shadow-xs" : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      🔀 Skematik (Mermaid)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHldActiveVisual("2d")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        hldActiveVisual === "2d" ? "bg-blue-600 text-white font-semibold shadow-xs" : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      🏢 Visual 2D Rack Datacenter
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setHldActiveVisual("rear");
                        if (!hldRearUrl) {
                          try {
                            const devName = customHldInstruction.trim() || item.title || "Enterprise 1U/2U Platform";
                            const res = await renderHardwareRear(devName);
                            if (res?.data_url) setHldRearUrl(res.data_url);
                          } catch (e) {
                            console.warn("Could not load rear visual:", e);
                          }
                        }
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        hldActiveVisual === "rear" ? "bg-blue-600 text-white font-semibold shadow-xs" : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      🖥️ Tampak Belakang &amp; Port
                    </button>
                  </div>
                </div>
                <span className="text-[10px] text-gray-400">
                  {hldActiveVisual === "rear"
                    ? "Tampak Belakang & Port I/O Perangkat"
                    : hldActiveVisual === "2d"
                    ? "Visual 2D Multi-tier Datacenter"
                    : "Topologi Skematik Vector (HLD)"}
                </span>
              </div>

              {/* Rendered Image Box — click to zoom full-screen without giant empty black box */}
              <div
                onClick={() => setZoomImageUrl(currentHldPreviewUrl)}
                className="w-full bg-slate-900/5 rounded-lg p-2 border border-gray-200 flex items-center justify-center overflow-auto max-h-80 cursor-zoom-in transition-transform hover:scale-[1.005]"
                title="Klik untuk pratinjau ukuran penuh"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentHldPreviewUrl}
                  alt="HLD Diagram"
                  className="max-h-72 object-contain rounded shadow-xs"
                />
              </div>

              {/* Narrative */}
              {hldNarrative && (
                <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 text-[11px] text-gray-700 leading-relaxed space-y-2">
                  <div>
                    <span className="font-semibold text-gray-900 block mb-0.5">Penjelasan Arsitektur:</span>
                    {hldNarrative}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateItem({
                        ...item,
                        draft_text: item.draft_text ? `${item.draft_text}\n\n${hldNarrative}` : hldNarrative,
                      });
                      alert("Narasi arsitektur berhasil disisipkan ke draf sub-bab ini!");
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#111827] hover:bg-black text-white rounded-md text-[11px] font-semibold transition-colors shadow-xs"
                  >
                    <span>📝</span>
                    <span>Terapkan Narasi Arsitektur Ini ke Draf Sub-Bab</span>
                  </button>
                </div>
              )}

              {/* Editable Mermaid Code Accordion */}
              {hldActiveVisual === "mermaid" && hldMermaidCode && (
                <details className="text-[11px] border border-gray-200 rounded p-2 bg-gray-50/50">
                  <summary className="font-medium text-gray-700 cursor-pointer select-none">
                    Lihat &amp; Edit Kode Topologi Mermaid (Opsional)
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
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: 2D Technical Hardware Studio */}
      {activeTab === "hardware" && (
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Nama Perangkat / Model Perangkat Keras:
                </label>
                <input
                  type="text"
                  value={hwDeviceName}
                  onChange={(e) => setHwDeviceName(e.target.value)}
                  placeholder="Mis: HPE ProLiant DL380 Gen10, Pure Storage //X20, Cisco Catalyst 9300..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Sudut Pandang / Tampilan:
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setHwViewType("rear")}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-all ${
                      hwViewType === "rear"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    🔌 Tampak Belakang & Port
                  </button>
                  <button
                    type="button"
                    onClick={() => setHwViewType("front")}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-all ${
                      hwViewType === "front"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    🖥️ Tampak Depan (Faceplate)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Form Factor:
                </label>
                <div className="flex items-center gap-1">
                  {(["1U", "2U", "4U"] as const).map((ff) => (
                    <button
                      key={ff}
                      type="button"
                      onClick={() => setHwFormFactor(ff)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-all ${
                        hwFormFactor === ff
                          ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {ff}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:self-end">
                <button
                  type="button"
                  onClick={() => handleGenerateHardware()}
                  disabled={isGeneratingHw || !hwDeviceName.trim()}
                  className="w-full sm:w-auto px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isGeneratingHw ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Menggambar Stencil...
                    </>
                  ) : (
                    hwViewType === "rear" ? "🔌 Gambar Port Belakang" : "🎨 Gambar Faceplate Depan"
                  )}
                </button>
              </div>
            </div>

            {/* Quick Presets for Official Brand Hardware */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/60">
              <span className="text-[10px] text-slate-500 font-semibold">Stencil Resmi Brand:</span>
              {[
                { name: "Fortinet FortiGate 100F NGFW", ff: "1U" as const },
                { name: "Cisco Catalyst 9300-48P Switch", ff: "1U" as const },
                { name: "Sangfor HCI aServer 2200", ff: "2U" as const },
                { name: "Dell PowerEdge R750", ff: "2U" as const },
                { name: "HPE ProLiant DL360 Gen10", ff: "1U" as const },
                { name: "Pure Storage FlashArray //X20", ff: "2U" as const },
              ].map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleGenerateHardware(p.name, p.ff)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors font-medium"
                >
                  {p.name} ({p.ff})
                </button>
              ))}
            </div>
          </div>

          {/* Generated 2D Visual Preview */}
          {hwGeneratedAsset && (
            <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 text-xs">
                  {hwGeneratedAsset.title}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                  2D Flat Technical Vector
                </span>
              </div>

              <div
                className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-900/5 p-2 flex items-center justify-center cursor-pointer hover:opacity-95 transition-opacity"
                onClick={() => setZoomImageUrl(hwGeneratedAsset.data_url)}
                title="Klik untuk pratinjau penuh"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hwGeneratedAsset.data_url}
                  alt={hwGeneratedAsset.title}
                  className="max-h-40 w-auto rounded object-contain shadow-md"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setZoomImageUrl(hwGeneratedAsset.data_url)}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1"
                >
                  🔍 Perbesar
                </button>

                <button
                  type="button"
                  onClick={toggleHwAttachment}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer ${
                    isHwAttached
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white"
                  }`}
                >
                  <span>{isHwAttached ? "☑️" : "⬜"}</span>
                  <span>{isHwAttached ? "Terpasang di Dokumen (Klik untuk Batal)" : "Gunakan Sebagai Aset Bagian Ini"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Upload Local File */}
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

      {/* Fullscreen zoom lightbox using React Portal to prevent clipping/overflow */}
      {zoomImageUrl && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 overflow-hidden select-none"
          onClick={() => setZoomImageUrl(null)}
        >
          <div
            className="relative flex flex-col w-full max-w-5xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-300 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-slate-900 text-white border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-semibold tracking-wide">
                  🔍 Pratinjau Visual & Stencil Resolusi Penuh
                </span>
                <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                  {Math.round(zoomScale * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setZoomScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))))}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors font-medium cursor-pointer"
                  title="Perkecil (-)"
                >
                  − Zoom
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale(1)}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors font-medium font-mono cursor-pointer"
                  title="Pas Layar (100%)"
                >
                  Fit 100%
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale((s) => Math.min(2.5, Number((s + 0.25).toFixed(2))))}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors font-medium cursor-pointer"
                  title="Perbesar (+)"
                >
                  + Zoom
                </button>
                <button
                  type="button"
                  onClick={() => setZoomImageUrl(null)}
                  className="ml-2 px-3 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                  title="Tutup (Esc)"
                >
                  ✕ Tutup
                </button>
              </div>
            </div>

            {/* Modal Image Body with Fit & Scale */}
            <div className="flex-1 w-full min-h-0 flex items-center justify-center p-4 bg-slate-900/5 overflow-auto">
              <div className="relative flex items-center justify-center max-h-[70vh] max-w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={zoomImageUrl}
                  alt="HLD Diagram — pratinjau penuh"
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: "center center",
                    maxHeight: "68vh",
                    maxWidth: "100%",
                  }}
                  className="w-auto h-auto object-contain rounded-lg shadow-sm transition-transform duration-150 select-none block mx-auto"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 border-t border-slate-200">
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                💡 Diagram secara otomatis dipaskan dengan layar. Gunakan tombol zoom untuk melihat detail port. Tekan ESC untuk menutup.
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <a
                  href={zoomImageUrl}
                  download="diagram-visual-hld.png"
                  className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-black transition-colors shadow-xs flex items-center gap-1.5"
                >
                  ⬇️ Unduh PNG
                </a>
                <button
                  type="button"
                  onClick={() => setZoomImageUrl(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
