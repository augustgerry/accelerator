"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/search");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return (
    <header className="flex min-h-14 items-center justify-between gap-3 border-b border-surface-border bg-surface-raised px-4 py-3 sm:px-6 md:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-text-primary sm:text-lg">{title}</h1>
        {subtitle && <p className="hidden truncate text-sm text-text-secondary sm:block">{subtitle}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          onClick={() => router.push("/search")}
          aria-label="Cari dokumen (Ctrl+K)"
          className="flex items-center gap-2 rounded-md border border-surface-border bg-surface px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:border-accent hover:text-text-primary sm:px-3"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Cari dokumen... <span className="text-xs text-text-muted/70">Ctrl+K</span></span>
        </button>
        <Badge tone="accent" className="hidden sm:inline-flex">Presales</Badge>
        <button aria-label="Notifikasi" className="rounded-md p-2 text-text-muted hover:bg-surface">
          <Bell size={17} />
        </button>
      </div>
    </header>
  );
}
