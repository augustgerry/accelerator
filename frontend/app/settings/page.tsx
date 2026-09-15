"use client";

import { useState } from "react";
import { Topbar } from "@/components/topbar";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Globe } from "lucide-react";

export default function SettingsPage() {
  const [researchEnabled, setResearchEnabled] = useState(false);

  return (
    <div>
      <Topbar title="Pengaturan" subtitle="Koneksi data dan konfigurasi AI" />
      <div className="grid grid-cols-2 gap-4 p-8">
        <Card>
          <CardHeader
            title="Google Drive"
            eyebrow="Sumber dokumen"
            action={<Badge tone="accent">Belum terhubung</Badge>}
          />
          <div className="space-y-3 p-5">
            <p className="text-sm text-text-secondary">
              Hubungkan folder Drive pribadi yang berisi dokumen referensi
              (checklist, TCO, SoW) sebagai sumber knowledge base.
            </p>
            <Button variant="secondary">Hubungkan Google Drive</Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="LLM Provider" eyebrow="Pluggable — tidak lock-in" />
          <div className="space-y-3 p-5">
            <p className="text-sm text-text-secondary">
              Model yang memproses pertanyaan dan drafting. Bisa diganti
              kapan saja lewat environment variable backend.
            </p>
            <div className="flex gap-2">
              <Badge tone="accent">Claude</Badge>
              <Badge>Gemini</Badge>
              <Badge>OpenAI</Badge>
              <Badge>Self-hosted</Badge>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Riset Eksternal"
            eyebrow="Web search + fetch"
            action={
              <Badge tone={researchEnabled ? "accent" : "neutral"}>
                {researchEnabled ? "Aktif" : "Nonaktif"}
              </Badge>
            }
          />
          <div className="space-y-3 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <Globe size={16} className="mt-0.5 text-text-muted" />
                <p className="text-sm text-text-secondary">
                  Izinkan mode "Riset Eksternal" mencari info publik
                  real-time (produk vendor, berita perusahaan) lewat web
                  search. Terpisah dari knowledge base internal.
                </p>
              </div>
              <Switch checked={researchEnabled} onChange={setResearchEnabled} />
            </div>
            <p className="rounded-md bg-accent-soft px-3 py-2 text-xs text-accent-ink">
              Biaya ~$10 per 1.000 pencarian, di luar biaya token normal.
              Matikan kalau tidak dipakai untuk kontrol biaya.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Workspace" eyebrow="Multi-tenant ready" />
          <div className="p-5 text-sm text-text-secondary">
            <p>
              Workspace aktif:{" "}
              <span className="font-medium text-text-primary">
                SMG — Presales (MVP pribadi)
              </span>
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Struktur data sudah tenant-aware, siap dibuka ke divisi/klien
              lain tanpa rewrite skema.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
