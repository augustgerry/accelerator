import { Topbar } from "@/components/topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import type { IndexedDocument } from "@/lib/types";

const placeholderDocs: IndexedDocument[] = [];

export default function DocumentsPage() {
  return (
    <div>
      <Topbar
        title="Dokumen Terindeks"
        subtitle="Sumber: Google Drive — sinkron otomatis"
      />
      <div className="p-8">
        <Card>
          {placeholderDocs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <FileText size={28} className="text-text-muted" />
              <p className="text-sm font-medium text-text-primary">
                Belum ada dokumen terindeks
              </p>
              <p className="text-sm text-text-muted">
                Hubungkan folder Google Drive di halaman Pengaturan
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-surface-border text-left text-text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Judul</th>
                  <th className="px-5 py-3 font-medium">Tipe</th>
                  <th className="px-5 py-3 font-medium">Divisi</th>
                  <th className="px-5 py-3 font-medium">Diperbarui</th>
                </tr>
              </thead>
              <tbody>
                {placeholderDocs.map((doc) => (
                  <tr key={doc.id} className="border-b border-surface-border">
                    <td className="px-5 py-3 text-text-primary">{doc.title}</td>
                    <td className="px-5 py-3">
                      <Badge>{doc.docType}</Badge>
                    </td>
                    <td className="px-5 py-3 text-text-secondary">{doc.division}</td>
                    <td className="px-5 py-3 text-text-muted">{doc.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
