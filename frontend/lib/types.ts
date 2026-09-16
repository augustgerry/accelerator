export type SourceCitation = {
  id: string;
  title: string;
  docType: "checklist" | "TOR" | "SoW" | "TCO" | "deck" | "web" | "other";
  division?: string;
  url?: string;
  source: "internal" | "external";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: SourceCitation[];
  mode?: "qa" | "draft" | "research";
};

export type IndexedDocument = {
  id: string;
  title: string;
  docType: SourceCitation["docType"] | string;
  division: string;
  updatedAt: string;
  sizeLabel?: string;
  chunkCount?: number;
};

export type DocumentChunkItem = {
  id: string;
  content: string;
  length: number;
};

export type DocumentChunksResponse = {
  documentId: string;
  title: string;
  docType: string;
  division: string;
  totalChunks: number;
  chunks: DocumentChunkItem[];
};

export type RequirementStatus = "todo" | "draft" | "final";

export type RequirementItem = {
  id: string;
  title: string;
  requirement_text: string;
  category: string;
  draft_text: string;
  status: RequirementStatus;
  rationale?: string;
  sources?: SourceCitation[];
  isGenerating?: boolean;
  error?: string;
  image_data_url?: string;
  image_caption?: string;
};

export interface SectionVisualAsset {
  type: "web_search" | "hld_diagram" | "template";
  data_url: string;
  caption: string;
  source_query?: string;
  mermaid_code?: string;
  preview_url?: string;
}

export type SegmentItemApi = {
  id: string;
  title: string;
  requirement_text: string;
  category: string;
};

export type DraftItemApiResponse = {
  item_id: string;
  draft_text: string;
  sources_used: number;
  sources: SourceCitation[];
};

export type TemplateSection = {
  index: number;
  style_name: string;
  level: number;
  text: string;
  font_name?: string | null;
  font_size_pt?: number | null;
  is_bold?: boolean | null;
  is_italic?: boolean | null;
  alignment?: string | null;
};

export type TemplateInfo = {
  template_name: string;
  default_font_name: string;
  default_font_size_pt: number;
  section_count: number;
  sections: TemplateSection[];
};

