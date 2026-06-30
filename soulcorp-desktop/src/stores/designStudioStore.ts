import { create } from "zustand";
import type { DesignCategory, CompanyVisualDesign } from "../types/visualDesign";
import { EMPTY_VISUAL_DESIGN } from "../types/visualDesign";

interface DesignStudioStore {
  draft: CompanyVisualDesign;
  category: DesignCategory;
  selectedBuildingId: string | null;
  selectedAgentId: string | null;
  dirty: boolean;
  saving: boolean;
  setDraft: (draft: CompanyVisualDesign) => void;
  patchDraft: (patch: Partial<CompanyVisualDesign>) => void;
  setCategory: (category: DesignCategory) => void;
  setSelectedBuildingId: (buildingId: string | null) => void;
  setSelectedAgentId: (agentId: string | null) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  resetDraft: () => void;
}

export const useDesignStudioStore = create<DesignStudioStore>((set) => ({
  draft: EMPTY_VISUAL_DESIGN,
  category: "campus",
  selectedBuildingId: "hq",
  selectedAgentId: null,
  dirty: false,
  saving: false,
  setDraft: (draft) => set({ draft, dirty: false }),
  patchDraft: (patch) =>
    set((state) => ({
      draft: { ...state.draft, ...patch },
      dirty: true,
    })),
  setCategory: (category) => set({ category }),
  setSelectedBuildingId: (selectedBuildingId) => set({ selectedBuildingId }),
  setSelectedAgentId: (selectedAgentId) => set({ selectedAgentId }),
  setDirty: (dirty) => set({ dirty }),
  setSaving: (saving) => set({ saving }),
  resetDraft: () =>
    set({
      draft: EMPTY_VISUAL_DESIGN,
      dirty: false,
      saving: false,
    }),
}));