import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { pickDefaultPageId } from "../services/workspaceClient";
import { useGameStore } from "../stores/gameStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { clearLocalProgress, reportLocalProgress } from "../stores/progressStore";
import type { WorkspaceTree } from "../types/workspace";

export function useWorkspaceBootstrap(enabled: boolean) {
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const setTree = useWorkspaceStore((state) => state.setTree);
  const setIsLoading = useWorkspaceStore((state) => state.setIsLoading);

  useEffect(() => {
    if (!enabled || !activeCompanyId) {
      return;
    }

    const load = async () => {
      setIsLoading(true);
      reportLocalProgress("workspace_init", "Initializing workspace…", 20, "init");
      try {
        const tree = await invoke<WorkspaceTree>("init_workspace");
        const { selectedPageId, openPage } = useWorkspaceStore.getState();
        setTree(tree);
        if (!selectedPageId) {
          const defaultPageId = pickDefaultPageId(tree);
          if (defaultPageId) {
            await openPage(defaultPageId);
          }
        }
      } catch (error) {
        useWorkspaceStore.setState({ pageOpenError: String(error) });
      } finally {
        clearLocalProgress("workspace_init");
        setIsLoading(false);
      }
    };

    void load();
  }, [activeCompanyId, enabled, setIsLoading, setTree]);
}