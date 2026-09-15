import type {
  ChatMessage,
  IndexedDocument,
  DocumentChunksResponse,
  SourceCitation,
  SegmentItemApi,
  DraftItemApiResponse,
  TemplateInfo,
  TemplateSection,
} from "@/lib/types";


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

export async function getDocumentChunks(docId: string): Promise<DocumentChunksResponse> {
  return getJson<DocumentChunksResponse>(`/documents/${encodeURIComponent(docId)}/chunks`);
}

export type DocumentsSummary = {
  totalDocuments: number;
  totalChunks: number;
  lastSyncedAt: string | null;
};

export async function getDocumentsSummary(): Promise<DocumentsSummary> {
  return getJson<DocumentsSummary>("/documents/summary");
}

export async function downloadDriveDocument(docId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(docId)}/download`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gagal mengambil template dari library (${res.status}): ${detail}`);
  }
  return res.blob();
}

export const downloadTemplateDocument = downloadDriveDocument;

export async function syncDocuments(): Promise<{ synced: string[]; skipped: string[]; unchanged: string[] }> {
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
  const data = await postJson<{ answer: string; sources_used: number; sources?: unknown[] }>(
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

export type SearchResultChunk = {
  id: string;
  title: string;
  docType: string;
  division?: string | null;
  source: string;
  chunk_text: string;
  confidence: number;
  matched_terms: string[];
};

export type SearchResult = {
  answer: string;
  sources_used: number;
  sources: SearchResultChunk[];
};

export async function searchKnowledgeBase(
  question: string,
  filters?: { docType?: string; division?: string },
  conversation?: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<SearchResult> {
  return postJson<SearchResult>("/query", {
    question,
    doc_type: filters?.docType || undefined,
    division: filters?.division || undefined,
    conversation,
  });
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

export async function segmentTor(torText: string): Promise<SegmentItemApi[]> {
  const data = await postJson<{ items: SegmentItemApi[] }>("/draft/segment", {
    tor_text: torText,
  });
  return data.items;
}

export async function generateItemDraft(
  itemId: string,
  requirementText: string,
  instruction?: string,
  torContext?: string,
  referenceDocIds?: string[]
): Promise<DraftItemApiResponse> {
  const data = await postJson<DraftItemApiResponse>("/draft/item", {
    item_id: itemId,
    requirement_text: requirementText,
    instruction: instruction || undefined,
    tor_context: torContext || undefined,
    reference_doc_ids: referenceDocIds && referenceDocIds.length > 0 ? referenceDocIds : undefined,
  });
  return data;
}

export type QualityCheckResult = {
  overall_score: number;
  total_items: number;
  items_with_issues: number;
  results: Array<{
    item_id: string;
    title: string;
    status: "pass" | "warning" | "fail";
    score: number;
    issues: string[];
    missing_values: string[];
  }>;
};

export async function qualityCheckDraft(items: Array<{
  id: string;
  title: string;
  requirement_text: string;
  category: string;
  draft_text: string;
  status: string;
}>): Promise<QualityCheckResult> {
  return postJson<QualityCheckResult>("/draft/quality-check", { items });
}

export type ExportPreflightResult = {
  estimated_pages: number;
  warnings: string[];
  blocking_issues: string[];
  ready: boolean;
};

export async function exportPreflight(
  items: Array<{
    id: string;
    title: string;
    requirement_text: string;
    category: string;
    draft_text: string;
    status: string;
  }>,
  outputType: string,
): Promise<ExportPreflightResult> {
  return postJson<ExportPreflightResult>("/draft/export-preflight", {
    output_type: outputType,
    items,
  });
}

export type ProposalSession = {
  id: string;
  title: string;
  file_name: string;
  tor_text: string;
  items: Array<{
    id: string;
    title: string;
    requirement_text: string;
    category: string;
    draft_text: string;
    status: "todo" | "draft" | "final";
    sources?: SourceCitation[];
  }>;
  status: string;
  created_at: string;
  updated_at: string;
};

type ProposalSessionPayload = Omit<ProposalSession, "id" | "created_at" | "updated_at"> & {
  workspace_id?: string;
};

export async function getProposalSession(sessionId: string): Promise<ProposalSession> {
  return getJson<ProposalSession>(`/sessions/${encodeURIComponent(sessionId)}`);
}

export async function listProposalSessions(): Promise<ProposalSession[]> {
  return getJson<ProposalSession[]>("/sessions");
}

export async function saveProposalSession(
  payload: ProposalSessionPayload,
  sessionId?: string,
): Promise<ProposalSession> {
  const path = sessionId ? `/sessions/${encodeURIComponent(sessionId)}` : "/sessions";
  const res = await fetch(`${API_BASE}${path}`, {
    method: sessionId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gagal menyimpan project (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function exportProposalDocx(payload: {
  document_title: string;
  template_type: "matrix" | "narrative" | "sow" | "solution_brief" | "mom" | "pitch_deck";
  font_name?: string;
  company_name?: string;
  logo_data_url?: string;
  customer_logo_data_url?: string;
  items: Array<{
    id: string;
    title: string;
    requirement_text: string;
    category: string;
    draft_text: string;
    status: string;
  }>;
}): Promise<Blob> {
  const res = await fetch(`${API_BASE}/draft/export-docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gagal membuat dokumen Word (${res.status}): ${detail}`);
  }
  return res.blob();
}

export async function exportProposalPptx(payload: {
  document_title: string;
  company_name?: string;
  items: Array<{
    id: string;
    title: string;
    requirement_text: string;
    category: string;
    draft_text: string;
    status: string;
  }>;
}): Promise<Blob> {
  const res = await fetch(`${API_BASE}/draft/export-pptx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gagal membuat slide PowerPoint (${res.status}): ${detail}`);
  }
  return res.blob();
}

export async function exportProposalPdf(payload: {
  document_title: string;
  template_type: "matrix" | "narrative" | "sow" | "solution_brief" | "mom" | "pitch_deck";
  company_name?: string;
  primary_color?: string;
  accent_color?: string;
  footer_text?: string;
  logo_data_url?: string;
  customer_logo_data_url?: string;
  items: Array<{
    id: string;
    title: string;
    requirement_text: string;
    category: string;
    draft_text: string;
    status: string;
  }>;
}): Promise<Blob> {
  const res = await fetch(`${API_BASE}/draft/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gagal membuat dokumen PDF (${res.status}): ${detail}`);
  }
  return res.blob();
}

export async function convertOfficeToPdf(file: Blob, filename: string): Promise<Blob> {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetch(`${API_BASE}/draft/convert-office-pdf`, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gagal render PDF full-fidelity (${res.status}): ${detail}`);
  }
  return res.blob();
}


export async function uploadTemplate(file: File): Promise<TemplateInfo> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/draft/upload-template`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gagal membaca template (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function exportFromTemplate(payload: {
  document_title: string;
  company_name?: string;
  items: Array<{
    id: string;
    title: string;
    requirement_text: string;
    category: string;
    draft_text: string;
    status: string;
  }>;
  template_default_font: string;
  template_default_font_size: number;
  template_sections: TemplateSection[];
  template_type?: "proposal" | "sow" | "solution_brief" | "mom";
}): Promise<Blob> {
  const res = await fetch(`${API_BASE}/draft/export-from-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gagal membuat dokumen dari template (${res.status}): ${detail}`);
  }
  return res.blob();
}

export async function cloneTemplate(payload: {
  templateFile: File;
  document_title: string;
  company_name?: string;
  document_type?: "proposal" | "sow" | "solution_brief" | "mom";
  items: Array<{
    id: string;
    title: string;
    requirement_text: string;
    category: string;
    draft_text: string;
    status: string;
  }>;
}): Promise<Blob> {
  const form = new FormData();
  form.append("template", payload.templateFile);
  form.append("items_json", JSON.stringify(payload.items));
  form.append("document_title", payload.document_title);
  form.append("company_name", payload.company_name ?? "PT Solusi Mitra Gemilang (SMG)");
  form.append("document_type", payload.document_type ?? "proposal");

  const res = await fetch(`${API_BASE}/draft/clone-template`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gagal clone template (${res.status}): ${detail}`);
  }
  return res.blob();
}

export async function cloneTemplatePptx(payload: {
  templateFile: File;
  document_title: string;
  company_name?: string;
  items: Array<{
    id: string;
    title: string;
    requirement_text: string;
    category: string;
    draft_text: string;
    status: string;
  }>;
}): Promise<Blob> {
  const form = new FormData();
  form.append("template", payload.templateFile);
  form.append("items_json", JSON.stringify(payload.items));
  form.append("document_title", payload.document_title);
  form.append("company_name", payload.company_name ?? "PT Solusi Mitra Gemilang (SMG)");

  const res = await fetch(`${API_BASE}/draft/clone-template-pptx`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gagal clone template PPTX (${res.status}): ${detail}`);
  }
  return res.blob();
}
