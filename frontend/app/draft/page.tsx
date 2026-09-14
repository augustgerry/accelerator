import { Topbar } from "@/components/topbar";
import { AiPanel } from "@/components/ai-panel";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadCloud } from "lucide-react";

export default function DraftPage() {
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
                <UploadCloud size={22} className="text-accent-strong" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Tarik file ke sini atau klik untuk upload
                </p>
                <p className="text-xs text-text-muted">
                  Mendukung PDF, DOCX — misal TOR CSUL Finance
                </p>
              </div>
              <Button variant="secondary">Pilih file</Button>
            </div>
          </Card>
        </div>
        <AiPanel mode="draft" messages={[]} />
      </div>
    </div>
  );
}
