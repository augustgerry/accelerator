import { Topbar } from "@/components/topbar";
import { AiPanel } from "@/components/ai-panel";
import { Card, CardHeader } from "@/components/ui/card";

export default function SearchPage() {
  return (
    <div className="flex h-screen flex-col">
      <Topbar
        title="Tanya Knowledge Base"
        subtitle="Jawaban dari dokumen internal, lengkap dengan sitasi sumber"
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          <Card>
            <CardHeader title="Riwayat pertanyaan" eyebrow="Sesi ini" />
            <div className="p-5 text-sm text-text-muted">
              Belum ada pertanyaan pada sesi ini. Gunakan panel di kanan untuk
              mulai bertanya, atau pilih salah satu rekomendasi.
            </div>
          </Card>
        </div>
        <AiPanel mode="qa" messages={[]} allowModeSwitch />
      </div>
    </div>
  );
}
