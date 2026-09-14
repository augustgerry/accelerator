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
    <aside className="flex h-screen w-64 flex-col bg-ink-950 text-white/90">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo />
        <div>
          <p className="text-sm font-semibold text-white">Synapse</p>
          <p className="text-[11px] text-white/40">Internal Knowledge · v0.1</p>
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
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white/90"
              )}
            >
              <Icon size={16} strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-xs font-medium text-white">Gerry August</p>
        <p className="text-[11px] text-white/40">Presales · Workspace: SMG</p>
      </div>
    </aside>
  );
}
