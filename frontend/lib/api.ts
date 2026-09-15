import type { ChatMessage, IndexedDocument, SourceCitation } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`API ${path} failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function listDocuments(): Promise<IndexedDocument[]> {
  return getJson<IndexedDocument[]>("/documents");
}

export type DocumentsSummary = {
  totalDocuments: number;
  totalChunks: number;
  lastSyncedAt: string | null;
};

export async function getDocumentsSummary(): Promise<DocumentsSummary> {
  return getJson<DocumentsSummary>("/documents/summary");
}

export async function syncDocuments(): Promise<{ synced: string[]; skipped: string[] }> {
  const res = await fetch(`${API_BASE}/documents/sync`, { method: "POST" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`API /documents/sync failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function uploadTor(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/draft/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`API /draft/upload failed (${res.status}): ${detail}`);
  }
  const data: { text: string } = await res.json();
  return data.text;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`API ${path} failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function askKnowledgeBase(question: string): Promise<ChatMessage> {
  const data = await postJson<{ answer: string; sources_used: number }>(
    "/query",
    { question }
  );
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: data.answer,
    mode: "qa",
  };
}

export async function generateDraft(
  instruction: string,
  torText: string
): Promise<ChatMessage> {
  const data = await postJson<{ draft_text: string; sources_used: number }>(
    "/draft",
    { instruction, tor_text: torText }
  );
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: data.draft_text,
    mode: "draft",
  };
}

export async function researchExternal(query: string): Promise<ChatMessage> {
  const data = await postJson<{
    answer: string;
    citations: { url: string; title: string | null }[];
  }>("/research", { query });

  const citations: SourceCitation[] = data.citations.map((c, i) => ({
    id: `${i}`,
    title: c.title ?? c.url,
    docType: "web",
    url: c.url,
    source: "external",
  }));

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: data.answer,
    citations,
    mode: "research",
  };
}
