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
  docType: SourceCitation["docType"];
  division: string;
  updatedAt: string;
  sizeLabel: string;
};
