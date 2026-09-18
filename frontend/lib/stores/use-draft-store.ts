"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { RequirementItem, RequirementStatus } from "@/lib/types";

export interface VisualAsset {
  type: "web_search" | "hld_diagram" | "template";
  data_url: string;
  caption: string;
  source_query?: string;
  mermaid_code?: string;
}

export interface SectionRevision {
  text: string;
  timestamp: number;
  label: string;
}

export interface DraftState {
  // Document / TOR Context
  torText: string;
  torFileName: string;
  docType: string;
  templateName: string;
  archetype: string;
  customInstruction: string;
  sessionId: string | null;

  // Items / Sections
  items: RequirementItem[];
  selectedItemId: string | null;
  filterStatus: "all" | RequirementStatus;
  searchQuery: string;

  // Revision Snapshots per item ID (Undo / Diff history)
  revisions: Record<string, SectionRevision[]>;

  // Execution States
  isAnalyzingTor: boolean;
  isGeneratingAll: boolean;
  currentGeneratingIndex: number;
  totalGeneratingCount: number;

  // Visual Assets per section ID
  visualAssets: Record<string, VisualAsset[]>;

  // Actions
  setTorContext: (torText: string, fileName?: string, docType?: string, archetype?: string) => void;
  setSessionId: (id: string | null) => void;
  setDocType: (docType: string) => void;
  setArchetype: (archetype: string) => void;
  setCustomInstruction: (instruction: string) => void;
  
  // Item Operations
  setItems: (items: RequirementItem[]) => void;
  addItem: (item: RequirementItem) => void;
  updateItem: (id: string, updates: Partial<RequirementItem>) => void;
  removeItem: (id: string) => void;
  reorderItems: (startIndex: number, endIndex: number) => void;
  selectItem: (id: string | null) => void;
  setFilterStatus: (status: "all" | RequirementStatus) => void;
  setSearchQuery: (query: string) => void;

  // Revision / Undo Operations
  saveRevision: (itemId: string, label?: string) => void;
  restoreRevision: (itemId: string, revisionIndex: number) => void;

  // Visual Assets Operations
  addVisualAsset: (sectionId: string, asset: VisualAsset) => void;
  removeVisualAsset: (sectionId: string, assetIndex: number) => void;

  // Bulk Generation Execution Flags
  setGeneratingAll: (isGenerating: boolean, current?: number, total?: number) => void;
  setAnalyzingTor: (isAnalyzing: boolean) => void;

  // Reset / Clear
  resetSession: () => void;
}

const initialState = {
  torText: "",
  torFileName: "",
  docType: "narrative",
  templateName: "proposal_teknis_hardware.docx",
  archetype: "managed_services",
  customInstruction: "",
  sessionId: null,
  items: [],
  selectedItemId: null,
  filterStatus: "all" as const,
  searchQuery: "",
  revisions: {},
  isAnalyzingTor: false,
  isGeneratingAll: false,
  currentGeneratingIndex: 0,
  totalGeneratingCount: 0,
  visualAssets: {},
};

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setTorContext: (torText, fileName = "", docType = "narrative", archetype = "managed_services") =>
        set({
          torText,
          torFileName: fileName,
          docType,
          archetype,
        }),

      setSessionId: (sessionId) => set({ sessionId }),
      setDocType: (docType) => set({ docType }),
      setArchetype: (archetype) => set({ archetype }),
      setCustomInstruction: (customInstruction) => set({ customInstruction }),

      setItems: (items) => {
        const currentSelected = get().selectedItemId;
        const exists = items.some((it) => it.id === currentSelected);
        set({
          items,
          selectedItemId: exists ? currentSelected : items.length > 0 ? items[0].id : null,
        });
      },

      addItem: (item) =>
        set((state) => ({
          items: [...state.items, item],
          selectedItemId: state.selectedItemId || item.id,
        })),

      updateItem: (id, updates) =>
        set((state) => ({
          items: state.items.map((it) => (it.id === id ? { ...it, ...updates } : it)),
        })),

      removeItem: (id) =>
        set((state) => {
          const filtered = state.items.filter((it) => it.id !== id);
          let nextSelected = state.selectedItemId;
          if (nextSelected === id) {
            nextSelected = filtered.length > 0 ? filtered[0].id : null;
          }
          return {
            items: filtered,
            selectedItemId: nextSelected,
          };
        }),

      reorderItems: (startIndex, endIndex) =>
        set((state) => {
          const result = Array.from(state.items);
          const [removed] = result.splice(startIndex, 1);
          result.splice(endIndex, 0, removed);
          return { items: result };
        }),

      selectItem: (selectedItemId) => set({ selectedItemId }),
      setFilterStatus: (filterStatus) => set({ filterStatus }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),

      saveRevision: (itemId, label = "Manual Snapshot") =>
        set((state) => {
          const item = state.items.find((it) => it.id === itemId);
          if (!item || !item.draft_text) return state;
          const current = state.revisions[itemId] || [];
          const newRev: SectionRevision = {
            text: item.draft_text,
            timestamp: Date.now(),
            label: label || `Snapshot ${current.length + 1}`,
          };
          return {
            revisions: {
              ...state.revisions,
              [itemId]: [newRev, ...current].slice(0, 10), // keep latest 10 revisions
            },
          };
        }),

      restoreRevision: (itemId, revisionIndex) =>
        set((state) => {
          const list = state.revisions[itemId];
          if (!list || !list[revisionIndex]) return state;
          const target = list[revisionIndex];
          return {
            items: state.items.map((it) =>
              it.id === itemId ? { ...it, draft_text: target.text } : it
            ),
          };
        }),

      addVisualAsset: (sectionId, asset) =>
        set((state) => {
          const current = state.visualAssets[sectionId] || [];
          return {
            visualAssets: {
              ...state.visualAssets,
              [sectionId]: [...current, asset],
            },
          };
        }),

      removeVisualAsset: (sectionId, assetIndex) =>
        set((state) => {
          const current = state.visualAssets[sectionId] || [];
          return {
            visualAssets: {
              ...state.visualAssets,
              [sectionId]: current.filter((_, idx) => idx !== assetIndex),
            },
          };
        }),

      setGeneratingAll: (isGeneratingAll, current = 0, total = 0) =>
        set({
          isGeneratingAll,
          currentGeneratingIndex: current,
          totalGeneratingCount: total,
        }),

      setAnalyzingTor: (isAnalyzingTor) => set({ isAnalyzingTor }),

      resetSession: () => set(initialState),
    }),
    {
      name: "synapse-draft-storage",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? localStorage
          : {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            }
      ),
      partialize: (state) => ({
        torText: state.torText,
        torFileName: state.torFileName,
        docType: state.docType,
        templateName: state.templateName,
        archetype: state.archetype,
        customInstruction: state.customInstruction,
        sessionId: state.sessionId,
        items: state.items,
        selectedItemId: state.selectedItemId,
        visualAssets: state.visualAssets,
        revisions: state.revisions,
      }),
    }
  )
);
