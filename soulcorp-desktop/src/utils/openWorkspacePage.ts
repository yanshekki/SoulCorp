import { useGameStore } from "../stores/gameStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

export async function openWorkspacePage(pageId: string, label?: string): Promise<void> {
  try {
    await useWorkspaceStore.getState().openPage(pageId);
    useGameStore.getState().setActivePanel("workspace");
    useGameStore.getState().setStatusMessage(
      label ? `Opened ${label} in Workspace.` : "Opened page in Workspace.",
    );
  } catch (error) {
    useGameStore.getState().setStatusMessage(String(error));
  }
}