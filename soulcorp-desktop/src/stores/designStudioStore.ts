import { create } from "zustand";
import { DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import type { CompanyVisualDesign, DesignCategory, FurnitureInstance, InteriorZone, OfficeVisualConfig } from "../types/visualDesign";
import { EMPTY_VISUAL_DESIGN } from "../types/visualDesign";
import { normalizeOfficeVisual } from "../utils/officeVisualNormalize";

const MAX_UNDO = 50;

function cloneDraft(draft: CompanyVisualDesign): CompanyVisualDesign {
  return structuredClone(draft);
}

interface DesignStudioStore {
  draft: CompanyVisualDesign;
  category: DesignCategory;
  selectedBuildingId: string | null;
  selectedAgentId: string | null;
  selectedFurnitureId: string | null;
  activeZone: InteriorZone;
  placeCatalogId: string | null;
  /** B4: perspective camera in design studio 3D viewport */
  studioPerspectiveCamera: boolean;
  dirty: boolean;
  saving: boolean;
  undoStack: CompanyVisualDesign[];
  redoStack: CompanyVisualDesign[];
  setDraft: (draft: CompanyVisualDesign) => void;
  patchDraft: (patch: Partial<CompanyVisualDesign>) => void;
  pushUndoSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  setCategory: (category: DesignCategory) => void;
  setSelectedBuildingId: (buildingId: string | null) => void;
  setSelectedAgentId: (agentId: string | null) => void;
  setSelectedFurnitureId: (furnitureId: string | null) => void;
  setActiveZone: (zone: InteriorZone) => void;
  setPlaceCatalogId: (catalogId: string | null) => void;
  setStudioPerspectiveCamera: (enabled: boolean) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  resetDraft: () => void;
  patchOfficeDraft: (buildingId: string, patch: Partial<OfficeVisualConfig>) => void;
  updateFurniture: (
    buildingId: string,
    updater: (items: FurnitureInstance[]) => FurnitureInstance[],
  ) => void;
}

export const useDesignStudioStore = create<DesignStudioStore>((set, get) => ({
  draft: EMPTY_VISUAL_DESIGN,
  category: "campus",
  selectedBuildingId: "hq",
  selectedAgentId: null,
  selectedFurnitureId: null,
  activeZone: "office",
  placeCatalogId: null,
  studioPerspectiveCamera: false,
  dirty: false,
  saving: false,
  undoStack: [],
  redoStack: [],
  setDraft: (draft) =>
    set({
      draft,
      dirty: false,
      undoStack: [],
      redoStack: [],
      selectedFurnitureId: null,
      placeCatalogId: null,
    }),
  patchDraft: (patch) =>
    set((state) => ({
      draft: { ...state.draft, ...patch },
      dirty: true,
    })),
  pushUndoSnapshot: () =>
    set((state) => ({
      undoStack: [...state.undoStack.slice(-(MAX_UNDO - 1)), cloneDraft(state.draft)],
      redoStack: [],
    })),
  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) {
      return;
    }
    const previous = state.undoStack[state.undoStack.length - 1];
    set({
      draft: previous,
      dirty: true,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [cloneDraft(state.draft), ...state.redoStack].slice(0, MAX_UNDO),
      selectedFurnitureId: null,
    });
  },
  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) {
      return;
    }
    const next = state.redoStack[0];
    set({
      draft: next,
      dirty: true,
      redoStack: state.redoStack.slice(1),
      undoStack: [...state.undoStack, cloneDraft(state.draft)].slice(-MAX_UNDO),
      selectedFurnitureId: null,
    });
  },
  setCategory: (category) => set({ category }),
  setSelectedBuildingId: (selectedBuildingId) =>
    set({ selectedBuildingId, selectedFurnitureId: null, placeCatalogId: null }),
  setSelectedAgentId: (selectedAgentId) => set({ selectedAgentId }),
  setSelectedFurnitureId: (selectedFurnitureId) => set({ selectedFurnitureId }),
  setActiveZone: (activeZone) => set({ activeZone }),
  setPlaceCatalogId: (placeCatalogId) =>
    set({ placeCatalogId, selectedFurnitureId: placeCatalogId ? null : get().selectedFurnitureId }),
  setStudioPerspectiveCamera: (studioPerspectiveCamera) => set({ studioPerspectiveCamera }),
  setDirty: (dirty) => set({ dirty }),
  setSaving: (saving) => set({ saving }),
  resetDraft: () =>
    set({
      draft: EMPTY_VISUAL_DESIGN,
      dirty: false,
      saving: false,
      undoStack: [],
      redoStack: [],
      selectedFurnitureId: null,
      placeCatalogId: null,
    }),
  patchOfficeDraft: (buildingId, patch) => {
    get().pushUndoSnapshot();
    const state = get();
    const config = normalizeOfficeVisual(
      state.draft.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL,
      buildingId,
    );
    set({
      draft: {
        ...state.draft,
        offices: {
          ...state.draft.offices,
          [buildingId]: { ...config, ...patch },
        },
      },
      dirty: true,
    });
  },
  updateFurniture: (buildingId, updater) => {
    get().pushUndoSnapshot();
    const state = get();
    const config = normalizeOfficeVisual(
      state.draft.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL,
      buildingId,
    );
    set({
      draft: {
        ...state.draft,
        offices: {
          ...state.draft.offices,
          [buildingId]: { ...config, furniture: updater(config.furniture) },
        },
      },
      dirty: true,
    });
  },
}));