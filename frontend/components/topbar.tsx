import { Search, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex items-center justify-between border-b border-surface-border bg-surface-raised px-8 py-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
        {subtitle && <p className="text-sm text-text-secondary">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-md border border-surface-border bg-surface px-3 py-1.5 text-sm text-text-muted">
          <Search size={14} />
          <span>Cari peluang, dokumen... (Ctrl+K)</span>
        </div>
        <Badge tone="accent">MVP · Presales</Badge>
        <button className="rounded-md p-2 text-text-muted hover:bg-surface">
          <Bell size={17} />
        </button>
      </div>
    </header>
  );
}
