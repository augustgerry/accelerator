import type { ChatMessage, SourceCitation } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
