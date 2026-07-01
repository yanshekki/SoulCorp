import { useCallback, useEffect } from "react";
import { getCatalogEntry } from "../data/furnitureCatalog";
import { useDesignStudioStore } from "../stores/designStudioStore";
import { useGameStore } from "../stores/gameStore";
import { DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import { normalizeOfficeVisual } from "../utils/officeVisualNormalize";
import { rotateInstance } from "../utils/placementEngine";

const PLACEMENT_BLOCKED = "呢度冇位 — 每件傢俬都要有自己嘅面積，唔可以疊住";

interface OfficeBuildActionsOptions {
  keyboard?: boolean;
}

export function useOfficeBuildActions(
  buildingId: string,
  options: OfficeBuildActionsOptions = {},
) {
  const draft = useDesignStudioStore((state) => state.draft);
  const selectedFurnitureId = useDesignStudioStore((state) => state.selectedFurnitureId);
  const setSelectedFurnitureId = useDesignStudioStore((state) => state.setSelectedFurnitureId);
  const updateFurniture = useDesignStudioStore((state) => state.updateFurniture);
  const undo = useDesignStudioStore((state) => state.undo);
  const redo = useDesignStudioStore((state) => state.redo);
  const undoStack = useDesignStudioStore((state) => state.undoStack);
  const redoStack = useDesignStudioStore((state) => state.redoStack);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  const config = normalizeOfficeVisual(
    draft.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL,
    buildingId,
  );

  const deleteSelected = useCallback(() => {
    if (!selectedFurnitureId) {
      return;
    }
    updateFurniture(buildingId, (items) => items.filter((item) => item.id !== selectedFurnitureId));
    setSelectedFurnitureId(null);
  }, [buildingId, selectedFurnitureId, setSelectedFurnitureId, updateFurniture]);

  const rotateSelected = useCallback(() => {
    if (!selectedFurnitureId) {
      return;
    }
    const target = config.furniture.find((item) => item.id === selectedFurnitureId);
    if (!target) {
      return;
    }
    const result = rotateInstance(target, config);
    if (!result.ok || !result.item) {
      setStatusMessage(PLACEMENT_BLOCKED);
      return;
    }
    updateFurniture(buildingId, (items) =>
      items.map((item) => (item.id === result.item!.id ? result.item! : item)),
    );
    setStatusMessage("");
  }, [buildingId, config, selectedFurnitureId, setStatusMessage, updateFurniture]);

  useEffect(() => {
    if (!options.keyboard) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }
      if (event.key === "r" || event.key === "R") {
        rotateSelected();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, options.keyboard, redo, rotateSelected, undo]);

  const selectedEntry = selectedFurnitureId
    ? getCatalogEntry(
        config.furniture.find((item) => item.id === selectedFurnitureId)?.catalog_id ?? "",
      )
    : null;

  return {
    config,
    selectedFurnitureId,
    selectedEntry,
    deleteSelected,
    rotateSelected,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    canEditSelection: Boolean(selectedFurnitureId),
  };
}