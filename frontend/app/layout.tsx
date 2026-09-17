import type { Metadata } from "next";
import "./globals.css";
import { MobileNav, Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Internal Knowledge & Proposal Synapse",
  description: "AI-powered cross-divisional knowledge base and drafting assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="flex h-screen overflow-hidden bg-surface text-text-primary">
        <Sidebar />
        <main className="min-w-0 flex-1 h-screen overflow-y-auto flex flex-col pb-14 md:pb-0">{children}</main>
        <MobileNav />
      </body>
    </html>
  );
}
