"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Search,
  FileEdit,
  FolderOpen,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";

const navItems = [
  { href: "/", label: "Dasbor", icon: LayoutGrid },
  { href: "/search", label: "Tanya Knowledge Base", icon: Search },
  { href: "/draft", label: "Draft dari TOR/RFP", icon: FileEdit },
  { href: "/documents", label: "Dokumen Terindeks", icon: FolderOpen },
  { href: "/settings", label: "Pengaturan", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-surface-border bg-white text-text-primary">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo />
        <div>
          <p className="text-sm font-semibold text-text-primary">Synapse</p>
          <p className="text-[11px] text-text-muted">Internal Knowledge · v0.1</p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-0.5 px-3">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
                active
                  ? "border-accent bg-accent-soft text-text-primary"
                  : "border-transparent text-text-secondary hover:bg-surface hover:text-text-primary"
              )}
            >
              <Icon size={16} strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-surface-border px-5 py-4">
        <p className="text-xs font-medium text-text-primary">Gerry August</p>
        <p className="text-[11px] text-text-muted">Presales · Workspace: SMG</p>
      </div>
    </aside>
  );
}
