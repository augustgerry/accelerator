"use client";

import { useRef, useState } from "react";
import { Topbar } from "@/components/topbar";
import { AiPanel } from "@/components/ai-panel";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadCloud, FileText, Loader2 } from "lucide-react";
import { uploadTor } from "@/lib/api";

export default function DraftPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [torText, setTorText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const text = await uploadTor(file);
      setTorText(text);
      setFileName(file.name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal upload file. Pastikan API server jalan."
      );
      setFileName(null);
      setTorText("");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <Topbar
        title="Draft dari TOR / RFP"
        subtitle="Upload dokumen, minta draf klausul siap copas — bukan dokumen jadi"
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          <Card>
            <CardHeader title="Dokumen kerja" eyebrow="Upload TOR/RFP" />
            <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent-soft">
                {uploading ? (
                  <Loader2 size={22} className="animate-spin text-accent-ink" />
                ) : fileName ? (
                  <FileText size={22} className="text-accent-ink" />
                ) : (
                  <UploadCloud size={22} className="text-accent-ink" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {fileName ? fileName : "Tarik file ke sini atau klik untuk upload"}
                </p>
                <p className="text-xs text-text-muted">
                  {fileName
                    ? `${torText.length} karakter teks berhasil diekstrak`
                    : "Mendukung PDF, DOCX — misal TOR CSUL Finance"}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="secondary"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "Mengupload..." : "Pilih file"}
              </Button>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          </Card>
        </div>
        <AiPanel mode="draft" messages={[]} />
      </div>
    </div>
  );
}
