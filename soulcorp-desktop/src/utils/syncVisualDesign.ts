import { useDesignStudioStore } from "../stores/designStudioStore";
import { useGameStore } from "../stores/gameStore";
import type { CompanyVisualDesign, OfficeVisualConfig } from "../types/visualDesign";
import { normalizeOfficeVisual } from "./officeVisualNormalize";

/** Patch office config in gameStore and keep design studio draft in sync. */
export function patchOfficeVisual(
  buildingId: string,
  patch: Partial<OfficeVisualConfig>,
  options?: { markBuildDirty?: boolean },
): void {
  const game = useGameStore.getState();
  const current = normalizeOfficeVisual(game.visualDesign.offices[buildingId], buildingId);
  const nextOffice = normalizeOfficeVisual({ ...current, ...patch }, buildingId);
  const nextDesign: CompanyVisualDesign = {
    ...game.visualDesign,
    offices: {
      ...game.visualDesign.offices,
      [buildingId]: nextOffice,
    },
  };
  game.setVisualDesign(nextDesign);
  if (options?.markBuildDirty !== false && game.buildMode === "build") {
    game.setBuildDirty(true);
  }

  const studio = useDesignStudioStore.getState();
  if (studio.draft) {
    studio.patchDraft({
      offices: {
        ...studio.draft.offices,
        [buildingId]: nextOffice,
      },
    });
  }
}

export function patchVisualDesign(patch: Partial<CompanyVisualDesign>): void {
  const game = useGameStore.getState();
  const next: CompanyVisualDesign = { ...game.visualDesign, ...patch };
  game.setVisualDesign(next);
  const studio = useDesignStudioStore.getState();
  if (studio.draft) {
    studio.patchDraft(patch);
  }
}