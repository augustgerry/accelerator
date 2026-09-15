import { Search, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex min-h-14 items-center justify-between gap-3 border-b border-surface-border bg-surface-raised px-4 py-3 sm:px-6 md:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-text-primary sm:text-lg">{title}</h1>
        {subtitle && <p className="hidden truncate text-sm text-text-secondary sm:block">{subtitle}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 rounded-md border border-surface-border bg-surface px-2.5 py-1.5 text-sm text-text-muted sm:px-3">
          <Search size={14} />
          <span className="hidden sm:inline">Cari dokumen... <span className="text-xs text-text-muted/70">Ctrl+K</span></span>
        </div>
        <Badge tone="accent" className="hidden sm:inline-flex">Presales</Badge>
        <button aria-label="Notifikasi" className="rounded-md p-2 text-text-muted hover:bg-surface">
          <Bell size={17} />
        </button>
      </div>
    </header>
  );
}
