"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Layers, RefreshCw, Loader2 } from "lucide-react";
import { getDocumentsSummary, syncDocuments, type DocumentsSummary } from "@/lib/api";

export default function DocumentsPage() {
  const [summary, setSummary] = useState<DocumentsSummary | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = async () => {
    try {
      setSummary(await getDocumentsSummary());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal menghubungi backend. Pastikan API server jalan."
      );
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncDocuments();
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync gagal.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <Topbar
        title="Dokumen Terindeks"
        subtitle="Sumber: Google Drive — sinkron otomatis"
      />
      <div className="p-8">
        <Card>
          <CardHeader
            title="Ringkasan indeks"
            eyebrow="Knowledge base"
            action={
              <Button variant="secondary" disabled={syncing} onClick={handleSync}>
                {syncing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {syncing ? "Menyinkron..." : "Sync Sekarang"}
              </Button>
            }
          />
          <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-md border border-surface-border p-4">
              <FileText size={20} className="text-accent" />
              <div>
                <p className="text-xs text-text-muted">Total dokumen</p>
                <p className="text-lg font-semibold text-text-primary">
                  {summary?.totalDocuments ?? "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-surface-border p-4">
              <Layers size={20} className="text-accent" />
              <div>
                <p className="text-xs text-text-muted">Total chunks</p>
                <p className="text-lg font-semibold text-text-primary">
                  {summary?.totalChunks ?? "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-surface-border p-4">
              <RefreshCw size={20} className="text-accent" />
              <div>
                <p className="text-xs text-text-muted">Terakhir sync</p>
                <p className="text-lg font-semibold text-text-primary">
                  {summary?.lastSyncedAt
                    ? new Date(summary.lastSyncedAt).toLocaleString("id-ID", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Belum pernah"}
                </p>
              </div>
            </div>
          </div>
          {error && <p className="px-6 pb-6 text-xs text-red-600">{error}</p>}
        </Card>
      </div>
    </div>
  );
}
