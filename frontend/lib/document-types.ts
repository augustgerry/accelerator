// Doc types shown to the user vs. the backend `template_type` that drives wording.
// Two UI entries can share one backend type when their content/wording is the same
// (Klarifikasi Teknis reuses "mom" wording; Pitch Deck reuses "narrative" as the closest
// generic style — backend has no dedicated wording for either yet).
export type DraftDocTypeId = "narrative" | "sow" | "solution_brief" | "mom" | "klarifikasi_teknis" | "pitch_deck";
export type DraftBackendType = "narrative" | "sow" | "solution_brief" | "mom";
export type DraftFormat = "pdf" | "docx" | "pptx";

export const DOC_TYPES: Array<{
  id: DraftDocTypeId;
  label: string;
  fileLabel: string;
  backendType: DraftBackendType;
  formats: DraftFormat[];
}> = [
  { id: "narrative", label: "Proposal Teknis", fileLabel: "Proposal", backendType: "narrative", formats: ["pdf", "docx", "pptx"] },
  { id: "sow", label: "Scope of Work (SoW)", fileLabel: "SoW", backendType: "sow", formats: ["pdf", "docx"] },
  { id: "solution_brief", label: "Solution Brief", fileLabel: "SolutionBrief", backendType: "solution_brief", formats: ["pdf", "docx", "pptx"] },
  { id: "mom", label: "Minutes of Meetings", fileLabel: "MoM", backendType: "mom", formats: ["pdf", "docx"] },
  { id: "klarifikasi_teknis", label: "Klarifikasi Teknis", fileLabel: "KlarifikasiTeknis", backendType: "mom", formats: ["pptx", "docx", "pdf"] },
  { id: "pitch_deck", label: "Pitch Deck For Customer / Internal", fileLabel: "PitchDeck", backendType: "narrative", formats: ["pptx", "pdf", "docx"] },
];

export const FORMAT_LABELS: Record<DraftFormat, string> = {
  pdf: "PDF",
  docx: "Word (.docx)",
  pptx: "PowerPoint (.pptx)",
};

export function getDocType(id: DraftDocTypeId) {
  return DOC_TYPES.find((d) => d.id === id) ?? DOC_TYPES[0];
}
