import { Topbar } from "@/components/topbar";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileStack, Search, FileEdit, Database } from "lucide-react";

const stats = [
  { label: "Dokumen terindeks", value: "0", icon: FileStack, hint: "sumber: Google Drive" },
  { label: "Query bulan ini", value: "0", icon: Search, hint: "mode Q&A" },
  { label: "Draf dihasilkan", value: "0", icon: FileEdit, hint: "mode Draft" },
  { label: "Ukuran index", value: "0 MB", icon: Database, hint: "pgvector" },
];

export default function DashboardPage() {
  return (
    <div>
      <Topbar
        title="Dasbor"
        subtitle="Ringkasan knowledge base — MVP, data pribadi Gerry"
      />

      <div className="grid grid-cols-4 gap-4 px-8 py-6">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft">
              <s.icon size={16} className="text-accent-strong" />
            </div>
            <p className="text-2xl font-semibold text-text-primary">{s.value}</p>
            <p className="text-sm text-text-secondary">{s.label}</p>
            <p className="mt-1 text-[11px] text-text-muted">{s.hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 px-8 pb-8">
        <Card className="col-span-2">
          <CardHeader
            title="Belum ada dokumen terindeks"
            eyebrow="Mulai dari sini"
            action={<Badge tone="gold">Setup diperlukan</Badge>}
          />
          <div className="p-5 text-sm text-text-secondary">
            Hubungkan folder Google Drive lo di halaman{" "}
            <span className="font-medium text-text-primary">Pengaturan</span>,
            lalu tambahkan dokumen referensi (checklist, TCO, SoW) supaya
            knowledge base bisa mulai menjawab pertanyaan.
          </div>
        </Card>

        <Card>
          <CardHeader title="Positioning" eyebrow="Catatan" />
          <div className="space-y-2 p-5 text-sm text-text-secondary">
            <p>
              Berbeda dari tool riset opportunity per-customer — ini
              knowledge internal lintas divisi, dari dokumen kerja yang sudah
              pernah dibuat.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
