import { saveVisualDesign } from "../services/visualDesignClient";
import { useDesignStudioStore } from "../stores/designStudioStore";
import { useGameStore } from "../stores/gameStore";
import { confirmDialog } from "./nativeDialog";
import { patchOfficeVisual } from "./syncVisualDesign";
import { languageFromSettings, translate } from "../i18n";

export async function tryExitInterior(): Promise<void> {
  const state = useGameStore.getState();
  if (!state.buildDirty) {
    state.exitInterior();
    return;
  }

  const save = await confirmDialog("Save build changes before leaving the office?");
  if (save) {
    try {
      const saved = await saveVisualDesign(state.visualDesign);
      state.setVisualDesign(saved);
      useDesignStudioStore.getState().setDraft(saved);
      state.setBuildDirty(false);
      state.setStatusMessage(translate(languageFromSettings(state.settings), "status.officeSaved"));
    } catch (error) {
      state.setStatusMessage(String(error));
      return;
    }
  } else if (state.buildSnapshot && state.interiorBuildingId) {
    patchOfficeVisual(state.interiorBuildingId, state.buildSnapshot, { markBuildDirty: false });
    state.setBuildDirty(false);
  }

  state.exitInterior();
}