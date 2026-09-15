"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  FileEdit,
  FolderOpen,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";

const primaryNav = [
  {
    href: "/search",
    label: "Cari Dokumen",
    sublabel: "Tanya arsip & spesifikasi lama",
    icon: Search,
  },
  {
    href: "/draft",
    label: "Jawab Tender",
    sublabel: "Bikin proposal dari TOR/RFP",
    icon: FileEdit,
    badge: "RFP",
  },
];

const secondaryNav = [
  { href: "/library", label: "Google Drive", icon: FolderOpen, count: "" },
  { href: "/settings", label: "Pengaturan", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-surface-border bg-white text-text-primary select-none md:flex">
      {/* Brand / Logo */}
      <Link
        href="/"
        className="flex items-center gap-3 px-5 py-5 hover:bg-surface/50 transition-colors"
      >
        <Logo />
        <div>
          <p className="text-sm font-bold text-text-primary tracking-tight">Synapse</p>
          <p className="text-[11px] text-text-muted">Proposal Accelerator</p>
        </div>
      </Link>

      {/* 2 Core Pillar Menus */}
      <div className="px-3 pt-3">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Menu Utama
        </p>
        <nav className="space-y-1.5">
          {primaryNav.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center justify-between rounded-lg px-3 py-2.5 transition-all",
                  active
                    ? "bg-ink-900 text-white shadow-subtle"
                    : "text-text-secondary hover:bg-surface hover:text-text-primary"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                      active
                        ? "bg-white/10 text-accent"
                        : "bg-surface text-text-secondary group-hover:text-text-primary"
                    )}
                  >
                    <Icon size={16} strokeWidth={2} />
                  </div>
                  <div>
                    <p className={cn("text-xs font-semibold leading-none", active ? "text-white" : "text-text-primary")}>
                      {item.label}
                    </p>
                    <p className={cn("text-[10px] mt-1 line-clamp-1", active ? "text-white/70" : "text-text-muted")}>
                      {item.sublabel}
                    </p>
                  </div>
                </div>

                {item.badge && !active && (
                  <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-accent-ink">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Secondary Utilities (Quietly placed at bottom) */}
      <div className="border-t border-surface-border px-3 py-3 space-y-1">
        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Sistem & Arsip
        </p>
        {secondaryNav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-1.5 text-xs transition-colors",
                active
                  ? "bg-surface font-semibold text-text-primary"
                  : "text-text-muted hover:bg-surface hover:text-text-primary"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon size={14} />
                <span>{item.label}</span>
              </div>
              {item.count && (
                <span className="rounded bg-surface border border-surface-border px-1.5 py-0.2 text-[10px] font-medium text-text-muted">
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* User Info */}
      <div className="border-t border-surface-border bg-surface/40 px-5 py-3.5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-text-primary">Gerry August</p>
          <p className="text-[10px] text-text-muted">Presales · Solusi Mitra Gemilang</p>
        </div>
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-accent-ink text-[10px] font-bold">
          GA
        </div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Home", icon: Sparkles },
    { href: "/search", label: "Search", icon: Search },
    { href: "/draft", label: "Draft", icon: FileEdit },
    { href: "/library", label: "Drive", icon: FolderOpen },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-surface-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium",
              active ? "text-accent-ink" : "text-text-muted"
            )}
          >
            <Icon size={17} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
